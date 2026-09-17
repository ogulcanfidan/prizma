// DEV-ONLY, UI/mantık değişikliklerini doğrulayan tek seferlik test. Kapsam:
// Zor/Usta ızgara büyütmesi (item 1 — ayna sayısı DEĞİŞMEDİ, sadece ızgara),
// splitter'ın HER ZAMAN görünen SOMUT yön oku(ları) (item 2 — önceki soyut
// ↻/↺ rozetinin "alakasız/belli etmiyor" bulunup portal'la AYNI görsel dilde
// (exitArrowGlyph) somut yön oklarına çevrilmesi, ışın gelmeden önce de
// görünmeli), splitter'ın kaynak->splitter bacağının da artık oyuncunun işi
// olması (sabit ayna KALKTI), Zor/Usta'da splitter+portal'ın AYNI bulmacada
// birlikte render edilmesi (item "both"), ana menüdeki 3 butonun artık aynı
// stil/punto olması + "Oyna" metninin büyük harften kurtulması. Portal/
// splitter'ın GERÇEK gerekliliği VE bothMode/orta-çeşitlilik ORANLARI
// tests/logic_test.mjs'te doğrulanıyor (Node seviyesinde, generator.js →
// attemptPortalJoint/trySplitterBeam ile aynı mantık) — burada sadece
// görsel/DOM tarafı test ediliyor.
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:8790";
const OUT = "/tmp/prizma_shots9";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 420, height: 820 }, locale: "tr-TR" });
const errors = [];
const IGNORED_ERROR_PATTERNS = [/ERR_TUNNEL_CONNECTION_FAILED/, /fonts\.googleapis\.com/, /404 \(File not found\)/];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  if (IGNORED_ERROR_PATTERNS.some((re) => re.test(text))) return;
  errors.push(`[console.error] ${text}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { console.log(`OK   ${name}`); pass++; }
  else { console.log(`FAIL ${name}`); fail++; }
}

async function tapCell9(cx, cy, gridX, gridY) {
  const box = await page.locator("#board-frame svg").boundingBox();
  const x = box.x + ((cx + 0.5) / gridX) * box.width;
  const y = box.y + ((cy + 0.5) / gridY) * box.height;
  await page.mouse.click(x, y);
}

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(300);
// Bu test onlarca kez gotoEndless() çağırıyor (splitter/fixed-ayna arama
// döngüleri) — günlük bulmaca hakkını (varsayılan 30) tüketip
// "allowance-overlay"i tetiklememesi için sınırsız hak veriyoruz.
await page.evaluate(() => window.__prizmaDebug.grantUnlimited());

// --- 1) Item 4: Zor/Usta ızgarası büyütüldü (ayna aralığı DEĞİŞMEDİ, bkz.
// logic_test.mjs test #6 — sadece ızgara boyutu). CELL=64 -> viewBox
// genişliği/yüksekliği ızgara boyutunun 64 katı olmalı.
await page.evaluate(() => window.__prizmaDebug.gotoEndless("zor"));
await page.waitForTimeout(200);
const zorViewBox = await page.evaluate(() => document.querySelector("#board-frame svg").getAttribute("viewBox"));
check(`Zor ızgarası 11x11'e büyütüldü (viewBox="${zorViewBox}", beklenen "0 0 704 704")`, zorViewBox === "0 0 704 704");

await page.evaluate(() => window.__prizmaDebug.gotoEndless("usta"));
await page.waitForTimeout(200);
const ustaViewBox = await page.evaluate(() => document.querySelector("#board-frame svg").getAttribute("viewBox"));
check(`Usta ızgarası 12x12'ye büyütüldü (viewBox="${ustaViewBox}", beklenen "0 0 768 768")`, ustaViewBox === "0 0 768 768");
await page.screenshot({ path: `${OUT}/01_usta_grid.png` });

// --- 2) Item 2: splitter'ın SOMUT yön ok(lar)ı IŞIN ULAŞMADAN ÖNCE de
// görünmeli. Önceki soyut ↻/↺ rozeti "alakasız/belli etmiyor" bulunup
// kaldırıldı; artık board.js → exitArrowGlyph() portal'la AYNI görsel dilde
// (beyaz, hafif parlayan, uca doğru daralan ok —
// path[stroke="#FFFFFF"][filter="url(#nglowSoft)"]) İKİ SOMUT ok çiziyor
// (computeSplitterHintDirs, bkz. board.js notu). Her splitter TAM OLARAK 2
// böyle ok üretir (splitterIcon → exitDirs.length===2) — portalExitDirs
// ışın hiç ateşlenmediyse null döner (bkz. board.js →
// computePortalExitDirs), yani ateşlenmemiş bir turda sahnedeki TÜM bu
// oklar splitter'lara ait olmalı. Usta'da splitterChance=0.5 — en fazla ~40
// denemede bir splitter'lı bulmaca bulunmalı (istatistiksel olarak neredeyse
// kesin).
let foundSplitter = false;
let arrowCountBefore = 0;
for (let i = 0; i < 40 && !foundSplitter; i++) {
  await page.evaluate(() => window.__prizmaDebug.gotoEndless("usta"));
  await page.waitForTimeout(120);
  const info = await page.evaluate(() => {
    const arrowPaths = Array.from(document.querySelectorAll('#board-frame svg path[stroke="#FFFFFF"][filter="url(#nglowSoft)"]'));
    return { hasSplitterPolygon: !!document.querySelector("#board-frame svg polygon"), arrowCount: arrowPaths.length };
  });
  if (info.hasSplitterPolygon && info.arrowCount > 0) {
    foundSplitter = true;
    arrowCountBefore = info.arrowCount;
  }
}
check(`Splitter'lı bir usta bulmacası bulundu (${foundSplitter})`, foundSplitter);
check(`Işın HENÜZ hiç ateşlenmeden/bağlanmadan splitter'ın SOMUT yön ok(lar)ı zaten görünüyor (Round 13) (ok sayısı=${arrowCountBefore}, beklenen >=2)`, arrowCountBefore >= 2);
await page.screenshot({ path: `${OUT}/02_splitter_arrows_before_beam.png` });

// --- 2b) Zor/Usta'da artık splitter+portal AYNI bulmacada birlikte
// (bothMode) çıkabiliyor (tasarım gereği). Usta'da bothMode gerçekleşen oran
// ~0.68 (bkz. logic_test.mjs) — en fazla ~40 denemede en az bir kez böyle bir
// bulmacaya rastlanmalı. Burada SADECE ikisinin DOM'da AYNI ANDA render
// edildiğini (splitter poligonu + portal'ın kesikli halkası) doğruluyoruz —
// gerçek gereklilik/oran Node tarafında zaten test ediliyor.
let foundBoth = false;
for (let i = 0; i < 40 && !foundBoth; i++) {
  await page.evaluate(() => window.__prizmaDebug.gotoEndless("usta"));
  await page.waitForTimeout(120);
  const hasBoth = await page.evaluate(() => {
    const hasPolygon = !!document.querySelector("#board-frame svg polygon");
    const hasPortalRing = !!document.querySelector('#board-frame svg circle[stroke-dasharray="5 4"]');
    return hasPolygon && hasPortalRing;
  });
  if (hasBoth) foundBoth = true;
}
check(`Round 13: Usta'da splitter+portal AYNI bulmacada birlikte render edilen bir örnek bulundu (${foundBoth})`, foundBoth);
if (foundBoth) await page.screenshot({ path: `${OUT}/02b_splitter_and_portal_together.png` });

// --- 3) Oyuncunun splitter'a giden yolu da kendisinin çözmesi istendiğinden
// trySplitterBeam artık kaynak->splitter arasında SABİT (fixed) bir ayna
// KULLANMIYOR (addFixedMirror çağrısı generator.js'ten tamamen kaldırıldı) —
// o bacak da jointSolve'un GERÇEK bir parçası. Bu yüzden hiçbir usta/zor
// bulmacasında artık sabit ayna görünmemeli (fixedMirrorIcon altyapısı hâlâ
// kodda duruyor — dormant/ileride kullanılabilir — ama şu an hiçbir üretici
// çağırmıyor).
let sawAnyFixedMirror = false;
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => window.__prizmaDebug.gotoEndless("usta"));
  await page.waitForTimeout(120);
  const hasFixed = await page.evaluate(() => !!document.querySelector('#board-frame svg path[stroke="#8B93C4"]'));
  if (hasFixed) sawAnyFixedMirror = true;
}
check("Round 12: prosedürel splitter bulmacalarında ARTIK sabit ayna yok (kaynak->splitter bacağı da oyuncunun işi)", !sawAnyFixedMirror);

// --- 4) Item 5 (sınırlı doğrulama): müzik motoru hatasız kuruluyor/çalıyor mu
// (motor baştan yazıldı — metronomik arp iskeleti tamamen kaldırılıp drone +
// yavaş akor ped'i + seyrek rastgele "twinkle" notalarına geçildi, bkz.
// audio.js başı — gerçek AudioContext düğümleri oluşturuyor, burada en
// azından İSTİSNA fırlatmadığını doğruluyoruz; işitsel karşılaştırma bu
// testin kapsamı dışında). ---------
const audioResult = await page.evaluate(async () => {
  try {
    const mod = await import("./js/audio.js");
    mod.unlockAudio();
    await new Promise((r) => setTimeout(r, 300));
    mod.stopMusic();
    return "ok";
  } catch (e) {
    return `hata: ${e.message}`;
  }
});
check(`Yeni müzik motoru (filtre-LFO + shimmer pad) hatasız kuruluyor (sonuç: ${audioResult})`, audioResult === "ok");

// --- 5) Eğitimi tamamlayınca gösterilen 3 butonun da "oyna" butonu gibi aynı
// stilde olması, "OYNA" yerine "Oyna" yazması ve üçünün de aynı punto olması
// isteniyor. Eğitimi gerçekten tamamlayıp (visual_check7.mjs'teki akışla
// aynı — son bulmaca (index 6) çöz -> Sıradaki -> Eğitim Tamamlandı ekranı ->
// OYNA) menüye dönüyoruz.
await page.evaluate(() => window.__prizmaDebug.gotoOnboarding(6));
await page.waitForTimeout(200);
await tapCell9(2, 0, 5, 5);
await page.waitForTimeout(200);
await page.click("#game-fire");
await page.waitForTimeout(700);
if (await page.evaluate(() => !document.getElementById("win-overlay").hidden)) {
  await page.click("#win-next");
  await page.waitForTimeout(300);
}
if (await page.evaluate(() => document.getElementById("onboarding-done-overlay")?.hidden === false)) {
  await page.click("#onboarding-done-play");
  await page.waitForTimeout(200);
}
await page.evaluate(() => window.__prizmaDebug.gotoMenu());
await page.waitForTimeout(150);
// Fare son tıklamadan (onboarding-done-play) beri hareket etmedi — yeni menü
// ekranında farkında olmadan bir butonun üzerinde kalıp :hover stilini
// tetikleyip arkaplan kıyasını yanıltmasın diye nötr bir köşeye taşı.
await page.mouse.move(5, 5);
// CSS "transition: background 0.15s ease" son ekran geçişinden hemen sonra
// hâlâ ara karede olabilir (o anki computed style rengi OKLab'ta ara-değer
// olarak serileşiyor, gerçek dinlenme rengini YANSITMIYOR) — geçişin
// tamamen bitmesini bekle.
await page.waitForTimeout(400);
const menuInfo = await page.evaluate(() => {
  const ids = ["btn-play", "btn-stats", "btn-egitim"];
  return ids.map((id) => {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    // class listesi + border-radius/padding/font-size karşılaştırması, ham
    // (olası ara-karede/renk-uzayı farklı serileşebilen) background rengi
    // string'inden daha güvenilir bir "aynı stil mi" testi.
    return { id, hidden: el.hidden, text: el.textContent, className: el.className, fontSize: cs.fontSize, padding: cs.padding, borderRadius: cs.borderRadius };
  });
});
const visibleBtns = menuInfo.filter((b) => !b.hidden);
check(`Eğitim tamamlanınca 3 buton da görünür oldu (${visibleBtns.map((b) => b.id).join(", ")})`, visibleBtns.length === 3);
if (visibleBtns.length === 3) {
  const fontSizes = new Set(visibleBtns.map((b) => b.fontSize));
  const paddings = new Set(visibleBtns.map((b) => b.padding));
  const classNames = new Set(visibleBtns.map((b) => b.className.replace(/\s+/g, " ").trim()));
  check(`3 menü butonu da AYNI punto (Round 12) (${[...fontSizes].join(", ")})`, fontSizes.size === 1);
  check(`3 menü butonu da AYNI padding/boyut (Round 12) (${[...paddings].join(" | ")})`, paddings.size === 1);
  check(`3 menü butonu da AYNI CSS sınıfında ("btn primary", Round 12) (${[...classNames].join(" | ")})`, classNames.size === 1);
  const playBtn = visibleBtns.find((b) => b.id === "btn-play");
  check(`"Oyna" butonu artık BÜYÜK HARFLE değil (metin: "${playBtn.text}")`, playBtn.text === "Oyna");
  await page.screenshot({ path: `${OUT}/04_menu_3_buttons.png` });
}

check("Konsolda hata YOK", errors.length === 0);
if (errors.length) console.log("Hatalar:\n" + errors.join("\n"));

console.log(`\n${pass} geçti, ${fail} başarısız`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
