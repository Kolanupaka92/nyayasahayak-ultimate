// Data-integrity + i18n-completeness tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATES_UTS, RED_FLAGS_DB, I18N } from '../js/districts-data.js';
import { GLOSSARY, LIMITATION, INCOME_CEILINGS, ELIG_CATEGORIES } from '../js/legal-data.js';

const LANGS = ['en', 'hi', 'te'];

test('all States/UTs have required fields', () => {
  for (const [code, st] of Object.entries(STATES_UTS)) {
    assert.ok(st.name, `${code} name`);
    assert.ok(st.hc, `${code} high court`);
    assert.ok(Array.isArray(st.districts) && st.districts.length, `${code} districts`);
    assert.ok(Array.isArray(st.langs) && st.langs.length, `${code} langs`);
  }
  assert.ok(Object.keys(STATES_UTS).length >= 36, '28 states + 8 UTs');
});

test('every nav i18n key is present in en/hi/te', () => {
  for (const [key, v] of Object.entries(I18N)) {
    for (const l of LANGS) assert.ok(v[l], `I18N.${key}.${l} missing`);
  }
});

test('all 15 red flags are trilingual', () => {
  assert.equal(RED_FLAGS_DB.length, 15);
  for (const rf of RED_FLAGS_DB) {
    for (const field of ['title', 'desc', 'action']) {
      for (const l of LANGS) assert.ok(rf[field][l], `flag ${rf.id} ${field}.${l}`);
    }
  }
});

test('glossary terms have trilingual definitions', () => {
  assert.ok(GLOSSARY.length >= 20);
  for (const g of GLOSSARY) {
    assert.ok(g.term, 'term');
    for (const l of LANGS) assert.ok(g.def[l], `${g.term} def.${l}`);
  }
});

test('limitation rules are well-formed', () => {
  for (const [k, r] of Object.entries(LIMITATION)) {
    for (const l of LANGS) assert.ok(r.trigger[l], `${k} trigger.${l}`);
    assert.ok(Array.isArray(r.steps) && r.steps.length, `${k} steps`);
    for (const s of r.steps) {
      for (const l of LANGS) assert.ok(s[l], `${k} step.${l}`);
      assert.ok(s.offset === null || typeof s.offset === 'number', `${k} offset type`);
    }
  }
});

test('income ceilings are sane', () => {
  assert.equal(typeof INCOME_CEILINGS._DEFAULT, 'number');
  assert.equal(INCOME_CEILINGS._SUPREME_COURT, 500000);
  for (const [k, v] of Object.entries(INCOME_CEILINGS)) assert.ok(v > 0, `${k} > 0`);
});

test('eligibility categories are trilingual', () => {
  assert.ok(ELIG_CATEGORIES.length >= 8);
  for (const c of ELIG_CATEGORIES) {
    assert.ok(c.id);
    for (const l of LANGS) assert.ok(c[l], `${c.id}.${l}`);
  }
});
