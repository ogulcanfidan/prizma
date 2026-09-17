// DEV-ONLY, UI değişikliklerini doğrulayan tek seferlik görsel test.
// Kapsam: "Ne kadar iyisin?" istatistik ekranı, ayarlardan satın alma
// bölümünün kaldırılması, sağ üstteki hak rozetinin tıklanabilir butona
// dönüşmesi (proaktif popup), ses çubuklarının dolgu göstergesi.
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:8790";
const OUT = "/tmp/prizma_shots5";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
const logs = [];
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`[console.error] ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

// Onboarding tamamlanmış + birkaç sahte çözüm kaydı ile başla (stats ekranını anlamlı test etmek için).
await page.goto(`${BASE}/index.html`);
await page.evaluate(() => {
  const stats = {
    kolay: { solved: 12, bestTimeMs: 8400, totalTimeMs: 12 * 15000, currentStreak: 3, bestStreak: 5 },
    orta: { solved: 4, bestTimeMs: 21000, totalTimeMs: 4 * 30000, currentStreak: 1, bestStreak: 2 },
    zor: { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 },
    usta: { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 },
  };
  localStorage.setItem("prizma_stats_v1", JSON.stringify({ stats, onboardingCompleted: true }));
});
await page.reload();
await page.waitForTimeout(300);

// 1) Menüde "Ne kadar iyisin?" butonu Oyna ile Eğitimi Tekrar Oyna arasında görünür mü?
const menuBtnIds = await page.evaluate(() => Array.from(document.querySelectorAll(".menu-actions button")).map((b) => b.id));
logs.push(`Menü buton sırası: ${menuBtnIds.join(" > ")}`);

// 2) İstatistik ekranını aç, içerik doğru mu?
await page.click("#btn-stats");
await page.waitForTimeout(200);
const statsVisible = await page.getAttribute("#screen-stats", "hidden");
logs.push(`Stats ekranı açık mı (hidden=null bekleniyor): ${statsVisible}`);
const statsText = await page.textContent("#stats-list");
logs.push(`Stats içerik özet: ${statsText.replace(/\s+/g, " ").trim().slice(0, 300)}`);
const summaryText = await page.textContent("#stats-summary");
logs.push(`Stats summary: ${summaryText.replace(/\s+/g, " ").trim()}`);
await page.screenshot({ path: `${OUT}/01_stats_screen.png` });

await page.click("#stats-back");
await page.waitForTimeout(200);

// 3) Ayarlar ekranında satın alma bölümü YOK mu?
await page.click("#btn-settings");
await page.waitForTimeout(200);
const hasUnlimitedRow = await page.evaluate(() => !!document.getElementById("settings-buy-unlimited"));
logs.push(`Ayarlarda satın alma butonu hâlâ var mı (false bekleniyor): ${hasUnlimitedRow}`);
const settingsHTML = await page.textContent("#screen-settings");
logs.push(`Ayarlar ekranında "39,99" geçiyor mu (false bekleniyor): ${settingsHTML.includes("39,99")}`);

// 4) Slider dolgu göstergesi (--fill) doğru hesaplanıyor mu?
await page.fill("#settings-music", "25");
await page.dispatchEvent("#settings-music", "input");
await page.waitForTimeout(100);
const fillVal = await page.evaluate(() => getComputedStyle(document.getElementById("settings-music")).getPropertyValue("--fill"));
logs.push(`Müzik %25 iken --fill (25% bekleniyor): "${fillVal.trim()}"`);
await page.screenshot({ path: `${OUT}/02_settings_slider.png` });

await page.click("#settings-back");
await page.waitForTimeout(200);

// 5) Zorluk seç ekranında hak rozeti artık bir BUTON mu, tıklayınca popup açılıyor mu (hak DOLUYKEN de)?
await page.click("#btn-play");
await page.waitForTimeout(200);
const badgeTag = await page.evaluate(() => document.getElementById("allowance-badge").tagName);
logs.push(`Hak rozeti elementi (BUTTON bekleniyor): ${badgeTag}`);
await page.click("#allowance-badge");
await page.waitForTimeout(200);
const overlayHidden = await page.getAttribute("#allowance-overlay", "hidden");
const overlayTitle = await page.textContent("#allowance-title");
logs.push(`Hak DOLUYKEN rozete tıklayınca popup açıldı mı (hidden=null bekleniyor): ${overlayHidden}, başlık: "${overlayTitle}"`);
await page.screenshot({ path: `${OUT}/03_allowance_popup_proactive.png` });
await page.click("#allowance-cancel");
await page.waitForTimeout(200);

logs.push(`--- Konsol/sayfa hataları (${errors.length}) ---`);
for (const e of errors) logs.push(e);

console.log(logs.join("\n"));
await browser.close();
