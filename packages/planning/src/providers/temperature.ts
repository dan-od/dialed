import type { SafeFetchResult } from './http';

/** A 400 saying the model doesn't take a temperature (e.g. "`temperature` is deprecated for this model."). */
export function rejectsTemperature(res: SafeFetchResult): boolean {
  return (
    res.status === 400 &&
    /temperature/i.test(res.body) &&
    /deprecat|unsupport|not support|does not support|not allowed|not permitted/i.test(res.body)
  );
}

/**
 * Sends with the temperature; if the model rejects it, warns once, retries this call without it, and
 * remembers that for the provider's later calls (`state.dropTemperature`).
 */
export async function withTemperatureFallback(
  state: { dropTemperature: boolean },
  temperature: number | undefined,
  model: string,
  onWarning: ((message: string) => void) | undefined,
  send: (temperature: number | undefined) => Promise<SafeFetchResult>,
): Promise<SafeFetchResult> {
  const t = state.dropTemperature ? undefined : temperature;
  const res = await send(t);
  if (t === undefined || !rejectsTemperature(res)) return res;
  state.dropTemperature = true;
  (onWarning ?? console.warn)(
    `${model} rejected temperature ${t}; retrying without it and not sending it again`,
  );
  return send(undefined);
}
