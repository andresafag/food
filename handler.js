'use strict';

const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { metrics } = require('@opentelemetry/api');
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// ---------------------------------------------------------------------------
// OTel SDK — initialized once per cold start, reused on warm containers
// ---------------------------------------------------------------------------
let meterProvider;
function initOtel() {
  if (meterProvider) return;

  const endpoint = `${process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}/v1/metrics`;

  console.log('Initializing OpenTelemetry');
  console.log('OTLP endpoint:', endpoint);
  console.log('OTLP protocol:', process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL);

  const exporter = new OTLPMetricExporter({
    url: endpoint,
  });

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 5000,
    exportTimeoutMillis: 3000,
  });

  meterProvider = new MeterProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME || 'foodmania-api',
    }),
    readers: [reader],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  console.log('OTel MeterProvider initialized');
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

  return response;
};
