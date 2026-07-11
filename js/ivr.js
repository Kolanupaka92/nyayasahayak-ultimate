// ============================================
// ivr.js — voice help for low-literacy users
// Text-to-speech (SpeechSynthesis): read helplines, rights,
//   and arbitrary text aloud in the chosen language.
// Speech-to-text (SpeechRecognition): dictate notice text by
//   speaking in English / Hindi / Telugu (and other Indian langs
//   where the browser has a voice model).
// Both stay on the device via the browser's built-in engines.
// ============================================

const VOICE_LANG = {
  en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN',
  bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN', ml: 'ml-IN',
  or: 'or-IN', ur: 'ur-IN'
};

export function isSupported() {
  return 'speechSynthesis' in window;
}

// True if the device has a synthesis voice for the given app language.
export function hasVoiceFor(lang = 'en') {
  if (!isSupported()) return false;
  const target = VOICE_LANG[lang] || 'en-IN';
  const voices = window.speechSynthesis.getVoices();
  return voices.some(v => v.lang === target || v.lang?.toLowerCase().startsWith(lang));
}

export function speak(text, lang = 'en') {
  if (!isSupported() || !text) return false;
  window.speechSynthesis.cancel();
  const target = VOICE_LANG[lang] || 'en-IN';
  const u = new SpeechSynthesisUtterance(text);
  u.lang = target;
  u.rate = 0.95;
  // Pick the closest available voice: exact locale → same language → English.
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.lang === target)
    || voices.find(v => v.lang?.toLowerCase().startsWith(lang))
    || voices.find(v => v.lang?.toLowerCase().startsWith('en'));
  if (match) u.voice = match;
  // Chrome sometimes needs a tick after cancel() before speak() takes effect.
  setTimeout(() => window.speechSynthesis.speak(u), 60);
  return true;
}

export function stop() {
  if (isSupported()) window.speechSynthesis.cancel();
}

// ---------- Speech-to-text (dictation) ----------
let recognition = null;

export function sttSupported() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function isDictating() {
  return recognition !== null;
}

// Start dictation. Callbacks: onStart, onInterim(text), onFinal(text),
// onEnd, onError(errorCode). Returns false if unsupported.
export function startDictation(lang = 'en', cb = {}) {
  if (!sttSupported()) return false;
  stopDictation();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = VOICE_LANG[lang] || 'en-IN';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => cb.onStart && cb.onStart();
  recognition.onerror = e => cb.onError && cb.onError(e.error || 'error');
  recognition.onend = () => { recognition = null; cb.onEnd && cb.onEnd(); };
  recognition.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const txt = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += txt;
      else interim += txt;
    }
    if (final && cb.onFinal) cb.onFinal(final);
    if (interim && cb.onInterim) cb.onInterim(interim);
  };
  try { recognition.start(); } catch (err) { recognition = null; return false; }
  return true;
}

export function stopDictation() {
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
}

// Prebuilt helpline script read-aloud.
export function speakHelplines(lang = 'en') {
  const scripts = {
    en: 'For free legal aid call N A L S A at 1 5 1 0 0. Police 1 0 0. Women helpline 1 8 1. Child helpline 1 0 9 8. Cyber crime 1 9 3 0.',
    hi: 'मुफ्त कानूनी सहायता के लिए नालसा 15100 पर कॉल करें। पुलिस 100। महिला हेल्पलाइन 181। बाल हेल्पलाइन 1098। साइबर अपराध 1930।',
    te: 'ఉచిత న్యాయ సహాయం కోసం నల్సా 15100 కు కాల్ చేయండి. పోలీస్ 100. మహిళా హెల్ప్‌లైన్ 181. చైల్డ్ హెల్ప్‌లైన్ 1098. సైబర్ నేరం 1930.'
  };
  return speak(scripts[lang] || scripts.en, lang);
}
