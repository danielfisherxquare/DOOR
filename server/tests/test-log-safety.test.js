import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const testsRoot = path.dirname(currentFile);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  }));
  return nestedFiles.flat();
}

test('server tests never print credentials or decrypted PII', async () => {
  const files = (await listJavaScriptFiles(testsRoot)).filter((file) => file !== currentFile);
  const consoleSinkPattern = /\bconsole\.(?:log|info|debug|dir)\s*\(/;
  const interpolatedSensitiveValuePattern = /\$\{[^}]*(?:accessToken|refreshToken|token|password|apiKey|authorization|phone|idNumber|emergencyPhone)\b/i;
  const directSensitiveArgumentPattern = /(?:\(|,)\s*(?:[A-Za-z_$][\w$]*\.)*(?:accessToken|refreshToken|token|password|apiKey|authorization|phone|idNumber|emergencyPhone)\b/i;
  const violations = [];

  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const printsSensitiveValue = interpolatedSensitiveValuePattern.test(line)
        || directSensitiveArgumentPattern.test(line);
      if (consoleSinkPattern.test(line) && printsSensitiveValue) {
        violations.push(`${path.relative(testsRoot, file)}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(violations, []);
});
