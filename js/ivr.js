// ============================================
// ivr.js — voice help (text-to-speech) for low-literacy users
// Uses the browser SpeechSynthesis API. Provides read-aloud
// for helplines, rights and any arbitrary text, in the
// user's chosen language where a voice is available.
// ============================================

const VOICE_LANG = {
  en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN',
  bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN', ml: 'ml-IN',
  or: 'or-IN', ur: 'ur-IN'
};

export function isSupported() {
  return 'speechSynthesis' in window;
}

export function speak(text, lang = 'en') {
  if (!isSupported()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE_LANG[lang] || 'en-IN';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
  return true;
}

export function stop() {
  if (isSupported()) window.speechSynthesis.cancel();
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
