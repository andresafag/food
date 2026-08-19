const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    supportFile: false,
    setupNodeEvents(on, config) {
      on('before:run', (details) => {
        console.log('Iniciando batería de pruebas en el sistema operativo:', details.system.osName);
      });

      // Modificar la configuración según una variable de entorno de Node
      const version = process.env.TEST_ENV || 'local';
      
      if (version === 'staging') {
        config.baseUrl = 'https://itse8cfhej.execute-api.us-east-1.amazonaws.com';
      } else if (version === 'production') {
        config.baseUrl = 'https://itse8cfhej.execute-api.us-east-1.amazonaws.com';
      }

      return config;
    },
  },
});
