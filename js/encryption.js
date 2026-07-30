// ============================================
// encryption.js — local data protection (AES-GCM, PIN-derived key)
//
// v2 (current): key = PBKDF2-SHA256(PIN, per-user RANDOM salt, 600k iters).
//   The salt is generated once per device (newSalt) and stored by the app;
//   ciphertext is prefixed `enc2::`.
// v1 (legacy read-only): PBKDF2(PIN, static salt, 100k), prefix `enc::`.
//   Old blobs still decrypt; the app re-saves them as v2 automatically.
//
// A 4-digit PIN is low-entropy by nature — this raises the cost of an offline
// brute force but is not a substitute for device security. Nothing leaves the
// device.
// ============================================

const ENC_PREFIX = 'enc::';    // v1 (legacy)
const ENC2_PREFIX = 'enc2::';  // v2 (current)
const STATIC_SALT = 'nyayasahayak-v1-salt';
const V1_ITERS = 100000;
const V2_ITERS = 600000;

let keyV2 = null; // current key (random salt) — used for all new writes
let keyV1 = null; // legacy key (static salt) — read-only, for migration

function hasCrypto() {
  return typeof crypto !== 'undefined' && crypto.subtle;
}
function bytes(str) { return new TextEncoder().encode(str); }
function toB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromB64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

// A fresh per-user random salt (base64). Store it and pass to unlockWithPin.
export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveKey(pin, saltBytes, iters) {
  const base = await crypto.subtle.importKey('raw', bytes(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

// Unlock with the PIN and the per-user salt (base64). Derives the current v2
// key plus the legacy v1 key so old data can still be read and migrated.
export async function unlockWithPin(pin, saltB64) {
  if (!hasCrypto()) return false;
  if (saltB64) keyV2 = await deriveKey(pin, fromB64(saltB64), V2_ITERS);
  keyV1 = await deriveKey(pin, bytes(STATIC_SALT), V1_ITERS);
  return true;
}

export function lock() { keyV2 = null; keyV1 = null; }
export function isUnlocked() { return keyV2 !== null; }

export function isEncrypted(str) {
  return typeof str === 'string' && (str.startsWith(ENC2_PREFIX) || str.startsWith(ENC_PREFIX));
}

// Encrypt an object -> string (v2). If no key, returns plain JSON.
export async function encryptData(obj) {
  const json = JSON.stringify(obj);
  if (!keyV2 || !hasCrypto()) return json;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyV2, bytes(json));
  return ENC2_PREFIX + toB64(iv) + '.' + toB64(cipher);
}

// Decrypt string -> object. Handles v2, legacy v1, and plain JSON.
export async function decryptData(str) {
  if (!str) return null;
  if (str.startsWith(ENC2_PREFIX)) return decryptWith(str.slice(ENC2_PREFIX.length), keyV2);
  if (str.startsWith(ENC_PREFIX)) return decryptWith(str.slice(ENC_PREFIX.length), keyV1);
  try { return JSON.parse(str); } catch { return null; }
}
async function decryptWith(payload, key) {
  if (!key || !hasCrypto()) throw new Error('LOCKED');
  const [ivB64, dataB64] = payload.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(dataB64));
  return JSON.parse(new TextDecoder().decode(plain));
}

// SHA-256 PIN check value (verifier only, not the encryption key).
export async function hashPin(pin) {
  if (!hasCrypto()) return 'plain:' + pin;
  const buf = await crypto.subtle.digest('SHA-256', bytes(pin + STATIC_SALT));
  return toB64(buf);
}
