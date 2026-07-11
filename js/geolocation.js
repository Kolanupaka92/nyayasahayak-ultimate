// ============================================
// geolocation.js — find nearby legal help
// Uses the browser Geolocation API when available and
// always falls back to a district-based manual list so
// the feature works offline / without GPS permission.
// ============================================

export function getCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// Static list of essential legal-aid contacts for a district.
// Phone numbers marked XXX are placeholders the user confirms locally.
export function nearbyServices(district, lang = 'en') {
  const tr = (en, hi, te) => (lang === 'te' ? te : lang === 'hi' ? hi : en);
  const d = district || tr('District HQ', 'जिला मुख्यालय', 'జిల్లా ప్రధాన కార్యాలయం');
  return [
    { icon: '🏛️', name: tr('District Court', 'जिला न्यायालय', 'జిల్లా న్యాయస్థానం'), address: d, phone: '', map: `${d} District Court`, dist: '~2 km' },
    { icon: '👮', name: tr('Police Station', 'पुलिस स्टेशन', 'పోలీస్ స్టేషన్'), address: d, phone: '100', map: `${d} Police Station`, dist: '~1 km' },
    { icon: '⚖️', name: 'DLSA ' + tr('Office', 'कार्यालय', 'కార్యాలయం'), address: tr('Court Complex', 'न्यायालय परिसर', 'కోర్టు ప్రాంగణం'), phone: '15100', map: `${d} District Legal Services Authority`, dist: '~2 km' },
    { icon: '🏛️', name: tr('Tehsildar Office', 'तहसील कार्यालय', 'తహసీల్దార్ కార్యాలయం'), address: tr('Collectorate', 'कलेक्ट्रेट', 'కలెక్టరేట్'), phone: '', map: `${d} Tehsil Office`, dist: '~3 km' },
    { icon: '🏥', name: tr('Govt Hospital', 'सरकारी अस्पताल', 'ప్రభుత్వ ఆసుపత్రి'), address: d, phone: '102', map: `${d} Government Hospital`, dist: '~2 km' },
    { icon: '📞', name: 'NALSA', address: tr('New Delhi', 'नई दिल्ली', 'న్యూఢిల్లీ'), phone: '15100', map: '', dist: tr('Toll Free', 'टोल फ्री', 'టోల్ ఫ్రీ') }
  ];
}

// Build a Google Maps search link for a place near given coords.
export function mapLink(query, coords) {
  const q = encodeURIComponent(query);
  if (coords) return `https://www.google.com/maps/search/${q}/@${coords.lat},${coords.lng},14z`;
  return `https://www.google.com/maps/search/${q}`;
}
