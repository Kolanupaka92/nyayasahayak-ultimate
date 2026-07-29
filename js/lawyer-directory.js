// ============================================
// lawyer-directory.js — verified private-lawyer directory + budget router
//
// PHASE 1a: this ships the ROUTER and the (empty) directory shell.
//
// VERIFIED_LAWYERS is intentionally EMPTY. It must ONLY ever contain
// advocates who have (a) opted in and (b) had their Bar Council enrolment
// verified. NEVER add placeholder / unverified / sample entries — this is a
// legal-trust surface and fake listings would mislead and endanger users.
// Real entries arrive in Phase 1b (lawyer self-onboarding + verification).
//
// Lawyer shape (for Phase 1b):
//   { id, name, enrollment_no, state_bar, verified_status:'verified',
//     verified_at, practice_areas:[caseType...], jurisdictions:[district...],
//     languages:[langCode...], fee_band:{min,max}, availability, rating,
//     opted_in:true }
// ============================================

export const VERIFIED_LAWYERS = [];

// Map a case budget (₹) to the recommended track.
export function routeByBudget(budget) {
  const b = Number(budget) || 0;
  if (b <= 0) return 'freeaid';        // public / free legal aid
  if (b < 5000) return 'lowcost';      // Lok Adalat, Tele-Law, clinics, DIY
  if (b < 25000) return 'private_simple';
  return 'private_full';
}

// Filter verified, opted-in lawyers by case attributes. Returns [] until
// real verified advocates exist.
export function findLawyers({ state, district, caseType, language, maxFee } = {}) {
  return VERIFIED_LAWYERS.filter(l =>
    l.opted_in && l.verified_status === 'verified'
    && (!state || l.state_bar === state || l.jurisdictions?.some(j => j.startsWith(state)))
    && (!district || !l.jurisdictions || l.jurisdictions.includes(district))
    && (!caseType || !l.practice_areas || l.practice_areas.includes(caseType))
    && (!language || !l.languages || l.languages.includes(language))
    && (!maxFee || (l.fee_band?.min ?? 0) <= Number(maxFee))
  );
}

// How many verified lawyers exist for a district (for the directory state).
export function verifiedCount(district) {
  return VERIFIED_LAWYERS.filter(l => l.opted_in && l.verified_status === 'verified'
    && (!district || !l.jurisdictions || l.jurisdictions.includes(district))).length;
}
