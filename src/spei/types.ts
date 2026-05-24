/**
 * @file types.ts
 * @description SPEI/CECOBAN domain types (request/response, estatus, tipoCuenta), Banxico institution-code catalog, CLABE-to-institution mapping and helpers to generate claveRastreo and referenciaNumerica.
 * @author Miguel
 * @project MIPIT-PoC — Cross-border Instant Payments Middleware
 */

/**
 * SPEI (Sistema de Pagos Electrónicos Interbancarios) Types
 * Based on: BANXICO CECOBAN specification and SPEI+ API
 *
 * SPEI is operated by BANXICO (Banco de México).
 * clave_rastreo: unique tracking code, max 30 alphanumeric chars
 * CLABE: 18-digit standardized bank account (Clave Bancaria Estandarizada)
 */

/** SPEI payment statuses */
export type SpeiEstatus = 'LIQUIDADA' | 'DEVUELTA' | 'EN_PROCESO' | 'RECHAZADA';

/** Account type codes used in SPEI */
export type SpeiTipoCuenta =
  | 40   // CLABE 18-digit
  | 3    // Debit card (16-digit)
  | 10   // Phone-linked account
  | 99;  // Free format

/**
 * SPEI CECOBAN Payment Request
 * POST /spei/v3/transferencias
 *
 * This is the real CECOBAN-defined JSON request format used by PSPs
 * connected to the BANXICO SPEI network.
 */
export interface SpeiCecobanRequest {
  /** Unique tracking key for the transaction (max 30 alphanumeric chars) */
  claveRastreo: string;

  /** PSP/company identifier (max 6 chars, registered with BANXICO) */
  empresa: string;

  /** Operation date in YYYYMMDD format */
  fechaOperacion: string;

  /** Unique origin folio from the sending institution (max 19 chars) */
  folioOrigen: string;

  /**
   * BANXICO institution code of the receiving bank (3 digits).
   * Examples: 002=Banamex, 006=Banobras, 012=BBVA, 014=Santander,
   *           021=HSBC, 072=Banorte, 127=Azteca
   */
  institucionContraparte: string;

  /** BANXICO institution code of the originating bank (3 digits) */
  institucionOperante: string;

  /** Transfer amount with 2 decimal places */
  monto: number;

  /** VAT amount (0.00 for most interbank transfers) */
  iva: number;

  /**
   * Payment type code per Banxico SPEI Manual de Operaciones cap. 4
   * (catálogo 1..30; subset Wave 6 W6.3 cableado vía ctgyPurp):
   *   1  = Tercero a tercero (default — simple SPEI transfer)
   *   2  = Internal transfer (same institution)
   *   3  = Bank-to-bank
   *   4  = Inter-company (B2B same institution)
   *   5  = Nómina (payroll)
   *   7  = Pago de proveedores
   *   14 = Pago de impuesto federal (SAT)
   *   16 = Tarjeta débito
   *   17 = Servicios
   *   (additional codes per Banxico catalogue)
   * Widened to `number` so W6.3 can propagate ctgyPurp → tipoPago mappings.
   */
  tipoPago: number;

  /**
   * Account type of beneficiary:
   *   40 = CLABE 18-digit (most common)
   *   3  = Debit card (16-digit)
   *   10 = Phone number
   *   99 = Free format
   */
  tipoCuentaBeneficiario: SpeiTipoCuenta;

  /** Beneficiary name (max 39 chars) */
  nombreBeneficiario: string;

  /** Beneficiary CLABE (18 digits) when tipoCuentaBeneficiario = 40 */
  cuentaBeneficiario: string;

  /** Beneficiary RFC or CURP (optional, for tax traceability) */
  rfcCurpBeneficiario?: string;

  /** Beneficiary email for notification */
  emailBeneficiario?: string;

  /** Payment concept / description (max 39 chars) */
  conceptoPago: string;

  /** 7-digit numeric reference (0–9999999), for reconciliation */
  referenciaNumerica: number;

  /** Ordering party account type */
  tipoCuentaOrdenante?: SpeiTipoCuenta;

  /** Ordering party name (max 39 chars) */
  nombreOrdenante?: string;

  /** Ordering party CLABE (18 digits) */
  cuentaOrdenante?: string;

  /** Ordering party RFC or CURP */
  rfcCurpOrdenante?: string;

  /** Internal control numbering (used for reconciliation with CECOBAN) */
  numeracionControl?: string;
}

/**
 * SPEI CECOBAN Payment Response
 * Returned after transaction settlement
 */
export interface SpeiCecobanResponse {
  /** Same tracking key as request */
  claveRastreo: string;

  /** Transaction status */
  estatus: SpeiEstatus;

  /** Settled amount */
  monto: number;

  /** Operation date YYYYMMDD */
  fechaOperacion: string;

  /** Settlement time HH:mm:ss */
  horaLiquidacion?: string;

  /** CECOBAN control folio */
  folioControl?: string;

  /**
   * CECOBAN/SPEI error code (when estatus = RECHAZADA).
   * Common codes (CECOBAN / TEF SPEI):
   *   R01 - Fondos insuficientes
   *   R02 - Cuenta cerrada
   *   R03 - Sin cuenta / CLABE inexistente
   *   R04 - CLABE inválida
   *   R05 - No autorizado
   *   R08 - Pago suspendido
   *   R09 - Fondos no acreditados
   *   R12 - Sucursal vendida a otra institución
   *   LIM - Límite operativo diario alcanzado
   *   BLQ - Cuenta bloqueada
   *   CAN - Cancelado por el ordenante
   */
  codigoError?: string;

  /** Human-readable error description in Spanish */
  descripcionError?: string;

  /** VAT settled */
  iva?: number;
}

/**
 * P03 — CLABE bank prefixes (3 digits). NOT to be confused with Banxico SPEI
 * institution codes (5 digits — see SPEI_BANXICO_CODES below).
 */
export const CLABE_BANK_PREFIXES = {
  BANAMEX:   '002',
  BANOBRAS:  '006',
  BBVA:      '012',
  SANTANDER: '014',
  HSBC:      '021',
  BANORTE:   '072',
  INBURSA:   '036',
  SCOTIABANK:'044',
  AZTECA:    '127',
  BIENESTAR: '058',
  MIPIT_SIM: '999',
} as const;

/**
 * P03 — Banxico SPEI participant institution codes (5 digits).
 * Real Banxico catalog: 40xxx for banks, 90xxx for non-bank participants.
 * Source: https://www.banxico.org.mx/servicios/participantes-spei-banco-me.html
 */
export const SPEI_BANXICO_CODES = {
  BANAMEX:    '40002',
  BANOBRAS:   '37006', // Banca de desarrollo
  BBVA:       '40012',
  SANTANDER:  '40014',
  HSBC:       '40021',
  BANORTE:    '40072',
  INBURSA:    '40036',
  SCOTIABANK: '40044',
  AZTECA:     '40127',
  BIENESTAR:  '40058',
  STP:        '90646',
  // Simulated PSP for the PoC (90xxx range is non-bank participants)
  MIPIT_SIM:  '90999',
} as const;

/**
 * P03 — CLABE 3-digit prefix → Banxico 5-digit institution code map.
 * Many CLABE prefixes share an institution code with their parent bank.
 */
export const CLABE_TO_BANXICO: Record<string, string> = {
  '002': SPEI_BANXICO_CODES.BANAMEX,
  '006': SPEI_BANXICO_CODES.BANOBRAS,
  '012': SPEI_BANXICO_CODES.BBVA,
  '014': SPEI_BANXICO_CODES.SANTANDER,
  '021': SPEI_BANXICO_CODES.HSBC,
  '036': SPEI_BANXICO_CODES.INBURSA,
  '044': SPEI_BANXICO_CODES.SCOTIABANK,
  '058': SPEI_BANXICO_CODES.BIENESTAR,
  '072': SPEI_BANXICO_CODES.BANORTE,
  '127': SPEI_BANXICO_CODES.AZTECA,
  '646': SPEI_BANXICO_CODES.STP,
  '999': SPEI_BANXICO_CODES.MIPIT_SIM,
};

export function clabeToInstitutionCode(clabe: string): string | undefined {
  if (typeof clabe !== 'string' || clabe.length < 3) return undefined;
  return CLABE_TO_BANXICO[clabe.slice(0, 3)];
}

/**
 * P03 — Banxico tipoPago catalogue (subset of 31 official values).
 * Source: Banxico Catálogo de Tipos de Pago.
 */
export const SPEI_TIPO_PAGO = {
  TERCERO_A_TERCERO: 1,
  TERCERO_PROPIAS:   3,
  MISMO_BANCO:       4,
  NOMINA:            5,
  DEVOLUCION_NO_ACR: 8,
  COBRANZA:          11,
  DEVOLUCION_EXT:    12,
  PAGO_SERVICIOS:    13,
  PAGO_IMP_FED:      14,
  PAGO_IMP_EST:      15,
  TARJETA_DEBITO:    16,
  TARJETA_CREDITO:   17,
} as const;

/**
 * P03 — Generate `claveRastreo`. CECOBAN spec: 1–30 alphanumeric only
 * (no hyphens, no underscores). Uses CSPRNG for the random suffix.
 *
 * Format: PREFIX(5) + YYYYMMDD(8 — local Mexico City UTC-6) + 8 digits = 21 chars.
 */
import { randomBytes } from 'node:crypto';

export function generateSpeiClaveRastreo(prefix: string = 'MIPIT'): string {
  // Mexico City is UTC-6 (or -5 during DST; Banxico eliminated DST in 2022 → fixed UTC-6).
  const mxNow = new Date(Date.now() - 6 * 3600 * 1000);
  const yyyy = mxNow.getUTCFullYear();
  const mm = String(mxNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(mxNow.getUTCDate()).padStart(2, '0');
  const date = `${yyyy}${mm}${dd}`;
  // 8 random digits via CSPRNG
  const bytes = randomBytes(4);
  const num = (bytes.readUInt32BE(0) % 100_000_000).toString().padStart(8, '0');
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').slice(0, 5);
  return `${cleanPrefix}${date}${num}`.substring(0, 30);
}

/**
 * P03 — Generate a 7-digit numeric reference (1–9_999_999 range).
 * The previous impl could emit 0 which CECOBAN treats as sentinel/invalid.
 */
export function generateSpeiReferencia(): number {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 9_999_999;
  return num === 0 ? 1 : num; // ensure 1..9_999_999
}
