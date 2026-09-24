// Theme — "Karanlık + Neon Lab" ortak görsel dil. Değerler, onaylanan
// prizma-styles.html mockup'ındaki (Stil A) SVG renkleriyle ve Godot
// UITheme.gd paletiyle birebir eşleşir.

export const UI = {
  bgDeep: "#0B0C12",
  bgPanel: "rgba(20,22,32,0.94)",
  textPrimary: "#E6F2FF",
  textMuted: "#94A3BD",

  accentCyan: "#40EBFF",
  accentAmber: "#FFC240",
  accentMagenta: "#FF52B8",
  accentViolet: "#B87AFF",
  // Zorluk renklerinde "usta" bandı artık koyu/doygun bir kırmızı neon
  // ile temsil ediliyor (öncesi: accentViolet).
  accentCrimson: "#FF1E3C",
};

export const DIFFICULTY_COLOR = {
  kolay: UI.accentCyan,
  orta: UI.accentAmber,
  zor: UI.accentMagenta,
  usta: UI.accentCrimson,
};

export function difficultyColor(diff) {
  return DIFFICULTY_COLOR[diff] || UI.accentCyan;
}

export const DIFFICULTY_LABEL = {
  kolay: "KOLAY",
  orta: "ORTA",
  zor: "ZOR",
  usta: "USTA",
};

// --- Tahta / ışın renkleri (prizma-styles.html mockup'ından birebir) --------
export const BOARD = {
  bgFrom: "#171B30",
  bgTo: "#0A0D18",
  wallFill: "#232842",
  wallStroke: "#3A4166",
  gridLine: "rgba(255,255,255,0.05)",

  // Oyuncunun aynası gümüş-beyaz: eskiden altın sarısıydı ve Orta'nın amber
  // vurgu rengiyle (çerçeve/rozet) karışıyordu.
  mirror: "#EEF4FF",
  // Sabit (oyuncunun yerleştirmediği/kaldıramadığı) ortam aynası. Eskiden
  // `mirror` ile BİREBİR aynı renkte çizildiği için, bölüm başında zaten
  // yerleşik duran bir ayna görüldüğünde bug gibi algılanıyordu; şimdi
  // soğuk gri-mor bir ton — oyuncunun sıcak/altın rengindeki kendi
  // aracından bilinçli olarak farklı, duvar/ızgara ailesine daha yakın
  // (bu bir montaj parçası, oyuncunun yerleştirdiği bir ayna değil).
  fixedMirror: "#8B93C4",
  portal: "#B98CFF",
  splitter: "#40EBFF",

  none: "#3A4166", // sönük / henüz aydınlanmamış hedef
};

// Oyun-mantığı rengi (r,g,b her biri 0/1) -> görsel hex. Katmanlı karışım
// kombinasyonları mockup'ta yok; aynı neon aileden tutarlı tonlar seçildi.
const COLOR_MAP = {
  "000": BOARD.none,
  "100": "#FF5C7A", // R
  "010": "#3DDC97", // G
  "001": "#4D8BFF", // B — turkuaz (G+B) ve splitter camgöbeğinden ayrışsın diye daha koyu mavi
  "110": "#FFE066", // R+G
  "101": "#FF7AE0", // R+B
  "011": "#6FFFE0", // G+B
  "111": "#FFFFFF", // R+G+B
};

export function colorToHex(c) {
  const key = `${c.r}${c.g}${c.b}`;
  return COLOR_MAP[key] || BOARD.none;
}
