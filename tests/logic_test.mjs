// DEV-ONLY: oyun mantığını (solver, generator, onboarding) Node.js ortamında
// doğrulayan hızlı test scripti. Oyunun kendisinin parçası değildir.
// Çalıştırmak için: node tests/logic_test.mjs (proje kök dizininden)
import { minMirrorsToReach, findMirrorPath, simulate } from "../www/js/solver.js";
import { ONBOARDING_PUZZLES } from "../www/js/onboarding.js";
import { generate, rng } from "../www/js/generator.js";
import { Dir, COLOR_RED, MirrorType } from "../www/js/celltypes.js";
import { PuzzleData } from "../www/js/puzzledata.js";

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`OK   ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures++;
  }
}

// 1) Onboarding puzzle hint'leri gerçek solver ile eşleşiyor mu? (Portal/
// Prizma Bloğu dahil — artık ikisi de 0 DEĞİL 1 ayna gerektiriyor, bkz.
// onboarding.js'deki puzzle5Portal/puzzle6Splitter notları.)
ONBOARDING_PUZZLES.forEach((p, i) => {
  const goals = p.targets.map((t) => t.pos);
  const m = p.sources.reduce((sum, s) => sum + minMirrorsToReach(p, s.pos, s.dir, goals), 0);
  check(`onboarding[${i}] "${p.titleKey}" min=${m} beklenen=${p.maxMirrorsHint}`, m === p.maxMirrorsHint);
});

// 2) Basit düz çizgi testi.
{
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.addSource({ x: 0, y: 2 }, Dir.RIGHT, COLOR_RED);
  p.addTarget({ x: 4, y: 2 }, COLOR_RED);
  const result = simulate(p, new Map());
  check("düz çizgi çözülüyor", result.solved === true);
  check("tek ışın yolu var", result.beamPaths.length === 1);
}

// 3) Onboarding puzzle 2 (İlk Ayna): doğru köşeye BACK_SLASH ayna koyunca çözülmeli.
{
  const p = ONBOARDING_PUZZLES[1];
  const mp = new Map();
  mp.set("2,0", 1); // BACK_SLASH
  const result = simulate(p, mp);
  check("İlk Ayna tam çözüm", result.solved === true);
}

// 4) Renk karışımı: iki farklı renk aynı hedefte union vermeli.
{
  const p2 = new PuzzleData();
  p2.gridSize = { x: 3, y: 3 };
  p2.addSource({ x: 0, y: 1 }, Dir.RIGHT, { r: 1, g: 0, b: 0 });
  p2.addSource({ x: 1, y: 0 }, Dir.DOWN, { r: 0, g: 1, b: 0 });
  p2.addTarget({ x: 1, y: 1 }, { r: 1, g: 1, b: 0 });
  const result = simulate(p2, new Map());
  check("iki kaynak -> renk karışımı (sarı) hedefte", result.solved === true);
}

// 5) Portal ve Prizma Bloğu (splitter) onboarding bulmacaları ARTIK 0 aynayla
// ÇÖZÜLMEMELİ (kullanıcı testinde bulunan bir hata: eğitim kısmında portallı
// ve ondan sonraki bölüm oyuncu hiçbir şey yapmadan direkt çözülmüş olarak
// açılıyordu). Doğru tek ayna (varsayılan "/", ilk dokunuşta gelen tip)
// yerleştirilince çözülmeli.
{
  check("Portal (0 ayna) HENÜZ çözülmemeli", simulate(ONBOARDING_PUZZLES[4], new Map()).solved === false);
  const mp5 = new Map([["2,0", MirrorType.FORWARD_SLASH]]);
  check("Portal (1 doğru ayna) çözülüyor", simulate(ONBOARDING_PUZZLES[4], mp5).solved === true);

  check("Prizma Bloğu (0 ayna) HENÜZ çözülmemeli", simulate(ONBOARDING_PUZZLES[5], new Map()).solved === false);
  const mp6 = new Map([["0,2", MirrorType.FORWARD_SLASH]]);
  check("Prizma Bloğu (1 doğru ayna) çözülüyor", simulate(ONBOARDING_PUZZLES[5], mp6).solved === true);
}

// 6) Generator: her zorluk için 20 kez üret, hep aralık içinde + gerçekten çözülebilir olsun.
// (Zorluk kalibrasyonu v2 — kolaylık seviyesi genel olarak çok kolay
// bulunduğu için ayarlandı. Aralıklar generator.js → TIER_CONFIG ile birebir
// eşleşmeli.)
const TIER_RANGES = { kolay: [4, 6], orta: [5, 7], zor: [6, 8], usta: [7, 10] };
for (const diff of Object.keys(TIER_RANGES)) {
  let allOk = true;
  for (let i = 0; i < 20; i++) {
    rng.seed(1000 + i);
    const p = generate(diff);
    const [lo, hi] = TIER_RANGES[diff];
    if (p.maxMirrorsHint < lo || p.maxMirrorsHint > hi) allOk = false;
    for (const s of p.sources) {
      const goals = p.targets.map((t) => t.pos);
      if (minMirrorsToReach(p, s.pos, s.dir, goals) < 0) allOk = false;
    }
  }
  check(`generator[${diff}] 20 deneme aralık(${TIER_RANGES[diff]}) + çözülebilir`, allOk);
}

// 7) REGRESYON: iki kaynaklı (orta-mixed / zor / usta) bulmacalarda "m1+m2
// bağımsız toplamı" GERÇEKTEN birlikte çözülebiliyor mu? (Gerçek kullanım
// testinde bulunan bir hata: iki ışının optimal yolu aynı hücrede/sütunda
// kesişirse, bağımsız toplam GERÇEKTE ÇÖZÜLEMEYEN bir bulmaca üretebiliyordu
// — bkz. generator.js başındaki not.) Her iki kaynağın optimal aynalarını
// AYRI AYRI bulup BİRLEŞTİRİYORUZ, sonra simulate() ile GERÇEKTEN
// çözüldüğünü ve toplam ayna sayısının puzzle.maxMirrorsHint'e TAM eşit
// olduğunu doğruluyoruz.
{
  let allJointOk = true;
  let checkedTwoSource = 0;
  for (const diff of Object.keys(TIER_RANGES)) {
    for (let i = 0; i < 30; i++) {
      rng.seed(5000 + i);
      const p = generate(diff);
      if (p.sources.length !== 2) continue; // kolay / bazı orta: tek kaynak, çakışma riski yok
      // Splitter içeren bulmacalarda (tryComplexBeam) bacaklar source[i]->
      // target[i] değil, source[0]->splitter->dal1/dal2 + source[1]->
      // paylaşılan hedef şeklinde — bu testin naif "her kaynağın kendi
      // hedefine" varsayımıyla uyumsuz (splitter'ı hiç hesaba katmıyor).
      // Splitter'lı yapıların gerçek çözülebilirliği zaten generate() içinde
      // jointSolve ile doğrulanıyor (bkz. tryComplexBeam) — burada atlanıyor.
      if (p.splitters.size > 0) continue;
      checkedTwoSource++;
      const legs =
        p.targets.length === 1
          ? p.sources.map((s) => ({ pos: s.pos, dir: s.dir, goals: [p.targets[0].pos] })) // mixed: ortak hedef
          : p.sources.map((s, idx) => ({ pos: s.pos, dir: s.dir, goals: [p.targets[idx].pos] })); // iki bağımsız hedef
      const merged = new Map();
      let ok = true;
      for (const leg of legs) {
        const found = findMirrorPath(p, leg.pos, leg.dir, leg.goals);
        if (!found) {
          ok = false;
          break;
        }
        for (const [key, type] of found.mirrors) {
          if (merged.has(key) && merged.get(key) !== type) {
            ok = false;
            break;
          }
          merged.set(key, type);
        }
      }
      if (ok) {
        const result = simulate(p, merged);
        if (!result.solved || merged.size !== p.maxMirrorsHint) ok = false;
      }
      if (!ok) allJointOk = false;
    }
  }
  check(`generator: iki kaynaklı bulmacalar GERÇEKTEN ortak çözülebiliyor (${checkedTwoSource} örnek kontrol edildi)`, allJointOk && checkedTwoSource > 0);
}

// 8) Kolay ASLA kör mod/portal/splitter içermemeli (eskisi gibi). Orta ASLA
// kör mod olmamalı AMA orta seviyede de bazı bölümlerin portallı bazı
// bölümlerin splitter'lı olması istendiğinden portal VE splitter AYRI AYRI
// (aynı bulmacada BİRLİKTE değil — bu "hem ikisi de" kombinasyonu bilerek
// sadece Zor/Usta'ya özel bırakıldı, bkz. generator.js → "orta" case notu)
// görülebilir hale geldi.
{
  let kolayOk = true;
  for (let i = 0; i < 15; i++) {
    rng.seed(9000 + i);
    const p = generate("kolay");
    if (p.blindMode === true || p.portals.size > 0 || p.splitters.size > 0) kolayOk = false;
  }
  check("Kolay hiçbir zaman kör mod/portal/splitter içermiyor", kolayOk);

  const ORTA_N = 60;
  let ortaBlindOk = true;
  let ortaNeverBoth = true;
  let sawOrtaPortal = false;
  let sawOrtaSplitter = false;
  for (let i = 0; i < ORTA_N; i++) {
    rng.seed(9500 + i);
    const p = generate("orta");
    if (p.blindMode === true) ortaBlindOk = false;
    if (p.portals.size > 0 && p.splitters.size > 0) ortaNeverBoth = false;
    if (p.portals.size > 0) sawOrtaPortal = true;
    if (p.splitters.size > 0) sawOrtaSplitter = true;
  }
  check("Orta hiçbir zaman kör mod içermiyor (her zaman canlı mod)", ortaBlindOk);
  check("Orta'da portal ve splitter hiçbir zaman AYNI bulmacada birlikte çıkmıyor (bu sadece Zor/Usta'ya özel)", ortaNeverBoth);
  check(`Orta'da en az bir kez PORTALLI (portalsız değil) bir bulmaca üretildi (${ORTA_N} denemede)`, sawOrtaPortal);
  check(`Orta'da en az bir kez SPLITTER'LI bir bulmaca üretildi (${ORTA_N} denemede)`, sawOrtaSplitter);
}

// 9-12) Zor/Usta için TEK BİR ortak örneklem üzerinden birden çok bağımsız
// özelliği ölçüyoruz. Güncellenmiş tasarım gereği baştan yazıldı: her 10
// bölümün 4'ünde hem splitter hem portal, kalan 6'nın 3'ü splitter-only 3'ü
// portal-only, HER bölümde en az 2 kaynak (Zor); HER bölümde portal VE
// splitter, HER bölümde 3 kaynak (Usta).
{
  const N = 70;
  const stats = {
    zor: { special: 0, splitter: 0, both: 0, splitterInRange: true, portalOnlyCount: 0, portalOnlyNecessaryCount: 0, minSourcesOk: true, targetCountOk: true },
    usta: { special: 0, splitter: 0, both: 0, splitterInRange: true, portalOnlyCount: 0, portalOnlyNecessaryCount: 0, minSourcesOk: true, targetCountOk: true },
  };
  const MIN_SOURCES = { zor: 2, usta: 3 };

  // Portal gerekliliğini SADECE splitter İÇERMEYEN (portal-only) bulmacalarda
  // yeniden doğruluyoruz: bu naif "her kaynağın kendi/paylaşılan hedefine
  // direkt gider" bacak varsayımı splitter'lı (tryComplexBeam) yapılarla
  // UYUMSUZ (splitter'ı hiç hesaba katmıyor, bkz. madde 7'deki AYNI not) —
  // splitter'lı bulmacaların portal gerekliliği zaten generator.js →
  // attemptPortalJoint içinde GERÇEK legsFn ile (splitter dahil) doğrulanıyor.
  function checkPortalNecessary(p) {
    const withoutPortalCells = new Map(p.cells);
    for (const [key] of p.portals) withoutPortalCells.delete(key);
    const legs =
      p.targets.length === 1
        ? p.sources.map((s) => ({ pos: s.pos, dir: s.dir, goals: [p.targets[0].pos] }))
        : p.sources.map((s, idx) => ({ pos: s.pos, dir: s.dir, goals: [p.targets[idx].pos] }));
    const savedCells = p.cells;
    p.cells = withoutPortalCells;
    let solvableWithout = true;
    const merged = new Map();
    for (const leg of legs) {
      const found = findMirrorPath(p, leg.pos, leg.dir, leg.goals);
      if (!found) {
        solvableWithout = false;
        break;
      }
      for (const [key, type] of found.mirrors) {
        if (merged.has(key) && merged.get(key) !== type) {
          solvableWithout = false;
          break;
        }
        merged.set(key, type);
      }
    }
    if (solvableWithout) {
      const result = simulate(p, merged);
      solvableWithout = result.solved && merged.size <= p.maxMirrorsHint;
    }
    p.cells = savedCells;
    return !solvableWithout; // portalsız (oyuncunun eldeki aynalarıyla) çözülemiyorsa portal GEREKLİYDİ
  }

  for (const diff of ["zor", "usta"]) {
    const s = stats[diff];
    const minSrc = MIN_SOURCES[diff];
    for (let i = 0; i < N; i++) {
      rng.seed(100000 + i + (diff === "usta" ? 500000 : 0));
      const p = generate(diff);
      if (p.blindMode === true) s.special++;
      const hasSplitter = p.splitters.size > 0;
      const hasPortal = p.portals.size > 0;
      if (hasSplitter && hasPortal) s.both++;
      if (hasSplitter) {
        s.splitter++;
        const [lo, hi] = TIER_RANGES[diff];
        if (p.maxMirrorsHint < lo || p.maxMirrorsHint > hi) s.splitterInRange = false;
      }
      // Her bölümde en az N kaynak olmalı (Zor: 2, Usta: 3, sabit tasarım
      // gereği tam N).
      if (p.sources.length !== minSrc) s.minSourcesOk = false;
      // "N hedef VEYA 1 hedef" (paylaşılan tek hedef).
      if (p.targets.length !== minSrc && p.targets.length !== 1) s.targetCountOk = false;
      if (hasPortal && !hasSplitter) {
        s.portalOnlyCount++;
        if (checkPortalNecessary(p)) s.portalOnlyNecessaryCount++;
      }
    }
  }

  const targetSpecial = { zor: 0.7, usta: 0.9 };
  // Bag oranları artık doğrudan generate()'teki bothChance/
  // splitterOnlyChance'e eşit (bkz. TIER_CONFIG notu): Zor bothChance=0.4;
  // Usta'da bag yok, HER bulmaca "both" (1.0).
  const targetBoth = { zor: 0.4, usta: 1.0 };
  const bothTolerance = { zor: 0.18, usta: 0.05 };

  for (const diff of ["zor", "usta"]) {
    const s = stats[diff];
    const specialFreq = s.special / N;
    const bothFreq = s.both / N;
    check(`${diff}: özel tur sıklığı ~${targetSpecial[diff]} civarında (ölçülen: ${specialFreq.toFixed(2)}, N=${N})`, Math.abs(specialFreq - targetSpecial[diff]) < 0.15);
    check(`${diff}: en az bir kez splitter (Prizma Bloğu) üretildi (${s.splitter}/${N})`, s.splitter > 0);
    check(`${diff}: splitter içeren bulmacalar da ayna aralığında kalıyor`, s.splitterInRange);
    check(`${diff}: HER bulmacada tam olarak ${MIN_SOURCES[diff]} kaynak var (kullanıcı isteği)`, s.minSourcesOk);
    check(`${diff}: HER bulmacada hedef sayısı ${MIN_SOURCES[diff]} ya da 1 (paylaşılan) — "N hedef veya 1 hedef"`, s.targetCountOk);
    check(
      `${diff}: splitter'sız (portal-only) bulmacaların TAMAMINDA (${s.portalOnlyNecessaryCount}/${s.portalOnlyCount}) portal gerçekten gerekli (Round 11 mantığı)`,
      s.portalOnlyCount === 0 || s.portalOnlyNecessaryCount === s.portalOnlyCount
    );
    check(
      `${diff}: "hem splitter hem portal" oranı ~${targetBoth[diff].toFixed(2)} civarında (ölçülen: ${bothFreq.toFixed(2)}, ${s.both}/${N}) — Round 14 kullanıcı isteği`,
      Math.abs(bothFreq - targetBoth[diff]) < bothTolerance[diff]
    );
  }
}

console.log(failures === 0 ? "\nTÜM TESTLER GEÇTİ" : `\n${failures} TEST BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
