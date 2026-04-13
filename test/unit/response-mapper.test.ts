import { speiResponseToAck } from '../../src/spei/response-mapper';

describe('speiResponseToAck', () => {
  it('should map LIQUIDADA response to ACCEPTED ack', () => {
    const response: any = {
      claveRastreo: 'SPEI-TX-001',
      estatus: 'LIQUIDADA',
      monto: 1500.00,
      fechaOperacion: '20260101',
    };

    const ack = speiResponseToAck(response);

    expect(ack.rail_tx_id).toBe('SPEI-TX-001');
    expect(ack.status).toBe('ACCEPTED');
    expect(ack.error).toBeUndefined();
  });

  it('should map RECHAZADA response to REJECTED ack with error', () => {
    const response: any = {
      claveRastreo: 'SPEI-TX-002',
      estatus: 'RECHAZADA',
      monto: 1000.00,
      fechaOperacion: '20260101',
      codigoError: 'R04',
      descripcionError: 'CLABE destino inválida',
    };

    const ack = speiResponseToAck(response);

    expect(ack.status).toBe('REJECTED');
    expect(ack.error).toEqual({
      code: 'R04',
      message: 'CLABE destino inválida',
    });
  });

  it('should use default error message when descripcionError is missing', () => {
    const response: any = {
      claveRastreo: 'SPEI-TX-003',
      estatus: 'RECHAZADA',
      monto: 100.00,
      fechaOperacion: '20260101',
      codigoError: 'R01',
    };

    const ack = speiResponseToAck(response);

    expect(ack.status).toBe('REJECTED');
    expect(ack.error?.code).toBe('R01');
    expect(ack.error?.message).toBeDefined();
  });

  it('should map DEVUELTA response to REJECTED ack', () => {
    const response: any = {
      claveRastreo: 'SPEI-TX-004',
      estatus: 'DEVUELTA',
      monto: 500.00,
      fechaOperacion: '20260101',
      descripcionError: 'Fondos insuficientes',
    };

    const ack = speiResponseToAck(response);

    expect(ack.status).toBe('REJECTED');
    expect(ack.error?.code).toBe('SPEI_DEVUELTA');
  });

  it('should map unknown status to ERROR', () => {
    const response: any = {
      claveRastreo: 'SPEI-TX-005',
      estatus: 'EN_PROCESO',
      monto: 750.00,
      fechaOperacion: '20260101',
    };

    const ack = speiResponseToAck(response);

    expect(ack.status).toBe('ERROR');
  });

  it('should include rail_tx_id from claveRastreo', () => {
    const response: any = {
      claveRastreo: 'MIPIT20260101000000000000006',
      estatus: 'LIQUIDADA',
      monto: 2000.00,
      fechaOperacion: '20260101',
    };

    const ack = speiResponseToAck(response);

    expect(ack.rail_tx_id).toBe('MIPIT20260101000000000000006');
  });

  it('should handle CECOBAN error codes correctly', () => {
    const testCases = [
      { codigoError: 'R01', expectedCode: 'R01' },
      { codigoError: 'R04', expectedCode: 'R04' },
    ];

    testCases.forEach(({ codigoError, expectedCode }) => {
      const response: any = {
        claveRastreo: `MIPIT2026010100000000${codigoError}`,
        estatus: 'RECHAZADA',
        monto: 500.00,
        fechaOperacion: '20260101',
        codigoError,
        descripcionError: 'Test error',
      };

      const ack = speiResponseToAck(response);

      expect(ack.status).toBe('REJECTED');
      expect(ack.error?.code).toBe(expectedCode);
    });
  });
});
