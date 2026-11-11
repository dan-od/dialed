// TRUST_PROXY_IP: an exact IP or a CIDR (nginx-proxy's Docker network, e.g. 172.16.0.0/12). Only a request whose
// socket address is inside it may set the client IP from CF-Connecting-IP / X-Forwarded-For.
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../src/config';
import { isTrustedProxy } from '../src/lib/proxy';
import { makeApp, type TestApp } from './helpers';

describe('isTrustedProxy', () => {
  it('matches an exact IP only', () => {
    expect(isTrustedProxy('172.18.0.5', '172.18.0.5')).toBe(true);
    expect(isTrustedProxy('172.18.0.6', '172.18.0.5')).toBe(false);
  });
  it('matches inside a CIDR, including IPv4-mapped IPv6 socket addresses', () => {
    expect(isTrustedProxy('172.18.0.5', '172.16.0.0/12')).toBe(true);
    expect(isTrustedProxy('::ffff:172.31.255.1', '172.16.0.0/12')).toBe(true);
    expect(isTrustedProxy('172.32.0.1', '172.16.0.0/12')).toBe(false);
    expect(isTrustedProxy('203.0.113.9', '172.16.0.0/12')).toBe(false);
  });
  it('trusts nothing when unset or the address is missing', () => {
    expect(isTrustedProxy('172.18.0.5', undefined)).toBe(false);
    expect(isTrustedProxy(undefined, '172.16.0.0/12')).toBe(false);
  });
});

describe('TRUST_PROXY_IP config', () => {
  const base = {
    DATABASE_URL: 'postgres://x@127.0.0.1/x',
    JWT_PRIVATE_KEY_FILE: '/dev/null',
    CODE_PEPPER: 'a'.repeat(64),
  };
  it('accepts an IP or a CIDR', () => {
    expect(loadConfig({ ...base, TRUST_PROXY_IP: '172.18.0.5' }).TRUST_PROXY_IP).toBe('172.18.0.5');
    expect(loadConfig({ ...base, TRUST_PROXY_IP: '172.16.0.0/12' }).TRUST_PROXY_IP).toBe(
      '172.16.0.0/12',
    );
  });
  it('refuses anything else', () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY_IP: 'nginx-proxy' })).toThrow(/TRUST_PROXY_IP/);
    expect(() => loadConfig({ ...base, TRUST_PROXY_IP: '172.16.0.0/40' })).toThrow(
      /TRUST_PROXY_IP/,
    );
  });
});

describe('client IP through the proxy', () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });
  const rand = () => Math.floor(Math.random() * 250) + 1;

  async function registeredIp(remoteAddress: string, cf: string) {
    const r = await t!.app.inject({
      method: 'POST',
      url: '/oauth/register',
      remoteAddress,
      headers: { 'cf-connecting-ip': cf, 'x-forwarded-for': cf },
      payload: { client_name: 'Proxy probe', redirect_uris: ['https://example.com/cb'] },
    });
    expect(r.statusCode).toBe(201);
    const { rows } = await t!.pool.query<{ ip: string }>(
      'select host(registration_ip) as ip from oauth_clients where id = $1',
      [r.json().client_id],
    );
    await t!.pool.query('delete from oauth_clients where id = $1', [r.json().client_id]);
    return rows[0]!.ip;
  }

  it('uses CF-Connecting-IP from an exact trusted IP', async () => {
    t = await makeApp({ MCP_ENABLED: true, TRUST_PROXY_IP: '172.18.0.5' });
    const cf = `198.51.100.${rand()}`;
    expect(await registeredIp('172.18.0.5', cf)).toBe(cf);
  });

  it('uses CF-Connecting-IP from inside a trusted CIDR', async () => {
    t = await makeApp({ MCP_ENABLED: true, TRUST_PROXY_IP: '172.16.0.0/12' });
    const cf = `198.51.100.${rand()}`;
    expect(await registeredIp(`172.20.${rand()}.${rand()}`, cf)).toBe(cf);
  });

  it('ignores forwarded headers from an untrusted source', async () => {
    t = await makeApp({ MCP_ENABLED: true, TRUST_PROXY_IP: '172.16.0.0/12' });
    const direct = `10.9.${rand()}.${rand()}`;
    expect(await registeredIp(direct, '198.51.100.1')).toBe(direct);
  });
});
