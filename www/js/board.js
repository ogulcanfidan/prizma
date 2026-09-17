// BoardView — Prizma tahtasını SVG olarak çizer (onaylanan Stil A mockup'ındaki
// birebir aynı SVG teknik: feGaussianBlur tabanlı gerçek glow).
//
// Etkileşim modeli: BoardView iki modu destekler ("Işını Çalıştır" oyunun
// GENEL mekaniği değil, sadece ZORLUK artırmak için kullanılan bir mekanik;
// portallar gibi belirli bantlara özgüdür):
//  - CANLI mod (blind=false, varsayılan — Kolay/Orta ve normal eğitim
//    bulmacaları): aynalar yerleştirilirken/döndürülürken ışın ANINDA yeniden
//    hesaplanıp gösterilir (animasyonsuz, tek karede) — orijinal davranış.
//  - KÖR mod (blind=true — sadece Zor/Usta ve eğitimdeki tek bir tanıtım
//    bulmacası): aynalar IŞIN GÖRÜNMEDEN yerleştirilir. Oyuncu "Işını
//    Çalıştır" butonuna basınca ışın bir kez simüle edilip canlı çizilir:
//    çözüldüyse kazanma ekranı, çözülmediyse kısa bir gösterimin ardından
//    tahta otomatik sıfırlanır ve oyuncu tekrar dener.
// Godot scripts/BoardView.gd dosyasının web/DOM+SVG karşılığı (etkileşim
// modeli Godot sürümünden bilinçli olarak farklılaştırıldı).

import { Cell, Dir, MirrorType, reflect, turnLeft, turnRight, posKey } from "./celltypes.js";
import { simulate, findMirrorPath } from "./solver.js";
import { BOARD, colorToHex } from "./theme.js";

const CELL = 64; // SVG viewBox birimi
const REVEAL_MS = 450;
// Sonsuz moddaki gerçek Zor/Usta bölümlerinde (main.js → loadPuzzle,
// mode==="endless" olduğunda setPuzzle'a gameplayFire:true geçiliyor) ışın
// çalıştırma hızı kasıtlı olarak yavaşlatıldı — bkz. setPuzzle/fire() aşağıda.
// Eğitimdeki (onboarding puzzle7 — "Işını Çalıştır" tanıtımı) REVEAL_MS AYNEN
// kalır. Ilımlı bir yavaşlatma hedeflendi (~1.5 kat, 450ms -> 680ms), drastik
// değil.
const REVEAL_MS_GAMEPLAY = 680;
// Eğitim bölümlerinde ışının çok hızlı akması yeni oyuncunun ne olduğunu takip
// etmesini zorlaştırıyordu ("Işını Çalıştır" butonlu eğitim bölümü hariç) —
// çözüm SADECE eğitim modunu hedefler, normal oyunu etkilemez. CANLI moddaki
// ışın HER ZAMAN anında (animasyonsuz, tek karede) çizilir (bkz. yukarıdaki
// _liveResimulate notu) — bu, sonsuz moddaki Kolay/Orta için hâlâ geçerlidir
// (değişmedi). SADECE eğitimin (onboarding) CANLI moddaki bulmacalarında
// (opts.onboardingReveal, bkz. main.js) ışın artık bu süre boyunca yavaşça
// "beliriyor" — böylece yeni oyuncu ne olduğunu takip edebiliyor. "Işını
// Çalıştır" butonlu tanıtım zaten KÖR mod (REVEAL_MS, 450ms) kullanıyor ve bu
// hız yeterli bulunduğu için dokunulmadı.
const LIVE_REVEAL_MS_ONBOARDING = 900;
// Bilinen bir hata: eğitim ekranındaki bölümlerde her ayna koyulduğunda ışın
// kaynaktan tekrar çıkıyor gibi görünüyordu. Kök neden: yukarıdaki yavaş-
// beliriş HER _liveResimulate() çağrısında (yani HER ayna yerleştirme/
// kaldırmada) baştan tetikleniyordu — bu da ışının kaynağa dönüp yeniden
// belirmesi gibi, istenmeyen bir davranışı tekrar üretti, sadece tek seferlik
// değil HER ara denemede. Düzeltme: yavaş beliriş artık SADECE bulmaca o
// adımda ÇÖZÜLDÜYSE oynuyor (son doğru aynanın konması) — ara/yanlış
// denemeler her zaman anında çiziliyor, böylece ışın hiçbir ara adımda
// "kaynaktan yeniden çıkmış" gibi görünmüyor, sadece doğru çözüme
// ulaşıldığında yavaşça izlenebiliyor.
const FAIL_HOLD_MS = 900; // yanlış çözümü gösterip sıfırlamadan önceki bekleme
// Eğitimde CANLI moddaki ışına yavaş bir "belirme" animasyonu denenmişti
// (animateReveal/_animateLiveReveal, LIVE_REVEAL_MS), önce sadece bulmaca
// ÇÖZÜLÜNCE oynayacak şekilde daraltıldı, ama çözülme anında bile ışının
// kaynağa dönüp yeniden belirmesi istenmeyen bir izlenim veriyordu. Bu yüzden
// mekanik TAMAMEN KALDIRILDI — CANLI mod artık HER ZAMAN (eğitim dahil)
// sonsuz moddaki Kolay/Orta ile birebir aynı: her ayna değişiminde VE
// çözülünce ışın ANINDA (animasyonsuz) güncellenir. KÖR mod (fire(),
// REVEAL_MS=450 — Zor/Usta ve eğitimdeki "Işını Çalıştır" tanıtımı) bundan
// ETKİLENMEZ; bu, kasıtlı olarak kapsam dışı bırakılan ayrı bir mekaniktir.

const DIR_ANGLE = { [Dir.RIGHT]: 0, [Dir.DOWN]: 90, [Dir.LEFT]: 180, [Dir.UP]: 270 };

function bg(w, h) {
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#ngbg)"/>`;
}

function wallIcon(x, y) {
  const s = CELL;
  return `<rect x="${x - s / 2 + 4}" y="${y - s / 2 + 4}" width="${s - 8}" height="${s - 8}" rx="5" fill="${BOARD.wallFill}" stroke="${BOARD.wallStroke}" stroke-width="1.8"/>`;
}

function beamPolyline(points, colorHex, progress) {
  if (points.length < 2) return "";
  const coords = points.map((p) => [p.x * CELL + CELL / 2, p.y * CELL + CELL / 2]);
  let totalLen = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    totalLen += Math.hypot(dx, dy);
  }
  const dashOffset = totalLen * (1 - progress);
  const pts = coords.map((c) => c.join(",")).join(" ");
  return `<polyline points="${pts}" fill="none" stroke="${colorHex}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#nglow)" opacity="0.95" stroke-dasharray="${totalLen}" stroke-dashoffset="${dashOffset}"/>`;
}

function beamLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

// Düzeltilmiş bir hata: portal ve ışın bölme (splitter) noktalarında, ışın
// henüz o elemente ulaşmadan elementten çıkıyormuş gibi görünüyordu. Kök
// neden: simulate() bir portal/splitter'da BİRDEN FAZLA beamPaths parçası
// üretiyor (giriş parçası + portal ÇIKIŞ / splitter'ın iki dalı) ve _render()
// eskiden HEPSİNE aynı global `progress`'i uyguluyordu — yani çıkış parçası,
// giriş parçası daha tam çizilmeden AYNI ANDA belirmeye başlıyordu.
// Bu fonksiyon, solver.js'in artık her parçaya eklediği parentIndex'i
// kullanarak her ışın "ağacını" (bir kaynaktan başlayan zincir) UZUNLUĞA göre
// sıralı ortaya çıkaracak şekilde, her parçaya KENDİ yerel progress'ini
// hesaplar: bir parça, ebeveyni TAMAMEN çizilmeden belirmeye başlamaz. Kardeş
// parçalar (splitter'ın iki dalı gibi, aynı noktada başlayanlar) ebeveyn
// bitince BİRLİKTE/paralel başlar — bu doğru, çünkü ışın o noktada gerçekten
// aynı anda ikiye ayrılıyor. Farklı kaynaklar (birden fazla ışın kaynağı olan
// bulmacalar) birbirinden bağımsız, her biri progress=0'dan başlar.
function computeStaggeredProgress(beamPaths, progress) {
  const n = beamPaths.length;
  const ownLen = beamPaths.map((b) => beamLength(b.points));
  const startLen = new Array(n).fill(0);
  const rootOf = new Array(n).fill(-1);
  const treeMax = new Map(); // kök indeksi -> o ağaçtaki en uzun kök→yaprak toplam uzunluk

  for (let i = 0; i < n; i++) {
    // parentIndex her zaman kendisinden ÖNCEKİ bir beamPaths indeksine işaret
    // eder (solver.js, ebeveyni kuyruğa çocuğunu eklemeden ÖNCE beamPaths'e
    // ekliyor) — yine de eksik/geçersiz bir değere karşı güvenli, kök olarak davran.
    const parentIndex = beamPaths[i].parentIndex;
    if (parentIndex == null || parentIndex < 0 || parentIndex >= i) {
      startLen[i] = 0;
      rootOf[i] = i;
    } else {
      startLen[i] = startLen[parentIndex] + ownLen[parentIndex];
      rootOf[i] = rootOf[parentIndex];
    }
    const end = startLen[i] + ownLen[i];
    const root = rootOf[i];
    if (!treeMax.has(root) || treeMax.get(root) < end) treeMax.set(root, end);
  }

  return beamPaths.map((_, i) => {
    const total = treeMax.get(rootOf[i]) || ownLen[i] || 1;
    const local = ownLen[i] > 0 ? (progress * total - startLen[i]) / ownLen[i] : progress;
    return Math.max(0, Math.min(1, local));
  });
}

function mirrorIcon(x, y, mirrorType, colorHex) {
  const r = CELL * 0.27;
  const d =
    mirrorType === MirrorType.BACK_SLASH
      ? `M${x - r},${y - r} L${x + r},${y + r}`
      : `M${x - r},${y + r} L${x + r},${y - r}`;
  return `<path d="${d}" stroke="${colorHex}" stroke-width="${CELL * 0.086}" stroke-linecap="round" filter="url(#nglow)"/>`;
}

// Sabit (oyuncunun yerleştirmediği/kaldıramadığı) ortam aynası — bu aynalar
// (bkz. generator.js -> trySplitterBeam, kaynak ile Prizma Bloğu arasındaki
// sabit "dönüş" aynası) eskiden mirrorIcon() ile BİREBİR AYNI görünüyordu
// (aynı sıcak sarı renk, aynı parlama), bu yüzden oyuncuya kendi koymadığı bir
// ayna bir hata gibi görünebiliyordu (bir bölüme başlarken zaten yerinde bir
// ayna olması kafa karıştırıyordu). Şimdi AÇIKÇA ayrı: theme.js →
// BOARD.fixedMirror'ın soğuk gri-mor tonu, glow YOK (parıldayan bir araç
// değil, sabit bir montaj parçası), ve dört köşesinde küçük "sabitleme"
// çentikleri — "bu senin yerleştirdiğin bir şey değil" izlenimini görsel
// olarak veriyor.
function fixedMirrorIcon(x, y, mirrorType, colorHex) {
  const r = CELL * 0.27;
  const d =
    mirrorType === MirrorType.BACK_SLASH
      ? `M${x - r},${y - r} L${x + r},${y + r}`
      : `M${x - r},${y + r} L${x + r},${y - r}`;
  const b = CELL * 0.36; // köşe çentiklerinin çerçevesi
  const tick = CELL * 0.09;
  const corners = [
    [x - b, y - b, 1, 1],
    [x + b, y - b, -1, 1],
    [x - b, y + b, 1, -1],
    [x + b, y + b, -1, -1],
  ];
  const ticks = corners
    .map(
      ([cx, cy, sx, sy]) =>
        `<path d="M${cx},${cy + sy * tick} L${cx},${cy} L${cx + sx * tick},${cy}" stroke="${colorHex}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.8"/>`
    )
    .join("");
  return `${ticks}
    <path d="${d}" stroke="${colorHex}" stroke-width="${CELL * 0.078}" stroke-linecap="round" opacity="0.92"/>`;
}

// Kaynak: yön belirten, arkası dolgun/önü sivri üçgen + uç kıvılcımı (onaylı Stil A tasarımı).
function sourceIcon(x, y, colorHex, dir) {
  const ang = DIR_ANGLE[dir] ?? 0;
  const a = CELL / 52; // mockup 52px cell'e göre tasarlandı, oranı koru
  const tri = `M${x - 10 * a},${y - 11 * a} L${x + 15 * a},${y} L${x - 10 * a},${y + 11 * a} Q${x - 4 * a},${y} ${x - 10 * a},${y - 11 * a} Z`;
  return `<g transform="rotate(${ang} ${x} ${y})">
    <circle cx="${x}" cy="${y}" r="${17 * a}" fill="${colorHex}" opacity="0.12"/>
    <circle cx="${x}" cy="${y}" r="${17 * a}" fill="none" stroke="${colorHex}" stroke-width="1.2" opacity="0.45"/>
    <path d="${tri}" fill="${colorHex}" filter="url(#nglow)"/>
    <circle cx="${x + 15 * a}" cy="${y}" r="${2.6 * a}" fill="#FFFFFF" opacity="0.9" filter="url(#nglowSoft)"/>
  </g>`;
}

// Hedef: dış yuva halkası + dolu çekirdek + highlight. lit=true iken hedefin rengiyle parlar.
// unlit (ateşlenmeden önceki / yanlış sonuçtaki) hâlde de gereken renk NET okunmalı
// (hedef kürelerin renginin belirgin olmaması sorunu üzerine bu okunabilirlik güçlendirildi).
function targetIcon(x, y, colorHex, lit) {
  const a = CELL / 52;
  if (lit) {
    return `<circle cx="${x}" cy="${y}" r="${18 * a}" fill="none" stroke="${BOARD.wallStroke}" stroke-width="2"/>
      <circle cx="${x}" cy="${y}" r="${18 * a}" fill="none" stroke="${colorHex}" stroke-width="1.4" opacity="0.55"/>
      <circle cx="${x}" cy="${y}" r="${13 * a}" fill="${colorHex}" opacity="0.28" filter="url(#nglow)"/>
      <circle cx="${x}" cy="${y}" r="${9.5 * a}" fill="${colorHex}"/>
      <ellipse cx="${x - 3.2 * a}" cy="${y - 3.2 * a}" rx="${3 * a}" ry="${2 * a}" fill="#FFFFFF" opacity="0.75"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${18 * a}" fill="none" stroke="${BOARD.wallStroke}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="${18 * a}" fill="none" stroke="${colorHex}" stroke-width="1.8" opacity="0.85"/>
    <circle cx="${x}" cy="${y}" r="${9.5 * a}" fill="${colorHex}" opacity="0.4"/>`;
}

// Bir çıkış yönünü gösteren, halka/şeklin hemen dışına taşan ince ok ucu —
// portalIcon VE splitterIcon tarafından ORTAK kullanılır (ışın bölme
// elementinin ışığı hangi iki yöne böldüğü belirsizdi — splitter da artık
// portal gibi gerçek çıkış yönlerini gösteriyor).
// ringRadius: okun BAŞLADIĞI (şeklin kenarına en yakın) yarıçap.
function exitArrowGlyph(dir, ringRadius) {
  const ang = DIR_ANGLE[dir] ?? 0;
  const a = CELL / 52;
  const len = 9 * a;
  const hw = 3.4 * a;
  const tipX = ringRadius + len;
  return `<g transform="rotate(${ang})">
    <path d="M${ringRadius},0 L${tipX},0 M${tipX - hw},${-hw} L${tipX},0 L${tipX - hw},${hw}" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" filter="url(#nglowSoft)"/>
  </g>`;
}

// exitDir: bu portalden ışının HANGİ YÖNE çıkacağını gösteren küçük ok
// (portallarda ışının nereden çıkacağının görünmemesi sorununa çözüm).
// null ise (girişteki portal çifti henüz bir ışınla eşlenmediyse, ya da bu
// hücre hiç ziyaret edilmediyse) ok çizilmez, sadece halkalar görünür.
function portalIcon(x, y, colorHex, exitDir) {
  const a = CELL / 52;
  const arrow = exitDir != null ? `<g transform="translate(${x} ${y})">${exitArrowGlyph(exitDir, 16 * a)}</g>` : "";
  return `<circle cx="${x}" cy="${y}" r="${16 * a}" fill="none" stroke="${colorHex}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.85"/>
    <circle cx="${x}" cy="${y}" r="${11 * a}" fill="none" stroke="#E7DBFF" stroke-width="1.4" stroke-dasharray="3 5" opacity="0.7"/>
    <circle cx="${x}" cy="${y}" r="${6 * a}" fill="${colorHex}" opacity="0.35" filter="url(#nglow)"/>
    <circle cx="${x}" cy="${y}" r="${3 * a}" fill="#FFFFFF" filter="url(#nglowSoft)"/>
    ${arrow}`;
}

// Prizma Bloğu (splitter) — bu mekanik mockup'ta yoktu, aynı ailede yeni tasarlandı:
// dönmüş kare (elmas) + içinden geçen "ayırıcı" çizgi + parlayan çekirdek.
// exitDirs: bu splitter'dan ışının hangi İKİ yöne ayrılacağını gösteren
// ok(lar) — portalin exitDir okuyla AYNI görsel dil (bkz. exitArrowGlyph).
//
// Önceki tasarımda splitter'a eklenen ↻/↺ rozeti SOYUTTU (gelen ışının
// MUTLAK yönünden bağımsız, sadece "dönüş hissi" veren bir rotasyon glifiydi)
// — hangi yöne gittiğini göstermediği için oyuncu için okunaksız/alakasız
// kalıyordu. Artık computeSplitterHintDirs() (aşağıda) ile bulmacanın KENDİ
// çözümünün varsaydığı GERÇEK (mutlak) varış yönünü solver.js →
// findMirrorPath ile hesaplayıp buradan İKİ SOMUT ok yönü üretiliyor — tıpkı
// portaldaki gibi, ama ışın oraya HENÜZ ulaşmamış olsa bile (reaktif
// computeSplitterExitDirs'in aksine, bu HER ZAMAN bilinir).
function splitterIcon(x, y, colorHex, exitDirs) {
  const s = CELL * 0.24;
  const pts = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
  const arrows = (exitDirs || []).map((dir) => `<g transform="translate(${x} ${y})">${exitArrowGlyph(dir, s + 2)}</g>`).join("");
  return `<polygon points="${pts}" fill="${colorHex}" opacity="0.14"/>
    <polygon points="${pts}" fill="none" stroke="${colorHex}" stroke-width="${CELL * 0.035}" filter="url(#nglow)"/>
    <line x1="${x - s * 0.55}" y1="${y - s * 0.55}" x2="${x + s * 0.55}" y2="${y + s * 0.55}" stroke="#FFFFFF" stroke-width="${CELL * 0.025}" opacity="0.85"/>
    <circle cx="${x}" cy="${y}" r="${CELL * 0.045}" fill="#FFFFFF" filter="url(#nglowSoft)"/>
    ${arrows}`;
}

// Her splitter için, bulmacanın KENDİ çözümünün varsaydığı GERÇEK varış
// yönünü (ve oradan iki çıkış yönünü) hesaplar — ışın durumundan tamamen
// BAĞIMSIZ, sadece bulmaca verisinden (kaynak(lar) + sabit geometriden).
// findMirrorPath portal/duvar/başka splitter'ları da doğru şekilde hesaba
// katar (solver.js'te zaten genel BFS). Birden fazla kaynak varsa (şu an
// splitter'lı bulmacalarda hep TEK kaynak var) ilk başarılı olanı kullanır.
// Bulunamazsa (olmamalı, üretici zaten bunu garanti ediyor) o splitter için
// ok gösterilmez — sessizce atlanır.
function computeSplitterHintDirs(puzzle) {
  const hints = new Map();
  for (const [key, branchRight] of puzzle.splitters) {
    const [xs, ys] = key.split(",").map(Number);
    const splitterPos = { x: xs, y: ys };
    let approach = null;
    for (const s of puzzle.sources) {
      approach = findMirrorPath(puzzle, s.pos, s.dir, [splitterPos]);
      if (approach) break;
    }
    if (!approach) continue;
    const straightDir = approach.dir;
    const turnDir = branchRight ? turnRight(straightDir) : turnLeft(straightDir);
    hints.set(key, [straightDir, turnDir]);
  }
  return hints;
}

// Portal başına, GERÇEK simülasyon sonucuna (this.lastResult.beamPaths) göre
// ışının o portalden hangi yöne ÇIKTIĞINI çıkarır. Portallar yönü DEĞİŞTİRMEZ
// (bkz. solver.js → simulate(): teleport sonrası yeni ışın parçası AYNI dir
// ile başlar) — yani bir portal konumunda BAŞLAYAN bir ışın parçasının ilk
// iki noktası, doğrudan o portalin çıkış yönünü verir. Henüz hiçbir ışın o
// portalden geçmediyse (kör modda ateşlenmeden önce, ya da bu tur hiç
// kullanılmadıysa) harita boş kalır — ok çizilmez (bkz. portalIcon).
function computePortalExitDirs(beamPaths, portals) {
  const exitDirs = new Map();
  for (const beam of beamPaths) {
    const pts = beam.points;
    if (pts.length < 2) continue;
    const startKey = posKey(pts[0]);
    if (!portals.has(startKey)) continue;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    let dir = null;
    if (dx === 1) dir = Dir.RIGHT;
    else if (dx === -1) dir = Dir.LEFT;
    else if (dy === 1) dir = Dir.DOWN;
    else if (dy === -1) dir = Dir.UP;
    if (dir != null) exitDirs.set(startKey, dir);
  }
  return exitDirs;
}

// Düzeltilmiş bir hata: bazı durumlarda ışın, splitter'ın gösterdiği ok
// yönlerinde gitmiyordu. KÖK NEDEN: splitterHintDirs, puzzle YÜKLENİR
// YÜKLENMEZ bulmacanın KENDİ çözümünü VARSAYARAK (findMirrorPath ile,
// oyuncunun aynalarından TAMAMEN BAĞIMSIZ) bir kere hesaplanıp önbelleğe
// alınıyordu ve bir daha GÜNCELLENMİYORDU. Oysa oyuncu splitter'a giden yolu
// KENDİ aynalarıyla (findMirrorPath'in varsaydığından FARKLI — ama eşit
// derecede geçerli olabilecek) bir şekilde kurunca, splitter'a GERÇEKTE
// farklı bir yönden giriyor ve gerçek çıkış yönleri de (branchRight formülü
// YAKLAŞMA yönüne GÖRECELİ olduğu için) hint'ten sapıyordu — ok bir yönü
// gösteriyor, ışın başka yöne gidiyordu.
//
// ÇÖZÜM: portallardaki AYNI mantık (computePortalExitDirs) — GERÇEK simülasyon
// sonucundan (beamPaths) o splitter'da BAŞLAYAN parçaların ilk iki noktasından
// gerçek çıkış yönlerini çıkar. Bir ışın splitter'a GERÇEKTEN ulaştıysa bu her
// zaman %100 doğrudur (statik hint'in aksine asla yanlış olamaz). Işın henüz
// oraya ulaşmadıysa (kör modda ateşlemeden önce) haritada yer almaz — o zaman
// _render() eski statik splitterHintDirs'e (varsayılan/en iyi tahmin) düşer.
function computeSplitterExitDirsFromBeams(beamPaths, splitters) {
  const exitDirs = new Map(); // "x,y" -> [dir, dir]
  for (const beam of beamPaths) {
    const pts = beam.points;
    if (pts.length < 2) continue;
    const startKey = posKey(pts[0]);
    if (!splitters.has(startKey)) continue;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    let dir = null;
    if (dx === 1) dir = Dir.RIGHT;
    else if (dx === -1) dir = Dir.LEFT;
    else if (dy === 1) dir = Dir.DOWN;
    else if (dy === -1) dir = Dir.UP;
    if (dir == null) continue;
    const arr = exitDirs.get(startKey) || [];
    if (!arr.includes(dir)) arr.push(dir);
    exitDirs.set(startKey, arr);
  }
  return exitDirs;
}

const DEFS = `<defs>
  <radialGradient id="ngbg" cx="30%" cy="20%" r="90%">
    <stop offset="0%" stop-color="${BOARD.bgFrom}"/><stop offset="100%" stop-color="${BOARD.bgTo}"/>
  </radialGradient>
  <filter id="nglow" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
    <feGaussianBlur stdDeviation="3.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="nglowSoft" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
    <feGaussianBlur stdDeviation="1.6" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

export class BoardView {
  constructor(wrapperEl) {
    this.wrapperEl = wrapperEl;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "board-svg");
    this.wrapperEl.appendChild(this.svg);

    this.puzzle = null;
    this.blind = false; // false: canlı mod (anında yeniden hesapla), true: kör mod (sadece fire() ile)
    this._revealMs = REVEAL_MS; // bkz. REVEAL_MS_GAMEPLAY notu yukarıda — setPuzzle() günceller
    this._liveRevealMs = 0; // bkz. LIVE_REVEAL_MS_ONBOARDING notu yukarıda — setPuzzle() günceller
    this.mirrorPlacements = new Map(); // "x,y" -> MirrorType
    this.maxMirrors = 0; // ayna hakkı (puzzle.maxMirrorsHint)
    this.lastResult = { beamPaths: [], targetHits: new Map(), solved: false };
    this.splitterHintDirs = new Map(); // "x,y" -> [dir1, dir2] (bkz. setPuzzle)

    // (isSolved, meta) => void — meta.fired true ise bu bir "Işını Çalıştır"
    // sonucu (kör mod), false ise canlı moddaki anlık bir güncelleme sonucu.
    this.onChange = null;
    this.onAllowanceChange = null; // (remaining, max) => void
    this.onPlace = null; // (added: boolean) => void — ayna eklenince/kaldırılınca (ses efekti için, bkz. main.js)

    this._busy = false; // ateşleme animasyonu / bekleme sırasında dokunmayı kilitler
    this._rafId = null;
    this._failTimeout = null;

    this.svg.addEventListener("pointerdown", (e) => this._handlePointer(e));
  }

  // opts.blind: true ise kör mod (yalnızca Zor/Usta ve eğitimdeki tanıtım
  // bulmacası) — aynalar görünmez, "Işını Çalıştır" gerekir. Aksi halde canlı
  // mod (Kolay/Orta VE eğitimdeki diğer tüm bulmacalar, bkz. dosya başı notu)
  // — ışın her değişiklikte ANINDA (animasyonsuz) güncellenir.
  //
  // ÖNEMLİ: ilk yükleme sırasında (0 ayna gerektiren bulmacalar — örn. Portal/
  // Prizma Bloğu tanıtımı — hiç dokunmadan zaten "çözülü" olabilir) onChange
  // BİLEREK ÇAĞRILMAZ. Neden: main.js daha kendi başlık/süre kurulumunu bile
  // bitirmeden senkron bir "Çözüldü!" tetiklemek hem yanlış süre hesaplamasına
  // hem de ekranın oyuncu tahtayı görmeden değişmesine yol açıyordu. Bunun
  // yerine main.js, board.isSolved'ı KENDİSİ kontrol edip kazanma ekranını
  // KISA BİR GECİKMEYLE gösteriyor — böylece oyuncu bağlanan ışını bir an
  // görüyor, sonra tebrik ekranı geliyor.
  setPuzzle(puzzle, opts = {}) {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._failTimeout) clearTimeout(this._failTimeout);
    this._busy = false;
    this.puzzle = puzzle;
    this.blind = !!opts.blind;
    // bkz. REVEAL_MS_GAMEPLAY notu yukarıda: main.js SADECE sonsuz moddaki
    // (mode==="endless") gerçek bölümlerde true geçiyor, eğitim (onboarding)
    // bulmacalarında opts.gameplayFire hiç verilmiyor (undefined -> false),
    // yani eğitim her zaman eski (daha hızlı) hızda kalır.
    this._revealMs = opts.gameplayFire ? REVEAL_MS_GAMEPLAY : REVEAL_MS;
    // bkz. LIVE_REVEAL_MS_ONBOARDING notu yukarıda — SADECE canlı moddaki
    // eğitim bulmacalarında >0 (yavaş beliriş animasyonu); aksi halde 0
    // (anında, orijinal davranış — sonsuz mod değişmedi).
    this._liveRevealMs = !this.blind && opts.onboardingReveal ? LIVE_REVEAL_MS_ONBOARDING : 0;
    this.mirrorPlacements = new Map();
    this.maxMirrors = Math.max(0, puzzle.maxMirrorsHint ?? 0);
    this.lastResult = { beamPaths: [], targetHits: new Map(), solved: false };
    // Splitter'ların HER ZAMAN görünen yön okları — ışın durumundan bağımsız
    // olduğu için puzzle başına BİR KEZ hesaplanıp önbelleğe alınır (her
    // _render() çağrısında yeniden hesaplamaya gerek yok, bkz.
    // computeSplitterHintDirs notu).
    this.splitterHintDirs = computeSplitterHintDirs(puzzle);
    this.svg.setAttribute("viewBox", `0 0 ${puzzle.gridSize.x * CELL} ${puzzle.gridSize.y * CELL}`);
    this.wrapperEl.style.aspectRatio = `${puzzle.gridSize.x} / ${puzzle.gridSize.y}`;
    if (this.blind) {
      this._render(0); // ışınsız, sadece tahta/kaynak/hedef/mekanikler
    } else {
      // _liveResimulate() ÇAĞRILMIYOR (o, onChange'i de tetikler) — burada
      // sadece hesapla+çiz, onChange'i main.js kendi zamanlamasıyla yönetsin.
      this.lastResult = simulate(this.puzzle, this.mirrorPlacements);
      this._render(1);
      if (this.lastResult.solved) this._busy = true;
    }
    this._notifyAllowance();
  }

  get remainingMirrors() {
    return Math.max(0, this.maxMirrors - this.mirrorPlacements.size);
  }

  // main.js'in, "hiç dokunmadan zaten çözülü" durumunu (0 ayna gereken
  // canlı-mod bulmacalar) kendi zamanlamasıyla ele alabilmesi için.
  get isSolved() {
    return this.lastResult.solved;
  }

  resetMirrors() {
    if (this._busy) return;
    this.mirrorPlacements = new Map();
    this.lastResult = { beamPaths: [], targetHits: new Map(), solved: false };
    if (this.blind) {
      this._render(0);
    } else {
      this._liveResimulate();
    }
    this._notifyAllowance();
  }

  _notifyAllowance() {
    if (this.onAllowanceChange) this.onAllowanceChange(this.remainingMirrors, this.maxMirrors);
  }

  // CANLI mod: mevcut ayna yerleşimiyle ışını yeniden hesaplayıp çizer.
  // Daha önce eklenen, sonra "sadece çözülünce oyna" diye daraltılan
  // yavaş-beliriş animasyonu ("_animateLiveReveal") TAMAMEN KALDIRILDI —
  // çözülme anında bile ışının kaynağa dönüp yeniden belirmesi istenmeyen
  // bir izlenim veriyordu. Artık HER durumda (ara deneme veya doğru çözüm
  // fark etmez) ışın ANINDA (animasyonsuz, tek karede) güncellenir — sonsuz
  // moddaki Kolay/Orta ile birebir aynı davranış.
  _liveResimulate() {
    this.lastResult = simulate(this.puzzle, this.mirrorPlacements);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    // bkz. LIVE_REVEAL_MS_ONBOARDING üstündeki not — yavaş beliriş SADECE bu
    // adımda bulmaca çözüldüyse oynar; aksi halde (ara deneme, aynanın
    // kaldırılması/döndürülmesi vb.) HER ZAMAN anında çizilir — ışın hiçbir
    // ara adımda kaynaktan "yeniden çıkmış" gibi görünmemeli.
    if (!this._liveRevealMs || !this.lastResult.solved) {
      // Orijinal davranış — sonsuz moddaki Kolay/Orta, eğitim dışındaki tüm
      // canlı-mod bulmacalar VE eğitimdeki her ara deneme: anında, animasyonsuz.
      this._render(1);
      if (this.lastResult.solved) {
        this._busy = true;
        if (this.onChange) this.onChange(true, { fired: false });
      }
      return;
    }
    // Sadece eğitimde VE tam bu adımda çözüldüyse: ışın yavaşça belirir
    // (fire()'daki KÖR mod animasyon döngüsüyle AYNI desen).
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / this._liveRevealMs);
      this._render(t);
      if (t < 1) {
        this._rafId = requestAnimationFrame(step);
      } else {
        this._rafId = null;
        if (this.lastResult.solved) {
          this._busy = true;
          if (this.onChange) this.onChange(true, { fired: false });
        }
      }
    };
    this._rafId = requestAnimationFrame(step);
  }

  _handlePointer(e) {
    if (!this.puzzle || this._busy) return;
    const rect = this.svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const cell = {
      x: Math.floor(relX * this.puzzle.gridSize.x),
      y: Math.floor(relY * this.puzzle.gridSize.y),
    };
    if (!this.puzzle.isInBounds(cell)) return;
    if (this.puzzle.getCell(cell) !== Cell.EMPTY) return;
    const key = posKey(cell);
    if (this.puzzle.fixedMirrors.has(key)) return;

    let added = true;
    if (!this.mirrorPlacements.has(key)) {
      if (this.remainingMirrors <= 0) return; // ayna hakkı bitti — yeni ayna eklenemez
      this.mirrorPlacements.set(key, MirrorType.FORWARD_SLASH);
    } else if (this.mirrorPlacements.get(key) === MirrorType.FORWARD_SLASH) {
      this.mirrorPlacements.set(key, MirrorType.BACK_SLASH);
    } else {
      this.mirrorPlacements.delete(key);
      added = false;
    }
    if (this.onPlace) this.onPlace(added);

    if (this.blind) {
      this._render(0); // ışın YOK — sadece ayna görünümü güncellenir
      this._notifyAllowance();
    } else {
      this._liveResimulate();
      this._notifyAllowance();
    }
  }

  // Sadece KÖR modda kullanılır — oyuncu "Işını Çalıştır" butonuna bastığında
  // çağrılır: ışını bir kez simüle edip canlı çizer. Çözüldüyse
  // onChange(true, {fired:true}); çözülmediyse kısa bir bekleme sonrası
  // tahtayı otomatik sıfırlayıp onChange(false, {fired:true}) çağırır.
  fire() {
    if (!this.blind || !this.puzzle || this._busy) return;
    this._busy = true;
    this.lastResult = simulate(this.puzzle, this.mirrorPlacements);
    const solved = this.lastResult.solved;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / this._revealMs);
      this._render(t);
      if (t < 1) {
        this._rafId = requestAnimationFrame(step);
      } else {
        this._rafId = null;
        if (solved) {
          this._busy = false;
          if (this.onChange) this.onChange(true, { fired: true });
        } else {
          this._failTimeout = setTimeout(() => {
            this.mirrorPlacements = new Map();
            this.lastResult = { beamPaths: [], targetHits: new Map(), solved: false };
            this._render(0);
            this._notifyAllowance();
            this._busy = false;
            if (this.onChange) this.onChange(false, { fired: true });
          }, FAIL_HOLD_MS);
        }
      }
    };
    this._rafId = requestAnimationFrame(step);
  }

  _render(progress) {
    const p = this.puzzle;
    if (!p) return;
    const w = p.gridSize.x * CELL;
    const h = p.gridSize.y * CELL;
    const parts = [DEFS, bg(w, h)];

    // Zemin: duvarlar.
    for (let x = 0; x < p.gridSize.x; x++) {
      for (let y = 0; y < p.gridSize.y; y++) {
        const cellType = p.getCell({ x, y });
        if (cellType === Cell.WALL) {
          parts.push(wallIcon(x * CELL + CELL / 2, y * CELL + CELL / 2));
        }
      }
    }

    // Hücre takibini kolaylaştıran çok hafif iç ızgara çizgileri.
    for (let x = 1; x < p.gridSize.x; x++) {
      parts.push(`<line x1="${x * CELL}" y1="0" x2="${x * CELL}" y2="${h}" stroke="${BOARD.gridLine}" stroke-width="1"/>`);
    }
    for (let y = 1; y < p.gridSize.y; y++) {
      parts.push(`<line x1="0" y1="${y * CELL}" x2="${w}" y2="${y * CELL}" stroke="${BOARD.gridLine}" stroke-width="1"/>`);
    }
    parts.push(`<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${BOARD.gridLine}" stroke-width="1"/>`);

    // Işınlar (glow) — sadece ateşlendikten sonra (progress>0) var olur.
    // Bkz. computeStaggeredProgress() — portal/splitter'da birden fazla
    // parçaya AYNI progress uygulamak yerine, her parçaya kendi (ebeveyni
    // bitince başlayan) yerel progress'i uygulanır.
    const staggered = computeStaggeredProgress(this.lastResult.beamPaths, progress);
    this.lastResult.beamPaths.forEach((beam, i) => {
      parts.push(beamPolyline(beam.points, colorToHex(beam.color), staggered[i]));
    });

    const portalExitDirs = computePortalExitDirs(this.lastResult.beamPaths, p.portals);
    for (const [key] of p.portals) {
      const [xs, ys] = key.split(",").map(Number);
      parts.push(portalIcon(xs * CELL + CELL / 2, ys * CELL + CELL / 2, BOARD.portal, portalExitDirs.get(key) ?? null));
    }

    // Gerçek ışın o splitter'a ulaştıysa (beamPaths'ten türetilen
    // splitterLiveDirs) HER ZAMAN onu göster; ulaşmadıysa (kör modda henüz
    // ateşlenmemiş) eski statik tahmine (splitterHintDirs) düş.
    const splitterLiveDirs = computeSplitterExitDirsFromBeams(this.lastResult.beamPaths, p.splitters);
    for (const [key] of p.splitters) {
      const [xs, ys] = key.split(",").map(Number);
      const dirs = splitterLiveDirs.get(key) ?? this.splitterHintDirs.get(key);
      parts.push(splitterIcon(xs * CELL + CELL / 2, ys * CELL + CELL / 2, BOARD.splitter, dirs));
    }

    for (const [key, mirrorType] of p.fixedMirrors) {
      const [xs, ys] = key.split(",").map(Number);
      parts.push(fixedMirrorIcon(xs * CELL + CELL / 2, ys * CELL + CELL / 2, mirrorType, BOARD.fixedMirror));
    }
    for (const [key, mirrorType] of this.mirrorPlacements) {
      const [xs, ys] = key.split(",").map(Number);
      parts.push(mirrorIcon(xs * CELL + CELL / 2, ys * CELL + CELL / 2, mirrorType, BOARD.mirror));
    }

    for (const t of p.targets) {
      const hit = this.lastResult.targetHits.get(posKey(t.pos));
      const lit = hit && hit.r === t.color.r && hit.g === t.color.g && hit.b === t.color.b;
      parts.push(targetIcon(t.pos.x * CELL + CELL / 2, t.pos.y * CELL + CELL / 2, colorToHex(t.color), lit));
    }

    for (const s of p.sources) {
      parts.push(sourceIcon(s.pos.x * CELL + CELL / 2, s.pos.y * CELL + CELL / 2, colorToHex(s.color), s.dir));
    }

    this.svg.innerHTML = parts.join("");
  }
}
