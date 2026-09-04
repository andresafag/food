'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel, metrics } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// 1. Enable internal OTel diagnostics so export/network issues log directly to CloudWatch
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

let meterProvider;
function initOtel() {
  if (meterProvider) return;

  const endpoint = `${process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT}/v1/metrics`;

  const exporter = new OTLPMetricExporter({
    url: endpoint,
  });

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 2000,
    exportTimeoutMillis: 1500,
  });

  meterProvider = new MeterProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'foodmania-api',
      'service': process.env.OTEL_SERVICE_NAME || 'foodmania-api',
      'cloud.provider': 'aws',
      'cloud.region': process.env.AWS_REGION || 'us-east-1',
      'faas.name': process.env.AWS_LAMBDA_FUNCTION_NAME || 'express-pug-app-dev-api',
      'deployment.environment': process.env.NODE_ENV || 'dev',
    }),
    readers: [reader],
  });

  metrics.setGlobalMeterProvider(meterProvider);
  console.log(`OTel MeterProvider initialized with target endpoint: ${endpoint}`);
}

try {
  initOtel();
} catch (err) {
  console.warn('OTel initialization failed:', err?.message || err);
}

// ---------------------------------------------------------------------------
// Metrics Definitions
// ---------------------------------------------------------------------------
let meter;
let requestCounter;
let appStatusGauge; 
let errorCounter;
let responseHistogram;

try {
  meter = metrics.getMeter('foodmania');
  
  requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests handled by the Lambda function',
  });

  appStatusGauge = meter.createGauge('lambda_app_status', {
    description: 'Heartbeat availability indicator (1 = Alive / Active Container)',
  });

  errorCounter = meter.createCounter('http_errors_total', {
    description: 'Total classified exceptions and non-2xx failures',
  });

  responseHistogram = meter.createHistogram('http_request_duration', {
    description: 'HTTP request handling latency in seconds',
    unit: 's',
  });
} catch (err) {
  console.warn('Metrics generation fallback used:', err?.message || err);
  requestCounter = { add: () => {} };
  appStatusGauge = { record: () => {} };
  errorCounter = { add: () => {} };
  responseHistogram = { record: () => {} };
}

function sanitizeErrorMessage(err, statusCode) {
  if (!err) return statusCode >= 500 ? 'InternalServerError' : 'ClientError';
  const rawMsg = err.code || err.name || err.message || 'UnknownError';
  return rawMsg.replace(/\s+/g, '_').substring(0, 50); 
}

// Helper function to handle telemetry flushing cleanly before Lambda freeze
async function flushTelemetry() {
  if (!meterProvider) return;
  try {
    await meterProvider.forceFlush();
    console.log('[OTel] Telemetry flushed successfully before container freeze.');
  } catch (flushErr) {
    console.error('[OTel] Telemetry network delivery failure:', flushErr?.message || flushErr);
  }
}

// ---------------------------------------------------------------------------
// Main Handler Entry Point
// ---------------------------------------------------------------------------
let serverlessExpressInstance;

module.exports.handler = async (event, context) => {
  // Update heartbeat status gauge right away
  

  // Check if invocation originates from the Serverless Schedule component
  const isWarmup = event.action === 'warmup' || 
                   event['detail-type'] === 'Scheduled Event' || 
                   event.source === 'aws.events';

 if (isWarmup) {
  console.log('Serverless Framework CRON event executed. Synchronizing metrics...');

  const heartbeatLabels = {
    service: process.env.OTEL_SERVICE_NAME || 'foodmania-api',
    method: 'WARMUP',
    path: '/warmup',
    status: '200',
    cloud_provider: 'aws',
    cloud_region: process.env.AWS_REGION || 'us-east-1',
    faas_name:
      process.env.AWS_LAMBDA_FUNCTION_NAME || 'express-pug-app-dev-api',
  };

  appStatusGauge.record(1, heartbeatLabels);

  requestCounter.add(1, heartbeatLabels);

  await flushTelemetry();

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'warmed',
      timestamp: Date.now(),
    }),
  };
}

  const startTime = Date.now();

  if (!serverlessExpressInstance) {
    serverlessExpressInstance = serverlessExpress({ app });
  }

  let response;
  let caughtError = null;

  try {
    response = await serverlessExpressInstance(event, context);
  } catch (err) {
    console.error('Express framework runtime tracking capture:', err);
    caughtError = err;
  }

  const durationSeconds = (Date.now() - startTime) / 1000;
  const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
  const requestPath = event.path || event.requestContext?.http?.path || '/';
  
  let statusCode = response ? (response.statusCode || 200) : 500;
  if (caughtError && !response) {
    statusCode = caughtError.statusCode || 500;
  }

  const labels = {
    service: process.env.OTEL_SERVICE_NAME || 'foodmania-api',
    method: httpMethod,
    path: requestPath,
    status: String(statusCode),
    cloud_provider: 'aws',
    cloud_region: 'us-east-1',
    faas_name: process.env.AWS_LAMBDA_FUNCTION_NAME || 'express-pug-app-dev-api',
  };

  appStatusGauge.record(1, labels);
  requestCounter.add(1, labels);
  responseHistogram.record(durationSeconds, labels);

  if (statusCode >= 400 || caughtError) {
    const errorLabel = sanitizeErrorMessage(caughtError, statusCode);
    errorCounter.add(1, {
      method: httpMethod,
      path: requestPath,
      status: String(statusCode),
      error_message: errorLabel,
    });
  }

  await flushTelemetry();

  if (caughtError) {
    throw caughtError;
  }

  return response;
};