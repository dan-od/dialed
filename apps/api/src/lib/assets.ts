import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MARKER = join('mcp', 'planning-guide.md');

/**
 * The folder that holds mcp/ and backend/ (the repo root in dev and tests, /app in the image). Walks up from the
 * module's folder because the same code runs from src/, from apps/api/dist and from /app/dist. Throws instead of
 * falling back: every AI must get the real planning guide (AGENTS.md product truth 6).
 */
export function findAssetRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, MARKER))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`${MARKER} not found above ${start}`);
}

let cached: string | undefined;
export function assetRoot(): string {
  cached ??= findAssetRoot(import.meta.dirname);
  return cached;
}
