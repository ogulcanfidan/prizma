// DEV-ONLY, UI/mantık değişikliklerini doğrulayan tek seferlik test.
// Kapsam: splitter'ın gerçek çıkış yönlerini artık gösterdiği, zorluk rozeti
// (Bug D), ünvan büyük harf + punto (item E).
// NOT: Canlı-mod "yavaş beliriş" animasyonu (animateReveal) kullanıcı
// deneyimini bozduğu için tamamen kaldırıldı — o davranışı test eden eski
// bölümler burada silindi; ilgili "artık hep anında" doğrulaması
// tests/visual_check7.mjs'e taşındı. Portal/splitter'ın çok parçalı beamPath
// sıralaması (Bug A, computeStaggeredProgress) board.js'te değişmedi (hâlâ
// kör mod fire() için geçerli) ve önceden doğrulandı, burada tekrarlanmıyor.
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:8790";
const OUT = "/tmp/prizma_shots8";
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

async function tapCell(cx, cy, gridX, gridY) {
  const box = await page.locator("#board-frame svg").boundingBox();
  const x = box.x + ((cx + 0.5) / gridX) * box.width;
  const y = box.y + ((cy + 0.5) / gridY) * box.height;
  await page.mouse.click(x, y);
}

// exitArrowGlyph SADECE bu kombinasyonu (beyaz, 1.6 kalınlık) kullanıyor —
// board.js'teki başka hiçbir ikon (kaynak/hedef/ayna/duvar) bu tam
// kombinasyonu kullanmıyor, bu yüzden güvenle sayılabilir (bkz. board.js).
const countExitArrows = () =>
  page.evaluate(() => {
    return Array.from(document.querySelectorAll('#board-frame svg path[stroke="#FFFFFF"][stroke-width="1.6"]')).length;
  });

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(300);

// --- 1) Splitter'ın hangi iki yöne ışığı böldüğünü gösteren ilk yaklaşım
// (soyut bir ↻/↺ rozeti) yeterince açık değildi. puzzle6Splitter (index 5):
// kaynak (0,4) UP, (0,2)'ye varsayılan "/" ayna UP'ı RIGHT'a çevirir, RIGHT
// yönünde splitter'a (2,2) girer, düz (RIGHT, hedef (4,2)) + sağa dönüp
// (DOWN, hedef (2,4)) iki dala ayrılır (branchRight=true). Önceki sürümde
// (reaktif computeSplitterExitDirs) ışın geçmeden ok YOKTU; şimdi board.js →
// computeSplitterHintDirs bunu bulmacanın KENDİ çözümünden (findMirrorPath)
// hesaplayıp ışın hiç ateşlenmeden/bağlanmadan da somut yön okları olarak
// gösteriyor — yani çözülmeden ÖNCE de TAM 2 ok (RIGHT ve DOWN) görünmeli;
// çözülünce de aynı 2 ok (artık gerçek ışın yoluyla da tutarlı) görünmeye
// devam etmeli.
await page.evaluate(() => window.__prizmaDebug.gotoOnboarding(5));
await page.waitForTimeout(250);
const arrowsBefore = await countExitArrows();
check(`Round 13: splitter'dan henüz ışın geçmeden de bulmacanın KENDİ çözümünden hesaplanan TAM 2 yön oku zaten görünüyor (${arrowsBefore})`, arrowsBefore === 2);

await tapCell(0, 2, 5, 5); // çözen tek ayna
await page.waitForTimeout(150);
const winVisibleSplitter = await page.evaluate(() => !document.getElementById("win-overlay").hidden);
check("Prizma Bloğu bulmacası gerçekten çözüldü", winVisibleSplitter);
const arrowsAfter = await countExitArrows();
check(`Splitter GERÇEKTEN iki dala ayrılınca TAM 2 çıkış oku görünüyor (Round 10) (${arrowsAfter})`, arrowsAfter === 2);
await page.screenshot({ path: `${OUT}/01_splitter_arrows.png` });

// --- 2) Bug D (değişmedi): sonsuz modda zorluk etiketi bir "rozet"
// (.difficulty-badge), eğitimde ise düz başlık (rozet YOK). ------------------
await page.evaluate(() => window.__prizmaDebug.gotoEndless("usta"));
await page.waitForTimeout(200);
const endlessBadge = await page.evaluate(() => {
  const el = document.querySelector("#game-title .difficulty-badge");
  return el ? { text: el.textContent, hasClass: true } : { hasClass: false };
});
check(`Sonsuz modda #game-title içinde .difficulty-badge var ve metni "USTA" (Bug D) (${JSON.stringify(endlessBadge)})`, endlessBadge.hasClass && endlessBadge.text === "USTA");

await page.evaluate(() => window.__prizmaDebug.gotoOnboarding(0));
await page.waitForTimeout(200);
const onboardingBadge = await page.evaluate(() => !!document.querySelector("#game-title .difficulty-badge"));
check("Eğitimde #game-title rozet KULLANMIYOR (düz başlık)", onboardingBadge === false);

// --- 3) Item E (değişmedi): ünvan büyük Ü ile + punto büyütüldü. ---
await page.evaluate(() => window.__prizmaDebug.gotoStats());
await page.waitForTimeout(200);
const rankInfo = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll(".stats-summary-item"));
  const rankItem = items.find((it) => it.querySelector("span:last-child")?.textContent === "Ünvan");
  if (!rankItem) return null;
  const numEl = rankItem.querySelector(".stats-summary-num-text");
  return { label: rankItem.querySelector("span:last-child").textContent, fontSize: numEl ? getComputedStyle(numEl).fontSize : null };
});
check(`"Ünvan" etiketi büyük Ü ile (${JSON.stringify(rankInfo)})`, rankInfo && rankInfo.label === "Ünvan");
check(`Ünvan punto 15px'ten büyütüldü (şimdi ${rankInfo?.fontSize}) (item E)`, rankInfo && parseFloat(rankInfo.fontSize) > 15);
await page.screenshot({ path: `${OUT}/02_stats_rank.png` });

check("Konsolda hata YOK", errors.length === 0);
if (errors.length) console.log("Hatalar:\n" + errors.join("\n"));

console.log(`\n${pass} geçti, ${fail} başarısız`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
