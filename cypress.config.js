const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('before:run', (details) => {
        console.log('Iniciando batería de pruebas en el sistema operativo:', details.system.osName);
      });

      // Modificar la configuración según una variable de entorno de Node
      const version = process.env.TEST_ENV || 'local';
      
      if (version === 'staging') {
        config.baseUrl = 'https://akn9xyam4d.execute-api.us-east-1.amazonaws.com/dev/';
      } else if (version === 'production') {
        config.baseUrl = 'https://akn9xyam4d.execute-api.us-east-1.amazonaws.com/dev/';
      }

      return config;
    },
  },
});
