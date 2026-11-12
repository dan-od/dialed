/**
 * A timestamp for API responses: ISO 8601 UTC. Never String(date): "Thu Nov 12 2026 07:03:00 GMT+0000 …" is
 * not parseable by Hermes and shows as "Invalid Date" in the app.
 */
export function iso(v: unknown): string {
  return (v instanceof Date ? v : new Date(String(v))).toISOString();
}

export const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
