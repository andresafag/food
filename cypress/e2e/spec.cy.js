describe('Batería de Pruebas E2E - Plataforma Food', () => {

  beforeEach(() => {
    cy.visit('/');
  });

  it('Debería mostrar correctamente la estructura de navegación de la App', () => {
    cy.get('nav').should('be.visible');
    
    cy.get('nav').within(() => {
      cy.contains('Home').should('exist');
      cy.contains('Menu search').should('exist');
      cy.contains('Meal plan').should('exist');
      cy.contains('Random recipe').should('exist');
      cy.contains('Wine pairing').should('exist');
    });
  });

  it('Debería permitir al usuario buscar platillos en el Menu Search', () => {
    cy.contains('Menu search').click();
    
    cy.url().should('include', '/menu'); 

    cy.get('input[type="text"]').first()
      .should('be.visible')
      .type('pasta{enter}'); 

    // Verify that the results are displayed 
    cy.get('.recipe-card, .result-item, h3').should('have.length.at.least', 1);
  });

  it('Debería manejar correctamente las respuestas de páginas no encontradas (404)', () => {
    cy.visit('/ruta-completamente-invalida', { failOnStatusCode: false });

    // Check if 404 error page is displayed
    cy.request({
      url: '/ruta-completamente-invalida',
      failOnStatusCode: false
    }).its('status').should('eq', 404);
  });

  it('Debería cargar los recursos críticos de la página en menos de 3 segundos', () => {
    // Validate that the main page loads within 3 seconds and returns the correct content type
    cy.request('/').then((response) => {
      expect(response.duration).to.be.lessThan(3000); // El tiempo debe ser menor a 3000ms
      expect(response.headers['content-type']).to.include('text/html');
    });
  });
});
