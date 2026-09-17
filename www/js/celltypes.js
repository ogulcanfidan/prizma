// CellTypes — ortak sabitler: hücre tipleri, yönler, ayna yansıma kuralları, renk yardımcıları.
// Godot scripts/CellTypes.gd dosyasının birebir JS karşılığı.

export const Cell = Object.freeze({
  EMPTY: 0,
  WALL: 1,
  SOURCE: 2,
  TARGET: 3,
  PORTAL: 4,
  SPLITTER: 5,
});

export const Dir = Object.freeze({
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
});

export const MirrorType = Object.freeze({
  FORWARD_SLASH: 0, // '/'
  BACK_SLASH: 1,    // '\'
});

const DIR_VECTORS = {
  [Dir.UP]: { x: 0, y: -1 },
  [Dir.RIGHT]: { x: 1, y: 0 },
  [Dir.DOWN]: { x: 0, y: 1 },
  [Dir.LEFT]: { x: -1, y: 0 },
};

export function dirToVec(d) {
  return DIR_VECTORS[d];
}

export function vecToDir(v) {
  for (const d of Object.keys(DIR_VECTORS)) {
    const dv = DIR_VECTORS[d];
    if (dv.x === v.x && dv.y === v.y) return Number(d);
  }
  console.error("vecToDir: geçersiz vektör", v);
  return Dir.UP;
}

// '/' aynası: yukarı<->sağ, aşağı<->sol
// '\' aynası: yukarı<->sol, aşağı<->sağ
export function reflect(d, mirror) {
  const v = dirToVec(d);
  let out;
  if (mirror === MirrorType.FORWARD_SLASH) {
    out = { x: -v.y, y: -v.x };
  } else {
    out = { x: v.y, y: v.x };
  }
  return vecToDir(out);
}

export function turnLeft(d) {
  return (d + 3) % 4;
}

export function turnRight(d) {
  return (d + 1) % 4;
}

// --- Renkler: R,G,B her biri 0 ya da 1 (ışık varlığı/yokluğu, katmanlı karışım) ---
export const COLOR_NONE = { r: 0, g: 0, b: 0 };
export const COLOR_RED = { r: 1, g: 0, b: 0 };
export const COLOR_GREEN = { r: 0, g: 1, b: 0 };
export const COLOR_BLUE = { r: 0, g: 0, b: 1 };
export const COLOR_YELLOW = { r: 1, g: 1, b: 0 };
export const COLOR_MAGENTA = { r: 1, g: 0, b: 1 };
export const COLOR_CYAN = { r: 0, g: 1, b: 1 };
export const COLOR_WHITE = { r: 1, g: 1, b: 1 };

export function colorUnion(a, b) {
  return { r: Math.max(a.r, b.r), g: Math.max(a.g, b.g), b: Math.max(a.b, b.b) };
}

// Tamamlayıcı renk (r,g,b her biri 0/1 olduğu için basitçe ters çevrilir).
// Tek bir primary rengin (ör. KIRMIZI) tamamlayıcısı, diğer iki kanalın
// birleşimidir (ör. YEŞİL+MAVİ = CYAN) — union'ları HER ZAMAN tam beyaz
// (1,1,1) olur. generator.js → tryMultiBeam'de paylaşılan (2 kaynaklı)
// hedeflerin her zaman beyaz olmasını garanti etmek için kullanılıyor
// (kullanıcı isteği — bkz. generator.js'teki yorum).
export function colorComplement(c) {
  return { r: c.r ? 0 : 1, g: c.g ? 0 : 1, b: c.b ? 0 : 1 };
}

export function colorEquals(a, b) {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function colorKey(c) {
  return `${c.r}${c.g}${c.b}`;
}

export function posKey(p) {
  return `${p.x},${p.y}`;
}

export function posEquals(a, b) {
  return a.x === b.x && a.y === b.y;
}
