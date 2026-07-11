// ============================================
// ai-engine.js — on-device legal notice analyzer
// Rule/heuristic based (no external API, works offline):
//   - script/language detection
//   - case category classification
//   - date & amount extraction
//   - urgency scoring
//   - plain-language explanation + recommendations
// ============================================

export function detectLang(txt) {
  if (/[ऀ-ॿ]/.test(txt)) return 'हिन्दी';
  if (/[ఀ-౿]/.test(txt)) return 'తెలుగు';
  if (/[஀-௿]/.test(txt)) return 'தமிழ்';
  if (/[ಀ-೿]/.test(txt)) return 'ಕನ್ನಡ';
  if (/[ঀ-৿]/.test(txt)) return 'বাংলা';
  if (/[਀-੿]/.test(txt)) return 'ਪੰਜਾਬੀ';
  if (/[઀-૿]/.test(txt)) return 'ગુજરાતી';
  if (/[ഀ-ൿ]/.test(txt)) return 'മലയാളം';
  if (/[଀-୿]/.test(txt)) return 'ଓଡ଼ିଆ';
  if (/[؀-ۿ]/.test(txt)) return 'اردو';
  return 'English';
}

export function classifyCase(txt) {
  const t = txt.toLowerCase();
  if (/cheque|bounce|138|चेक|बाउंस/.test(t)) return 'Cheque Bounce';
  if (/fir|arrest|cheating|theft|एफआईआर|गिरफ्तार|चोरी/.test(t)) return 'Criminal';
  if (/divorce|custody|maintenance|तलाक|गुजारा/.test(t)) return 'Family';
  if (/land|property|eviction|mutation|जमीन|बेदखली/.test(t)) return 'Property';
  if (/consumer|product|defect|उपभोक्ता/.test(t)) return 'Consumer';
  if (/rent|tenant|eviction|किराया/.test(t)) return 'Rental';
  if (/salary|wages|termination|वेतन/.test(t)) return 'Labor';
  return 'Civil/General';
}

export function extractDates(txt) {
  return txt.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g) || [];
}

export function extractAmounts(txt) {
  return txt.match(/(?:₹|rs\.?|inr)\s*[\d,]+/gi) || [];
}

export function scoreUrgency(txt) {
  return /urgent|immediate|forthwith|within\s+\d+\s+days|तुरंत|शीघ्र|जल्द/i.test(txt) ? 'high' : 'normal';
}

const EXPLANATIONS = {
  'Cheque Bounce': {
    en: 'Cheque dishonor case (Section 138, Negotiable Instruments Act). Send a legal notice within 30 days of the bank memo, then the other side has 15 days to pay before a case can be filed.',
    hi: 'चेक अनादरण मामला (धारा 138)। बैंक मेमो के 30 दिनों के भीतर कानूनी नोटिस भेजें, फिर 15 दिनों में भुगतान करें या केस का सामना करें।'
  },
  Criminal: {
    en: 'Criminal matter. Meet a lawyer immediately. You have the right to remain silent and the right to free legal aid.',
    hi: 'आपराधिक मामला। तुरंत वकील से मिलें। चुप रहने और मुफ्त कानूनी सहायता का अधिकार है।'
  },
  Family: {
    en: 'Family dispute. Mediation is often faster and cheaper. Keep marriage, income and child documents ready.',
    hi: 'पारिवारिक विवाद। मध्यस्थता पर विचार करें। विवाह, आय और बच्चों के दस्तावेज तैयार रखें।'
  },
  Property: {
    en: 'Property dispute. Verify all land records (khatauni, mutation, sale deed) and ownership documents before acting.',
    hi: 'संपत्ति विवाद। सभी भूमि रिकॉर्ड और स्वामित्व दस्तावेज सत्यापित करें।'
  },
  Consumer: {
    en: 'Consumer complaint. You can file online for free at edaakhil.nic.in within 2 years of the issue.',
    hi: 'उपभोक्ता शिकायत। edaakhil.nic.in पर 2 साल के भीतर मुफ्त ऑनलाइन दर्ज करें।'
  },
  Rental: {
    en: 'Rental dispute. Check your state Rent Control Act. Always keep rent receipts and the rent agreement.',
    hi: 'किरायेदारी विवाद। राज्य के किराया नियंत्रण कानून देखें। किराया रसीद और समझौता रखें।'
  },
  Labor: {
    en: 'Labor dispute. Contact the Labor Commissioner. Minimum wages and dues are protected by law.',
    hi: 'श्रम विवाद। श्रम आयुक्त से संपर्क करें। न्यूनतम मजदूरी कानून द्वारा संरक्षित है।'
  },
  'Civil/General': {
    en: 'Civil matter. Gather all documents, note every date, and consider free legal aid before hiring.',
    hi: 'सिविल मामला। सभी दस्तावेज एकत्र करें, तारीखें नोट करें।'
  }
};

export function explain(category, lang) {
  const isHi = lang === 'हिन्दी';
  const e = EXPLANATIONS[category] || EXPLANATIONS['Civil/General'];
  return isHi ? e.hi : e.en;
}

// Full analysis pipeline. Returns a structured result object.
export function analyzeNotice(txt) {
  const text = (txt || '').trim();
  const lang = detectLang(text);
  const category = classifyCase(text);
  const urgency = scoreUrgency(text);
  return {
    lang,
    category,
    urgency,
    dates: extractDates(text),
    amounts: extractAmounts(text),
    explanation: explain(category, lang),
    wordCount: text ? text.split(/\s+/).length : 0
  };
}
