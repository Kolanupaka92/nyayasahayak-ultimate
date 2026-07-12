// ============================================
// storage.js — on-device document store (IndexedDB)
// localStorage is string-only and ~5 MB; real uploaded files
// (PDFs, photos of notices) need Blob storage, so documents live
// in IndexedDB. We keep the raw file (so it stays viewable) plus
// any extracted text (so it can be analysed). Nothing leaves the
// device. Case records in localStorage keep only lightweight refs.
// ============================================
const DB_NAME = 'nyayaDocs';
const STORE = 'docs';
const VERSION = 1;
let _db = null;

export function isStorageSupported() {
  return typeof indexedDB !== 'undefined';
}

function db() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const os = d.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('caseId', 'caseId', { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// Store a document { id, caseId, name, type, size, blob, text }.
export async function putDoc(doc) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(doc);
    tx.oncomplete = () => resolve(doc.id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDoc(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function getDocsForCase(caseId) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = [];
    const cur = d.transaction(STORE).objectStore(STORE).index('caseId').openCursor(IDBKeyRange.only(caseId));
    cur.onsuccess = e => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
    cur.onerror = () => reject(cur.error);
  });
}

export async function deleteDoc(id) {
  const d = await db();
  return new Promise((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function deleteDocsForCase(caseId) {
  const docs = await getDocsForCase(caseId).catch(() => []);
  await Promise.all(docs.map(x => deleteDoc(x.id)));
}

// Extract text from a File where possible, offline.
// Text-like files are read directly. Binary files (PDF, images) are
// kept as-is and remain viewable; OCR text-extraction for scans is
// not available offline, so `extractable` is false for those.
export async function extractText(file) {
  const textLike = (file.type && file.type.startsWith('text/')) || /\.(txt|csv|md|json|log|xml|html?)$/i.test(file.name);
  if (textLike) {
    try { return { text: await file.text(), extractable: true }; }
    catch { return { text: '', extractable: false }; }
  }
  return { text: '', extractable: false };
}

// Approximate total bytes stored (for a storage indicator).
export async function usageBytes() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate().catch(() => null);
    if (est) return est.usage || 0;
  }
  return null;
}
