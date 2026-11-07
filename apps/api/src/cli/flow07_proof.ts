// Flow 07 runtime proof: a scripted MCP client against a running local API (MCP_ENABLED=true).
// It does what a real connector does — discovery, dynamic registration, PKCE S256, sign-in,
// consent, token, then the MCP tools over Streamable HTTP — and writes a redacted transcript.
// Dev only: refuses anything but a localhost PUBLIC_BASE_URL.
// Usage: tsx apps/api/src/cli/flow07_proof.ts <out-dir> [email] [password]
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.PROOF_BASE_URL ?? 'http://localhost:8080';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('Local API only.');
const [
  outDir = 'evidence/flows/Flow_07/runtime',
  email = 'owner@dialed.test',
  password = 'dialed-dev-password',
] = process.argv.slice(2);
const REDIRECT = 'http://127.0.0.1:33418/callback'; // loopback (RFC 8252); never contacted

mkdirSync(outDir, { recursive: true });
type Step = { step: string; ok: boolean; detail: unknown };
const steps: Step[] = [];
const redact = (s: string) =>
  s
    .replace(/(name="csrf_token" value=")[^"]+/g, '$1«redacted»')
    .replace(
      /(access_token|refresh_token|code|csrf_token)("?\s*[:=]\s*"?)[A-Za-z0-9._~-]{12,}/g,
      '$1$2«redacted»',
    );
const record = (step: string, ok: boolean, detail: unknown) => {
  steps.push({ step, ok, detail: JSON.parse(redact(JSON.stringify(detail ?? null))) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}`);
  if (!ok) throw new Error(`${step} failed: ${JSON.stringify(detail).slice(0, 400)}`);
};
const csrfOf = (html: string) => html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? '';
const post = (url: string, body: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

async function main() {
  // 1. Discovery (what the client does after the first 401)
  const unauth = await fetch(`${BASE}/mcp`, { method: 'POST' });
  record('401 points at protected-resource metadata', unauth.status === 401, {
    status: unauth.status,
    'www-authenticate': unauth.headers.get('www-authenticate'),
  });
  const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource`)).json();
  const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
  record('discovery', asm.code_challenge_methods_supported?.join() === 'S256', { prm, asm });

  // 2. Dynamic client registration
  const reg = await fetch(asm.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Proof Inspector', redirect_uris: [REDIRECT] }),
  });
  const client = await reg.json();
  record('register (RFC 7591)', reg.status === 201, client);

  // 3. Authorize: sign in, consent, code
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'proof-state',
    scope: 'schedule:read plans:draft',
  });
  const signinPage = await fetch(`${asm.authorization_endpoint}?${q}`);
  const signinHtml = await signinPage.text();
  writeFileSync(join(outDir, 'oauth-signin.html'), redact(signinHtml));
  record('sign-in page', signinPage.status === 200, { bytes: signinHtml.length });

  const wrong = await post(asm.authorization_endpoint, {
    csrf_token: csrfOf(signinHtml),
    email,
    password: 'not-the-password',
    action: 'signin',
  });
  const wrongHtml = await wrong.text();
  writeFileSync(join(outDir, 'oauth-signin-error.html'), redact(wrongHtml));
  record('sign-in error inline', /Wrong email or password/.test(wrongHtml), {
    status: wrong.status,
  });

  const signin = await post(asm.authorization_endpoint, {
    csrf_token: csrfOf(wrongHtml),
    email,
    password,
    action: 'signin',
  });
  const consentHtml = await signin.text();
  writeFileSync(join(outDir, 'oauth-consent.html'), redact(consentHtml));
  record(
    'consent page names client + redirect host',
    /Proof Inspector/.test(consentHtml) && /127\.0\.0\.1:33418/.test(consentHtml),
    {
      bytes: consentHtml.length,
    },
  );

  const allow = await post(asm.authorization_endpoint, {
    csrf_token: csrfOf(consentHtml),
    action: 'allow',
  });
  const loc = new URL(allow.headers.get('location') ?? 'http://x/');
  const code = loc.searchParams.get('code') ?? '';
  record(
    'allow → 302 to registered redirect with code + state',
    allow.status === 302 &&
      loc.origin + loc.pathname === REDIRECT &&
      loc.searchParams.get('state') === 'proof-state' &&
      !!code,
    {
      status: allow.status,
      location: `${loc.origin}${loc.pathname}?code=«redacted»&state=${loc.searchParams.get('state')}`,
    },
  );

  // 4. Token
  const tokRes = await post(asm.token_endpoint, {
    grant_type: 'authorization_code',
    client_id: client.client_id,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  });
  const tok = await tokRes.json();
  record('token (PKCE S256)', tokRes.status === 200 && tok.expires_in === 3600, {
    token_type: tok.token_type,
    expires_in: tok.expires_in,
    scope: tok.scope,
  });
  const replay = await post(asm.token_endpoint, {
    grant_type: 'authorization_code',
    client_id: client.client_id,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  });
  record('code replay refused', replay.status === 400, { status: replay.status });

  const v1 = await fetch(`${BASE}/v1/connector`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  record('MCP token refused by /v1 (audience)', v1.status === 401, { status: v1.status });

  // 5. MCP session with the SDK client
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${tok.access_token}` } },
  });
  const mcp = new Client({ name: 'flow07-proof', version: '1.0.0' });
  await mcp.connect(transport);
  const instructions = mcp.getInstructions();
  record('initialize (server instructions)', /Approve/.test(instructions ?? ''), { instructions });

  const tools = await mcp.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  record(
    'tools/list',
    names.join() === 'get_recent_plans,get_schedule,list_categories,list_terms,propose_changes',
    {
      tools: tools.tools.map((t) => ({
        name: t.name,
        readOnlyHint: t.annotations?.readOnlyHint ?? null,
      })),
    },
  );

  const resources = await mcp.listResources();
  const guide = await mcp.readResource({ uri: 'dialed://planning-guide' });
  const guideText = String((guide.contents[0] as { text?: string }).text ?? '');
  record('planning guide resource', guideText.length > 200, {
    resources: resources.resources.map((r) => r.uri),
    guide_head: guideText.slice(0, 300),
  });

  const text = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);
  const terms = text(await mcp.callTool({ name: 'list_terms', arguments: {} }));
  record('list_terms', terms.terms?.length > 0, terms);
  const cats = text(await mcp.callTool({ name: 'list_categories', arguments: {} }));
  record('list_categories', cats.categories?.length > 0, cats);
  const sched = text(
    await mcp.callTool({
      name: 'get_schedule',
      arguments: { from: '2037-10-19', to: '2037-10-25' },
    }),
  );
  record('get_schedule 7 days', sched.days?.length === 7, {
    days: sched.days.map((d: { date: string; blocks?: unknown[] }) => ({
      date: d.date,
      blocks: d.blocks?.length ?? 0,
    })),
    saturday: sched.days.find((d: { date: string }) => d.date === '2037-10-24'),
  });
  const recent = text(await mcp.callTool({ name: 'get_recent_plans', arguments: {} }));
  record('get_recent_plans', Array.isArray(recent.plans), { count: recent.plans.length });

  // 6. Drafts: invalid first (errors to the AI only), then a valid one
  const cat =
    cats.categories.find((c: { name: string }) => /study|project/i.test(c.name)) ??
    cats.categories[0];
  // A free hour on Saturday, from what get_schedule returned (what a real AI does).
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const clock = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const sat = (sched.days as { date: string; blocks: { start: string; end: string }[] }[]).find(
    (d) => d.date === '2037-10-24',
  )!;
  let slot = -1;
  for (let m = 9 * 60; m <= 20 * 60 && slot < 0; m += 30) {
    const clash = sat.blocks.some((b) => toMin(b.start) < m + 60 && m < toMin(b.end));
    if (!clash) slot = m;
  }
  if (slot < 0) throw new Error('No free hour on Saturday.');
  const change = {
    kind: 'new',
    title: 'Pitch prep',
    category_id: cat.id,
    on_date: '2037-10-24',
    start: clock(slot),
    end: clock(slot + 60),
    note: 'One hour to rehearse the pitch on Saturday.',
  };
  const bad = text(
    await mcp.callTool({
      name: 'propose_changes',
      arguments: {
        request_text: 'Pitch prep Saturday',
        changes: [{ ...change, start: '16:00', end: '15:00' }],
      },
    }),
  );
  record('propose_changes invalid → errors only', bad.status === 'invalid', bad);
  const good = text(
    await mcp.callTool({
      name: 'propose_changes',
      arguments: {
        request_text: 'Add an hour of pitch prep on Saturday afternoon',
        changes: [change],
      },
    }),
  );
  record('propose_changes valid → ready', good.status === 'ready', good);
  await mcp.close();

  writeFileSync(
    join(outDir, 'mcp-transcript.json'),
    JSON.stringify(
      { base: BASE, client: 'Proof Inspector', at: new Date().toISOString(), steps },
      null,
      2,
    ),
  );
  writeFileSync(join(outDir, 'proposal.json'), JSON.stringify({ proposal_id: good.proposal_id }));
  console.log(`transcript: ${join(outDir, 'mcp-transcript.json')}`);
}

main().catch((e) => {
  writeFileSync(
    join(outDir, 'mcp-transcript.json'),
    JSON.stringify({ base: BASE, steps, error: String(e) }, null, 2),
  );
  console.error(String(e));
  process.exit(1);
});
