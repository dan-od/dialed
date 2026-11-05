-- Flow 07: MCP OAuth enhancements — refresh rotation families, client metadata, rate counters.
BEGIN;

ALTER TABLE oauth_tokens
  ADD COLUMN family_id uuid;

CREATE INDEX oauth_tokens_family_idx ON oauth_tokens(family_id) WHERE family_id IS NOT NULL;

ALTER TABLE oauth_clients
  ADD COLUMN scope text NOT NULL DEFAULT 'schedule:read plans:draft',
  ADD COLUMN registration_ip inet;

-- Per-client per-user daily draft counter (plans:draft scope, 20/day limit).
ALTER TABLE usage_counters
  ADD COLUMN mcp_drafts int NOT NULL DEFAULT 0;

COMMIT;
