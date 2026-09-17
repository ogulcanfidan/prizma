// main.js — ekranlar arası geçişi yöneten "kök". Godot scenes/Main.gd +
// MainMenu.gd + DifficultySelect.gd + Game.gd dosyalarının web karşılığı.

import { GameState, DIFFICULTIES, ALLOWANCE_CAP, REWARDED_AD_BONUS, rankKeyForPoints, allowanceCost } from "./gamestate.js";
import { generate } from "./generator.js";
import { ONBOARDING_PUZZLES } from "./onboarding.js";
import { BoardView } from "./board.js";
import { difficultyColor, UI } from "./theme.js";
import { renderLogo } from "./logo.js";
import { unlockAudio, playSfx, setMusicVolume, setSfxVolume, getMusicVolume, getSfxVolume, startMusic, stopMusic } from "./audio.js";
import { refreshDailyNotification } from "./notifications.js";
import { showBanner, hideBanner, showRewardedAd } from "./ads.js";
import { initIAP, purchaseUnlimited, onUnlimitedGranted } from "./iap.js";
import { initLeaderboard, submitTotalScore, showLeaderboard } from "./leaderboard.js";
import { initI18n, t, setLanguage, SUPPORTED_LANGS, LANG_NAMES } from "./i18n.js";

// Dil, ilk DOM işleminden ÖNCE belirlenmeli (applyStaticStrings
// ve tüm t() çağrıları buna bağlı). GameState zaten senkron kurulduğu için
// (localStorage'dan) burada da senkron çalışır.
initI18n();

const screens = {
  menu: document.getElementById("screen-menu"),
  settings: document.getElementById("screen-settings"),
  difficulty: document.getElementById("screen-difficulty"),
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
  refreshAllowanceBadge();
}

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
    // sadece sade, anlaşılır bir mesaj (bkz. leaderboard.js > getLastError,
    // ki bu artık sadece geliştirici konsolunda/loglarda kullanılıyor).
    alert(t("stats.leaderboardUnavailable"));
  }
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

settingsNotifRow.addEventListener("click", () => {
  const next = !GameState.settings.notificationsEnabled;
  GameState.updateSettings({ notificationsEnabled: next });
  settingsNotifToggle.classList.toggle("on", next);
  refreshDailyNotification();
  playSfx("click");
});

// --- Zorluk Seçimi --------------------------------------------------------

function showDifficultySelect() {
  const container = document.getElementById("diff-buttons");
  container.innerHTML = "";
  for (const diff of DIFFICULTIES) {
    const solved = GameState.stats[diff]?.solved || 0;
    const btn = document.createElement("button");
    btn.className = "btn diff-btn";
    btn.style.setProperty("--accent", difficultyColor(diff));
    btn.innerHTML = `<span>${t(`difficulty.${diff}`)}</span><span class="count">${t("difficulty.solved", { n: solved })}</span>`;
    btn.addEventListener("click", () => startEndless(diff));
    container.appendChild(btn);
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
function tryStartEndlessPuzzle(diff) {
  const cost = allowanceCost(diff);
  if (!GameState.canPlay(cost)) {
    pendingDifficulty = diff;
    showAllowanceOverlay();
    return false;
  }
  GameState.consumeAllowance(cost);
  refreshAllowanceBadge();
  GameState.recordPlaySession();
  refreshDailyNotification();
  loadPuzzle(generate(diff));
  return true;
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
const winNextBtn = document.getElementById("win-next");
const winPanelEl = document.getElementById("win-panel");
const boardFrameEl = document.getElementById("board-frame");
const gameBackBtn = document.getElementById("game-back");
const gameResetBtn = document.getElementById("game-reset");
const gameFireBtn = document.getElementById("game-fire");
const failToastEl = document.getElementById("fail-toast");

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
  winOverlayEl.hidden = true;
  hideFailToast();
  startTimeMs = performance.now();
  if (mode === "onboarding") {
    setGameTitle(t(puzzle.titleKey), false);
    gameTutorialEl.textContent = t(puzzle.tutorialKey);
    gameTutorialEl.hidden = false;
  } else {
    setGameTitle(t(`difficulty.${difficulty}`), true);
    gameTutorialEl.hidden = true;
  }
  const blind = mode === "endless" ? puzzle.blindMode === true : puzzle.blindDemo === true;
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
  board.setPuzzle(puzzle, { blind, gameplayFire: mode === "endless", onboardingReveal: mode === "onboarding" });
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
  }
};

// Ayna hakkı sayacı: yerleştirdikçe azalır, sıfırlanınca/aynalar kaldırılınca artar.
board.onAllowanceChange = (remaining) => {
  gameHintEl.textContent = t("game.hint", { n: remaining });
};

// Ayna ekleme/çıkarma sesi.
board.onPlace = (added) => {
  playSfx(added ? "place" : "remove");
};

function onSolved() {
  solvedThisPuzzle = true;
  playSfx("solve");
  const elapsed = performance.now() - startTimeMs;
  if (mode === "endless") {
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
  winNextBtn.textContent = mode === "endless" || hasNextOnboarding ? t("win.next") : t("win.continue");
  winOverlayEl.hidden = false;
}

gameResetBtn.addEventListener("click", () => {
  playSfx("click");
  hideFailToast();
  board.resetMirrors();
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
  if (timerRaf) cancelAnimationFrame(timerRaf);
  if (mode === "onboarding") {
    refreshMenu();
    showScreen("menu");
  } else {
    showDifficultySelect();
  }
});

function startOnboarding(index = 0) {
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
initLeaderboard();

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
  gotoOnboarding: (index) => startOnboarding(index),
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
