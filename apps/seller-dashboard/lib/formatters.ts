/**
 * Data Formatters — apps/seller-dashboard/lib/formatters.ts
 *
 * Authority: seller_dashboard_screen_system.md §G.13 (Data Formatting Standards)
 *
 * Rules:
 * - NEVER format data ad-hoc in components — always use these functions
 * - Currency: Indian numbering system (lakh, crore) with ₹ symbol
 * - Relative time: Hinglish (min pehle, ghante pehle, etc.)
 * - Absolute date: Indian locale (D Mon YYYY, H:MM AM/PM)
 * - Quantity: pluralized per unit
 * - Phone/email masking: derived from order status
 */

/* ── CURRENCY ────────────────────────────────────────────────── */
/**
 * Format a number as Indian Rupee amount.
 * Authority: §G.13 CURRENCY
 * Examples: 148500 → "₹1,48,500" | 4800 → "₹4,800" | -4800 → "−₹4,800"
 */
const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatAmount(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '₹0';
  if (num < 0) return `−${INR_FORMATTER.format(Math.abs(num))}`;
  return INR_FORMATTER.format(num);
}

/* ── RELATIVE TIME (HINGLISH) ────────────────────────────────── */
/**
 * Returns Hinglish relative time string.
 * Authority: §G.13 RELATIVE TIME (Hinglish)
 * Examples: "abhi abhi" | "5 min pehle" | "2 ghante pehle" | "kal" | "12 Apr 2026"
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr  / 24);
  const diffWk  = Math.floor(diffDay / 7);

  if (diffSec < 60)  return 'abhi abhi';
  if (diffMin < 60)  return `${diffMin} min pehle`;
  if (diffHr  < 24)  return `${diffHr} ghante pehle`;
  if (diffDay === 1) return 'kal';
  if (diffDay < 7)   return `${diffDay} din pehle`;
  if (diffWk  < 4)   return `${diffWk} hafte pehle`;

  // 30+ days: absolute date
  return formatDate(d, { dateOnly: true });
}

/* ── ABSOLUTE DATE ───────────────────────────────────────────── */
/**
 * Format date as: "4 Jun 2026, 2:34 PM"
 * Authority: §G.13 ABSOLUTE DATE
 */
export function formatDate(
  date: Date | string | null | undefined,
  opts?: { dateOnly?: boolean },
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const day   = d.getDate();
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  const year  = d.getFullYear();

  if (opts?.dateOnly) return `${day} ${month} ${year}`;

  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).toUpperCase();

  return `${day} ${month} ${year}, ${time}`;
}

/* ── QUANTITY + UNIT ─────────────────────────────────────────── */
/**
 * Format quantity with unit.
 * Authority: §G.13 QUANTITY + UNIT
 * Examples: (85, 'pcs') → "85 pcs" | (1, 'kg') → "1 kg" | (0, 'pcs') → "0 pcs"
 * Rule: Never show "—" for zero stock. Always show 0.
 */
export function formatQuantity(qty: number, unit: string): string {
  // Pluralize for countable units only (not mass/volume units)
  const pluralizable = ['pcs', 'piece', 'item', 'unit', 'box', 'pack', 'carton', 'bottle', 'roll', 'sheet', 'set'];
  const shouldPluralize = pluralizable.includes(unit.toLowerCase()) && qty !== 1;
  const unitDisplay = shouldPluralize ? `${unit}s` : unit;
  return `${qty} ${unitDisplay}`;
}

/* ── COUNT DISPLAY ───────────────────────────────────────────── */
/**
 * Format badge/chip count. Shows "99+" for large numbers.
 * Authority: §G.13 COUNT DISPLAY
 * Rule: 0 → hide badge (return empty string)
 */
export function formatBadgeCount(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

/* ── PHONE MASKING ───────────────────────────────────────────── */
/**
 * Mask buyer phone based on order status.
 * Authority: §G.13 PHONE MASKING (buyer privacy)
 */
export type OrderStatusForMask =
  | 'PLACED' | 'CONFIRMED' | 'PROCESSING'
  | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | string;

export function maskPhone(phone: string, orderStatus: OrderStatusForMask): string {
  if (!phone) return '';
  const statusesWithFullVisible = ['DELIVERED', 'COMPLETED'];
  const statusesWithPartialVisible = ['CONFIRMED', 'PROCESSING', 'SHIPPED'];

  if (statusesWithFullVisible.includes(orderStatus)) return phone;
  if (statusesWithPartialVisible.includes(orderStatus)) {
    // Last 4 digits visible
    return phone.replace(/(\+91\s?)(\d{5})(\d{5})/, '+91 98XXX $3');
  }
  // PLACED or unknown: fully masked
  return '+91 ***** *****';
}

/* ── EMAIL MASKING ───────────────────────────────────────────── */
/**
 * Mask buyer email.
 * Authority: §G.13 EMAIL MASKING
 * Example: "rahul@gmail.com" → "r****@gmail.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '****@****.com';
  const [local, domain] = email.split('@');
  const masked = local.charAt(0) + '****';
  return `${masked}@${domain}`;
}

/* ── ORDER ID DISPLAY ────────────────────────────────────────── */
/**
 * Format order ID for display.
 * Example: "VN-20260604-12345" stays as-is, short IDs get truncated display.
 */
export function formatOrderId(id: string): string {
  if (!id) return '';
  if (id.startsWith('VN-')) return `#${id}`;
  // UUID fallback
  return `#${id.slice(0, 8).toUpperCase()}`;
}
