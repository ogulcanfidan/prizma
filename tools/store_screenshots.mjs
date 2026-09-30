// store_screenshots.mjs — Play mağazası görsellerini ÜRETİR: telefon ve tablet
// ekran görüntüleri + özellik grafiği, 14 dilde.
//
// Her dil için oyunu o dilde açar, 8 sahneyi çeker ve her birini mağaza
// görseline dönüştürür: renkli gradyan zemin + üstte o dilde kalın başlık +
// telefon çerçevesi içinde ekran görüntüsü (1080x1920, Play'in 9:16 sınırı).
//
// Oyunun dili/arayüzü değiştiğinde görselleri elle yeniden çekmek yerine bu
// dosya yeniden çalıştırılır:
//
//   node tools/store_screenshots.mjs                 -> her şey, 14 dil
//   node tools/store_screenshots.mjs en de ja        -> yalnızca verilen diller
//   node tools/store_screenshots.mjs tablet feature  -> yalnızca verilen türler
//
// Çıktı: _gecici_store_out/ekran_goruntuleri/<play-dil-kodu>/prizma_<kod>_N_sahne.png
// (dosya adında dil kodu var: Play Console öğe kitaplığı aynı adlı dosyaları
// karıştırıyor, 14 dilin dosyaları birbirinden ayrı adlandırılmalı)
// (klasör .gitignore'da — görseller depoya girmez).
//
// Gereksinim: npm i -D playwright  +  npx playwright install chromium

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "www");
const OUT = path.join(HERE, "..", "_gecici_store_out", "ekran_goruntuleri");
const PORT = 8798;
const BASE = `http://localhost:${PORT}`;

// Oyun içi dil kodu -> Play Console mağaza dil kodu (klasör adı olarak).
const PLAY_LOCALE = {
  tr: "tr-TR", en: "en-US", es: "es-419", fr: "fr-FR", pt: "pt-BR", ru: "ru-RU", hi: "hi-IN",
  ar: "ar", zh: "zh-CN", id: "id", de: "de-DE", ja: "ja-JP", ko: "ko-KR", it: "it-IT",
};

// Sahne başlıkları. Sıra = mağazadaki sıra (ilk üçü arama sonuçlarında görünür,
// o yüzden oyunun kendisini gösteren sahneler başta).
const SCENES = ["guide", "portal", "split", "master", "record", "levels", "daily", "stats"];
const CAPTIONS = {
  tr: ["Işığı hedefe ulaştır", "Portallar ışını taşır", "Tek ışını ikiye böl", "Usta seviyesinde meydan oku", "Kendi rekorunu kır", "Kolaydan ustaya 60 bölüm", "Her gün yeni bir bulmaca", "Gelişimini takip et"],
  en: ["Guide the light to its target", "Portals carry the beam across", "Split one beam into two", "Take on Master difficulty", "Beat your own record", "60 levels, from easy to master", "A new puzzle every day", "Track your progress"],
  es: ["Guía la luz hasta su objetivo", "Los portales transportan el rayo", "Divide un rayo en dos", "Atrévete con el nivel Maestro", "Supera tu propio récord", "60 niveles, de fácil a maestro", "Un acertijo nuevo cada día", "Sigue tu progreso"],
  fr: ["Guidez la lumière vers sa cible", "Les portails transportent le rayon", "Divisez un rayon en deux", "Relevez le défi Maître", "Battez votre propre record", "60 niveaux, de facile à maître", "Un nouveau puzzle chaque jour", "Suivez votre progression"],
  pt: ["Guie a luz até o alvo", "Portais transportam o feixe", "Divida um feixe em dois", "Encare o nível Mestre", "Supere seu próprio recorde", "60 níveis, do fácil ao mestre", "Um novo quebra-cabeça todo dia", "Acompanhe seu progresso"],
  ru: ["Направьте свет к цели", "Порталы переносят луч", "Разделите луч надвое", "Испытайте уровень «Мастер»", "Побейте свой рекорд", "60 уровней: от лёгкого до мастера", "Новая головоломка каждый день", "Следите за прогрессом"],
  hi: ["प्रकाश को लक्ष्य तक पहुँचाएँ", "पोर्टल किरण को दूर ले जाते हैं", "एक किरण को दो में बाँटें", "उस्ताद स्तर की चुनौती लें", "अपना ही रिकॉर्ड तोड़ें", "आसान से उस्ताद तक 60 स्तर", "हर दिन एक नई पहेली", "अपनी प्रगति देखें"],
  ar: ["وجّه الضوء إلى هدفه", "البوابات تنقل الشعاع", "اقسم الشعاع إلى اثنين", "تحدَّ مستوى المحترف", "حطّم رقمك القياسي", "60 مرحلة من السهل إلى المحترف", "لغز جديد كل يوم", "تابع تقدّمك"],
  zh: ["引导光线到达目标", "传送门传送光束", "将一束光分成两束", "挑战大师难度", "打破自己的纪录", "60 关，从简单到大师", "每天一道新谜题", "查看你的进度"],
  id: ["Arahkan cahaya ke targetnya", "Portal memindahkan sinar", "Belah satu sinar jadi dua", "Taklukkan tingkat Master", "Pecahkan rekormu sendiri", "60 level, dari mudah hingga master", "Teka-teki baru setiap hari", "Pantau kemajuanmu"],
  de: ["Lenke das Licht zum Ziel", "Portale tragen den Strahl weiter", "Teile einen Strahl in zwei", "Stell dich der Stufe Meister", "Schlage deinen eigenen Rekord", "60 Level, von leicht bis Meister", "Jeden Tag ein neues Rätsel", "Verfolge deinen Fortschritt"],
  ja: ["光をターゲットへ導こう", "ポータルがビームを運ぶ", "1本のビームを2本に分ける", "マスター難易度に挑戦", "自己ベストを更新しよう", "全60ステージに挑戦", "毎日新しいパズル", "上達を記録しよう"],
  ko: ["빛을 목표까지 이끄세요", "포털이 광선을 옮겨 줍니다", "광선 하나를 둘로 나누세요", "마스터 난이도에 도전", "내 최고 기록을 깨 보세요", "쉬움부터 마스터까지 60 스테이지", "매일 새로운 퍼즐", "나의 성장을 확인하세요"],
  it: ["Guida la luce al bersaglio", "I portali trasportano il raggio", "Dividi un raggio in due", "Sfida il livello Maestro", "Batti il tuo record", "60 livelli, da facile a maestro", "Un nuovo enigma ogni giorno", "Segui i tuoi progressi"],
};

// Oyun sahneleri kampanya bölümlerinden çekilir: bölümler tohumdan
// deterministik üretildiği için her dilde BİREBİR aynı tahta çıkar
// (bkz. www/js/campaignLevels.js). Değer = bölüm indeksi (0 tabanlı).
const LEVEL_FOR = { guide: 8, portal: 17, split: 23, master: 55, record: 40 };
// Her sahnede sayacın göstereceği çözüm süresi (ms). Otomatik çözüm 1 saniye
// sürdüğü için "00:01" yazardı; gerçek bir oyuncunun süresine benzetilir.
const ELAPSED_FOR = { guide: 47000, portal: 92000, split: 125000, master: 221000, record: 143000 };

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

function dateKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Görsellerde "yaşayan" bir oyun görünsün diye gerçekçi bir ilerleme kaydı.
// solvedLevels: kampanyada kaç bölüm çözülmüş görünsün.
function saveState(lang, solvedLevels) {
  const campaign = {};
  for (let i = 0; i < solvedLevels; i++) campaign[String(i)] = { timeMs: 38000 + ((i * 7919) % 90) * 1000 + Math.floor(i / 15) * 45000 };
  return {
    onboardingCompleted: true,
    settings: { language: lang, musicVolume: 0, sfxVolume: 0, notificationsEnabled: false, vibrationEnabled: false, colorBlindMode: false },
    stats: {
      // Toplam 1649 puan -> "Uzman" rütbesi (bkz. gamestate.js → RANK_TIERS).
      kolay: { solved: 120, bestTimeMs: 21000, totalTimeMs: 120 * 48000, currentStreak: 9, bestStreak: 14 },
      orta: { solved: 96, bestTimeMs: 47000, totalTimeMs: 96 * 95000, currentStreak: 4, bestStreak: 8 },
      zor: { solved: 58, bestTimeMs: 88000, totalTimeMs: 58 * 170000, currentStreak: 2, bestStreak: 5 },
      usta: { solved: 31, bestTimeMs: 142000, totalTimeMs: 31 * 260000, currentStreak: 1, bestStreak: 3 },
    },
    // Dün çözülmüş: menüde "serini koru · 12 gün" yazar (bugünkü bulmaca bekliyor).
    daily: { lastDate: dateKey(new Date(Date.now() - 24 * 3600 * 1000)), streak: 12, bestStreak: 12, solvedCount: 12, bestTimeMs: 150000 },
    campaign,
    allowance: 30,
    allowanceLastUpdateMs: Date.now(),
    unlimited: false,
  };
}

// --- Cihaz tanımları -------------------------------------------------------
// Telefon ve tablet görselleri aynı şablondan çıkar; yalnızca oyunun çekildiği
// ekran boyutu ve çerçevenin ölçüleri değişir. Play her ikisinde de 16:9 /
// 9:16 oranı ister (tablet: 10 inç için kısa kenar en az 1080 px).
const DEVICES = {
  phone: {
    viewport: { width: 390, height: 844 }, scale: 2, shot: { width: 1080, height: 1920 },
    capHeight: 262, capPad: "34px 64px 0", fontSize: 70, frameTop: 262,
    inner: { width: 740, height: 1603 }, bezel: 12, radius: 66, innerRadius: 54, camera: true,
    scenes: SCENES, // 8 sahnenin hepsi
    fileTag: "",
  },
  tablet: {
    viewport: { width: 800, height: 1280 }, scale: 1.5, shot: { width: 1440, height: 2560 },
    capHeight: 330, capPad: "40px 90px 0", fontSize: 92, frameTop: 330,
    inner: { width: 1240, height: 1984 }, bezel: 22, radius: 62, innerRadius: 40, camera: false,
    scenes: ["guide", "split", "master", "levels"],
    fileTag: "tab_",
  },
};

// Özellik grafiği (1024x500) metinleri: [üst etiket, slogan]. Marka adı
// "Prizma" her dilde aynı kalır.
const FEATURE_TEXT = {
  tr: ["IŞIN BULMACASI", "Işınları yönlendir, renkleri karıştır, hedefi bul."],
  en: ["BEAM PUZZLE", "Guide the beams, mix the colors, find the target."],
  es: ["ACERTIJO DE LUZ", "Dirige los rayos, mezcla los colores, encuentra el objetivo."],
  fr: ["PUZZLE DE LUMIÈRE", "Guidez les rayons, mélangez les couleurs, trouvez la cible."],
  pt: ["QUEBRA-CABEÇA DE LUZ", "Guie os feixes, misture as cores, encontre o alvo."],
  ru: ["СВЕТОВАЯ ГОЛОВОЛОМКА", "Направляйте лучи, смешивайте цвета, найдите цель."],
  hi: ["प्रकाश पहेली", "किरणों को मोड़ें, रंग मिलाएँ, लक्ष्य खोजें।"],
  ar: ["لغز الضوء", "وجّه الأشعة، امزج الألوان، وأصب الهدف."],
  zh: ["光线解谜", "引导光束，混合颜色，找到目标。"],
  id: ["TEKA-TEKI CAHAYA", "Arahkan sinar, campur warna, temukan target."],
  de: ["LICHTRÄTSEL", "Lenke die Strahlen, mische die Farben, finde das Ziel."],
  ja: ["光のパズル", "ビームを導き、色を混ぜ、ターゲットを見つけよう。"],
  ko: ["빛의 퍼즐", "광선을 이끌고, 색을 섞고, 목표를 찾으세요."],
  it: ["ROMPICAPO DI LUCE", "Guida i raggi, mescola i colori, trova il bersaglio."],
};

const FONT_STACK = `"Sora", "Segoe UI", "Yu Gothic UI", "Malgun Gothic", "Microsoft YaHei UI", "Nirmala UI", "Segoe UI Arabic", sans-serif`;

const browser = await chromium.launch();
let page = null; // o an çekim yapılan cihazın sayfası (boot/dbg/playLevel bunu kullanır)

async function boot(lang, solvedLevels) {
  await page.goto(`${BASE}/index.html`);
  await page.evaluate((s) => localStorage.setItem("prizma_stats_v1", JSON.stringify(s)), saveState(lang, solvedLevels));
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function dbg(fn, ...args) {
  await page.evaluate(([f, a]) => window.__prizmaDebug[f](...a), [fn, args]);
  await page.waitForTimeout(300);
}

// Bir kampanya bölümünü açıp çözer. keepWin=false ise kazanma penceresi
// kapatılır: tahta, ışınlar hedefe ulaşmış hâlde görünür.
async function playLevel(index, keepWin, elapsedMs) {
  await page.evaluate(() => window.__prizmaDebug.setAllowance(30));
  await dbg("gotoCampaign");
  await page.locator(".level-cell").nth(index).click();
  await page.waitForFunction(() => document.getElementById("board-preparing").hidden, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.evaluate((ms) => window.__prizmaDebug.shiftTimer(ms), elapsedMs);
  await page.waitForTimeout(200); // sayaç yeni süreyi ekrana yazsın
  await page.evaluate(() => window.__prizmaDebug.solveCurrent());
  await page.waitForSelector("#win-overlay:not([hidden])", { timeout: 60000 });
  if (!keepWin) await page.evaluate(() => (document.getElementById("win-overlay").hidden = true));
  await page.waitForTimeout(keepWin ? 900 : 500); // ışın/kutlama animasyonu otursun
}

// Bir sahnenin ham ekran görüntüsünü çeker. Oyun sahneleri 60/60 kayıt ister
// (tüm bölümler açık), menü/bölümler/istatistik 23/60 (yolun ortası).
async function captureScenes(lang, scenes) {
  const raw = {};
  const play = scenes.filter((s) => LEVEL_FOR[s] !== undefined);
  const menus = scenes.filter((s) => LEVEL_FOR[s] === undefined);
  if (play.length) {
    await boot(lang, 60);
    for (const scene of play) {
      await playLevel(LEVEL_FOR[scene], scene === "record", ELAPSED_FOR[scene]);
      raw[scene] = await page.screenshot({ type: "png" });
    }
  }
  if (menus.length) {
    await boot(lang, 23);
    const goto = { levels: "gotoCampaign", daily: "gotoMenu", stats: "gotoStats" };
    for (const scene of menus) {
      await dbg(goto[scene]);
      raw[scene] = await page.screenshot({ type: "png" });
    }
  }
  return raw;
}

// Ham ekran görüntüsünü mağaza görseline çevirir (gradyan + başlık + çerçeve).
async function compose(composer, D, rawPng, caption, lang, outFile) {
  const rtl = lang === "ar";
  const frameW = D.inner.width + D.bezel * 2;
  const frameH = D.inner.height + D.bezel * 2;
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap');
    * { box-sizing: border-box; margin: 0; }
    body { width: ${D.shot.width}px; height: ${D.shot.height}px; overflow: hidden; position: relative;
      background: linear-gradient(160deg, #0f7f96 0%, #2a6fb6 46%, #6b49c8 100%); }
    /* zemine hafif ışık: düz gradyan yerine derinlik */
    body::before { content: ""; position: absolute; inset: 0;
      background: radial-gradient(85% 38% at 15% 0%, rgba(64,235,255,.35), transparent 60%),
                  radial-gradient(85% 42% at 100% 100%, rgba(185,140,255,.35), transparent 60%); }
    .cap { position: absolute; top: 0; left: 0; right: 0; height: ${D.capHeight}px; display: flex; align-items: center; justify-content: center; padding: ${D.capPad}; }
    .cap h1 { font-family: ${FONT_STACK};
      width: 100%; font-size: ${D.fontSize}px; font-weight: 800; color: #fff; text-align: center; line-height: 1.16; letter-spacing: -0.5px;
      text-shadow: 0 3px 18px rgba(0,0,0,.28); text-wrap: balance; }
    .frame { position: absolute; left: 50%; top: ${D.frameTop}px; transform: translateX(-50%);
      width: ${frameW}px; height: ${frameH}px; padding: ${D.bezel}px; border-radius: ${D.radius}px; background: #06070b;
      box-shadow: 0 0 0 3px rgba(255,255,255,.30), 0 0 0 4px rgba(0,0,0,.35), 0 40px 90px rgba(3,8,30,.55); }
    .frame img { display: block; width: ${D.inner.width}px; height: ${D.inner.height}px; border-radius: ${D.innerRadius}px; object-fit: cover; }
    .cam { position: absolute; top: 30px; left: 50%; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #06070b; box-shadow: 0 0 0 2px rgba(255,255,255,.06); }
  </style></head><body>
    <div class="cap"><h1 id="h">${caption}</h1></div>
    <div class="frame"><img src="data:image/png;base64,${rawPng.toString("base64")}">${D.camera ? '<div class="cam"></div>' : ""}</div>
  </body></html>`;
  await composer.setContent(html, { waitUntil: "networkidle" });
  await composer.evaluate(() => document.fonts.ready);
  // Başlık en fazla iki satır olsun: yazı tipi YÜKLENDİKTEN sonra ölçülür
  // (önce ölçülürse yedek yazı tipinin genişliğine göre küçültülür).
  await composer.evaluate((start) => {
    const h = document.getElementById("h");
    let size = start;
    const fits = () => h.getBoundingClientRect().height <= size * 1.16 * 2 + 2 && h.scrollWidth <= h.clientWidth + 1;
    while (!fits() && size > start * 0.55) {
      size -= 2;
      h.style.fontSize = size + "px";
    }
  }, D.fontSize);
  await composer.screenshot({ path: outFile, type: "png" });
}

// Özellik grafiği: koyu zemin, solda etiket + "Prizma." + slogan, sağda bir
// kaynaktan çıkıp prizmada üç renge ayrılan ışın. Tasarım, mağazadaki Türkçe
// özellik grafiğinin aynısıdır; yalnızca metin dile göre değişir.
async function composeFeature(composer, lang, outFile) {
  const [label, tagline] = FEATURE_TEXT[lang];
  const rtl = lang === "ar";
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; }
    body { width: 1024px; height: 500px; overflow: hidden; position: relative; background: #080a13;
      font-family: "Inter", "Segoe UI", "Yu Gothic UI", "Malgun Gothic", "Microsoft YaHei UI", "Nirmala UI", "Segoe UI Arabic", Arial, sans-serif; }
    .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
      background-size: 56px 56px; -webkit-mask-image: linear-gradient(90deg, transparent 38%, #000 70%); mask-image: linear-gradient(90deg, transparent 38%, #000 70%); }
    .glow { position: absolute; inset: 0; background: radial-gradient(520px 300px at 22% 50%, rgba(30,40,80,.55), transparent 70%); }
    svg { position: absolute; inset: 0; }
    /* Metin bloğu her dilde SOLDA durur (sağ taraf ışın çizimi). Arapçada yalnızca
       yazı yönü sağdan sola olur; blok yine sola yaslanır, yoksa ışına biner. */
    .txt { position: absolute; left: 72px; top: 148px; width: 470px; text-align: left; }
    .label, .tag { direction: ${rtl ? "rtl" : "ltr"}; }
    /* Büyük/küçük harf ayrımı olmayan yazılarda (CJK, Hintçe, Arapça) etiket
       harf aralığı açılmadan ve biraz daha büyük yazılır; yoksa okunmuyor. */
    .label { color: #5b8def; font-weight: 700; ${/[a-zA-ZА-Яа-я]/.test(label) ? "font-size: 15px; letter-spacing: 3.2px;" : "font-size: 20px; letter-spacing: 1px;"} }
    .name { direction: ltr; color: #f4f5fa; font-size: 94px; font-weight: 800; letter-spacing: -2.5px; line-height: 1; margin-top: 16px; }
    .name span { color: #f5b83d; }
    .tag { color: #b8bccf; font-size: 24px; font-weight: 400; line-height: 1.32; margin-top: 26px; max-width: 380px; text-wrap: balance; word-break: auto-phrase; }
  </style></head><body>
    <div class="glow"></div><div class="grid"></div>
    <svg viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
        <filter id="halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="26"/></filter>
        <linearGradient id="in" x1="0" x2="1"><stop offset="0" stop-color="#8a7a5a"/><stop offset="1" stop-color="#f5b83d"/></linearGradient>
      </defs>
      <circle cx="905" cy="70" r="46" fill="#ffffff" opacity=".42" filter="url(#halo)"/>
      <path d="M760 430 Q 880 300 1010 400" stroke="#6a4fb0" stroke-width="40" fill="none" opacity=".12" filter="url(#halo)"/>
      <g stroke-linecap="round" fill="none">
        <g filter="url(#b)" opacity=".7">
          <line x1="468" y1="257" x2="705" y2="210" stroke="#f5b83d" stroke-width="6"/>
          <line x1="705" y1="210" x2="905" y2="70" stroke="#ff4d5e" stroke-width="6"/>
          <line x1="705" y1="210" x2="940" y2="129" stroke="#3ddc84" stroke-width="6"/>
          <line x1="705" y1="210" x2="960" y2="210" stroke="#4d8bff" stroke-width="6"/>
        </g>
        <line x1="468" y1="257" x2="705" y2="210" stroke="url(#in)" stroke-width="4"/>
        <line x1="705" y1="210" x2="905" y2="70" stroke="#ff5a6a" stroke-width="4"/>
        <line x1="705" y1="210" x2="940" y2="129" stroke="#45e08e" stroke-width="4"/>
        <line x1="705" y1="210" x2="960" y2="210" stroke="#5a96ff" stroke-width="4"/>
      </g>
      <circle cx="467" cy="257" r="22" fill="#f5b83d" opacity=".28" filter="url(#b)"/>
      <circle cx="467" cy="257" r="17" fill="none" stroke="#f5b83d" stroke-width="3" opacity=".9"/>
      <circle cx="467" cy="257" r="6" fill="#d9a23a"/>
      <rect x="690" y="195" width="30" height="30" rx="7" transform="rotate(45 705 210)" fill="#0d1224" stroke="#7fb0ff" stroke-width="3"/>
    </svg>
    <div class="txt">
      <div class="label">${label}</div>
      <div class="name">Prizma<span>.</span></div>
      <div class="tag" id="t">${tagline}</div>
    </div>
  </body></html>`;
  await composer.setContent(html, { waitUntil: "networkidle" });
  await composer.evaluate(() => document.fonts.ready);
  await composer.screenshot({ path: outFile, type: "png" });
}

// Kullanım: node tools/store_screenshots.mjs [phone] [tablet] [feature] [dil kodları...]
// Tür verilmezse üçü de, dil verilmezse 14 dilin hepsi üretilir.
const args = process.argv.slice(2);
const KINDS = ["phone", "tablet", "feature"];
const kinds = args.filter((a) => KINDS.includes(a));
const wantKinds = kinds.length ? kinds : KINDS;
const wanted = args.filter((a) => PLAY_LOCALE[a]);
const langs = wanted.length ? wanted : Object.keys(PLAY_LOCALE);

for (const kind of wantKinds) {
  if (kind === "feature") {
    const composer = await browser.newPage({ viewport: { width: 1024, height: 500 } });
    for (const lang of langs) {
      const dir = path.join(OUT, PLAY_LOCALE[lang]);
      fs.mkdirSync(dir, { recursive: true });
      await composeFeature(composer, lang, path.join(dir, `prizma_${PLAY_LOCALE[lang]}_feature.png`));
    }
    await composer.close();
    console.log(`özellik grafiği: ${langs.length} dil hazır`);
    continue;
  }
  const D = DEVICES[kind];
  const ctx = await browser.newContext({ viewport: D.viewport, deviceScaleFactor: D.scale });
  page = await ctx.newPage();
  const composer = await browser.newPage({ viewport: D.shot });
  for (const lang of langs) {
    const dir = path.join(OUT, PLAY_LOCALE[lang]);
    fs.mkdirSync(dir, { recursive: true });
    const raw = await captureScenes(lang, D.scenes);
    for (let i = 0; i < D.scenes.length; i++) {
      const scene = D.scenes[i];
      const caption = CAPTIONS[lang][SCENES.indexOf(scene)];
      await compose(composer, D, raw[scene], caption, lang, path.join(dir, `prizma_${PLAY_LOCALE[lang]}_${D.fileTag}${i + 1}_${scene}.png`));
    }
    console.log(`${kind.padEnd(6)} ${PLAY_LOCALE[lang].padEnd(7)} ${D.scenes.length} görsel hazır`);
  }
  await composer.close();
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nÇıktı: ${OUT}`);
