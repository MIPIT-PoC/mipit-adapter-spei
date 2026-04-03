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
   * Payment type code:
   *   1 = Simple SPEI transfer
   *   2 = Internal transfer (same institution)
   *   3 = Payroll payment
   *   4 = Tax payment (SAT)
   */
  tipoPago: 1 | 2 | 3 | 4;

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

/** BANXICO institution codes (abbreviated list) */
export const SPEI_BANXICO_CODES = {
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
  MIPIT_SIM: '999', // Simulated institution for PoC
} as const;

/** Generates a valid SPEI clave de rastreo (up to 30 alphanumeric chars) */
export function generateSpeiClaveRastreo(prefix: string = 'MIPIT'): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = Math.floor(Math.random() * 99999999).toString().padStart(8, '0');
  return `${prefix}${date}${seq}`.substring(0, 30);
}

/** Generates a 7-digit SPEI numeric reference */
export function generateSpeiReferencia(): number {
  return Math.floor(Math.random() * 9999999);
}
