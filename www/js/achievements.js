// achievements.js — Play Games başarıları.
//
// Kimlikler Play Console > Play Oyun Hizmetleri > Hedefler sayfasında
// tanımlandı (yayınlandı). Native köprü: PlayGamesPlugin.unlockAchievement
// (bkz. android/.../PlayGamesPlugin.java). Plugin yoksa / giriş yapılmadıysa
// her şey sessizce no-op olur — ads.js/iap.js/leaderboard.js ile AYNI desen.
//
// Hangi başarının açılacağına JS karar verir (koşullar GameState'ten okunur),
// native taraf sadece "şu kimliği aç" der. Zaten açık bir başarıyı yeniden
// açmak zararsızdır, ama gereksiz çağrı yapmamak için açılanlar cihazda da
// işaretlenir (GameState.unlockedAchievements).

import { GameState } from "./gamestate.js";
import { initLeaderboard, isSignedIn } from "./leaderboard.js";
import { CAMPAIGN_TOTAL } from "./campaignLevels.js";

export const ACHIEVEMENTS = {
  firstSolve: { id: "CgkIqYOLkucTEAIQBA", test: (s) => s.totalSolved >= 1 },
  solve25: { id: "CgkIqYOLkucTEAIQBQ", test: (s) => s.totalSolved >= 25 },
  solve100: { id: "CgkIqYOLkucTEAIQBg", test: (s) => s.totalSolved >= 100 },
  hard25: { id: "CgkIqYOLkucTEAIQBw", test: (s) => s.zorSolved >= 25 },
  firstMaster: { id: "CgkIqYOLkucTEAIQCA", test: (s) => s.ustaSolved >= 1 },
  streak7: { id: "CgkIqYOLkucTEAIQCQ", test: (s) => s.dailyStreak >= 7 },
  streak30: { id: "CgkIqYOLkucTEAIQCg", test: (s) => s.dailyStreak >= 30 },
  points5000: { id: "CgkIqYOLkucTEAIQCw", test: (s) => s.points >= 5000 },
  // Tüm bölümler (60/60) — Play Console'da "Yolun Sonu", 75 puan.
  // (Kimliği girilmemiş bir başarı YEREL olarak açılmış sayılır ama Play'e
  // gönderilmez; bkz. sendable — kimlik girildiği gün syncUnlockedAchievements
  // geriye dönük gönderir.)
  campaignAll: { id: "CgkIqYOLkucTEAIQDA", test: (s) => s.campaignSolved >= CAMPAIGN_TOTAL },
};

// Play'e gönderilebilir mi (gerçek bir kimlik girilmiş mi)?
function sendable(id) {
  return !!id && !id.startsWith("REPLACE_WITH_");
}

function getPlayGames() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.PlayGames ? plugins.PlayGames : null;
}

function snapshot() {
  let totalSolved = 0;
  for (const diff of Object.keys(GameState.stats)) {
    totalSolved += GameState.stats[diff]?.solved || 0;
  }
  return {
    totalSolved,
    zorSolved: GameState.stats.zor?.solved || 0,
    ustaSolved: GameState.stats.usta?.solved || 0,
    dailyStreak: GameState.dailyStreak,
    points: GameState.totalPoints(),
    campaignSolved: GameState.campaignSolvedCount,
  };
}

// Her çözümden sonra çağrılır (bkz. main.js → onSolved). Koşulu sağlanan ve
// henüz açılmamış başarıları açar. Oyun akışını ASLA bloklamaz.
export async function checkAchievements() {
  const PlayGames = getPlayGames();
  const state = snapshot();
  for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
    if (GameState.isAchievementUnlocked(key)) continue;
    if (!ach.test(state)) continue;
    // Plugin yoksa bile yerel işaret konur: oyuncu daha sonra giriş yaptığında
    // syncUnlockedAchievements() bunları toplu olarak gönderir.
    GameState.markAchievementUnlocked(key);
    if (!sendable(ach.id)) continue;
    if (!PlayGames || !PlayGames.unlockAchievement) continue;
    try {
      await PlayGames.unlockAchievement({ achievementId: ach.id });
    } catch (e) {
      console.warn("achievements.js: başarı açılamadı", key, e);
    }
  }
}

// Giriş yapıldığında çağrılır: çevrimdışıyken/giriş yokken açılmış olarak
// işaretlenen başarıları Play Games'e gönderir (tekrar göndermek zararsız).
export async function syncUnlockedAchievements() {
  const PlayGames = getPlayGames();
  if (!PlayGames || !PlayGames.unlockAchievement) return;
  for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
    if (!GameState.isAchievementUnlocked(key)) continue;
    if (!sendable(ach.id)) continue;
    try {
      await PlayGames.unlockAchievement({ achievementId: ach.id });
    } catch (e) {
      /* sessizce geç */
    }
  }
}

// "Başarılar" butonu — Google'ın hazır ekranını açar.
// Başarı ekranı giriş ister; henüz giriş yoksa ÖNCE giriş denenir (bkz.
// leaderboard.js → showLeaderboard, aynı desen). Eskiden denemeden açmaya
// çalışıyordu ve doğrudan "giriş yapmayı deneyin" hatası veriyordu.
export async function showAchievements() {
  const PlayGames = getPlayGames();
  if (!PlayGames || !PlayGames.showAchievements) return false;
  if (!isSignedIn()) {
    const ok = await initLeaderboard();
    if (!ok) return false;
  }
  try {
    await PlayGames.showAchievements();
    return true;
  } catch (e) {
    console.warn("achievements.js: başarı ekranı açılamadı —", (e && (e.message || e.errorMessage)) || e);
    return false;
  }
}

export function isAvailable() {
  return !!getPlayGames();
}
