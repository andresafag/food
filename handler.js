'use strict';

const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { metrics } = require('@opentelemetry/api');
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// ---------------------------------------------------------------------------
// OTel SDK — initialized once per cold start, reused on warm containers
// ---------------------------------------------------------------------------
let meterProvider;

function initOtel() {
  if (meterProvider) return; // already initialized

  const exporter = new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  });

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '5000', 10),
    exportTimeoutMillis: parseInt(process.env.OTEL_METRIC_EXPORT_TIMEOUT || '3000', 10),
  });

  meterProvider = new MeterProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'foodmania-api',
    }),
    readers: [reader],
  });

  // Register as global so any future instrumentation can use metrics.getMeter()
  metrics.setGlobalMeterProvider(meterProvider);
  console.log('OTel MeterProvider initialized, exporting to:', process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT);
}

initOtel();

// ---------------------------------------------------------------------------
// Metrics — define once, reuse across warm invocations
// ---------------------------------------------------------------------------
const meter = metrics.getMeter('foodmania');

const requestCounter = meter.createCounter('foodmania_http_requests_total', {
  description: 'Total HTTP requests handled by the Lambda function',
});

const responseHistogram = meter.createHistogram('foodmania_http_response_duration_ms', {
  description: 'HTTP response latency in milliseconds',
  unit: 'ms',
});

// ---------------------------------------------------------------------------
// Serverless Express adapter — reused across warm invocations
// ---------------------------------------------------------------------------
let serverlessExpressInstance;

module.exports.handler = async (event, context) => {
  const startTime = Date.now();

  if (!serverlessExpressInstance) {
    serverlessExpressInstance = serverlessExpress({ app });
  }

  let response;
  try {
    response = await serverlessExpressInstance(event, context);
  } catch (err) {
    console.error('Express handler error:', err);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  const labels = {
    method: event.httpMethod || 'UNKNOWN',
    path: event.path || '/',
    status: String(response.statusCode || 200),
  };

  requestCounter.add(1, labels);
  responseHistogram.record(durationMs, labels);

  // Force-flush before returning — critical for Lambda.
  // The runtime freezes the process the moment this async function resolves,
  // so periodic exports will never fire unless we push explicitly here.
  try {
    await meterProvider.forceFlush();
  } catch (err) {
    console.error('OTel forceFlush error:', err);
    // Do not rethrow — a flush failure must not fail the HTTP response
  }

  return response;
};
