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

  try {
    // Try to initialize OTel — if any error occurs, swallow it and continue.
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
  } catch (err) {
    console.warn('OTel initialization failed — continuing without metrics:', err && err.message ? err.message : err);
    meterProvider = null;
  }
}

// Ensure init errors don't crash module init
try {
  initOtel();
} catch (err) {
  console.warn('OTel init threw during module load — continuing without metrics:', err && err.message ? err.message : err);
}

// ---------------------------------------------------------------------------
// Metrics — define once, reuse across warm invocations
// ---------------------------------------------------------------------------
let meter;
let requestCounter;
let responseHistogram;
try {
  meter = metrics.getMeter('foodmania');
  requestCounter = meter.createCounter('foodmania_http_requests_total', {
    description: 'Total HTTP requests handled by the Lambda function',
  });

  responseHistogram = meter.createHistogram('foodmania_http_response_duration_ms', {
    description: 'HTTP response latency in milliseconds',
    unit: 'ms',
  });
} catch (err) {
  console.warn('Metrics creation failed — using no-op metrics:', err && err.message ? err.message : err);
  // Fallback no-op implementations so code can call add/record safely
  requestCounter = { add: () => {} };
  responseHistogram = { record: () => {} };
}

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
  
  // SOLUCIÓN AQUÍ: Extraer de forma segura adaptándose a HTTP API (v2) o REST API (v1)
  const httpMethod = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'UNKNOWN';
  const requestPath = event.path || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || '/';

  const labels = {
    method: httpMethod,
    path: requestPath,
    status: String(response.statusCode || 200),
  };

  requestCounter.add(1, labels);
  responseHistogram.record(durationMs, labels);

  if (meterProvider && typeof meterProvider.forceFlush === 'function') {
    try {
      await meterProvider.forceFlush();
    } catch (err) {
      console.error('OTel forceFlush error:', err);
    }
  }

  return response;
};
