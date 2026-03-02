import type { SpeiPaymentResponse } from './types.js';

interface RailAck {
  rail_tx_id?: string;
  status: 'ACCEPTED' | 'REJECTED' | 'ERROR';
  error?: { code: string; message: string };
  raw_response?: Record<string, unknown>;
}

export function speiResponseToAck(response: SpeiPaymentResponse): RailAck {
  return {
    rail_tx_id: response.spei_tx_id,
    status: response.estatus === 'ACEPTADO' ? 'ACCEPTED' : 'REJECTED',
    error: response.codigo_error
      ? { code: response.codigo_error, message: response.mensaje_error ?? 'Error SPEI desconocido' }
      : undefined,
    raw_response: response as unknown as Record<string, unknown>,
  };
}
