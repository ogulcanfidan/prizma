// cloudsave.js — Play Games "Kaydedilmiş oyunlar" (Snapshots) ile bulut kayıt.
//
// Sorun: ilerleme YALNIZCA cihazda (localStorage) duruyordu — uygulama
// silinince ya da telefon değişince her şey kayboluyordu.
//
// Çözüm: Play Games'e giriş yapıldığında buluttaki kayıt indirilir ve
// yereldekiyle BİRLEŞTİRİLİR (bkz. gamestate.js → mergeState: her alanda
// "daha ileri" olan kazanır, hiçbir ilerleme kaybolmaz), sonra birleşmiş hâl
// buluta geri yazılır. Çözümlerden sonra da (seyrekleştirilmiş olarak)
// yükleme yapılır.
//
// Plugin yoksa / giriş yapılmadıysa tüm fonksiyonlar sessizce no-op döner.

import { GameState } from "./gamestate.js";

// !!! ŞU AN KAPALI — bkz. aşağıdaki not.
//
// Snapshots çağrıları, Play Games istemcisini tüm uygulama ömrü boyunca
// "girişsiz" duruma düşürüyordu: cihaz logunda
//     SecurityException: Not signed in when calling API
// (getLeaderboardIntent / getAchievementsIntent), üstelik araya yeniden
// signIn() sıkıştırıp tekrar denendiğinde bile. Sebebi: Snapshots ("Kaydedilmiş
// oyunlar") ek bir yetki (Drive appdata) ister; bu yetki verilmediğinde çağrı
// yalnızca kendisi başarısız olmakla kalmıyor, aynı süreçteki Games istemcisini
// de bozuyor. Görünen belirti tam olarak buydu: giriş ve başarı açma
// (fire-and-forget çağrılar, hata yutuluyor) çalışırken Sıralama/Başarılar
// ekranları açılmıyordu.
//
// Bu yüzden bulut kayıt tek bir anahtarla kapatıldı. Yeniden açmadan önce:
//  1. Play Console > Play Oyun Hizmetleri > Yapılandırma'da "Kaydedilmiş
//     oyunlar" AÇIK olmalı ve değişiklik YAYINLANMIŞ olmalı,
//  2. test cihazında hesabın ek yetki onayı verdiği doğrulanmalı,
//  3. ardından Sıralama + Başarılar ekranları cihazda tekrar denenmeli.
const CLOUD_SAVE_ENABLED = false;

// Art arda çözümlerde her seferinde buluta yazmamak için bekleme süresi.
const SAVE_DEBOUNCE_MS = 8000;

let saveTimer = null;
let syncing = false;

function getPlayGames() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.PlayGames ? plugins.PlayGames : null;
}

export function isAvailable() {
  if (!CLOUD_SAVE_ENABLED) return false;
  const p = getPlayGames();
  return !!(p && p.saveToCloud && p.loadFromCloud);
}

// Giriş yapıldıktan sonra bir kez çağrılır (bkz. main.js).
// true döner: buluttan gelen veri yerel ilerlemeyi DEĞİŞTİRDİ (çağıran
// arayüzü tazelemeli).
export async function syncWithCloud() {
  const PlayGames = getPlayGames();
  if (!isAvailable() || syncing) return false;
  syncing = true;
  let changed = false;
  try {
    const result = await PlayGames.loadFromCloud();
    if (result && result.found && result.data) {
      try {
        changed = GameState.mergeState(JSON.parse(result.data));
      } catch (e) {
        console.warn("cloudsave.js: buluttaki kayıt okunamadı (bozuk JSON)", e);
      }
    }
    // Birleşmiş (ya da ilk kez oluşan) hâli buluta yaz.
    await PlayGames.saveToCloud({ data: JSON.stringify(GameState.exportState()) });
  } catch (e) {
    console.warn("cloudsave.js: bulut eşitlemesi başarısız", e);
  } finally {
    syncing = false;
  }
  return changed;
}

// Çözüm/satın alma gibi ilerleme değişikliklerinden sonra çağrılır; art arda
// çağrılarda yalnızca sonuncusu (SAVE_DEBOUNCE_MS sonra) buluta yazar.
export function scheduleCloudSave() {
  if (!isAvailable()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const PlayGames = getPlayGames();
    try {
      await PlayGames.saveToCloud({ data: JSON.stringify(GameState.exportState()) });
    } catch (e) {
      console.warn("cloudsave.js: buluta yazılamadı", e);
    }
  }, SAVE_DEBOUNCE_MS);
}
