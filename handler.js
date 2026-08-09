const serverlessExpress = require('@vendia/serverless-express');
const { metrics } = require('@opentelemetry/api');
const app = require('./app');

// Inicializa el handler de Serverless Express
let serverlessExpressInstance;

async function setup(event, context) {
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

module.exports.handler = async (event, context) => {
  let response;

  if (serverlessExpressInstance) {
    response = await serverlessExpressInstance(event, context);
  } else {
    response = await setup(event, context);
  }

  // Fuerza el envío de métricas OTLP antes de entregar la respuesta a API Gateway
  try {
    const meterProvider = metrics.getMeterProvider();
    if (meterProvider && typeof meterProvider.forceFlush === 'function') {
      await meterProvider.forceFlush();
    }
  } catch (err) {
    console.error('Error haciendo flush de métricas OTel:', err);
  }

  return response;
};