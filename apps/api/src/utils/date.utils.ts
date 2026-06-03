/**
 * Returns a string in 'YYYY-MM' format for partitioning purposes.
 * @param date The Date object
 */
export function formatYearMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
