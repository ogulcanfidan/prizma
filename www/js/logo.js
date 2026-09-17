// LogoMark — ana menüde görünen "ışığı ayıran prizma" simgesi.
//
// v3: v2 zaten tek renkliydi ama üçgenden çıkan ÜÇ paralel çizgi + glow
// filtresi hâlâ görsel olarak "kalabalık" duruyordu. v3 bunu kökten
// sadeleştiriyor: TEK giriş çizgisi + üçgen + TEK çıkış çizgisi (kırılan tek
// bir ışın — "refraksiyon" fikri en yalın hâliyle), glow YOK, sadece iki ince
// çizgi ve bir üçgen anahat. Mümkün olan en az elemanla "ışık prizmadan
// kırılarak geçer" anlatılıyor.

import { UI } from "./theme.js";

export function renderLogo() {
  const w = 120,
    h = 120;
  const cx = 60,
    cy = 60;
  const r = 24; // üçgenin yatay yarı-genişliği
  // Eşkenar üçgen, sivri ucu sağa bakıyor.
  const tri = `M${cx - r},${cy - r * 1.05} L${cx + r * 1.15},${cy} L${cx - r},${cy + r * 1.05} Z`;

  // Giriş: sol üstten üçgenin sol kenarına inen tek düz çizgi.
  const inX1 = cx - r - 26,
    inY1 = cy - 20;
  const inX2 = cx - r * 0.35,
    inY2 = cy - r * 0.35;

  // Çıkış: üçgenin sivri ucundan sağ alta kırılarak devam eden tek çizgi
  // (giriş açısından FARKLI bir açı — "kırılma" hissi net olsun diye).
  const outX1 = cx + r * 1.15,
    outY1 = cy;
  const outX2 = cx + r * 1.15 + 30,
    outY2 = cy + 22;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${inX1}" y1="${inY1}" x2="${inX2}" y2="${inY2}" stroke="${UI.textPrimary}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
    <line x1="${outX1}" y1="${outY1}" x2="${outX2}" y2="${outY2}" stroke="${UI.textPrimary}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
    <path d="${tri}" fill="none" stroke="${UI.textPrimary}" stroke-width="2.4" stroke-linejoin="round"/>
  </svg>`;
}
