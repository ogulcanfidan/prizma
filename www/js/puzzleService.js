// puzzleService.js — sonsuz mod bulmacalarını arka planda (Web Worker)
// üretir ve her zorluk için BİR bulmacayı önceden hazır tutar.
//
// Neden: generate() özellikle Zor/Usta'da yüzlerce ms – saniyeler sürebiliyor
// ve ana thread'de çalıştığında ekran donuyordu. Worker'da üretim ekranı
// dondurmaz; oyuncu bir bulmacayı çözerken sıradaki hazırlanır.
//
// Worker tek sıralı bir iş kuyruğuyla çalışır (aynı anda bir üretim).
// takePuzzle() ile istenen zorluk kuyrukta bekliyorsa en öne alınır.
// Worker oluşturulamazsa ya da hata verirse otomatik olarak ana thread'de
// (eski, kısa bütçeli) senkron üretime düşülür — oyun asla bozulmaz.

import { generate, solveMirrors } from "./generator.js";
import { PuzzleData } from "./puzzledata.js";

let worker = null;
let workerBroken = false;
let nextJobId = 1;

// difficulty -> { promise, settled }
const ready = new Map();
// Worker'a henüz gönderilmemiş işler: [{ difficulty, resolve }]
const queue = [];
// Worker'da şu an çalışan iş: { id, difficulty, resolve } | null
let running = null;

function rehydrate(raw) {
  return Object.assign(new PuzzleData(), raw);
}

function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL("./generator.worker.js", import.meta.url), { type: "module" });
  } catch (e) {
    console.warn("puzzleService: worker oluşturulamadı, senkron üretime düşülüyor", e);
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e) => {
    const { id, puzzle, solution, keptPlayerMirrors, error } = e.data;
    if (!running || running.id !== id) return;
    const job = running;
    running = null;
    if (error) {
      console.warn("puzzleService: worker hatası, senkron çalışmaya düşülüyor", error);
      job.resolve(runSync(job));
    } else if (job.kind === "daily" || job.kind === "seeded") {
      job.resolve(rehydrate(puzzle));
    } else if (job.kind === "solve") {
      job.resolve({ solution: solution ? new Map(solution) : null, keptPlayerMirrors });
    } else {
      job.resolve(rehydrate(puzzle));
    }
    pump();
  };
  worker.onerror = (e) => {
    console.warn("puzzleService: worker çöktü, senkron üretime düşülüyor", e.message || e);
    workerBroken = true;
    worker.terminate();
    worker = null;
    // Bekleyen tüm işleri senkron tamamla.
    const pending = running ? [running, ...queue.splice(0)] : queue.splice(0);
    running = null;
    for (const job of pending) job.resolve(runSync(job));
  };
  return worker;
}

// Worker yoksa/çöktüyse aynı işi ana thread'de yapar (ekran kısa süre donar —
// yalnızca yedek yol).
function runSync(job) {
  if (job.kind === "daily" || job.kind === "seeded") {
    return generate(job.difficulty, job.seed, { deterministic: true });
  }
  if (job.kind === "solve") {
    const solution = solveMirrors(job.puzzle, job.puzzle.maxMirrorsHint, 2000, job.fixed);
    return { solution, keptPlayerMirrors: !!solution };
  }
  return generate(job.difficulty);
}

function pump() {
  if (running || queue.length === 0) return;
  const w = ensureWorker();
  const job = queue.shift();
  if (!w) {
    // Senkron yedek: ekranın bir kare çizilebilmesi için bir sonraki
    // döngüye bırakılır (böylece "hazırlanıyor" durumu görünür).
    setTimeout(() => {
      job.resolve(runSync(job));
      pump();
    }, 0);
    return;
  }
  running = { ...job, id: nextJobId++ };
  w.postMessage({
    id: running.id,
    kind: job.kind,
    difficulty: job.difficulty,
    seed: job.seed,
    puzzle: job.kind === "solve" ? { ...job.puzzle } : undefined,
    fixed: job.kind === "solve" && job.fixed ? [...job.fixed] : null,
  });
}

function enqueue(difficulty) {
  const entry = { settled: false, promise: null };
  entry.promise = new Promise((resolve) => {
    queue.push({
      kind: "generate",
      difficulty,
      resolve: (p) => {
        entry.settled = true;
        resolve(p);
      },
    });
  });
  ready.set(difficulty, entry);
  pump();
}

// Verilen zorluk için arka planda bir bulmaca hazırlanmasını başlatır (zaten
// hazır ya da hazırlanıyorsa hiçbir şey yapmaz).
export function prefetch(difficulty) {
  if (!ready.has(difficulty)) enqueue(difficulty);
}

// Hazır (ya da hazırlanmakta olan) bulmacayı alır — Promise<PuzzleData>.
// Alınan bulmaca depodan çıkar; sıradaki için prefetch() ayrıca çağrılmalı.
export function takePuzzle(difficulty) {
  if (!ready.has(difficulty)) enqueue(difficulty);
  const entry = ready.get(difficulty);
  ready.delete(difficulty);
  // Hâlâ kuyrukta bekliyorsa en öne al (oyuncu şu an bunu bekliyor).
  const idx = queue.findIndex((j) => j.difficulty === difficulty);
  if (idx > 0) queue.unshift(queue.splice(idx, 1)[0]);
  return entry.promise;
}

// Alınıp kullanılmayan (oyuncu beklerken geri çıktı) bulmacayı depoya iade eder.
export function returnPuzzle(difficulty, puzzle) {
  if (ready.has(difficulty)) return;
  ready.set(difficulty, { settled: true, promise: Promise.resolve(puzzle) });
}

// Günlük bulmaca HER GÜN Usta zorluğunda üretilir (kullanıcı isteği).
// Eskiden haftanın gününe göre değişen bir sıra vardı
// (["orta","kolay","orta","zor","orta","zor","usta"]); günlük bulmacanın
// "günün mücadelesi" olması isteniyor, o yüzden tek ve en yüksek zorlukta.
// Not: günlük bulmaca bulmaca hakkı TÜKETMEZ, yani zorluğun ekonomiye etkisi
// yok (bkz. main.js → dailyBtn).
const DAILY_DIFFICULTY = "usta";

export function dailyDifficulty(dateKey) {
  return DAILY_DIFFICULTY;
}

// dateKey ("YYYY-MM-DD") için günlük bulmacayı döner. Aynı gün içinde
// tekrar istenirse yeniden üretilmez (önbellek).
const dailyCache = new Map();

export function takeDaily(dateKey) {
  if (dailyCache.has(dateKey)) return dailyCache.get(dateKey);
  const seed = Number(dateKey.replaceAll("-", "")); // 2026-09-23 -> 20260923
  const promise = new Promise((resolve) => {
    // Oyuncu bekliyor — kuyruğun önüne alınır.
    queue.unshift({ kind: "daily", difficulty: dailyDifficulty(dateKey), seed, resolve });
    pump();
  });
  dailyCache.set(dateKey, promise);
  return promise;
}

// Kampanya bölümü (sabit tohum) — aynı bölüm tekrar istenirse yeniden
// üretilmez (önbellek).
const seededCache = new Map();

export function takeSeeded(difficulty, seed) {
  const key = `${difficulty}:${seed}`;
  if (seededCache.has(key)) return seededCache.get(key);
  const promise = new Promise((resolve) => {
    queue.unshift({ kind: "seeded", difficulty, seed, resolve });
    pump();
  });
  seededCache.set(key, promise);
  return promise;
}

// Bir sonraki bölümü oyuncu mevcut bölümü çözerken arka planda hazırlar.
export function prefetchSeeded(difficulty, seed) {
  const key = `${difficulty}:${seed}`;
  if (seededCache.has(key)) return;
  const promise = new Promise((resolve) => {
    queue.push({ kind: "seeded", difficulty, seed, resolve });
    pump();
  });
  seededCache.set(key, promise);
}

// İpucu için: bulmacanın tam çözümünü arka planda arar.
// fixed (oyuncunun mevcut aynaları) korunmaya ÇALIŞILIR; o yoldan çözüm yoksa
// sıfırdan çözüm döner ve keptPlayerMirrors=false olur.
// Dönen: Promise<{ solution: Map|null, keptPlayerMirrors: boolean }>
export function requestSolution(puzzle, fixed) {
  return new Promise((resolve) => {
    // Oyuncu bekliyor — üretim işlerinin ÖNÜNE alınır.
    queue.unshift({ kind: "solve", puzzle, fixed, resolve });
    pump();
  });
}

// Bu zorluk için bulmaca şu an anında verilebilir mi?
export function isReady(difficulty) {
  const entry = ready.get(difficulty);
  return !!(entry && entry.settled);
}
