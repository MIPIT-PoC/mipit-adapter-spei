import type { SpeiCecobanResponse } from './types.js';

export interface RailAck {
  rail_tx_id?: string;
  status: 'ACCEPTED' | 'REJECTED' | 'ERROR';
  error?: { code: string; message: string };
  raw_response?: Record<string, unknown>;
}

/**
 * Maps a SPEI CECOBAN response to the MIPIT internal RailAck format.
 * CECOBAN SPEI statuses:
 *   LIQUIDADA   → ACCEPTED (settled)
 *   RECHAZADA   → REJECTED (with CECOBAN error code)
 *   DEVUELTA    → REJECTED (returned)
 *   EN_PROCESO  → ERROR (timeout / pending)
 */
export function speiResponseToAck(response: SpeiCecobanResponse): RailAck {
  const railTxId = response.folioControl ?? response.claveRastreo;

  switch (response.estatus) {
    case 'LIQUIDADA':
      return {
        rail_tx_id: railTxId,
        status: 'ACCEPTED',
        raw_response: response as unknown as Record<string, unknown>,
      };

    case 'RECHAZADA':
      return {
        rail_tx_id: railTxId,
        status: 'REJECTED',
        error: {
          code: response.codigoError ?? 'SPEI_RECHAZADA',
          message: response.descripcionError ?? 'Transferencia rechazada por la red SPEI',
        },
        raw_response: response as unknown as Record<string, unknown>,
      };

    case 'DEVUELTA':
      return {
        rail_tx_id: railTxId,
        status: 'REJECTED',
        error: {
          code: 'SPEI_DEVUELTA',
          message: response.descripcionError ?? 'Transferencia devuelta por la institución receptora',
        },
        raw_response: response as unknown as Record<string, unknown>,
      };

    case 'EN_PROCESO':
      return {
        rail_tx_id: railTxId,
        status: 'ERROR',
        error: {
          code: 'SPEI_EN_PROCESO',
          message: 'Transferencia aún en proceso — timeout del adapter SPEI',
        },
        raw_response: response as unknown as Record<string, unknown>,
      };

    default:
      return {
        rail_tx_id: railTxId,
        status: 'ERROR',
        error: {
          code: 'SPEI_UNKNOWN_STATUS',
          message: `Estatus SPEI desconocido: ${response.estatus}`,
        },
        raw_response: response as unknown as Record<string, unknown>,
      };
  }
}
