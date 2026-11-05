import type { Config } from '../config';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(config: Config, title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(config.APP_NAME)}</title>
<style>
:root{--bg:#fff;--fg:#111;--muted:#666;--border:#ddd;--accent:#111;--accent-fg:#fff;--error:#c00;--radius:10px}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--muted:#999;--border:#333;--accent:#eee;--accent-fg:#111;--error:#f66}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Anton',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{max-width:420px;width:100%;padding:32px 24px}
h1{font-size:1.25rem;font-weight:600;margin-bottom:8px}
p{font-size:0.9375rem;color:var(--muted);line-height:1.5;margin-bottom:20px}
label{display:block;font-size:0.8125rem;font-weight:500;margin-bottom:4px;color:var(--muted)}
input[type=email],input[type=password]{display:block;width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--fg);margin-bottom:12px;outline:none}
input:focus{border-color:var(--accent)}
.btn{display:block;width:100%;padding:12px;font-size:1rem;font-weight:600;border:none;border-radius:var(--radius);cursor:pointer;text-align:center;transition:opacity 120ms}
.btn:hover{opacity:0.85}
.btn-primary{background:var(--accent);color:var(--accent-fg)}
.btn-secondary{background:transparent;color:var(--muted);border:1px solid var(--border);margin-top:8px}
.error{color:var(--error);font-size:0.875rem;margin-bottom:12px}
.scope-list{list-style:none;margin-bottom:20px}
.scope-list li{padding:6px 0;font-size:0.9375rem;border-bottom:1px solid var(--border)}
.scope-list li:last-child{border-bottom:none}
.scope-list .check{color:#2a2;margin-right:6px}
.scope-list .cross{color:var(--muted);margin-right:6px}
.client-name{font-weight:600}
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

export function signinPage(config: Config, csrf: string, error?: string): string {
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  return layout(
    config,
    'Sign in',
    `<h1>Sign in to ${escapeHtml(config.APP_NAME)}</h1>
<p>An AI app wants to connect. Sign in to continue.</p>
${errorHtml}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}">
<input type="hidden" name="action" value="signin">
<label for="email">Email</label>
<input type="email" id="email" name="email" required autocomplete="email" autofocus>
<label for="password">Password</label>
<input type="password" id="password" name="password" required autocomplete="current-password">
<button type="submit" class="btn btn-primary">Sign in</button>
</form>`,
  );
}

export function consentPage(config: Config, csrf: string, clientId: string, scope: string): string {
  const scopes = scope.split(' ');
  const canRead = scopes.includes('schedule:read');
  const canDraft = scopes.includes('plans:draft');

  return layout(
    config,
    'Connect',
    `<h1><span class="client-name">${escapeHtml(clientId.replace(/^dialed_/, ''))}</span> wants to use ${escapeHtml(config.APP_NAME)}</h1>
<p>It can:</p>
<ul class="scope-list">
${canRead ? '<li><span class="check">&#10003;</span> See your schedule, categories, terms and recent plans</li>' : ''}
${canDraft ? '<li><span class="check">&#10003;</span> Send you plan drafts to approve</li>' : ''}
<li><span class="cross">&#10007;</span> Change your schedule, approve plans, or see your email</li>
</ul>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}">
<button type="submit" name="action" value="allow" class="btn btn-primary">Allow</button>
<button type="submit" name="action" value="cancel" class="btn btn-secondary">Cancel</button>
</form>`,
  );
}

export function donePage(config: Config): string {
  return layout(
    config,
    'Connected',
    `<h1>Connected</h1>
<p>You can close this window and go back to your AI app.</p>`,
  );
}
