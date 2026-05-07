#!/usr/bin/env node
// Walk the workspace and detect which CodeQL languages should be scanned.
// Writes `language=<csv>` to $GITHUB_OUTPUT.
//
// Output uses codeql-action v3 language IDs:
//   python, javascript-typescript, go, java-kotlin, c-cpp, csharp, ruby, swift

import fs from 'node:fs';
import path from 'node:path';

const EXT_TO_LANG = {
  '.py':    'python',
  '.js':    'javascript-typescript',
  '.jsx':   'javascript-typescript',
  '.mjs':   'javascript-typescript',
  '.cjs':   'javascript-typescript',
  '.ts':    'javascript-typescript',
  '.tsx':   'javascript-typescript',
  '.go':    'go',
  '.java':  'java-kotlin',
  '.kt':    'java-kotlin',
  '.kts':   'java-kotlin',
  '.c':     'c-cpp',
  '.cc':    'c-cpp',
  '.cpp':   'c-cpp',
  '.cxx':   'c-cpp',
  '.h':     'c-cpp',
  '.hh':    'c-cpp',
  '.hpp':   'c-cpp',
  '.cs':    'csharp',
  '.rb':    'ruby',
  '.swift': 'swift',
};

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'out',
  'target', 'bin', 'obj', '.venv', 'venv', '__pycache__',
  '.gradle', '.idea', '.vscode', '.next', '.nuxt', '.cache',
  'coverage', '.tox', '.mypy_cache', '.pytest_cache',
]);

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const counts = {};

function walk(dir, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), depth + 1);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      const lang = EXT_TO_LANG[ext];
      if (lang) counts[lang] = (counts[lang] || 0) + 1;
    }
  }
}

walk(root);

const detected = Object.entries(counts)
  .filter(([, n]) => n >= 5)
  .sort((a, b) => b[1] - a[1])
  .map(([lang]) => lang);

if (detected.length === 0) {
  console.error('No supported languages detected in workspace.');
  console.error('File counts:', JSON.stringify(counts));
  process.exit(1);
}

console.log('Detected languages:');
for (const [lang, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  const mark = detected.includes(lang) ? '✓' : ' ';
  console.log(`  ${mark} ${lang.padEnd(24)} ${n} file(s)`);
}

const out = process.env.GITHUB_OUTPUT;
if (out) {
  fs.appendFileSync(out, `language=${detected.join(',')}\n`);
  fs.appendFileSync(out, `languages-json=${JSON.stringify(detected)}\n`);
}
console.log(`\nlanguage=${detected.join(',')}`);
