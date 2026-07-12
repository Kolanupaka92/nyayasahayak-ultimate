// ============================================
// app.js — NyayaSahayak main controller
// ES module. Imports data + feature modules and renders
// the single-page UI. All state lives on-device.
// UI content is authored in English, Hindi and Telugu via
// the L(en, hi, te) helper; nav labels come from I18N (12 langs).
// ============================================
import { STATES_UTS, RED_FLAGS_DB, I18N } from './districts-data.js';
import { analyzeNotice } from './ai-engine.js';
import { nearbyServices, mapLink, getCoords } from './geolocation.js';
import { lookupTargets, statusSummary, isValidCNR } from './ecourts-api.js';
import { ELIG_CATEGORIES, INCOME_CEILINGS, LIMITATION, GLOSSARY } from './legal-data.js';
import { speak, speakHelplines, isSupported as ttsSupported, hasVoiceFor, startDictation, stopDictation, sttSupported, isDictating } from './ivr.js';
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
// Trilingual inline helper: English / Hindi / Telugu (Telugu & Hindi fall back to English).
const L = (en, hi, te) => currentLang === 'te' ? (te ?? en) : currentLang === 'hi' ? (hi ?? en) : en;

// ---------- Pages config ----------
const PAGES = [
  { id: 'dashboard', icon: '🏠', key: 'home' },
  { id: 'mycase', icon: '📋', key: 'mycase' },
  { id: 'cases', icon: '🔎', key: 'cases' },
  { id: 'eligibility', icon: '🎟️', key: 'eligibility' },
  { id: 'guide', icon: '🛣️', key: 'guide' },
  { id: 'redflags', icon: '🚨', key: 'redflags' },
  { id: 'attorney', icon: '👨‍⚖️', key: 'attorney' },
  { id: 'analyzer', icon: '🔍', key: 'analyzer' },
  { id: 'drafts', icon: '✍️', key: 'drafts' },
  { id: 'glossary', icon: '📖', key: 'glossary' },
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
  // expose handlers used by inline onclick in generated markup
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
  toast('✓ ' + L('Language updated', 'भाषा अपडेट', 'భాష మార్చబడింది'));
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('nyayaTheme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

// ---------- Lock / PIN ----------
async function lockApp() {
  const pin = prompt(L('Enter 4-digit PIN to protect your case data:', 'डेटा सुरक्षित करने के लिए 4-अंकीय PIN:', 'మీ కేసు డేటాను రక్షించడానికి 4-అంకెల PIN నమోదు చేయండి:'));
  if (!pin || !/^\d{4}$/.test(pin)) { toast('⚠️ ' + L('PIN must be 4 digits', 'PIN 4 अंक का हो', 'PIN 4 అంకెలు ఉండాలి'), 'warning'); return; }
  const h = await hashPin(pin);
  if (pinHash && pinHash !== h) { toast('❌ ' + L('Wrong PIN', 'गलत PIN', 'తప్పు PIN'), 'error'); return; }
  pinHash = h; localStorage.setItem('nyayaPinHash', h);
  await unlockWithPin(pin);
  await saveCases(); // re-save encrypted
  toast('🔒 ' + L('Data secured & encrypted', 'डेटा एन्क्रिप्ट किया गया', 'డేటా ఎన్‌క్రిప్ట్ చేయబడింది'));
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
  stopDictation(); // end any voice input before the DOM is swapped
  const fns = { dashboard: renderDashboard, mycase: renderMyCase, cases: renderCaseStatus, eligibility: renderEligibility, guide: renderGuide, redflags: renderRedFlags, attorney: renderAttorney, analyzer: renderAnalyzer, drafts: renderDrafts, glossary: renderGlossary, nearby: renderNearby, rights: renderRights, helpline: renderHelpline };
  $('mainContent').innerHTML = `<div class="page">${(fns[currentPage] || renderDashboard)()}</div>`;
  if (currentPage === 'mycase') afterMyCaseRender();
  if (currentPage === 'analyzer') afterAnalyzerRender();
  if (currentPage === 'attorney') renderLogs();
  if (currentPage === 'cases') updateTriggerLabel();
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
  const update = () => { banner.classList.toggle('show', !navigator.onLine); };
  window.addEventListener('online', () => { update(); toast('🟢 ' + L('Back online', 'ऑनलाइन', 'ఆన్‌లైన్‌లో ఉన్నారు')); });
  window.addEventListener('offline', () => { update(); toast('📡 ' + L('Offline mode', 'ऑफलाइन मोड', 'ఆఫ్‌లైన్ మోడ్'), 'warning'); });
  update();
}

// ============================================
// PAGE: Dashboard
// ============================================
function renderDashboard() {
  const st = currentState ? STATES_UTS[currentState] : null;
  return `
    <h1 class="page-title">⚖️ ${L('Welcome to NyayaSahayak', 'न्यायसहायक में आपका स्वागत है', 'న్యాయసహాయక్‌కు స్వాగతం')}</h1>
    <p class="page-subtitle">${L('Free legal help for every citizen — private, offline, in your language', 'हर नागरिक के लिए मुफ्त कानूनी मदद — निजी, ऑफलाइन, आपकी भाषा में', 'ప్రతి పౌరుడికి ఉచిత న్యాయ సహాయం — గోప్యం, ఆఫ్‌లైన్, మీ భాషలో')}</p>
    ${st ? `<div class="alert alert-info"><strong>📍 ${esc(st.name)}</strong>${currentDistrict ? ` › ${esc(currentDistrict)}` : ''}<br>🏛️ ${esc(st.hc)} &nbsp;|&nbsp; 📜 ${esc(st.landLaw)}${st.portal ? `<br>🌐 <a href="${st.portal}" target="_blank" rel="noopener">${st.portal}</a>` : ''}</div>`
      : `<div class="alert alert-warning">⚠️ ${L('Please select your State (top-right) for local court & law info', 'ऊपर दाईं ओर अपना राज्य चुनें', 'స్థానిక కోర్టు & చట్ట సమాచారం కోసం మీ రాష్ట్రాన్ని (కుడి పైన) ఎంచుకోండి')}</div>`}
    ${cases.length
      ? `<div class="card"><h3 class="card-title">📂 ${L('Your Cases', 'आपके मामले', 'మీ కేసులు')} (${cases.length})</h3>
          ${cases.slice().reverse().map(c => `<div class="case-item">
            <div><strong>${esc(c.id)}</strong> — ${esc((c.type || '').toUpperCase())}${c.redFlags?.length ? ` <span class="badge badge-danger">🚨 ${c.redFlags.length}</span>` : ''}<br><small>${esc(c.name || '')} · ${esc(c.court || L('Court TBD', 'अदालत तय नहीं', 'కోర్టు నిర్ణయించలేదు'))} · ${new Date(c.created).toLocaleDateString('en-IN')}</small></div>
            <div class="btn-group"><button class="btn btn-primary btn-sm" onclick="NS.openCase('${c.id}')">${L('Open', 'खोलें', 'తెరవండి')}</button></div>
          </div>`).join('')}
          <button class="btn btn-outline btn-sm mt-1" onclick="NS.showPage('mycase')">➕ ${L('Add another case', 'नया मामला जोड़ें', 'మరో కేసు జోడించండి')}</button></div>`
      : `<div class="card"><h3 class="card-title">📂 ${L('Your Cases', 'आपके मामले', 'మీ కేసులు')}</h3>
          <p style="color:var(--text-light)">${L('No cases yet. Add your first case to track it, get a step-by-step guide, deadline reminders and fraud checks.', 'अभी कोई मामला नहीं। पहला मामला जोड़ें और मार्गदर्शन, रिमाइंडर व जाँच पाएं।', 'ఇంకా కేసులు లేవు. మీ మొదటి కేసును జోడించి మార్గదర్శిని, గడువు రిమైండర్‌లు & మోసం తనిఖీలు పొందండి.')}</p>
          <button class="btn btn-primary" onclick="NS.showPage('mycase')">📋 ${L('Add my case', 'मेरा मामला जोड़ें', 'నా కేసును జోడించండి')}</button></div>`}
    <div class="grid">
      ${PAGES.filter(p => p.id !== 'dashboard').map(p => `
        <div class="feature-card" onclick="NS.showPage('${p.id}')">
          <div class="feature-icon">${p.icon}</div>
          <div class="feature-title">${esc(t(p.key))}</div>
          <div class="feature-desc">${esc(featureDesc(p.id))}</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3 class="card-title">🆘 ${L('Emergency Helplines', 'आपातकालीन हेल्पलाइन', 'అత్యవసర హెల్ప్‌లైన్‌లు')}</h3>
      <div class="grid">
        ${emergencyNumbers().map(n => `<div><strong>${esc(n.label)}</strong><p><a class="emergency-num" href="tel:${n.num}">${n.num}</a></p></div>`).join('')}
      </div>
    </div>
    <div class="alert alert-success"><strong>🛡️ ${L('Private by design', 'सुरक्षित', 'డిజైన్ ద్వారా గోప్యం')}:</strong> ${L('All your data stays on this device. No servers, no tracking. Tap the lock icon to encrypt with a PIN.', 'सारा डेटा इसी डिवाइस पर रहता है। कोई सर्वर नहीं। PIN से एन्क्रिप्ट करें।', 'మీ డేటా అంతా ఈ పరికరంలోనే ఉంటుంది. సర్వర్‌లు లేవు, ట్రాకింగ్ లేదు. PINతో ఎన్‌క్రిప్ట్ చేయడానికి లాక్ చిహ్నాన్ని నొక్కండి.')}</div>`;
}
function featureDesc(id) {
  const d = {
    mycase: L('Upload & track your case', 'मामला अपलोड व ट्रैक करें', 'మీ కేసును అప్‌లోడ్ & ట్రాక్ చేయండి'),
    cases: L('Case status, deadlines & reminders', 'स्थिति, समय-सीमा व रिमाइंडर', 'స్థితి, గడువులు & రిమైండర్‌లు'),
    eligibility: L('Do you qualify for FREE legal aid?', 'क्या आप मुफ्त सहायता के पात्र हैं?', 'మీరు ఉచిత న్యాయ సహాయానికి అర్హులా?'),
    glossary: L('Legal words in simple language', 'सरल भाषा में कानूनी शब्द', 'సరళ భాషలో న్యాయ పదాలు'),
    guide: L('3 paths: DIY / Hybrid / Attorney', '3 रास्ते', '3 మార్గాలు: మీరే / మిశ్రమ / న్యాయవాది'),
    redflags: L('Detect attorney fraud early', 'वकील धोखाधड़ी पकड़ें', 'న్యాయవాది మోసాన్ని ముందుగా గుర్తించండి'),
    attorney: L('Monitor your lawyer', 'वकील की निगरानी', 'మీ న్యాయవాదిని పర్యవేక్షించండి'),
    analyzer: L('AI notice analysis', 'AI नोटिस विश्लेषण', 'AI నోటీసు విశ్లేషణ'),
    drafts: L('Auto-generate legal drafts', 'मसौदे बनाएं', 'న్యాయ ముసాయిదాలను రూపొందించండి'),
    nearby: L('Find help near you', 'पास की सहायता', 'మీ దగ్గర సహాయం కనుగొనండి'),
    rights: L('Know your legal rights', 'अपने अधिकार जानें', 'మీ న్యాయ హక్కులను తెలుసుకోండి'),
    helpline: L('Free legal aid contacts', 'मुफ्त सहायता संपर्क', 'ఉచిత న్యాయ సహాయ సంప్రదింపులు')
  };
  return d[id] || '';
}
function emergencyNumbers() {
  return [
    { label: L('Police', 'पुलिस', 'పోలీస్'), num: '100' },
    { label: 'NALSA', num: '15100' },
    { label: L('Women', 'महिला', 'మహిళలు'), num: '181' },
    { label: L('Child', 'बाल', 'పిల్లలు'), num: '1098' },
    { label: L('Cyber Crime', 'साइबर', 'సైబర్ నేరం'), num: '1930' },
    { label: L('Emergency', 'आपातकाल', 'అత్యవసరం'), num: '112' }
  ];
}

// ============================================
// PAGE: My Case
// ============================================
function renderMyCase() {
  return `
    <h1 class="page-title">📋 ${t('mycase')}</h1>
    <p class="page-subtitle">${L('Record your case securely on this device', 'अपना मामला सुरक्षित रूप से दर्ज करें', 'మీ కేసును ఈ పరికరంలో సురక్షితంగా నమోదు చేయండి')}</p>
    <div class="card">
      <div class="tabs">
        <div class="tab active" data-ct="new" onclick="NS.switchCase('new', this)">➕ ${L('New', 'नया', 'కొత్త')}</div>
        <div class="tab" data-ct="list" onclick="NS.switchCase('list', this)">📁 ${L('Saved', 'सहेजे', 'సేవ్ చేసినవి')} (${cases.length})</div>
      </div>
      <div id="ct-new">
        <div class="alert alert-info">🔒 ${L('Saved only on your device. Use the lock icon to add PIN encryption.', 'केवल आपके डिवाइस पर सहेजा जाता है।', 'మీ పరికరంలో మాత్రమే సేవ్ అవుతుంది. PIN ఎన్‌క్రిప్షన్ కోసం లాక్ చిహ్నాన్ని వాడండి.')}</div>
        <form id="caseForm">
          <div class="form-row">
            <div class="form-group"><label>${L('Your Name', 'आपका नाम', 'మీ పేరు')}*</label><input class="form-control" id="c_name" required></div>
            <div class="form-group"><label>${L('Mobile', 'मोबाइल', 'మొబైల్')}</label><input type="tel" class="form-control" id="c_phone"></div>
          </div>
          <div class="form-group"><label>${L('Case Type', 'मामले का प्रकार', 'కేసు రకం')}*</label>
            <select class="form-control" id="c_type" required>
              <option value="">${L('Select', 'चुनें', 'ఎంచుకోండి')}</option>
              ${caseTypes().map(([v, en, hi, te]) => `<option value="${v}">${L(en, hi, te)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>${L('Description', 'विवरण', 'వివరణ')}*</label><textarea class="form-control" id="c_desc" required placeholder="${L('What happened, when, where, who', 'क्या, कब, कहाँ, कौन', 'ఏమి జరిగింది, ఎప్పుడు, ఎక్కడ, ఎవరు')}"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>${L('Court', 'अदालत', 'కోర్టు')}</label><input class="form-control" id="c_court" placeholder="${currentState ? esc(STATES_UTS[currentState].hc) : 'District Court'}"></div>
            <div class="form-group"><label>${L('Case / CNR Number', 'केस / CNR नंबर', 'కేసు / CNR నంబర్')}</label><input class="form-control" id="c_num"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${L('Has Attorney?', 'वकील है?', 'న్యాయవాది ఉన్నారా?')}</label>
              <select class="form-control" id="c_hasAtt" onchange="document.getElementById('attFields').style.display=this.value==='yes'?'block':'none'">
                <option value="no">${L('No', 'नहीं', 'లేదు')}</option><option value="yes">${L('Yes', 'हाँ', 'అవును')}</option>
              </select></div>
            <div class="form-group"><label>${L('Budget', 'बजट', 'బడ్జెట్')} (₹)</label><input type="number" class="form-control" id="c_budget"></div>
          </div>
          <div id="attFields" style="display:none">
            <div class="form-row">
              <div class="form-group"><label>${L('Attorney Name', 'वकील का नाम', 'న్యాయవాది పేరు')}</label><input class="form-control" id="c_attName"></div>
              <div class="form-group"><label>${L('Enrollment No.', 'पंजीकरण संख्या', 'నమోదు నంబర్')}</label><input class="form-control" id="c_attEnroll"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>${L('Fee', 'फीस', 'ఫీజు')} (₹)</label><input type="number" class="form-control" id="c_attFee"></div>
              <div class="form-group"><label>${L('Payment', 'भुगतान', 'చెల్లింపు')}</label>
                <select class="form-control" id="c_attPay">
                  <option value="unpaid">${L('Unpaid', 'अभी नहीं', 'చెల్లించలేదు')}</option><option value="partial">${L('Partial', 'आंशिक', 'పాక్షికం')}</option><option value="full">${L('Full', 'पूरा', 'పూర్తి')}</option>
                </select></div>
            </div>
          </div>
          <div class="form-group"><label>${L('Attach Documents (names stored locally)', 'दस्तावेज संलग्न करें', 'పత్రాలను జతచేయండి (పేర్లు స్థానికంగా నిల్వ)')}</label>
            <div class="upload-zone" onclick="document.getElementById('docInput').click()">
              <div class="upload-icon">📁</div><p>${L('Click to select files', 'फाइल चुनने के लिए क्लिक करें', 'ఫైల్‌లను ఎంచుకోవడానికి క్లిక్ చేయండి')}</p>
              <input type="file" id="docInput" hidden multiple>
            </div>
            <div id="docList"></div></div>
          <button type="submit" class="btn btn-primary">💾 ${L('Save Case', 'मामला सहेजें', 'కేసును సేవ్ చేయండి')}</button>
        </form>
      </div>
      <div id="ct-list" style="display:none"><div id="caseListContainer"></div></div>
    </div>
    <div id="caseAnalysisResult"></div>`;
}
function caseTypes() {
  return [['civil', 'Civil', 'सिविल', 'సివిల్'], ['criminal', 'Criminal', 'आपराधिक', 'క్రిమినల్'], ['family', 'Family', 'पारिवारिक', 'కుటుంబ'], ['property', 'Property', 'संपत्ति', 'ఆస్తి'], ['consumer', 'Consumer', 'उपभोक्ता', 'వినియోగదారు'], ['labor', 'Labor', 'श्रम', 'కార్మిక'], ['revenue', 'Revenue', 'राजस्व', 'రెవెన్యూ'], ['cheque', 'Cheque Bounce', 'चेक बाउंस', 'చెక్ బౌన్స్'], ['rental', 'Rental', 'किराया', 'అద్దె']];
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
  toast('✅ ' + L('Case saved', 'मामला सहेजा', 'కేసు సేవ్ చేయబడింది') + ': ' + c.id);
  const res = $('caseAnalysisResult');
  res.innerHTML = renderCaseAnalysis(c);
  res.scrollIntoView({ behavior: 'smooth' });
  renderSidebar();
}
function renderCaseAnalysis(c) {
  const issues = [];
  if (c.hasAtt === 'yes' && c.att) {
    if (!c.att.enroll) issues.push({ sev: 'critical', txt: L('No Bar Council enrollment number', 'पंजीकरण संख्या नहीं', 'బార్ కౌన్సిల్ నమోదు నంబర్ లేదు'), action: L('Verify on barcouncilofindia.org', 'बार काउंसिल में सत्यापित करें', 'barcouncilofindia.orgలో ధృవీకరించండి') });
    if (c.att.pay === 'full') issues.push({ sev: 'high', txt: L('Full fee paid — monitor work closely', 'पूरा भुगतान - काम की निगरानी करें', 'పూర్తి ఫీజు చెల్లించారు — పనిని నిశితంగా గమనించండి'), action: L('Log every update in Attorney Monitor', 'हर अपडेट लॉग करें', 'ప్రతి అప్‌డేట్‌ను న్యాయవాది మానిటర్‌లో నమోదు చేయండి') });
  }
  return `<div class="card">
    <h3 class="card-title">🔍 ${L('Quick Analysis', 'त्वरित विश्लेषण', 'త్వరిత విశ్లేషణ')} — ${c.id}</h3>
    <div class="grid">
      <div><strong>${L('Type', 'प्रकार', 'రకం')}:</strong> ${esc(c.type)}</div>
      <div><strong>${L('Court', 'अदालत', 'కోర్టు')}:</strong> ${esc(c.court || 'TBD')}</div>
      <div><strong>${L('Documents', 'दस्तावेज', 'పత్రాలు')}:</strong> ${c.docs.length}</div>
      <div><strong>${L('Attorney', 'वकील', 'న్యాయవాది')}:</strong> ${c.hasAtt === 'yes' ? esc(c.att.name || 'Yes') : '❌'}</div>
    </div>
    ${issues.length ? issues.map(i => `<div class="${i.sev === 'critical' ? 'red-flag' : 'yellow-flag'}"><strong>${i.txt}</strong><br>✅ ${i.action}</div>`).join('') : `<div class="green-flag">✅ ${L('No immediate issues detected', 'कोई तत्काल समस्या नहीं', 'తక్షణ సమస్యలు ఏవీ కనుగొనబడలేదు')}</div>`}
    <div class="btn-group mt-1">
      <button class="btn btn-primary" onclick="NS.showPage('guide')">🛣️ ${L('See Step Guide', 'मार्गदर्शन देखें', 'దశల మార్గదర్శిని చూడండి')}</button>
      ${c.hasAtt === 'yes' ? `<button class="btn btn-danger" onclick="NS.showPage('redflags')">🚨 ${L('Check Attorney', 'वकील जाँच', 'న్యాయవాదిని తనిఖీ చేయండి')}</button>` : ''}
    </div></div>`;
}
function renderCaseList() {
  const el = $('caseListContainer'); if (!el) return;
  if (!cases.length) { el.innerHTML = `<p style="text-align:center;color:var(--text-light);padding:1rem">${L('No saved cases yet', 'कोई मामला नहीं', 'ఇంకా సేవ్ చేసిన కేసులు లేవు')}</p>`; return; }
  el.innerHTML = cases.map(x => `<div class="case-item">
    <div><strong>${esc(x.id)}</strong> — ${esc((x.type || '').toUpperCase())}<br><small>${esc(x.name)} | ${esc(x.court || 'Court TBD')}</small></div>
    <div class="btn-group">
      <button class="btn btn-primary btn-sm" onclick="NS.openCase('${x.id}')">📂 ${L('Open', 'खोलें', 'తెరవండి')}</button>
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
    <p class="page-subtitle">${L('Track your case on official government portals', 'सरकारी पोर्टल पर अपना मामला ट्रैक करें', 'అధికారిక ప్రభుత్వ పోర్టల్‌లలో మీ కేసును ట్రాక్ చేయండి')}</p>
    ${currentCase ? `<div class="card"><h3 class="card-title">📋 ${esc(currentCase.id)}</h3>${statusTable(statusSummary(currentCase))}</div>` : `<div class="alert alert-info">${L('Add a case in "My Case" to save its details, or use the official links below directly.', 'विवरण सहेजने के लिए मामला जोड़ें, या नीचे दिए लिंक उपयोग करें।', '"నా కేసు"లో కేసు జోడించి వివరాలు సేవ్ చేయండి, లేదా క్రింది అధికారిక లింక్‌లను నేరుగా ఉపయోగించండి.')}</div>`}
    <div class="card">
      <h3 class="card-title">🏛️ ${L('Official Case Status Portals', 'आधिकारिक पोर्टल', 'అధికారిక కేసు స్థితి పోర్టల్‌లు')}</h3>
      <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.6rem">${L('These open the government eCourts sites in a new tab. Search by CNR number, case number or party name.', 'ये सरकारी eCourts साइट खोलते हैं। CNR, केस नंबर या नाम से खोजें।', 'ఇవి ప్రభుత్వ eCourts సైట్‌లను కొత్త ట్యాబ్‌లో తెరుస్తాయి. CNR నంబర్, కేసు నంబర్ లేదా పార్టీ పేరుతో వెతకండి.')}</p>
      ${targets.map(x => `<div class="nearby-card"><div><h4>${esc(x.label)}</h4><p style="font-size:.82rem;color:var(--text-light)">${esc(x.note)}</p></div><a class="btn btn-primary btn-sm" href="${x.url}" target="_blank" rel="noopener">${L('Open', 'खोलें', 'తెరవండి')} →</a></div>`).join('')}
    </div>
    <div class="card">
      <h3 class="card-title">🔢 ${L('CNR Number Checker', 'CNR जाँच', 'CNR నంబర్ తనిఖీ')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('CNR is a unique 16-character case ID (e.g. DLHC01-000123-2024).', 'CNR एक अद्वितीय 16-अक्षर केस ID है।', 'CNR అనేది ప్రత్యేకమైన 16-అక్షరాల కేసు ID (ఉదా. DLHC01-000123-2024).')}</p>
      <div class="form-row">
        <div class="form-group"><input class="form-control" id="cnrIn" placeholder="XXXX00000000000"></div>
        <div class="form-group"><button class="btn btn-primary" onclick="NS.checkCNR()">${L('Validate', 'जाँचें', 'ధృవీకరించండి')}</button></div>
      </div>
      <div id="cnrResult"></div>
    </div>
    <div class="card">
      <h3 class="card-title">⏰ ${L('Deadline & Limitation Calculator', 'समय-सीमा व परिसीमा कैलकुलेटर', 'గడువు & పరిమితి కాలిక్యులేటర్')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('Missing a legal deadline can end your case. Find your dates and set a reminder.', 'समय-सीमा चूकना आपका मामला समाप्त कर सकता है। अपनी तारीखें जानें और रिमाइंडर लगाएं।', 'గడువు తప్పితే మీ కేసు ముగియవచ్చు. మీ తేదీలను తెలుసుకుని రిమైండర్ పెట్టుకోండి.')}</p>
      <div class="form-row">
        <div class="form-group"><label>${L('Case type', 'मामले का प्रकार', 'కేసు రకం')}</label>
          <select class="form-control" id="dl_type" onchange="NS.updateTriggerLabel()">${caseTypes().filter(ct => LIMITATION[ct[0]]).map(([v, en, hi, te]) => `<option value="${v}"${currentCase?.type === v ? ' selected' : ''}>${L(en, hi, te)}</option>`).join('')}</select></div>
        <div class="form-group"><label id="dl_triggerLabel">${L('Start date', 'प्रारंभ तिथि', 'ప్రారంభ తేదీ')}</label><input type="date" class="form-control" id="dl_date"></div>
      </div>
      <button class="btn btn-primary" onclick="NS.calcDeadlines()">⏱️ ${L('Calculate', 'गणना करें', 'లెక్కించండి')}</button>
      <div id="dl_result" class="mt-1"></div>
    </div>
    <div class="card">
      <h3 class="card-title">🔔 ${L('Hearing Reminder', 'सुनवाई रिमाइंडर', 'విచారణ రిమైండర్')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('Save your next hearing to your phone calendar with a 1-day-before alert.', 'अगली सुनवाई को 1 दिन पहले अलर्ट के साथ कैलेंडर में सहेजें।', 'మీ తదుపరి విచారణను 1 రోజు ముందు అలర్ట్‌తో ఫోన్ క్యాలెండర్‌లో సేవ్ చేయండి.')}</p>
      <div class="form-row">
        <div class="form-group"><label>${L('Hearing date', 'सुनवाई तिथि', 'విచారణ తేదీ')}</label><input type="date" class="form-control" id="hr_date"></div>
        <div class="form-group"><label>${L('Note (court / purpose)', 'नोट (अदालत/उद्देश्य)', 'నోట్ (కోర్టు / ఉద్దేశం)')}</label><input class="form-control" id="hr_note" placeholder="${currentCase ? esc(currentCase.id) : L('e.g. next hearing', 'जैसे अगली सुनवाई', 'ఉదా. తదుపరి విచారణ')}"></div>
      </div>
      <button class="btn btn-success" onclick="NS.addHearingReminder()">📅 ${L('Add to Calendar', 'कैलेंडर में जोड़ें', 'క్యాలెండర్‌కు జోడించండి')}</button>
    </div>`;
}
function statusTable(s) {
  const rows = [[L('CNR', 'CNR', 'CNR'), s.cnr], [L('Court', 'अदालत', 'కోర్టు'), s.court], [L('Case No.', 'केस नंबर', 'కేసు నం.'), s.caseNumber], [L('Next Date', 'अगली तारीख', 'తదుపరి తేదీ'), s.nextDate], [L('Stage', 'चरण', 'దశ'), s.stage]];
  return `<div class="grid">${rows.map(([k, v]) => `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('')}</div>`;
}

// ---- Deadline calculator + calendar reminders (.ics) ----
function fmtDate(d) { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function addDays(iso, days) { const dt = new Date(iso + 'T00:00:00'); dt.setDate(dt.getDate() + days); return dt; }
function daysFromToday(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 86400000); }
function updateTriggerLabel() {
  const sel = $('dl_type'), lab = $('dl_triggerLabel'); if (!sel || !lab) return;
  const rule = LIMITATION[sel.value];
  if (rule) lab.textContent = L(rule.trigger.en, rule.trigger.hi, rule.trigger.te);
}
let lastDeadlines = [];
function calcDeadlines() {
  const type = $('dl_type').value, iso = $('dl_date').value;
  if (!iso) { toast('⚠️ ' + L('Pick a start date', 'प्रारंभ तिथि चुनें', 'ప్రారంభ తేదీని ఎంచుకోండి'), 'warning'); return; }
  const rule = LIMITATION[type]; lastDeadlines = [];
  const rows = rule.steps.map(s => {
    if (s.offset == null) return `<div class="yellow-flag">⚠️ ${esc(L(s.en, s.hi, s.te))}</div>`;
    const dt = addDays(iso, s.offset), dd = daysFromToday(dt);
    const badge = dd < 0
      ? `<span class="badge badge-danger">${L('overdue', 'बीत गया', 'గడువు దాటింది')}</span>`
      : `<span class="badge badge-${dd <= 7 ? 'warning' : 'success'}">${dd} ${L('days left', 'दिन शेष', 'రోజులు మిగిలి')}</span>`;
    const idx = lastDeadlines.push({ title: L(s.en, s.hi, s.te), iso: dt.toISOString().slice(0, 10) }) - 1;
    return `<div class="case-item"><div><strong>${esc(L(s.en, s.hi, s.te))}</strong><br>📅 <strong>${fmtDate(dt)}</strong> ${badge}</div><button class="btn btn-outline btn-sm" onclick="NS.icsDeadline(${idx})">🔔 ${L('Remind', 'रिमाइंडर', 'రిమైండ్')}</button></div>`;
  }).join('');
  $('dl_result').innerHTML = rows + `<div class="alert alert-warning mt-1" style="font-size:.8rem">⚖️ ${L('Indicative timelines only. Confirm exact limitation with a lawyer or the court.', 'केवल संकेतात्मक। सटीक परिसीमा वकील/अदालत से पुष्टि करें।', 'సూచనార్థం మాత్రమే. ఖచ్చితమైన పరిమితిని న్యాయవాది/కోర్టుతో నిర్ధారించుకోండి.')}</div>`;
}
function buildICS(title, iso) {
  const d = iso.replace(/-/g, ''), end = addDays(iso, 1).toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const e = t => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NyayaSahayak//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:ns-' + Date.now() + '@nyayasahayak', 'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end, 'SUMMARY:' + e(title),
    'DESCRIPTION:' + e('Reminder from NyayaSahayak — verify with your lawyer/court.'),
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + e(title), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function downloadICS(title, iso) {
  const b = new Blob([buildICS(title, iso)], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'nyayasahayak-reminder.ics'; a.click();
  toast('📅 ' + L('Calendar file downloaded', 'कैलेंडर फाइल डाउनलोड', 'క్యాలెండర్ ఫైల్ డౌన్‌లోడ్ అయింది'));
}

// ============================================
// PAGE: Free Legal Aid Eligibility (Section 12)
// ============================================
function renderEligibility() {
  const ceiling = INCOME_CEILINGS[currentState] || INCOME_CEILINGS._DEFAULT;
  return `
    <h1 class="page-title">🎟️ ${t('eligibility')}</h1>
    <p class="page-subtitle">${L('You may be entitled to a FREE government lawyer. Check in 30 seconds.', 'आप मुफ्त सरकारी वकील के हकदार हो सकते हैं। 30 सेकंड में जाँचें।', 'మీరు ఉచిత ప్రభుత్వ న్యాయవాదికి అర్హులు కావచ్చు. 30 సెకన్లలో తనిఖీ చేయండి.')}</p>
    <div class="alert alert-info">📜 ${L('Under Article 39A & the Legal Services Authorities Act 1987, the State provides a free lawyer to eligible citizens — at NALSA, State, High Court, District & Taluka levels.', 'अनुच्छेद 39A व विधिक सेवा प्राधिकरण अधिनियम 1987 के तहत सरकार पात्र नागरिकों को मुफ्त वकील देती है।', 'ఆర్టికల్ 39A & లీగల్ సర్వీసెస్ అథారిటీస్ చట్టం 1987 ప్రకారం, ప్రభుత్వం అర్హులైన పౌరులకు ఉచిత న్యాయవాదిని అందిస్తుంది.')}</div>
    <div class="card">
      <h3 class="card-title">✅ ${L('Do any of these apply to you?', 'क्या इनमें से कोई आप पर लागू है?', 'వీటిలో ఏవైనా మీకు వర్తిస్తాయా?')}</h3>
      ${ELIG_CATEGORIES.map(c => `<label style="display:flex;gap:.6rem;align-items:flex-start;padding:.4rem 0;cursor:pointer"><input type="checkbox" id="elig_${c.id}" style="margin-top:.25rem"><span>${esc(L(c.en, c.hi, c.te))}</span></label>`).join('')}
      <div class="form-group mt-1"><label>${L('Your annual family income (₹) — optional', 'आपकी वार्षिक पारिवारिक आय (₹) — वैकल्पिक', 'మీ వార్షిక కుటుంబ ఆదాయం (₹) — ఐచ్ఛికం')}</label><input type="number" class="form-control" id="elig_income" placeholder="e.g. 250000"></div>
      <p style="font-size:.8rem;color:var(--text-light)">${L('Income ceiling for', 'आय सीमा', 'ఆదాయ పరిమితి')} ${currentState ? esc(STATES_UTS[currentState].name) : L('most states', 'अधिकांश राज्य', 'చాలా రాష్ట్రాలు')}: <strong>₹${ceiling.toLocaleString('en-IN')}/${L('year', 'वर्ष', 'సంవత్సరం')}</strong> (${L('₹5,00,000 for Supreme Court cases', 'सर्वोच्च न्यायालय हेतु ₹5,00,000', 'సుప్రీంకోర్టు కేసులకు ₹5,00,000')})</p>
      <button class="btn btn-primary" onclick="NS.checkEligibility()">🎟️ ${L('Check my eligibility', 'मेरी पात्रता जाँचें', 'నా అర్హతను తనిఖీ చేయండి')}</button>
      <div id="elig_result" class="mt-2"></div>
    </div>`;
}
function checkEligibility() {
  const ceiling = INCOME_CEILINGS[currentState] || INCOME_CEILINGS._DEFAULT;
  const cats = ELIG_CATEGORIES.filter(c => $('elig_' + c.id)?.checked);
  const income = parseInt($('elig_income').value || '', 10);
  const incomeOk = !isNaN(income) && income > 0 && income <= ceiling;
  const eligible = cats.length > 0 || incomeOk;
  const reasons = cats.map(c => `<li>${esc(L(c.en, c.hi, c.te))}</li>`).join('') + (incomeOk ? `<li>${L('Annual income ₹', 'वार्षिक आय ₹', 'వార్షిక ఆదాయం ₹')}${income.toLocaleString('en-IN')} ≤ ₹${ceiling.toLocaleString('en-IN')}</li>` : '');
  const howTo = `<h4 style="margin-top:.6rem">${L('How to claim it (free)', 'कैसे प्राप्त करें (मुफ्त)', 'ఎలా పొందాలి (ఉచితం)')}:</h4>
    <ol>
      <li>${L('Call NALSA helpline', 'नालसा हेल्पलाइन पर कॉल करें', 'నల్సా హెల్ప్‌లైన్‌కు కాల్ చేయండి')}: <strong><a href="tel:15100">15100</a></strong></li>
      <li>${L('Visit your nearest District Legal Services Authority (DLSA)', 'निकटतम DLSA जाएं', 'మీ సమీప DLSAను సందర్శించండి')} — <a href="#" onclick="NS.showPage('nearby');return false">${L('find on Nearby', 'पास में खोजें', 'సమీపంలో కనుగొనండి')}</a></li>
      <li>${L('Or apply on the NALSA / Nyaya Bandhu app', 'या नालसा / न्याय बंधु ऐप पर आवेदन करें', 'లేదా నల్సా / న్యాయ బంధు యాప్‌లో దరఖాస్తు చేయండి')} — <a href="https://nalsa.gov.in/lsams/" target="_blank" rel="noopener">nalsa.gov.in</a></li>
    </ol>`;
  $('elig_result').innerHTML = eligible
    ? `<div class="green-flag"><strong>✅ ${L('Good news — you are likely eligible for FREE legal aid.', 'खुशखबरी — आप संभवतः मुफ्त कानूनी सहायता के पात्र हैं।', 'శుభవార్త — మీరు ఉచిత న్యాయ సహాయానికి అర్హులే.')}</strong><ul style="margin-top:.4rem">${reasons}</ul></div>${howTo}`
    : `<div class="yellow-flag"><strong>⚠️ ${L('You may not auto-qualify under these categories — but confirm at your DLSA, as limits vary and officers decide case by case.', 'आप इन श्रेणियों में स्वतः पात्र नहीं हो सकते — पर DLSA में पुष्टि करें, सीमाएं बदलती हैं।', 'ఈ వర్గాల కింద మీరు స్వయంచాలకంగా అర్హులు కాకపోవచ్చు — కానీ DLSAలో నిర్ధారించుకోండి, పరిమితులు మారుతుంటాయి.')}</strong></div><div class="alert alert-info" style="font-size:.85rem">${L('Everyone can still use free Lok Adalat settlements and the Tele-Law advice service.', 'सभी मुफ्त लोक अदालत और टेली-लॉ सेवा का उपयोग कर सकते हैं।', 'ప్రతి ఒక్కరూ ఉచిత లోక్ అదాలత్ మరియు టెలి-లా సలహా సేవను ఉపయోగించవచ్చు.')}</div>${howTo}`;
  $('elig_result').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// PAGE: Legal Glossary (jargon buster)
// ============================================
function renderGlossary() {
  return `
    <h1 class="page-title">📖 ${t('glossary')}</h1>
    <p class="page-subtitle">${L('Court words explained in simple language', 'अदालती शब्द सरल भाषा में', 'కోర్టు పదాలు సరళ భాషలో వివరించబడ్డాయి')}</p>
    <div class="card"><input class="form-control" id="glossarySearch" oninput="NS.filterGlossary()" placeholder="🔍 ${L('Search a legal word…', 'कानूनी शब्द खोजें…', 'న్యాయ పదాన్ని వెతకండి…')}"></div>
    <div id="glossaryList">${glossaryHTML('')}</div>`;
}
function glossaryHTML(q) {
  const ql = (q || '').toLowerCase();
  const items = GLOSSARY.filter(g => !ql
    || g.term.toLowerCase().includes(ql)
    || (g.hi || '').toLowerCase().includes(ql)
    || (g.te || '').toLowerCase().includes(ql)
    || (g.def.en || '').toLowerCase().includes(ql));
  if (!items.length) return `<p style="color:var(--text-light);padding:1rem;text-align:center">${L('No matching word found', 'कोई शब्द नहीं मिला', 'పదం కనబడలేదు')}</p>`;
  return items.map(g => `<div class="card" style="margin-bottom:.6rem;padding:1rem">
    <strong>${esc(g.term)}</strong>${currentLang !== 'en' && g[currentLang] ? ` <span style="color:var(--text-light)">· ${esc(g[currentLang])}</span>` : ''}
    <p style="margin-top:.35rem;font-size:.9rem;line-height:1.55">${esc(g.def[currentLang] || g.def.en)}</p>
  </div>`).join('');
}
function filterGlossary() {
  const q = $('glossarySearch')?.value || '';
  $('glossaryList').innerHTML = glossaryHTML(q);
}

// ============================================
// PAGE: Guide
// ============================================
function renderGuide() {
  if (!currentCase && cases.length) currentCase = cases[cases.length - 1];
  if (!currentCase) return `<h1 class="page-title">🛣️ ${t('guide')}</h1><div class="alert alert-warning">${L('Add a case first to get a personalized guide', 'व्यक्तिगत मार्गदर्शन के लिए पहले मामला जोड़ें', 'వ్యక్తిగత మార్గదర్శిని పొందడానికి ముందుగా కేసు జోడించండి')}</div><button class="btn btn-primary" onclick="NS.showPage('mycase')">📋 ${L('Add Case', 'मामला जोड़ें', 'కేసు జోడించండి')}</button>`;
  return `
    <h1 class="page-title">🛣️ ${t('guide')}</h1>
    <p class="page-subtitle">${L('Choose how you want to handle', 'अपना रास्ता चुनें', 'మీరు ఎలా వ్యవహరించాలనుకుంటున్నారో ఎంచుకోండి')} — ${esc(currentCase.id)}</p>
    <div class="card"><h3 class="card-title">📋 ${esc(currentCase.id)}</h3><p>${L('Type', 'प्रकार', 'రకం')}: <strong>${esc(currentCase.type)}</strong> | ${L('Court', 'अदालत', 'కోర్టు')}: <strong>${esc(currentCase.court || 'TBD')}</strong></p></div>
    <div class="grid">
      <div class="path-card" onclick="NS.selectPath('diy')"><h4>🛠️ DIY</h4><p>${L('Handle yourself', 'स्वयं करें', 'మీరే చేయండి')}</p><div class="path-meta"><span>💰 ₹0-5K</span><span>⏰ 30-90 ${L('days', 'दिन', 'రోజులు')}</span></div></div>
      <div class="path-card" onclick="NS.selectPath('hybrid')"><h4>🤝 Hybrid</h4><p>${L('Consult + self-file', 'परामर्श + स्वयं', 'సలహా + మీరే దాఖలు')}</p><div class="path-meta"><span>💰 ₹5K-25K</span><span>⏰ 30-60 ${L('days', 'दिन', 'రోజులు')}</span></div></div>
      <div class="path-card" onclick="NS.selectPath('full')"><h4>👨‍⚖️ Full Attorney</h4><p>${L('Lawyer does all', 'पूरा वकील', 'న్యాయవాది అంతా చేస్తారు')}</p><div class="path-meta"><span>💰 ₹25K+</span><span>⏰ 60-180 ${L('days', 'दिन', 'రోజులు')}</span></div></div>
    </div>
    <div id="pathContent" class="mt-2"></div>`;
}
function pathSteps(path) {
  const s = {
    diy: [['Gather Documents', 'दस्तावेज इकट्ठा करें', 'పత్రాలు సేకరించండి', 'All papers in one place', 'सभी कागजात एक जगह', 'అన్ని కాగితాలు ఒకచోట', '1-2 days'], ['Research Online', 'ऑनलाइन शोध', 'ఆన్‌లైన్‌లో పరిశోధించండి', 'Check laws & precedents', 'कानून देखें', 'చట్టాలు & పూర్వ తీర్పులు చూడండి', '2-3 days'], ['Prepare Draft', 'मसौदा तैयार करें', 'ముసాయిదా సిద్ధం చేయండి', 'Use our Drafts tool', 'ड्राफ्ट टूल उपयोग करें', 'మా ముసాయిదా సాధనం వాడండి', '1 day'], ['File the Case', 'फाइल करें', 'కేసు దాఖలు చేయండి', 'Online or at court', 'ऑनलाइन या कोर्ट', 'ఆన్‌లైన్ లేదా కోర్టులో', '1 day'], ['Attend Hearings', 'सुनवाई', 'విచారణలకు హాజరవ్వండి', 'Attend all dates', 'सभी तारीखों पर जाएं', 'అన్ని తేదీలకు హాజరవ్వండి', '']],
    hybrid: [['Attorney Consultation', 'वकील परामर्श', 'న్యాయవాది సలహా', 'One-time strategy meeting', 'रणनीति बैठक', 'ఒకసారి వ్యూహ సమావేశం', '1 day'], ['Self Documents', 'स्वयं दस्तावेज', 'మీరే పత్రాలు', 'Forms & copies', 'फॉर्म, फोटोकॉपी', 'ఫారాలు & కాపీలు', '3-5 days'], ['Attorney Review', 'वकील समीक्षा', 'న్యాయవాది సమీక్ష', 'Get draft checked', 'मसौदे की जाँच', 'ముసాయిదాను తనిఖీ చేయించండి', '1-2 days'], ['File', 'फाइल', 'దాఖలు', 'Online portal', 'ऑनलाइन पोर्टल', 'ఆన్‌లైన్ పోర్టల్', '1 day'], ['Hearing', 'सुनवाई', 'విచారణ', 'With attorney', 'वकील के साथ', 'న్యాయవాదితో', '']],
    full: [['Choose Attorney', 'वकील चुनें', 'న్యాయవాదిని ఎంచుకోండి', 'Verify Bar Council ID', 'बार काउंसिल सत्यापित', 'బార్ కౌన్సిల్ ID ధృవీకరించండి', '3-7 days'], ['Written Fee Agreement', 'फीस समझौता', 'లిఖిత ఫీజు ఒప్పందం', 'Get it in writing', 'लिखित', 'లిఖితపూర్వకంగా తీసుకోండి', '1 day'], ['Hand Over Docs', 'दस्तावेज सौंपें', 'పత్రాలు అప్పగించండి', 'Keep photocopies!', 'फोटोकॉपी रखें', 'ఫోటోకాపీలు ఉంచుకోండి!', '1 day'], ['Attorney Files', 'वकील फाइल करे', 'న్యాయవాది దాఖలు చేస్తారు', 'Track progress weekly', 'साप्ताहिक ट्रैक', 'ప్రతి వారం పురోగతిని ట్రాక్ చేయండి', '7-15 days'], ['Hearing', 'सुनवाई', 'విచారణ', 'You attend too', 'आप भी जाएं', 'మీరు కూడా హాజరవ్వండి', '']]
  };
  return s[path];
}
function selectPath(path) {
  const steps = pathSteps(path);
  $('pathContent').innerHTML = `
    <div class="card"><h3 class="card-title">📍 ${L('Path', 'रास्ता', 'మార్గం')}: ${path.toUpperCase()}</h3>
      <div class="stepper">${steps.map((s, i) => `<div class="step${i === 0 ? ' current' : ''}"><div class="step-title">${i + 1}. ${L(s[0], s[1], s[2])}</div><div class="step-content">${L(s[3], s[4], s[5])}</div>${s[6] ? `<div style="font-size:.78rem;color:var(--text-light);margin-top:.2rem">⏱️ ${s[6]}</div>` : ''}</div>`).join('')}</div>
      <div class="alert alert-info mt-1"><strong>💡 ${L('Tips', 'टिप्स', 'చిట్కాలు')}:</strong><ul><li>${L('Screenshot every step', 'हर कदम का स्क्रीनशॉट', 'ప్రతి దశ స్క్రీన్‌షాట్ తీసుకోండి')}</li><li>${L('Add all dates to your calendar', 'तारीखें कैलेंडर में डालें', 'అన్ని తేదీలను మీ క్యాలెండర్‌కు జోడించండి')}</li><li>${L('Keep original documents safe', 'मूल दस्तावेज सुरक्षित रखें', 'అసలు పత్రాలను సురక్షితంగా ఉంచండి')}</li></ul></div>
    </div>
    <div class="card"><h3 class="card-title">📋 ${L('Document Checklist', 'दस्तावेज चेकलिस्ट', 'పత్రాల చెక్‌లిస్ట్')}</h3><ul>${docChecklist().map(d => `<li>☐ ${esc(d)}</li>`).join('')}</ul></div>`;
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
    <p class="page-subtitle">${L('Spot attorney fraud before it costs you', 'नुकसान से पहले वकील धोखाधड़ी पकड़ें', 'నష్టం జరగకముందే న్యాయవాది మోసాన్ని గుర్తించండి')}</p>
    <div class="alert alert-danger"><strong>⚠️ ${L('IMPORTANT', 'महत्वपूर्ण', 'ముఖ్యమైనది')}:</strong> ${L('Act immediately on any critical red flag', 'किसी भी गंभीर रेड फ्लैग पर तुरंत कार्रवाई', 'ఏదైనా క్రిటికల్ రెడ్ ఫ్లాగ్‌పై వెంటనే చర్య తీసుకోండి')}</div>
    <div class="card">
      <h3 class="card-title">🔍 ${L('Quick Self-Check', 'त्वरित जाँच', 'త్వరిత స్వీయ-తనిఖీ')}</h3>
      <div class="form-row">
        <div class="form-group"><label>${L('Gave Bar Council number?', 'बार काउंसिल नंबर दिया?', 'బార్ కౌన్సిల్ నంబర్ ఇచ్చారా?')}</label><select class="form-control" id="rf1"><option value="no">${L('No', 'नहीं', 'లేదు')}</option><option value="yes">${L('Yes', 'हाँ', 'అవును')}</option></select></div>
        <div class="form-group"><label>${L('Written agreement?', 'लिखित समझौता?', 'లిఖిత ఒప్పందం?')}</label><select class="form-control" id="rf2"><option value="no">${L('No', 'नहीं', 'లేదు')}</option><option value="yes">${L('Yes', 'हाँ', 'అవును')}</option></select></div>
        <div class="form-group"><label>${L('Payment', 'भुगतान', 'చెల్లింపు')}</label><select class="form-control" id="rf3"><option value="unpaid">${L('Unpaid', 'नहीं', 'చెల్లించలేదు')}</option><option value="partial">${L('Partial', 'आंशिक', 'పాక్షికం')}</option><option value="full">${L('Full', 'पूरा', 'పూర్తి')}</option></select></div>
        <div class="form-group"><label>${L('Work progress', 'कार्य प्रगति', 'పని పురోగతి')}</label><select class="form-control" id="rf4"><option value="nothing">${L('Nothing', 'कुछ नहीं', 'ఏమీ లేదు')}</option><option value="little">${L('Little', 'कम', 'కొంచెం')}</option><option value="good">${L('Good', 'अच्छा', 'బాగుంది')}</option></select></div>
        <div class="form-group"><label>${L('Days since hired', 'कितने दिन हुए', 'నియమించి ఎన్ని రోజులు')}</label><input type="number" class="form-control" id="rf5" placeholder="30"></div>
        <div class="form-group"><label>${L('Guaranteed 100% win?', 'जीत की गारंटी?', '100% గెలుపు గ్యారంటీ?')}</label><select class="form-control" id="rf6"><option value="no">${L('No', 'नहीं', 'లేదు')}</option><option value="yes">${L('Yes', 'हाँ', 'అవును')}</option></select></div>
      </div>
      <button class="btn btn-danger" onclick="NS.analyzeRF()">🚨 ${L('Analyze', 'विश्लेषण', 'విశ్లేషించండి')}</button>
      <div id="rfResult" class="mt-2"></div>
    </div>
    <div class="card"><h3 class="card-title">📚 ${L('All Red Flags', 'सभी रेड फ्लैग्स', 'అన్ని రెడ్ ఫ్లాగ్‌లు')} (${RED_FLAGS_DB.length})</h3>
      <details><summary style="cursor:pointer;font-weight:500">${L('View all warning signs', 'सभी देखें', 'అన్ని హెచ్చరిక సంకేతాలను చూడండి')}</summary>
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
  if (!flags.length) { res.innerHTML = `<div class="green-flag">✅ ${L('No major red flags detected', 'कोई बड़ा रेड फ्लैग नहीं', 'పెద్ద రెడ్ ఫ్లాగ్‌లు ఏవీ కనుగొనబడలేదు')}</div>`; return; }
  res.innerHTML = `<h4>🚨 ${flags.length} ${L('red flags found', 'रेड फ्लैग मिले', 'రెడ్ ఫ్లాగ్‌లు కనుగొనబడ్డాయి')}</h4>${flags.map(f => `<div class="red-flag"><div class="red-flag-title">${esc(f.title[currentLang] || f.title.en)}</div><div class="red-flag-desc">${esc(f.desc[currentLang] || f.desc.en)}</div><div class="red-flag-action">✅ ${esc(f.action[currentLang] || f.action.en)}</div></div>`).join('')}`;
  if (currentCase) { currentCase.redFlags = flags.map(f => f.id); await saveCases(); renderSidebar(); }
}

// ============================================
// PAGE: Attorney Monitor
// ============================================
function renderAttorney() {
  if (!currentCase && cases.length) currentCase = cases.find(c => c.att) || cases[cases.length - 1];
  if (!currentCase || !currentCase.att) return `<h1 class="page-title">👨‍⚖️ ${t('attorney')}</h1><div class="alert alert-info">${L('Add a case with attorney details first', 'पहले वकील के साथ मामला जोड़ें', 'ముందుగా న్యాయవాది వివరాలతో కేసు జోడించండి')}</div><button class="btn btn-primary" onclick="NS.showPage('mycase')">📋 ${L('Add Case', 'मामला जोड़ें', 'కేసు జోడించండి')}</button>`;
  const a = currentCase.att;
  return `
    <h1 class="page-title">👨‍⚖️ ${t('attorney')}</h1>
    <p class="page-subtitle">${esc(currentCase.id)}</p>
    <div class="card"><h3 class="card-title">📋 ${L('Attorney Info', 'वकील जानकारी', 'న్యాయవాది సమాచారం')}</h3>
      <div class="grid">
        <div><strong>${L('Name', 'नाम', 'పేరు')}:</strong> ${esc(a.name || '—')}</div>
        <div><strong>${L('Enrollment', 'पंजीकरण', 'నమోదు')}:</strong> ${a.enroll ? esc(a.enroll) : '❌ ' + L('missing', 'नहीं', 'లేదు')}</div>
        <div><strong>${L('Fee', 'फीस', 'ఫీజు')}:</strong> ₹${esc(a.fee || 'N/A')}</div>
        <div><strong>${L('Payment', 'भुगतान', 'చెల్లింపు')}:</strong> <span class="badge badge-${a.pay === 'full' ? 'success' : 'warning'}">${esc(a.pay)}</span></div>
      </div>
      <a class="btn btn-outline btn-sm mt-1" href="https://www.barcouncilofindia.org" target="_blank" rel="noopener">🔗 ${L('Verify on Bar Council', 'बार काउंसिल सत्यापित करें', 'బార్ కౌన్సిల్‌లో ధృవీకరించండి')}</a>
    </div>
    <div class="card"><h3 class="card-title">📝 ${L('Activity Log', 'गतिविधि लॉग', 'కార్యకలాప లాగ్')}</h3>
      <div class="form-group"><label>${L('What happened?', 'क्या हुआ?', 'ఏమి జరిగింది?')}</label><textarea class="form-control" id="log_act"></textarea></div>
      <div class="form-group"><label>${L('Category', 'श्रेणी', 'వర్గం')}</label>
        <select class="form-control" id="log_cat">${[['communication', 'Communication', 'संचार', 'సంభాషణ'], ['filing', 'Filing', 'फाइलिंग', 'దాఖలు'], ['hearing', 'Hearing', 'सुनवाई', 'విచారణ'], ['payment', 'Payment', 'भुगतान', 'చెల్లింపు'], ['concern', 'Concern', 'चिंता', 'ఆందోళన']].map(([v, en, hi, te]) => `<option value="${v}">${L(en, hi, te)}</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="NS.addLog()">➕ ${L('Add Log', 'जोड़ें', 'లాగ్ జోడించండి')}</button>
      <div id="logsList" class="mt-2"></div>
    </div>`;
}
function renderLogs() {
  const el = $('logsList'); if (!el) return;
  const logs = currentCase?.logs || [];
  if (!logs.length) { el.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:1rem">${L('No logs yet', 'कोई लॉग नहीं', 'ఇంకా లాగ్‌లు లేవు')}</p>`; return; }
  el.innerHTML = logs.slice().reverse().map(l => `<div class="alert alert-info" style="font-size:.85rem"><strong>${esc(l.date)}</strong> <span class="badge badge-info">${esc(l.category)}</span><br>${esc(l.activity)}</div>`).join('');
}
async function addLog() {
  const act = $('log_act').value.trim();
  if (!act) { toast('⚠️ ' + L('Enter activity', 'गतिविधि दर्ज करें', 'కార్యకలాపాన్ని నమోదు చేయండి'), 'warning'); return; }
  currentCase.logs = currentCase.logs || [];
  currentCase.logs.push({ date: new Date().toLocaleDateString('en-IN'), activity: act, category: $('log_cat').value });
  await saveCases();
  $('log_act').value = '';
  toast('✅ ' + L('Log added', 'लॉग जोड़ा', 'లాగ్ జోడించబడింది'));
  renderLogs();
}

// ============================================
// PAGE: AI Analyzer
// ============================================
function renderAnalyzer() {
  return `
    <h1 class="page-title">🔍 ${t('analyzer')}</h1>
    <p class="page-subtitle">${L('Paste a court notice — get a plain-language explanation instantly, on your device', 'नोटिस पेस्ट करें — तुरंत सरल भाषा में समझें', 'కోర్టు నోటీసును పేస్ట్ చేయండి — మీ పరికరంలో వెంటనే సరళ భాషలో వివరణ పొందండి')}</p>
    <div class="card">
      <div class="tabs"><div class="tab active" onclick="NS.switchAn('text', this)">⌨️ ${L('Text', 'टेक्स्ट', 'టెక్స్ట్')}</div><div class="tab" onclick="NS.switchAn('file', this)">📤 ${L('File', 'फाइल', 'ఫైల్')}</div></div>
      <div id="an-text">
        <div class="form-group"><label>${L('Notice Text', 'नोटिस पाठ', 'నోటీసు వచనం')}</label><textarea class="form-control" id="noticeTxt" style="min-height:130px" placeholder="${L('Type, paste, or tap the mic and speak', 'टाइप करें, पेस्ट करें, या माइक दबाकर बोलें', 'టైప్ చేయండి, పేస్ట్ చేయండి, లేదా మైక్ నొక్కి మాట్లాడండి')}"></textarea></div>
        <div class="btn-group">
          <button class="btn btn-primary" onclick="NS.analyze()">🔍 ${L('Analyze', 'विश्लेषण', 'విశ్లేషించండి')}</button>
          <button class="btn btn-outline" id="micBtn" onclick="NS.toggleDictation()">🎤 ${L('Speak', 'बोलें', 'మాట్లాడండి')}</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('noticeTxt').value='';document.getElementById('micStatus').textContent='';">🧹 ${L('Clear', 'साफ करें', 'తుడిచివేయి')}</button>
        </div>
        <p id="micStatus" style="font-size:.82rem;color:var(--text-light);margin-top:.5rem;min-height:1.1em"></p>
        <p style="font-size:.78rem;color:var(--text-light)">🎙️ ${L('Speaking language follows the app language (top-right). Currently', 'बोलने की भाषा ऐप भाषा (ऊपर दाएँ) के अनुसार है। अभी', 'మాట్లాడే భాష యాప్ భాష (కుడి పైన) ప్రకారం ఉంటుంది. ప్రస్తుతం')}: <strong>${speakLangLabel()}</strong></p>
      </div>
      <div id="an-file" style="display:none">
        <div class="upload-zone" onclick="document.getElementById('fileIn').click()"><div class="upload-icon">📁</div><p>${L('Upload .txt for full analysis (PDF/image: metadata only)', '.txt अपलोड करें', 'పూర్తి విశ్లేషణ కోసం .txt అప్‌లోడ్ చేయండి (PDF/చిత్రం: మెటాడేటా మాత్రమే)')}</p><input type="file" id="fileIn" hidden accept=".pdf,.jpg,.png,.txt"></div>
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
      res.innerHTML = `<div class="result-box"><h4>📋 ${L('File received', 'फाइल प्राप्त', 'ఫైల్ అందింది')}</h4><p>${esc(f.name)} — ${(f.size / 1024).toFixed(1)} KB (${esc(f.type || 'unknown')})</p><div class="alert alert-info">${L('For full analysis, copy the text and paste it in the Text tab.', 'पूर्ण विश्लेषण के लिए टेक्स्ट कॉपी करके पेस्ट करें।', 'పూర్తి విశ్లేషణ కోసం, వచనాన్ని కాపీ చేసి టెక్స్ట్ ట్యాబ్‌లో పేస్ట్ చేయండి.')}</div></div>`;
      res.style.display = 'block';
    }
  });
}
function runAnalyze() {
  const txt = $('noticeTxt').value.trim();
  if (!txt) { toast('⚠️ ' + L('Enter some text', 'कुछ टेक्स्ट दर्ज करें', 'కొంత వచనాన్ని నమోదు చేయండి'), 'warning'); return; }
  const a = analyzeNotice(txt, currentLang);
  const res = $('analysisRes');
  res.innerHTML = `<div class="result-box">
    <h4>📋 ${L('Analysis Result', 'विश्लेषण परिणाम', 'విశ్లేషణ ఫలితం')}</h4>
    <div class="grid mt-1">
      <div><strong>${L('Language', 'भाषा', 'భాష')}:</strong> ${esc(a.lang)}</div>
      <div><strong>${L('Category', 'श्रेणी', 'వర్గం')}:</strong> <span class="badge badge-info">${esc(a.category)}</span></div>
      <div><strong>${L('Urgency', 'आपातकाल', 'అత్యవసరత')}:</strong> <span class="badge badge-${a.urgency === 'high' ? 'danger' : 'success'}">${esc(a.urgency)}</span></div>
    </div>
    ${a.dates.length ? `<p class="mt-1"><strong>${L('Dates found', 'तारीखें', 'కనుగొన్న తేదీలు')}:</strong> ${a.dates.map(esc).join(', ')}</p>` : ''}
    ${a.amounts.length ? `<p><strong>${L('Amounts', 'राशि', 'మొత్తాలు')}:</strong> ${a.amounts.map(esc).join(', ')}</p>` : ''}
    <h5 style="margin-top:.6rem">${L('In simple language', 'सरल भाषा में', 'సరళ భాషలో')}:</h5>
    <div class="alert alert-${a.urgency === 'high' ? 'danger' : 'info'}" id="analyzerExplain">${esc(a.explanation)}</div>
    <h5>${L('Recommendations', 'सुझाव', 'సిఫార్సులు')}:</h5>
    <ul>
      <li>📅 ${L('Add every date to your calendar', 'तारीखें कैलेंडर में डालें', 'ప్రతి తేదీని మీ క్యాలెండర్‌కు జోడించండి')}</li>
      <li>📁 ${L('Keep all documents ready', 'सभी दस्तावेज तैयार रखें', 'అన్ని పత్రాలను సిద్ధంగా ఉంచండి')}</li>
      <li>⚖️ ${L('Consult a lawyer or free legal aid', 'वकील या मुफ्त सहायता से सलाह लें', 'న్యాయవాది లేదా ఉచిత న్యాయ సహాయాన్ని సంప్రదించండి')}</li>
      ${a.urgency === 'high' ? `<li>🚨 <strong>${L('Time-sensitive — act now', 'समय-संवेदनशील — तुरंत कार्रवाई', 'సమయం కీలకం — ఇప్పుడే చర్య తీసుకోండి')}</strong></li>` : ''}
      <li>📞 ${L('Free help', 'मुफ्त सहायता', 'ఉచిత సహాయం')}: <strong>15100</strong> (NALSA)</li>
    </ul>
    <button class="btn btn-outline btn-sm mt-1" onclick="NS.speakText(document.getElementById('analyzerExplain').innerText)">🔊 ${L('Read aloud', 'सुनें', 'బిగ్గరగా చదవండి')}</button>
  </div>`;
  res.style.display = 'block';
}
function switchAn(tab, el) {
  stopDictation();
  document.querySelectorAll('#mainContent .tab').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
  $('an-text').style.display = tab === 'text' ? 'block' : 'none';
  $('an-file').style.display = tab === 'file' ? 'block' : 'none';
}

// Human-readable label of the language dictation will listen in.
function speakLangLabel() {
  return { en: 'English', hi: 'हिन्दी (Hindi)', te: 'తెలుగు (Telugu)' }[currentLang] || 'English (en-IN)';
}

// Voice-input toggle for the analyzer textarea.
let dictateBase = '';
function toggleDictation() {
  const btn = $('micBtn'), status = $('micStatus'), ta = $('noticeTxt');
  if (!btn || !ta) return;
  if (isDictating()) { stopDictation(); return; }
  if (!sttSupported()) {
    toast('⚠️ ' + L('Voice input not supported in this browser', 'इस ब्राउज़र में आवाज इनपुट समर्थित नहीं', 'ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ మద్దతు లేదు'), 'warning');
    if (status) status.textContent = L('Tip: use Chrome on Android/desktop for voice.', 'सुझाव: आवाज के लिए Chrome उपयोग करें।', 'చిట్కా: వాయిస్ కోసం Chrome వాడండి.');
    return;
  }
  dictateBase = ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '';
  const started = startDictation(currentLang, {
    onStart: () => {
      btn.classList.add('mic-live'); btn.innerHTML = '⏹️ ' + L('Stop', 'रोकें', 'ఆపండి');
      if (status) status.textContent = '🔴 ' + L('Listening… speak now', 'सुन रहे हैं… अब बोलिए', 'వింటున్నాం… ఇప్పుడు మాట్లాడండి');
    },
    onInterim: t => { ta.value = dictateBase + t; },
    onFinal: t => { dictateBase = (dictateBase + t).replace(/\s+$/, '') + ' '; ta.value = dictateBase; },
    onEnd: () => {
      btn.classList.remove('mic-live'); btn.innerHTML = '🎤 ' + L('Speak', 'बोलें', 'మాట్లాడండి');
      if (status) status.textContent = ta.value.trim() ? '✅ ' + L('Captured. Tap Analyze or speak again.', 'मिल गया। विश्लेषण दबाएं या फिर बोलें।', 'లభించింది. విశ్లేషించు నొక్కండి లేదా మళ్ళీ మాట్లాడండి.') : '';
    },
    onError: err => {
      const map = {
        'not-allowed': L('Microphone permission denied', 'माइक्रोफोन अनुमति अस्वीकृत', 'మైక్రోఫోన్ అనుమతి నిరాకరించబడింది'),
        'no-speech': L('No speech detected — try again', 'कोई आवाज नहीं मिली — फिर कोशिश करें', 'మాట వినిపించలేదు — మళ్ళీ ప్రయత్నించండి'),
        'network': L('Network needed for voice recognition', 'आवाज पहचान के लिए नेटवर्क चाहिए', 'వాయిస్ గుర్తింపుకు నెట్‌వర్క్ అవసరం'),
        'audio-capture': L('No microphone found', 'माइक्रोफोन नहीं मिला', 'మైక్రోఫోన్ కనబడలేదు')
      };
      toast('⚠️ ' + (map[err] || err), 'warning');
    }
  });
  if (!started) toast('⚠️ ' + L('Could not start voice input', 'आवाज इनपुट शुरू नहीं हुआ', 'వాయిస్ ఇన్‌పుట్ ప్రారంభించలేకపోయాం'), 'warning');
}

// ============================================
// PAGE: Drafts
// ============================================
function renderDrafts() {
  const types = [['appeal', 'Appeal'], ['bail', 'Bail Application'], ['fir', 'FIR Complaint'], ['rti', 'RTI Application'], ['consumer', 'Consumer Complaint'], ['collector', 'Collector Request'], ['legalnotice', 'Legal Notice'], ['affidavit', 'Affidavit']];
  return `
    <h1 class="page-title">✍️ ${t('drafts')}</h1>
    <p class="page-subtitle">${L('Generate a ready-to-print legal draft in seconds', 'सेकंडों में प्रिंट-तैयार मसौदा बनाएं', 'సెకన్లలో ప్రింట్‌కు సిద్ధమైన న్యాయ ముసాయిదాను రూపొందించండి')}</p>
    <div class="grid">${types.map(([v, label]) => `<div class="feature-card" onclick="NS.openDraft('${v}','${label}')"><div class="feature-icon">📜</div><div class="feature-title">${esc(label)}</div><div class="feature-desc">${L('Generate', 'बनाएं', 'రూపొందించండి')}</div></div>`).join('')}</div>
    <div id="draftForm" class="card mt-1" style="display:none"></div>`;
}
function openDraft(type, title) {
  const F = $('draftForm');
  F.innerHTML = `<h3 class="card-title">📜 ${esc(title)}</h3>
    ${currentState ? `<div class="alert alert-info"><strong>📍 ${esc(STATES_UTS[currentState].name)}</strong></div>` : ''}
    <div class="form-group"><label>${L('Your Name', 'आपका नाम', 'మీ పేరు')}*</label><input class="form-control" id="d_n"></div>
    <div class="form-group"><label>${L('Address', 'पता', 'చిరునామా')}*</label><textarea class="form-control" id="d_a"></textarea></div>
    <div class="form-group"><label>${L('Mobile', 'मोबाइल', 'మొబైల్')}</label><input class="form-control" id="d_p"></div>
    <div class="form-group"><label>${L('Subject', 'विषय', 'విషయం')}</label><input class="form-control" id="d_s"></div>
    <div class="form-group"><label>${L('Details / Facts', 'विवरण', 'వివరాలు / వాస్తవాలు')}*</label><textarea class="form-control" id="d_d" rows="3"></textarea></div>
    <div class="form-group"><label>${L('Relief Sought', 'राहत', 'కోరిన ఉపశమనం')}</label><textarea class="form-control" id="d_r" rows="2"></textarea></div>
    <button class="btn btn-primary" onclick="NS.genDraft('${type}','${esc(title)}')">✨ ${L('Generate', 'बनाएं', 'రూపొందించండి')}</button>
    <div id="draftOut" class="mt-1" style="display:none"></div>`;
  F.style.display = 'block';
  F.scrollIntoView({ behavior: 'smooth' });
}
let lastDraft = '';
function genDraft(type, title) {
  const g = id => $(id).value.trim();
  const n = g('d_n'), a = g('d_a'), p = g('d_p'), s = g('d_s'), d = g('d_d'), r = g('d_r');
  if (!n || !d) { toast('⚠️ ' + L('Fill name & details', 'नाम व विवरण भरें', 'పేరు & వివరాలు నింపండి'), 'warning'); return; }
  const place = currentState ? STATES_UTS[currentState].name : 'India';
  const date = new Date().toLocaleDateString('en-IN');
  lastDraft = `To,\nThe Hon'ble Court / Concerned Authority\n${place}\n\nDate: ${date}\n\nSubject: ${s || title}\n\nRespected Sir / Madam,\n\nI, ${n}, resident of ${a || '[address]'}, most respectfully submit as under:\n\n1. ${d}\n\n${r ? '2. ' + r + '\n\n' : ''}PRAYER:\nIt is therefore most humbly prayed that this Hon'ble Court / Authority may kindly be pleased to grant the relief sought above and pass any other order deemed fit in the interest of justice.\n\nYours faithfully,\n\n(${n})\n${p ? 'Mobile: ' + p : ''}\n\n--- Generated by NyayaSahayak. Review with a legal professional before filing. ---`;
  $('draftOut').innerHTML = `<div class="result-box"><h4>📋 ${L('Your Draft', 'आपका मसौदा', 'మీ ముసాయిదా')}</h4><pre class="draft">${esc(lastDraft)}</pre>
    <div class="btn-group mt-1">
      <button class="btn btn-success" onclick="NS.copyDraft()">📋 ${L('Copy', 'कॉपी', 'కాపీ')}</button>
      <button class="btn btn-primary" onclick="NS.printDraft()">🖨️ ${L('Print', 'प्रिंट', 'ప్రింట్')}</button>
      <button class="btn btn-outline" onclick="NS.downloadDraft()">💾 ${L('Download', 'डाउनलोड', 'డౌన్‌లోడ్')}</button>
    </div>
    <div class="alert alert-warning mt-1" style="font-size:.82rem">⚖️ ${L('This is a template, not legal advice. Have it reviewed before filing.', 'यह एक टेम्पलेट है, कानूनी सलाह नहीं। दाखिल करने से पहले समीक्षा कराएं।', 'ఇది ఒక టెంప్లేట్, న్యాయ సలహా కాదు. దాఖలు చేయడానికి ముందు సమీక్షించండి.')}</div></div>`;
  $('draftOut').style.display = 'block';
}

// ============================================
// PAGE: Nearby
// ============================================
function renderNearby() {
  return `
    <h1 class="page-title">📍 ${t('nearby')}</h1>
    <p class="page-subtitle">${L('Courts, police, and free legal aid near you', 'आपके पास अदालत, पुलिस, मुफ्त सहायता', 'మీ దగ్గర కోర్టులు, పోలీసులు, ఉచిత న్యాయ సహాయం')}</p>
    <div class="card"><h3 class="card-title">📍 ${L('Location', 'स्थान', 'ప్రదేశం')}</h3>
      <button class="btn btn-primary" onclick="NS.findLocation()">📍 ${L('Use My Location', 'मेरा स्थान', 'నా ప్రదేశాన్ని ఉపయోగించండి')}</button>
      ${currentDistrict ? `<p class="mt-1">${L('District', 'जिला', 'జిల్లా')}: <strong>${esc(currentDistrict)}</strong></p>` : ''}
      <div id="locationStatus" class="mt-1"></div>
    </div>
    <div id="nearbyResults"></div>`;
}
function renderNearbyList(coords) {
  const dist = currentDistrict || (currentState ? STATES_UTS[currentState].name : 'Your Area');
  const items = nearbyServices(dist, currentLang);
  $('nearbyResults').innerHTML = `<div class="card"><h3 class="card-title">📍 ${L('In / near', 'आस-पास', 'దగ్గరలో')} ${esc(dist)}</h3>
    ${items.map(p => `<div class="nearby-card"><div><h4>${p.icon} ${esc(p.name)}</h4><p style="font-size:.85rem;color:var(--text-light)">📍 ${esc(p.address)}</p>${p.phone ? `<p style="font-size:.85rem">📞 <a href="tel:${p.phone}">${esc(p.phone)}</a></p>` : ''}</div><div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end"><span class="nearby-distance">${esc(p.dist)}</span>${p.map ? `<a class="btn btn-outline btn-sm" href="${mapLink(p.map, coords)}" target="_blank" rel="noopener">🗺️ ${L('Map', 'नक्शा', 'మ్యాప్')}</a>` : ''}</div></div>`).join('')}</div>`;
}
async function findLocation() {
  const s = $('locationStatus');
  s.innerHTML = `<div class="alert alert-info">📡 ${L('Locating…', 'खोज रहे हैं…', 'గుర్తిస్తోంది…')}</div>`;
  try {
    const coords = await getCoords();
    s.innerHTML = `<div class="alert alert-success">✅ ${L('Location found', 'स्थान मिला', 'ప్రదేశం కనుగొనబడింది')}: ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}</div>`;
    renderNearbyList(coords);
  } catch (e) {
    s.innerHTML = `<div class="alert alert-warning">${L('GPS unavailable — showing your district list', 'GPS नहीं मिला — जिला सूची', 'GPS అందుబాటులో లేదు — మీ జిల్లా జాబితా చూపిస్తోంది')}</div>`;
    renderNearbyList(null);
  }
}

// ============================================
// PAGE: Rights
// ============================================
function renderRights() {
  const items = [['arrest', '👮', L('Arrest', 'गिरफ्तारी', 'అరెస్ట్')], ['women', '👩', L('Women', 'महिला', 'మహిళలు')], ['consumer', '🛒', L('Consumer', 'उपभोक्ता', 'వినియోగదారు')], ['tenant', '🔑', L('Tenant', 'किरायेदार', 'అద్దెదారు')], ['worker', '💼', L('Worker', 'श्रमिक', 'కార్మికుడు')], ['fir', '🚔', 'FIR']];
  return `<h1 class="page-title">📚 ${t('rights')}</h1>
    <p class="page-subtitle">${L('Know what the law guarantees you', 'जानें कानून आपको क्या देता है', 'చట్టం మీకు ఏమి హామీ ఇస్తుందో తెలుసుకోండి')}</p>
    <div class="grid">${items.map(([k, ic, lbl]) => `<div class="feature-card" onclick="NS.showRights('${k}')"><div class="feature-icon">${ic}</div><div class="feature-title">${lbl}</div></div>`).join('')}</div>
    <div id="rightsInfo" class="card mt-1" style="display:none"></div>`;
}
function rightsData(type) {
  const data = {
    arrest: { title: L('Arrest Rights', 'गिरफ्तारी अधिकार', 'అరెస్ట్ హక్కులు'), c: `<ol><li>${L('Right to know the reason for arrest', 'गिरफ्तारी का कारण जानने का अधिकार', 'అరెస్ట్‌కు కారణం తెలుసుకునే హక్కు')}</li><li>${L('Right to inform a family member/friend', 'परिवार को सूचित करने का अधिकार', 'కుటుంబ సభ్యుడు/స్నేహితుడికి తెలియజేసే హక్కు')}</li><li>${L('Right to a free lawyer', 'मुफ्त वकील का अधिकार', 'ఉచిత న్యాయవాది హక్కు')}</li><li>${L('Must be produced before magistrate within 24 hrs', '24 घंटे में मजिस्ट्रेट के समक्ष', '24 గంటల్లో మేజిస్ట్రేట్ ముందు హాజరుపరచాలి')}</li><li>${L('Right to remain silent', 'चुप रहने का अधिकार', 'మౌనంగా ఉండే హక్కు')}</li></ol><p>📞 <strong>15100</strong></p>` },
    women: { title: L('Women Rights', 'महिला अधिकार', 'మహిళల హక్కులు'), c: `<ul><li>${L('Equal pay for equal work', 'समान काम, समान वेतन', 'సమాన పనికి సమాన వేతనం')}</li><li>${L('Protection from domestic violence (PWDVA 2005)', 'घरेलू हिंसा से सुरक्षा', 'గృహ హింస నుండి రక్షణ (PWDVA 2005)')}</li><li>${L('Maternity leave & benefits', 'मातृत्व अवकाश', 'ప్రసూతి సెలవు & ప్రయోజనాలు')}</li><li>${L('No arrest of a woman after sunset without special order', 'सूर्यास्त के बाद विशेष आदेश के बिना गिरफ्तारी नहीं', 'ప్రత్యేక ఉత్తర్వు లేకుండా సూర్యాస్తమయం తర్వాత మహిళను అరెస్ట్ చేయరాదు')}</li></ul><p>📞 <strong>181</strong></p>` },
    consumer: { title: L('Consumer Rights', 'उपभोक्ता अधिकार', 'వినియోగదారు హక్కులు'), c: `<ol><li>${L('Right to Safety', 'सुरक्षा', 'భద్రత హక్కు')}</li><li>${L('Right to Information', 'जानकारी', 'సమాచార హక్కు')}</li><li>${L('Right to Choose', 'चुनाव', 'ఎంపిక హక్కు')}</li><li>${L('Right to be Heard', 'सुनवाई', 'వినిపించుకునే హక్కు')}</li><li>${L('Right to Redressal', 'निवारण', 'పరిష్కార హక్కు')}</li><li>${L('Right to Consumer Education', 'शिक्षा', 'వినియోగదారు విద్య హక్కు')}</li></ol><p>🌐 <a href="https://edaakhil.nic.in" target="_blank" rel="noopener">edaakhil.nic.in</a></p>` },
    tenant: { title: L('Tenant Rights', 'किरायेदार अधिकार', 'అద్దెదారు హక్కులు'), c: `<ul><li>${L('Right to peaceful possession', 'शांतिपूर्ण निवास', 'ప్రశాంత స్వాధీన హక్కు')}</li><li>${L('No eviction without due legal process', 'कानूनी प्रक्रिया के बिना बेदखली नहीं', 'తగిన న్యాయ ప్రక్రియ లేకుండా ఖాళీ చేయించరాదు')}</li><li>${L('Right to a rent receipt', 'किराया रसीद', 'అద్దె రసీదు హక్కు')}</li><li>${L('Essential services cannot be cut off', 'आवश्यक सेवाएं नहीं काटी जा सकतीं', 'అవసర సేవలను నిలిపివేయరాదు')}</li></ul>` },
    worker: { title: L('Worker Rights', 'श्रमिक अधिकार', 'కార్మిక హక్కులు'), c: `<ul><li>${L('Minimum wages', 'न्यूनतम मजदूरी', 'కనీస వేతనాలు')}</li><li>${L('Max 8-hour work day / overtime pay', '8 घंटे कार्य / ओवरटाइम', 'గరిష్టంగా 8 గంటల పని దినం / ఓవర్‌టైమ్ చెల్లింపు')}</li><li>${L('PF & ESI benefits', 'PF व ESI', 'PF & ESI ప్రయోజనాలు')}</li><li>${L('Safe workplace & gratuity', 'सुरक्षित कार्यस्थल', 'సురక్షిత పనిప్రదేశం & గ్రాట్యుటీ')}</li></ul>` },
    fir: { title: 'FIR ' + L('Rights', 'अधिकार', 'హక్కులు'), c: `<ul><li>${L('Right to register an FIR for a cognizable offence', 'संज्ञेय अपराध के लिए FIR का अधिकार', 'గుర్తించదగిన నేరానికి FIR నమోదు చేసే హక్కు')}</li><li>${L('Zero FIR — file at any police station', 'जीरो FIR — किसी भी थाने में', 'జీరో FIR — ఏ పోలీస్ స్టేషన్‌లోనైనా దాఖలు చేయవచ్చు')}</li><li>${L('Free copy of the FIR', 'FIR की मुफ्त प्रति', 'FIR ఉచిత కాపీ')}</li></ul><p>${L('If police refuse, approach the Magistrate under Section 156(3) CrPC.', 'यदि पुलिस मना करे तो धारा 156(3) के तहत मजिस्ट्रेट से संपर्क करें।', 'పోలీసులు నిరాకరిస్తే, CrPC సెక్షన్ 156(3) కింద మేజిస్ట్రేట్‌ను సంప్రదించండి.')}</p>` }
  };
  return data[type];
}
function showRights(type) {
  const d = rightsData(type);
  const el = $('rightsInfo');
  el.innerHTML = `<h3 class="card-title">${d.title}</h3><div style="line-height:1.7" id="rightsContent">${d.c}</div><button class="btn btn-outline btn-sm mt-1" onclick="NS.speakText(document.getElementById('rightsContent').innerText)">🔊 ${L('Read aloud', 'सुनें', 'బిగ్గరగా చదవండి')}</button>`;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// PAGE: Helpline
// ============================================
function renderHelpline() {
  const st = currentState ? STATES_UTS[currentState] : null;
  return `<h1 class="page-title">📞 ${t('helpline')}</h1>
    <div class="card"><h3 class="card-title">🆘 ${L('Emergency', 'आपातकालीन', 'అత్యవసరం')}</h3>
      <div class="grid">${[['Police / పోలీస్', '100'], ['Women / మహిళలు', '1091 / 181'], ['Child / పిల్లలు', '1098'], ['Cyber / సైబర్', '1930'], ['NALSA', '15100'], ['Senior / వృద్ధులు', '14567'], ['Ambulance', '108'], ['Emergency', '112']].map(([l, n]) => `<div><strong>${esc(l)}</strong><p class="emergency-num">${esc(n)}</p></div>`).join('')}</div>
    </div>
    ${st ? `<div class="card"><h3 class="card-title">📍 ${esc(st.name)}</h3>
      <p><strong>${L('High Court', 'उच्च न्यायालय', 'హైకోర్టు')}:</strong> ${esc(st.hc)}</p>
      <p><strong>${L('Land Law', 'भूमि कानून', 'భూ చట్టం')}:</strong> ${esc(st.landLaw)}</p>
      ${st.portal ? `<p><strong>${L('Land Records Portal', 'भूमि रिकॉर्ड पोर्टल', 'భూ రికార్డుల పోర్టల్')}:</strong> <a href="${st.portal}" target="_blank" rel="noopener">${st.portal}</a></p>` : ''}
      <p><strong>${L('Bar Council', 'बार काउंसिल', 'బార్ కౌన్సిల్')}:</strong> <a href="https://www.barcouncilofindia.org" target="_blank" rel="noopener">barcouncilofindia.org</a></p>
    </div>` : `<div class="alert alert-warning">${L('Select your state for local details', 'स्थानीय विवरण के लिए राज्य चुनें', 'స్థానిక వివరాల కోసం మీ రాష్ట్రాన్ని ఎంచుకోండి')}</div>`}
    <div class="card"><h3 class="card-title">🔊 ${L('Voice Help', 'आवाज सहायता', 'వాయిస్ సహాయం')}</h3>
      <p style="font-size:.85rem;color:var(--text-light)">${L('Listen to the key helpline numbers read aloud.', 'मुख्य हेल्पलाइन नंबर सुनें।', 'ముఖ్య హెల్ప్‌లైన్ నంబర్‌లను బిగ్గరగా వినండి.')}</p>
      <button class="btn btn-primary" onclick="NS.speakHelplines()">🎤 ${L('Listen', 'सुनें', 'వినండి')}</button>
    </div>`;
}

// ============================================
// Handlers exposed to inline onclick via window.NS
// ============================================
const handlers = {
  showPage,
  selectPath,
  analyzeRF,
  addLog,
  switchAn,
  toggleDictation,
  analyze: runAnalyze,
  openDraft,
  genDraft,
  findLocation,
  showRights,
  checkEligibility,
  filterGlossary,
  updateTriggerLabel,
  calcDeadlines,
  icsDeadline: (i) => { const d = lastDeadlines[i]; if (d) downloadICS(d.title, d.iso); },
  addHearingReminder: () => {
    const iso = $('hr_date').value, note = $('hr_note').value.trim();
    if (!iso) { toast('⚠️ ' + L('Pick a hearing date', 'सुनवाई तिथि चुनें', 'విచారణ తేదీని ఎంచుకోండి'), 'warning'); return; }
    downloadICS(L('Court hearing', 'अदालत सुनवाई', 'కోర్టు విచారణ') + (note ? ' — ' + note : ''), iso);
  },
  speakHelplines: () => speakHelplines(currentLang),
  speakText: (txt) => {
    if (!ttsSupported()) { toast('⚠️ ' + L('Read-aloud not supported in this browser', 'इस ब्राउज़र में सुनना समर्थित नहीं', 'ఈ బ్రౌజర్‌లో చదవడం మద్దతు లేదు'), 'warning'); return; }
    if (!txt || !txt.trim()) return;
    speak(txt, currentLang);
    if (!hasVoiceFor(currentLang)) {
      toast('🔊 ' + L('No voice pack for this language on your device — reading may be silent or accented.', 'इस भाषा का वॉइस पैक नहीं है — आवाज नहीं आ सकती।', 'ఈ భాషకు వాయిస్ ప్యాక్ లేదు — ధ్వని రాకపోవచ్చు.'), 'warning');
    } else {
      toast('🔊 ' + L('Playing…', 'चल रहा है…', 'ప్లే అవుతోంది…'));
    }
  },
  removeDoc: (i) => { currentDocs.splice(i, 1); renderDocList(); },
  switchCase: (tab, el) => {
    document.querySelectorAll('#mainContent .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    $('ct-new').style.display = tab === 'new' ? 'block' : 'none';
    $('ct-list').style.display = tab === 'list' ? 'block' : 'none';
    if (tab === 'list') renderCaseList();
  },
  openCase: (id) => { currentCase = cases.find(c => c.id === id); toast('📂 ' + id); showPage('guide'); },
  deleteCase: async (id) => { if (!confirm(L('Delete this case?', 'मामला हटाएं?', 'ఈ కేసును తొలగించాలా?'))) return; cases = cases.filter(c => c.id !== id); if (currentCase?.id === id) currentCase = null; await saveCases(); renderCaseList(); renderSidebar(); },
  checkCNR: () => { const v = $('cnrIn').value; $('cnrResult').innerHTML = isValidCNR(v) ? `<div class="green-flag">✅ ${L('Valid CNR format. Look it up on the District Court portal above.', 'सही CNR प्रारूप। ऊपर पोर्टल पर खोजें।', 'సరైన CNR ఫార్మాట్. పైన ఉన్న జిల్లా కోర్టు పోర్టల్‌లో వెతకండి.')}</div>` : `<div class="yellow-flag">⚠️ ${L('Not a valid 16-character CNR. Example: DLHC010001232024', 'मान्य CNR नहीं। उदाहरण: DLHC010001232024', 'చెల్లుబాటు అయ్యే 16-అక్షరాల CNR కాదు. ఉదా: DLHC010001232024')}</div>`; },
  copyDraft: () => { navigator.clipboard?.writeText(lastDraft); toast('📋 ' + L('Copied', 'कॉपी किया', 'కాపీ చేయబడింది')); },
  printDraft: () => { const w = window.open('', '', 'width=800,height=600'); w.document.write('<html><body style="padding:30px;font-family:Arial,sans-serif"><pre style="white-space:pre-wrap">' + esc(lastDraft) + '</pre><scr' + 'ipt>window.print()</scr' + 'ipt></body></html>'); w.document.close(); },
  downloadDraft: () => { const b = new Blob([lastDraft], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'nyayasahayak-draft.txt'; a.click(); toast('💾 ' + L('Downloaded', 'डाउनलोड', 'డౌన్‌లోడ్ అయింది')); }
};
