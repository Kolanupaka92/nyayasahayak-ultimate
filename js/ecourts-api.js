// ============================================
// ecourts-api.js — case status lookup helper
// The official eCourts services (services.ecourts.gov.in)
// require a CAPTCHA and do not expose a public CORS API,
// so this module builds authenticated deep-links to the
// official portals rather than scraping. It works offline
// by generating the correct URLs the user opens in a tab.
// ============================================

export const ECOURTS_PORTALS = {
  districtCourt: 'https://services.ecourts.gov.in/ecourtindia_v6/',
  highCourt: 'https://hcservices.ecourts.gov.in/hcservices/main.php',
  supremeCourt: 'https://main.sci.gov.in/case-status',
  njdg: 'https://njdg.ecourts.gov.in/njdgnew/index.php',
  virtualCourt: 'https://vcourts.gov.in/',
  eFiling: 'https://filing.ecourts.gov.in/'
};

// Case types users can look up, mapped to the right portal.
export function lookupTargets(caseType) {
  const t = (caseType || '').toLowerCase();
  const targets = [
    { label: 'District & Taluka Courts', url: ECOURTS_PORTALS.districtCourt, note: 'Search by CNR / case number / party name' },
    { label: 'High Court Cases', url: ECOURTS_PORTALS.highCourt, note: 'State High Court case status' },
    { label: 'National Judicial Data Grid', url: ECOURTS_PORTALS.njdg, note: 'Pending & disposed case statistics' }
  ];
  if (/writ|constitution|supreme/.test(t)) {
    targets.unshift({ label: 'Supreme Court of India', url: ECOURTS_PORTALS.supremeCourt, note: 'Apex court case status' });
  }
  if (/cheque|traffic|petty/.test(t)) {
    targets.unshift({ label: 'Virtual Courts', url: ECOURTS_PORTALS.virtualCourt, note: 'Online hearing / e-challan cases' });
  }
  return targets;
}

// Validate a CNR number (16-char alphanumeric case identifier).
export function isValidCNR(cnr) {
  return /^[A-Za-z]{4}\d{2}\d{6}\d{4}$/.test((cnr || '').replace(/\s+/g, ''));
}

// Format a saved case into a shareable status summary.
export function statusSummary(caseObj) {
  return {
    id: caseObj.id,
    cnr: caseObj.cnr || '—',
    court: caseObj.court || 'To be assigned',
    caseNumber: caseObj.num || '—',
    nextDate: caseObj.nextDate || 'Not scheduled',
    stage: caseObj.stage || caseObj.status || 'Active'
  };
}
