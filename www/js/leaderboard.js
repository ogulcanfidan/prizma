// leaderboard.js — Google Play Games Services v2 liderlik tablosu sarmalayıcısı
// (bkz. android/app/.../PlayGamesPlugin.java). ads.js/iap.js ile AYNI desen:
// web önizlemede / native plugin yokken (ya da Play Console tarafında henüz
// gerçek ID'ler girilmediyse) tüm fonksiyonlar sessizce false/no-op döner —
// asla hata fırlatıp oyunu bozmaz.
//
// Gösterilen skor GameState.totalPoints() — zorluk bazlı ağırlıklı toplam
// puan (bkz. gamestate.js > DIFFICULTY_POINTS), "Ne kadar iyisin?" ekranında
// gösterilenle BİREBİR AYNI değer. Böylece oyuncu kendi cihazındaki puanla
// liderlik tablosundaki puanın neden aynı olduğunu sezgisel olarak anlar.
//
// ÖNEMLİ — KULLANICI TARAFINDAN YAPILMASI GEREKENLER: bkz. PlayGamesPlugin.java
// dosyasının başındaki not (Play Console kurulumu + gerçek ID'ler).

function getPlayGames() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.PlayGames ? plugins.PlayGames : null;
}

let signedIn = false;
let signInAttempted = false;
// GEÇİCİ TANI ALANI — Play Games girişi neden başarısız oluyor anlaşılana
// kadar gerçek hata burada tutulur (bkz. getLastError, main.js). Sorun
// çözülünce bu değişken ve ilgili tüm satırlar kaldırılmalı.
let lastError = null;
// GEÇİCİ TANI ALANI — skor gönderimi (submitScore) neden liderlik
// tablosunda görünmüyor anlaşılana kadar (bkz. getLastSubmitError, main.js).
// Sorun çözülünce bu değişken ve ilgili tüm satırlar kaldırılmalı.
let lastSubmitError = null;

// Uygulama açılışında bir kere çağrılır (bkz. main.js). Sessiz girişi dener;
// kullanıcıya hesap seçim ekranı SADECE gerekirse gösterilir.
export async function initLeaderboard() {
  const PlayGames = getPlayGames();
  if (!PlayGames) return false;
  signInAttempted = true;
  try {
    const result = await PlayGames.signIn();
    signedIn = !!(result && result.signedIn);
    lastError = signedIn ? null : (result && result.debug) || "signIn() false döndü, debug alanı yok";
    return signedIn;
  } catch (e) {
    console.warn("leaderboard.js: giriş yapılamadı", e);
    signedIn = false;
    lastError = (e && (e.message || String(e))) || "bilinmeyen hata";
    return false;
  }
}

// GEÇİCİ TANI FONKSİYONU — bkz. yukarıdaki not.
export function getLastError() {
  return lastError;
}

// Her bulmaca çözümünden sonra çağrılır (bkz. main.js > onSolved). Giriş
// yapılmadıysa ya da plugin yoksa sessizce hiçbir şey yapmaz — oyun akışını
// ASLA bloklamaz veya geciktirmez (await edilmesine gerek yok, "fire and
// forget" olarak çağrılabilir).
export async function submitTotalScore(score) {
  const PlayGames = getPlayGames();
  if (!PlayGames) {
    lastSubmitError = "PlayGames plugin yok";
    return false;
  }
  if (!signedIn) {
    // GEÇİCİ TANI KODU — bu satır normalde sessizce false dönüyordu, artık
    // sebebi de ayrıca kaydediliyor.
    lastSubmitError = "signedIn=false (giriş yapılmamış görünüyor)";
    return false;
  }
  try {
    const result = await PlayGames.submitScore({ score: Math.round(score) });
    lastSubmitError = result && result.debug ? result.debug : null;
    return !result || result.success !== false;
  } catch (e) {
    console.warn("leaderboard.js: skor gönderilemedi", e);
    lastSubmitError = (e && (e.message || String(e))) || "bilinmeyen hata";
    return false;
  }
}

// GEÇİCİ TANI FONKSİYONU — bkz. yukarıdaki not.
export function getLastSubmitError() {
  return lastSubmitError;
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
    console.warn("leaderboard.js: liderlik tablosu açılamadı", e);
    return false;
  }
}

export function isSignedIn() {
  return signedIn;
}

export function isAvailable() {
  return !!getPlayGames();
}
