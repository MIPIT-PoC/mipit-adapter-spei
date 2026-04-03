import type { SpeiCecobanRequest } from './types.js';
import { SPEI_BANXICO_CODES, generateSpeiClaveRastreo, generateSpeiReferencia } from './types.js';
import { validateClabeDetailed } from './clabe-validator.js';

interface CanonicalPacs008 {
  payment_id: string;
  amount: { value: number; currency: string };
  fx?: { source_currency?: string; rate?: number };
  debtor: {
    account_id: string;
    name?: string;
    taxId?: string;
    email?: string;
  };
  creditor: {
    account_id: string;
    name?: string;
    taxId?: string;
    email?: string;
  };
  alias: { type: string; value: string };
  purpose?: string;
  reference?: string;
  remittanceInfo?: string;
  origin: { rail: string; institutionCode?: string };
  destination: { rail?: string; institutionCode?: string };
  trace_id?: string;
}

/**
 * Maps the canonical pacs.008 model to a real SPEI CECOBAN request.
 * Validates CLABE format (18 digits + check digit), applies FX conversion,
 * and builds the full CECOBAN structure per BANXICO specification.
 */
export function canonicalToSpeiPayload(canonical: CanonicalPacs008): SpeiCecobanRequest {
  const fxRate = canonical.fx?.rate ?? 1;
  const localAmount = canonical.amount.value * fxRate;
  const monto = Math.round(localAmount * 100) / 100;

  // Strip SPEI- prefix to get raw CLABE
  const clabeDestino = (canonical.alias.value || canonical.creditor.account_id).replace(/^SPEI-/, '');
  const clabeOrigen = canonical.debtor.account_id.replace(/^SPEI-/, '');

  // Validate CLABE (check digit + format)
  const clabeError = validateClabeDetailed(clabeDestino);
  if (clabeError) {
    throw new Error(
      `SPEI mapper: invalid CLABE destino [${clabeError.code}]: ${clabeError.message}`,
    );
  }

  // Derive BANXICO institution codes from CLABE bank prefix (first 3 digits)
  const clabeBankCode = clabeDestino.substring(0, 3);
  const institucionContraparte = canonical.destination.institutionCode ?? clabeBankCode;
  const institucionOperante = canonical.origin.institutionCode ?? SPEI_BANXICO_CODES.MIPIT_SIM;

  // Payment concept (max 39 chars per CECOBAN spec)
  const concepto = (canonical.remittanceInfo ?? canonical.purpose ?? 'Transferencia MIPIT')
    .substring(0, 39);

  // Numeric reference (7-digit)
  const referencia = generateSpeiReferencia();

  // Tracking key (max 30 chars, alphanumeric)
  const claveRastreo = generateSpeiClaveRastreo('MIPIT');

  // Operation date (YYYYMMDD)
  const fechaOperacion = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Folio origen from payment_id
  const folioOrigen = canonical.payment_id.replace('PMT-', '').substring(0, 19);

  const request: SpeiCecobanRequest = {
    claveRastreo,
    empresa: 'MIPIT',
    fechaOperacion,
    folioOrigen,
    institucionContraparte,
    institucionOperante,
    monto,
    iva: 0.00,
    tipoPago: 1,
    tipoCuentaBeneficiario: 40,  // CLABE
    nombreBeneficiario: (canonical.creditor.name ?? 'Beneficiario MIPIT').substring(0, 39),
    cuentaBeneficiario: clabeDestino,
    conceptoPago: concepto,
    referenciaNumerica: referencia,
  };

  // Optional beneficiary fields
  if (canonical.creditor.email) {
    request.emailBeneficiario = canonical.creditor.email.substring(0, 100);
  }
  if (canonical.creditor.taxId) {
    request.rfcCurpBeneficiario = canonical.creditor.taxId.substring(0, 18);
  }

  // Optional ordering party fields
  if (canonical.debtor.name) {
    request.nombreOrdenante = canonical.debtor.name.substring(0, 39);
  }
  if (clabeOrigen && /^\d{18}$/.test(clabeOrigen)) {
    request.cuentaOrdenante = clabeOrigen;
    request.tipoCuentaOrdenante = 40;
  }
  if (canonical.debtor.taxId) {
    request.rfcCurpOrdenante = canonical.debtor.taxId.substring(0, 18);
  }

  return request;
}
