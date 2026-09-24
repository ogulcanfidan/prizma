// leaderboard.js — Google Play Games Services v2 liderlik tablosu sarmalayıcısı
// (bkz. android/app/.../PlayGamesPlugin.java). ads.js/iap.js ile AYNI desen:
// web önizlemede / native plugin yokken (ya da Play Console tarafında henüz
// gerçek ID'ler/kimlik bilgileri girilmediyse) tüm fonksiyonlar sessizce
// false/no-op döner — asla hata fırlatıp oyunu bozmaz.
//
// Gösterilen skor GameState.totalPoints() — zorluk bazlı ağırlıklı toplam
// puan (bkz. gamestate.js > DIFFICULTY_POINTS), "Ne kadar iyisin?" ekranında
// gösterilenle BİREBİR AYNI değer. Böylece oyuncu kendi cihazındaki puanla
// liderlik tablosundaki puanın neden aynı olduğunu sezgisel olarak anlar.

function getPlayGames() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.PlayGames ? plugins.PlayGames : null;
}

let signedIn = false;

// Uygulama açılışında bir kere çağrılır (bkz. main.js). Sessiz girişi dener;
// kullanıcıya hesap seçim ekranı SADECE gerekirse gösterilir.
export async function initLeaderboard() {
  const PlayGames = getPlayGames();
  if (!PlayGames) return false;
  try {
    const result = await PlayGames.signIn();
    signedIn = !!(result && result.signedIn);
    // Giriş olmadıysa sebebi Logcat'e yaz (kullanıcıya gösterilmez) — native
    // taraf "reason" alanında açıklama gönderiyor (bkz. PlayGamesPlugin.java).
    if (!signedIn) console.warn("leaderboard.js: Play Games girişi olmadı —", (result && result.reason) || "sebep bilinmiyor");
    return signedIn;
  } catch (e) {
    console.warn("leaderboard.js: giriş yapılamadı", e);
    signedIn = false;
    return false;
  }
}

// Her bulmaca çözümünden sonra çağrılır (bkz. main.js > onSolved). Giriş
// yapılmadıysa ya da plugin yoksa sessizce hiçbir şey yapmaz — oyun akışını
// ASLA bloklamaz veya geciktirmez (await edilmesine gerek yok, "fire and
// forget" olarak çağrılabilir).
export async function submitTotalScore(score) {
  const PlayGames = getPlayGames();
  if (!PlayGames || !signedIn) return false;
  try {
    const result = await PlayGames.submitScore({ score: Math.round(score) });
    return !result || result.success !== false;
  } catch (e) {
    console.warn("leaderboard.js: skor gönderilemedi", e);
    return false;
  }
}

// "Sıralama" butonuna basınca çağrılır — native liderlik tablosu ekranını
// açar. Henüz giriş yapılmadıysa (ör. Play Games uygulaması cihazda yok, ya
// da kullanıcı ilk sign-in denemesini reddetti) önce bir kez daha giriş
// dener, olmazsa false döner (main.js bu durumda kısa bir uyarı gösterebilir).
export async function showLeaderboard() {
  const PlayGames = getPlayGames();
  if (!PlayGames) return false;
  if (!signedIn) {
    const ok = await initLeaderboard();
    if (!ok) return false;
  }
  try {
    await PlayGames.showLeaderboard();
    return true;
  } catch (e) {
    console.warn("leaderboard.js: liderlik tablosu açılamadı —", (e && (e.message || e.errorMessage)) || e);
    return false;
  }
}

export function isSignedIn() {
  return signedIn;
}

export function isAvailable() {
  return !!getPlayGames();
}
