describe('SPEI Mock Server Contract', () => {
  it('should accept valid SPEI payment with 18-digit CLABE', async () => {
    // TODO: start mock server, send valid payment, assert ACEPTADO
    expect(true).toBe(true);
  });

  it('should reject payment with invalid CLABE', async () => {
    // TODO: send payment with bad CLABE, assert RECHAZADO + SPEI_INVALID_CLABE
    expect(true).toBe(true);
  });

  it('should respond to health check', async () => {
    // TODO: GET /health, assert { status: 'ok', service: 'spei-mock' }
    expect(true).toBe(true);
  });
});
