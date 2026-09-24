// OnboardingData — elle tasarlanmış, sabit 7 bulmacalık tanıtım akışı.
// Sırası tasarım kararına göre: hedef -> tek ayna -> iki ayna -> renk karışımı
// -> portal -> Prizma Bloğu -> Işını Çalıştır (kör mod tanıtımı). Her biri TEK
// bir yeni fikir katar.
// Godot data/onboarding_puzzles.gd dosyasının JS karşılığı (7. bulmaca bu
// sürüme özgü — kullanıcı geri bildirimiyle eklendi, bkz. puzzle7 altındaki not).
// NOT: buradaki "gerçek min. ayna" değerleri (maxMirrorsHint) solver ile
// doğrulanmıştır — elle tahmin değil, gerçekten hesaplanmış değerlerdir
// (Godot sürümünde tests/solver_test.gd ile doğrulandı; aynı sabit yerleşimler
// burada birebir korunuyor).
//
// İlk 6 bulmaca CANLI modda oynanır (ışın her ayna değişiminde anında
// güncellenir) — bu, oyunun GENEL/varsayılan mekaniğidir. Sadece 7. bulmaca
// `blindDemo: true` ile işaretli ve KÖR modda oynanır: "Işını Çalıştır" sadece
// Zor/Usta zorluklarında kullanılan bir ZORLUK mekaniği olduğu için (portallar
// gibi), oyuncuya bu moda geçmeden önce güvenli bir ortamda tanıtılıyor.

import { Dir, COLOR_RED, COLOR_GREEN, COLOR_BLUE, COLOR_CYAN, COLOR_WHITE } from "./celltypes.js";
import { PuzzleData } from "./puzzledata.js";

// NOT: bu bulmaca kasıtlı olarak 0 DEĞİL 1 ayna gerektirir. 0 aynayla (ışın
// zaten dümdüz hedefe gidiyor) canlı modda bulmaca DAHA YÜKLENIR YÜKLENMEZ
// "Çözüldü!" ekranını tetikliyordu (bu durum test sırasında birden fazla kez
// gözlemlendi) — oyuncu hiçbir şey yapmadan karşısına çözülmüş bir ekran
// çıkması kafa karıştırıcıydı. Tek bir varsayılan (FORWARD_SLASH, ilk
// dokunuşta gelen tip) ayna gerektirecek şekilde tasarlandı: oyuncu en az
// bir kez dokunmadan bulmaca asla kendiliğinden çözülmez, ama yine de en
// basit/tek dokunuşluk bulmaca olarak kalır.
// NOT (i18n): title/tutorialText artık DOĞRUDAN Türkçe metin
// DEĞİL — titleKey/tutorialKey olarak i18n.js anahtarları tutuluyor, gerçek
// metin main.js → loadPuzzle() içinde GÖSTERİM ANINDA t() ile üretiliyor.
// Bu sayede (a) modül yüklenme sırası yüzünden dil henüz belirlenmeden metin
// donmuş olmaz, (b) kullanıcı Ayarlar'dan dili değiştirirse bir sonraki
// bulmaca yüklemesinde otomatik güncel dilde görünür.
function puzzle1Hedef() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p1.title";
  p.tutorialKey = "onb.p1.tutorial";
  p.maxMirrorsHint = 1;
  p.addSource({ x: 0, y: 2 }, Dir.RIGHT, COLOR_RED);
  p.addTarget({ x: 2, y: 0 }, COLOR_RED); // (2,2)'ye varsayılan FORWARD_SLASH koyunca RIGHT->UP döner, hedefe ulaşır
  return p;
}

function puzzle2TekAyna() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p2.title";
  p.tutorialKey = "onb.p2.tutorial";
  p.maxMirrorsHint = 1;
  p.addSource({ x: 0, y: 0 }, Dir.RIGHT, COLOR_RED);
  p.addTarget({ x: 2, y: 2 }, COLOR_RED);
  return p;
}

function puzzle3IkiAyna() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p3.title";
  p.tutorialKey = "onb.p3.tutorial";
  p.maxMirrorsHint = 2;
  p.addSource({ x: 0, y: 0 }, Dir.RIGHT, COLOR_GREEN);
  p.addWall({ x: 4, y: 1 }); // doğrudan 4. sütundan inmeyi engeller -> tek aynayla çözülmesin
  p.addTarget({ x: 4, y: 2 }, COLOR_GREEN);
  return p;
}

// Bir bölümde iki (veya daha fazla) ışının birleştiği bir hedef küre varsa,
// bu kürenin görsel olarak kendini hep BEYAZ renkte belli etmesi gerekir.
// generator.js artık TÜM paylaşılan (2+ kaynaklı) hedefleri HER ZAMAN tam
// beyaz (COLOR_WHITE) üretiyor (bkz. sharedTargetColors) — bu eğitim
// bulmacası da aynı kurala uymalı. Eskiden KIRMIZI+YEŞİL -> SARI hedefti;
// artık KIRMIZI + onun tam tamamlayıcısı olan CYAN (YEŞİL+MAVİ) birleşiyor
// -> union HER ZAMAN (1,1,1) yani tam BEYAZ (bkz. celltypes.js >
// colorComplement). tutorialKey metni de bu kuralı doğrudan açıklıyor
// (bkz. i18n.js > onb.p4.tutorial, tüm diller güncellendi).
//
// DÜZELTME: eski tutorialKey metni "iki ışın birleşirse beyaz olur / oraya
// BİRDEN FAZLA ışın göndermen gerekir" diyordu — bu YANLIŞ/eksikti: "birden
// fazla" ifadesi "en az 2" gibi okunabilir, oysa gerçek kural (generator.js'e
// işlenen kural) ŞUDUR: bir bölümde beyaz hedef küre varsa, o bölümdeki TÜM
// (sadece bir kısmı değil, HER) kaynaktan çıkan ışık mutlaka o küreye
// gitmelidir — örn. Usta'da 3 kaynaklı bir bölümde beyaz küre varsa 2'si
// değil 3'ü de oraya gitmeli. Bu eğitim bulmacası zaten 2 kaynaklı olduğu
// için (yukarıdaki kod değişmedi) görsel/pratik doğru kalmaya devam ediyor,
// ama METİN artık genel kuralı ("HER kaynak", 2'ye özel değil) doğru
// anlatıyor (bkz. i18n.js > onb.p4.tutorial, tüm diller).
function puzzle4RenkKarisimi() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p4.title";
  p.tutorialKey = "onb.p4.tutorial";
  p.maxMirrorsHint = 2;
  p.addSource({ x: 0, y: 0 }, Dir.RIGHT, COLOR_RED);
  p.addSource({ x: 0, y: 4 }, Dir.RIGHT, COLOR_CYAN);
  p.addTarget({ x: 4, y: 2 }, COLOR_WHITE);
  return p;
}

// NOT: bu bulmaca da (puzzle1 gibi) kasıtlı olarak 0 DEĞİL 1 ayna gerektirir.
// Eski sürümde kaynak+portal+hedef zaten aynı hizadaydı (0 ayna) — bulmaca
// YÜKLENİR YÜKLENMEZ "Çözüldü!" ekranı geliyordu, oyuncu portalin ne
// yaptığını görmeden bulmaca bitiyordu (test sırasında gözlemlendi: eğitim
// akışındaki portallı bölüm dokunmadan direkt çözülmüş görünüyordu). Şimdi
// kaynak portalin hizasında DEĞİL — oyuncu önce (2,0)'a bir ayna koyup ışını
// portala yönlendirmeli (varsayılan "/" ayna RIGHT'ı DOWN'a çevirir), ışın
// portale girip yönünü koruyarak (0,2)'den çıkar, hedefe ulaşır.
function puzzle5Portal() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p5.title";
  p.tutorialKey = "onb.p5.tutorial";
  p.maxMirrorsHint = 1;
  p.addSource({ x: 4, y: 0 }, Dir.LEFT, COLOR_BLUE);
  p.addPortalPair({ x: 2, y: 2 }, { x: 0, y: 2 });
  p.addTarget({ x: 0, y: 4 }, COLOR_BLUE);
  return p;
}

// NOT: aynı sebeple (bkz. puzzle5Portal notu) bu bulmaca da artık 1 ayna
// gerektiriyor — eski sürümde kaynak splitter ile aynı hizadaydı (0 ayna),
// bulmaca hiç dokunmadan çözülü geliyordu (test sırasında aynı sorun bir
// sonraki bölümde de gözlemlendi). Kaynak artık splitter hizasında DEĞİL —
// oyuncu (0,2)'ye bir ayna koyup ışını sağa (bloğa) yönlendirmeli
// (varsayılan "/" ayna UP'ı RIGHT'a çevirir); bloğa RIGHT yönünde giren
// ışın, ORİJİNAL geometriyle birebir aynı şekilde ikiye ayrılıp iki hedefi
// de besler.
function puzzle6Splitter() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p6.title";
  p.tutorialKey = "onb.p6.tutorial";
  p.maxMirrorsHint = 1;
  p.addSource({ x: 0, y: 4 }, Dir.UP, COLOR_BLUE);
  p.addSplitter({ x: 2, y: 2 }, [Dir.RIGHT, Dir.DOWN]); // sağa + aşağı
  p.addTarget({ x: 4, y: 2 }, COLOR_BLUE);
  p.addTarget({ x: 2, y: 4 }, COLOR_BLUE);
  return p;
}

// KÖR MOD TANITIMI — Zor/Usta'ya geçmeden önce "önce yerleştir, sonra ateşle"
// akışını güvenli bir bulmacada öğretir. Çözüm puzzle2'yle aynı fikir (tek
// ayna) ama farklı yerleşim/renk; buradaki tek fark ETKİLEŞİM MODU.
function puzzle7IsiniCalistir() {
  const p = new PuzzleData();
  p.gridSize = { x: 5, y: 5 };
  p.titleKey = "onb.p7.title";
  p.tutorialKey = "onb.p7.tutorial";
  p.maxMirrorsHint = 1;
  p.blindDemo = true; // main.js bu bulmacayı kör modda yükler (bkz. loadPuzzle)
  p.addSource({ x: 4, y: 0 }, Dir.LEFT, COLOR_BLUE);
  p.addTarget({ x: 2, y: 3 }, COLOR_BLUE);
  return p;
}

export const ONBOARDING_PUZZLES = [
  puzzle1Hedef(),
  puzzle2TekAyna(),
  puzzle3IkiAyna(),
  puzzle4RenkKarisimi(),
  puzzle5Portal(),
  puzzle6Splitter(),
  puzzle7IsiniCalistir(),
];
