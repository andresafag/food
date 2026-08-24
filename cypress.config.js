const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    supportFile: false,
    baseUrl: 'https://38g95pk3ul.execute-api.us-east-1.amazonaws.com/',
    setupNodeEvents(on, config) {
      on('before:run', (details) => {
        console.log('Iniciando batería de pruebas en el sistema operativo:', details.system.osName);
      });

      return config;
    },
  },
});