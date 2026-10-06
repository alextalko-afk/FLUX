/**
 * Parses a numeric value coming from a raw `@Query('name')` parameter.
 *
 * Nest does NOT transform raw primitive query parameters (e.g.
 * `@Query('limit') limit: number`) — the value arrives as `string | undefined`.
 * Naively doing `limit ?? 20` therefore leaves a string in place and breaks
 * downstream code (Prisma expects an `Int`). This helper performs a safe,
 * bounded conversion and always returns a finite integer.
 *
 * @param value raw query value (string, array of strings or undefined)
 * @param fallback value returned when the input is missing/invalid
 * @param max upper bound applied to the parsed value
 */
export function parsePositiveInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
}
