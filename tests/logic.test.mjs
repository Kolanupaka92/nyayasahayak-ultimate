// Pure-logic tests (no browser). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNotice, detectLang, classifyCase, extractDates, extractAmounts, scoreUrgency } from '../js/ai-engine.js';
import { isValidCNR, lookupTargets, statusSummary } from '../js/ecourts-api.js';
import { encryptData, decryptData, unlockWithPin, lock } from '../js/encryption.js';
import { nearbyServices } from '../js/geolocation.js';

test('classifyCase covers the main categories', () => {
  assert.equal(classifyCase('cheque bounced under section 138'), 'Cheque Bounce');
  assert.equal(classifyCase('FIR for theft and arrest'), 'Criminal');
  assert.equal(classifyCase('divorce and maintenance'), 'Family');
  assert.equal(classifyCase('land eviction / mutation dispute'), 'Property');
  assert.equal(classifyCase('consumer product defect'), 'Consumer');
  assert.equal(classifyCase('some ordinary matter'), 'Civil/General');
});

test('detectLang recognises script', () => {
  assert.equal(detectLang('यह हिंदी है'), 'हिन्दी');
  assert.equal(detectLang('ఇది తెలుగు వచనం'), 'తెలుగు');
  assert.equal(detectLang('this is english'), 'English');
});

test('extractDates / extractAmounts', () => {
  assert.deepEqual(extractDates('due 01/06/2026 and 15-08-2026'), ['01/06/2026', '15-08-2026']);
  assert.deepEqual(extractAmounts('pay Rs. 50,000 or ₹1000'), ['Rs. 50,000', '₹1000']);
});

test('scoreUrgency flags time-sensitive language', () => {
  assert.equal(scoreUrgency('pay forthwith within 15 days'), 'high');
  assert.equal(scoreUrgency('please respond when convenient'), 'normal');
});

test('analyzeNotice gives explanation in the chosen UI language', () => {
  const en = analyzeNotice('Section 138 cheque dishonoured, pay within 15 days', 'en');
  assert.equal(en.category, 'Cheque Bounce');
  assert.equal(en.urgency, 'high');
  assert.match(en.explanation, /Section 138/);

  const te = analyzeNotice('Section 138 cheque dishonoured, pay within 15 days', 'te');
  assert.match(te.explanation, /[ఀ-౿]/, 'Telugu explanation expected');

  const hi = analyzeNotice('Section 138 cheque dishonoured', 'hi');
  assert.match(hi.explanation, /[ऀ-ॿ]/, 'Hindi explanation expected');
});

test('CNR validation', () => {
  assert.equal(isValidCNR('DLHC010001232024'), true);
  assert.equal(isValidCNR('DLHC01 000123 2024'), true); // spaces tolerated
  assert.equal(isValidCNR('not-a-cnr'), false);
  assert.equal(isValidCNR(''), false);
});

test('lookupTargets returns official portals', () => {
  const t = lookupTargets('cheque');
  assert.ok(Array.isArray(t) && t.length > 0);
  assert.ok(t.every(x => x.url.startsWith('https://')));
});

test('statusSummary has stable shape', () => {
  const s = statusSummary({ id: 'CASE-1', cnr: '', court: '', num: '' });
  assert.equal(s.id, 'CASE-1');
  assert.equal(s.court, 'To be assigned');
});

test('nearbyServices localises names', () => {
  assert.match(nearbyServices('Hyderabad', 'te')[0].name, /[ఀ-౿]/);
  assert.match(nearbyServices('Hyderabad', 'hi')[0].name, /[ऀ-ॿ]/);
  assert.equal(nearbyServices('Hyderabad', 'en')[0].name, 'District Court');
});

test('encryption: plain when locked, AES round-trip when unlocked', async () => {
  lock();
  const plain = await encryptData([{ a: 1 }]);
  assert.equal(plain, JSON.stringify([{ a: 1 }]));

  await unlockWithPin('1234');
  const enc = await encryptData([{ a: 1, b: 'x' }]);
  assert.ok(enc.startsWith('enc::'), 'ciphertext should be prefixed');
  const back = await decryptData(enc);
  assert.deepEqual(back, [{ a: 1, b: 'x' }]);
  lock();
});
