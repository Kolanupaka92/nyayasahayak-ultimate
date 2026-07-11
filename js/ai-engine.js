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
    hi: 'चेक अनादरण मामला (धारा 138)। बैंक मेमो के 30 दिनों के भीतर कानूनी नोटिस भेजें, फिर 15 दिनों में भुगतान करें या केस का सामना करें।',
    te: 'చెక్ తిరస్కరణ కేసు (సెక్షన్ 138, నెగోషియబుల్ ఇన్‌స్ట్రుమెంట్స్ చట్టం). బ్యాంక్ మెమో వచ్చిన 30 రోజుల్లో న్యాయ నోటీసు పంపండి, ఆపై కేసు దాఖలు చేయడానికి ముందు అవతలి వ్యక్తికి చెల్లించడానికి 15 రోజులు ఉంటాయి.'
  },
  Criminal: {
    en: 'Criminal matter. Meet a lawyer immediately. You have the right to remain silent and the right to free legal aid.',
    hi: 'आपराधिक मामला। तुरंत वकील से मिलें। चुप रहने और मुफ्त कानूनी सहायता का अधिकार है।',
    te: 'క్రిమినల్ కేసు. వెంటనే న్యాయవాదిని కలవండి. మౌనంగా ఉండే హక్కు, ఉచిత న్యాయ సహాయ హక్కు మీకు ఉన్నాయి.'
  },
  Family: {
    en: 'Family dispute. Mediation is often faster and cheaper. Keep marriage, income and child documents ready.',
    hi: 'पारिवारिक विवाद। मध्यस्थता पर विचार करें। विवाह, आय और बच्चों के दस्तावेज तैयार रखें।',
    te: 'కుటుంబ వివాదం. మధ్యవర్తిత్వం తరచుగా వేగవంతం, చౌక. వివాహం, ఆదాయం, పిల్లల పత్రాలను సిద్ధంగా ఉంచండి.'
  },
  Property: {
    en: 'Property dispute. Verify all land records (khatauni, mutation, sale deed) and ownership documents before acting.',
    hi: 'संपत्ति विवाद। सभी भूमि रिकॉर्ड और स्वामित्व दस्तावेज सत्यापित करें।',
    te: 'ఆస్తి వివాదం. చర్య తీసుకునే ముందు అన్ని భూ రికార్డులు (ఖతౌని, మ్యుటేషన్, సేల్ డీడ్) మరియు యాజమాన్య పత్రాలను ధృవీకరించండి.'
  },
  Consumer: {
    en: 'Consumer complaint. You can file online for free at edaakhil.nic.in within 2 years of the issue.',
    hi: 'उपभोक्ता शिकायत। edaakhil.nic.in पर 2 साल के भीतर मुफ्त ऑनलाइन दर्ज करें।',
    te: 'వినియోగదారు ఫిర్యాదు. సమస్య జరిగిన 2 సంవత్సరాల్లో edaakhil.nic.inలో ఉచితంగా ఆన్‌లైన్‌లో దాఖలు చేయవచ్చు.'
  },
  Rental: {
    en: 'Rental dispute. Check your state Rent Control Act. Always keep rent receipts and the rent agreement.',
    hi: 'किरायेदारी विवाद। राज्य के किराया नियंत्रण कानून देखें। किराया रसीद और समझौता रखें।',
    te: 'అద్దె వివాదం. మీ రాష్ట్ర అద్దె నియంత్రణ చట్టాన్ని చూడండి. అద్దె రసీదులు, అద్దె ఒప్పందాన్ని ఎల్లప్పుడూ ఉంచుకోండి.'
  },
  Labor: {
    en: 'Labor dispute. Contact the Labor Commissioner. Minimum wages and dues are protected by law.',
    hi: 'श्रम विवाद। श्रम आयुक्त से संपर्क करें। न्यूनतम मजदूरी कानून द्वारा संरक्षित है।',
    te: 'కార్మిక వివాదం. కార్మిక కమిషనర్‌ను సంప్రదించండి. కనీస వేతనాలు, బకాయిలు చట్టం ద్వారా రక్షించబడతాయి.'
  },
  'Civil/General': {
    en: 'Civil matter. Gather all documents, note every date, and consider free legal aid before hiring.',
    hi: 'सिविल मामला। सभी दस्तावेज एकत्र करें, तारीखें नोट करें।',
    te: 'సివిల్ కేసు. అన్ని పత్రాలను సేకరించండి, ప్రతి తేదీని గమనించండి, న్యాయవాదిని నియమించే ముందు ఉచిత న్యాయ సహాయాన్ని పరిగణించండి.'
  }
};

export function explain(category, lang) {
  const e = EXPLANATIONS[category] || EXPLANATIONS['Civil/General'];
  if (lang === 'हिन्दी') return e.hi;
  if (lang === 'తెలుగు') return e.te || e.en;
  return e.en;
}

// Map a UI language code to the explanation language name used above.
const UI_TO_EXPLAIN = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' };

// Full analysis pipeline. Returns a structured result object.
// `uiLang` (optional): 'en' | 'hi' | 'te' — explanation is given in the
// user's chosen UI language; otherwise it follows the detected script.
export function analyzeNotice(txt, uiLang) {
  const text = (txt || '').trim();
  const lang = detectLang(text);
  const category = classifyCase(text);
  const urgency = scoreUrgency(text);
  const explainLang = UI_TO_EXPLAIN[uiLang] || lang;
  return {
    lang,
    category,
    urgency,
    dates: extractDates(text),
    amounts: extractAmounts(text),
    explanation: explain(category, explainLang),
    wordCount: text ? text.split(/\s+/).length : 0
  };
}
