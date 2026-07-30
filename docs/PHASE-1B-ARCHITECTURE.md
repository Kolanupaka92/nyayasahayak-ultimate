# NyayaSahayak — Phase 1b Architecture & Plan

Verified-lawyer directory + lead generation. **No payments** (Phase 2). This
doc is the plan to hand to Indian legal counsel and to line up lawyer supply
in parallel with engineering.

---

## 0. Decisions this builds on

- **Customer = citizen.** Marketplace is two-sided (citizens ⇄ lawyers) but
  **referral-first**: connect, don't transact. Payments/escrow are Phase 2.
- **Budget router (Phase 1a, shipped):** ₹0 → free public lawyer; < ₹5k →
  Lok Adalat / Tele-Law / clinics / DIY; ≥ ₹5k → verified private lawyer.
- **Editorial firewall (hard rule):** Red Flags / Attorney Monitor stay
  independent of any commercial relationship. No pay-for-placement, ever.
  Verification is the product.
- **Privacy split:** citizen case data is private/on-device by default
  ("Private mode"); it is shared with a lawyer **only on explicit consent**
  ("Connected mode"), and only the minimum needed.

## 1. Why Phase 1b needs a backend

A verified directory requires things a static PWA cannot do: hold lawyer
profiles, verify Bar Council enrolment, moderate, and route leads with
notifications. **Recommendation: Supabase** (Postgres + RLS + Auth + Storage
+ Edge Functions), in an **India region** (DPDP / data-localization).

```
Citizen PWA (private-by-default)        Lawyer console (KYC'd, verified)
        │  explicit consent to connect          │
        ▼                                        ▼
        Supabase Edge Functions (API, typed) + Auth (phone/email OTP)
        │
  Postgres + Row-Level Security (India region)
    · lawyers · lawyer_verifications · leads · reviews · audit_log
  Storage (KYC docs, encrypted)   ·   Notifications (SMS/WhatsApp/push)
        │
  Admin/Ops console (T&S: verify, moderate, de-list)
```

Everything the citizen app does today stays local; the backend is **additive**
and only engaged when a citizen chooses "connect me to a lawyer."

## 2. Data model (Postgres)

```sql
lawyers (
  id uuid pk, name text, enrollment_no text, state_bar text,
  verified_status text check (in 'pending','verified','rejected','suspended'),
  verified_at timestamptz, practice_areas text[], jurisdictions text[],
  languages text[], fee_band int4range, availability jsonb,
  rating numeric, opted_in bool default false, created_at timestamptz )

lawyer_verifications ( id, lawyer_id fk, method text, evidence_url text,
  reviewer_id, decision text, notes text, decided_at )   -- KYC audit trail

leads ( id, citizen_ref text /* pseudonymous */, lawyer_id fk, case_type,
  district, language, budget_band, status text
  /* new→accepted→contacted→closed */, consent_snapshot jsonb, created_at )

reviews ( id, lead_id fk, rating int, text, verified_engagement bool,
  moderation_status text, created_at )

audit_log ( id, actor, action, entity, entity_id, at, meta jsonb )  -- immutable
```

**RLS:** a lawyer sees only their own rows + leads assigned to them; citizens
see only verified/opted-in lawyers and their own leads; T&S/admin role for
verification. **No citizen PII in `leads` beyond what consent captured** — use
a pseudonymous ref and share contact only after the lawyer accepts.

## 3. Lawyer verification & Trust-&-Safety workflow

This is the product, not a checkbox.

1. **Onboard:** lawyer signs up (phone OTP), submits name, **enrolment
   number**, State Bar, practice areas, jurisdictions, languages, fee bands.
2. **Verify enrolment** against the State Bar Council / BCI record
   (start: manual review by ops against the official roll; later: automate if
   an official verification API/roll is accessible). Store evidence + decision
   in `lawyer_verifications` (audit trail).
3. **KYC:** ID + a selfie/liveness check (via a KYC vendor); documents stored
   encrypted in Storage, access-logged.
4. **Only `verified` + `opted_in` lawyers are visible.** `pending` never shows.
5. **Ongoing T&S:** ratings with fake-review defenses (only `verified_engagement`
   reviews count), a complaints channel, and **de-listing/suspension** for
   misconduct — surfaced back into the citizen-side Red Flags where relevant.
6. **Re-verification** on a cadence (enrolment can lapse/be suspended).

## 4. Lead flow (no money)

Citizen (Connected mode) → picks/gets matched to a verified lawyer →
creates a **lead** with an explicit **consent snapshot** (what is shared) →
lawyer is notified (SMS/WhatsApp/push) → lawyer accepts → citizen contact is
released → status tracked to close. Off-platform fee arrangement in Phase 1b
(app only warns/guides via the Red Flags checklist). Escrow/payment = Phase 2.

## 5. Security & compliance (must-haves before go-live)

- **Data residency:** India region; DPDP-aligned. DPIA before launch.
- **Consent & DSAR:** granular consent for Connected mode; erasure/rectification
  workflow (DPDP §12 / GDPR 15–17); retention limits on leads/PII.
- **AuthN/Z:** OTP (phone for lawyers/email fallback), RBAC (citizen / lawyer /
  ops-T&S / admin), least privilege, session management, MFA for ops.
- **Encryption:** TLS in transit; at-rest encryption; KYC docs envelope-encrypted;
  audit log immutable/append-only.
- **AppSec:** the CSP / sanitization / KDF hardening already shipped on the
  citizen client; extend to the console. SAST/DAST/SCA in CI; pen test pre-launch.
- **Observability:** logging, metrics, error tracking, alerting, SLOs — the
  moment there's a backend, being blind is unacceptable.

## 6. The regulatory gates (get an Indian legal-ethics opinion FIRST)

These can reshape the model; do not build payments/monetization until cleared:
- **BCI advertising/solicitation (Rule 36):** position strictly as a neutral
  **listing/technology platform** with **lawyer opt-in**; avoid testimonials,
  comparative/ranking claims, and anything that reads as the lawyer soliciting.
- **Fee-sharing prohibition:** platform must not take a **cut of the legal fee**.
  This is why Phase 2 monetization is likely **lawyer subscription / lead fee**
  or a **client-side platform fee**, not a commission. (Decision deferred.)
- **Payments (Phase 2):** any client↔lawyer money → licensed **Payment
  Aggregator** (Razorpay/Cashfree) + escrow; RBI PA rules. Never roll your own.
- **UPL:** the app's own outputs stay "information," real advice comes from the
  verified advocate.

## 7. Go-to-market: seed narrow, or the marketplace dies

Liquidity is per **district × practice area × language**. Do NOT launch
nationwide.

- **Pilot: one city** (candidate: Hyderabad or a Tier-2 city with a motivated
  DLSA), **2–3 practice areas** where volume + fixed-fee are natural:
  **cheque bounce (S.138), family/matrimonial, property/rental.**
- **Seed supply first:** recruit + verify a starter panel (target ~20–50
  verified advocates across the chosen areas) BEFORE exposing the directory —
  the honest "launching soon" state (already built) buys this time.
- **Anchor trust via institutions:** partner with the **DLSA / State Legal
  Services Authority** and law-college legal-aid cells for the free/low-cost
  side; it lends credibility to the paid side and supplies the free track.
- **Instrument (privacy-preserving):** measure match requests, accept rate,
  time-to-first-contact, close rate — the marketplace health metrics.

## 8. Milestones

- **M1 — Backend foundation:** Supabase (India), Auth (OTP), schema + RLS,
  observability, CI with security scans.
- **M2 — Lawyer onboarding + verification:** console, KYC, enrolment review,
  audit trail; ops T&S tooling.
- **M3 — Directory + leads:** citizen "Connected mode" with consent, matching
  surfaces the verified panel, lead notifications, status tracking.
- **M4 — Reviews + de-listing:** verified-engagement reviews, complaints,
  suspension flow wired back to Red Flags.
- **(Phase 2) — Payments/escrow** once money model chosen + legal opinion in.

## 9. Open decisions for leadership

1. **Money model** (subscription vs client-fee vs …) — gates legal structure &
   payments. Still undecided.
2. **Pilot city + practice areas** — pick to line up DLSA + supply.
3. **KYC vendor** and whether an official Bar Council verification path exists.
4. **Who owns compliance** (DPIA, DPDP, T&S SLAs) — needs a named owner + counsel.
```
