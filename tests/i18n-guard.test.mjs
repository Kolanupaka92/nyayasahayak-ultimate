// Guard against the "hard-coded translated label" bug class:
// in app.js, every Hindi/Telugu string literal must be an argument of the
// L(en, hi, te) helper. A standalone non-Latin label (like the Helpline
// 'Police / పోలీస్' bug) would show the wrong language and is caught here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '..', 'js', 'app.js'), 'utf8');
const hasHindi = /[ऀ-ॿ]/;   // Devanagari
const hasTelugu = /[ఀ-౿]/;  // Telugu

// A translated string is "safe" if it is an argument to the L(en, hi, te)
// helper, OR part of a complete trilingual structure (contains BOTH Hindi
// and Telugu on the line — e.g. a data tuple / lang-keyed object). The
// Helpline bug had a lone Telugu label with neither — that is what we catch.
test('no unbalanced Hindi/Telugu text outside an L(...) call in app.js', () => {
  const offenders = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*')) return; // skip comments
    const hi = hasHindi.test(line), te = hasTelugu.test(line);
    if (!hi && !te) return;
    const safe = line.includes('L(') || (hi && te);
    if (!safe) offenders.push(`line ${i + 1}: ${line.slice(0, 90)}`);
  });
  assert.deepEqual(offenders, [], 'Found translated text not wrapped in L():\n' + offenders.join('\n'));
});
