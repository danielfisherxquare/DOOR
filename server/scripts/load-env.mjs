/**
 * Env preload script — loads .env file if it exists.
 * Compatible with Node.js 20+ (replaces --env-file-if-exists flag).
 * Usage: node --import ./scripts/load-env.mjs src/index.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}
