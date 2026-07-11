// ============================================
// encryption.js — lightweight local data protection
// Uses the Web Crypto API (AES-GCM) with a PIN-derived
// key. Falls back to plain localStorage when no PIN set.
// Everything stays on-device; nothing is sent to a server.
// ============================================

const ENC_PREFIX = 'enc::';
const SALT = 'nyayasahayak-v1-salt';

let sessionKey = null; // CryptoKey held in memory only

function hasCrypto() {
  return typeof crypto !== 'undefined' && crypto.subtle;
}

async function deriveKey(pin) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function unlockWithPin(pin) {
  if (!hasCrypto()) return false;
  sessionKey = await deriveKey(pin);
  return true;
}

export function lock() {
  sessionKey = null;
}

export function isUnlocked() {
  return sessionKey !== null;
}

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// Encrypt an object -> string. If no key, returns JSON as-is.
export async function encryptData(obj) {
  const json = JSON.stringify(obj);
  if (!sessionKey || !hasCrypto()) return json;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, enc.encode(json));
  return ENC_PREFIX + toB64(iv) + '.' + toB64(cipher);
}

// Decrypt string -> object. Handles both encrypted and plain payloads.
export async function decryptData(str) {
  if (!str) return null;
  if (!str.startsWith(ENC_PREFIX)) {
    try { return JSON.parse(str); } catch { return null; }
  }
  if (!sessionKey || !hasCrypto()) throw new Error('LOCKED');
  const [ivB64, dataB64] = str.slice(ENC_PREFIX.length).split('.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) },
    sessionKey,
    fromB64(dataB64)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// Non-crypto SHA-256 hash helper (e.g. to store a PIN check value).
export async function hashPin(pin) {
  if (!hasCrypto()) return 'plain:' + pin;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + SALT));
  return toB64(buf);
}
