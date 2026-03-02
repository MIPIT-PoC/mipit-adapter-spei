export interface SpeiPaymentRequest {
  spei_tx_ref: string;
  monto: number;
  moneda: string;
  clabe_origen: string;
  clabe_destino: string;
  nombre_ordenante?: string;
  nombre_beneficiario?: string;
  concepto_pago?: string;
  referencia_numerica?: string;
  tipo_cuenta: string;
  origen: string;
  destino: string;
  trace?: string;
  tipo_cambio?: number;
}

export interface SpeiPaymentResponse {
  spei_tx_id: string;
  estatus: 'ACEPTADO' | 'RECHAZADO';
  monto: number;
  moneda: string;
  timestamp: string;
  codigo_error?: string;
  mensaje_error?: string;
}
