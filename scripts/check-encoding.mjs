import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'server/src', 'server/tests'];
const TEXT_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.json',
    '.css',
    '.html',
    '.md',
    '.yml',
    '.yaml',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const violations = [];

async function walk(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            await walk(fullPath);
            continue;
        }

        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        await checkFile(fullPath);
    }
}

async function checkFile(filePath) {
    const raw = await readFile(filePath);
    const relative = path.relative(ROOT, filePath).replaceAll('\\', '/');

    if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        violations.push(`${relative}: has UTF-8 BOM`);
    }

    try {
        const decoded = utf8Decoder.decode(raw);
        if (decoded.includes('\r')) {
            violations.push(`${relative}: contains CRLF/CR line endings (expected LF)`);
        }
    } catch {
        violations.push(`${relative}: not valid UTF-8`);
    }
}

async function main() {
    for (const target of TARGET_DIRS) {
        const abs = path.join(ROOT, target);
        await walk(abs);
    }

    if (violations.length > 0) {
        console.error('Encoding check failed:');
        for (const issue of violations) {
            console.error(`- ${issue}`);
        }
        process.exit(1);
    }

    console.log('Encoding check passed (UTF-8 without BOM, LF).');
}

main().catch((err) => {
    console.error('Encoding check crashed:', err);
    process.exit(1);
});
