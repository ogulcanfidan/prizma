// Solver — iki görevi var:
//  1) simulate(): oyuncunun şu anki ayna yerleşimiyle TÜM ışınların gerçek
//     yörüngesini hesaplar (render + kazanma kontrolü için).
//  2) minMirrorsToReach(): tek bir kaynağın, verilen hedef hücrelerden birine
//     ulaşması için gereken GERÇEK minimum ayna sayısını, 0-1 BFS ile bulur
//     (düz gitmek 0 maliyet, ayna koyup dönmek 1 maliyet).
// Godot autoload/Solver.gd dosyasının birebir JS karşılığı.

import { Cell, MirrorType, dirToVec, reflect, turnLeft, turnRight, colorUnion, colorEquals, colorKey, posKey, COLOR_NONE } from "./celltypes.js";

const MAX_SIM_STEPS = 4000;

// --- 1) TAM SİMÜLASYON (oyun içi, render + kazanma kontrolü) ---------------

export function simulate(puzzle, mirrorPlacements) {
  const targetHits = new Map(); // "x,y" -> color
  for (const t of puzzle.targets) {
    targetHits.set(posKey(t.pos), COLOR_NONE);
  }

  const beamPaths = [];
  const queue = [];
  // Mutlak çıkışlı splitter'da, çıkış koluna geri dönen bir ışın aynı kolu
  // tekrar tekrar üretip sonsuz döngüye girebilir — her (splitter, çıkış
  // yönü, renk) üçlüsü yalnızca BİR kez yayılır (tekrarı hiçbir şey katmaz).
  const splitterEmitted = new Set();
  for (const s of puzzle.sources) {
    queue.push({ pos: s.pos, dir: s.dir, color: s.color, points: [s.pos], parentIndex: null });
  }

  let steps = 0;
  while (queue.length > 0 && steps < MAX_SIM_STEPS) {
    steps++;
    const w = queue.shift();
    const pos = w.pos;
    const dir = w.dir;
    const color = w.color;
    const points = w.points;
    const parentIndex = w.parentIndex;

    const v = dirToVec(dir);
    const nextPos = { x: pos.x + v.x, y: pos.y + v.y };
    if (!puzzle.isInBounds(nextPos)) {
      beamPaths.push({ points: [...points, nextPos], color, parentIndex });
      continue;
    }

    const cell = puzzle.getCell(nextPos);
    if (cell === Cell.WALL) {
      beamPaths.push({ points: [...points, nextPos], color, parentIndex });
    } else if (cell === Cell.TARGET) {
      const newPoints = [...points, nextPos];
      const key = posKey(nextPos);
      targetHits.set(key, colorUnion(targetHits.get(key) || COLOR_NONE, color));
      beamPaths.push({ points: newPoints, color, parentIndex });
    } else if (cell === Cell.PORTAL) {
      // Portal render sıralaması düzeltmesi: ışın elementten, oraya varmadan
      // önce çıkıyormuş gibi görünüyordu (portal ÇIKIŞ parçası, GİRİŞ parçası
      // tam çizilmeden görünüyordu). Bu parça (giriş) beamPaths'e eklenirken
      // aldığı indeks, hemen sonra kuyruğa eklenen ÇIKIŞ parçasının
      // parentIndex'i olarak kaydediliyor — böylece board.js render sırasında
      // çıkış parçasını giriş parçası TAMAMEN belirmeden çizmeye başlamaz.
      beamPaths.push({ points: [...points, nextPos], color, parentIndex });
      const myIndex = beamPaths.length - 1;
      const exitPos = puzzle.portals.get(posKey(nextPos));
      queue.push({ pos: exitPos, dir, color, points: [exitPos], parentIndex: myIndex });
    } else if (cell === Cell.SPLITTER) {
      // Aynı düzeltme, Prizma Bloğu (splitter) için: iki dal da GİRİŞ parçası
      // tamamen belirmeden başlamaz, ama birbirlerine göre PARALEL belirirler
      // (ışın o noktada gerçekten aynı anda ikiye ayrılıyor).
      beamPaths.push({ points: [...points, nextPos], color, parentIndex });
      const myIndex = beamPaths.length - 1;
      // Çıkış yönleri MUTLAK (bkz. PuzzleData.addSplitter) — ışın hangi
      // yönden girerse girsin, tahtadaki iki okun gösterdiği yönlere çıkar.
      for (const exitDir of puzzle.splitterExits(nextPos)) {
        const emitKey = `${posKey(nextPos)},${exitDir},${colorKey(color)}`;
        if (splitterEmitted.has(emitKey)) continue;
        splitterEmitted.add(emitKey);
        queue.push({ pos: nextPos, dir: exitDir, color, points: [nextPos], parentIndex: myIndex });
      }
    } else {
      // EMPTY ya da SOURCE: aynadan geç (varsa yön değişir), yol aynı parçada devam eder.
      let newDir = dir;
      const fm = puzzle.fixedMirrors.get(posKey(nextPos));
      if (fm !== undefined) {
        newDir = reflect(dir, fm);
      } else if (cell === Cell.EMPTY && mirrorPlacements.has(posKey(nextPos))) {
        newDir = reflect(dir, mirrorPlacements.get(posKey(nextPos)));
      }
      queue.push({ pos: nextPos, dir: newDir, color, points: [...points, nextPos], parentIndex });
    }
  }

  let solved = true;
  for (const t of puzzle.targets) {
    const hit = targetHits.get(posKey(t.pos)) || COLOR_NONE;
    if (!colorEquals(hit, t.color)) {
      solved = false;
      break;
    }
  }

  return { targetHits, beamPaths, solved };
}

// --- 2) GERÇEK MİNİMUM AYNA SAYISI (0-1 BFS, deque ile) ---------------------
// startPos/startDir: kaynağın konumu ve yönü.
// goalPositions: ulaşılmak istenen hücrelerden herhangi biri (dizi {x,y}).
// Dönen değer: gereken minimum ayna sayısı, ulaşılamıyorsa -1.

export function minMirrorsToReach(puzzle, startPos, startDir, goalPositions) {
  const v0 = dirToVec(startDir);
  const firstPos = { x: startPos.x + v0.x, y: startPos.y + v0.y };
  if (!puzzle.isInBounds(firstPos) || puzzle.getCell(firstPos) === Cell.WALL) {
    return -1;
  }

  const goalKeys = new Set(goalPositions.map(posKey));
  const dist = new Map(); // "x,y,dir" -> cost
  const deque = [];

  const stateKey = (pos, dir) => `${pos.x},${pos.y},${dir}`;

  dist.set(stateKey(firstPos, startDir), 0);
  deque.push({ pos: firstPos, dir: startDir, cost: 0 });

  let guard = 0;
  while (deque.length > 0 && guard < 200000) {
    guard++;
    const cur = deque.shift();
    const pos = cur.pos;
    const dir = cur.dir;
    const cost = cur.cost;
    const key = stateKey(pos, dir);
    if (dist.has(key) && dist.get(key) < cost) continue;
    if (goalKeys.has(posKey(pos))) return cost;

    // Portal: simulate() ile BİREBİR aynı davranış. Portal hücresinin KENDİSİ
    // hiçbir zaman "varılan" bir yer sayılmaz — ışın eşli portale ışınlanır
    // ve ORADAN bir adım daha ilerler.
    if (puzzle.getCell(pos) === Cell.PORTAL) {
      const exitPos = puzzle.portals.get(posKey(pos));
      const vd = dirToVec(dir);
      const beyond = { x: exitPos.x + vd.x, y: exitPos.y + vd.y };
      if (puzzle.isInBounds(beyond) && puzzle.getCell(beyond) !== Cell.WALL) {
        const pkey = stateKey(beyond, dir);
        if (!dist.has(pkey) || dist.get(pkey) > cost) {
          dist.set(pkey, cost);
          deque.unshift({ pos: beyond, dir, cost });
        }
      }
      continue;
    }

    for (const branch of resolveBranches(puzzle, pos, dir)) {
      const outDir = branch.dir;
      const extra = branch.cost;
      const vb = dirToVec(outDir);
      const nextPos = { x: pos.x + vb.x, y: pos.y + vb.y };
      if (!puzzle.isInBounds(nextPos) || puzzle.getCell(nextPos) === Cell.WALL) continue;
      const ncost = cost + extra;
      const nkey = stateKey(nextPos, outDir);
      if (!dist.has(nkey) || dist.get(nkey) > ncost) {
        dist.set(nkey, ncost);
        if (extra === 0) {
          deque.unshift({ pos: nextPos, dir: outDir, cost: ncost });
        } else {
          deque.push({ pos: nextPos, dir: outDir, cost: ncost });
        }
      }
    }
  }
  return -1;
}

// --- 3) AYNA YOLU YENİDEN İNŞASI (generator.js için) ------------------------
// minMirrorsToReach ile AYNI 0-1 BFS'i çalıştırır ama sadece MALİYETİ değil,
// o maliyeti veren GERÇEK ayna yerleşimlerini (konum+tip) de döndürür.
//
// NEDEN GEREKLİ: iki kaynaklı bulmacalarda (tryMixedBeam/tryTwoIndependent),
// eski üretici her kaynağın minMirrorsToReach() sonucunu TOPLUYORDU
// (m1+m2). Bu, iki ışının yolları farklı hücrelerde kesişmediği sürece
// doğrudur — ama biri diğerinin ZORUNLU düz-geçiş hücresine tam da öteki
// ışının dönüş yapması gereken bir ayna koyarsa (örn. her iki ışın da aynı
// tek sütunu paylaşıyorsa), o ayna İKİ ışını da etkiler ve "bağımsız minimum
// toplamı" GERÇEKTE ÇÖZÜLEMEYEN bir bulmaca üretebilir (test sırasında tam
// bu senaryoyla karşılaşıldı: görünürde 3 ayna yeterli sanılan bir bulmaca
// aslında çözülemiyordu — gerçek ortak minimum kaba kuvvetle 4 olduğu
// doğrulandı, üretici yanlışlıkla 3 üretmişti). Çözüm: generator.js artık
// her kaynağın yolunu bu fonksiyonla AYNA YERLEŞİMİ olarak alıp
// BİRLEŞTİRİYOR, sonra simulate() ile GERÇEKTEN çözüldüğünü doğruluyor
// (bkz. generator.js → jointSolve()).
export function findMirrorPath(puzzle, startPos, startDir, goalPositions) {
  const v0 = dirToVec(startDir);
  const firstPos = { x: startPos.x + v0.x, y: startPos.y + v0.y };
  if (!puzzle.isInBounds(firstPos) || puzzle.getCell(firstPos) === Cell.WALL) {
    return null;
  }

  const goalKeys = new Set(goalPositions.map(posKey));
  const dist = new Map();
  const prev = new Map(); // stateKey -> { fromKey, mirrorPos, mirrorType } | null
  const deque = [];
  const stateKey = (pos, dir) => `${pos.x},${pos.y},${dir}`;

  const startKey = stateKey(firstPos, startDir);
  dist.set(startKey, 0);
  prev.set(startKey, null);
  deque.push({ pos: firstPos, dir: startDir, cost: 0 });

  let guard = 0;
  let goalKey = null;
  while (deque.length > 0 && guard < 200000) {
    guard++;
    const cur = deque.shift();
    const { pos, dir, cost } = cur;
    const key = stateKey(pos, dir);
    if (dist.has(key) && dist.get(key) < cost) continue;
    if (goalKeys.has(posKey(pos))) {
      goalKey = key;
      break;
    }

    if (puzzle.getCell(pos) === Cell.PORTAL) {
      const exitPos = puzzle.portals.get(posKey(pos));
      const vd = dirToVec(dir);
      const beyond = { x: exitPos.x + vd.x, y: exitPos.y + vd.y };
      if (puzzle.isInBounds(beyond) && puzzle.getCell(beyond) !== Cell.WALL) {
        const pkey = stateKey(beyond, dir);
        if (!dist.has(pkey) || dist.get(pkey) > cost) {
          dist.set(pkey, cost);
          prev.set(pkey, { fromKey: key, mirrorPos: null, mirrorType: null });
          deque.unshift({ pos: beyond, dir, cost });
        }
      }
      continue;
    }

    for (const branch of resolveBranches(puzzle, pos, dir)) {
      const outDir = branch.dir;
      const extra = branch.cost;
      const vb = dirToVec(outDir);
      const nextPos = { x: pos.x + vb.x, y: pos.y + vb.y };
      if (!puzzle.isInBounds(nextPos) || puzzle.getCell(nextPos) === Cell.WALL) continue;
      const ncost = cost + extra;
      const nkey = stateKey(nextPos, outDir);
      if (!dist.has(nkey) || dist.get(nkey) > ncost) {
        dist.set(nkey, ncost);
        const mirrorType = extra === 1 ? (reflect(dir, MirrorType.FORWARD_SLASH) === outDir ? MirrorType.FORWARD_SLASH : MirrorType.BACK_SLASH) : null;
        prev.set(nkey, { fromKey: key, mirrorPos: extra === 1 ? pos : null, mirrorType });
        if (extra === 0) {
          deque.unshift({ pos: nextPos, dir: outDir, cost: ncost });
        } else {
          deque.push({ pos: nextPos, dir: outDir, cost: ncost });
        }
      }
    }
  }

  if (goalKey === null) return null;

  const mirrors = new Map(); // "x,y" -> MirrorType
  let curKey = goalKey;
  while (curKey !== null) {
    const info = prev.get(curKey);
    if (!info) break;
    if (info.mirrorPos) mirrors.set(posKey(info.mirrorPos), info.mirrorType);
    curKey = info.fromKey;
  }
  // goalKey formatı "x,y,dir" (bkz. yukarıdaki stateKey) — ışının hedefe
  // GERÇEKTE hangi yönden vardığını, çağıranın (generator.js →
  // trySplitterBeam) ihtiyaç duyabileceği için ayrıca döndürüyoruz.
  const dir = Number(goalKey.split(",")[2]);
  return { cost: dist.get(goalKey), mirrors, dir };
}

// Bir hücreye gelen ışının, o hücredeki içeriğe göre hangi çıkış yönlerine
// (ve hangi ayna maliyetiyle) dallanabileceğini döndürür.
function resolveBranches(puzzle, pos, dir) {
  const cell = puzzle.getCell(pos);
  if (cell === Cell.SPLITTER) {
    return puzzle.splitterExits(pos).map((exitDir) => ({ dir: exitDir, cost: 0 }));
  }
  if (cell === Cell.TARGET) {
    return []; // başka bir hedefe çarpan ışın orada yutulur (simulate() ile tutarlı)
  }
  const fm = puzzle.fixedMirrors.get(posKey(pos));
  if (fm !== undefined) {
    return [{ dir: reflect(dir, fm), cost: 0 }];
  }
  if (cell === Cell.EMPTY) {
    return [
      { dir, cost: 0 },
      { dir: turnLeft(dir), cost: 1 },
      { dir: turnRight(dir), cost: 1 },
    ];
  }
  // SOURCE (başka bir ışının kaynağından geçiş): düz devam.
  return [{ dir, cost: 0 }];
}
