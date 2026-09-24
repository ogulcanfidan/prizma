// PuzzleGenerator — sonsuz mod için prosedürel üretim + Solver ile GERÇEK
// minimum ayna sayısı doğrulaması ("Az eleman, derin düşünme" ilkesi).
// Godot autoload/PuzzleGenerator.gd dosyasının JS karşılığı.
//
// KAPSAM / BİLİNÇLİ SINIRLAMALAR (v1):
//  - Tam yanıltıcılık (decoy) puanlaması burada çalıştırılmıyor — sadece
//    GERÇEK MİNİMUM AYNA SAYISI filtre olarak kullanılır.
//  - Kolay bandında "az eleman, derin düşünme" ilkesi korunuyor (ayna sayısı
//    düşük, zorluk mekânsal kısıtlamadan gelir). Orta/Zor/Usta artık bu
//    tavanı BİLİNÇLİ olarak aşıyor (bkz. aşağıdaki zorluk revizyonu notu).
//
// TAM ZORLUK REVİZYONU — ZORLUK BANDI GEREKSİNİMLERİ:
//   Kolay: olması gereken seviyede, değişiklik gerekmiyor.
//   Orta: her 10 bölümden 5 tanesi splitterli 5 tanesi portallı olacak, bu
//   10 bölümün 5 inde 2 kaynak 2 hedef veya 1 hedef olacak.
//   Zor: her 10 bölümün 4 tanesinde hem splitter olacak hem portal olacak,
//   kalan 6 bölümün 3 ünde splitter 3 ünde portal olacak, her bölümde en az
//   2 kaynak 2 veya 1 hedef olacak.
//   Usta: her bölümde portal ve splitter olacak, her bölümde 3 kaynak 3
//   hedef veya 1 hedef olacak. Ayrıca ayna sayıları çok fazla artmamalı.
//   "1 hedef": ışının tek hedef küreye götürülmesi anlamına gelir.
//
//   Bu gereksinimleri karşılamak için üç değişiklik yapıldı:
//   1) "N kaynaklı, tek PAYLAŞILAN hedef VEYA N bağımsız hedef" — eskiden
//      ayrı ayrı fonksiyonlar olan tryMixedBeam (paylaşılan) ve
//      tryTwoIndependent (bağımsız) artık TEK bir tryMultiBeam(numSources,
//      singleTarget) fonksiyonuna genelleştirildi (bkz. aşağıdaki not).
//   2) Zor/Usta'da artık splitter varken de EN AZ 2 kaynak isteniyor — bu,
//      trySplitterBeam'in "TEK kaynak splitter'a zorunlu yönlendirilir"
//      kanıtıyla ÇELİŞİYORDU (o kanıt TEK ışının en fazla bir hedefe
//      ulaşabilmesine dayanıyordu). Çözüm: YENİ tryComplexBeam — kaynaklardan
//      SADECE BİRİ (source[0]) splitter'a zorunlu bir ara-durak (waypoint)
//      olarak yönlendirilir (trySplitterBeam'deki AYNI kanıt DEĞİŞMEDEN
//      korunur), splitter'ın iki dalı + kalan bağımsız kaynak(lar) hedeflere
//      dağıtılır; toplam hedef sayısı numSources+1 olur (bkz.
//      tryComplexBeam üstündeki not).
//   3) Eski `portalChance`/`splitterChance`/`bothChance` olasılıkları artık
//      "N turdan M'i" oranlarına BİREBİR karşılık gelecek şekilde yeniden
//      kalibre edildi (örn. Zor: bothChance=0.4 ⇒ 10 turun 4'ü, kalan 0.6'nın
//      yarısı splitter-only, yarısı portal-only ⇒ 3/3). Bu, "N turdan M'i"
//      ifadesini olasılıksal frekans olarak okumak — dosyanın kendi eski
//      tasarımında zaten emsali var (specialChance'in "10 turun 8'i" gibi
//      yorumlanması) — yeni bir bag/queue mekanizması GEREKTİRMEDİ, tek
//      generate() çağrısı hâlâ tamamen bağımsız/durumsuz.
//   4) MİRROR SAYISI KONTROLÜ (ayna sayıları çok fazla artmamalı): `range`
//      (gerçek minimum ayna bandı) HİÇBİR bantta değişmedi — "aynalarla
//      kalabalıklaşmasın" ilkesi burada da geçerli, ve attemptWallsJoint
//      zaten merged.size >= range.max olduğunda durur (bkz. o fonksiyon) —
//      yani ayna sayısı HİÇBİR yapıda bu bandı aşamaz, duvar/candidate
//      ayarları sadece bandın İÇİNDE nereye denk geleceğini etkiler. Asıl
//      kaldıraç `candidates`: TÜM bantlarda (Kolay hariç) düşürüldü (5-6'dan
//      3-4'e) — "N adaydan gerçek ayna sayısı en yüksek olanını seç" daha
//      KÜÇÜK bir N ile daha az sistematik olarak bandın üst ucuna itiyor.
//      maxWalls/wallChance BİLİNÇLİ olarak önceki değerlerine yakın
//      bırakıldı — ölçüldü: yeni çok bacaklı tryComplexBeam yapısı zaten
//      walls=0'da bile sık sık bandın içine düşüyor (fazladan bacaklar kendi
//      başına yeterince ayna gerektiriyor), ama tryMultiBeam (splitter'sız, 2
//      kısa bacak) walls DÜŞÜRÜLÜNCE bandın alt ucuna (6-8 aralığına)
//      neredeyse HİÇ ulaşamıyordu (ölçüldü: %40 -> %3 başarı) — walls'u
//      agresif kısmak "ayna azaltma" değil "üretimi neredeyse
//      imkânsızlaştırma" anlamına geliyordu, çünkü range zaten bir TAVAN
//      olarak duvarlardan bağımsız korunuyor.
//
// DÜZELTME (bulunan hata: bazı bulmacalar belirtilen ayna hakkıyla
// çözülemiyordu): İki kaynaklı bulmacalarda eski üretici, her kaynağın
// BAĞIMSIZ gerçek minimumunu (minMirrorsToReach) TOPLUYORDU (m1+m2). Bu
// toplam SADECE iki ışının optimal yolu hiçbir hücrede kesişmiyorsa
// doğrudur. Ama biri diğerinin ZORUNLU düz-geçiş hücresine tam da öteki
// ışının dönüş yapması gereken hücreye denk gelirse, oraya konan ayna HER
// İKİ ışını da etkiler ve bulmaca GERÇEKTE ÇÖZÜLEMEZ hâle gelebilir. Şimdi
// jointSolve() her bacağın optimal aynalarını solver.js → findMirrorPath()
// ile TEK TEK bulup BİRLEŞTİRİYOR, sonra simulate() ile bu birleşik ayna
// kümesiyle bulmacanın GERÇEKTEN çözüldüğünü doğruluyor — çakışma varsa
// bulmaca elenip yeniden üretiliyor.

import { Cell, Dir, MirrorType, reflect, turnLeft, turnRight, COLOR_RED, COLOR_GREEN, COLOR_BLUE, COLOR_NONE, colorUnion, colorComplement, colorEquals, posEquals, posKey } from "./celltypes.js";
import { PuzzleData } from "./puzzledata.js";
import { findMirrorPath, simulate } from "./solver.js";
import { ONBOARDING_PUZZLES } from "./onboarding.js";

// range: gerçek minimum ayna sayısı bandı (bilinçli olarak SABİT tutuluyor
// — ilke: "aynalarla kalabalıklaşmasın").
// grid: ızgara boyutu. maxWalls/wallChance: her denemede eklenmeye çalışılan
// en fazla duvar sayısı ve her birinin eklenme olasılığı. candidates: kaç
// GEÇERLİ bulmaca üretilip aralarından gerçek ayna sayısı en yüksek olanının
// seçileceği (bkz. generate() içindeki CANDIDATES_WANTED notu).
//
// splitterChance (sadece Orta): "splitter'lı" turun olasılığı — kalanı
// (1-splitterChance) "portallı" turdur ("10 turdan 5 splitterli 5 portallı"
// ⇒ 0.5/0.5, ikisi birbirini bilinçli olarak DIŞLAR, bkz. generate()).
//
// bothChance / splitterOnlyChance (sadece Zor): "10 turdan 4'ü hem splitter
// hem portal, kalan 6'nın 3'ü splitter-only 3'ü portal-only" ⇒
// bothChance=0.4, splitterOnlyChance=0.3, (kalan 0.3 portal-only).
// Usta'da bag YOK — "her bölümde portal ve splitter olacak" gereksinimi ⇒
// %100 "both", bkz. generate() → case "usta".
//
// specialChance: bu turun "Işını Çalıştır" (kör mod) ile mi oynanacağının
// olasılığı — sadece Zor/Usta'da >0. Splitter/portal varlığından TAMAMEN
// BAĞIMSIZ bir zar (eskiden portal sadece "özel" turda açılıyordu — artık
// portal/splitter yerleşimi doğrudan yukarıdaki oranlarla belirleniyor, kör
// mod sadece GÖRSEL/ETKİLEŞİM modu).
const TIER_CONFIG = {
  kolay: { range: { min: 4, max: 6 }, grid: { x: 8, y: 8 }, maxWalls: 7, wallChance: 0.9, candidates: 6 },
  orta: { range: { min: 5, max: 7 }, grid: { x: 9, y: 9 }, maxWalls: 8, wallChance: 0.85, splitterChance: 0.5, candidates: 4 },
  zor: { range: { min: 6, max: 8 }, grid: { x: 11, y: 11 }, maxWalls: 11, wallChance: 0.9, bothChance: 0.4, splitterOnlyChance: 0.3, specialChance: 0.7, candidates: 3 },
  usta: { range: { min: 7, max: 10 }, grid: { x: 12, y: 12 }, maxWalls: 12, wallChance: 0.92, specialChance: 0.9, candidates: 3 },
};

const PRIMARY_COLORS = [COLOR_RED, COLOR_GREEN, COLOR_BLUE];

// singleTarget (paylaşılan hedef — "iki/üç ışının gideceği tek küre")
// bulmacalarında kaynak renklerini seçer. Tasarım gereksinimi: bölümde iki
// ışının gideceği bir küre varsa o hedefin kendini net biçimde belli etmesi
// için union rengi HER ZAMAN tam beyaz (1,1,1) olmalı, eskiden olduğu gibi
// rastgele (çoğu zaman beyaz OLMAYAN) bir kombinasyon değil.
//  - numSources === 2: ilk kaynak rastgele bir primary, ikinci kaynak onun
//    TAM tamamlayıcısı (colorComplement) — union'ları matematiksel olarak
//    her zaman (1,1,1)'dir (bkz. celltypes.js > colorComplement yorumu).
//  - numSources >= 3: PRIMARY_COLORS'ın (R,G,B) karıştırılmış hali —
//    numSources şu an en fazla 3 olduğu için bu her zaman 3 FARKLI renk
//    verir (eski koddaki "renkler tekrar edebilir, union beyaz olmayabilir"
//    hatası da böylece ayrıca düzelmiş olur).
//  - numSources === 1: tek kaynak varsa "iki ışın" durumu söz konusu değil,
//    kaynağın kendi rastgele rengi kullanılır.
function sharedTargetColors(numSources) {
  if (numSources <= 1) {
    return [PRIMARY_COLORS[rng.randiRange(0, 2)]];
  }
  if (numSources === 2) {
    const first = PRIMARY_COLORS[rng.randiRange(0, 2)];
    return [first, colorComplement(first)];
  }
  const shuffled = [...PRIMARY_COLORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.randiRange(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, numSources);
}

// Tasarım gereksinimi: beyaz hedef küre varsa, o bölümdeki TÜM kaynakların
// oraya gitmesi şart olmalı, sadece bir kısmının gitmesi yeterli değil.
// Eskiden tryComplexBeam'in !singleTarget dalında splitter'ın DÖNEN kolu +
// source[1] bir "tShared" hedefinde birleşip (colorComplement ile) HER ZAMAN
// beyaz bir hedef oluşturuyordu — ama o bulmacada 3. bir kaynak (source[2])
// TAMAMEN AYRI/bağımsız bir hedefe gidiyordu, yani "beyaz küre"ye kaynakların
// SADECE 2'si (3'ünden) gidiyordu; bu gereksinimi karşılamıyordu: beyaz/
// paylaşılan bir hedef varsa o bulmacadaki TÜM kaynaklar oraya gitmeli (bu
// zaten singleTarget=true dalında böyle). Bu yüzden !singleTarget dalı artık
// HİÇ birleşen (union'lı) hedef ÜRETMİYOR — splitter'ın iki kolu da (ve her
// bağımsız kaynak da) KENDİ TEK renkli hedefine gidiyor, hiçbir yerde renk
// birleşmesi yok. Bu nedenle burada artık colorComplement'e ihtiyaç yok —
// her kaynak/kol için bağımsız rastgele bir primary renk yeterli (bkz.
// tryComplexBeam'deki çağrı yeri).

// --- Basit RNG sarmalayıcı (seed verilirse tekrarlanabilir, aksi halde Math.random) ---
class Rng {
  constructor() {
    this._state = null;
  }
  seed(value) {
    this._state = value >>> 0;
  }
  randf() {
    if (this._state === null) return Math.random();
    // mulberry32
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randiRange(min, max) {
    return min + Math.floor(this.randf() * (max - min + 1));
  }
}

export const rng = new Rng();

function randomEdgeEmitter(grid) {
  const side = rng.randiRange(0, 3);
  let pos, dir;
  switch (side) {
    case 0: // üst kenar, aşağı bakar
      pos = { x: rng.randiRange(0, grid.x - 1), y: 0 };
      dir = Dir.DOWN;
      break;
    case 1: // alt kenar, yukarı bakar
      pos = { x: rng.randiRange(0, grid.x - 1), y: grid.y - 1 };
      dir = Dir.UP;
      break;
    case 2: // sol kenar, sağa bakar
      pos = { x: 0, y: rng.randiRange(0, grid.y - 1) };
      dir = Dir.RIGHT;
      break;
    default: // sağ kenar, sola bakar
      pos = { x: grid.x - 1, y: rng.randiRange(0, grid.y - 1) };
      dir = Dir.LEFT;
      break;
  }
  return { pos, dir };
}

function randomPosExcluding(grid, excluded) {
  for (let i = 0; i < 100; i++) {
    const p = { x: rng.randiRange(0, grid.x - 1), y: rng.randiRange(0, grid.y - 1) };
    if (!excluded.some((e) => posEquals(e, p))) return p;
  }
  return { x: grid.x - 1, y: grid.y - 1 };
}

// N farklı (çakışmayan konumlu) kenar-yayıcı üretir. Herhangi biri 20
// denemede çakışmadan bulunamazsa null (çağıran bu adayı eler).
function randomDistinctEmitters(grid, n) {
  const emitters = [];
  for (let i = 0; i < n; i++) {
    let e = randomEdgeEmitter(grid);
    let tries = 0;
    while (emitters.some((x) => posEquals(x.pos, e.pos)) && tries < 20) {
      e = randomEdgeEmitter(grid);
      tries++;
    }
    if (emitters.some((x) => posEquals(x.pos, e.pos))) return null;
    emitters.push(e);
  }
  return emitters;
}

// GÜNCEL çözümün (merged aynalar) GERÇEKTEN izlediği yoldaki BOŞ hücreleri
// döndürür (kaynak ve varış hücreleri hariç). Duvar üretiminde bunları HEDEF
// ALMAK — tamamen rastgele hücre denemek yerine — bulmacaların genel olarak
// çok kolay çıkması sorununa çözüm olarak eklendi: rastgele bir duvarın
// mevcut en kısa yola denk gelme ihtimali düşüktür (çoğu deneme çözümü hiç
// etkilemeden elenir), oysa yolun ÜZERİNE konan bir duvar ışını GERÇEKTEN
// dolambaca zorlar (ya da o alt-yolu çözülemez kılar ve elenir) — bu, gerçek
// minimum ayna sayısını güvenilir biçimde yükseltir.
function pathCellsForLegs(puzzle, mirrors, legs) {
  const result = simulate(puzzle, mirrors);
  const seen = new Set();
  const cells = [];
  for (const leg of legs) {
    for (const beam of result.beamPaths) {
      if (beam.points.length < 2 || !posEquals(beam.points[0], leg.pos)) continue;
      for (let i = 1; i < beam.points.length - 1; i++) {
        const pt = beam.points[i];
        const key = posKey(pt);
        if (seen.has(key)) continue;
        if (puzzle.getCell(pt) !== Cell.EMPTY) continue; // ayna/portal/splitter hücresine duvar konmaz
        seen.add(key);
        cells.push(pt);
      }
    }
  }
  return cells;
}

// --- ÇOK BACAKLI bulmacalar için ORTAK doğrulama (bkz. dosya başındaki not) ---
// legs: [{pos, dir, goals}, ...] — her ayağın kendi optimal aynalarını bulur
// (solver.js → findMirrorPath), BİRLEŞTİRİR (aynı hücrede çelişen tip varsa
// reddeder) ve simulate() ile bulmacanın GERÇEKTEN çözüldüğünü doğrular.
// "bağımsız toplam" YERİNE bunu kullanmak, bacakların yolunun aynı hücrede
// çakışıp birbirini bozduğu (ve bağımsız toplamın YALANCI biçimde düşük
// çıktığı) durumları yakalar. null: çözülemedi/çakıştı.
function jointSolve(puzzle, legs) {
  const merged = new Map();
  for (const leg of legs) {
    const found = findMirrorPath(puzzle, leg.pos, leg.dir, leg.goals);
    if (!found) return null;
    for (const [key, type] of found.mirrors) {
      if (merged.has(key) && merged.get(key) !== type) return null; // çelişen ayna tipi isteği
      merged.set(key, type);
    }
  }
  const result = simulate(puzzle, merged);
  if (!result.solved) return null; // ışınlardan biri diğerinin yolunu bozdu
  return merged;
}

// BAYPAS DOĞRULAMASI — bir bölümün portal ya da splitter hiç kullanılmadan
// geçilebilmesi istenmeyen bir durumdur. İlk sürüm: splitter+portal
// hücrelerini SİLİP (EMPTY), kaynak->hedef TÜM eşleşmelerini deneyip her
// eşleşmede jointSolve() (= her bacağın BAĞIMSIZ en kısa yolunu bul, sonra
// BİRLEŞTİR) ile "çözülür mü" bakıyordu.
//
// KÖK NEDEN BULUNDU: aynı sorun iki ayrı canlı Usta bulmacada tekrar
// gözlemlendi. 500+ üretilmiş Usta bulmaca, solver.js'ten TAMAMEN BAĞIMSIZ
// yazılmış, kaba-kuvvete karşı doğrulanmış tam bir dal-sınır çözücüyle
// denetlendi. Sonuç: paylaşılan (singleTarget) hedefe 3 kaynağın BİRDEN
// yönlendirildiği Usta bulmacaların **%99'unda** splitter/portal'sız GERÇEK
// bir çözüm vardı, ama eski hasBypassSolution bunu NEREDEYSE HİÇ
// yakalayamıyordu. Sebep: üç ışın da AYNI hücreye (paylaşılan hedefe)
// gittiği için, her birinin BAĞIMSIZ en kısa yolu neredeyse her zaman ya aynı
// hücrede çelişen bir ayna tipi istiyordu ya da simulate() aşamasında
// birbirinin yolunu bozuyordu — jointSolve() bu yüzden null dönüyor,
// hasBypassSolution da "baypas yok" sanıyordu. Oysa GERÇEK bir oyuncu, o TEK
// optimal-ama-çakışan dizilim dışında, üç ışını birlikte çözen BAŞKA (aynı
// bütçe içinde kalan) ayna dizilimlerini rahatça buluyordu — "bağımsız
// hesapla, birleştirmeyi UMUT ET" ile "GERÇEKTEN hiçbir dizilim yok" ARASINDA
// dev bir fark var, ve eski kod ilkini ikincisi sanıyordu.
//
// AYRICA (aynı denetimde bulunan İKİNCİ, bağımsız açık): eski kod splitter VE
// portal'ı HER ZAMAN BİRLİKTE siliyordu — "sadece portal silinirse (splitter
// yerinde kalırsa) yine de çözülür mü" HİÇ test edilmiyordu. "3 kaynak 3
// hedef" yapısında (splitter sayı argümanıyla zaten zorunlu, bkz.
// splitterProvenNecessary altta) bulmacaların %38'i TAM OLARAK bu delikten
// (splitter kullanılıyor ama portale hiç gerek kalmıyor, çünkü renkler
// rastlantısal eşleşip kaynaklar çapraz eşlenebiliyor) sızıyordu.
//
// DÜZELTME: hasBypassSolution artık İKİ AYRI teknik kullanıyor:
//
//  1) existsSolutionAvoiding() — solver.js'in simulate() semantiğini BİREBİR
//     yeniden uygulayan, TÜM ayna dizilimlerini (bütçe içinde) GERÇEKTEN
//     dal-sınır (branch & bound) ile arayan tam bir çözücü. Belirli bir
//     kaynak->hedef eşleşmesi VARSAYMAZ, "bu hücreler hiçbir ışın tarafından
//     ASLA ziyaret edilmeden, bütçe içinde bulmacayı çözen HERHANGİ bir ayna
//     dizilimi var mı" sorusunu doğrudan cevaplıyor. Ölçüldü: paylaşılan-tek-
//     hedef (singleTarget) yapılarında hızlı (medyan ~40ms) — o yüzden
//     splitter'ın SİLİNDİĞİ (noSplitter/neither) senaryolarda ve tek-hedef
//     portal kontrolünde bu kullanılıyor.
//
//  2) portalBypassSplitterKept() — "sadece portal siliniyor, splitter
//     YERİNDE kalıyor" senaryosu (bağımsız çok hedefli yapılarda) için: (1)
//     numaralı genel arama bu özel yapıda (4+ bağımsız hedef + hâlâ aktif bir
//     splitter) ÇOK YAVAŞ kanıtlanıyor (ölçüldü: %90+ zaman aşımı, 400ms'de
//     bile). Bunun yerine, BULUNAN GERÇEK kök nedeni (ÇAPRAZ kaynak<->hedef
//     eşleşmesi — renkler rastlantısal seçildiği için birden fazla kaynak/
//     splitter-kolu AYNI rengi paylaşabiliyor, oyuncu bunları üreticinin
//     TASARLADIĞI eşleşme yerine YER DEĞİŞTİREREK portale hiç dokunmadan
//     çözebiliyor) doğrudan hedefleyen, jointSolve()'un ucuz BFS'ini
//     kullanan bir kombinatorik arama çalıştırıyor (ölçüldü: gerçek
//     baypasların çoğunu birkaç on ms'de yakalıyor — bkz. o fonksiyonun
//     üstündeki not; kısa bütçeli bir existsSolutionAvoiding() "yedeği" de
//     denendi ama bu yapıda pratik olarak HER ZAMAN zaman aşımına uğrayıp
//     "güvenli tarafta kal -> reddet" kuralını tetikliyordu — yani gerçek bir
//     ek güvenlik KATMADAN generate()'i saniyelerce yavaşlatıyordu, o yüzden
//     KALDIRILDI; bkz. audit script raporundaki artık-risk ölçümü).
//
// Her iki teknikte de zaman dolar da sonuç kanıtlanamazsa GÜVENLİ TARAFTA
// kalınır: aday baypas VARMIŞ gibi reddedilir — "belki güvenlidir ama emin
// değiliz" asla oyuncuya sunulmaz (bkz. generate()'in candidate/attempt
// döngüsü — reddedilen aday yerine başka bir tane denenir).
// PERFORMANS NOTU — bazen seviye seçildikten sonra oyunun kısa süreliğine
// takılması sorunu üzerine bu değer 500ms'den 200ms'e düşürüldü. Bir adayda
// bu arama en fazla 3 kez tetiklenebilir (bkz. hasBypassSolution), yani tek
// bir adayın worst-case maliyeti ~1500ms'den ~600ms'e indi — generate()'in
// artık ayrıca sahip olduğu GENERATE_DEADLINE_MS duvar-saati bütçesiyle
// birlikte toplam donma riskini büyük ölçüde azaltıyor. Zaman aşımı hâlâ
// "güvenli tarafta kal -> reddet" anlamına geliyor (bkz. hasBypassSolution
// içindeki r.timedOut kontrolleri) — bu davranış değişmedi, sadece arama
// daha erken pes edip bir sonraki adaya geçiyor.
let BYPASS_SEARCH_TIME_MS = 200;

// GÜNLÜK BULMACA (deterministik mod) — günlük bulmaca HER CİHAZDA AYNI
// çıkmalı. Normalde üretim süre bütçelerine bağlı (kaç aday denendiği,
// baypas aramasının süreye takılıp takılmadığı cihaz hızına göre değişir),
// yani aynı tohum farklı cihazlarda farklı bulmaca verebilir. Deterministik
// modda: süre bütçesi uygulanmaz, aday sayısı sabittir, zorluk puanlaması ve
// ayna minimizasyonu (ikisi de süre ölçer) atlanır, baypas aramasına ise
// pratikte dolmayacak kadar uzun sabit bir süre verilir.
const DETERMINISTIC_BYPASS_MS = 10000;

function hasBypassSolution(p, maxMirrors) {
  const portalCells = new Set();
  const splitterCells = new Set();
  for (const [key, cell] of p.cells) {
    if (cell === Cell.PORTAL) portalCells.add(key);
    if (cell === Cell.SPLITTER) splitterCells.add(key);
  }
  if (portalCells.size === 0 && splitterCells.size === 0) return false;

  // Splitter olmadan TEK bir dallanmayan ışın en fazla BİR hedefe ulaşabilir
  // (hedef hücresi ışını yutar, çatallanma sadece splitter'da olur) — yani
  // hedef sayısı kaynak sayısını AŞIYORSA splitter'ı kaldırmak matematiksel
  // olarak KESİN çözülemez bir bulmaca üretir; bu senaryolar için arama
  // yapmaya gerek yok (ve zaten gereksiz yere yavaş olurdu).
  const splitterProvenNecessary = p.targets.length > p.sources.length;

  // "sadece portal yok" (splitter yerinde kalıyor).
  if (portalCells.size) {
    if (splitterProvenNecessary && splitterCells.size === 1) {
      if (portalBypassSplitterKept(p, maxMirrors, portalCells)) return true;
      // Performans notu: burada da existsSolutionAvoiding ile KISA bütçeli
      // bir "yedek" dal-sınır arama denendi, ama bu yapıda (4+ bağımsız
      // hedef, splitter aktif) neredeyse HER ZAMAN zaman aşımına uğruyor
      // (ölçüldü) — ki zaman aşımı "güvenli tarafta kal" kuralıyla RED
      // anlamına geliyor, yani bu yedek pratikte "her adayı reddet"e denk
      // geliyordu: generate()'i saniyelerce yavaşlatıyor ama neredeyse
      // hiçbir GERÇEK ek güvenlik katmıyordu (denetimde: 19 adayın sadece
      // 2'si bu yedek OLMADAN da zaten güvenliydi). Bu yüzden burada SADECE
      // ucuz kombinatorik arama kullanılıyor — bkz. portalBypassSplitterKept
      // üstündeki not (gerçek baypasların ~%70'ini birkaç on ms'de
      // yakalıyor); kalan küçük bir artık risk denetim raporunda ölçülüp
      // belgelendi.
    } else {
      const r = existsSolutionAvoiding(p, portalCells, maxMirrors, BYPASS_SEARCH_TIME_MS);
      if (r.solved || r.timedOut) return true;
    }
  }
  // "sadece splitter yok" / "ikisi de yok" — SADECE splitter'ın kaldırılması
  // matematiksel olarak KANITLANMAMIŞ (yukarıdaki sayı argümanı geçerli
  // değil) hallerde anlamlı; aksi halde zaten imkânsız, arama gereksiz.
  if (splitterCells.size && !splitterProvenNecessary) {
    const r = existsSolutionAvoiding(p, splitterCells, maxMirrors, BYPASS_SEARCH_TIME_MS);
    if (r.solved || r.timedOut) return true;
  }
  if (portalCells.size && splitterCells.size && !splitterProvenNecessary) {
    const forbidden = new Set([...portalCells, ...splitterCells]);
    const r = existsSolutionAvoiding(p, forbidden, maxMirrors, BYPASS_SEARCH_TIME_MS);
    if (r.solved || r.timedOut) return true;
  }
  return false;
}

// removeCells'teki hücreleri EMPTY'e döndüren bir PuzzleData kopyası
// oluşturur (kaynaklar/hedefler AYNI referans — değiştirilmiyorlar; portallar/
// splitter'lar removeCells'e göre filtreleniyor, yani silinmeyen bir splitter/
// portal GERÇEK mekaniği olarak KALIR — bkz. portalBypassSplitterKept).
function buildBlockedPuzzle(p, removeCells) {
  const blocked = new PuzzleData();
  blocked.gridSize = p.gridSize;
  for (const [key, cell] of p.cells) {
    if (removeCells.has(key)) continue;
    blocked.cells.set(key, cell);
  }
  blocked.sources = p.sources;
  blocked.targets = p.targets;
  blocked.portals = new Map([...p.portals].filter(([key]) => !removeCells.has(key)));
  blocked.splitters = new Map([...p.splitters].filter(([key]) => !removeCells.has(key)));
  return blocked;
}

// "Portal yok, splitter yerinde" baypasını UCUZ (BFS tabanlı jointSolve,
// dal-sınır arama DEĞİL) ama HEDEFLİ biçimde arar — bkz. hasBypassSolution
// üstündeki not. Splitter'ı beslemesi olası HER kaynağı (sadece üretecin
// TASARLADIĞı kaynağı değil — bir oyuncu splitter'a FARKLI bir kaynaktan da
// yönlenebilir) "besleyici" olarak dener; splitter'ın iki kolunu + kalan
// kaynakları "bacak sağlayıcı" kümesi olarak birlikte ele alıp TÜM olası
// sağlayıcı->hedef eşleşmelerini (üretecin TASARLADIĞI TEK eşleşme DEĞİL —
// kaynaklar/kollar arasında olası tüm ÇAPRAZLAMALARI) dener.
function portalBypassSplitterKept(p, maxMirrors, portalCells) {
  const [splitterKey, splitterExitDirs] = [...p.splitters.entries()][0];
  const [sx, sy] = splitterKey.split(",").map(Number);
  const splitterPos = { x: sx, y: sy };
  const blocked = buildBlockedPuzzle(p, portalCells);
  const targets = p.targets;
  const m = targets.length;

  for (let f = 0; f < p.sources.length; f++) {
    const feeder = p.sources[f];
    const approach = findMirrorPath(blocked, feeder.pos, feeder.dir, [splitterPos]);
    if (!approach) continue; // bu kaynak splitter'a hiç ulaşamıyor -> besleyici olamaz
    // Çıkış yönleri MUTLAK — besleyicinin varış yönünden bağımsız.
    const providers = [
      ...splitterExitDirs.map((dir) => ({ pos: splitterPos, dir })),
      ...p.sources.filter((_, i) => i !== f).map((s) => ({ pos: s.pos, dir: s.dir })),
    ];
    const k = providers.length;
    const base = m + 1;
    const total = Math.pow(base, k);
    for (let a = 0; a < total; a++) {
      let code = a;
      const assign = [];
      const touched = new Set();
      for (let i = 0; i < k; i++) {
        const v = code % base;
        code = Math.floor(code / base);
        assign.push(v);
        if (v < m) touched.add(v);
      }
      if (touched.size < m) continue; // her hedefe en az bir sağlayıcı gitmeli
      const legs = [{ pos: feeder.pos, dir: feeder.dir, goals: [splitterPos] }];
      for (let i = 0; i < k; i++) {
        if (assign[i] < m) legs.push({ pos: providers[i].pos, dir: providers[i].dir, goals: [targets[assign[i]].pos] });
      }
      const sol = jointSolve(blocked, legs);
      if (sol && sol.size <= maxMirrors) return true; // baypas bulundu
    }
  }
  return false;
}

// existsSolutionAvoiding(puzzle, forbiddenCells, maxMirrors, timeLimitMs):
// solver.js -> simulate()'in ışın/portal/splitter/hedef semantiğini BİREBİR
// yeniden uygulayan, forbiddenCells'teki HİÇBİR hücreye bir ışının asla
// girmediği VE en fazla maxMirrors ayna kullanan bir çözüm olup olmadığını
// dal-sınır (branch & bound) ile TAM arayan bağımsız bir çözücü (bkz.
// yukarıdaki not — bu, jointSolve/findMirrorPath'in "her bacağın bağımsız en
// kısa yolu" varsayımına DAYANMAZ, TÜM boş hücrelerin ayna durumunu (boş/./\)
// BİRLİKTE arar). {solved, timedOut} döner — timedOut=true ise sonuç süre
// içinde KANITLANAMADI demektir (çağıran bunu güvenli tarafta kalıp "baypas
// var" gibi yorumlamalı). Performans: aynı anda sadece İLK "henüz karara
// bağlanmamış" hücreye dallanan bir DFS + kalan hedeflere olan (gevşetilmiş
// 0-1 BFS) mesafeyle alt sınır budaması kullanır.
// opts.fixed: Map<"x,y", MirrorType> — oyuncunun zaten koyduğu, arama
// sırasında DEĞİŞTİRİLMEYECEK aynalar (ipucu için, bkz. solveMirrors).
function existsSolutionAvoiding(puzzle, forbiddenCells, maxMirrors, timeLimitMs, opts = {}) {
  const gx = puzzle.gridSize.x;
  const gy = puzzle.gridSize.y;
  const N = gx * gy;
  const deadline = Date.now() + timeLimitMs;

  const D_UNDEC = 0, D_NONE = 1, D_FS = 2, D_BS = 3;
  const REFL = [[], [], [], []];
  for (let d = 0; d < 4; d++) {
    REFL[D_FS][d] = reflect(d, MirrorType.FORWARD_SLASH);
    REFL[D_BS][d] = reflect(d, MirrorType.BACK_SLASH);
  }
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const C_FORB = 99;

  const grid = new Int8Array(N);
  const portalExit = new Int32Array(N).fill(-1);
  // Splitter'ın iki MUTLAK çıkış yönü (bkz. PuzzleData.addSplitter); -1 = yok.
  const splitA = new Int8Array(N).fill(-1);
  const splitB = new Int8Array(N).fill(-1);
  for (let y = 0; y < gy; y++) {
    for (let x = 0; x < gx; x++) {
      const key = posKey({ x, y });
      const i = y * gx + x;
      if (forbiddenCells.has(key)) {
        grid[i] = C_FORB;
        continue;
      }
      const cell = puzzle.cells.get(key);
      grid[i] = cell === undefined ? Cell.EMPTY : cell;
      if (grid[i] === Cell.PORTAL) {
        const e = puzzle.portals.get(key);
        portalExit[i] = e.y * gx + e.x;
      }
      if (grid[i] === Cell.SPLITTER) {
        const exits = puzzle.splitters.get(key) || [];
        if (exits.length > 0) splitA[i] = exits[0];
        if (exits.length > 1) splitB[i] = exits[1];
      }
    }
  }
  const tIdx = puzzle.targets.map((t) => t.pos.y * gx + t.pos.x);
  const tColor = puzzle.targets.map((t) => t.color);
  const targetSlot = new Int32Array(N).fill(-1);
  tIdx.forEach((i, s) => (targetSlot[i] = s));

  const dec = new Int8Array(N); // her boş hücre için: henüz karar yok / ayna yok / '/' / '\'
  let placed = 0;
  // Sabitlenen (oyuncunun koyduğu) aynalar — dfs bunları hiç değiştirmez,
  // çünkü partialSim yalnızca D_UNDEC hücrelerde dallanır (ipucu için).
  if (opts.fixed) {
    for (const [key, type] of opts.fixed) {
      const [fx, fy] = key.split(",").map(Number);
      const fi = fy * gx + fx;
      if (grid[fi] !== Cell.EMPTY) continue;
      dec[fi] = type === MirrorType.FORWARD_SLASH ? D_FS : D_BS;
      placed++;
    }
  }

  // Kaynaklardan başlayıp, karara bağlanmamış İLK boş hücreye kadar (ya da
  // bulmaca tamamen "ölene"/tüm cephelerin durana kadar) simülasyonu ilerletir.
  function partialSim() {
    const hits = tColor.map(() => COLOR_NONE);
    const seen = new Set();
    const q = [];
    let qh = 0;
    for (const s of puzzle.sources) q.push([s.pos.y * gx + s.pos.x, s.dir, s.color]);
    while (qh < q.length) {
      if (qh > 20000) break;
      const [i, d, color] = q[qh++];
      const x = (i % gx) + DX[d];
      const y = ((i / gx) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
      const j = y * gx + x;
      const c = grid[j];
      if (c === C_FORB) return { dead: true }; // bu dizilim yasak hücreye giriyor -> geçersiz
      if (c === Cell.WALL) continue;
      if (c === Cell.TARGET) {
        const s = targetSlot[j];
        hits[s] = colorUnion(hits[s], color);
        continue;
      }
      const ck = (color.r << 2) | (color.g << 1) | color.b;
      if (c === Cell.PORTAL) {
        const e = portalExit[j];
        const sk = ((e * 4 + d) << 3) | ck;
        if (seen.has(sk)) continue;
        seen.add(sk);
        q.push([e, d, color]);
        continue;
      }
      if (c === Cell.SPLITTER) {
        for (const od of [splitA[j], splitB[j]]) {
          if (od < 0) continue;
          const sk = ((j * 4 + od) << 3) | ck;
          if (seen.has(sk)) continue;
          seen.add(sk);
          q.push([j, od, color]);
        }
        continue;
      }
      let nd = d;
      if (c === Cell.EMPTY) {
        const dv = dec[j];
        if (dv === D_UNDEC) {
          const fronts = [];
          for (let r = qh; r < q.length; r++) fronts.push(q[r]);
          return { dead: false, branchIdx: j, branchDir: d, branchColor: color, fronts, hits };
        }
        if (dv !== D_NONE) nd = REFL[dv][d];
      }
      const sk = ((j * 4 + nd) << 3) | ck;
      if (seen.has(sk)) continue;
      seen.add(sk);
      q.push([j, nd, color]);
    }
    return { dead: false, branchIdx: -1, fronts: [], hits };
  }

  // Gevşetilmiş 0-1 BFS: (si,sd)'den goal hücresine, YALNIZCA henüz karara
  // bağlanmamış hücrelerde YENİ ayna gerektiren dönüşleri "maliyet" sayarak
  // (zaten kararlaştırılmış aynalar/splitter/portal bedava) minimum ek ayna
  // sayısını bulur — dal-sınır budaması için bir ALT SINIR verir.
  const dist = new Int32Array(N * 4);
  const stamp = new Int32Array(N * 4);
  let gen = 0;
  const dq = new Int32Array(N * 4 * 64 + 16);
  function bfsMin(si, sd, goal) {
    gen++;
    const cap = dq.length;
    let head = cap >> 1;
    let tail = head;
    const st0 = si * 4 + sd;
    stamp[st0] = gen;
    dist[st0] = 0;
    dq[tail++] = st0;
    let guard = 0;
    while (head < tail) {
      if (++guard > 200000) break;
      const st = dq[head++];
      const i = st >> 2;
      const d = st & 3;
      const cost = dist[st];
      const c = grid[i];
      if (c === Cell.WALL || c === C_FORB) continue;
      if (c === Cell.TARGET) {
        if (i === goal) return cost;
        continue;
      }
      if (c === Cell.PORTAL) {
        const e = portalExit[i];
        const bx = (e % gx) + DX[d];
        const by = ((e / gx) | 0) + DY[d];
        if (bx < 0 || by < 0 || bx >= gx || by >= gy) continue;
        const ns = (by * gx + bx) * 4 + d;
        if (stamp[ns] !== gen || dist[ns] > cost) {
          stamp[ns] = gen;
          dist[ns] = cost;
          dq[--head] = ns;
        }
        continue;
      }
      let b0 = d;
      let b1 = -1;
      let b2 = -1;
      let extra = 0;
      if (c === Cell.SPLITTER) {
        b0 = splitA[i];
        b1 = splitB[i];
      } else if (c === Cell.EMPTY) {
        const dv = dec[i];
        if (dv === D_UNDEC) {
          b1 = (d + 3) % 4;
          b2 = (d + 1) % 4;
          extra = 1;
        } else if (dv !== D_NONE) {
          b0 = REFL[dv][d];
        }
      }
      const x = i % gx;
      const y = (i / gx) | 0;
      if (b0 >= 0) {
        const nx = x + DX[b0];
        const ny = y + DY[b0];
        if (nx >= 0 && ny >= 0 && nx < gx && ny < gy) {
          const ni = ny * gx + nx;
          const cc = grid[ni];
          if (cc !== Cell.WALL && cc !== C_FORB) {
            const ns = ni * 4 + b0;
            if (stamp[ns] !== gen || dist[ns] > cost) {
              stamp[ns] = gen;
              dist[ns] = cost;
              dq[--head] = ns;
            }
          }
        }
      }
      for (const od of [b1, b2]) {
        if (od < 0) continue;
        const nx = x + DX[od];
        const ny = y + DY[od];
        if (nx < 0 || ny < 0 || nx >= gx || ny >= gy) continue;
        const ni = ny * gx + nx;
        const cc = grid[ni];
        if (cc === Cell.WALL || cc === C_FORB) continue;
        const ns = ni * 4 + od;
        const nc = cost + extra;
        if (stamp[ns] !== gen || dist[ns] > nc) {
          stamp[ns] = gen;
          dist[ns] = nc;
          if (extra === 0) dq[--head] = ns;
          else dq[tail++] = ns;
        }
      }
    }
    return Infinity;
  }

  function lowerBound(sim) {
    const starts = [];
    if (sim.branchIdx >= 0) starts.push([sim.branchIdx, sim.branchDir, sim.branchColor]);
    for (const [i, d, color] of sim.fronts) {
      const x = (i % gx) + DX[d];
      const y = ((i / gx) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
      starts.push([y * gx + x, d, color]);
    }
    let lb = 0;
    for (let s = 0; s < tIdx.length; s++) {
      const hit = sim.hits[s];
      const tc = tColor[s];
      if (hit.r > tc.r || hit.g > tc.g || hit.b > tc.b) return Infinity; // fazla renk -> asla tam eşleşmez
      if (colorEquals(hit, tc)) continue;
      const need = { r: tc.r && !hit.r, g: tc.g && !hit.g, b: tc.b && !hit.b };
      const cache = new Map();
      for (const ch of ["r", "g", "b"]) {
        if (!need[ch]) continue;
        let best = Infinity;
        for (let f = 0; f < starts.length; f++) {
          const [i, d, color] = starts[f];
          if (!color[ch]) continue;
          if (color.r > tc.r || color.g > tc.g || color.b > tc.b) continue;
          let v = cache.get(f);
          if (v === undefined) {
            v = bfsMin(i, d, tIdx[s]);
            cache.set(f, v);
          }
          if (v < best) best = v;
          if (best === 0) break;
        }
        if (best === Infinity) return Infinity;
        if (best > lb) lb = best;
      }
    }
    return lb;
  }

  let found = false;
  let foundDec = null;
  let timedOut = false;
  let nodes = 0;
  function dfs() {
    if (found || timedOut) return;
    if ((nodes & 511) === 0 && Date.now() > deadline) {
      timedOut = true;
      return;
    }
    nodes++;
    const sim = partialSim();
    if (sim.dead) return;
    if (sim.branchIdx < 0) {
      for (let s = 0; s < tIdx.length; s++) if (!colorEquals(sim.hits[s], tColor[s])) return;
      foundDec = Int8Array.from(dec);
      found = true; // TAM bir dizilim bulundu: tüm hedefler doğru renkte, hiç yasak hücreye girilmedi
      return;
    }
    const lb = lowerBound(sim);
    if (lb === Infinity || placed + lb > maxMirrors) return;
    const j = sim.branchIdx;
    if (placed < maxMirrors) {
      for (const m of [D_FS, D_BS]) {
        dec[j] = m;
        placed++;
        dfs();
        placed--;
        dec[j] = D_UNDEC;
        if (found || timedOut) return;
      }
    }
    dec[j] = D_NONE;
    dfs();
    dec[j] = D_UNDEC;
  }
  dfs();
  return { solved: found, timedOut, nodes, dec: foundDec };
}

// İpucu için tam çözüm: bulmacanın (en fazla maxMirrors aynayla) GERÇEK bir
// çözümünü Map<"x,y", MirrorType> olarak döner; bulunamazsa ya da süre
// dolarsa null. fixed verilirse oyuncunun mevcut aynaları KORUNUR — çözüm
// onların üstüne kurulur (ipucu, oyuncunun kurduğu mantığı bozmaz).
// existsSolutionAvoiding'in dec dizisini [["x,y", MirrorType], ...] biçimine
// çevirir (2 = "/", 3 = "\\"; bkz. D_FS/D_BS).
function decToMirrors(dec, gx) {
  const out = [];
  dec.forEach((v, i) => {
    if (v === 2) out.push([`${i % gx},${(i / gx) | 0}`, MirrorType.FORWARD_SLASH]);
    else if (v === 3) out.push([`${i % gx},${(i / gx) | 0}`, MirrorType.BACK_SLASH]);
  });
  return out;
}

export function solveMirrors(puzzle, maxMirrors, timeLimitMs, fixed = null) {
  const res = existsSolutionAvoiding(puzzle, new Set(), maxMirrors, timeLimitMs, fixed ? { fixed } : {});
  if (!res.solved || !res.dec) return null;
  const gx = puzzle.gridSize.x;
  const out = new Map();
  res.dec.forEach((v, i) => {
    if (v === 2) out.set(`${i % gx},${(i / gx) | 0}`, MirrorType.FORWARD_SLASH);
    else if (v === 3) out.set(`${i % gx},${(i / gx) | 0}`, MirrorType.BACK_SLASH);
  });
  return out;
}

// jointSolve tabanlı duvar denemesi (Map döndürür, sayı değil). Her denemede
// %75 ihtimalle GÜNCEL çözüm yolu üzerindeki bir hücreyi (bkz.
// pathCellsForLegs — bu ihtimalle GERÇEK zorluk artışı sağlanır), %25
// ihtimalle tamamen rastgele bir hücreyi (biraz yanıltıcılık/çeşitlilik
// için, orijinal tasarım niyetiyle tutarlı) dener.
function attemptWallsJoint(p, grid, excluded, legsFn, range, maxCount, chance, currentMerged) {
  let merged = currentMerged;
  for (let i = 0; i < maxCount; i++) {
    if (merged.size >= range.max) break;
    if (rng.randf() >= chance) continue;
    const pathCells = pathCellsForLegs(p, merged, legsFn()).filter((c) => !excluded.some((e) => posEquals(e, c)));
    let wallPos;
    if (pathCells.length > 0 && rng.randf() < 0.75) {
      wallPos = pathCells[rng.randiRange(0, pathCells.length - 1)];
    } else {
      wallPos = randomPosExcluding(grid, excluded);
    }
    p.addWall(wallPos);
    const next = jointSolve(p, legsFn());
    if (!next || next.size > range.max) {
      p.removeCell(wallPos);
    } else {
      merged = next;
      excluded.push(wallPos);
    }
  }
  return merged;
}

// attemptPortal'ın jointSolve tabanlı sürümü.
//
// PORTAL ZORUNLULUĞU DOĞRULAMASI (zaman içinde kademeli olarak eklenip
// sıkılaştırıldı ve kök nedeni bulunup düzeltildi — tekrarlanan bir hata:
// portallı bölümler portal elementi hiç kullanılmadan geçilebiliyordu):
//
// Karşılaştırma zorluk bandına değil, oyuncunun GERÇEK ayna hakkına
// (`withPortal.size`) göre yapılıyor — portal SADECE portalsız çözüm bu
// hakla (ya da hiçbir şekilde) ulaşılamıyorsa gerçekten gereklidir.
// NOT (performans): her deneme EN FAZLA 2 tam jointSolve() (BFS) çalıştırıyor
// — MAX_POSITION_TRIES çok yüksek tutulursa generate() gözle görülür
// yavaşlar; 10, gerekli bir konum bulma ihtimaliyle hız arasında ölçülmüş
// makul bir denge.
function attemptPortalJoint(p, grid, excluded, legsFn, range) {
  const MAX_POSITION_TRIES = 10;

  for (let attempt = 0; attempt < MAX_POSITION_TRIES; attempt++) {
    const a = randomPosExcluding(grid, excluded);
    const b = randomPosExcluding(grid, [...excluded, a]);
    p.addPortalPair(a, b);
    const withPortal = jointSolve(p, legsFn());
    if (!withPortal || withPortal.size < range.min || withPortal.size > range.max) {
      p.removePortalPair(a, b);
      continue;
    }
    p.removePortalPair(a, b);
    const withoutPortal = jointSolve(p, legsFn());
    // Oyuncunun GERÇEK ayna hakkı withPortal.size'dır — portalsız çözüm
    // bununla (ya da daha azıyla) mümkünse portal bypass edilebilir demektir,
    // bu yüzden SADECE withPortal.size'dan KESİNLİKLE DAHA FAZLA ayna
    // gerektiriyorsa (ya da hiç çözülemiyorsa) "gerekli" sayılır.
    const necessary = !withoutPortal || withoutPortal.size > withPortal.size;
    if (necessary) {
      p.addPortalPair(a, b);
      excluded.push(a, b);
      return withPortal;
    }
    // gerekli değil (oyuncu elindeki aynalarla portalsız da çözebilir) -> bu konumu TAMAMEN reddet, başka konum dene
  }

  return null; // MAX_POSITION_TRIES denemede de GERÇEKTEN gerekli bir portal konumu bulunamadı -> bu turda portal YOK
}


// Tek kaynak -> tek hedef. jointSolve/attemptWallsJoint kullanır (tek ayaklı
// bir "legs" dizisiyle) — böylece duvar denemeleri de yol-hedefli olur (bkz.
// pathCellsForLegs notu), diğer bantlarla aynı zorluk kalibrasyonunu paylaşır.
function trySingleBeam(grid, cfg) {
  const emitter = randomEdgeEmitter(grid);
  const targetPos = randomPosExcluding(grid, [emitter.pos]);
  const color = PRIMARY_COLORS[rng.randiRange(0, 2)];

  const p = new PuzzleData();
  p.gridSize = grid;
  p.addSource(emitter.pos, emitter.dir, color);
  p.addTarget(targetPos, color);

  const excluded = [emitter.pos, targetPos];
  const legsFn = () => [{ pos: emitter.pos, dir: emitter.dir, goals: [targetPos] }];

  let merged = jointSolve(p, legsFn());
  if (!merged) return null;

  merged = attemptWallsJoint(p, grid, excluded, legsFn, cfg.range, cfg.maxWalls, cfg.wallChance, merged);
  if (!merged) return null;

  if (merged.size < cfg.range.min || merged.size > cfg.range.max) return null;
  // Üreticinin KENDİ çözümü bulmacayla birlikte taşınır: ipucu bunu kullanır,
  // böylece çalışma anında (Usta'da 10-40 sn sürebilen) tam çözüm aramasına
  // gerek kalmaz (bkz. main.js → giveHint).
  p.solution = [...merged];
  p.maxMirrorsHint = merged.size;
  return p;
}

// N KAYNAKLI, SPLITTER'SIZ yapı. Eskiden ayrı fonksiyonlar olan tryMixedBeam
// (2 kaynak, paylaşılan tek hedefte renk karışımı) ve tryTwoIndependent (2
// kaynak, 2 bağımsız hedef) artık TEK bu fonksiyona genelleştirildi —
// Orta/Zor'un "portal-only" turları hem 2 kaynaklı hem "N hedef VEYA 1
// (paylaşılan) hedef" seçimi gerektirdiği için ("1 hedef" ifadesi ışının tek
// hedef küreye götürülmesi anlamına gelir).
// singleTarget=true: TÜM kaynaklar AYNI hedefte renk karışımı yapar (hedef
// rengi = tüm kaynak renklerinin union'ı). singleTarget=false: her kaynağın
// KENDİ (renk eşleşen) hedefi vardır. opts.addPortal/opts.requirePortal:
// attemptPortalJoint'teki AYNI gereklilik doğrulaması (jenerik legsFn ile
// çalışır, burada değişikliğe gerek yok).
function tryMultiBeam(grid, cfg, numSources, singleTarget, opts = {}) {
  const emitters = randomDistinctEmitters(grid, numSources);
  if (!emitters) return null;
  // Paylaşılan (singleTarget) hedeflerde union HER ZAMAN beyaz olmalı —
  // bkz. sharedTargetColors üstündeki yorum. Bağımsız hedeflerde (her
  // kaynağın kendi hedefi var) böyle bir kısıtlama yok, eskisi gibi
  // rastgele primary renkler kullanılır.
  const colors = singleTarget
    ? sharedTargetColors(numSources)
    : emitters.map(() => PRIMARY_COLORS[rng.randiRange(0, 2)]);

  const p = new PuzzleData();
  p.gridSize = grid;
  emitters.forEach((e, i) => p.addSource(e.pos, e.dir, colors[i]));

  const excluded = emitters.map((e) => e.pos);
  let legsFn;
  if (singleTarget) {
    const t = randomPosExcluding(grid, excluded);
    excluded.push(t);
    let unionColor = colors[0];
    for (let i = 1; i < numSources; i++) unionColor = colorUnion(unionColor, colors[i]);
    p.addTarget(t, unionColor);
    legsFn = () => emitters.map((e) => ({ pos: e.pos, dir: e.dir, goals: [t] }));
  } else {
    const ts = [];
    for (let i = 0; i < numSources; i++) {
      const t = randomPosExcluding(grid, excluded);
      excluded.push(t);
      ts.push(t);
    }
    ts.forEach((t, i) => p.addTarget(t, colors[i]));
    legsFn = () => emitters.map((e, i) => ({ pos: e.pos, dir: e.dir, goals: [ts[i]] }));
  }

  let merged = jointSolve(p, legsFn());
  if (!merged) return null;

  merged = attemptWallsJoint(p, grid, excluded, legsFn, cfg.range, cfg.maxWalls, cfg.wallChance, merged);
  if (!merged) return null;

  if (opts.addPortal) {
    const withPortal = attemptPortalJoint(p, grid, excluded, legsFn, cfg.range);
    if (withPortal !== null) {
      merged = withPortal;
    } else if (opts.requirePortal) {
      return null; // portal isteniyordu ama gerekli bir konum bulunamadı
    }
  }

  if (merged.size < cfg.range.min || merged.size > cfg.range.max) return null;
  // Tekrar bildirilen bir hata: oyun oynanırken portal hiç kullanılmadan
  // bölüm geçilebiliyordu (ORTA zorluk örneği: 2 kaynak, 2 ayrı hedef,
  // splitter YOK, iki portal). Kök neden: aynı sorunu kapatmak için önceden
  // eklenen hasBypassSolution() (bkz. o fonksiyonun üstündeki uzun not — TÜM
  // kaynak->hedef eşleşmelerini deneyip portal/splitter OLMADAN GERÇEKTEN bir
  // çözüm var mı diye bakan genel doğrulama) SADECE tryComplexBeam'e
  // bağlanmıştı. Ama Orta'nın (ve Zor'un) "sadece portal" turu splitter'sız
  // BU fonksiyonu (tryMultiBeam) kullanıyor — buradaki tek doğrulama
  // attemptPortalJoint'in "gereklilik" kontrolüydü, ki o SADECE AYNI
  // source[i]->target[i] eşleşmesini (aynı legsFn) portallı/portalsız
  // karşılaştırır. İki kaynağın rengi TESADÜFEN aynı primary olduğunda
  // (colors = emitters.map(() => PRIMARY_COLORS[rng.randiRange(0,2)]) —
  // bağımsız seçildiği için mümkün), kaynaklar ÇAPRAZ eşleşerek (source[0]
  // -> target[1] gibi) portale hiç dokunmadan çözülebiliyordu —
  // attemptPortalJoint bu eşleşmeyi ASLA test etmiyordu. Düzeltme:
  // tryComplexBeam'deki AYNI hasBypassSolution() çağrısı buraya da eklendi.
  if (opts.addPortal && hasBypassSolution(p, merged.size)) return null; // baypas var -> bu aday elenir, generate() başka bir aday dener
  // Üreticinin KENDİ çözümü bulmacayla birlikte taşınır: ipucu bunu kullanır,
  // böylece çalışma anında (Usta'da 10-40 sn sürebilen) tam çözüm aramasına
  // gerek kalmaz (bkz. main.js → giveHint).
  p.solution = [...merged];
  p.maxMirrorsHint = merged.size;
  return p;
}

// Splitter'ı (Prizma Bloğu) DOĞASI GEREĞİ, MATEMATİKSEL OLARAK GERÇEKTEN
// gerekli kılan TEK kaynaklı bulmaca yapısı — tekrar tekrar bildirilen bir
// hataya çözüm: ışın bölme (splitter) olan bölümler o elementi hiç
// kullanmadan da geçilebiliyordu; hedef, oyuncunun splitter'ı kullanmak
// ZORUNDA kalmasıdır.
//
// NEDEN "İKİ BAĞIMSIZ kaynak + splitter eklenti" İŞE YARAMIYORDU: solver.js
// → simulate()'te bir TARGET hücresi ışını YUTAR (beamPaths'e eklenir ama
// kuyruğa yeni bir iş PUSH'LANMAZ) — yani TEK bir dallanmayan ışın en fazla
// BİR hedefe ulaşabilir, ne kadar ayna eklenirse eklensin. İki AYRI kaynak
// varsa her ışın kendi hedefine splitter'sız da rahatça ulaşabilir —
// splitter sadece "üzerine binmiş" bir dekor olur (bkz. bu sorunun
// tryComplexBeam ile NASIL çözüldüğü, aşağıda).
//
// BURADAKİ YAPI (sadece Orta'nın splitter turlarında kullanılıyor): TEK bir
// kaynak var. Işın splitter'a kadar yönlendirilir; splitter orada ışını
// GERÇEKTEN ikiye ayırır, her dal kendi hedefine gider. "Tek ışın en fazla
// bir hedefe ulaşır" kuralı gereği, splitter OLMADAN bu TEK ışın iki hedefin
// İKİSİNİ BİRDEN asla aydınlatamaz — bu, HER ZAMAN matematiksel olarak
// kanıtlanmış bir gerekliliktir.
//
// Kaynak->splitter arası da (diğer bacaklar gibi) oyuncunun KENDİ
// aynalarıyla çözmesi gereken GERÇEK bir jointSolve bacağı: `findMirrorPath`
// ile önce splitter'a giden GERÇEK (solver'ın bulacağı) en ucuz yol bir kez
// hesaplanır — bu yolun VARIŞ YÖNÜ, splitter'ın hangi iki yöne dallanacağını
// (düz + dönüş) belirler.
function trySplitterBeam(grid, cfg, opts = {}) {
  const emitter = randomEdgeEmitter(grid);
  const color = PRIMARY_COLORS[rng.randiRange(0, 2)];
  const splitterPos = randomPosExcluding(grid, [emitter.pos]);
  if (posEquals(splitterPos, emitter.pos)) return null;

  const branchRight = rng.randf() < 0.5;

  const excluded = [emitter.pos, splitterPos];
  const t1 = randomPosExcluding(grid, excluded);
  excluded.push(t1);
  const t2 = randomPosExcluding(grid, excluded);
  if (posEquals(t1, t2)) return null;
  excluded.push(t2);

  const p = new PuzzleData();
  p.gridSize = grid;
  p.addSource(emitter.pos, emitter.dir, color);
  p.addSplitter(splitterPos);
  p.addTarget(t1, color);
  p.addTarget(t2, color);

  const approach = findMirrorPath(p, emitter.pos, emitter.dir, [splitterPos]);
  if (!approach) return null;
  const arrivalDir = approach.dir;
  const straightDir = arrivalDir;
  const turnDir = branchRight ? turnRight(arrivalDir) : turnLeft(arrivalDir);
  // Tasarlanan varış yönünden türetilen iki kol, splitter'ın SABİT (mutlak)
  // çıkış yönleri olarak kaydedilir — tahtadaki oklar tam olarak bunlardır.
  p.setSplitterExits(splitterPos, [straightDir, turnDir]);

  const legsFn = () => [
    { pos: emitter.pos, dir: emitter.dir, goals: [splitterPos] },
    { pos: splitterPos, dir: straightDir, goals: [t1] },
    { pos: splitterPos, dir: turnDir, goals: [t2] },
  ];

  let merged = jointSolve(p, legsFn());
  if (!merged) return null;

  merged = attemptWallsJoint(p, grid, excluded, legsFn, cfg.range, cfg.maxWalls, cfg.wallChance, merged);
  if (!merged) return null;

  if (opts.addPortal) {
    const withPortal = attemptPortalJoint(p, grid, excluded, legsFn, cfg.range);
    if (withPortal !== null) {
      merged = withPortal;
    } else if (opts.requirePortal) {
      return null;
    }
  }

  if (merged.size < cfg.range.min || merged.size > cfg.range.max) return null;
  // Üreticinin KENDİ çözümü bulmacayla birlikte taşınır: ipucu bunu kullanır,
  // böylece çalışma anında (Usta'da 10-40 sn sürebilen) tam çözüm aramasına
  // gerek kalmaz (bkz. main.js → giveHint).
  p.solution = [...merged];
  p.maxMirrorsHint = merged.size;
  return p;
}

// N kaynaklı (N>=2), splitter İÇEREN yapı — Zor/Usta'nın "en az 2/3 kaynak"
// + "splitter" gereksinimlerini AYNI ANDA karşılamak için.
//
// SORUN: Zor/Usta'da splitter varken de en az 2 (Usta'da 3) kaynak
// gerekiyor — ama trySplitterBeam'in gereklilik kanıtı TEK kaynağa dayanıyor
// (bkz. o fonksiyonun üstündeki not: iki bağımsız kaynak splitter'ı dekora
// çevirir). Çözüm: kaynaklardan SADECE BİRİ (source[0]) splitter'a ZORUNLU
// bir ara-durak olarak yönlendirilir — bu bacak trySplitterBeam'deki AYNI
// yapıyı (kaynak->splitter, splitter->düz, splitter->dönüş) birebir korur,
// yani splitter'ın kendisi hâlâ MATEMATİKSEL OLARAK gerekli (kanıt hiç
// değişmedi). Kalan (numSources-1) kaynak TAMAMEN BAĞIMSIZ bacaklar olarak
// eklenir.
//
// HEDEF SAYISI: splitter'lı bu yapıda HER ZAMAN numSources+1 hedef vardır
// (splitter'ın iki kolu ayrı hedeflere + kalan kaynaklar kendi hedeflerine).
// "N hedef veya 1 hedef" kuralı yalnızca splitter'sız yapılarda
// (tryMultiBeam) geçerlidir.
// opts.addPortal/opts.requirePortal: trySplitterBeam'deki AYNI mantık —
// jointSolve TÜM bacakları (splitter dahil) kapsadığı için portal
// gerekliliği doğrulaması değişikliğe gerek kalmadan aynen çalışır.
// MATEMATİKSEL OLARAK KANITLANDI: singleTarget=true bu fonksiyonda ASLA
// güvenli olamaz, o yüzden AŞAĞIDA YOK SAYILIYOR (parametre geriye dönük
// uyumluluk için duruyor ama artık okunmuyor). Kanıt: singleTarget
// modunda splitter'ın İKİ dalı da AYNI tek paylaşılan hedefe (tShared),
// AYNI renkle (colors[0]) gidiyordu — ama colorUnion İDEMPOTENT'tir (aynı
// rengi iki kere göndermek hiçbir şey KATMAZ) VE source[0]'ın splitter'sız
// TEK ışını zaten tShared'a DOĞRUDAN ulaşıp AYNI katkıyı (colors[0]) tek
// başına sağlayabilir. Yani splitter'ın "matematiksel olarak gerekli"
// kanıtı (trySplitterBeam'deki: "tek ışın en fazla BİR hedefe ulaşır, iki
// FARKLI hedef splitter ister") burada hiç GEÇERLİ DEĞİLDİ — ortada tek bir
// hedef vardı, "iki farklı hedef" hiç yoktu. Denetim bunu doğruladı: 500+
// üretilmiş singleTarget=true Usta bulmacasının **%99'unda** gerçek bir
// baypas vardı (bkz. hasBypassSolution'daki not) — bu bir üretim/RNG
// şanssızlığı DEĞİL, YAPISAL bir imkânsızlıktı. Düzeltilmiş hasBypassSolution
// artık bunu doğru yakaladığı için, singleTarget=true bırakılsaydı bu dal
// generate()'in 500 denemesinde neredeyse HİÇ geçerli aday üretemez, Usta
// bulmacaların yarısı sessizce splitter'sız/portalsız yedek bulmacaya
// düşerdi. Çözüm: bu fonksiyon HER ZAMAN (aşağıdaki eski "!singleTarget"
// dalı, ki kanıtı GERÇEKTEN geçerli) bağımsız hedefler üretir — "1 hedef"
// çeşitliliği artık SADECE splitter'sız yapılarda (tryMultiBeam) sunuluyor,
// orada gerçekten güvenli çünkü splitter yok ki "dekor" olabilsin.
function tryComplexBeam(grid, cfg, numSources, singleTargetIgnored, opts = {}) {
  const emitters = randomDistinctEmitters(grid, numSources);
  if (!emitters) return null;
  const colors = emitters.map(() => PRIMARY_COLORS[rng.randiRange(0, 2)]);
  const emitterPositions = emitters.map((e) => e.pos);
  const splitterPos = randomPosExcluding(grid, emitterPositions);
  if (emitters.some((e) => posEquals(e.pos, splitterPos))) return null;
  const branchRight = rng.randf() < 0.5;

  const excluded = [...emitterPositions, splitterPos];

  const p = new PuzzleData();
  p.gridSize = grid;
  emitters.forEach((e, i) => p.addSource(e.pos, e.dir, colors[i]));
  p.addSplitter(splitterPos);

  // source[0] -> splitter GERÇEK varış yönü (bkz. trySplitterBeam'deki AYNI
  // teknik) — splitter'ın iki dalının (düz + dönüş) MUTLAK yönlerini belirler.
  const approach = findMirrorPath(p, emitters[0].pos, emitters[0].dir, [splitterPos]);
  if (!approach) return null;
  const straightDir = approach.dir;
  const turnDir = branchRight ? turnRight(straightDir) : turnLeft(straightDir);
  p.setSplitterExits(splitterPos, [straightDir, turnDir]);

  // HEDEF SAYISI = numSources + 1: splitter'ın iki kolu (düz -> tStraight,
  // dönüş -> tTurn) KENDİ tek renkli (colors[0]) hedeflerine, kalan
  // (numSources-1) kaynağın her biri kendi bağımsız hedefine gider.
  // Splitter'ın matematiksel olarak gerekli olduğunun kanıtı: splitter'sız
  // her ışın en fazla BİR hedefe ulaşır; numSources ışınla numSources+1
  // hedefin hepsi beslenemez. ("N hedef" için kollardan birinin başka bir
  // kaynakla hedef paylaştığı renk-karışımlı varyant denendi, ama üretici
  // Usta'da neredeyse hiç geçerli aday bulamayıp yedek bulmacaya düşüyordu.)
  const tStraight = randomPosExcluding(grid, excluded);
  excluded.push(tStraight);
  const tTurn = randomPosExcluding(grid, excluded);
  excluded.push(tTurn);
  const extraTargets = [];
  for (let i = 1; i < numSources; i++) {
    const t = randomPosExcluding(grid, excluded);
    excluded.push(t);
    extraTargets.push(t);
  }

  p.addTarget(tStraight, colors[0]);
  p.addTarget(tTurn, colors[0]);
  extraTargets.forEach((t, i) => p.addTarget(t, colors[i + 1]));

  const legsFn = () => {
    const legs = [
      { pos: emitters[0].pos, dir: emitters[0].dir, goals: [splitterPos] },
      { pos: splitterPos, dir: straightDir, goals: [tStraight] },
      { pos: splitterPos, dir: turnDir, goals: [tTurn] },
    ];
    for (let i = 1; i < numSources; i++) legs.push({ pos: emitters[i].pos, dir: emitters[i].dir, goals: [extraTargets[i - 1]] });
    return legs;
  };

  let merged = jointSolve(p, legsFn());
  if (!merged) return null;

  merged = attemptWallsJoint(p, grid, excluded, legsFn, cfg.range, cfg.maxWalls, cfg.wallChance, merged);
  if (!merged) return null;

  if (opts.addPortal) {
    const withPortal = attemptPortalJoint(p, grid, excluded, legsFn, cfg.range);
    if (withPortal !== null) {
      merged = withPortal;
    } else if (opts.requirePortal) {
      return null; // "hem splitter hem portal" isteniyordu ama gerekli bir portal konumu bulunamadı
    }
  }

  if (merged.size < cfg.range.min || merged.size > cfg.range.max) return null;
  if (hasBypassSolution(p, merged.size)) return null; // baypas var -> bu aday elenir, generate() başka bir aday dener
  // Üreticinin KENDİ çözümü bulmacayla birlikte taşınır: ipucu bunu kullanır,
  // böylece çalışma anında (Usta'da 10-40 sn sürebilen) tam çözüm aramasına
  // gerek kalmaz (bkz. main.js → giveHint).
  p.solution = [...merged];
  p.maxMirrorsHint = merged.size;
  return p;
}

// Süre bütçeleri. SYNC: ana thread'de (ekran donar) çalışırken kısa tutulur.
// BACKGROUND: Web Worker'da (bkz. generator.worker.js / puzzleService.js)
// ekran donmadığı için çok daha cömert — daha çok aday denenir ve ayna
// hakkı splitter'lı Zor/Usta'da da gerçek minimuma çekilebilir.
const BUDGETS = {
  sync: { generateMs: 1200, hardnessProbeMs: 120, minimizeStepMs: 150, minimizeBudgetMs: 450, portalOnlyCandidates: 5 },
  background: { generateMs: 4000, hardnessProbeMs: 300, minimizeStepMs: 1500, minimizeBudgetMs: 3000, portalOnlyCandidates: 8 },
};

// Üretici maxMirrorsHint'i kendi kurduğu çözümün ayna sayısından alıyor, ama
// bazen daha az aynalı başka bir çözüm de var (ölçüm: 40 bulmacanın 4'ünde
// 1-2 ayna fazlası). Tam çözücüyle (k-1) aynalı bir çözüm aranır; bulunursa
// hak düşürülüp tekrarlanır. Arama süre sınırına takılırsa (kanıtlanamadı)
// hak OLDUĞU GİBİ bırakılır — bulmaca asla çözülemez hale gelmez.
// Baypas güvencesi korunur: hasBypassSolution zaten "mekanikleri kullanmadan
// ≤ eski hak" çözümü olmadığını kanıtladı, daha az ayna bunun alt kümesi.
function minimizeMirrorHint(puzzle, deadline, stepMs) {
  while (puzzle.maxMirrorsHint > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const r = existsSolutionAvoiding(puzzle, new Set(), puzzle.maxMirrorsHint - 1, Math.min(stepMs, remaining));
    if (!r.solved) return; // ya kanıtlandı (daha azı yok) ya da süre doldu
    puzzle.maxMirrorsHint--;
    // Saklanan çözüm de küçülen hakka uymalı (bkz. p.solution notu).
    if (r.dec) puzzle.solution = decToMirrors(r.dec, puzzle.gridSize.x);
  }
}

// Ana giriş noktası: verilen zorlukta, solver-doğrulanmış bir bulmaca üretir.
// Dönen puzzle.blindMode: bu turun "Işını Çalıştır" (kör mod) ile mi
// oynanacağını main.js'e bildirir — splitter/portal yerleşiminden TAMAMEN
// BAĞIMSIZ (bkz. TIER_CONFIG.specialChance notu).
// opts.background: true ise (Web Worker) BUDGETS.background kullanılır.
export function generate(difficulty, seedValue = -1, opts = {}) {
  if (seedValue >= 0) rng.seed(seedValue);
  const deterministic = !!opts.deterministic;
  const budget = opts.background ? BUDGETS.background : BUDGETS.sync;
  const prevBypassMs = BYPASS_SEARCH_TIME_MS;
  if (deterministic) BYPASS_SEARCH_TIME_MS = DETERMINISTIC_BYPASS_MS;
  try {
    return generateInner(difficulty, opts, budget, deterministic);
  } finally {
    BYPASS_SEARCH_TIME_MS = prevBypassMs;
  }
}

function generateInner(difficulty, opts, budget, deterministic) {
  const cfg = TIER_CONFIG[difficulty] || TIER_CONFIG.kolay;
  const special = (cfg.specialChance || 0) > 0 && rng.randf() < cfg.specialChance;

  // ZORLUK KALİBRASYONU v2 — bulmacaların genel olarak çok kolay çıkması
  // sorununa çözüm: CANDIDATES_WANTED kadar GEÇERLİ bulmaca üretip
  // aralarından GERÇEK ayna sayısı EN YÜKSEK olanı seçiyoruz. Bu değer TÜM
  // bantlarda (Kolay hariç) düşürüldü — yeni çok bacaklı yapılar zaten daha
  // zor, "en yüksek ayna sayısı" seçimini agresif tutmak mirror sayısını
  // gereksiz şişiriyordu (ayna sayılarının çok fazla artmaması ilkesiyle
  // çelişiyordu).
  let CANDIDATES_WANTED = cfg.candidates || 4;
  const maxAttempts = 500;

  // Bilinen bir performans sorunu: seviye seçildikten sonra oyun bazen kısa
  // süreliğine takılıyordu. Kök neden: hasBypassSolution() içindeki
  // existsSolutionAvoiding() çağrılarının (her biri BYPASS_SEARCH_TIME_MS =
  // 500ms'e kadar sürebilir, bir adayda 3 kez tetiklenebilir) maxAttempts=500
  // ile çarpımı — reddedilen adaylar birikince toplam süre saniyeler (hatta
  // teorik en kötü durumda dakikalar) sürebiliyordu, hepsi ana thread'i
  // SENKRON bloke ediyordu (jenerasyon await edilmiyor, bkz. main.js).
  // Düzeltme: generate()'in TÜMÜNE (ana döngü + aşağıdaki yedek döngü) sabit
  // bir duvar-saati bütçesi konuyor — bütçe dolarsa o ana kadar bulunan EN
  // İYİ adayla (veya yedek/ONBOARDING güvenlik ağıyla) devam edilir. Bu,
  // baypas KONTROLÜNÜN kendisini (doğruluğunu/güvenliğini) DEĞİŞTİRMİYOR —
  // sadece "ne kadar aday denenebilir"i zaman açısından sınırlıyor.
  const GENERATE_DEADLINE_MS = budget.generateMs;
  const generateStart = Date.now();
  const withinBudget = () => deterministic || Date.now() - generateStart < GENERATE_DEADLINE_MS;

  // Hangi YAPININ (splitter/portal/ikisi/hiçbiri) üretileceği kararı, `special`
  // ile AYNI mantıkla, deneme döngüsünden ÖNCE TEK SEFERDE veriliyor (daha
  // önceki bir bothMode düzeltmesindeki aynı ders: eğer bu karar HER
  // denemede yeniden atılan bir zar olsaydı, per-attempt başarı oranı düşük
  // olan yapılar — örn. portal ZORUNLU turlar, çünkü attemptPortalJoint
  // "gerçekten gerekli" bir konum bulana kadar arar ve bu her zaman kolay
  // değildir — "en yüksek ayna sayısı" havuzunda başarı oranı yüksek diğer
  // yapılarla (örn. splitter-only) haksız yere yarışıp neredeyse hiç
  // kazanamazdı, gerçekleşen oran istenen 10'da-N oranından ÇOK sapardı
  // (ölçüldü). Tek seferlik seçimle TÜM 500 deneme SADECE seçilen yapıyı
  // dener (farklı rastgele konumlarla), böylece gerçekleşen oran doğrudan
  // TIER_CONFIG'teki olasılıklara eşitlenir.
  let singleTarget = rng.randf() < 0.5;
  let tag = "single"; // kolay/varsayılan
  if (difficulty === "orta") {
    tag = rng.randf() < (cfg.splitterChance ?? 0.5) ? "splitterOnly" : "portalOnly";
  } else if (difficulty === "zor") {
    const roll = rng.randf();
    if (roll < cfg.bothChance) tag = "both";
    else if (roll < cfg.bothChance + cfg.splitterOnlyChance) tag = "splitterOnly";
    else tag = "portalOnly";
  } else if (difficulty === "usta") {
    tag = "both";
  }

  // ZORLUK PUANI — adaylar arasında seçim. Varsayılan ölçüt ayna sayısı.
  // Ama Zor'un portallı (splitter'sız) turlarında iki ışın birbirinden
  // BAĞIMSIZ çözülebildiği için aynı ayna sayısında bulmacalar çok kolay
  // kalıyordu (ölçüm: çözücü 1-2 ms, splitter'lı Zor'lar saniyeler). Aynı
  // ayna sayısındaki adaylar arasında zorluk da ÇOK değişken (tam çözücünün
  // DFS düğüm sayısı 29 ile 19000 arası) — bu turlarda daha fazla aday
  // üretilip tam çözücüyü EN ÇOK zorlayan (en çok düğüm) seçiliyor. Süre
  // sınırı dolarsa (timedOut) aday "çok zor" sayılır.
  // Deterministik modda zorluk puanlaması KAPALI (süre ölçtüğü için cihaza
  // göre değişirdi) — adaylar ayna sayısına göre seçilir.
  const hardnessScoring = !deterministic && difficulty === "zor" && tag === "portalOnly";
  if (hardnessScoring) CANDIDATES_WANTED = budget.portalOnlyCandidates;
  const candidateScore = (puzzle) => {
    if (!hardnessScoring) return puzzle.maxMirrorsHint;
    const r = existsSolutionAvoiding(puzzle, new Set(), puzzle.maxMirrorsHint, budget.hardnessProbeMs);
    return r.timedOut ? Infinity : r.nodes;
  };

  const candidates = [];
  let validCount = 0;
  for (let attempt = 0; attempt < maxAttempts && validCount < CANDIDATES_WANTED && withinBudget(); attempt++) {
    let puzzle;
    switch (difficulty) {
      case "kolay":
        puzzle = trySingleBeam(cfg.grid, cfg);
        break;
      case "orta":
        // Gereksinim: her 10 bölümden 5 tanesi splitterli 5 tanesi portallı
        // olacak, bu 10 bölümün 5 inde 2 kaynak 2 hedef veya 1 hedef olacak.
        // Splitter turu TEK kaynaklı kalır (trySplitterBeam — bkz. o
        // fonksiyonun kanıtı); portal turu 2 kaynaklı olur (tryMultiBeam,
        // portal ZORUNLU). İkisi birbirini BİLİNÇLİ olarak dışlar (ne "hem
        // ikisi de" ne "ikisi de yok" — bu ayrım Zor/Usta'ya özel).
        puzzle =
          tag === "splitterOnly"
            ? trySplitterBeam(cfg.grid, cfg)
            : tryMultiBeam(cfg.grid, cfg, 2, singleTarget, { addPortal: true, requirePortal: true });
        break;
      case "zor":
        // Gereksinim: her 10 bölümün 4 tanesinde hem splitter olacak hem
        // portal olacak, kalan 6 bölümün 3 ünde splitter 3 ünde portal
        // olacak, her bölümde en az 2 kaynak olacak (splitter'lılarda 3 hedef). Splitter
        // içeren turlar (both + splitter-only) artık tryComplexBeam kullanıyor
        // (2 kaynak, splitter YİNE matematiksel gerekli — bkz. o fonksiyonun
        // notu); portal-only turlar tryMultiBeam (2 kaynak, splitter yok,
        // portal ZORUNLU). tryComplexBeam artık singleTarget'i YOK SAYIYOR
        // (bkz. o fonksiyonun notu — splitter'lı yapılarda "1 hedef" hiçbir
        // zaman güvenli olamaz), aşağıda geçilen `singleTarget` bu iki
        // çağrıda etkisiz; "1 hedef" çeşitliliği Zor'da SADECE portal-only
        // turda (tryMultiBeam, splitter yok) yaşıyor.
        if (tag === "both") {
          puzzle = tryComplexBeam(cfg.grid, cfg, 2, singleTarget, { addPortal: true, requirePortal: true });
        } else if (tag === "splitterOnly") {
          puzzle = tryComplexBeam(cfg.grid, cfg, 2, singleTarget, {});
        } else {
          puzzle = tryMultiBeam(cfg.grid, cfg, 2, singleTarget, { addPortal: true, requirePortal: true });
        }
        break;
      case "usta":
        // Gereksinim: her bölümde portal ve splitter olacak, her bölümde 3
        // kaynak 3 hedef veya 1 hedef olacak. Bag/oran yok — HER Usta
        // bulmacası tryComplexBeam(numSources=3, addPortal+requirePortal).
        // tryComplexBeam artık singleTarget'i YOK SAYIYOR (bkz. o fonksiyonun
        // üstündeki matematiksel kanıt) — Usta HER ZAMAN "3 kaynak 3 hedef"
        // yapısını kullanır, "1 hedef" varyantı splitter'la asla güvenli
        // biçimde bir arada olamadığı için KALDIRILDI (denetimde %99 baypas
        // oranı bulundu, bkz. audit raporu).
        puzzle = tryComplexBeam(cfg.grid, cfg, 3, singleTarget, { addPortal: true, requirePortal: true });
        break;
      default:
        puzzle = trySingleBeam(cfg.grid, cfg);
    }
    if (puzzle == null) continue;
    validCount++;
    candidates.push({ puzzle, score: candidateScore(puzzle) });
  }

  // En yüksek puanlıdan başlayarak ayna hakkı gerçek minimuma çekilir (bkz.
  // minimizeMirrorHint). Minimum, zorluk bandının altına düşerse (bulmaca
  // göründüğünden kolaymış) sıradaki aday denenir; hiçbiri bantta kalmazsa
  // en yüksek puanlı aday, düşürülmüş hakkıyla kullanılır.
  candidates.sort((a, b) => b.score - a.score);
  let best = null;
  const minimizeDeadline = Date.now() + budget.minimizeBudgetMs;
  for (const c of candidates) {
    if (!deterministic) minimizeMirrorHint(c.puzzle, minimizeDeadline, budget.minimizeStepMs);
    if (c.puzzle.maxMirrorsHint >= cfg.range.min) {
      best = c.puzzle;
      break;
    }
  }
  if (best === null && candidates.length > 0) best = candidates[0].puzzle;

  // Seçilen yapı (özellikle portal ZORUNLU turlarda) 500 denemede bile hiç
  // geçerli bulmaca üretemezse (çok küçük ihtimal ama olabilir), TAMAMEN
  // vazgeçmek yerine BİR KEZ splitter/portal zorunluluğu olmayan daha kolay
  // bir yedek yapıyla (tryMultiBeam, portalsız) tekrar denenir — böylece
  // oyuncuya asla "hiç bulmaca yok" değil, en azından zorluk bandına uygun
  // bir bulmaca sunulur (güvenlik ağı ONBOARDING_PUZZLES[1] SADECE bu da
  // başarısız olursa devreye girer).
  if (best === null && difficulty !== "kolay") {
    for (let attempt = 0; attempt < 100 && best === null && withinBudget(); attempt++) {
      const puzzle = tryMultiBeam(cfg.grid, cfg, difficulty === "usta" ? 3 : 2, rng.randf() < 0.5, {});
      if (puzzle) best = puzzle;
    }
  }

  if (best === null) {
    console.warn(`PuzzleGenerator: '${difficulty}' için uygun bulmaca bulunamadı, güvenlik ağı kullanıldı.`);
    return ONBOARDING_PUZZLES[1]; // "İlk Ayna" — her zaman geçerli, 1 mirror, canlı mod (blindMode undefined -> false)
  }

  best.blindMode = special;
  return best;
}
