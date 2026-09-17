// iap.js — Uygulama içi alım: tek seferlik 39.99 TL ödeme karşılığında
// GameState.unlimited=true (günlük bulmaca hakkı sınırı tamamen kalkar).
//
// cordova-plugin-purchase (Capacitor içinde de çalışır, window.CdvPurchase.store
// olarak erişilir) kullanır. Web önizlemede / plugin yokken sessizce devre dışı.
//
// ÖNEMLİ — KULLANICI TARAFINDAN YAPILMASI GEREKENLER (bu proje bunları
// OTOMATİK yapamaz, Play Console erişimi gerektirir):
//  1. Google Play Console → Uygulamanız → Uygulama içi ürünler → "Yönetilen
//     ürün" (managed product, tek seferlik) oluşturun, ID'sini aşağıdaki
//     UNLIMITED_PRODUCT_ID ile AYNI yapın (ya da burayı kendi ID'nize göre
//     değiştirin), fiyatı 39,99 TL olarak ayarlayın.
//  2. `npm install cordova-plugin-purchase` + `npx cap sync android`.
//  3. Uygulamanın imzalı bir sürümü Play Console'a en az "dahili test"
//     olarak yüklenmeden gerçek satın alma testleri ÇALIŞMAZ (Google Play
//     Billing kısıtlaması) — bu adım da kullanıcı tarafından yapılmalı.

import { GameState } from "./gamestate.js";

export const UNLIMITED_PRODUCT_ID = "prizma_unlimited";
export const UNLIMITED_PRICE_LABEL = "39,99 TL";

function getStore() {
  return window.CdvPurchase ? window.CdvPurchase.store : null;
}

let wired = false;
let onGrantedCallback = null;

// TANI GÜNLÜĞÜ — sadece console.log/warn/error ile Logcat'e yazılır, ASLA
// kullanıcıya alert() ile gösterilmez (bkz. main.js > leaderboardBtn'de
// yaşanan DEBUG sızıntısı — aynı hatayı burada tekrarlamıyoruz). Amaç, satın
// alma "hiçbir şey olmadan sessizce başarısız oluyor" şikayetlerinde Android
// Studio Logcat'ten (paket adına ya da "Capacitor/Console" etiketine göre
// filtrelenerek) gerçek sebebi görebilmek.
export function purchaseUnlimited() {
  const store = getStore();
  if (!store) {
    console.warn("iap.js: satın alma başlatılamadı — window.CdvPurchase yok (plugin native derlemeye dahil değil ya da henüz yüklenmedi)");
    return false;
  }
  try {
    const product = store.get(UNLIMITED_PRODUCT_ID);
    if (!product) {
      console.warn(`iap.js: satın alma başlatılamadı — "${UNLIMITED_PRODUCT_ID}" ürünü store.get() ile bulunamadı (register() henüz çalışmamış ya da Play Console tarafında ürün/fiyat henüz yayılmamış olabilir)`);
      return false;
    }
    if (product.owned) {
      // Round 20 — cordova-plugin-purchase v13'te "owned" artık bir OLAY
      // değil, Product üzerinde bir ÖZELLİK (bkz. initIAP altındaki not).
      // Kullanıcı zaten sahipse tekrar satın alma akışını başlatmayalım.
      console.log("iap.js: ürün zaten sahipli, satın alma başlatılmadı, doğrudan veriliyor", UNLIMITED_PRODUCT_ID);
      GameState.grantUnlimited();
      if (onGrantedCallback) onGrantedCallback();
      return true;
    }
    const offer = product.getOffer ? product.getOffer() : null;
    if (offer) {
      console.log("iap.js: sipariş veriliyor (offer.order())", UNLIMITED_PRODUCT_ID);
      offer.order();
      return true;
    }
    if (product.order) {
      console.log("iap.js: sipariş veriliyor (product.order())", UNLIMITED_PRODUCT_ID);
      product.order();
      return true;
    }
    console.warn("iap.js: satın alma başlatılamadı — üründe ne offer.order() ne de product.order() mevcut", product);
    return false;
  } catch (e) {
    console.warn("iap.js: satın alma başlatılamadı — exception", e);
    return false;
  }
}

// Satın alma ONAYI asenkron gelir (ödeme akışı Google Play arayüzünde
// tamamlanır) — main.js bu geri çağrıyla, ne zaman gerçekten sınırsız
// olduğunu öğrenip rozet/ayarlar UI'ını ve varsa açık "hak bitti" katmanını
// güncelleyebilir.
export function onUnlimitedGranted(cb) {
  onGrantedCallback = cb;
}

export function initIAP() {
  const store = getStore();
  if (!store) {
    console.log("iap.js: initIAP() — window.CdvPurchase yok, plugin bu derlemede yok (bekleniyor: web önizleme ya da eski/henüz senkronize edilmemiş build)");
    return;
  }
  if (wired) return;
  wired = true;
  try {
    store.register({
      id: UNLIMITED_PRODUCT_ID,
      type: store.NON_CONSUMABLE,
      platform: store.GOOGLE_PLAY,
    });
    store.when(UNLIMITED_PRODUCT_ID).approved((p) => {
      console.log("iap.js: satın alma onaylandı", UNLIMITED_PRODUCT_ID);
      GameState.grantUnlimited();
      if (onGrantedCallback) onGrantedCallback();
      p.finish();
    });
    // Round 20 — GERÇEK HATA (chrome://inspect ile Logcat/DevTools konsolunda
    // yakalandı): "store.when(...).owned is not a function". Kurulu
    // cordova-plugin-purchase sürümünde (13.x) "owned" artık when() zincirinde
    // bir OLAY değil — bu satır her çağrıldığında exception fırlatıyordu ve
    // dıştaki catch bunu yutup initIAP()'ı store.initialize() ÇAĞRILMADAN
        // sonlandırıyordu (bkz. aşağıdaki catch) — satın almanın hep "şu anda
    // kullanılamıyor" demesinin ASIL sebebi buydu. Doğrusu: ürünün sahipli
    // olup olmadığını Product.owned ÖZELLİĞİNDEN okumak (bkz. yukarıda
    // purchaseUnlimited() ve aşağıda initialize() sonrası kontrol).
    store.when(UNLIMITED_PRODUCT_ID).finished((p) => {
      console.log("iap.js: işlem tamamlandı (finished)", UNLIMITED_PRODUCT_ID);
    });
    // TANI — store seviyesinde asenkron hatalar (ağ, Play Store bağlantısı,
    // ürün Google tarafında henüz aktif değil vb.) sadece burada yakalanır;
    // register()/initialize() senkron try/catch'i bunları GÖRMEZ.
    store.error((err) => {
      console.error("iap.js: store.error() —", err && err.code, err && err.message, err);
    });
    store.initialize([store.GOOGLE_PLAY]);
    console.log("iap.js: initIAP() tamamlandı, initialize() çağrıldı");

    // Round 20 — Uygulama açılışında ürün zaten sahipliyse (ör. yeniden
    // kurulum, farklı cihaz) otomatik olarak sınırsız hakkı ver. Product
    // bilgisi initialize()'dan hemen sonra henüz gelmemiş olabileceğinden,
    // kısa bir gecikmeyle bir kere kontrol ediyoruz. Bu blok kendi try/catch'i
    // içinde — burada bir şey ters giderse initIAP()'ın geri kalanını
    // ETKİLEMEMELİ.
    setTimeout(() => {
      try {
        const product = store.get(UNLIMITED_PRODUCT_ID);
        if (product && product.owned) {
          console.log("iap.js: ürün zaten sahipli (owned=true, açılışta tespit edildi)", UNLIMITED_PRODUCT_ID);
          GameState.grantUnlimited();
          if (onGrantedCallback) onGrantedCallback();
        }
      } catch (e) {
        console.warn("iap.js: açılış owned kontrolü başarısız", e);
      }
    }, 3000);
  } catch (e) {
    console.warn("iap.js: başlatılamadı", e);
  }
}

export function isAvailable() {
  return !!getStore();
}
