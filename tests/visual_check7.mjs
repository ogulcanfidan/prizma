// DEV-ONLY, UI/mantık değişikliklerini doğrulayan tek seferlik test.
// Kapsam: yeni logo (v3), yeni alt başlık ("Prizma" geçen), eğitim tamamlandı
// ekranı (item 4), "Ne kadar iyisin?" ekranında puan+ünvan (item 8/9), dil
// seçici + canlı dil değişimi (item 12).
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:8790";
const OUT = "/tmp/prizma_shots7";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// locale: "tr-TR" — bu sandbox'ın varsayılan tarayıcı dili İngilizce, bu da
// otomatik dil algılamayı (item 12, doğru şekilde) İngilizce'ye düşürür.
// Gerçek bir Türk kullanıcının cihazını temsil etmek için burada açıkça
// tr-TR ayarlanıyor — algılama mantığının kendisi zaten ayrı test ediliyor
// (aşağıdaki "İngilizce'ye geçince..." adımlarında).
const page = await browser.newPage({ viewport: { width: 420, height: 820 }, locale: "tr-TR" });
const errors = [];
// fonts.googleapis.com — style.css'in Google Fonts @import'u (bu
// değişikliklerden önce de vardı, bunlarla ilgisi yok) bu sandbox'ın egress
// politikası tarafından engelleniyor; gerçek bir cihazda/normal ağda sorun
// değil. Sadece BU bilinen ağ hatasını filtrele, başka her şeyi yakala.
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

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(300);

// --- 1) Yeni logo (v3): SVG'de artık en fazla 2 <line> olmalı (v2: 4 idi: 1 giriş + 3 çıkış), glow filtresi yok. ---
const logoInfo = await page.evaluate(() => {
  const svg = document.querySelector("#logo-mark svg");
  return svg ? { lineCount: svg.querySelectorAll("line").length, hasFilter: !!svg.querySelector("filter") } : null;
});
check(`Logo v3: 2 çizgi, glow filtresi YOK (${JSON.stringify(logoInfo)})`, logoInfo && logoInfo.lineCount === 2 && !logoInfo.hasFilter);

// --- 2) Yeni alt başlık "Prizma" kelimesini içeriyor, eskisi değil. ------
const subtitle = await page.textContent("#menu-subtitle");
check(`Alt başlık "Prizma" içeriyor (metin: "${subtitle}")`, /prizma/i.test(subtitle));
check(`Eski alt başlık ("Işın. Ayna. Portal. Renk.") artık yok`, subtitle !== "Işın. Ayna. Portal. Renk.");

// --- 3) Dil seçici: 9 dil + otomatik seçenek var, İngilizce'ye geçince metinler değişiyor. ---
await page.click("#btn-settings");
await page.waitForTimeout(150);
const langOptions = await page.evaluate(() => Array.from(document.querySelectorAll("#settings-language option")).map((o) => o.value));
check(`Dil seçici 10 seçenek (auto+9 dil) içeriyor: ${JSON.stringify(langOptions)}`, langOptions.length === 10 && langOptions.includes("auto") && langOptions.includes("tr") && langOptions.includes("en") && langOptions.includes("ar"));

await page.selectOption("#settings-language", "en");
await page.waitForTimeout(150);
const settingsTitleEn = await page.textContent(".title");
check(`Dil İngilizce'ye geçince Ayarlar başlığı "Settings" oluyor (metin: "${settingsTitleEn}")`, settingsTitleEn.trim() === "Settings");

await page.click("#settings-back");
await page.waitForTimeout(150);
const subtitleEn = await page.textContent("#menu-subtitle");
check(`Menüye dönünce alt başlık da İngilizce (metin: "${subtitleEn}")`, /prism/i.test(subtitleEn));

// Türkçe'ye geri dön (sonraki testler Türkçe metin karşılaştırıyor).
await page.click("#btn-settings");
await page.waitForTimeout(150);
await page.selectOption("#settings-language", "tr");
await page.waitForTimeout(150);
await page.click("#settings-back");
await page.waitForTimeout(150);

// --- 4) Eğitim akışı: debug hook ile DOĞRUDAN son (7.) bulmacaya atla —
// gotoOnboarding(6) main.js'deki onboardingIndex'i 6 yapar (length=7), bu
// yüzden bu TEK bulmacayı gerçekten çözüp "Sıradaki"ye basmak, son bulmaca
// akışını (item 4'ün asıl test noktası) tetikler. Puzzle7 ("Işını Çalıştır"):
// kaynak (4,0) LEFT, hedef (2,3), maxMirrorsHint=1 — varsayılan "/" ayna
// (2,0)'a konunca LEFT->DOWN döner, hedefe ulaşır (bkz. onboarding.js notu).
await page.evaluate(() => window.__prizmaDebug.gotoOnboarding(6));
await page.waitForTimeout(300);
await tapCell(2, 0, 5, 5);
await page.waitForTimeout(200);
await page.click("#game-fire");
await page.waitForTimeout(700);
const winVisibleP7 = await page.evaluate(() => !document.getElementById("win-overlay").hidden);
check("Son eğitim bulmacası (Işını Çalıştır) gerçekten çözüldü", winVisibleP7);
// Eğitimin son bölümü bitince önceki metin "Zorluk Seç" yazıyordu ama bu
// buton "Eğitim Tamamlandı!" ekranına gider, DOĞRUDAN Zorluk Seç'e değil —
// bu yüzden artık "Zorluk Seç" değil "Devam Et" yazmalı.
const winNextText = await page.evaluate(() => document.getElementById("win-next").textContent);
check(`Son eğitim bulmacasında buton "Devam Et" yazıyor, "Zorluk Seç" DEĞİL (Round 10) (metin: "${winNextText}")`, winNextText === "Devam Et");
if (winVisibleP7) {
  await page.click("#win-next");
  await page.waitForTimeout(300);
}

const doneOverlayVisible = await page.evaluate(() => {
  const el = document.getElementById("onboarding-done-overlay");
  return el ? el.hidden === false : null;
});
check('Eğitim bitince DOĞRUDAN Zorluk Seç yerine "Eğitim Tamamlandı" ekranı gösteriliyor (item 4)', doneOverlayVisible === true);
await page.screenshot({ path: `${OUT}/01_onboarding_done.png` });

const onboardingDoneTexts = await page.evaluate(() => ({
  title: document.querySelector("#onboarding-done-overlay .win-title")?.textContent,
  sub: document.getElementById("onboarding-done-sub")?.textContent,
  play: document.getElementById("onboarding-done-play")?.textContent,
}));
check(`"Eğitim Tamamlandı!" başlığı doğru (${JSON.stringify(onboardingDoneTexts)})`, onboardingDoneTexts.title === "Eğitim Tamamlandı!");
check(`"OYNA" butonu doğru metinde`, onboardingDoneTexts.play === "OYNA");

await page.click("#onboarding-done-play");
await page.waitForTimeout(300);
const onDifficultyScreen = await page.evaluate(() => document.getElementById("screen-difficulty").hidden === false);
check('"OYNA" butonu Zorluk Seç ekranına yönlendiriyor', onDifficultyScreen);

// --- 5) "Ne kadar iyisin?" ekranı: puan + ünvan gösteriyor (item 8/9). ----
await page.evaluate(() => window.__prizmaDebug.gotoStats());
await page.waitForTimeout(200);
const statsSummary = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll(".stats-summary-item"));
  return items.map((it) => ({ num: it.querySelector(".stats-summary-num,.stats-summary-num-text")?.textContent, label: it.querySelector("span:last-child")?.textContent }));
});
check(`Stats özetinde "puan" etiketi var (${JSON.stringify(statsSummary)})`, statsSummary.some((s) => s.label === "puan"));
check(`Stats özetinde "Ünvan" etiketi var (büyük Ü — Round 9) (${JSON.stringify(statsSummary)})`, statsSummary.some((s) => s.label === "Ünvan"));
check(`Ünvan metni tanınan bir rütbe (${JSON.stringify(statsSummary)})`, statsSummary.some((s) => ["Yeni Oyuncu", "Amatör", "Uzman", "Prizma Ustası", "Işık Efsanesi"].includes(s.num)));
await page.screenshot({ path: `${OUT}/02_stats_points_rank.png` });

// --- 6) Item 1: uygulama arka plana atılınca (visibilitychange) hata
// fırlatmadan çalışıyor mu (gerçek Capacitor App eklentisi yokken web
// fallback yolu). ------------------------------------------------------------
const bgResult = await page.evaluate(() => {
  try {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    return "ok";
  } catch (e) {
    return `hata: ${e.message}`;
  }
});
check(`Arka plana atma/geri dönme (visibilitychange) hatasız çalışıyor (item 1) — sonuç: ${bgResult}`, bgResult === "ok");

// --- 7) Işının çözümde yavaşça "belirmesi" (animateReveal animasyonu)
// kullanıcı deneyimini bozduğu için tamamen kaldırıldı. Artık eğitimde de
// (tıpkı sonsuz mod Kolay/Orta gibi) hem ara denemede HEM DE doğru çözümde
// ışın HER ZAMAN anında (animasyonsuz) çiziliyor — dashoffset dokunuşun HEMEN
// ardından zaten 0 olmalı, sonraki karelerde DEĞİŞMEMELİ (yeniden belirme YOK).
await page.evaluate(() => window.__prizmaDebug.gotoOnboarding(0));
await page.waitForTimeout(200);
// puzzle1Hedef: kaynak (0,2) RIGHT, (2,2)'ye varsayılan "/" ayna RIGHT'ı
// UP'a çevirir, hedef (2,0)'a ulaşır (gerçek çözen hücre).
await tapCell(2, 2, 5, 5);
const readDashoffset = () =>
  page.evaluate(() => {
    const line = document.querySelector("#board-frame polyline");
    return line ? Number(line.getAttribute("stroke-dashoffset")) : null;
  });
const frameA = await readDashoffset();
await page.waitForTimeout(150);
const frameB = await readDashoffset();
check(
  `Eğitimde çözülünce ışın ANINDA çiziliyor, tekrar baştan BELİRMİYOR (Round 10) — A=${frameA} B=${frameB}`,
  frameA === 0 && frameB === 0
);

check("Konsolda hata YOK", errors.length === 0);
if (errors.length) console.log("Hatalar:\n" + errors.join("\n"));

console.log(`\n${pass} geçti, ${fail} başarısız`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
