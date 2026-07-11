// ============================================
// app.js — NyayaSahayak main controller
// ES module. Imports data + feature modules and renders
// the single-page UI. All state lives on-device.
// ============================================
import { STATES_UTS, RED_FLAGS_DB, I18N } from './districts-data.js';
import { analyzeNotice } from './ai-engine.js';
import { nearbyServices, mapLink, getCoords } from './geolocation.js';
import { lookupTargets, statusSummary, isValidCNR } from './ecourts-api.js';
import { speak, speakHelplines, isSupported as ttsSupported } from './ivr.js';
import { encryptData, decryptData, unlockWithPin, hashPin, isUnlocked } from './encryption.js';

// ---------- State ----------
let currentLang = 'en';
let currentState = '';
let currentDistrict = '';
let currentPage = 'dashboard';
let currentCase = null;
let cases = [];
let currentDocs = [];
let pinHash = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Persistence (encrypted when unlocked) ----------
async function saveCases() {
  try {
    const payload = await encryptData(cases);
    localStorage.setItem('nyayaCases', payload);
  } catch (e) {
    localStorage.setItem('nyayaCases', JSON.stringify(cases));
  }
}
async function loadCases() {
  const raw = localStorage.getItem('nyayaCases');
  if (!raw) { cases = []; return; }
  try {
    cases = (await decryptData(raw)) || [];
  } catch (e) {
    if (e.message === 'LOCKED') { cases = []; return; }
    cases = [];
  }
}

// ---------- i18n ----------
function t(key) { return I18N[key]?.[currentLang] || I18N[key]?.en || key; }
const L = (en, hi) => (currentLang === 'hi' ? hi : en);

// ---------- Pages config ----------
const PAGES = [
  { id: 'dashboard', icon: '🏠', key: 'home' },
  { id: 'mycase', icon: '📋', key: 'mycase' },
  { id: 'cases', icon: '🔎', key: 'cases' },
  { id: 'guide', icon: '🛣️', key: 'guide' },
  { id: 'redflags', icon: '🚨', key: 'redflags' },
  { id: 'attorney', icon: '👨‍⚖️', key: 'attorney' },
  { id: 'analyzer', icon: '🔍', key: 'analyzer' },
  { id: 'drafts', icon: '✍️', key: 'drafts' },
  { id: 'nearby', icon: '📍', key: 'nearby' },
  { id: 'rights', icon: '📚', key: 'rights' },
  { id: 'helpline', icon: '📞', key: 'helpline' }
];

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  await loadCases();
  populateStates();
  if (currentState) populateDistricts(currentState);
  if (currentDistrict) $('districtSelect').value = currentDistrict;
  renderSidebar();
  showPage('dashboard');
  setupOfflineListener();
  registerSW();
  bindGlobal();
});

function bindGlobal() {
  $('stateSelect').addEventListener('change', changeState);
  $('districtSelect').addEventListener('change', changeDistrict);
  $('languageSelect').addEventListener('change', changeLanguage);
  $('themeBtn').addEventListener('click', toggleTheme);
  $('lockBtn').addEventListener('click', lockApp);
  $('logo').addEventListener('click', () => showPage('dashboard'));
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.classList.remove('show'); });
  // expose a couple of handlers used by inline onclick in generated markup
  window.NS = handlers;
}

function loadSettings() {
  currentLang = localStorage.getItem('nyayaLang') || 'en';
  currentState = localStorage.getItem('nyayaState') || '';
  currentDistrict = localStorage.getItem('nyayaDistrict') || '';
  pinHash = localStorage.getItem('nyayaPinHash');
  $('languageSelect').value = currentLang;
  document.documentElement.lang = currentLang;
  if (localStorage.getItem('nyayaTheme') === 'dark') document.body.classList.add('dark');
  if (pinHash) $('lockBtn').style.display = 'inline-block';
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ---------- Selectors ----------
function populateStates() {
  const sel = $('stateSelect');
  Object.entries(STATES_UTS).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([code, st]) => {
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = '🗺️ ' + st.name;
    sel.appendChild(opt);
  });
  if (currentState) sel.value = currentState;
}
function populateDistricts(code) {
  const sel = $('districtSelect');
  sel.innerHTML = '<option value="">📍 District</option>';
  const st = STATES_UTS[code];
  if (st?.districts) {
    st.districts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });
    sel.style.display = 'inline-block';
  }
}
function changeState() {
  currentState = $('stateSelect').value;
  localStorage.setItem('nyayaState', currentState);
  currentDistrict = ''; localStorage.removeItem('nyayaDistrict');
  if (currentState) {
    populateDistricts(currentState);
    const st = STATES_UTS[currentState];
    if (st.langs && st.langs[0] !== currentLang && confirm(`Switch to language for ${st.name}?`)) {
      $('languageSelect').value = st.langs[0]; changeLanguage();
    }
    toast('📍 ' + st.name);
  } else {
    $('districtSelect').style.display = 'none';
  }
  renderCurrentPage();
}
function changeDistrict() {
  currentDistrict = $('districtSelect').value;
  localStorage.setItem('nyayaDistrict', currentDistrict);
  if (currentDistrict) toast('📍 ' + currentDistrict);
  renderCurrentPage();
}
function changeLanguage() {
  currentLang = $('languageSelect').value;
  document.documentElement.lang = currentLang;
  localStorage.setItem('nyayaLang', currentLang);
  renderSidebar(); renderCurrentPage();
  toast('✓ ' + L('Language updated', 'भाषा अपडेट'));
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('nyayaTheme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

// ---------- Lock / PIN ----------
async function lockApp() {
  const pin = prompt(L('Enter 4-digit PIN to protect your case data:', 'डेटा सुरक्षित करने के लिए 4-अंकीय PIN:'));
  if (!pin || !/^\d{4}$/.test(pin)) { toast('⚠️ ' + L('PIN must be 4 digits', 'PIN 4 अंक का हो'), 'warning'); return; }
  const h = await hashPin(pin);
  if (pinHash && pinHash !== h) { toast('❌ ' + L('Wrong PIN', 'गलत PIN'), 'error'); return; }
  pinHash = h; localStorage.setItem('nyayaPinHash', h);
  await unlockWithPin(pin);
  await saveCases(); // re-save encrypted
  toast('🔒 ' + L('Data secured & encrypted', 'डेटा एन्क्रिप्ट किया गया'));
}

// ---------- Navigation ----------
function renderSidebar() {
  $('sidebar').innerHTML = PAGES.map(p => `
    <div class="nav-item${p.id === currentPage ? ' active' : ''}" data-page="${p.id}" onclick="NS.showPage('${p.id}')">
      <span class="nav-icon">${p.icon}</span><span>${esc(t(p.key))}</span>
      ${p.id === 'redflags' && currentCase?.redFlags?.length ? `<span class="nav-badge">${currentCase.redFlags.length}</span>` : ''}
    </div>`).join('');
}
function showPage(id) {
  currentPage = id;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderCurrentPage() {
  const fns = { dashboard: renderDashboard, mycase: renderMyCase, cases: renderCaseStatus, guide: renderGuide, redflags: renderRedFlags, attorney: renderAttorney, analyzer: renderAnalyzer, drafts: renderDrafts, nearby: renderNearby, rights: renderRights, helpline: renderHelpline };
  $('mainContent').innerHTML = `<div class="page">${(fns[currentPage] || renderDashboard)()}</div>`;
}

// ---------- Toast / Modal ----------
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}
function showModal(html) { $('modalContent').innerHTML = html; $('modal').classList.add('show'); }

function setupOfflineListener() {
  const banner = $('offlineBanner');
  const update = () => {
    if (navigator.onLine) { banner.classList.remove('show'); }
    else { banner.classList.add('show'); }
  };
  window.addEventListener('online', () => { update(); toast('🟢 ' + L('Back online', 'ऑनलाइन')); });
  window.addEventListener('offline', () => { update(); toast('📡 ' + L('Offline mode', 'ऑफलाइन मोड'), 'warning'); });
  update();
}

// ============================================
// PAGE: Dashboard
// ============================================
function renderDashboard() {
  const st = currentState ? STATES_UTS[currentState] : null;
  return `
    <h1 class="page-title">⚖️ ${L('Welcome to NyayaSahayak', 'न्यायसहायक में आपका स्वागत है')}</h1>
    <p class="page-subtitle">${L('Free legal help for every citizen — private, offline, in your language', 'हर नागरिक के लिए मुफ्त कानूनी मदद — निजी, ऑफलाइन, आपकी भाषा में')}</p>
    ${st ? `<div class="alert alert-info"><strong>📍 ${esc(st.name)}</strong>${currentDistrict ? ` › ${esc(currentDistrict)}` : ''}<br>🏛️ ${esc(st.hc)} &nbsp;|&nbsp; 📜 ${esc(st.landLaw)}${st.portal ? `<br>🌐 <a href="${st.portal}" target="_blank" rel="noopener">${st.portal}</a>` : ''}</div>`
      : `<div class="alert alert-warning">⚠️ ${L('Please select your State (top-right) for local court & law info', 'ऊपर दाईं ओर अपना राज्य चुनें')}</div>`}
    <div class="grid">
      ${PAGES.filter(p => p.id !== 'dashboard').map(p => `
        <div class="feature-card" onclick="NS.showPage('${p.id}')">
          <div class="feature-icon">${p.icon}</div>
          <div class="feature-title">${esc(t(p.key))}</div>
          <div class="feature-desc">${esc(featureDesc(p.id))}</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3 class="card-title">🆘 ${L('Emergency Helplines', 'आपातकालीन हेल्पलाइन')}</h3>
      <div class="grid">
        ${emergencyNumbers().map(n => `<div><strong>${esc(n.label)}</strong><p><a class="emergency-num" href="tel:${n.num}">${n.num}</a></p></div>`).join('')}
      </div>
    </div>
    <div class="alert alert-success"><strong>🛡️ ${L('Private by design', 'सुरक्षित')}:</strong> ${L('All your data stays on this device. No servers, no tracking. Tap the lock icon to encrypt with a PIN.', 'सारा डेटा इसी डिवाइस पर रहता है। कोई सर्वर नहीं। PIN से एन्क्रिप्ट करें।')}</div>`;
}
function featureDesc(id) {
  const d = {
    mycase: L('Upload & track your case', 'मामला अपलोड व ट्रैक करें'),
    cases: L('Check case status on eCourts', 'eCourts पर स्थिति देखें'),
    guide: L('3 paths: DIY / Hybrid / Attorney', '3 रास्ते'),
    redflags: L('Detect attorney fraud early', 'वकील धोखाधड़ी पकड़ें'),
    attorney: L('Monitor your lawyer', 'वकील की निगरानी'),
    analyzer: L('AI notice analysis', 'AI नोटिस विश्लेषण'),
    drafts: L('Auto-generate legal drafts', 'मसौदे बनाएं'),
    nearby: L('Find help near you', 'पास की सहायता'),
    rights: L('Know your legal rights', 'अपने अधिकार जानें'),
    helpline: L('Free legal aid contacts', 'मुफ्त सहायता संपर्क')
  };
  return d[id] || '';
}
function emergencyNumbers() {
  return [
    { label: L('Police', 'पुलिस'), num: '100' },
    { label: 'NALSA', num: '15100' },
    { label: L('Women', 'महिला'), num: '181' },
    { label: L('Child', 'बाल'), num: '1098' },
    { label: L('Cyber Crime', 'साइबर'), num: '1930' },
    { label: L('Emergency', 'आपातकाल'), num: '112' }
  ];
}

// ============================================
// PAGE: My Case
// ============================================
function renderMyCase() {
  return `
    <h1 class="page-title">📋 ${t('mycase')}</h1>
    <p class="page-subtitle">${L('Record your case securely on this device', 'अपना मामला सुरक्षित रूप से दर्ज करें')}</p>
    <div class="card">
      <div class="tabs">
        <div class="tab active" data-ct="new" onclick="NS.switchCase('new', this)">➕ ${L('New', 'नया')}</div>
        <div class="tab" data-ct="list" onclick="NS.switchCase('list', this)">📁 ${L('Saved', 'सहेजे')} (${cases.length})</div>
      </div>
      <div id="ct-new">
        <div class="alert alert-info">🔒 ${L('Saved only on your device. Use the lock icon to add PIN encryption.', 'केवल आपके डिवाइस पर सहेजा जाता है।')}</div>
        <form id="caseForm">
          <div class="form-row">
            <div class="form-group"><label>${L('Your Name', 'आपका नाम')}*</label><input class="form-control" id="c_name" required></div>
            <div class="form-group"><label>${L('Mobile', 'मोबाइल')}</label><input type="tel" class="form-control" id="c_phone"></div>
          </div>
          <div class="form-group"><label>${L('Case Type', 'मामले का प्रकार')}*</label>
            <select class="form-control" id="c_type" required>
              <option value="">${L('Select', 'चुनें')}</option>
              ${caseTypes().map(([v, en, hi]) => `<option value="${v}">${L(en, hi)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>${L('Description', 'विवरण')}*</label><textarea class="form-control" id="c_desc" required placeholder="${L('What happened, when, where, who', 'क्या, कब, कहाँ, कौन')}"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>${L('Court', 'अदालत')}</label><input class="form-control" id="c_court" placeholder="${currentState ? esc(STATES_UTS[currentState].hc) : 'District Court'}"></div>
            <div class="form-group"><label>${L('Case / CNR Number', 'केस / CNR नंबर')}</label><input class="form-control" id="c_num"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${L('Has Attorney?', 'वकील है?')}</label>
              <select class="form-control" id="c_hasAtt" onchange="document.getElementById('attFields').style.display=this.value==='yes'?'block':'none'">
                <option value="no">${L('No', 'नहीं')}</option><option value="yes">${L('Yes', 'हाँ')}</option>
              </select></div>
            <div class="form-group"><label>${L('Budget', 'बजट')} (₹)</label><input type="number" class="form-control" id="c_budget"></div>
          </div>
          <div id="attFields" style="display:none">
            <div class="form-row">
              <div class="form-group"><label>${L('Attorney Name', 'वकील का नाम')}</label><input class="form-control" id="c_attName"></div>
              <div class="form-group"><label>${L('Enrollment No.', 'पंजीकरण संख्या')}</label><input class="form-control" id="c_attEnroll"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>${L('Fee', 'फीस')} (₹)</label><input type="number" class="form-control" id="c_attFee"></div>
              <div class="form-group"><label>${L('Payment', 'भुगतान')}</label>
                <select class="form-control" id="c_attPay">
                  <option value="unpaid">${L('Unpaid', 'अभी नहीं')}</option><option value="partial">${L('Partial', 'आंशिक')}</option><option value="full">${L('Full', 'पूरा')}</option>
                </select></div>
            </div>
          </div>
          <div class="form-group"><label>${L('Attach Documents (names stored locally)', 'दस्तावेज संलग्न करें')}</label>
            <div class="upload-zone" onclick="document.getElementById('docInput').click()">
              <div class="upload-icon">📁</div><p>${L('Click to select files', 'फाइल चुनने के लिए क्लिक करें')}</p>
              <input type="file" id="docInput" hidden multiple>
            </div>
            <div id="docList"></div></div>
          <button type="submit" class="btn btn-primary">💾 ${L('Save Case', 'मामला सहेजें')}</button>
        </form>
      </div>
      <div id="ct-list" style="display:none"><div id="caseListContainer"></div></div>
    </div>
    <div id="caseAnalysisResult"></div>`;
}
function caseTypes() {
  return [['civil', 'Civil', 'सिविल'], ['criminal', 'Criminal', 'आपराधिक'], ['family', 'Family', 'पारिवारिक'], ['property', 'Property', 'संपत्ति'], ['consumer', 'Consumer', 'उपभोक्ता'], ['labor', 'Labor', 'श्रम'], ['revenue', 'Revenue', 'राजस्व'], ['cheque', 'Cheque Bounce', 'चेक बाउंस'], ['rental', 'Rental', 'किराया']];
}

function afterMyCaseRender() {
  const form = $('caseForm'); if (!form) return;
  form.addEventListener('submit', saveCaseForm);
  $('docInput')?.addEventListener('change', e => {
    Array.from(e.target.files).forEach(f => currentDocs.push({ name: f.name, size: f.size }));
    renderDocList();
  });
  renderDocList();
}
function renderDocList() {
  const el = $('docList'); if (!el) return;
  el.innerHTML = currentDocs.map((d, i) => `<div class="case-item"><span>📎 ${esc(d.name)} (${(d.size / 1024).toFixed(1)}KB)</span><button type="button" class="btn btn-danger btn-sm" onclick="NS.removeDoc(${i})">×</button></div>`).join('');
}
async function saveCaseForm(e) {
  e.preventDefault();
  const c = {
    id: 'CASE-' + Date.now().toString(36).toUpperCase(),
    name: $('c_name').value, phone: $('c_phone').value, type: $('c_type').value,
    desc: $('c_desc').value, court: $('c_court').value, num: $('c_num').value,
    cnr: $('c_num').value, hasAtt: $('c_hasAtt').value,
    att: $('c_hasAtt').value === 'yes' ? { name: $('c_attName').value, enroll: $('c_attEnroll').value, fee: $('c_attFee').value, pay: $('c_attPay').value } : null,
    docs: [...currentDocs], budget: $('c_budget').value,
    state: currentState, district: currentDistrict,
    created: new Date().toISOString(), status: 'active', redFlags: [], logs: []
  };
  cases.push(c); await saveCases();
  currentDocs = []; currentCase = c;
  toast('✅ ' + L('Case saved', 'मामला सहेजा') + ': ' + c.id);
  const res = $('caseAnalysisResult');
  res.innerHTML = renderCaseAnalysis(c);
  res.scrollIntoView({ behavior: 'smooth' });
  renderSidebar();
}
function renderCaseAnalysis(c) {
  const issues = [];
  if (c.hasAtt === 'yes' && c.att) {
    if (!c.att.enroll) issues.push({ sev: 'critical', txt: L('No Bar Council enrollment number', 'पंजीकरण संख्या नहीं'), action: L('Verify on barcouncilofindia.org', 'बार काउंसिल में सत्यापित करें') });
    if (c.att.pay === 'full') issues.push({ sev: 'high', txt: L('Full fee paid — monitor work closely', 'पूरा भुगतान - काम की निगरानी करें'), action: L('Log every update in Attorney Monitor', 'हर अपडेट लॉग करें') });
  }
  return `<div class="card">
    <h3 class="card-title">🔍 ${L('Quick Analysis', 'त्वरित विश्लेषण')} — ${c.id}</h3>
    <div class="grid">
      <div><strong>${L('Type', 'प्रकार')}:</strong> ${esc(c.type)}</div>
      <div><strong>${L('Court', 'अदालत')}:</strong> ${esc(c.court || 'TBD')}</div>
      <div><strong>${L('Documents', 'दस्तावेज')}:</strong> ${c.docs.length}</div>
      <div><strong>${L('Attorney', 'वकील')}:</strong> ${c.hasAtt === 'yes' ? esc(c.att.name || 'Yes') : '❌'}</div>
    </div>
    ${issues.length ? issues.map(i => `<div class="${i.sev === 'critical' ? 'red-flag' : 'yellow-flag'}"><strong>${i.txt}</strong><br>✅ ${i.action}</div>`).join('') : `<div class="green-flag">✅ ${L('No immediate issues detected', 'कोई तत्काल समस्या नहीं')}</div>`}
    <div class="btn-group mt-1">
      <button class="btn btn-primary" onclick="NS.showPage('guide')">🛣️ ${L('See Step Guide', 'मार्गदर्शन देखें')}</button>
      ${c.hasAtt === 'yes' ? `<button class="btn btn-danger" onclick="NS.showPage('redflags')">🚨 ${L('Check Attorney', 'वकील जाँच')}</button>` : ''}
    </div></div>`;
}
function renderCaseList() {
  const el = $('caseListContainer'); if (!el) return;
  if (!cases.length) { el.innerHTML = `<p style="text-align:center;color:var(--text-light);padding:1rem">${L('No saved cases yet', 'कोई मामला नहीं')}</p>`; return; }
  el.innerHTML = cases.map(x => `<div class="case-item">
    <div><strong>${esc(x.id)}</strong> — ${esc((x.type || '').toUpperCase())}<br><small>${esc(x.name)} | ${esc(x.court || 'Court TBD')}</small></div>
    <div class="btn-group">
      <button class="btn btn-primary btn-sm" onclick="NS.openCase('${x.id}')">📂 ${L('Open', 'खोलें')}</button>
      <button class="btn btn-danger btn-sm" onclick="NS.deleteCase('${x.id}')">🗑️</button>
    </div></div>`).join('');
}

// ============================================
// PAGE: Case Status (eCourts deep links)
// ============================================
function renderCaseStatus() {
  const targets = lookupTargets(currentCase?.type);
  return `
    <h1 class="page-title">🔎 ${t('cases')}</h1>
    <p class="page-subtitle">${L('Track your case on official government portals', 'सरकारी पोर्टल पर अपना मामला ट्रैक करें')}</p>
    ${currentCase ? `<div class="card"><h3 class="card-title">📋 ${esc(currentCase.id)}</h3>${statusTable(statusSummary(currentCase))}</div>` : `<div class="alert alert-info">${L('Add a case in "My Case" to save its details, or use the official links below directly.', 'विवरण सहेजने के लिए मामला जोड़ें, या नीचे दिए लिंक उपयोग करें।')}</div>`}
    <div class="card">
      <h3 class="card-title">🏛️ ${L('Official Case Status Portals', 'आधिकारिक पोर्टल')}</h3>
      <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.6rem">${L('These open the government eCourts sites in a new tab. Search by CNR number, case number or party name.', 'ये सरकारी eCourts साइट खोलते हैं। CNR, केस नंबर या नाम से खोजें।')}</p>
      ${targets.map(x => `<div class="nearby-card"><div><h4>${esc(x.label)}</h4><p style="font-size:.82rem;color:var(--text-light)">${esc(x.note)}</p></div><a class="btn btn-primary btn-sm" href="${x.url}" target="_blank" rel="noopener">${L('Open', 'खोलें')} →</a></div>`).join('')}
    </div>
    <div class="card">
      <h3 class="card-title">🔢 ${L('CNR Number Checker', 'CNR जाँच')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('CNR is a unique 16-character case ID (e.g. DLHC01-000123-2024).', 'CNR एक अद्वितीय 16-अक्षर केस ID है।')}</p>
      <div class="form-row">
        <div class="form-group"><input class="form-control" id="cnrIn" placeholder="XXXX00000000000"></div>
        <div class="form-group"><button class="btn btn-primary" onclick="NS.checkCNR()">${L('Validate', 'जाँचें')}</button></div>
      </div>
      <div id="cnrResult"></div>
    </div>`;
}
function statusTable(s) {
  const rows = [[L('CNR', 'CNR'), s.cnr], [L('Court', 'अदालत'), s.court], [L('Case No.', 'केस नंबर'), s.caseNumber], [L('Next Date', 'अगली तारीख'), s.nextDate], [L('Stage', 'चरण'), s.stage]];
  return `<div class="grid">${rows.map(([k, v]) => `<div><strong>${k}:</strong> ${esc(v)}</div>`).join('')}</div>`;
}

// ============================================
// PAGE: Guide
// ============================================
function renderGuide() {
  if (!currentCase && cases.length) currentCase = cases[cases.length - 1];
  if (!currentCase) return `<h1 class="page-title">🛣️ ${t('guide')}</h1><div class="alert alert-warning">${L('Add a case first to get a personalized guide', 'व्यक्तिगत मार्गदर्शन के लिए पहले मामला जोड़ें')}</div><button class="btn btn-primary" onclick="NS.showPage('mycase')">📋 ${L('Add Case', 'मामला जोड़ें')}</button>`;
  return `
    <h1 class="page-title">🛣️ ${t('guide')}</h1>
    <p class="page-subtitle">${L('Choose how you want to handle', 'अपना रास्ता चुनें')} — ${esc(currentCase.id)}</p>
    <div class="card"><h3 class="card-title">📋 ${esc(currentCase.id)}</h3><p>${L('Type', 'प्रकार')}: <strong>${esc(currentCase.type)}</strong> | ${L('Court', 'अदालत')}: <strong>${esc(currentCase.court || 'TBD')}</strong></p></div>
    <div class="grid">
      <div class="path-card" onclick="NS.selectPath('diy')"><h4>🛠️ DIY</h4><p>${L('Handle yourself', 'स्वयं करें')}</p><div class="path-meta"><span>💰 ₹0-5K</span><span>⏰ 30-90 ${L('days', 'दिन')}</span></div></div>
      <div class="path-card" onclick="NS.selectPath('hybrid')"><h4>🤝 Hybrid</h4><p>${L('Consult + self-file', 'परामर्श + स्वयं')}</p><div class="path-meta"><span>💰 ₹5K-25K</span><span>⏰ 30-60 ${L('days', 'दिन')}</span></div></div>
      <div class="path-card" onclick="NS.selectPath('full')"><h4>👨‍⚖️ Full Attorney</h4><p>${L('Lawyer does all', 'पूरा वकील')}</p><div class="path-meta"><span>💰 ₹25K+</span><span>⏰ 60-180 ${L('days', 'दिन')}</span></div></div>
    </div>
    <div id="pathContent" class="mt-2"></div>`;
}
function pathSteps(path) {
  const s = {
    diy: [['Gather Documents', 'दस्तावेज इकट्ठा करें', 'All papers in one place', 'सभी कागजात एक जगह', '1-2 days'], ['Research Online', 'ऑनलाइन शोध', 'Check laws & precedents', 'कानून देखें', '2-3 days'], ['Prepare Draft', 'मसौदा तैयार करें', 'Use our Drafts tool', 'ड्राफ्ट टूल उपयोग करें', '1 day'], ['File the Case', 'फाइल करें', 'Online or at court', 'ऑनलाइन या कोर्ट', '1 day'], ['Attend Hearings', 'सुनवाई', 'Attend all dates', 'सभी तारीखों पर जाएं', '']],
    hybrid: [['Attorney Consultation', 'वकील परामर्श', 'One-time strategy meeting', 'रणनीति बैठक', '1 day'], ['Self Documents', 'स्वयं दस्तावेज', 'Forms & copies', 'फॉर्म, फोटोकॉपी', '3-5 days'], ['Attorney Review', 'वकील समीक्षा', 'Get draft checked', 'मसौदे की जाँच', '1-2 days'], ['File', 'फाइल', 'Online portal', 'ऑनलाइन पोर्टल', '1 day'], ['Hearing', 'सुनवाई', 'With attorney', 'वकील के साथ', '']],
    full: [['Choose Attorney', 'वकील चुनें', 'Verify Bar Council ID', 'बार काउंसिल सत्यापित', '3-7 days'], ['Written Fee Agreement', 'फीस समझौता', 'Get it in writing', 'लिखित', '1 day'], ['Hand Over Docs', 'दस्तावेज सौंपें', 'Keep photocopies!', 'फोटोकॉपी रखें', '1 day'], ['Attorney Files', 'वकील फाइल करे', 'Track progress weekly', 'साप्ताहिक ट्रैक', '7-15 days'], ['Hearing', 'सुनवाई', 'You attend too', 'आप भी जाएं', '']]
  };
  return s[path];
}
function selectPath(path) {
  const steps = pathSteps(path);
  $('pathContent').innerHTML = `
    <div class="card"><h3 class="card-title">📍 ${L('Path', 'रास्ता')}: ${path.toUpperCase()}</h3>
      <div class="stepper">${steps.map((s, i) => `<div class="step${i === 0 ? ' current' : ''}"><div class="step-title">${i + 1}. ${L(s[0], s[1])}</div><div class="step-content">${L(s[2], s[3])}</div>${s[4] ? `<div style="font-size:.78rem;color:var(--text-light);margin-top:.2rem">⏱️ ${s[4]}</div>` : ''}</div>`).join('')}</div>
      <div class="alert alert-info mt-1"><strong>💡 ${L('Tips', 'टिप्स')}:</strong><ul><li>${L('Screenshot every step', 'हर कदम का स्क्रीनशॉट')}</li><li>${L('Add all dates to your calendar', 'तारीखें कैलेंडर में डालें')}</li><li>${L('Keep original documents safe', 'मूल दस्तावेज सुरक्षित रखें')}</li></ul></div>
    </div>
    <div class="card"><h3 class="card-title">📋 ${L('Document Checklist', 'दस्तावेज चेकलिस्ट')}</h3><ul>${docChecklist().map(d => `<li>☐ ${esc(d)}</li>`).join('')}</ul></div>`;
}
function docChecklist() {
  const base = ['Identity Proof (Aadhaar/Voter ID)', 'Address Proof', 'Affidavit', 'Court Fee'];
  const sp = { cheque: ['Cheque Copy', 'Bank Return Memo', 'Legal Notice copy'], property: ['Sale Deed', 'Khatauni / Mutation', 'Encumbrance Certificate'], family: ['Marriage Certificate', 'Birth Certificates', 'Income Proof'], consumer: ['Bill / Invoice', 'Warranty', 'Photos of defect'] };
  return [...base, ...(sp[currentCase?.type] || [])];
}

// ============================================
// PAGE: Red Flags
// ============================================
function renderRedFlags() {
  return `
    <h1 class="page-title">🚨 ${t('redflags')}</h1>
    <p class="page-subtitle">${L('Spot attorney fraud before it costs you', 'नुकसान से पहले वकील धोखाधड़ी पकड़ें')}</p>
    <div class="alert alert-danger"><strong>⚠️ ${L('IMPORTANT', 'महत्वपूर्ण')}:</strong> ${L('Act immediately on any critical red flag', 'किसी भी गंभीर रेड फ्लैग पर तुरंत कार्रवाई')}</div>
    <div class="card">
      <h3 class="card-title">🔍 ${L('Quick Self-Check', 'त्वरित जाँच')}</h3>
      <div class="form-row">
        <div class="form-group"><label>${L('Gave Bar Council number?', 'बार काउंसिल नंबर दिया?')}</label><select class="form-control" id="rf1"><option value="no">${L('No', 'नहीं')}</option><option value="yes">${L('Yes', 'हाँ')}</option></select></div>
        <div class="form-group"><label>${L('Written agreement?', 'लिखित समझौता?')}</label><select class="form-control" id="rf2"><option value="no">${L('No', 'नहीं')}</option><option value="yes">${L('Yes', 'हाँ')}</option></select></div>
        <div class="form-group"><label>${L('Payment', 'भुगतान')}</label><select class="form-control" id="rf3"><option value="unpaid">${L('Unpaid', 'नहीं')}</option><option value="partial">${L('Partial', 'आंशिक')}</option><option value="full">${L('Full', 'पूरा')}</option></select></div>
        <div class="form-group"><label>${L('Work progress', 'कार्य प्रगति')}</label><select class="form-control" id="rf4"><option value="nothing">${L('Nothing', 'कुछ नहीं')}</option><option value="little">${L('Little', 'कम')}</option><option value="good">${L('Good', 'अच्छा')}</option></select></div>
        <div class="form-group"><label>${L('Days since hired', 'कितने दिन हुए')}</label><input type="number" class="form-control" id="rf5" placeholder="30"></div>
        <div class="form-group"><label>${L('Guaranteed 100% win?', 'जीत की गारंटी?')}</label><select class="form-control" id="rf6"><option value="no">${L('No', 'नहीं')}</option><option value="yes">${L('Yes', 'हाँ')}</option></select></div>
      </div>
      <button class="btn btn-danger" onclick="NS.analyzeRF()">🚨 ${L('Analyze', 'विश्लेषण')}</button>
      <div id="rfResult" class="mt-2"></div>
    </div>
    <div class="card"><h3 class="card-title">📚 ${L('All Red Flags', 'सभी रेड फ्लैग्स')} (${RED_FLAGS_DB.length})</h3>
      <details><summary style="cursor:pointer;font-weight:500">${L('View all warning signs', 'सभी देखें')}</summary>
        <div style="margin-top:.5rem">${RED_FLAGS_DB.map(rf => `<div class="${rf.severity === 'critical' ? 'red-flag' : rf.severity === 'high' ? 'yellow-flag' : 'green-flag'}"><strong>${esc(rf.title[currentLang] || rf.title.en)}</strong><p style="font-size:.85rem;margin-top:.3rem">${esc(rf.desc[currentLang] || rf.desc.en)}</p><div style="background:rgba(255,255,255,.5);padding:.3rem .5rem;border-radius:4px;margin-top:.3rem;font-size:.85rem">✅ ${esc(rf.action[currentLang] || rf.action.en)} <span class="badge badge-danger">${rf.severity.toUpperCase()}</span></div></div>`).join('')}</div>
      </details>
    </div>`;
}
async function analyzeRF() {
  const v = id => $(id).value;
  const flags = [];
  if (v('rf1') === 'no') flags.push(RED_FLAGS_DB[0]);
  if (v('rf2') === 'no') flags.push(RED_FLAGS_DB[3]);
  if (v('rf3') === 'full' && v('rf4') === 'nothing' && parseInt(v('rf5') || 0) > 30) flags.push(RED_FLAGS_DB[2]);
  if (v('rf6') === 'yes') flags.push(RED_FLAGS_DB[5]);
  const res = $('rfResult');
  if (!flags.length) { res.innerHTML = `<div class="green-flag">✅ ${L('No major red flags detected', 'कोई बड़ा रेड फ्लैग नहीं')}</div>`; return; }
  res.innerHTML = `<h4>🚨 ${flags.length} ${L('red flags found', 'रेड फ्लैग मिले')}</h4>${flags.map(f => `<div class="red-flag"><div class="red-flag-title">${esc(f.title[currentLang] || f.title.en)}</div><div class="red-flag-desc">${esc(f.desc[currentLang] || f.desc.en)}</div><div class="red-flag-action">✅ ${esc(f.action[currentLang] || f.action.en)}</div></div>`).join('')}`;
  if (currentCase) { currentCase.redFlags = flags.map(f => f.id); await saveCases(); renderSidebar(); }
}

// ============================================
// PAGE: Attorney Monitor
// ============================================
function renderAttorney() {
  if (!currentCase && cases.length) currentCase = cases.find(c => c.att) || cases[cases.length - 1];
  if (!currentCase || !currentCase.att) return `<h1 class="page-title">👨‍⚖️ ${t('attorney')}</h1><div class="alert alert-info">${L('Add a case with attorney details first', 'पहले वकील के साथ मामला जोड़ें')}</div><button class="btn btn-primary" onclick="NS.showPage('mycase')">📋 ${L('Add Case', 'मामला जोड़ें')}</button>`;
  const a = currentCase.att;
  return `
    <h1 class="page-title">👨‍⚖️ ${t('attorney')}</h1>
    <p class="page-subtitle">${esc(currentCase.id)}</p>
    <div class="card"><h3 class="card-title">📋 ${L('Attorney Info', 'वकील जानकारी')}</h3>
      <div class="grid">
        <div><strong>${L('Name', 'नाम')}:</strong> ${esc(a.name || '—')}</div>
        <div><strong>${L('Enrollment', 'पंजीकरण')}:</strong> ${a.enroll ? esc(a.enroll) : '❌ ' + L('missing', 'नहीं')}</div>
        <div><strong>${L('Fee', 'फीस')}:</strong> ₹${esc(a.fee || 'N/A')}</div>
        <div><strong>${L('Payment', 'भुगतान')}:</strong> <span class="badge badge-${a.pay === 'full' ? 'success' : 'warning'}">${esc(a.pay)}</span></div>
      </div>
      <a class="btn btn-outline btn-sm mt-1" href="https://www.barcouncilofindia.org" target="_blank" rel="noopener">🔗 ${L('Verify on Bar Council', 'बार काउंसिल सत्यापित करें')}</a>
    </div>
    <div class="card"><h3 class="card-title">📝 ${L('Activity Log', 'गतिविधि लॉग')}</h3>
      <div class="form-group"><label>${L('What happened?', 'क्या हुआ?')}</label><textarea class="form-control" id="log_act"></textarea></div>
      <div class="form-group"><label>${L('Category', 'श्रेणी')}</label>
        <select class="form-control" id="log_cat">${[['communication', 'Communication', 'संचार'], ['filing', 'Filing', 'फाइलिंग'], ['hearing', 'Hearing', 'सुनवाई'], ['payment', 'Payment', 'भुगतान'], ['concern', 'Concern', 'चिंता']].map(([v, en, hi]) => `<option value="${v}">${L(en, hi)}</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="NS.addLog()">➕ ${L('Add Log', 'जोड़ें')}</button>
      <div id="logsList" class="mt-2"></div>
    </div>`;
}
function renderLogs() {
  const el = $('logsList'); if (!el) return;
  const logs = currentCase?.logs || [];
  if (!logs.length) { el.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:1rem">${L('No logs yet', 'कोई लॉग नहीं')}</p>`; return; }
  el.innerHTML = logs.slice().reverse().map(l => `<div class="alert alert-info" style="font-size:.85rem"><strong>${esc(l.date)}</strong> <span class="badge badge-info">${esc(l.category)}</span><br>${esc(l.activity)}</div>`).join('');
}
async function addLog() {
  const act = $('log_act').value.trim();
  if (!act) { toast('⚠️ ' + L('Enter activity', 'गतिविधि दर्ज करें'), 'warning'); return; }
  currentCase.logs = currentCase.logs || [];
  currentCase.logs.push({ date: new Date().toLocaleDateString('en-IN'), activity: act, category: $('log_cat').value });
  await saveCases();
  $('log_act').value = '';
  toast('✅ ' + L('Log added', 'लॉग जोड़ा'));
  renderLogs();
}

// ============================================
// PAGE: AI Analyzer
// ============================================
function renderAnalyzer() {
  return `
    <h1 class="page-title">🔍 ${t('analyzer')}</h1>
    <p class="page-subtitle">${L('Paste a court notice — get a plain-language explanation instantly, on your device', 'नोटिस पेस्ट करें — तुरंत सरल भाषा में समझें')}</p>
    <div class="card">
      <div class="tabs"><div class="tab active" onclick="NS.switchAn('text', this)">⌨️ ${L('Text', 'टेक्स्ट')}</div><div class="tab" onclick="NS.switchAn('file', this)">📤 ${L('File', 'फाइल')}</div></div>
      <div id="an-text">
        <div class="form-group"><label>${L('Notice Text', 'नोटिस पाठ')}</label><textarea class="form-control" id="noticeTxt" style="min-height:130px" placeholder="${L('Paste the court notice / legal document text here', 'यहाँ नोटिस का पाठ पेस्ट करें')}"></textarea></div>
        <button class="btn btn-primary" onclick="NS.analyze()">🔍 ${L('Analyze', 'विश्लेषण')}</button>
      </div>
      <div id="an-file" style="display:none">
        <div class="upload-zone" onclick="document.getElementById('fileIn').click()"><div class="upload-icon">📁</div><p>${L('Upload .txt for full analysis (PDF/image: metadata only)', '.txt अपलोड करें')}</p><input type="file" id="fileIn" hidden accept=".pdf,.jpg,.png,.txt"></div>
      </div>
      <div id="analysisRes" class="mt-2" style="display:none"></div>
    </div>`;
}
function afterAnalyzerRender() {
  $('fileIn')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.type === 'text/plain' || f.name.endsWith('.txt')) {
      const r = new FileReader();
      r.onload = ev => { switchAn('text', document.querySelector('#mainContent .tab')); $('noticeTxt').value = ev.target.result; runAnalyze(); };
      r.readAsText(f);
    } else {
      const res = $('analysisRes');
      res.innerHTML = `<div class="result-box"><h4>📋 ${L('File received', 'फाइल प्राप्त')}</h4><p>${esc(f.name)} — ${(f.size / 1024).toFixed(1)} KB (${esc(f.type || 'unknown')})</p><div class="alert alert-info">${L('For full analysis, copy the text and paste it in the Text tab.', 'पूर्ण विश्लेषण के लिए टेक्स्ट कॉपी करके पेस्ट करें।')}</div></div>`;
      res.style.display = 'block';
    }
  });
}
function runAnalyze() {
  const txt = $('noticeTxt').value.trim();
  if (!txt) { toast('⚠️ ' + L('Enter some text', 'कुछ टेक्स्ट दर्ज करें'), 'warning'); return; }
  const a = analyzeNotice(txt);
  const res = $('analysisRes');
  res.innerHTML = `<div class="result-box">
    <h4>📋 ${L('Analysis Result', 'विश्लेषण परिणाम')}</h4>
    <div class="grid mt-1">
      <div><strong>${L('Language', 'भाषा')}:</strong> ${esc(a.lang)}</div>
      <div><strong>${L('Category', 'श्रेणी')}:</strong> <span class="badge badge-info">${esc(a.category)}</span></div>
      <div><strong>${L('Urgency', 'आपातकाल')}:</strong> <span class="badge badge-${a.urgency === 'high' ? 'danger' : 'success'}">${esc(a.urgency)}</span></div>
    </div>
    ${a.dates.length ? `<p class="mt-1"><strong>${L('Dates found', 'तारीखें')}:</strong> ${a.dates.map(esc).join(', ')}</p>` : ''}
    ${a.amounts.length ? `<p><strong>${L('Amounts', 'राशि')}:</strong> ${a.amounts.map(esc).join(', ')}</p>` : ''}
    <h5 style="margin-top:.6rem">${L('In simple language', 'सरल भाषा में')}:</h5>
    <div class="alert alert-${a.urgency === 'high' ? 'danger' : 'info'}">${esc(a.explanation)}</div>
    <h5>${L('Recommendations', 'सुझाव')}:</h5>
    <ul>
      <li>📅 ${L('Add every date to your calendar', 'तारीखें कैलेंडर में डालें')}</li>
      <li>📁 ${L('Keep all documents ready', 'सभी दस्तावेज तैयार रखें')}</li>
      <li>⚖️ ${L('Consult a lawyer or free legal aid', 'वकील या मुफ्त सहायता से सलाह लें')}</li>
      ${a.urgency === 'high' ? `<li>🚨 <strong>${L('Time-sensitive — act now', 'समय-संवेदनशील — तुरंत कार्रवाई')}</strong></li>` : ''}
      <li>📞 ${L('Free help', 'मुफ्त सहायता')}: <strong>15100</strong> (NALSA)</li>
    </ul>
    <button class="btn btn-outline btn-sm mt-1" onclick="NS.speakText(${JSON.stringify(a.explanation)})">🔊 ${L('Read aloud', 'सुनें')}</button>
  </div>`;
  res.style.display = 'block';
}
function switchAn(tab, el) {
  document.querySelectorAll('#mainContent .tab').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
  $('an-text').style.display = tab === 'text' ? 'block' : 'none';
  $('an-file').style.display = tab === 'file' ? 'block' : 'none';
}

// ============================================
// PAGE: Drafts
// ============================================
function renderDrafts() {
  const types = [['appeal', 'Appeal'], ['bail', 'Bail Application'], ['fir', 'FIR Complaint'], ['rti', 'RTI Application'], ['consumer', 'Consumer Complaint'], ['collector', 'Collector Request'], ['legalnotice', 'Legal Notice'], ['affidavit', 'Affidavit']];
  return `
    <h1 class="page-title">✍️ ${t('drafts')}</h1>
    <p class="page-subtitle">${L('Generate a ready-to-print legal draft in seconds', 'सेकंडों में प्रिंट-तैयार मसौदा बनाएं')}</p>
    <div class="grid">${types.map(([v, label]) => `<div class="feature-card" onclick="NS.openDraft('${v}','${label}')"><div class="feature-icon">📜</div><div class="feature-title">${esc(label)}</div><div class="feature-desc">${L('Generate', 'बनाएं')}</div></div>`).join('')}</div>
    <div id="draftForm" class="card mt-1" style="display:none"></div>`;
}
function openDraft(type, title) {
  const F = $('draftForm');
  F.innerHTML = `<h3 class="card-title">📜 ${esc(title)}</h3>
    ${currentState ? `<div class="alert alert-info"><strong>📍 ${esc(STATES_UTS[currentState].name)}</strong></div>` : ''}
    <div class="form-group"><label>${L('Your Name', 'आपका नाम')}*</label><input class="form-control" id="d_n"></div>
    <div class="form-group"><label>${L('Address', 'पता')}*</label><textarea class="form-control" id="d_a"></textarea></div>
    <div class="form-group"><label>${L('Mobile', 'मोबाइल')}</label><input class="form-control" id="d_p"></div>
    <div class="form-group"><label>${L('Subject', 'विषय')}</label><input class="form-control" id="d_s"></div>
    <div class="form-group"><label>${L('Details / Facts', 'विवरण')}*</label><textarea class="form-control" id="d_d" rows="3"></textarea></div>
    <div class="form-group"><label>${L('Relief Sought', 'राहत')}</label><textarea class="form-control" id="d_r" rows="2"></textarea></div>
    <button class="btn btn-primary" onclick="NS.genDraft('${type}','${esc(title)}')">✨ ${L('Generate', 'बनाएं')}</button>
    <div id="draftOut" class="mt-1" style="display:none"></div>`;
  F.style.display = 'block';
  F.scrollIntoView({ behavior: 'smooth' });
}
let lastDraft = '';
function genDraft(type, title) {
  const g = id => $(id).value.trim();
  const n = g('d_n'), a = g('d_a'), p = g('d_p'), s = g('d_s'), d = g('d_d'), r = g('d_r');
  if (!n || !d) { toast('⚠️ ' + L('Fill name & details', 'नाम व विवरण भरें'), 'warning'); return; }
  const place = currentState ? STATES_UTS[currentState].name : 'India';
  const date = new Date().toLocaleDateString('en-IN');
  lastDraft = `To,\nThe Hon'ble Court / Concerned Authority\n${place}\n\nDate: ${date}\n\nSubject: ${s || title}\n\nRespected Sir / Madam,\n\nI, ${n}, resident of ${a || '[address]'}, most respectfully submit as under:\n\n1. ${d}\n\n${r ? '2. ' + r + '\n\n' : ''}PRAYER:\nIt is therefore most humbly prayed that this Hon'ble Court / Authority may kindly be pleased to grant the relief sought above and pass any other order deemed fit in the interest of justice.\n\nYours faithfully,\n\n(${n})\n${p ? 'Mobile: ' + p : ''}\n\n--- Generated by NyayaSahayak. Review with a legal professional before filing. ---`;
  $('draftOut').innerHTML = `<div class="result-box"><h4>📋 ${L('Your Draft', 'आपका मसौदा')}</h4><pre class="draft">${esc(lastDraft)}</pre>
    <div class="btn-group mt-1">
      <button class="btn btn-success" onclick="NS.copyDraft()">📋 ${L('Copy', 'कॉपी')}</button>
      <button class="btn btn-primary" onclick="NS.printDraft()">🖨️ ${L('Print', 'प्रिंट')}</button>
      <button class="btn btn-outline" onclick="NS.downloadDraft()">💾 ${L('Download', 'डाउनलोड')}</button>
    </div>
    <div class="alert alert-warning mt-1" style="font-size:.82rem">⚖️ ${L('This is a template, not legal advice. Have it reviewed before filing.', 'यह एक टेम्पलेट है, कानूनी सलाह नहीं। दाखिल करने से पहले समीक्षा कराएं।')}</div></div>`;
  $('draftOut').style.display = 'block';
}

// ============================================
// PAGE: Nearby
// ============================================
function renderNearby() {
  return `
    <h1 class="page-title">📍 ${t('nearby')}</h1>
    <p class="page-subtitle">${L('Courts, police, and free legal aid near you', 'आपके पास अदालत, पुलिस, मुफ्त सहायता')}</p>
    <div class="card"><h3 class="card-title">📍 ${L('Location', 'स्थान')}</h3>
      <button class="btn btn-primary" onclick="NS.findLocation()">📍 ${L('Use My Location', 'मेरा स्थान')}</button>
      ${currentDistrict ? `<p class="mt-1">${L('District', 'जिला')}: <strong>${esc(currentDistrict)}</strong></p>` : ''}
      <div id="locationStatus" class="mt-1"></div>
    </div>
    <div id="nearbyResults"></div>`;
}
function renderNearbyList(coords) {
  const dist = currentDistrict || (currentState ? STATES_UTS[currentState].name : 'Your Area');
  const items = nearbyServices(dist, currentLang);
  $('nearbyResults').innerHTML = `<div class="card"><h3 class="card-title">📍 ${L('In / near', 'आस-पास')} ${esc(dist)}</h3>
    ${items.map(p => `<div class="nearby-card"><div><h4>${p.icon} ${esc(p.name)}</h4><p style="font-size:.85rem;color:var(--text-light)">📍 ${esc(p.address)}</p>${p.phone ? `<p style="font-size:.85rem">📞 <a href="tel:${p.phone}">${esc(p.phone)}</a></p>` : ''}</div><div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end"><span class="nearby-distance">${esc(p.dist)}</span>${p.map ? `<a class="btn btn-outline btn-sm" href="${mapLink(p.map, coords)}" target="_blank" rel="noopener">🗺️ ${L('Map', 'नक्शा')}</a>` : ''}</div></div>`).join('')}</div>`;
}
async function findLocation() {
  const s = $('locationStatus');
  s.innerHTML = `<div class="alert alert-info">📡 ${L('Locating…', 'खोज रहे हैं…')}</div>`;
  try {
    const coords = await getCoords();
    s.innerHTML = `<div class="alert alert-success">✅ ${L('Location found', 'स्थान मिला')}: ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}</div>`;
    renderNearbyList(coords);
  } catch (e) {
    s.innerHTML = `<div class="alert alert-warning">${L('GPS unavailable — showing your district list', 'GPS नहीं मिला — जिला सूची')}</div>`;
    renderNearbyList(null);
  }
}

// ============================================
// PAGE: Rights
// ============================================
function renderRights() {
  const items = [['arrest', '👮', L('Arrest', 'गिरफ्तारी')], ['women', '👩', L('Women', 'महिला')], ['consumer', '🛒', L('Consumer', 'उपभोक्ता')], ['tenant', '🔑', L('Tenant', 'किरायेदार')], ['worker', '💼', L('Worker', 'श्रमिक')], ['fir', '🚔', 'FIR']];
  return `<h1 class="page-title">📚 ${t('rights')}</h1>
    <p class="page-subtitle">${L('Know what the law guarantees you', 'जानें कानून आपको क्या देता है')}</p>
    <div class="grid">${items.map(([k, ic, lbl]) => `<div class="feature-card" onclick="NS.showRights('${k}')"><div class="feature-icon">${ic}</div><div class="feature-title">${lbl}</div></div>`).join('')}</div>
    <div id="rightsInfo" class="card mt-1" style="display:none"></div>`;
}
function rightsData(type) {
  const data = {
    arrest: { title: L('Arrest Rights', 'गिरफ्तारी अधिकार'), c: `<ol><li>${L('Right to know the reason for arrest', 'गिरफ्तारी का कारण जानने का अधिकार')}</li><li>${L('Right to inform a family member/friend', 'परिवार को सूचित करने का अधिकार')}</li><li>${L('Right to a free lawyer', 'मुफ्त वकील का अधिकार')}</li><li>${L('Must be produced before magistrate within 24 hrs', '24 घंटे में मजिस्ट्रेट के समक्ष')}</li><li>${L('Right to remain silent', 'चुप रहने का अधिकार')}</li></ol><p>📞 <strong>15100</strong></p>` },
    women: { title: L('Women Rights', 'महिला अधिकार'), c: `<ul><li>${L('Equal pay for equal work', 'समान काम, समान वेतन')}</li><li>${L('Protection from domestic violence (PWDVA 2005)', 'घरेलू हिंसा से सुरक्षा')}</li><li>${L('Maternity leave & benefits', 'मातृत्व अवकाश')}</li><li>${L('No arrest of a woman after sunset without special order', 'सूर्यास्त के बाद विशेष आदेश के बिना गिरफ्तारी नहीं')}</li></ul><p>📞 <strong>181</strong></p>` },
    consumer: { title: L('Consumer Rights', 'उपभोक्ता अधिकार'), c: `<ol><li>${L('Right to Safety', 'सुरक्षा')}</li><li>${L('Right to Information', 'जानकारी')}</li><li>${L('Right to Choose', 'चुनाव')}</li><li>${L('Right to be Heard', 'सुनवाई')}</li><li>${L('Right to Redressal', 'निवारण')}</li><li>${L('Right to Consumer Education', 'शिक्षा')}</li></ol><p>🌐 <a href="https://edaakhil.nic.in" target="_blank" rel="noopener">edaakhil.nic.in</a></p>` },
    tenant: { title: L('Tenant Rights', 'किरायेदार अधिकार'), c: `<ul><li>${L('Right to peaceful possession', 'शांतिपूर्ण निवास')}</li><li>${L('No eviction without due legal process', 'कानूनी प्रक्रिया के बिना बेदखली नहीं')}</li><li>${L('Right to a rent receipt', 'किराया रसीद')}</li><li>${L('Essential services cannot be cut off', 'आवश्यक सेवाएं नहीं काटी जा सकतीं')}</li></ul>` },
    worker: { title: L('Worker Rights', 'श्रमिक अधिकार'), c: `<ul><li>${L('Minimum wages', 'न्यूनतम मजदूरी')}</li><li>${L('Max 8-hour work day / overtime pay', '8 घंटे कार्य / ओवरटाइम')}</li><li>${L('PF & ESI benefits', 'PF व ESI')}</li><li>${L('Safe workplace & gratuity', 'सुरक्षित कार्यस्थल')}</li></ul>` },
    fir: { title: 'FIR ' + L('Rights', 'अधिकार'), c: `<ul><li>${L('Right to register an FIR for a cognizable offence', 'संज्ञेय अपराध के लिए FIR का अधिकार')}</li><li>${L('Zero FIR — file at any police station', 'जीरो FIR — किसी भी थाने में')}</li><li>${L('Free copy of the FIR', 'FIR की मुफ्त प्रति')}</li></ul><p>${L('If police refuse, approach the Magistrate under Section 156(3) CrPC.', 'यदि पुलिस मना करे तो धारा 156(3) के तहत मजिस्ट्रेट से संपर्क करें।')}</p>` }
  };
  return data[type];
}
function showRights(type) {
  const d = rightsData(type);
  const el = $('rightsInfo');
  el.innerHTML = `<h3 class="card-title">${d.title}</h3><div style="line-height:1.7">${d.c}</div><button class="btn btn-outline btn-sm mt-1" onclick="NS.speakText(document.getElementById('rightsInfo').innerText)">🔊 ${L('Read aloud', 'सुनें')}</button>`;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// PAGE: Helpline
// ============================================
function renderHelpline() {
  const st = currentState ? STATES_UTS[currentState] : null;
  return `<h1 class="page-title">📞 ${t('helpline')}</h1>
    <div class="card"><h3 class="card-title">🆘 ${L('Emergency', 'आपातकालीन')}</h3>
      <div class="grid">${[['Police / पुलिस', '100'], ['Women / महिला', '1091 / 181'], ['Child / बाल', '1098'], ['Cyber / साइबर', '1930'], ['NALSA', '15100'], ['Senior / वरिष्ठ', '14567'], ['Ambulance', '108'], ['Emergency', '112']].map(([l, n]) => `<div><strong>${esc(l)}</strong><p class="emergency-num">${esc(n)}</p></div>`).join('')}</div>
    </div>
    ${st ? `<div class="card"><h3 class="card-title">📍 ${esc(st.name)}</h3>
      <p><strong>${L('High Court', 'उच्च न्यायालय')}:</strong> ${esc(st.hc)}</p>
      <p><strong>${L('Land Law', 'भूमि कानून')}:</strong> ${esc(st.landLaw)}</p>
      ${st.portal ? `<p><strong>${L('Land Records Portal', 'भूमि रिकॉर्ड पोर्टल')}:</strong> <a href="${st.portal}" target="_blank" rel="noopener">${st.portal}</a></p>` : ''}
      <p><strong>${L('Bar Council', 'बार काउंसिल')}:</strong> <a href="https://www.barcouncilofindia.org" target="_blank" rel="noopener">barcouncilofindia.org</a></p>
    </div>` : `<div class="alert alert-warning">${L('Select your state for local details', 'स्थानीय विवरण के लिए राज्य चुनें')}</div>`}
    <div class="card"><h3 class="card-title">🔊 ${L('Voice Help', 'आवाज सहायता')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('Listen to the key helpline numbers read aloud.', 'मुख्य हेल्पलाइन नंबर सुनें।')}</p>
      <button class="btn btn-primary" onclick="NS.speakHelplines()">🎤 ${L('Listen', 'सुनें')}</button>
    </div>`;
}

// ============================================
// Post-render hooks (attach listeners after innerHTML swap)
// ============================================
const _origRender = renderCurrentPage;
function renderWithHooks() {
  _origRender();
  if (currentPage === 'mycase') { afterMyCaseRender(); }
  if (currentPage === 'analyzer') { afterAnalyzerRender(); }
  if (currentPage === 'attorney') { renderLogs(); }
}
// override
renderCurrentPage = renderWithHooks;

// ============================================
// Handlers exposed to inline onclick via window.NS
// ============================================
const handlers = {
  showPage,
  selectPath,
  analyzeRF,
  addLog,
  switchAn,
  analyze: runAnalyze,
  openDraft,
  genDraft,
  findLocation,
  showRights,
  speakHelplines: () => speakHelplines(currentLang),
  speakText: (txt) => { if (!ttsSupported()) { toast('⚠️ ' + L('Voice not supported', 'आवाज समर्थित नहीं'), 'warning'); return; } speak(txt, currentLang); toast('🔊 ' + L('Playing…', 'चल रहा है…')); },
  removeDoc: (i) => { currentDocs.splice(i, 1); renderDocList(); },
  switchCase: (tab, el) => {
    document.querySelectorAll('#mainContent .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    $('ct-new').style.display = tab === 'new' ? 'block' : 'none';
    $('ct-list').style.display = tab === 'list' ? 'block' : 'none';
    if (tab === 'list') renderCaseList();
  },
  openCase: (id) => { currentCase = cases.find(c => c.id === id); toast('📂 ' + id); showPage('guide'); },
  deleteCase: async (id) => { if (!confirm(L('Delete this case?', 'मामला हटाएं?'))) return; cases = cases.filter(c => c.id !== id); if (currentCase?.id === id) currentCase = null; await saveCases(); renderCaseList(); renderSidebar(); },
  checkCNR: () => { const v = $('cnrIn').value; $('cnrResult').innerHTML = isValidCNR(v) ? `<div class="green-flag">✅ ${L('Valid CNR format. Look it up on the District Court portal above.', 'सही CNR प्रारूप। ऊपर पोर्टल पर खोजें।')}</div>` : `<div class="yellow-flag">⚠️ ${L('Not a valid 16-character CNR. Example: DLHC010001232024', 'मान्य CNR नहीं। उदाहरण: DLHC010001232024')}</div>`; },
  copyDraft: () => { navigator.clipboard?.writeText(lastDraft); toast('📋 ' + L('Copied', 'कॉपी किया')); },
  printDraft: () => { const w = window.open('', '', 'width=800,height=600'); w.document.write('<html><body style="padding:30px;font-family:Arial,sans-serif"><pre style="white-space:pre-wrap">' + esc(lastDraft) + '</pre><scr' + 'ipt>window.print()</scr' + 'ipt></body></html>'); w.document.close(); },
  downloadDraft: () => { const b = new Blob([lastDraft], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'nyayasahayak-draft.txt'; a.click(); toast('💾 ' + L('Downloaded', 'डाउनलोड')); }
};
