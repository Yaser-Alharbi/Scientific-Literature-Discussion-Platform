// Lint ratchet: fails on any lint finding that is not already recorded in lint-baseline.json.
// Usage: node scripts/lint-baseline.mjs [--update]
// --update rewrites the baseline, but only to lower it; it refuses to raise any per-rule total.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'lint-baseline.json');
const update = process.argv.includes('--update');

function runLint() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-'));
  const out = path.join(dir, 'report.json');
  try {
    const nextBin = createRequire(path.join(root, 'package.json')).resolve('next/dist/bin/next');
    // Inline eslint-disable comments are ignored so they cannot hide a finding.
    // next lint exits non-zero while baseline errors exist, so only the report matters.
    spawnSync(process.execPath, [nextBin, 'lint', '--no-inline-config', '-f', 'json', '-o', out], {
      cwd: root,
      stdio: 'ignore',
    });
    if (!existsSync(out)) throw new Error('next lint produced no report');
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// { "src/a.ts": { "rule-id": count } }, with paths relative to frontend/ and '/' separators
function collect(report) {
  const found = {};
  const fatal = [];
  for (const file of report) {
    const rel = path.relative(root, file.filePath).split(path.sep).join('/');
    for (const message of file.messages) {
      if (!message.ruleId) {
        fatal.push(`${rel}:${message.line}: ${message.message}`);
        continue;
      }
      found[rel] ??= {};
      found[rel][message.ruleId] = (found[rel][message.ruleId] ?? 0) + 1;
    }
  }
  return { found, fatal };
}

function ruleTotals(counts) {
  const totals = {};
  for (const rules of Object.values(counts)) {
    for (const [rule, n] of Object.entries(rules)) totals[rule] = (totals[rule] ?? 0) + n;
  }
  return totals;
}

function sortedCopy(counts) {
  const sorted = {};
  for (const file of Object.keys(counts).sort()) {
    sorted[file] = Object.fromEntries(Object.entries(counts[file]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return sorted;
}

let report;
try {
  report = runLint();
} catch (error) {
  console.error(`lint failed to run: ${error.message}`);
  process.exit(1);
}

const { found, fatal } = collect(report);
if (fatal.length) {
  console.error('Lint reported errors without a rule (parse errors); these cannot be baselined:');
  for (const line of fatal) console.error(`  ${line}`);
  process.exit(1);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

if (update) {
  if (baseline) {
    const before = ruleTotals(baseline);
    const raised = Object.entries(ruleTotals(found)).filter(([rule, n]) => n > (before[rule] ?? 0));
    if (raised.length) {
      console.error('Refusing to update: the baseline may only go down. Raised: ' +
        raised.map(([rule, n]) => `${rule} ${before[rule] ?? 0} -> ${n}`).join(', '));
      process.exit(1);
    }
  }
  writeFileSync(baselinePath, JSON.stringify(sortedCopy(found), null, 2) + '\n');
  const totals = ruleTotals(found);
  console.log(`Baseline written: ${Object.values(totals).reduce((a, b) => a + b, 0)} findings`);
  process.exit(0);
}

if (!baseline) {
  console.error('lint-baseline.json is missing; run `node scripts/lint-baseline.mjs --update`');
  process.exit(1);
}

const regressions = [];
const improvements = [];
for (const file of new Set([...Object.keys(found), ...Object.keys(baseline)])) {
  for (const rule of new Set([...Object.keys(found[file] ?? {}), ...Object.keys(baseline[file] ?? {})])) {
    const now = found[file]?.[rule] ?? 0;
    const was = baseline[file]?.[rule] ?? 0;
    if (now > was) regressions.push(`${file}  ${rule}  ${was} -> ${now}`);
    else if (now < was) improvements.push(`${file}  ${rule}  ${was} -> ${now}`);
  }
}

if (improvements.length) {
  console.log('Improved since the baseline (run with --update to lock it in):');
  for (const line of improvements) console.log(`  ${line}`);
}
if (regressions.length) {
  console.error('New lint findings beyond the baseline:');
  for (const line of regressions) console.error(`  ${line}`);
  process.exit(1);
}
console.log('Lint matches the baseline: no new findings.');
