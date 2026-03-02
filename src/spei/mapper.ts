import type { SpeiPaymentRequest } from './types.js';

interface CanonicalPacs008 {
  payment_id: string;
  amount: { value: number; currency: string };
  fx?: { source_currency?: string; rate?: number };
  debtor: { account_id: string; name?: string };
  creditor: { account_id: string; name?: string };
  alias: { type: string; value: string };
  purpose?: string;
  reference?: string;
  origin: { rail: string };
  destination: { rail?: string };
  trace_id?: string;
}

export function canonicalToSpeiPayload(canonical: CanonicalPacs008): SpeiPaymentRequest {
  const fxRate = canonical.fx?.rate ?? 1;
  const localAmount = canonical.amount.value * fxRate;

  return {
    spei_tx_ref: canonical.payment_id,
    monto: Math.round(localAmount * 100) / 100,
    moneda: 'MXN',
    clabe_origen: canonical.debtor.account_id.replace(/^SPEI-/, ''),
    clabe_destino: canonical.creditor.account_id.replace(/^SPEI-/, ''),
    nombre_ordenante: canonical.debtor.name,
    nombre_beneficiario: canonical.creditor.name,
    concepto_pago: canonical.purpose?.substring(0, 35),
    referencia_numerica: canonical.reference?.substring(0, 140),
    tipo_cuenta: 'CLABE',
    origen: canonical.origin.rail,
    destino: canonical.destination.rail ?? 'SPEI',
    trace: canonical.trace_id,
    tipo_cambio: canonical.fx?.rate,
  };
}
