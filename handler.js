'use strict';

const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { metrics } = require('@opentelemetry/api');
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// ---------------------------------------------------------------------------
// OTel SDK
// ---------------------------------------------------------------------------
let meterProvider;
function initOtel() {
  if (meterProvider) return;

  const endpoint = `${process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}/v1/metrics`;

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
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'foodmania',
    }),
    readers: [reader],
  });

  metrics.setGlobalMeterProvider(meterProvider);
  console.log('OTel MeterProvider initialized');
}

try {
  initOtel();
} catch (err) {
  console.warn('OTel init threw during module load — continuing without metrics:', err && err.message ? err.message : err);
}

// ---------------------------------------------------------------------------
// Metrics Definitions
// ---------------------------------------------------------------------------
let meter;
let requestCounter;
let warmupCounter;
let errorCounter;
let responseHistogram;

try {
  meter = metrics.getMeter('foodmania');
  
  requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests handled by the Lambda function',
  });

  warmupCounter = meter.createCounter('warmup_requests_total', {
    description: 'Total EventBridge warmup heartbeats handled by Lambda',
  });

  errorCounter = meter.createCounter('http_errors_total', {
    description: 'Total unhandled errors or 5xx responses in Lambda',
  });

  // FIX 1: Name changed to http_request_duration, unit set to 's'
  responseHistogram = meter.createHistogram('http_request_duration', {
    description: 'HTTP response latency in seconds',
    unit: 's',
  });
} catch (err) {
  console.warn('Metrics creation failed — using no-op metrics:', err && err.message ? err.message : err);
  requestCounter = { add: () => {} };
  warmupCounter = { add: () => {} };
  errorCounter = { add: () => {} };
  responseHistogram = { record: () => {} };
}

// ---------------------------------------------------------------------------
// Serverless Express adapter
// ---------------------------------------------------------------------------
let serverlessExpressInstance;

module.exports.handler = async (event, context) => {
  if (event.action === 'warmup' || event['detail-type'] === 'Scheduled Event') {
    console.log('Heartbeat de EventBridge recibido — manteniendo Lambda caliente.');
    
    warmupCounter.add(1, { job: 'foodmania', source: 'eventbridge' });
    requestCounter.add(1, { job: 'foodmania', method: 'WARMUP', path: '/warmup', status: '200' });
    
    if (meterProvider) {
      try {
        await meterProvider.forceFlush();
      } catch (flushErr) {
        console.warn('Error al hacer forceFlush en warmup:', flushErr.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Lambda warmed up and metrics flushed successfully' }),
    };
  }

  const startTime = Date.now();

  if (!serverlessExpressInstance) {
    serverlessExpressInstance = serverlessExpress({ app });
  }

  let response;
  try {
    response = await serverlessExpressInstance(event, context);
  } catch (err) {
    console.error('Express handler error:', err);
    errorCounter.add(1, { error_type: err.name || 'UnhandledException' });
    throw err;
  }

  const durationMs = Date.now() - startTime;
  const durationSeconds = durationMs / 1000;
  
  const httpMethod = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'UNKNOWN';
  const requestPath = event.path || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || '/';
  const statusCode = response ? (response.statusCode || 200) : 500;

  const labels = {
    service: process.env.OTEL_SERVICE_NAME || 'foodmania',
    method: httpMethod,
    path: requestPath,
    status: String(statusCode),
  };

  requestCounter.add(1, labels);
  responseHistogram.record(durationSeconds, labels);

  if (statusCode >= 400) {
    errorCounter.add(1, {
      job: process.env.OTEL_SERVICE_NAME || 'foodmania',
      method: httpMethod,
      path: requestPath,
      status: String(statusCode),
      error_type: statusCode >= 500 ? 'ServerError' : 'ClientError',
    });
  }

  return response;
};