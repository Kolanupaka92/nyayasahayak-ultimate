// Phase 1a marketplace/router tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeByBudget, findLawyers, verifiedCount, VERIFIED_LAWYERS } from '../js/lawyer-directory.js';
import { LOWCOST_CHANNELS } from '../js/legal-data.js';

const LANGS = ['en', 'hi', 'te'];

test('budget routes to the right track', () => {
  assert.equal(routeByBudget(0), 'freeaid');
  assert.equal(routeByBudget(''), 'freeaid');
  assert.equal(routeByBudget(4999), 'lowcost');
  assert.equal(routeByBudget(5000), 'private_simple');
  assert.equal(routeByBudget(24999), 'private_simple');
  assert.equal(routeByBudget(25000), 'private_full');
  assert.equal(routeByBudget(500000), 'private_full');
});

test('directory is empty and never fabricated in Phase 1a', () => {
  assert.equal(VERIFIED_LAWYERS.length, 0, 'no placeholder lawyers may be shipped');
  assert.deepEqual(findLawyers({ state: 'TS', caseType: 'cheque' }), []);
  assert.equal(verifiedCount('Hyderabad'), 0);
});

test('low-cost channels are complete & trilingual', () => {
  assert.ok(LOWCOST_CHANNELS.length >= 4);
  for (const c of LOWCOST_CHANNELS) {
    assert.ok(c.id && c.icon);
    for (const f of ['name', 'cost', 'desc', 'how'])
      for (const l of LANGS) assert.ok(c[f][l], `${c.id} ${f}.${l}`);
  }
});
