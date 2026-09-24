// main.js — ekranlar arası geçişi yöneten "kök". Godot scenes/Main.gd +
// MainMenu.gd + DifficultySelect.gd + Game.gd dosyalarının web karşılığı.

import { initErrorLog, getErrors } from "./errorlog.js";
import { GameState, todayKey, DIFFICULTY_POINTS, DIFFICULTIES, ALLOWANCE_CAP, REWARDED_AD_BONUS, rankKeyForPoints, allowanceCost } from "./gamestate.js";
import { prefetch, takePuzzle, returnPuzzle, isReady, requestSolution, takeDaily, dailyDifficulty, takeSeeded, prefetchSeeded } from "./puzzleService.js";
import { CAMPAIGN_LEVELS, CAMPAIGN_TOTAL } from "./campaignLevels.js";
import { vibrate } from "./haptics.js";
import { ONBOARDING_PUZZLES } from "./onboarding.js";
import { BoardView, setColorBlindMode } from "./board.js";
import { difficultyColor, UI } from "./theme.js";
import { renderLogo } from "./logo.js";
import { unlockAudio, playSfx, setMusicVolume, setSfxVolume, getMusicVolume, getSfxVolume, startMusic, stopMusic } from "./audio.js";
import { refreshDailyNotification } from "./notifications.js";
import { showBanner, hideBanner, showRewardedAd, showAdPreferences } from "./ads.js";
import { initIAP, purchaseUnlimited, onUnlimitedGranted, restorePurchases } from "./iap.js";
import { initLeaderboard, submitTotalScore, showLeaderboard } from "./leaderboard.js";
import { checkAchievements, syncUnlockedAchievements, showAchievements } from "./achievements.js";
import { syncWithCloud, scheduleCloudSave } from "./cloudsave.js";
import { initI18n, t, setLanguage, SUPPORTED_LANGS, LANG_NAMES } from "./i18n.js";

// Yakalanmamış hatalar Logcat'e + cihazdaki küçük bir halkaya yazılır
// (bkz. errorlog.js) — mümkün olan EN ERKEN noktada kurulmalı.
initErrorLog();

// Dil, ilk DOM işleminden ÖNCE belirlenmeli (applyStaticStrings
// ve tüm t() çağrıları buna bağlı). GameState zaten senkron kurulduğu için
// (localStorage'dan) burada da senkron çalışır.
initI18n();

const screens = {
  menu: document.getElementById("screen-menu"),
  settings: document.getElementById("screen-settings"),
  difficulty: document.getElementById("screen-difficulty"),
  campaign: document.getElementById("screen-campaign"),
  stats: document.getElementById("screen-stats"),
  game: document.getElementById("screen-game"),
};

const adBannerSpacer = document.getElementById("ad-banner-spacer");

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].hidden = key !== name;
  }
  // Alt banner reklam: sadece oyun ekranında gösterilir. Web önizlemede/
  // plugin yokken showBanner() sessizce false döner, spacer görünmez kalır
  // (boş boşluk bırakmaz).
  if (name === "game") {
    showBanner().then((ok) => {
      adBannerSpacer.hidden = !ok;
    });
  } else {
    hideBanner();
    adBannerSpacer.hidden = true;
  }
}

// --- Ana Menü -----------------------------------------------------------

document.getElementById("logo-mark").innerHTML = renderLogo();

// --- i18n: sabit metinler + dil seçici ------------------------------------
// data-i18n taşıyan TÜM elemanların metnini o anki dile göre günceller —
// hem başlangıçta hem kullanıcı Ayarlar'dan dil değiştirdiğinde çağrılır.
// Dinamik metinler (buton durumuna göre değişen BAŞLA/OYNA, Sıradaki/Zorluk
// Seç, hak sayacı vb.) burada DEĞİL, kendi refresh*()/loadPuzzle() gibi
// fonksiyonlarında t() ile üretilir (zaten her çağrıldıklarında güncel dili
// okurlar).
function applyStaticStrings() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  const bonusEl = document.getElementById("allowance-watch-ad-bonus");
  if (bonusEl) bonusEl.textContent = t("allowance.watchAdBonus", { n: REWARDED_AD_BONUS });
}

const settingsLanguageSelect = document.getElementById("settings-language");

function populateLanguageSelect() {
  settingsLanguageSelect.innerHTML = "";
  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = t("settings.languageAuto");
  settingsLanguageSelect.appendChild(autoOpt);
  for (const code of SUPPORTED_LANGS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = LANG_NAMES[code]; // dil adları kendi dilinde yazılır (uluslararası standart — çevrilmez)
    settingsLanguageSelect.appendChild(opt);
  }
  settingsLanguageSelect.value = GameState.settings.language || "auto";
}

settingsLanguageSelect.addEventListener("change", () => {
  setLanguage(settingsLanguageSelect.value);
  applyStaticStrings();
  populateLanguageSelect(); // "Otomatik" seçeneğinin metni de yeni dile göre güncellensin
  refreshSettingsUI();
  playSfx("click");
});

applyStaticStrings();
populateLanguageSelect();

function refreshMenu() {
  const done = GameState.onboardingCompleted;
  const playBtn = document.getElementById("btn-play");
  const replayBtn = document.getElementById("btn-egitim");
  const statsBtn = document.getElementById("btn-stats");
  playBtn.textContent = done ? t("menu.play") : t("menu.start");
  replayBtn.hidden = !done;
  statsBtn.hidden = !done; // eğitim bitmeden gösterecek anlamlı bir istatistik yok
  refreshDailyButton();
  refreshCampaignButton();
  refreshAllowanceBadge();
}

// --- Günlük bulmaca --------------------------------------------------------
// Her gün, TARİHTEN türeyen sabit bir tohumla üretilen tek bir bulmaca (bkz.
// puzzleService.js → takeDaily): tüm oyuncularda aynı. Bulmaca hakkı
// TÜKETMEZ ve günde bir kez seriyi (streak) artırır. Çözülmüş olsa da tekrar
// oynanabilir, ama seri yalnızca ilk çözümde artar.
const dailyBtn = document.getElementById("btn-daily");
const dailySubEl = document.getElementById("daily-sub");

function refreshDailyButton() {
  const done = GameState.onboardingCompleted;
  dailyBtn.hidden = !done;
  if (!done) return;
  const solvedToday = GameState.dailySolvedToday();
  const streak = GameState.dailyStreak;
  dailyBtn.classList.toggle("done", solvedToday);
  if (solvedToday) {
    dailySubEl.textContent = streak > 0 ? t("daily.streak", { n: streak }) : t("daily.doneToday");
  } else {
    dailySubEl.textContent = streak > 0 ? t("daily.keepStreak", { n: streak }) : t("daily.today");
  }
}

// --- Bölümler (kampanya) ---------------------------------------------------
// Sabit, sırayla açılan 60 bölüm (bkz. campaignLevels.js). Her bölüm bir
// tohumdan deterministik olarak üretilir, yani tüm oyuncularda aynıdır.
// Bulmaca hakkı sonsuz moddaki AYNI kuralla tüketilir (zorluğa göre 1-3) —
// ekonomi değiştirilmedi.
const campaignBtn = document.getElementById("btn-campaign");
const campaignSubEl = document.getElementById("campaign-sub");
const campaignBackBtn = document.getElementById("campaign-back");
const levelGridEl = document.getElementById("level-grid");
const campaignProgressEl = document.getElementById("campaign-progress");
const campaignTotalEl = document.getElementById("campaign-total");
const campaignDoneOverlay = document.getElementById("campaign-done-overlay");
const campaignDoneSubEl = document.getElementById("campaign-done-sub");
const campaignDoneExtraEl = document.getElementById("campaign-done-extra");
const campaignDoneBurstEl = document.getElementById("campaign-done-burst");
const campaignDoneCloseBtn = document.getElementById("campaign-done-close");
let campaignIndex = 0;

function refreshCampaignButton() {
  const done = GameState.onboardingCompleted;
  campaignBtn.hidden = !done;
  if (!done) return;
  const solved = GameState.campaignSolvedCount;
  campaignSubEl.textContent = t("campaign.progressShort", { n: solved, total: CAMPAIGN_TOTAL });
}

function showCampaign() {
  levelGridEl.innerHTML = "";
  const nextIndex = GameState.nextLevelIndex(CAMPAIGN_TOTAL);
  CAMPAIGN_LEVELS.forEach((level, i) => {
    const solved = GameState.isLevelSolved(i);
    const unlocked = GameState.isLevelUnlocked(i);
    const cell = document.createElement("button");
    cell.className = `level-cell${solved ? " solved" : ""}${unlocked ? "" : " locked"}${i === nextIndex ? " next" : ""}`;
    cell.style.setProperty("--accent", difficultyColor(level.diff));
    const best = GameState.levelBestTime(i);
    cell.innerHTML = `<span>${i + 1}</span>${best >= 0 ? `<span class="level-time">${formatTime(best)}</span>` : ""}`;
    if (!unlocked) {
      cell.disabled = true;
    } else {
      cell.addEventListener("click", () => startCampaignLevel(i));
    }
    levelGridEl.appendChild(cell);
  });
  campaignProgressEl.textContent = t("campaign.progress", { n: GameState.campaignSolvedCount, total: CAMPAIGN_TOTAL });
  // Toplam süre yalnızca en az bir bölüm çözülmüşse anlamlı.
  const totalMs = GameState.campaignTotalTimeMs;
  campaignTotalEl.hidden = totalMs <= 0;
  if (totalMs > 0) campaignTotalEl.textContent = t("campaign.totalTime", { t: formatLongTime(totalMs) });
  refreshAllowanceBadge();
  showScreen("campaign");
  // Sıradaki bölümü şimdiden hazırlat (oyuncu listeye bakarken üretilsin).
  const next = CAMPAIGN_LEVELS[nextIndex];
  if (next) prefetchSeeded(next.diff, next.seed);
}

function startCampaignLevel(index) {
  const level = CAMPAIGN_LEVELS[index];
  if (!level || !GameState.isLevelUnlocked(index)) return;
  const cost = allowanceCost(level.diff);
  if (!GameState.canPlay(cost)) {
    pendingDifficulty = null;
    showAllowanceOverlay();
    return;
  }
  const myRequest = ++startRequestToken;
  campaignIndex = index;
  mode = "campaign";
  difficulty = level.diff;
  setAccent(difficultyColor(level.diff));
  showScreen("game");
  setPreparing(true);
  takeSeeded(level.diff, level.seed).then((puzzle) => {
    if (myRequest !== startRequestToken || mode !== "campaign") return;
    setPreparing(false);
    if (!GameState.canPlay(cost)) {
      showAllowanceOverlay();
      return;
    }
    GameState.consumeAllowance(cost);
    refreshAllowanceBadge();
    GameState.recordPlaySession();
    refreshDailyNotification();
    loadPuzzle(puzzle);
    const next = CAMPAIGN_LEVELS[index + 1];
    if (next) prefetchSeeded(next.diff, next.seed); // sıradakini arka planda hazırla
  });
}

// 60/60 olunca gösterilen kutlama ekranı. Kazanma ekranının aynı panelini
// kullanır (ışık huzmeleri dahil); en iyi sürelerin toplamını gösterir, çünkü
// bütün bölümler bitince oyuncuya kalan tek hedef bu sayıyı düşürmek.
function showCampaignDone() {
  playWinBurst(campaignDoneBurstEl);
  campaignDoneSubEl.textContent = t("campaign.allDone.sub", { total: CAMPAIGN_TOTAL });
  campaignDoneExtraEl.innerHTML = `<span class="tag record">${t("campaign.totalTime", { t: formatLongTime(GameState.campaignTotalTimeMs) })}</span>`;
  campaignDoneOverlay.hidden = false;
}

campaignDoneCloseBtn.addEventListener("click", () => {
  playSfx("click");
  campaignDoneOverlay.hidden = true;
  showCampaign();
});

campaignBtn.addEventListener("click", () => {
  playSfx("click");
  showCampaign();
});

campaignBackBtn.addEventListener("click", () => {
  cancelPendingPuzzle();
  refreshMenu();
  showScreen("menu");
});

dailyBtn.addEventListener("click", async () => {
  playSfx("click");
  const myRequest = ++startRequestToken;
  mode = "daily";
  difficulty = dailyDifficulty(todayKey());
  setAccent(difficultyColor(difficulty));
  showScreen("game");
  setPreparing(true);
  const puzzle = await takeDaily(todayKey());
  if (myRequest !== startRequestToken || mode !== "daily") return;
  setPreparing(false);
  GameState.recordPlaySession();
  loadPuzzle(puzzle);
});

document.getElementById("btn-play").addEventListener("click", () => {
  if (GameState.onboardingCompleted) {
    showDifficultySelect();
  } else {
    startOnboarding(0);
  }
});
document.getElementById("btn-egitim").addEventListener("click", () => startOnboarding(0));

// --- "Ne kadar iyisin?" (istatistikler) ------------------------------------
// Oyna ve eğitimi tekrar oyna butonlarının ortasında yer alan istatistik
// ekranı: oyuncu hangi seviyede kaç bulmacayı ne kadar sürede çözdüğünü
// görür. Her zorluk için çözülen sayısı (görsel çubuk), en iyi süre ve
// ortalama süre gösterir.

const statsSummaryEl = document.getElementById("stats-summary");
const statsListEl = document.getElementById("stats-list");
const statsBackBtn = document.getElementById("stats-back");
const leaderboardBtn = document.getElementById("btn-leaderboard");
const achievementsBtn = document.getElementById("btn-achievements");

function formatStatTime(ms) {
  if (ms == null || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Toplam süre: istatistiklerde en iyi süre yerine toplam süre gösterilir.
// Tek bulmacalık mm:ss'ten farklı olarak saatleri de kapsayabilir, o yüzden
// ayrı bir biçim kullanılıyor.
function formatTotalTime(ms) {
  if (ms == null || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  if (m > 0) return `${m} dk ${s} sn`;
  return `${s} sn`;
}

// Üst özet, ham "toplam çözülen"/"en iyi seri" DEĞİL, PUAN (GameState.totalPoints
// — zorluk başına ağırlıklı) ve o puana göre belirlenen ÜNVAN gösteriyor
// (bkz. gamestate.js → DIFFICULTY_POINTS/rankKeyForPoints).
function refreshStats() {
  const maxSolved = Math.max(1, ...DIFFICULTIES.map((d) => GameState.stats[d]?.solved || 0));
  statsListEl.innerHTML = "";
  for (const diff of DIFFICULTIES) {
    const s = GameState.stats[diff] || { solved: 0, bestTimeMs: -1, totalTimeMs: 0, bestStreak: 0 };
    const pct = Math.round((s.solved / maxSolved) * 100);
    const row = document.createElement("div");
    row.className = "stats-row";
    row.style.setProperty("--accent", difficultyColor(diff));
    row.innerHTML = `
      <div class="stats-row-top">
        <span class="stats-row-label">${t(`difficulty.${diff}`)}</span>
        <span class="stats-row-count">${s.solved} ${t("stats.solvedSuffix")}</span>
      </div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${s.solved > 0 ? Math.max(pct, 6) : 0}%"></div></div>
      <div class="stats-row-bottom">
        <span>${t("stats.totalTime")} <b>${formatTotalTime(s.totalTimeMs)}</b></span>
        <span>${t("stats.average")} <b>${formatStatTime(GameState.averageTimeMs(diff))}</b></span>
      </div>`;
    statsListEl.appendChild(row);
  }
  const totalPoints = GameState.totalPoints();
  const rankName = t(`rank.${rankKeyForPoints(totalPoints)}`);
  statsSummaryEl.innerHTML = `
    <div class="stats-summary-item"><span class="stats-summary-num">${totalPoints}</span><span>${t("stats.points")}</span></div>
    <div class="stats-summary-item"><span class="stats-summary-num-text">${rankName}</span><span>${t("stats.rank")}</span></div>`;
}

document.getElementById("btn-stats").addEventListener("click", () => {
  refreshStats();
  showScreen("stats");
});
statsBackBtn.addEventListener("click", () => {
  refreshMenu();
  showScreen("menu");
});

// Sıralama (Play Games liderlik tablosu) — "Ne kadar iyisin?" ekranının
// üst çubuğunda, geri butonuyla simetrik köşede. Plugin yoksa / henüz Play
// Console tarafında kurulmadıysa showLeaderboard() sessizce false döner,
// bu durumda kullanıcıya kısa bir uyarı gösteriyoruz (buton görünür ama
// "çalışmıyormuş gibi" sessiz kalmasın diye).
leaderboardBtn.addEventListener("click", async () => {
  playSfx("click");
  const ok = await showLeaderboard();
  if (!ok) {
    // Yayın sürümünde kullanıcıya teknik/DEBUG detay ASLA gösterilmez —
    // sadece sade, anlaşılır bir mesaj (teknik hata leaderboard.js'te
    // console.warn ile loglanıyor).
    alert(t("stats.leaderboardUnavailable"));
  }
});

achievementsBtn.addEventListener("click", async () => {
  playSfx("click");
  const ok = await showAchievements();
  if (!ok) alert(t("stats.leaderboardUnavailable"));
});

// --- Ayarlar --------------------------------------------------------------
// Ana ekrandaki ayarlar butonu: müzik ve efekt ses seviyelerini kısma,
// bildirimi kapatma seçeneği ve sınırsız oynama alımına kısayol içerir.

const settingsBackBtn = document.getElementById("settings-back");
const settingsMusicSlider = document.getElementById("settings-music");
const settingsMusicValue = document.getElementById("settings-music-value");
const settingsSfxSlider = document.getElementById("settings-sfx");
const settingsSfxValue = document.getElementById("settings-sfx-value");
const settingsNotifRow = document.getElementById("settings-notif-row");
const settingsVibrationRow = document.getElementById("settings-vibration-row");
const settingsVibrationToggle = document.getElementById("settings-vibration-toggle");
const settingsColorBlindRow = document.getElementById("settings-colorblind-row");
const settingsColorBlindToggle = document.getElementById("settings-colorblind-toggle");
const settingsNotifToggle = document.getElementById("settings-notif-toggle");

// Ses ayarı çubuklarının, ayarlanan seviyeye kadar renkli görünmesi istenir.
// Native <input type="range"> dolgusu tarayıcılar arası tutarlı
// biçimlendirilemediği için, mevcut değer bir CSS değişkenine (--fill)
// yazılıp arka plan bir gradient ile çiziliyor (bkz. style.css → .slider).
function updateSliderFill(slider) {
  const pct = ((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
  slider.style.setProperty("--fill", `${pct}%`);
}

function refreshSettingsUI() {
  const musicPct = Math.round(getMusicVolume() * 100);
  const sfxPct = Math.round(getSfxVolume() * 100);
  settingsMusicSlider.value = String(musicPct);
  settingsMusicValue.textContent = `${musicPct}%`;
  settingsSfxSlider.value = String(sfxPct);
  settingsSfxValue.textContent = `${sfxPct}%`;
  updateSliderFill(settingsMusicSlider);
  updateSliderFill(settingsSfxSlider);
  settingsNotifToggle.classList.toggle("on", GameState.settings.notificationsEnabled);
  settingsVibrationToggle.classList.toggle("on", GameState.settings.vibrationEnabled);
  settingsColorBlindToggle.classList.toggle("on", GameState.settings.colorBlindMode);
  refreshVersionRow();
}

document.getElementById("btn-settings").addEventListener("click", () => {
  refreshSettingsUI();
  showScreen("settings");
});

settingsBackBtn.addEventListener("click", () => {
  refreshMenu();
  showScreen("menu");
});

settingsMusicSlider.addEventListener("input", () => {
  const v = Number(settingsMusicSlider.value) / 100;
  settingsMusicValue.textContent = `${settingsMusicSlider.value}%`;
  updateSliderFill(settingsMusicSlider);
  setMusicVolume(v);
});

settingsSfxSlider.addEventListener("input", () => {
  const v = Number(settingsSfxSlider.value) / 100;
  settingsSfxValue.textContent = `${settingsSfxSlider.value}%`;
  updateSliderFill(settingsSfxSlider);
  setSfxVolume(v);
});

settingsSfxSlider.addEventListener("change", () => playSfx("click"));

// --- Ayarlar: geri yükleme / reklam tercihleri / gizlilik ------------------
// PRIVACY_POLICY_URL boş bırakılırsa satır GİZLENİR. Google Play, reklam ve
// uygulama içi alım içeren uygulamalarda gizlilik politikası bağlantısını
// ZORUNLU tutuyor — buraya Play Console'a girdiğin politika adresinin AYNISI
// yazılmalı.
const PRIVACY_POLICY_URL = "https://fmjapps.github.io/privacy/prizma/";

// --- Sürüm bilgisi ---------------------------------------------------------
// Değer native taraftan okunur (Capacitor App plugin → getInfo): version =
// build.gradle'daki versionName, build = versionCode. Web önizlemede plugin
// yok, satır gizli kalır — elle yazılan bir sürüm numarası TUTULMAZ, böylece
// kodla APK arasında tutarsızlık olamaz.
const settingsVersionRow = document.getElementById("settings-version-row");
const settingsVersionValue = document.getElementById("settings-version-value");

async function refreshVersionRow() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  if (!plugins || !plugins.App || !plugins.App.getInfo) return;
  try {
    const info = await plugins.App.getInfo();
    if (!info || !info.version) return;
    settingsVersionValue.textContent = info.build ? `${info.version} (${info.build})` : info.version;
    settingsVersionRow.hidden = false;
  } catch (e) {
    console.warn("main.js: sürüm bilgisi alınamadı", e);
  }
}

const settingsRestoreBtn = document.getElementById("settings-restore");
const settingsAdPrefsBtn = document.getElementById("settings-ad-prefs");
const settingsPrivacyBtn = document.getElementById("settings-privacy");

if (PRIVACY_POLICY_URL) {
  settingsPrivacyBtn.hidden = false;
  settingsPrivacyBtn.addEventListener("click", () => {
    playSfx("click");
    // Capacitor'da target="_blank" bağlantılar sistem tarayıcısında açılır.
    window.open(PRIVACY_POLICY_URL, "_blank");
  });
}

settingsRestoreBtn.addEventListener("click", async () => {
  playSfx("click");
  settingsRestoreBtn.disabled = true;
  const result = await restorePurchases();
  settingsRestoreBtn.disabled = false;
  if (result === true) {
    refreshAllowanceBadge();
    refreshSettingsUI();
    refreshDailyNotification();
    alert(t("settings.restoreOk"));
  } else if (result === false) {
    alert(t("settings.restoreNone"));
  } else {
    alert(t("settings.restoreUnavailable"));
  }
});

settingsAdPrefsBtn.addEventListener("click", async () => {
  playSfx("click");
  settingsAdPrefsBtn.disabled = true;
  const shown = await showAdPreferences();
  settingsAdPrefsBtn.disabled = false;
  if (!shown) alert(t("settings.adPrefsUnavailable"));
});

settingsVibrationRow.addEventListener("click", () => {
  const next = !GameState.settings.vibrationEnabled;
  GameState.updateSettings({ vibrationEnabled: next });
  settingsVibrationToggle.classList.toggle("on", next);
  playSfx("click");
  if (next) vibrate("place"); // açıldığında hemen hissedilsin
});

settingsColorBlindRow.addEventListener("click", () => {
  const next = !GameState.settings.colorBlindMode;
  GameState.updateSettings({ colorBlindMode: next });
  settingsColorBlindToggle.classList.toggle("on", next);
  setColorBlindMode(next);
  playSfx("click");
});

settingsNotifRow.addEventListener("click", () => {
  const next = !GameState.settings.notificationsEnabled;
  GameState.updateSettings({ notificationsEnabled: next });
  settingsNotifToggle.classList.toggle("on", next);
  refreshDailyNotification();
  playSfx("click");
});

// --- Zorluk Seçimi --------------------------------------------------------

// Zorluk kartlarındaki mekanik simgeleri (tahtadaki çizimlerin sade hâli).
const MECH_ICONS = {
  mirror: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 13 13 3"/></svg>`,
  portal: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6" stroke-dasharray="3 2.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>`,
  splitter: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 3 13 8 8 13 3 8Z"/><path d="M5.5 5.5 10.5 10.5"/></svg>`,
  blind: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z"/><circle cx="8" cy="8" r="1.8"/><path d="M3 13 13 3"/></svg>`,
};
// Hangi zorlukta hangi mekaniklerin çıkabildiği (bkz. generator.js → TIER_CONFIG).
const DIFFICULTY_MECHS = {
  kolay: ["mirror"],
  orta: ["mirror", "portal", "splitter"],
  zor: ["mirror", "portal", "splitter", "blind"],
  usta: ["mirror", "portal", "splitter", "blind"],
};

function showDifficultySelect() {
  const container = document.getElementById("diff-buttons");
  container.innerHTML = "";
  for (const diff of DIFFICULTIES) {
    const st = GameState.stats[diff] || {};
    const solved = st.solved || 0;
    const best = st.bestTimeMs > 0 ? t("difficulty.best", { t: formatTime(st.bestTimeMs) }) : "";
    const mechs = DIFFICULTY_MECHS[diff]
      .map((m) => `<span class="mech" title="${t(`mech.${m}`)}" aria-label="${t(`mech.${m}`)}">${MECH_ICONS[m]}</span>`)
      .join("");
    const btn = document.createElement("button");
    btn.className = "btn diff-btn";
    btn.style.setProperty("--accent", difficultyColor(diff));
    btn.innerHTML = `<span class="diff-left"><span>${t(`difficulty.${diff}`)}</span><span class="mechs">${mechs}</span></span>
      <span class="diff-right"><span class="count">${t("difficulty.solved", { n: solved })}</span>${best ? `<span class="count">${best}</span>` : ""}</span>`;
    btn.addEventListener("click", () => startEndless(diff));
    container.appendChild(btn);
    prefetch(diff); // zaten hazır/hazırlanıyorsa no-op
  }
  refreshAllowanceBadge();
  showScreen("difficulty");
}

const diffBackBtn = document.getElementById("diff-back");
diffBackBtn.addEventListener("click", () => {
  refreshMenu();
  showScreen("menu");
});

// --- Günlük bulmaca hakkı ekonomisi ----------------------------------------
// Günlük bulmaca hakkı ALLOWANCE_CAP kadardır, 24 saate bölünüp sürekli
// dolar; reklam izleme başına REWARDED_AD_BONUS hak, tek seferlik satın
// alımla sınırsız oyna seçeneği vardır. Sadece SONSUZ MOD bulmacaları hak
// tüketir — eğitim (onboarding) her zaman ücretsizdir.

// Hak rozeti hem ana menüde hem Zorluk Seç ekranında sağ üstte gösterilir
// (İKİ rozet var), ikisi de aynı overlay'i açar ve aynı anda güncellenir
// (bkz. refreshAllowanceBadge).
const allowanceBadge = document.getElementById("allowance-badge");
const allowanceBadgeNum = document.getElementById("allowance-badge-num");
const allowanceBadgeMax = document.getElementById("allowance-badge-max");
const allowanceBadgeMenu = document.getElementById("allowance-badge-menu");
const allowanceBadgeNumMenu = document.getElementById("allowance-badge-num-menu");
const allowanceBadgeMaxMenu = document.getElementById("allowance-badge-max-menu");
const allowanceBadgeCampaign = document.getElementById("allowance-badge-campaign");
const allowanceBadgeNumCampaign = document.getElementById("allowance-badge-num-campaign");
const allowanceBadgeMaxCampaign = document.getElementById("allowance-badge-max-campaign");
const allowanceOverlay = document.getElementById("allowance-overlay");
const allowanceTitle = document.getElementById("allowance-title");
const allowanceModalCount = document.getElementById("allowance-modal-count");
const allowanceNextText = document.getElementById("allowance-next-text");
const allowanceWatchAdBtn = document.getElementById("allowance-watch-ad");
const allowanceBuyUnlimitedBtn = document.getElementById("allowance-buy-unlimited");
const allowanceCancelBtn = document.getElementById("allowance-cancel");

let pendingDifficulty = null;

function refreshAllowanceBadge() {
  const unlimited = GameState.unlimited;
  const num = unlimited ? "∞" : String(GameState.remainingAllowance);
  const max = unlimited ? "" : `/${ALLOWANCE_CAP}`;
  allowanceBadgeNum.textContent = num;
  allowanceBadgeMax.textContent = max;
  allowanceBadgeNumMenu.textContent = num;
  allowanceBadgeMaxMenu.textContent = max;
  allowanceBadgeNumCampaign.textContent = num;
  allowanceBadgeMaxCampaign.textContent = max;
}

function formatDuration(ms) {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} dk`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

// Sağ üstteki hak rozetine tıklayınca açılan pop-up: reklam izleyerek hak
// yenileme butonu ve satın alımla sınırsız hak alma butonu içerir. Aynı
// overlay İKİ şekilde açılabilir:
//  1) Hak biterken bulmaca başlatma denemesi (pendingDifficulty set edilir,
//     ad/satın alma sonrası otomatik devam eder) — eski davranış.
//  2) Rozet butonuna DOĞRUDAN dokunuşla, hak bitmemiş olsa bile (proaktif) —
//     pendingDifficulty null kalır, sadece bilgi/aksiyon amaçlı.
// Başlık ve buton görünürlüğü duruma göre uyarlanır.
function showAllowanceOverlay() {
  const ms = GameState.msUntilNextAllowance();
  allowanceNextText.textContent = ms > 0 ? t("allowance.subWaitNext", { d: formatDuration(ms) }) : t("allowance.subSoon");
  if (GameState.unlimited) {
    allowanceTitle.textContent = t("allowance.titleUnlimited");
    allowanceNextText.textContent = t("allowance.subUnlimited");
    allowanceModalCount.innerHTML = "∞";
    allowanceWatchAdBtn.hidden = true;
    allowanceBuyUnlimitedBtn.hidden = true;
  } else {
    allowanceTitle.textContent = GameState.remainingAllowance > 0 ? t("allowance.titleExtra") : t("allowance.titleOut");
    allowanceModalCount.innerHTML = `${GameState.remainingAllowance}<span>/${ALLOWANCE_CAP}</span>`;
    allowanceWatchAdBtn.hidden = false;
    allowanceBuyUnlimitedBtn.hidden = false;
  }
  allowanceOverlay.hidden = false;
}

allowanceBadge.addEventListener("click", () => {
  playSfx("click");
  showAllowanceOverlay();
});
allowanceBadgeMenu.addEventListener("click", () => {
  playSfx("click");
  showAllowanceOverlay();
});

function hideAllowanceOverlay() {
  allowanceOverlay.hidden = true;
}

allowanceWatchAdBtn.addEventListener("click", async () => {
  allowanceWatchAdBtn.disabled = true;
  const rewarded = await showRewardedAd();
  allowanceWatchAdBtn.disabled = false;
  if (rewarded) {
    GameState.addAllowance(REWARDED_AD_BONUS);
    refreshAllowanceBadge();
    refreshDailyNotification(); // hak durumu değişti — "tam dolma" bildirimi yeniden hesaplanmalı
    hideAllowanceOverlay();
    if (pendingDifficulty) {
      const diff = pendingDifficulty;
      pendingDifficulty = null;
      startEndless(diff);
    }
  } else {
    allowanceNextText.textContent = t("allowance.subAdFailed");
  }
});

allowanceBuyUnlimitedBtn.addEventListener("click", () => {
  playSfx("click");
  const started = purchaseUnlimited();
  if (started) {
    // Sipariş Google Play'in kendi ödeme arayüzüne devrediliyor — o yüzden
    // paneli kapatıyoruz, onay/owned geri çağrıları (bkz. iap.js) ne zaman
    // gerçekten sınırsız olunduğunu ayrıca bildirecek.
    hideAllowanceOverlay();
  } else {
    // Sipariş DAHA BAŞLAMADAN (plugin yok / ürün henüz bulunamadı vb.)
    // başarısız oldu — panel açık kalır, kullanıcıya sade bir uyarı
    // gösterilir (ham teknik detay YOK, bkz. iap.js konsol günlükleri).
    alert(t("allowance.buyUnavailable"));
  }
});

allowanceCancelBtn.addEventListener("click", () => {
  pendingDifficulty = null;
  hideAllowanceOverlay();
  if (mode === "endless") showDifficultySelect();
});

// Yeni bir sonsuz-mod bulmacası başlatmayı DENER: hak varsa tüketir ve
// bulmacayı yükler, yoksa hak overlay'ini gösterip false döner.
//
// Bulmaca arka planda (Web Worker, bkz. puzzleService.js) üretilir; çoğu
// zaman önceden hazırdır ve anında gelir. Hazır değilse tahtada kısa bir
// "Hazırlanıyor…" durumu gösterilir. Hak, bulmaca GERÇEKTEN geldiğinde
// düşülür — oyuncu beklerken geri çıkarsa hak kaybetmez, gelen bulmaca da
// depoya iade edilir (startRequestToken ile bayat istekler ayıklanır).
let startRequestToken = 0;

function tryStartEndlessPuzzle(diff) {
  const cost = allowanceCost(diff);
  if (!GameState.canPlay(cost)) {
    pendingDifficulty = diff;
    showAllowanceOverlay();
    return false;
  }
  const myRequest = ++startRequestToken;
  if (!isReady(diff)) setPreparing(true);
  takePuzzle(diff).then((puzzle) => {
    if (myRequest !== startRequestToken || mode !== "endless" || difficulty !== diff) {
      returnPuzzle(diff, puzzle);
      return;
    }
    setPreparing(false);
    if (!GameState.canPlay(cost)) {
      returnPuzzle(diff, puzzle);
      pendingDifficulty = diff;
      showAllowanceOverlay();
      return;
    }
    GameState.consumeAllowance(cost);
    refreshAllowanceBadge();
    GameState.recordPlaySession();
    refreshDailyNotification();
    loadPuzzle(puzzle);
    prefetch(diff); // oyuncu bunu çözerken sıradaki hazırlanır
  });
  return true;
}

// Bekleyen bir bulmaca isteğini geçersiz kılar (geri çıkma, eğitime geçiş).
function cancelPendingPuzzle() {
  startRequestToken++;
  setPreparing(false);
}

// --- Oyun ekranı ----------------------------------------------------------

const boardFrame = document.getElementById("board-frame");
const board = new BoardView(boardFrame);

const gameTitleEl = document.getElementById("game-title");
const gameTimerEl = document.getElementById("game-timer");
const gameTutorialEl = document.getElementById("game-tutorial");
const gameHintEl = document.getElementById("game-hint");
const winOverlayEl = document.getElementById("win-overlay");
const winTimeEl = document.getElementById("win-time");
const winExtraEl = document.getElementById("win-extra");
const winBurstEl = document.getElementById("win-burst");
const winNextBtn = document.getElementById("win-next");
const winPanelEl = document.getElementById("win-panel");
const boardFrameEl = document.getElementById("board-frame");
const gameBackBtn = document.getElementById("game-back");
const gameResetBtn = document.getElementById("game-reset");
const gameUndoBtn = document.getElementById("game-undo");
const gameHintBtn = document.getElementById("game-hintbtn");
const gameFireBtn = document.getElementById("game-fire");
const failToastEl = document.getElementById("fail-toast");
const boardPreparingEl = document.getElementById("board-preparing");

// Bulmaca arka planda hazırlanırken tahtayı gizleyip "Hazırlanıyor…"
// gösterir; eski bulmacayla etkileşimi ve süreyi durdurur.
function setPreparing(on) {
  boardFrameEl.classList.toggle("is-preparing", on);
  boardPreparingEl.hidden = !on;
  gameResetBtn.disabled = on;
  gameFireBtn.disabled = on;
  if (on) {
    if (mode === "endless") setGameTitle(t(`difficulty.${difficulty}`), true);
    gameTutorialEl.hidden = true;
    gameFireBtn.hidden = true;
    gameUndoBtn.disabled = true;
    gameHintBtn.hidden = true;
    gameHintEl.textContent = "";
    winOverlayEl.hidden = true;
    hideFailToast();
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerRaf = null;
    gameTimerEl.textContent = "00:00";
  }
}

// "Işını Çalıştır" (kör yerleştirme) sadece zorluk artırmak için kullanılan bir
// mekanik — portallar gibi belirli bantlara özgü, oyunun genel mekaniği DEĞİL.
// Sonsuz modda SADECE Zor/Usta'da VE sadece generate()'in "özel tur" olarak
// işaretlediği (puzzle.blindMode===true) bulmacalarda devreye girer — artık
// her turda değil (Usta'da ~10 turun 8'i, Zor'da ~10 turun 6'sı, bkz.
// generator.js → TIER_CONFIG.specialChance). Diğer turlar + Kolay/Orta +
// normal eğitim bulmacaları canlı simülasyona (orijinal davranış) döner.

let mode = "onboarding"; // "onboarding" | "endless"
let difficulty = "kolay";
let onboardingIndex = 0;
let startTimeMs = 0;
let solvedThisPuzzle = false;
let currentPuzzle = null; // ipucu çözümü için (bkz. giveHint)
let freeHintUsed = false; // bulmaca başına ilk ipucu ücretsiz (bkz. giveHint)
let timerRaf = null;
let failToastTimeout = null;

function setAccent(hex) {
  boardFrameEl.style.setProperty("--accent", hex);
  winPanelEl.style.setProperty("--accent", hex);
  winNextBtn.style.setProperty("--accent", hex);
  gameTitleEl.style.setProperty("--accent", hex);
  gameTitleEl.style.color = hex; // düz başlık modunda (rozet değilken, eğitimde) metin rengi
}

// Sonsuz moddaki zorluk etiketi (ör. "USTA") düz metin değil, kendi
// rengiyle uyumlu bir "rozet/chip" olarak gösterilir (bkz. style.css
// .difficulty-badge). Eğitim başlıkları (ör. "Portal") rozet KULLANMAZ, düz
// başlık olarak kalır.
function setGameTitle(text, isDifficultyBadge) {
  gameTitleEl.textContent = "";
  if (isDifficultyBadge) {
    const badge = document.createElement("span");
    badge.className = "difficulty-badge";
    badge.textContent = text;
    gameTitleEl.appendChild(badge);
  } else {
    gameTitleEl.textContent = text;
  }
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Uzun süreler için (kampanyanın toplam süresi kolayca saatleri bulur).
// formatTime tek bulmaca içindir; 60 bölümün toplamında "184:07" gibi
// okunmayan bir sayı üretirdi.
function formatLongTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  if (h <= 0) return formatTime(ms);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function tickTimer() {
  if (solvedThisPuzzle) return;
  gameTimerEl.textContent = formatTime(performance.now() - startTimeMs);
  timerRaf = requestAnimationFrame(tickTimer);
}

function hideFailToast() {
  failToastEl.hidden = true;
  if (failToastTimeout) {
    clearTimeout(failToastTimeout);
    failToastTimeout = null;
  }
}

function showFailToast() {
  failToastEl.hidden = false;
  if (failToastTimeout) clearTimeout(failToastTimeout);
  failToastTimeout = setTimeout(() => {
    failToastEl.hidden = true;
    failToastTimeout = null;
  }, 1400);
}

let pendingAutoSolveTimeout = null;
let loadToken = 0; // her loadPuzzle çağrısında artar; gecikmeli geri çağrıların bayatlamasını önler

function loadPuzzle(puzzle) {
  loadToken += 1;
  const myToken = loadToken;
  if (pendingAutoSolveTimeout) {
    clearTimeout(pendingAutoSolveTimeout);
    pendingAutoSolveTimeout = null;
  }
  solvedThisPuzzle = false;
  currentPuzzle = puzzle;
  freeHintUsed = false;
  winOverlayEl.hidden = true;
  hideFailToast();
  startTimeMs = performance.now();
  if (mode === "onboarding") {
    setGameTitle(t(puzzle.titleKey), false);
    gameTutorialEl.textContent = t(puzzle.tutorialKey);
    gameTutorialEl.hidden = false;
  } else if (mode === "campaign") {
    setGameTitle(t("campaign.levelTitle", { n: campaignIndex + 1 }), false);
    gameTutorialEl.textContent = t(`difficulty.${difficulty}`);
    gameTutorialEl.hidden = false;
  } else if (mode === "daily") {
    // Günlük bulmacada başlık zorluk rozeti DEĞİL, "Günlük Bulmaca" —
    // altında o günkü zorluk ayrıca yazıyor.
    setGameTitle(t("menu.daily"), false);
    gameTutorialEl.textContent = t("daily.todayIs", { d: t(`difficulty.${difficulty}`) });
    gameTutorialEl.hidden = false;
  } else {
    setGameTitle(t(`difficulty.${difficulty}`), true);
    gameTutorialEl.hidden = true;
  }
  const blind = mode === "onboarding" ? puzzle.blindDemo === true : puzzle.blindMode === true;
  gameFireBtn.hidden = !blind;
  // Canlı moddaki yavaş "belirme" animasyonu TAMAMEN kaldırıldı (bkz.
  // board.js dosya başı notu) — artık eğitim de sonsuz mod Kolay/Orta ile
  // aynı: her zaman anında güncellenir.
  // Oyun içinde (eğitimdeki değil) ışın çalıştır mekaniğinin olduğu
  // bölümlerde hız kasıtlı olarak yavaşlatılmıştır: gameplayFire SADECE
  // mode==="endless" (gerçek Zor/Usta bölümü) olduğunda true — eğitim
  // (onboarding, mode==="onboarding") her zaman eski/hızlı REVEAL_MS'de kalır
  // (bkz. board.js → REVEAL_MS_GAMEPLAY notu).
  // Eğitimdeki CANLI mod bulmacalarında (Işını Çalıştır'lı KÖR mod tanıtımı
  // HARİÇ, o zaten blind=true) ışın yavaşça beliriyor — onboardingReveal
  // SADECE mode==="onboarding" olduğunda true; sonsuz mod (Kolay/Orta dahil)
  // bundan ETKİLENMİYOR (bkz. board.js → LIVE_REVEAL_MS_ONBOARDING notu).
  board.setPuzzle(puzzle, { blind, gameplayFire: mode !== "onboarding", onboardingReveal: mode === "onboarding" });
  // İpucu yalnızca gerçek bölümlerde (eğitimde zaten yönlendirme var).
  gameHintBtn.hidden = mode === "onboarding";
  gameUndoBtn.disabled = true;
  // 0 ayna gereken "sadece izle" bulmacalar (Portal/Prizma Bloğu tanıtımı gibi)
  // canlı modda YÜKLENİR YÜKLENMEZ zaten çözülü olabilir — board.js bunun için
  // onChange'i BİLEREK senkron çağırmıyor (bkz. board.js → setPuzzle notu).
  // Kazanma ekranı kısa bir gecikmeyle gösterilir: oyuncu önce bağlanan
  // ışını bir an görsün, sonra "Çözüldü!" gelsin — anında gelmesi, oyuncunun
  // önceki adımları takip edememesine yol açıyordu.
  if (!blind && board.isSolved) {
    pendingAutoSolveTimeout = setTimeout(() => {
      pendingAutoSolveTimeout = null;
      if (myToken === loadToken && !solvedThisPuzzle) onSolved();
    }, 700);
  }
  if (timerRaf) cancelAnimationFrame(timerRaf);
  timerRaf = requestAnimationFrame(tickTimer);
}

// Canlı modda her ayna değişiminde, kör modda sadece "Işını Çalıştır"
// sonrasında çağrılır. meta.fired: kör moddaki fire() sonucu mu (false ise
// yanlış sonuç için uyarı gösterilir), yoksa canlı moddaki anlık bir
// güncelleme mi (yanlışsa sessizce beklenir, oyuncu düzeltmeye devam eder).
board.onChange = (isSolved, meta) => {
  if (isSolved) {
    if (!solvedThisPuzzle) onSolved();
  } else if (meta && meta.fired) {
    showFailToast();
    playSfx("fail");
    vibrate("fail");
    refreshUndoButton();
  }
};

// Ayna hakkı sayacı: yerleştirdikçe azalır, sıfırlanınca/aynalar kaldırılınca artar.
board.onAllowanceChange = (remaining) => {
  gameHintEl.textContent = t("game.hint", { n: remaining });
};

// Ayna ekleme/çıkarma sesi.
board.onPlace = (added) => {
  playSfx(added ? "place" : "remove");
  vibrate(added ? "place" : "remove");
  refreshUndoButton();
};

// Kazanma ekranındaki kutlama: panelin ortasından dışa açılan renkli ışık
// huzmeleri (prizma teması). Her çözümde yeniden kurulur ki animasyon
// baştan oynasın.
function playWinBurst(target = winBurstEl) {
  const colors = ["#FF5C7A", "#FFC94B", "#3DDC97", "#4D8BFF", "#B98CFF", "#40EBFF"];
  target.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const angle = (360 / 12) * i + (i % 2 ? 7 : -7);
    const color = colors[i % colors.length];
    const delay = (i % 4) * 40;
    return `<span style="--a:${angle}deg;background:${color};animation-delay:${delay}ms"></span>`;
  }).join("");
}

// Kazanma ekranındaki "bu çözüm ne kazandırdı" satırı.
function setWinTags(tags) {
  const list = tags.filter(Boolean);
  winExtraEl.hidden = list.length === 0;
  winExtraEl.innerHTML = list.map((tag) => `<span class="tag${tag.record ? " record" : ""}">${tag.text}</span>`).join("");
}

function onSolved() {
  solvedThisPuzzle = true;
  playSfx("solve");
  vibrate("solve");
  playWinBurst();
  const elapsed = performance.now() - startTimeMs;
  const tags = [];
  if (mode === "daily") {
    const firstToday = !GameState.dailySolvedToday();
    GameState.recordDailySolve(elapsed);
    refreshDailyButton();
    if (firstToday) submitTotalScore(GameState.totalPoints());
    const streak = GameState.dailyStreak;
    if (streak > 0) tags.push({ text: t("daily.streak", { n: streak }) });
  }
  if (mode === "campaign") {
    const prevBest = GameState.levelBestTime(campaignIndex);
    GameState.recordLevelSolve(campaignIndex, elapsed);
    refreshCampaignButton();
    if (prevBest < 0) {
      tags.push({ text: t("campaign.firstClear"), record: true });
    } else if (elapsed < prevBest) {
      tags.push({ text: t("win.newRecord", { t: formatTime(prevBest - elapsed) }), record: true });
    }
    tags.push({ text: t("campaign.levelOf", { n: campaignIndex + 1, total: CAMPAIGN_TOTAL }) });
  }
  if (mode === "endless") {
    // Rekor karşılaştırması kayıttan ÖNCE alınmalı (recordSolve en iyiyi
    // günceller, sonra bakarsak fark her zaman 0 çıkardı).
    const prevBest = GameState.stats[difficulty]?.bestTimeMs ?? -1;
    const points = DIFFICULTY_POINTS[difficulty] || 0;
    if (points > 0) tags.push({ text: t("win.points", { n: points }) });
    if (prevBest < 0) {
      tags.push({ text: t("win.firstSolve"), record: true });
    } else if (elapsed < prevBest) {
      tags.push({ text: t("win.newRecord", { t: formatTime(prevBest - elapsed) }), record: true });
    } else {
      tags.push({ text: t("win.behindBest", { t: formatTime(elapsed - prevBest) }) });
    }
    GameState.recordSolve(difficulty, Math.round(elapsed));
    // Fire-and-forget — skor gönderimi oyunun akışını bloklamaz/geciktirmez,
    // giriş yapılmadıysa veya plugin yoksa leaderboard.js sessizce no-op yapar.
    // DEBUG alert() kaldırıldı — native taraf artık submitScoreImmediate()
    // yerine submitScore() kullanıyor (bkz. PlayGamesPlugin.java'daki KALICI
    // DÜZELTME notu), yani her zaman "success" dönüyor ve senkron doğrulama
    // zaten mümkün değil; her çözümde bir uyarı göstermenin bir faydası yok.
    submitTotalScore(GameState.totalPoints());
  }
  winTimeEl.textContent = t("game.time", { t: formatTime(elapsed) });
  // Eğitimin son bölümü bitince bu butona basınca DOĞRUDAN Zorluk Seç'e
  // gidilmiyor (önce "Eğitim Tamamlandı!" ekranı geliyor, bkz. aşağıdaki
  // winNextBtn click handler) — bu yüzden butonun "Zorluk Seç" yazması
  // yanıltıcıydı. Son eğitim bulmacasında artık t("win.continue")="Devam Et".
  const hasNextOnboarding = mode === "onboarding" && onboardingIndex + 1 < ONBOARDING_PUZZLES.length;
  winNextBtn.textContent =
    mode === "endless" || hasNextOnboarding || (mode === "campaign" && campaignIndex + 1 < CAMPAIGN_TOTAL)
      ? t("win.next")
      : t("win.continue");
  // Başarılar ve bulut kaydı oyun akışını bloklamaz (await edilmiyor).
  checkAchievements();
  scheduleCloudSave();
  setWinTags(tags);
  winOverlayEl.hidden = false;
}

gameResetBtn.addEventListener("click", () => {
  playSfx("click");
  hideFailToast();
  board.resetMirrors();
  refreshUndoButton();
});

// --- Geri Al ---------------------------------------------------------------
function refreshUndoButton() {
  gameUndoBtn.disabled = !board.canUndo;
}

gameUndoBtn.addEventListener("click", () => {
  playSfx("click");
  hideFailToast();
  if (board.undo()) vibrate("remove");
  refreshUndoButton();
});

// --- İpucu -----------------------------------------------------------------
// Bulmaca başına İLK ipucu ücretsiz; sonrakiler ödüllü reklam karşılığı.
// Çözüm arka planda (worker) aranır — Usta'da saniyeler sürebilir, bu yüzden
// buton o sırada "aranıyor" durumuna geçer.
let hintBusy = false;

// Çözümdeki, tahtada henüz doğru tipte olmayan İLK aynayı koyar.
function placeNextHintMirror(solution) {
  for (const [key, type] of solution) {
    if (board.mirrorPlacements.get(key) !== type) {
      board.applyHintMirror(key, type);
      playSfx("place");
      vibrate("place");
      refreshUndoButton();
      return true;
    }
  }
  alert(t("game.hintNothing"));
  return false;
}

async function giveHint() {
  const puzzle = currentPuzzle;
  if (!puzzle || hintBusy) return false;

  // 1) HIZLI YOL — üreticinin kendi çözümü bulmacayla birlikte geliyor (bkz.
  // generator.js → p.solution). Oyuncunun koyduğu aynaların HEPSİ bu çözüme
  // uyuyorsa (ya da tahta boşsa) ipucu ANINDA verilir, arama yapılmaz.
  // Eskiden her ipucu için sıfırdan tam çözüm aranıyordu; Usta'da bu 10-40
  // saniye sürebildiği için süre sınırına takılıp "bulmaca çok karmaşık"
  // hatası veriyordu.
  const stored = puzzle.solution ? new Map(puzzle.solution) : null;
  const onTrack = stored && [...board.mirrorPlacements].every(([key, type]) => stored.get(key) === type);
  if (stored && onTrack) return placeNextHintMirror(stored);

  // 2) Oyuncu üreticininkinden FARKLI (ama geçerli olabilecek) bir yol
  // kurmuş: mevcut aynaları KORUYAN bir çözüm aranır (arka planda, kısa
  // süre sınırıyla — bkz. generator.worker.js).
  hintBusy = true;
  const label = gameHintBtn.textContent;
  gameHintBtn.disabled = true;
  gameHintBtn.textContent = t("game.hintSearching");
  const { solution } = await requestSolution(puzzle, new Map(board.mirrorPlacements));
  gameHintBtn.textContent = label;
  gameHintBtn.disabled = false;
  hintBusy = false;
  if (solution) return placeNextHintMirror(solution);

  // 3) Oyuncunun aynalarıyla çözüm yok (ya da arama süreye takıldı):
  // üreticinin çözümüne dönmek için tahtanın sıfırlanması gerekiyor.
  if (!stored) {
    alert(t("game.hintUnavailable"));
    return false;
  }
  if (!confirm(t("game.hintResetAsk"))) return false;
  board.resetMirrors();
  return placeNextHintMirror(stored);
}

gameHintBtn.addEventListener("click", async () => {
  playSfx("click");
  if (mode === "onboarding") return; // eğitimde ipucuya gerek yok
  if (!freeHintUsed) {
    const ok = await giveHint();
    if (ok) freeHintUsed = true;
    return;
  }
  if (!confirm(t("game.hintAdAsk"))) return;
  const rewarded = await showRewardedAd();
  if (!rewarded) {
    alert(t("allowance.subAdFailed"));
    return;
  }
  await giveHint();
});
gameFireBtn.addEventListener("click", () => {
  playSfx("fire");
  board.fire();
});

// Son eğitim bulmacası çözülünce doğrudan mod seçimine geçmek yerine önce
// eğitimin başarıyla bittiğini bildiren bir tebrik ekranı gösterilir —
// DOĞRUDAN showDifficultySelect() ÇAĞRILMIYOR, oradaki "OYNA" butonu Zorluk
// Seç'e yönlendiriyor (bkz. onboardingDonePlayBtn altında).
const onboardingDoneOverlay = document.getElementById("onboarding-done-overlay");
const onboardingDonePlayBtn = document.getElementById("onboarding-done-play");

winNextBtn.addEventListener("click", () => {
  winOverlayEl.hidden = true;
  if (mode === "campaign") {
    const next = campaignIndex + 1;
    if (next < CAMPAIGN_TOTAL) {
      startCampaignLevel(next);
    } else if (GameState.campaignAllSolved(CAMPAIGN_TOTAL)) {
      // Son bölüm çözüldü VE aradaki hiçbir bölüm atlanmadı — kutlama ekranı.
      showCampaignDone();
    } else {
      showCampaign(); // listeye dön (arada çözülmemiş bölüm kalmış)
    }
    return;
  }
  if (mode === "daily") {
    // Günlük bulmaca günde bir tane — çözünce menüye dönülür.
    refreshMenu();
    showScreen("menu");
    return;
  }
  if (mode === "onboarding") {
    onboardingIndex += 1;
    if (onboardingIndex >= ONBOARDING_PUZZLES.length) {
      GameState.markOnboardingCompleted();
      onboardingDoneOverlay.hidden = false;
      return;
    }
    loadPuzzle(ONBOARDING_PUZZLES[onboardingIndex]);
  } else {
    tryStartEndlessPuzzle(difficulty);
  }
});

onboardingDonePlayBtn.addEventListener("click", () => {
  onboardingDoneOverlay.hidden = true;
  refreshMenu(); // "Eğitimi Tekrar Oyna"/istatistik butonları artık görünür olmalı
  showDifficultySelect();
});

gameBackBtn.addEventListener("click", () => {
  cancelPendingPuzzle();
  if (timerRaf) cancelAnimationFrame(timerRaf);
  if (mode === "campaign") {
    showCampaign();
  } else if (mode === "onboarding" || mode === "daily") {
    refreshMenu();
    showScreen("menu");
  } else {
    showDifficultySelect();
  }
});

function startOnboarding(index = 0) {
  cancelPendingPuzzle();
  mode = "onboarding";
  onboardingIndex = index;
  setAccent(UI.accentCyan);
  showScreen("game");
  loadPuzzle(ONBOARDING_PUZZLES[index]);
}

function startEndless(diff) {
  // Hakkı ÖNCEDEN kontrol et: yoksa oyun ekranına hiç geçmeden (eski/boş bir
  // tahtanın overlay arkasında bir an görünmesini önleyerek) doğrudan Zorluk
  // Seç ekranı üzerinde hak overlay'ini göster.
  if (!GameState.canPlay(allowanceCost(diff))) {
    pendingDifficulty = diff;
    showAllowanceOverlay();
    return;
  }
  mode = "endless";
  difficulty = diff;
  setAccent(difficultyColor(diff));
  showScreen("game");
  tryStartEndlessPuzzle(diff);
}

// --- Ses: ilk kullanıcı dokunuşunda kilidi aç (tarayıcı/WebView autoplay
// politikaları) ve arka plan müziğini başlat. -------------------------------
document.addEventListener("pointerdown", () => unlockAudio(), { once: true, passive: true });

// --- Uygulama içi alım: erken kurulum (plugin varsa dinleyicileri bağlar). --
// Onay ASENKRON gelir (Google Play akışı ayrı bir arayüzde tamamlanır) —
// bu yüzden rozet/ayarlar UI'ını ve açık "hak bitti" katmanını burada,
// onGrantedCallback ile güncelliyoruz (satın alma tuşuna basıldığı anda
// DEĞİL).
initIAP();

// Play Games liderlik tablosu: sessiz giriş erkenden denenir (bkz.
// leaderboard.js) — kullanıcı "Sıralama" butonuna basana kadar bekletmiyoruz,
// çünkü o zamana kadar giriş çoktan tamamlanmış oluyor ve buton anında açılır.
// Giriş başarılıysa: çevrimdışıyken açılan başarılar gönderilir ve bulut
// kaydı yerelle birleştirilir (bkz. achievements.js / cloudsave.js).
initLeaderboard().then((signedIn) => {
  if (!signedIn) return;
  // Güncel puanı GİRİŞTE de gönder. Eskiden skor yalnızca bulmaca çözülünce
  // gönderiliyordu; oyuncu çözüm yapmadan "Sıralama"ya bakınca tabloda en son
  // gönderilen (eski, daha düşük) puanı görüyordu. Play Games zaten oyuncunun
  // EN YÜKSEK skorunu tuttuğu için bu gönderim asla puanı düşürmez.
  submitTotalScore(GameState.totalPoints());
  syncUnlockedAchievements();
  // Bulut kayıt (Snapshots) çağrıları Play Games istemcisini kısa süreliğine
  // meşgul edip "yeniden bağlan" durumuna sokabiliyor (bkz. PlayGamesPlugin
  // → openGamesUi'deki not). Girişin hemen ardından değil, oyuncu menüde
  // dolaşırken yapılıyor; böylece ilk saniyelerde Sıralama/Başarılar
  // ekranlarıyla çakışmıyor.
  setTimeout(() => {
    syncWithCloud().then((changed) => {
      if (!changed) return;
      // Buluttan gelen ilerleme yereli değiştirdi — açık ekranlar tazelenmeli.
      refreshMenu();
      refreshAllowanceBadge();
    });
  }, 5000);
});

// Kayıtlı renk körlüğü tercihini tahtaya uygula (bkz. board.js → colorGlyph).
setColorBlindMode(GameState.settings.colorBlindMode);

// Sonsuz mod bulmacaları arka planda (Web Worker) şimdiden hazırlanmaya
// başlar — oyuncu zorluk seçtiğinde çoğu zaman bulmaca anında gelir.
for (const diff of DIFFICULTIES) prefetch(diff);

onUnlimitedGranted(() => {
  refreshAllowanceBadge();
  refreshSettingsUI();
  refreshDailyNotification(); // sınırsız oldu — "hak dolma" bildirimine artık gerek yok, iptal edilir
  hideAllowanceOverlay();
  if (pendingDifficulty) {
    const diff = pendingDifficulty;
    pendingDifficulty = null;
    startEndless(diff);
  }
});

// --- Donanım GERİ tuşu (Android) -------------------------------------------
// @capacitor/app'in backButton olayı, ekran yığınına göre uygulama içi geri
// navigasyonla (aynı #game-back/#diff-back/#settings-back davranışı)
// eşleniyor. Web önizlemede/plugin yokken (window.Capacitor.Plugins.App
// tanımsız) hiçbir şey yapmaz — tarayıcının kendi geri tuşu zaten farklı
// çalışır.
function getCapPlugin(name) {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins[name] ? plugins[name] : null;
}

function wireHardwareBackButton() {
  const CapApp = getCapPlugin("App");
  if (!CapApp) return;
  CapApp.addListener("backButton", () => {
    if (!allowanceOverlay.hidden) {
      allowanceCancelBtn.click();
    } else if (!onboardingDoneOverlay.hidden) {
      onboardingDonePlayBtn.click();
    } else if (!screens.game.hidden) {
      gameBackBtn.click();
    } else if (!screens.settings.hidden) {
      settingsBackBtn.click();
    } else if (!screens.stats.hidden) {
      statsBackBtn.click();
    } else if (!screens.difficulty.hidden) {
      diffBackBtn.click();
    } else {
      CapApp.exitApp();
    }
  });
}
wireHardwareBackButton();

// --- Uygulama arka plana atılınca müziği durdur -----------------------------
// Capacitor App eklentisi varsa (Android/iOS) appStateChange olayını dinler;
// yoksa (web önizleme) tarayıcının visibilitychange'ine düşer — ikisi de
// stopMusic()/startMusic() çağırır (bkz. audio.js). SFX etkilenmez (sadece
// kullanıcı etkileşimiyle zaten anlık çalıyor, arka planda sorun yaratmıyor).
function wireAppLifecycle() {
  const CapApp = getCapPlugin("App");
  if (CapApp) {
    CapApp.addListener("appStateChange", (state) => {
      if (state && state.isActive) {
        startMusic();
      } else {
        stopMusic();
      }
    });
    return;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopMusic();
    } else {
      startMusic();
    }
  });
}
wireAppLifecycle();

// --- Başlangıç --------------------------------------------------------------

refreshMenu();
showScreen("menu");
refreshDailyNotification();

// --- DEV-ONLY test kancası (Godot tests/screenshot_test.gd ile aynı amaç) ---
// Üretimde zararsız: sadece görsel/otomasyon testleri doğrudan ekran/bulmaca
// index'ine atlayabilsin diye var, oyuncu arayüzünden erişilmez.
window.__prizmaDebug = {
  getErrors,
  // Görsel testler için: o anki bulmacayı çözer (kör modda ayrıca ateşler).
  solveCurrent: async () => {
    if (!currentPuzzle) return false;
    const { solution } = await requestSolution(currentPuzzle, null);
    if (!solution) return false;
    board.resetMirrors();
    for (const [key, type] of solution) board.applyHintMirror(key, type);
    if (board.blind) board.fire();
    return true;
  },
  gotoOnboarding: (index) => startOnboarding(index),
  gotoCampaign: () => showCampaign(),
  // 60/60 kutlama ekranını doğrudan açar (testte 60 bölüm çözmek pratik değil).
  showCampaignDone: () => showCampaignDone(),
  gotoEndless: (diff) => startEndless(diff),
  gotoDifficultySelect: () => showDifficultySelect(),
  gotoMenu: () => {
    refreshMenu();
    showScreen("menu");
  },
  gotoSettings: () => {
    refreshSettingsUI();
    showScreen("settings");
  },
  gotoStats: () => {
    refreshStats();
    showScreen("stats");
  },
  setAllowance: (n) => {
    GameState.allowance = n;
    GameState._save();
    refreshAllowanceBadge();
  },
  grantUnlimited: () => {
    GameState.grantUnlimited();
    refreshAllowanceBadge();
  },
};
