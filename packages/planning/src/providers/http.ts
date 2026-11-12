import { request as httpsRequest, type RequestOptions } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
  /^::ffff:(127|10|172\.(1[6-9]|2\d|3[01])|192\.168)\./i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

export interface SafeFetchOpts {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowPrivate?: boolean;
}

export interface SafeFetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export class SsrfError extends Error {
  constructor(reason: string) {
    super(`SSRF blocked: ${reason}`);
    this.name = 'SsrfError';
  }
}

export async function safeFetch(opts: SafeFetchOpts): Promise<SafeFetchResult> {
  const parsed = new URL(opts.url);

  if (parsed.protocol !== 'https:') {
    throw new SsrfError('only HTTPS is allowed');
  }

  const hostname = parsed.hostname;
  const resolvedIp = await resolveHost(hostname);

  if (!opts.allowPrivate && isPrivateIp(resolvedIp)) {
    throw new SsrfError(`private IP ${resolvedIp} for ${hostname}`);
  }

  const reqOpts: RequestOptions = {
    hostname: resolvedIp,
    port: parsed.port || 443,
    path: parsed.pathname + parsed.search,
    method: opts.method ?? 'POST',
    headers: {
      ...opts.headers,
      host: hostname,
    },
    timeout: opts.timeoutMs ?? 60_000,
    lookup: (_hostname, _opts, cb) => {
      cb(null, resolvedIp, resolvedIp.includes(':') ? 6 : 4);
    },
    servername: hostname,
  };

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }

    const req = httpsRequest(reqOpts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        req.destroy();
        reject(new SsrfError('redirects are not followed'));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v;
        }
        resolve({ status: res.statusCode!, headers, body });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('request timed out'));
    });

    if (opts.signal) {
      const onAbort = () => {
        req.destroy();
        reject(new Error('aborted'));
      };
      opts.signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => opts.signal!.removeEventListener('abort', onAbort));
    }

    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function resolveHost(hostname: string): Promise<string> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    return Promise.resolve(hostname);
  }
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      const addrs = addresses as LookupAddress[];
      if (!addrs.length) return reject(new Error(`DNS: no addresses for ${hostname}`));
      resolve(addrs[0]!.address);
    });
  });
}

export { isPrivateIp };
