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
  const d = district || (lang === 'hi' ? 'जिला मुख्यालय' : 'District HQ');
  const hi = lang === 'hi';
  return [
    { icon: '🏛️', name: hi ? 'जिला न्यायालय' : 'District Court', address: d, phone: '', map: `${d} District Court`, dist: '~2 km' },
    { icon: '👮', name: hi ? 'पुलिस स्टेशन' : 'Police Station', address: d, phone: '100', map: `${d} Police Station`, dist: '~1 km' },
    { icon: '⚖️', name: 'DLSA ' + (hi ? 'कार्यालय' : 'Office'), address: hi ? 'न्यायालय परिसर' : 'Court Complex', phone: '15100', map: `${d} District Legal Services Authority`, dist: '~2 km' },
    { icon: '🏛️', name: hi ? 'तहसील कार्यालय' : 'Tehsildar Office', address: hi ? 'कलेक्ट्रेट' : 'Collectorate', phone: '', map: `${d} Tehsil Office`, dist: '~3 km' },
    { icon: '🏥', name: hi ? 'सरकारी अस्पताल' : 'Govt Hospital', address: d, phone: '102', map: `${d} Government Hospital`, dist: '~2 km' },
    { icon: '📞', name: 'NALSA', address: hi ? 'नई दिल्ली' : 'New Delhi', phone: '15100', map: '', dist: hi ? 'टोल फ्री' : 'Toll Free' }
  ];
}

// Build a Google Maps search link for a place near given coords.
export function mapLink(query, coords) {
  const q = encodeURIComponent(query);
  if (coords) return `https://www.google.com/maps/search/${q}/@${coords.lat},${coords.lng},14z`;
  return `https://www.google.com/maps/search/${q}`;
}
