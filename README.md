# ⚖️ NyayaSahayak — Free Legal Aid for Every Citizen

A **privacy-first, offline-capable Progressive Web App** that helps ordinary citizens in India navigate the judicial system — understand court notices, track their case, avoid attorney fraud, generate legal drafts, and find free legal aid — all in **12 Indian languages**.

> Everything runs **on your device**. No servers, no accounts, no tracking. Your case data never leaves your phone.

## ✨ Features

| Feature | What it does |
| --- | --- |
| 📋 **My Case** | Record case details & documents locally (optionally PIN-encrypted). |
| 🔎 **Case Status** | Deep-links to the official eCourts / High Court / NJDG portals + CNR validation. |
| 🛣️ **Step Guide** | Three action paths — DIY, Hybrid, Full Attorney — with timelines & document checklists. |
| 🚨 **Red Flags** | 15+ attorney-fraud warning signs and a quick self-check. |
| 👨‍⚖️ **Attorney Monitor** | Log every interaction with your lawyer and verify Bar Council enrollment. |
| 🔍 **AI Analyzer** | On-device notice analysis — language & category detection, date/amount extraction, plain-language explanation. **🎤 Voice input:** speak your notice in English / Hindi / Telugu and it is transcribed to text (Web Speech API). |
| ✍️ **Drafts** | Generate print-ready legal drafts (appeal, bail, FIR, RTI, legal notice, affidavit…). |
| 📍 **Nearby** | Courts, police, DLSA & hospitals near you (GPS or district-based). |
| 📚 **Rights** | Know your rights — arrest, women, consumer, tenant, worker, FIR. |
| 📞 **Helpline** | Emergency numbers + read-aloud voice help for low-literacy users. |

- 🌐 **12 languages** — English, हिंदी, తెలుగు, தமிழ், ಕನ್ನಡ, বাংলা, मराठी, ગુજરાતી, ਪੰਜਾਬੀ, മലയാളം, ଓଡ଼ିଆ, اردو
- 📴 **Works offline** — full PWA with service worker + installable to home screen
- 🔒 **AES-GCM encryption** — optional 4-digit PIN protects locally stored case data
- 🌓 **Light / dark theme**
- 🗺️ **All 28 states + 8 UTs** with districts, High Court, land law & land-records portal

## 🏗️ Project structure

```
nyayasahayak-ultimate/
├── index.html            # App shell
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker (offline cache)
├── css/styles.css        # Theme + layout
├── js/
│   ├── app.js            # Main controller & page rendering
│   ├── ai-engine.js      # On-device notice analysis
│   ├── ecourts-api.js    # Official portal deep-links & CNR checks
│   ├── encryption.js     # Web Crypto AES-GCM helpers
│   ├── geolocation.js    # Nearby legal-help finder
│   ├── districts-data.js # States/UTs, districts, red flags, i18n
│   └── ivr.js            # Text-to-speech voice help
└── icons/                # PWA icons (192, 512)
```

## 🚀 Run locally

No build step — it's vanilla ES modules. Serve the folder over HTTP (service workers need `http://`, not `file://`):

```bash
npx serve .        # or: python3 -m http.server 8080
```

Then open the printed URL.

## 📦 Deploy

Any static host works. This repo is configured for **Vercel** (`vercel.json`):

```bash
vercel --prod
```

## ⚠️ Disclaimer

NyayaSahayak provides **general legal information and templates, not legal advice**. Drafts and analyses are starting points — always have them reviewed by a qualified legal professional before filing. For free professional aid, call **NALSA 15100**.

## 📄 License

MIT — see [LICENSE](LICENSE).
