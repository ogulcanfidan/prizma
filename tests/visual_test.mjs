// visual_test.mjs — arayüzün (DOM/görsel taraf) uçtan uca kontrolü.
//
// Eski visual_check5/7/8/9.mjs dosyaları tek seferlik, Linux yollarına gömülü
// (executablePath: /opt/pw-browsers/...) ve artık var olmayan ekranları
// kontrol eden testlerdi; bu dosya onların yerini alır:
//  - kendi statik sunucusunu başlatır (harici sunucu GEREKMEZ),
//  - Playwright'ın kendi indirdiği Chromium'u kullanır (yol gömülü değil),
//  - bugünkü tüm ekranları kapsar: menü, bölümler (kampanya), günlük bulmaca,
//    oyun ekranı (ipucu/geri al), ayarlar, istatistikler.
//
// Çalıştırma:  node tests/visual_test.mjs
// Gereksinim:  npm i -D playwright  +  npx playwright install chromium
//
// Bulmaca ÜRETİMİ ve çözülebilirliği burada DEĞİL, tests/logic_test.mjs'te
// doğrulanır (Node seviyesinde, tarayıcısız).

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "www");
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("yok");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "tr-TR" });

// Konsol hataları testin bir parçası: sessizce patlayan bir şey olmamalı.
// (Yazı tipi/ağ hataları bu ortamda beklenen — göz ardı edilir.)
const errors = [];
const IGNORED = [/fonts\.googleapis\.com/, /ERR_INTERNET_DISCONNECTED/, /ERR_NAME_NOT_RESOLVED/, /favicon/];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (IGNORED.some((re) => re.test(m.text()))) return;
  errors.push(`[console] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    console.log(`OK   ${name}`);
    pass++;
  } else {
    console.log(`FAIL ${name}`);
    fail++;
  }
}

async function goto(screen, ...args) {
  await page.evaluate(([s, a]) => window.__prizmaDebug[s](...a), [screen, args]);
  await page.waitForTimeout(250);
}

// Bulmacanın hazır olmasını bekler ("Bulmaca hazırlanıyor…" kalkana kadar).
async function waitPuzzle(timeout = 30000) {
  await page.waitForFunction(() => document.getElementById("board-preparing").hidden, null, { timeout });
  await page.waitForTimeout(150);
}

await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(600);

// --- 1) Açılış + menü ------------------------------------------------------
check("Açılışta menü görünüyor", !(await page.locator("#screen-menu").isHidden()));
await page.evaluate(() => {
  window.__prizmaDebug.setAllowance(30);
  localStorage.setItem("prizma_stats_v1", JSON.stringify({ onboardingCompleted: true }));
});
await page.reload();
await page.waitForTimeout(600);
await goto("gotoMenu");
const menuBtns = await page.evaluate(() =>
  ["btn-play", "btn-campaign", "btn-daily", "btn-stats", "btn-egitim"].map((id) => ({ id, hidden: document.getElementById(id).hidden }))
);
check(`Eğitim bitince menüde 5 buton da görünür (${menuBtns.filter((b) => !b.hidden).length}/5)`, menuBtns.every((b) => !b.hidden));

// --- 2) Bölümler (kampanya) ------------------------------------------------
await page.click("#btn-campaign");
await page.waitForTimeout(400);
const grid = await page.evaluate(() => ({
  total: document.querySelectorAll(".level-cell").length,
  locked: document.querySelectorAll(".level-cell.locked").length,
  next: document.querySelectorAll(".level-cell.next").length,
}));
check(`Bölüm listesi 60 hücre gösteriyor (${grid.total})`, grid.total === 60);
check(`İlk bölüm hariç hepsi kilitli (${grid.locked}/59)`, grid.locked === 59);
check(`Sıradaki bölüm vurgulanıyor (${grid.next})`, grid.next === 1);

await page.locator(".level-cell").first().click();
await waitPuzzle();
check("Bölüm başlığı doğru", (await page.locator("#game-title").textContent()).includes("Bölüm 1"));
check("Bölümde ipucu butonu var", !(await page.locator("#game-hintbtn").isHidden()));
check("Geri al başlangıçta pasif", await page.locator("#game-undo").isDisabled());

// --- 3) İpucu + geri al ----------------------------------------------------
const beforeHint = await page.locator("#game-hint").textContent();
await page.click("#game-hintbtn");
await page.waitForFunction(() => !document.getElementById("game-hintbtn").disabled, null, { timeout: 30000 });
await page.waitForTimeout(250);
const afterHint = await page.locator("#game-hint").textContent();
check(`İpucu bir ayna yerleştirdi ("${beforeHint}" -> "${afterHint}")`, beforeHint !== afterHint);
check("İpucu sonrası geri al aktif", !(await page.locator("#game-undo").isDisabled()));
await page.click("#game-undo");
await page.waitForTimeout(250);
check("Geri al ipucuyu geri aldı", (await page.locator("#game-hint").textContent()) === beforeHint);

// --- 4) Bölümü çöz -> kazanma ekranı ---------------------------------------
await page.evaluate(() => window.__prizmaDebug.solveCurrent());
await page.waitForSelector("#win-overlay:not([hidden])", { timeout: 30000 });
const winTags = await page.evaluate(() => [...document.querySelectorAll("#win-extra .tag")].map((t) => t.textContent));
check(`Kazanma ekranında bilgi rozetleri var (${winTags.join(" | ")})`, winTags.length >= 1);
check("Kutlama efekti 12 ışından oluşuyor", (await page.evaluate(() => document.getElementById("win-burst").children.length)) === 12);

// --- 4b) Bölüm listesinde toplam süre + 60/60 kutlama ekranı ---------------
// 60 bölümü gerçekten çözmek testte pratik değil; ilerleme doğrudan kayda
// yazılıp ekranlar kontrol ediliyor.
await goto("gotoCampaign");
const totalAfterOne = await page.evaluate(() => ({
  hidden: document.getElementById("campaign-total").hidden,
  text: document.getElementById("campaign-total").textContent,
}));
check(`Bir bölüm çözülünce toplam süre görünüyor ("${totalAfterOne.text}")`, !totalAfterOne.hidden && /\d\d:\d\d/.test(totalAfterOne.text));

await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("prizma_stats_v1") || "{}");
  raw.campaign = {};
  for (let i = 0; i < 60; i++) raw.campaign[String(i)] = { timeMs: 120000 }; // 60 x 2dk = 2 saat
  localStorage.setItem("prizma_stats_v1", JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(600);
await goto("gotoCampaign");
const doneList = await page.evaluate(() => ({
  locked: document.querySelectorAll(".level-cell.locked").length,
  progress: document.getElementById("campaign-progress").textContent,
  total: document.getElementById("campaign-total").textContent,
}));
check(`60/60'ta hiçbir bölüm kilitli değil (${doneList.locked})`, doneList.locked === 0);
check(`İlerleme 60/60 gösteriyor ("${doneList.progress}")`, doneList.progress.includes("60/60"));
check(`Toplam süre saat biçiminde ("${doneList.total}")`, doneList.total.includes("2:00:00"));

await goto("showCampaignDone");
const doneOverlay = await page.evaluate(() => ({
  visible: !document.getElementById("campaign-done-overlay").hidden,
  burst: document.getElementById("campaign-done-burst").children.length,
  sub: document.getElementById("campaign-done-sub").textContent,
  extra: document.getElementById("campaign-done-extra").textContent,
}));
check("60/60 kutlama ekranı açılıyor", doneOverlay.visible);
check(`Kutlama ekranında ışık efekti var (${doneOverlay.burst})`, doneOverlay.burst === 12);
check(`Kutlama ekranı bölüm sayısını yazıyor ("${doneOverlay.sub}")`, doneOverlay.sub.includes("60"));
check(`Kutlama ekranı toplam süreyi yazıyor ("${doneOverlay.extra}")`, doneOverlay.extra.includes("2:00:00"));
await page.click("#campaign-done-close");
await page.waitForTimeout(250);
check("Kutlama ekranı kapanıp listeye dönüyor", await page.evaluate(() => document.getElementById("campaign-done-overlay").hidden && !document.getElementById("screen-campaign").hidden));

// --- 5) Günlük bulmaca -----------------------------------------------------
await goto("gotoMenu");
await page.click("#btn-daily");
await waitPuzzle();
check("Günlük bulmaca başlığı doğru", (await page.locator("#game-title").textContent()).includes("Günlük"));
check("Günlük bulmacada o günün zorluğu yazıyor", (await page.locator("#game-tutorial").textContent()).length > 0);

// --- 6) Sonsuz mod: araç çubuğu tek satıra sığıyor mu ----------------------
await goto("gotoEndless", "orta");
await waitPuzzle();
const barFits = await page.evaluate(() => {
  const bar = document.querySelector("#screen-game .bottom-bar");
  return bar.scrollWidth <= bar.clientWidth + 1;
});
check("Sıfırla/Geri Al/İpucu + sayaç tek satıra sığıyor", barFits);

// --- 7) Ayarlar ------------------------------------------------------------
await goto("gotoSettings");
const settingsRows = await page.evaluate(() => ({
  vibration: !!document.getElementById("settings-vibration-row"),
  colorblind: !!document.getElementById("settings-colorblind-row"),
  restore: !!document.getElementById("settings-restore"),
  adPrefs: !!document.getElementById("settings-ad-prefs"),
  privacyVisible: !document.getElementById("settings-privacy").hidden,
}));
check("Ayarlarda titreşim anahtarı var", settingsRows.vibration);
check("Ayarlarda renk körlüğü anahtarı var", settingsRows.colorblind);
check("Ayarlarda satın almayı geri yükle var", settingsRows.restore);
check("Ayarlarda reklam tercihleri var", settingsRows.adPrefs);
check("Gizlilik politikası bağlantısı görünür (adres tanımlı)", settingsRows.privacyVisible);

// Renk körlüğü modu açılınca tahtaya şekil rozetleri eklenmeli.
await page.click("#settings-colorblind-row");
await goto("gotoEndless", "kolay");
await waitPuzzle();
const glyphCount = await page.evaluate(() => document.querySelectorAll("#board-frame svg path, #board-frame svg rect, #board-frame svg circle").length);
check(`Renk körlüğü modunda tahtada ek şekiller çiziliyor (${glyphCount} öğe)`, glyphCount > 0);

// --- 8) İstatistikler ------------------------------------------------------
await goto("gotoStats");
const statsChips = await page.evaluate(() => ({
  chips: document.querySelectorAll(".stats-chip-row .leaderboard-chip").length,
  titleLines: document.querySelector("#screen-stats .title").getClientRects().length,
}));
check(`İstatistiklerde Sıralama + Başarılar butonları var (${statsChips.chips})`, statsChips.chips === 2);
check("Başlık tek satırda duruyor", statsChips.titleLines === 1);

check(`Konsolda hata yok (${errors.length})`, errors.length === 0);
if (errors.length) console.log(errors.join("\n"));

await browser.close();
server.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail === 0 ? 0 : 1);
