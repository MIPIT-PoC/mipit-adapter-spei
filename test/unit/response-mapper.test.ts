import { speiResponseToAck } from '../../src/spei/response-mapper';
import type { SpeiPaymentResponse } from '../../src/spei/types';

describe('speiResponseToAck', () => {
  it('should map ACEPTADO response to ACCEPTED ack', () => {
    const response: SpeiPaymentResponse = {
      spei_tx_id: 'SPEI-TX-001',
      estatus: 'ACEPTADO',
      monto: 17500,
      moneda: 'MXN',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const ack = speiResponseToAck(response);

    expect(ack.rail_tx_id).toBe('SPEI-TX-001');
    expect(ack.status).toBe('ACCEPTED');
    expect(ack.error).toBeUndefined();
  });

  it('should map RECHAZADO response to REJECTED ack with error', () => {
    const response: SpeiPaymentResponse = {
      spei_tx_id: 'SPEI-TX-002',
      estatus: 'RECHAZADO',
      monto: 1000,
      moneda: 'MXN',
      timestamp: '2026-01-01T00:00:00Z',
      codigo_error: 'SPEI_INVALID_CLABE',
      mensaje_error: 'CLABE destino inválida',
    };

    const ack = speiResponseToAck(response);

    expect(ack.status).toBe('REJECTED');
    expect(ack.error).toEqual({
      code: 'SPEI_INVALID_CLABE',
      message: 'CLABE destino inválida',
    });
  });
});
