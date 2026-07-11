// ============================================
// legal-data.js — datasets for the value-add features that
// put NyayaSahayak ahead of existing legal apps:
//   1. Free Legal Aid eligibility (Section 12, LSA Act 1987)
//   2. Limitation / notice-period deadline rules
//   3. Plain-language legal glossary (jargon buster)
// All static & bundled for offline use. EN / HI / TE.
// ============================================

// ---- 1. Free Legal Aid eligibility (Section 12) ----
// Categories entitled to FREE legal aid regardless of income.
export const ELIG_CATEGORIES = [
  { id: 'women', en: 'Woman (any income)', hi: 'महिला (किसी भी आय पर)', te: 'మహిళ (ఏ ఆదాయమైనా)' },
  { id: 'child', en: 'Child (under 18)', hi: 'बच्चा (18 वर्ष से कम)', te: 'పిల్లవాడు/పిల్ల (18 ఏళ్ల లోపు)' },
  { id: 'scst', en: 'Member of SC / ST', hi: 'अनुसूचित जाति / जनजाति सदस्य', te: 'SC / ST సభ్యుడు' },
  { id: 'disability', en: 'Person with disability', hi: 'दिव्यांग व्यक्ति', te: 'వికలాంగ వ్యక్తి' },
  { id: 'custody', en: 'In custody (jail / protective / psychiatric home)', hi: 'हिरासत में (जेल / संरक्षण गृह)', te: 'కస్టడీలో (జైలు / రక్షణ / మానసిక గృహం)' },
  { id: 'trafficking', en: 'Victim of trafficking or begar (forced labour)', hi: 'मानव तस्करी / बेगार का पीड़ित', te: 'అక్రమ రవాణా / వెట్టిచాకిరీ బాధితుడు' },
  { id: 'disaster', en: 'Victim of mass disaster, violence, flood, drought, earthquake or industrial disaster', hi: 'सामूहिक आपदा, हिंसा, बाढ़, सूखा, भूकंप या औद्योगिक आपदा का पीड़ित', te: 'సామూహిక విపత్తు, హింస, వరద, కరువు, భూకంపం లేదా పారిశ్రామిక విపత్తు బాధితుడు' },
  { id: 'workman', en: 'Industrial workman', hi: 'औद्योगिक श्रमिक', te: 'పారిశ్రామిక కార్మికుడు' },
  { id: 'seniorTrans', en: 'Senior citizen or transgender person', hi: 'वरिष्ठ नागरिक या ट्रांसजेंडर व्यक्ति', te: 'వృద్ధుడు లేదా ట్రాన్స్‌జెండర్ వ్యక్తి' }
];

// Annual income ceilings (₹) for Section 12(h). Where a state is not listed,
// DEFAULT applies. Confirm the exact figure at the local DLSA.
export const INCOME_CEILINGS = {
  AN: 300000, AS: 300000, HR: 300000, AR: 100000, DL: 100000,
  _DEFAULT: 300000, _SUPREME_COURT: 500000
};

// ---- 2. Limitation / notice-period rules (simplified) ----
// offset = days from the trigger date. null = no fixed statutory day count.
export const LIMITATION = {
  cheque: {
    trigger: { en: 'Date on the bank "cheque returned" memo', hi: 'बैंक के "चेक वापसी" मेमो की तारीख', te: 'బ్యాంక్ "చెక్ తిరిగి వచ్చిన" మెమో తేదీ' },
    steps: [
      { en: 'Send a written legal demand notice', hi: 'लिखित कानूनी मांग नोटिस भेजें', te: 'లిఖిత న్యాయ డిమాండ్ నోటీసు పంపండి', offset: 30 },
      { en: 'Drawer’s 15-day window to pay ends', hi: 'भुगतान के लिए 15-दिन की अवधि समाप्त', te: 'చెల్లించడానికి 15-రోజుల గడువు ముగుస్తుంది', offset: 45 },
      { en: 'File the complaint in court by', hi: 'अदालत में शिकायत दाखिल करें', te: 'కోర్టులో ఫిర్యాదు దాఖలు చేయండి', offset: 75 }
    ]
  },
  consumer: {
    trigger: { en: 'Date the problem / cause of action arose', hi: 'समस्या उत्पन्न होने की तारीख', te: 'సమస్య / కారణం తలెత్తిన తేదీ' },
    steps: [{ en: 'File complaint before the Consumer Commission by', hi: 'उपभोक्ता आयोग में शिकायत दाखिल करें', te: 'వినియోగదారు కమిషన్‌లో ఫిర్యాదు దాఖలు చేయండి', offset: 730 }]
  },
  civil: {
    trigger: { en: 'Date the cause of action arose', hi: 'वाद कारण उत्पन्न होने की तारीख', te: 'కారణం తలెత్తిన తేదీ' },
    steps: [{ en: 'File civil suit (money / contract) by', hi: 'सिविल वाद (धन/अनुबंध) दाखिल करें', te: 'సివిల్ దావా (డబ్బు/ఒప్పందం) దాఖలు చేయండి', offset: 1095 }]
  },
  property: {
    trigger: { en: 'Date you were dispossessed', hi: 'बेदखली की तारीख', te: 'మీరు స్వాధీనం కోల్పోయిన తేదీ' },
    steps: [{ en: 'File suit for possession by', hi: 'कब्जे के लिए वाद दाखिल करें', te: 'స్వాధీనం కోసం దావా దాఖలు చేయండి', offset: 4383 }]
  },
  labor: {
    trigger: { en: 'Date of dismissal / unpaid dues', hi: 'बर्खास्तगी / बकाया की तारीख', te: 'తొలగింపు / చెల్లించని బకాయిల తేదీ' },
    steps: [{ en: 'Raise dispute / recovery — do not delay; typical limit is around 1–3 years', hi: 'विवाद उठाएं — देरी न करें; सामान्य सीमा लगभग 1–3 वर्ष', te: 'వివాదాన్ని లేవనెత్తండి — ఆలస్యం చేయకండి; సాధారణ పరిమితి సుమారు 1–3 సంవత్సరాలు', offset: null }]
  },
  rental: {
    trigger: { en: 'Date of default / notice', hi: 'चूक / नोटिस की तारीख', te: 'డిఫాల్ట్ / నోటీసు తేదీ' },
    steps: [{ en: 'Time limits depend on your State Rent Control Act — check locally', hi: 'समय-सीमा राज्य किराया नियंत्रण कानून पर निर्भर — स्थानीय रूप से जाँचें', te: 'కాల పరిమితులు మీ రాష్ట్ర అద్దె నియంత్రణ చట్టంపై ఆధారపడతాయి — స్థానికంగా తనిఖీ చేయండి', offset: null }]
  },
  criminal: {
    trigger: { en: 'Date of the offence', hi: 'अपराध की तारीख', te: 'నేరం జరిగిన తేదీ' },
    steps: [{ en: 'Serious offences have NO limitation. Minor offences (up to 3 yrs jail) must be taken to court within 3 years', hi: 'गंभीर अपराधों की कोई सीमा नहीं। छोटे अपराध (3 वर्ष तक की सजा) 3 वर्ष में अदालत ले जाएं', te: 'తీవ్రమైన నేరాలకు పరిమితి లేదు. చిన్న నేరాలు (3 ఏళ్ల వరకు జైలు) 3 సంవత్సరాల్లో కోర్టుకు తీసుకెళ్లాలి', offset: null }]
  }
};

// ---- 3. Plain-language glossary (jargon buster) ----
export const GLOSSARY = [
  { term: 'FIR (First Information Report)', hi: 'FIR (प्रथम सूचना रिपोर्ट)', te: 'FIR (ప్రథమ సమాచార నివేదిక)', def: { en: 'The first written record the police make of a serious (cognizable) crime. Filing it starts a criminal investigation.', hi: 'गंभीर (संज्ञेय) अपराध का पुलिस द्वारा पहला लिखित रिकॉर्ड। इससे आपराधिक जाँच शुरू होती है।', te: 'తీవ్రమైన (గుర్తించదగిన) నేరం గురించి పోలీసులు చేసే మొదటి లిఖిత రికార్డు. దీనితో నేర దర్యాప్తు మొదలవుతుంది.' } },
  { term: 'Vakalatnama', hi: 'वकालतनामा', te: 'వకాలత్నామా', def: { en: 'The document you sign to authorise a lawyer to represent you in court. Without it, a lawyer cannot appear for you.', hi: 'वह दस्तावेज जिस पर हस्ताक्षर कर आप वकील को अदालत में अपना प्रतिनिधित्व करने का अधिकार देते हैं।', te: 'కోర్టులో మీ తరపున వాదించడానికి న్యాయవాదికి అధికారం ఇచ్చే పత్రం. ఇది లేకుండా న్యాయవాది మీ కోసం హాజరు కాలేరు.' } },
  { term: 'Bail', hi: 'जमानत', te: 'బెయిల్', def: { en: 'Release of an arrested person from custody, usually against a bond/surety, on a promise to attend court.', hi: 'गिरफ्तार व्यक्ति की हिरासत से रिहाई, आमतौर पर बॉन्ड/जमानत पर, अदालत आने के वादे पर।', te: 'అరెస్టైన వ్యక్తిని కస్టడీ నుండి విడుదల చేయడం, సాధారణంగా బాండ్/ష్యూరిటీపై, కోర్టుకు హాజరవుతానని హామీతో.' } },
  { term: 'Anticipatory Bail', hi: 'अग्रिम जमानत', te: 'ముందస్తు బెయిల్', def: { en: 'Bail obtained in advance, before arrest, when you fear being arrested in a case (Section 438 CrPC).', hi: 'गिरफ्तारी से पहले प्राप्त जमानत, जब आपको किसी मामले में गिरफ्तारी का डर हो।', te: 'అరెస్టుకు ముందుగానే పొందే బెయిల్, ఒక కేసులో అరెస్టవుతానని భయపడినప్పుడు.' } },
  { term: 'Summons', hi: 'समन', te: 'సమన్లు', def: { en: 'An official court order telling you to appear in court or produce a document on a given date.', hi: 'एक आधिकारिक अदालती आदेश जो आपको दी गई तारीख पर अदालत में उपस्थित होने को कहता है।', te: 'నిర్ణీత తేదీన కోర్టుకు హాజరు కావాలని లేదా పత్రం సమర్పించాలని చెప్పే అధికారిక కోర్టు ఉత్తర్వు.' } },
  { term: 'Warrant', hi: 'वारंट', te: 'వారెంట్', def: { en: 'A court order authorising the police to arrest a person or search a place.', hi: 'पुलिस को किसी व्यक्ति को गिरफ्तार करने या स्थान की तलाशी का अधिकार देने वाला अदालती आदेश।', te: 'ఒక వ్యక్తిని అరెస్టు చేయడానికి లేదా ఒక ప్రదేశాన్ని సోదా చేయడానికి పోలీసులకు అధికారం ఇచ్చే కోర్టు ఉత్తర్వు.' } },
  { term: 'Charge Sheet', hi: 'आरोप पत्र', te: 'ఛార్జ్ షీట్', def: { en: 'The final report police file in court after investigation, listing the accused and the evidence against them.', hi: 'जाँच के बाद पुलिस द्वारा अदालत में दायर अंतिम रिपोर्ट, जिसमें आरोपी और सबूत सूचीबद्ध होते हैं।', te: 'దర్యాప్తు తర్వాత పోలీసులు కోర్టులో దాఖలు చేసే తుది నివేదిక, నిందితులను, సాక్ష్యాలను జాబితా చేస్తుంది.' } },
  { term: 'Cognizable Offence', hi: 'संज्ञेय अपराध', te: 'గుర్తించదగిన నేరం', def: { en: 'A serious crime where police can arrest without a warrant and start investigation on their own (e.g. theft, assault).', hi: 'गंभीर अपराध जहाँ पुलिस बिना वारंट गिरफ्तार कर स्वयं जाँच शुरू कर सकती है (जैसे चोरी)।', te: 'పోలీసులు వారెంట్ లేకుండా అరెస్టు చేసి, స్వయంగా దర్యాప్తు మొదలుపెట్టగల తీవ్రమైన నేరం (ఉదా. దొంగతనం).' } },
  { term: 'Bailable Offence', hi: 'जमानती अपराध', te: 'బెయిల్ లభించే నేరం', def: { en: 'A less serious offence where bail is a right and can be granted by the police or court.', hi: 'कम गंभीर अपराध जहाँ जमानत एक अधिकार है और पुलिस या अदालत दे सकती है।', te: 'బెయిల్ ఒక హక్కుగా ఉండి, పోలీసులు లేదా కోర్టు మంజూరు చేయగల తక్కువ తీవ్రమైన నేరం.' } },
  { term: 'Adjournment', hi: 'स्थगन', te: 'వాయిదా', def: { en: 'Postponing a court hearing to a later date.', hi: 'अदालत की सुनवाई को बाद की तारीख के लिए टालना।', te: 'కోర్టు విచారణను తర్వాతి తేదీకి వాయిదా వేయడం.' } },
  { term: 'Affidavit', hi: 'शपथ पत्र', te: 'అఫిడవిట్', def: { en: 'A written statement you swear to be true, signed before a notary or oath commissioner.', hi: 'एक लिखित बयान जिसे आप सत्य होने की शपथ लेते हैं, नोटरी के समक्ष हस्ताक्षरित।', te: 'నోటరీ ముందు సంతకం చేసి నిజమని ప్రమాణం చేసే లిఖిత ప్రకటన.' } },
  { term: 'Decree', hi: 'डिक्री', te: 'డిక్రీ', def: { en: 'The formal, final decision of a civil court that settles the rights of the parties.', hi: 'सिविल अदालत का औपचारिक अंतिम निर्णय जो पक्षों के अधिकार तय करता है।', te: 'పార్టీల హక్కులను నిర్ధారించే సివిల్ కోర్టు అధికారిక తుది నిర్ణయం.' } },
  { term: 'Injunction / Stay Order', hi: 'निषेधाज्ञा / रोक आदेश', te: 'నిషేధాజ్ఞ / స్టే ఉత్తర్వు', def: { en: 'A court order telling someone to stop doing something (or pausing an action) until the case is decided.', hi: 'किसी को कुछ करने से रोकने (या कार्रवाई रोकने) का अदालती आदेश जब तक मामला तय न हो।', te: 'కేసు తేలే వరకు ఒకరిని ఏదైనా చేయకుండా ఆపమని (లేదా చర్యను నిలిపివేయమని) చెప్పే కోర్టు ఉత్తర్వు.' } },
  { term: 'Plaintiff', hi: 'वादी', te: 'వాది', def: { en: 'The person who files a civil case (the one making the complaint).', hi: 'वह व्यक्ति जो सिविल मामला दायर करता है (शिकायतकर्ता)।', te: 'సివిల్ కేసు దాఖలు చేసే వ్యక్తి (ఫిర్యాదు చేసేవారు).' } },
  { term: 'Defendant', hi: 'प्रतिवादी', te: 'ప్రతివాది', def: { en: 'The person against whom a civil case is filed.', hi: 'वह व्यक्ति जिसके विरुद्ध सिविल मामला दायर होता है।', te: 'ఎవరిపై సివిల్ కేసు దాఖలు చేయబడుతుందో ఆ వ్యక్తి.' } },
  { term: 'Petitioner', hi: 'याचिकाकर्ता', te: 'పిటిషనర్', def: { en: 'The person who files a petition (e.g. a writ or appeal) in a higher court.', hi: 'वह व्यक्ति जो उच्च अदालत में याचिका (जैसे रिट या अपील) दायर करता है।', te: 'ఉన్నత కోర్టులో పిటిషన్ (రిట్ లేదా అప్పీల్) దాఖలు చేసే వ్యక్తి.' } },
  { term: 'Respondent', hi: 'प्रत्यर्थी', te: 'ప్రతివాది (రెస్పాండెంట్)', def: { en: 'The person who must respond to a petition or appeal — the opposite side.', hi: 'वह व्यक्ति जिसे याचिका या अपील का उत्तर देना होता है — विपक्ष।', te: 'పిటిషన్ లేదా అప్పీల్‌కు జవాబు ఇవ్వాల్సిన వ్యక్తి — ప్రత్యర్థి పక్షం.' } },
  { term: 'Ex-parte', hi: 'एकपक्षीय', te: 'ఏకపక్షం', def: { en: 'A court decision made when one side is absent. You can apply to set it aside if you had a genuine reason for missing.', hi: 'एक पक्ष की अनुपस्थिति में लिया गया निर्णय। वैध कारण होने पर इसे रद्द कराने का आवेदन कर सकते हैं।', te: 'ఒక పక్షం హాజరుకానప్పుడు తీసుకున్న నిర్ణయం. సరైన కారణం ఉంటే దానిని రద్దు చేయమని దరఖాస్తు చేయవచ్చు.' } },
  { term: 'Cause List', hi: 'वाद सूची', te: 'కాజ్ లిస్ట్', def: { en: 'The daily list of cases a court will hear that day, with their case numbers and order.', hi: 'उस दिन अदालत द्वारा सुने जाने वाले मामलों की दैनिक सूची।', te: 'ఆ రోజు కోర్టు విచారించే కేసుల రోజువారీ జాబితా, వాటి కేసు నంబర్లతో.' } },
  { term: 'CNR Number', hi: 'CNR संख्या', te: 'CNR నంబర్', def: { en: 'A unique 16-character ID given to every case across Indian courts. Use it to track your case status online.', hi: 'भारतीय अदालतों में हर मामले को दी गई अद्वितीय 16-अक्षर ID। इससे ऑनलाइन स्थिति ट्रैक करें।', te: 'భారత కోర్టులలో ప్రతి కేసుకు ఇచ్చే ప్రత్యేకమైన 16-అక్షరాల ID. దీనితో ఆన్‌లైన్‌లో స్థితిని ట్రాక్ చేయండి.' } },
  { term: 'Lok Adalat', hi: 'लोक अदालत', te: 'లోక్ అదాలత్', def: { en: 'A “people’s court” that settles disputes by compromise, quickly and free of court fees. Its award is final.', hi: 'एक "जन अदालत" जो समझौते से विवाद जल्दी और बिना कोर्ट फीस के सुलझाती है। इसका निर्णय अंतिम है।', te: 'రాజీ ద్వారా వివాదాలను వేగంగా, కోర్టు ఫీజులు లేకుండా పరిష్కరించే "ప్రజా న్యాయస్థానం". దీని తీర్పు అంతిమం.' } },
  { term: 'PIL (Public Interest Litigation)', hi: 'जनहित याचिका', te: 'ప్రజా ప్రయోజన వ్యాజ్యం (PIL)', def: { en: 'A case filed for the benefit of the public, which any citizen can file in a High Court or the Supreme Court.', hi: 'जनता के हित में दायर मामला, जिसे कोई भी नागरिक उच्च या सर्वोच्च अदालत में दायर कर सकता है।', te: 'ప్రజల ప్రయోజనం కోసం దాఖలు చేసే కేసు, ఏ పౌరుడైనా హైకోర్టు లేదా సుప్రీంకోర్టులో దాఖలు చేయవచ్చు.' } },
  { term: 'Limitation Period', hi: 'परिसीमा अवधि', te: 'పరిమితి కాలం', def: { en: 'The legal deadline by which a case must be filed. Miss it and the court may refuse to hear you.', hi: 'वह कानूनी समय-सीमा जिसके भीतर मामला दायर करना होता है। चूकने पर अदालत सुनवाई से मना कर सकती है।', te: 'కేసు దాఖలు చేయాల్సిన న్యాయపరమైన గడువు. దాటిపోతే కోర్టు వినడానికి నిరాకరించవచ్చు.' } },
  { term: 'Jurisdiction', hi: 'क्षेत्राधिकार', te: 'అధికార పరిధి', def: { en: 'The power of a particular court to hear a case — based on the place, subject and value involved.', hi: 'किसी विशेष अदालत की मामला सुनने की शक्ति — स्थान, विषय और मूल्य के आधार पर।', te: 'ఒక నిర్దిష్ట కోర్టుకు కేసు వినే అధికారం — ప్రదేశం, విషయం, విలువ ఆధారంగా.' } },
  { term: 'Cross-examination', hi: 'जिरह', te: 'క్రాస్-ఎగ్జామినేషన్', def: { en: 'Questioning the other side’s witness in court to test whether their evidence is true.', hi: 'दूसरे पक्ष के गवाह से अदालत में सवाल करना ताकि उसकी गवाही की सच्चाई परखी जा सके।', te: 'అవతలి పక్షం సాక్షిని కోర్టులో ప్రశ్నించడం, వారి సాక్ష్యం నిజమో కాదో పరీక్షించడానికి.' } }
];
