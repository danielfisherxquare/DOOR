import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const chineseName = '中奥致远赛事管理系统';
const legacyBrand = ['D', 'O', 'O', 'R'].join('');
const legacyMixedBrandTokens = [
  ['Door', 'Snapshot'].join(''),
  ['door', 'To', 'Pascal', 'Adapter'].join(''),
];

const ignoredDirs = new Set([
  '.git',
  '.git_disabled',
  '.runtime',
  'dist',
  'node_modules',
  'output',
  'test-baselines',
]);

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.webmanifest',
  '.xml',
  '.yml',
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function walk(currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(currentDir, entry.name), files);
      }
      continue;
    }

    files.push(path.join(currentDir, entry.name));
  }
  return files;
}

test('release metadata identifies the first branded beta', () => {
  const packageJson = readJson('package.json');
  const lockJson = readJson('package-lock.json');
  const manifest = readJson('public/manifest.webmanifest');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loginSource = fs.readFileSync(path.join(root, 'src/views/Login.jsx'), 'utf8');

  assert.equal(packageJson.version, '0.1.0');
  assert.equal(lockJson.version, '0.1.0');
  assert.equal(lockJson.packages[''].version, '0.1.0');
  assert.match(indexHtml, new RegExp(chineseName));
  assert.equal(manifest.name, chineseName);
  assert.equal(manifest.short_name, '中奥致远');
  assert.match(manifest.description, new RegExp(chineseName));
  assert.match(loginSource, new RegExp(chineseName));
  assert.match(loginSource, /赛事运营管理平台/);
});

test('legacy uppercase brand token is not present in maintained project text', () => {
  const violations = [];

  for (const absoluteFile of walk(root)) {
    const relativeFile = path.relative(root, absoluteFile);
    if (relativeFile.includes(legacyBrand)) {
      violations.push(`${relativeFile}: filename`);
    }
    for (const token of legacyMixedBrandTokens) {
      if (relativeFile.includes(token)) {
        violations.push(`${relativeFile}: filename contains ${token}`);
      }
    }

    if (!textExtensions.has(path.extname(absoluteFile))) {
      continue;
    }

    const content = fs.readFileSync(absoluteFile, 'utf8');
    const lineNumber = content.split(/\r?\n/).findIndex((line) => line.includes(legacyBrand));
    if (lineNumber !== -1) {
      violations.push(`${relativeFile}:${lineNumber + 1}`);
    }
    for (const token of legacyMixedBrandTokens) {
      const tokenLineNumber = content.split(/\r?\n/).findIndex((line) => line.includes(token));
      if (tokenLineNumber !== -1) {
        violations.push(`${relativeFile}:${tokenLineNumber + 1} contains ${token}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
