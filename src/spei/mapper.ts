/**
 * @file mapper.ts
 * @description Maps canonical pacs.008 PaymentMessage to SPEI/CECOBAN payload (claveRastreo, cuentaBeneficiario, monto, institución codes, tipoPago derived from ctgyPurp).
 * @author Carlos
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */
import type { SpeiCecobanRequest } from './types.js';
import { SPEI_BANXICO_CODES, generateSpeiClaveRastreo, generateSpeiReferencia, clabeToInstitutionCode } from './types.js';
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
  /** W6.3 — ISO 20022 ExternalCategoryPurpose1Code (CASH/SALA/TAXS/...). */
  ctgyPurp?: string;
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
  // P05 — Prefer canonical.fx.local_amount (set by normalizer post-FX); falls
  // back to amount * rate for legacy callers; SPEI is MXN, 2 decimals.
  const localAmount =
    (canonical.fx as { local_amount?: number } | undefined)?.local_amount
    ?? canonical.amount.value * (canonical.fx?.rate ?? 1);
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

  // P03 — Banxico institution code (5 digits). If the canonical supplies a
  // 3-digit value (CLABE bank prefix), upgrade via the Banxico catalog.
  // If it supplies 5 digits already, trust it. Otherwise derive from CLABE.
  const upgradeIfShort = (code?: string): string | undefined => {
    if (!code) return undefined;
    if (/^\d{5}$/.test(code)) return code;
    if (/^\d{3}$/.test(code)) return clabeToInstitutionCode(code.padEnd(18, '0')); // treat as prefix
    return undefined;
  };
  const institucionContraparte =
    upgradeIfShort(canonical.destination.institutionCode) ?? clabeToInstitutionCode(clabeDestino);
  if (!institucionContraparte || !/^\d{5}$/.test(institucionContraparte)) {
    throw new Error(
      `SPEI mapper: cannot resolve 5-digit Banxico institution code for CLABE ${clabeDestino.slice(0, 3)}...`,
    );
  }
  const institucionOperante =
    upgradeIfShort(canonical.origin.institutionCode) ?? SPEI_BANXICO_CODES.MIPIT_SIM;

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

  // W6.3 — derive Banxico `tipoPago` from canonical.ctgyPurp (ISO 20022
  // ExternalCategoryPurpose1Code). Defaults to 1 (tercero-a-tercero) when
  // the canonical did not carry one upstream.
  const tipoPago = ctgyPurpToTipoPago(canonical.ctgyPurp);

  const request: SpeiCecobanRequest = {
    claveRastreo,
    empresa: 'MIPIT',
    fechaOperacion,
    folioOrigen,
    institucionContraparte,
    institucionOperante,
    monto,
    iva: 0.00,
    tipoPago,
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

/**
 * W6.3 — Map ISO 20022 `ExternalCategoryPurpose1Code` → Banxico SPEI
 * `tipoPago`. Catálogo Banxico SPEI Manual de Operaciones cap. 4.
 *
 *   CASH → 1  (tercero-a-tercero, mismo banco / cross-bank P2P) — default
 *   INTC → 4  (B2B mismo banco / inter-company)
 *   SALA → 5  (nómina)
 *   TAXS → 14 (pago de impuesto federal)
 *   SUPP → 7  (proveedores)
 *   DVPM → 16 (tarjeta débito)
 *   TRAD → 17 (otra factura de servicios)
 *
 * Falls back to 1 for unmapped / missing codes, matching the previous
 * hardcoded behaviour while restoring semantic info when the canonical
 * carries it.
 */
function ctgyPurpToTipoPago(ctgyPurp: string | undefined): number {
  const map: Record<string, number> = {
    CASH: 1,
    INTC: 4,
    SALA: 5,
    SUPP: 7,
    TAXS: 14,
    DVPM: 16,
    TRAD: 17,
  };
  return (ctgyPurp && map[ctgyPurp]) ? map[ctgyPurp] : 1;
}
