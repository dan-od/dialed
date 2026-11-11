import { BlockList, isIP } from 'node:net';

/** Parses TRUST_PROXY_IP: one IPv4/IPv6 address or CIDR (e.g. 172.16.0.0/12 for Docker networks). */
export function parseProxySpec(
  spec: string,
): { address: string; prefix?: number; family: 4 | 6 } | null {
  const [address = '', prefixRaw, extra] = spec.trim().split('/');
  if (extra !== undefined) return null;
  const v = isIP(address);
  if (v === 0) return null;
  const family = v as 4 | 6;
  if (prefixRaw === undefined) return { address, family };
  if (!/^\d{1,3}$/.test(prefixRaw)) return null;
  const prefix = Number(prefixRaw);
  if (prefix > (family === 4 ? 32 : 128)) return null;
  return { address, prefix, family };
}

/** True when a socket address is the trusted proxy (exact IP) or inside the trusted CIDR. */
export function isTrustedProxy(remote: string | undefined, spec: string | undefined): boolean {
  if (!remote || !spec) return false;
  const p = parseProxySpec(spec);
  if (!p) return false;
  // Node reports IPv4 peers on dual-stack sockets as ::ffff:a.b.c.d.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(remote);
  const addr = mapped ? mapped[1]! : remote;
  const fam = isIP(addr);
  if (fam === 0) return false;
  const list = new BlockList();
  const type = p.family === 4 ? 'ipv4' : 'ipv6';
  if (p.prefix === undefined) list.addAddress(p.address, type);
  else list.addSubnet(p.address, p.prefix, type);
  return list.check(addr, fam === 4 ? 'ipv4' : 'ipv6');
}
