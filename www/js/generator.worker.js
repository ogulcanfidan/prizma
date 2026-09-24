// generator.worker.js — bulmaca üretimini ana thread'den (ekrandan) ayırır.
// Ana thread { id, difficulty } gönderir; worker generate()'i "background"
// bütçesiyle (bkz. generator.js → BUDGETS) çalıştırıp { id, puzzle } döner.
// PuzzleData'daki Map alanları structured clone ile olduğu gibi taşınır;
// sınıf metotları taşınmaz — ana thread'de puzzleService.js yeniden
// PuzzleData'ya çevirir.

import { generate, solveMirrors } from "./generator.js";
import { PuzzleData } from "./puzzledata.js";

// İpucu: SADECE "oyuncunun mevcut aynalarını koruyan" çözüm aranır. Sıfırdan
// arama YOK — üreticinin kendi çözümü bulmacayla birlikte geliyor (bkz.
// generator.js → p.solution), ana thread onu yedek olarak kullanıyor. Süre
// sınırı bu yüzden kısa tutulabiliyor: oyuncu uzun uzun beklemesin.
const HINT_SOLVE_MS = 6000;

self.onmessage = (e) => {
  const { id, kind, difficulty, seed, puzzle: rawPuzzle, fixed } = e.data;
  try {
    if (kind === "daily" || kind === "seeded") {
      // Günlük bulmaca ve kampanya bölümleri HER CİHAZDA AYNI olmalı — sabit
      // tohum + deterministic mod (bkz. generator.js → opts.deterministic).
      const puzzle = generate(difficulty, seed, { background: true, deterministic: true });
      self.postMessage({ id, puzzle: { ...puzzle } });
      return;
    }
    if (kind === "solve") {
      const puzzle = Object.assign(new PuzzleData(), rawPuzzle);
      const fixedMap = fixed ? new Map(fixed) : null;
      // Önce oyuncunun aynalarını koruyarak; o yoldan çözüm yoksa sıfırdan.
      const solution = solveMirrors(puzzle, puzzle.maxMirrorsHint, HINT_SOLVE_MS, fixedMap);
      self.postMessage({ id, solution: solution ? [...solution] : null, keptPlayerMirrors: !!solution });
      return;
    }
    const puzzle = generate(difficulty, -1, { background: true });
    self.postMessage({ id, puzzle: { ...puzzle } });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
