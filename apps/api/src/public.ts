import type { FastifyInstance } from 'fastify';
import type { Config } from './config';

/**
 * Free-account reset landing (BACKEND_SETUP §13): a tiny static page that forwards the URL fragment
 * (never sent to the server) to dialed://reset. Copy matches Flow 01 ("Open this link on your iPhone").
 */
const RESET_PAGE = (appName: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${appName} — new password</title>
<style>body{font:17px -apple-system,system-ui,sans-serif;background:#120906;color:#FFF1E8;margin:0;padding:48px 20px}
a{display:inline-block;margin-top:20px;background:#FF5A1F;color:#140A05;padding:16px 22px;border-radius:18px;font-weight:700;text-decoration:none}</style>
</head><body><h1>Open ${appName}</h1><p>Open this link on your iPhone to pick a new password.</p>
<a id="open" href="dialed://reset">Open ${appName}</a>
<script>var h=location.hash;if(/^#token=[A-Za-z0-9_-]{20,200}$/.test(h)){var u='dialed://reset'+h;document.getElementById('open').href=u;location.replace(u);}</script>
</body></html>`;

export function publicRoutes(app: FastifyInstance, config: Config) {
  app.get('/reset', async (_req, reply) =>
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      )
      .send(RESET_PAGE(config.APP_NAME)),
  );

  // MCP is built in Flow 07. Until then every caller is unauthenticated here: app tokens are never MCP tokens.
  app.all('/mcp', async (_req, reply) =>
    reply
      .code(401)
      .header(
        'www-authenticate',
        `Bearer resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
      )
      .send({
        error: {
          code: 'unauthorized',
          message: 'Connect this app to Dialed first.',
          retryable: false,
        },
      }),
  );
}
