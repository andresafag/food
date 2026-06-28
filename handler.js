const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// Inicializa el handler de Serverless Express
let serverlessExpressInstance;

async function setup(event, context) {
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

module.exports.handler = (event, context) => {
  if (serverlessExpressInstance) return serverlessExpressInstance(event, context);
  return setup(event, context);
};