const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    supportFile: false,
    baseUrl: 'https://yoclydyq6h.execute-api.us-east-1.amazonaws.com/', // Fallback global si no hay variable
    setupNodeEvents(on, config) {
      on('before:run', (details) => {
        console.log('Iniciando batería de pruebas en el sistema operativo:', details.system.osName);
      });

      const version = process.env.TEST_ENV || 'local';
      
      if (version === 'staging') {
        config.baseUrl = 'https://yoclydyq6h.execute-api.us-east-1.amazonaws.com/';
      } else if (version === 'production') {
        config.baseUrl = 'https://yoclydyq6h.execute-api.us-east-1.amazonaws.com/';
      } else {
        // Asigna explícitamente la URL cuando sea 'local'
        config.baseUrl = 'https://yoclydyq6h.execute-api.us-east-1.amazonaws.com/'; 
      }

      return config;
    },
  },
});