// campaignLevels.js — "Bölümler" modunun sabit bölüm listesi.
//
// Her bölüm bir TOHUM (seed) + zorluktan ibaret: bulmaca, üreticinin
// deterministik moduyla (bkz. generator.js → generate opts.deterministic)
// çalışma anında yeniden üretilir, yani HER CİHAZDA BİREBİR AYNI çıkar ve
// depoda bulmaca verisi taşımaya gerek kalmaz.
//
// Liste elle seçilmedi, üretilip SÜZÜLDÜ: zorluk bandı ve gereken ayna sayısı
// bölüm ilerledikçe kademeli artacak şekilde (Kolay 4→5, Orta 5→7, Zor 6→8,
// Usta 7→9 ayna) taranarak belirlendi. Yeni bölüm eklemek = listeye yeni
// {diff, seed} satırı eklemek.

export const CAMPAIGN_LEVELS = [
  { diff: "kolay", seed: 500004 }, //  1 — 4 ayna, 8x8
  { diff: "kolay", seed: 500016 }, //  2 — 4 ayna, 8x8
  { diff: "kolay", seed: 500021 }, //  3 — 4 ayna, 8x8
  { diff: "kolay", seed: 500029 }, //  4 — 4 ayna, 8x8
  { diff: "kolay", seed: 500033 }, //  5 — 4 ayna, 8x8
  { diff: "kolay", seed: 500036 }, //  6 — 4 ayna, 8x8
  { diff: "kolay", seed: 500039 }, //  7 — 4 ayna, 8x8
  { diff: "kolay", seed: 500046 }, //  8 — 4 ayna, 8x8
  { diff: "kolay", seed: 500047 }, //  9 — 5 ayna, 8x8
  { diff: "kolay", seed: 500048 }, // 10 — 5 ayna, 8x8
  { diff: "kolay", seed: 500050 }, // 11 — 5 ayna, 8x8
  { diff: "kolay", seed: 500052 }, // 12 — 5 ayna, 8x8
  { diff: "kolay", seed: 500053 }, // 13 — 5 ayna, 8x8
  { diff: "kolay", seed: 500056 }, // 14 — 5 ayna, 8x8
  { diff: "kolay", seed: 500057 }, // 15 — 5 ayna, 8x8
  { diff: "orta", seed: 500058 }, // 16 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500061 }, // 17 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500063 }, // 18 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500069 }, // 19 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500071 }, // 20 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500073 }, // 21 — 5 ayna, 9x9, portal
  { diff: "orta", seed: 500076 }, // 22 — 6 ayna, 9x9, splitter
  { diff: "orta", seed: 500082 }, // 23 — 6 ayna, 9x9, portal
  { diff: "orta", seed: 500083 }, // 24 — 6 ayna, 9x9, splitter
  { diff: "orta", seed: 500085 }, // 25 — 6 ayna, 9x9, portal
  { diff: "orta", seed: 500089 }, // 26 — 6 ayna, 9x9, splitter
  { diff: "orta", seed: 500091 }, // 27 — 6 ayna, 9x9, portal
  { diff: "orta", seed: 500096 }, // 28 — 7 ayna, 9x9, splitter
  { diff: "orta", seed: 500100 }, // 29 — 7 ayna, 9x9, splitter
  { diff: "orta", seed: 500101 }, // 30 — 7 ayna, 9x9, splitter
  { diff: "orta", seed: 500102 }, // 31 — 7 ayna, 9x9, splitter
  { diff: "orta", seed: 500103 }, // 32 — 7 ayna, 9x9, splitter
  { diff: "zor", seed: 500107 }, // 33 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500113 }, // 34 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500117 }, // 35 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500121 }, // 36 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500125 }, // 37 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500128 }, // 38 — 6 ayna, 11x11, portal
  { diff: "zor", seed: 500130 }, // 39 — 7 ayna, 11x11, splitter, portal
  { diff: "zor", seed: 500131 }, // 40 — 7 ayna, 11x11, splitter, portal
  { diff: "zor", seed: 500133 }, // 41 — 7 ayna, 11x11, portal
  { diff: "zor", seed: 500134 }, // 42 — 7 ayna, 11x11, splitter, portal
  { diff: "zor", seed: 500135 }, // 43 — 7 ayna, 11x11, splitter, portal
  { diff: "zor", seed: 500137 }, // 44 — 8 ayna, 11x11, splitter
  { diff: "zor", seed: 500139 }, // 45 — 8 ayna, 11x11, splitter
  { diff: "zor", seed: 500142 }, // 46 — 8 ayna, 11x11, splitter
  { diff: "zor", seed: 500147 }, // 47 — 8 ayna, 11x11, splitter
  { diff: "zor", seed: 500149 }, // 48 — 8 ayna, 11x11, splitter
  { diff: "usta", seed: 500180 }, // 49 — 7 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500214 }, // 50 — 7 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500246 }, // 51 — 7 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500270 }, // 52 — 7 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500275 }, // 53 — 8 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500276 }, // 54 — 8 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500285 }, // 55 — 8 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500286 }, // 56 — 9 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500289 }, // 57 — 9 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500291 }, // 58 — 9 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500352 }, // 59 — 9 ayna, 12x12, splitter, portal
  { diff: "usta", seed: 500413 }, // 60 — 9 ayna, 12x12, splitter, portal
];

export const CAMPAIGN_TOTAL = CAMPAIGN_LEVELS.length;
