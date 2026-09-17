// ads.js — @capacitor-community/admob sarmalayıcısı: alt banner + ödüllü
// (rewarded) reklam. Web önizlemede / plugin yokken sessizce devre dışı.
//
// AdMob UYGULAMA ID'si capacitor.config.json'da ZATEN GERÇEK (önceki
// sürümden korunan değer): ca-app-pub-2569162850712494~6258031941.
//
// GERÇEK REKLAM BİRİMİ ID'LERİ (AdMob konsolundan alınmıştır, Google'ın
// TEST ID'leri DEĞİL):
//  - BANNER_UNIT_ID: önceki sürümden zaten var olan gerçek "Prizma-banner"
//    reklam birimi.
//  - REWARDED_UNIT_ID: AdMob konsolunda önceden sadece BANNER + "Prizma-gecis"
//    (GEÇİŞ/interstitial) reklam birimleri vardı, ÖDÜLLÜ birim YOKTU. Eski
//    sürümde "her 10 bölümü geçince zorunlu" bir geçiş reklamı çıkıyordu;
//    bunun yerine bu ÖDÜLLÜ (rewarded, kod tarafında zaten showRewardedAd()
//    ile opsiyonel/gönüllü — hak overlay'inde "reklam izle" butonuyla) akışı
//    tercih edildi. Bu yüzden AdMob'da YENİ bir "Prizma-odul" (Ödüllü, ödül
//    miktarı 15 "Kredi" — REWARDED_AD_BONUS ile aynı, main.js >
//    addAllowance) reklam birimi oluşturuldu, ID'si aşağıda. Eski
//    "Prizma-gecis" (interstitial) birimi KOD TARAFINDA ZATEN HİÇ
//    KULLANILMIYORDU (bu dosyada interstitial/geçiş reklamı hiç yok) —
//    AdMob konsolunda hâlâ duruyor ama artık uygulama onu göstermiyor;
//    konsoldan silinmesi/arşivlenmesi ayrı bir manuel adımdır.
//
// KURULUM NOTU: @capacitor-community/admob paketi package.json'a eklendi —
// `npm install` + `npx cap sync android` gerekir. Metot isimleri plugin
// sürümüne göre küçük farklar gösterebilir; sürüm uyuşmazlığı olursa
// `node_modules/@capacitor-community/admob/dist/esm/definitions.d.ts`
// dosyasına bakıp burayı güncelleyin.

const BANNER_UNIT_ID = "ca-app-pub-2569162850712494/5547585507"; // gerçek "Prizma-banner"
const REWARDED_UNIT_ID = "ca-app-pub-2569162850712494/3074598274"; // gerçek "Prizma-odul" (yeni oluşturulan birim)

function getAdMob() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  return plugins && plugins.AdMob ? plugins.AdMob : null;
}

let initialized = false;
async function ensureInit() {
  const AdMob = getAdMob();
  if (!AdMob) return null;
  if (initialized) return AdMob;
  try {
    await AdMob.initialize({});
    initialized = true;
  } catch (e) {
    console.warn("ads.js: AdMob başlatılamadı", e);
  }
  return AdMob;
}

// Alt banner reklamı gösterir (oyun ekranının en altında, sabit).
export async function showBanner() {
  const AdMob = await ensureInit();
  if (!AdMob) return false;
  try {
    await AdMob.showBanner({
      adId: BANNER_UNIT_ID,
      adSize: "ADAPTIVE_BANNER",
      position: "BOTTOM_CENTER",
      margin: 0,
    });
    return true;
  } catch (e) {
    console.warn("ads.js: banner gösterilemedi", e);
    return false;
  }
}

export async function hideBanner() {
  const AdMob = getAdMob();
  if (!AdMob) return;
  try {
    await AdMob.hideBanner();
  } catch (e) {
    /* yoksay */
  }
}

// Ödüllü reklamı hazırlar+gösterir; izleyip ödülü hak ederse true döner.
export async function showRewardedAd() {
  const AdMob = await ensureInit();
  if (!AdMob) return false;
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_UNIT_ID });
    const result = await AdMob.showRewardVideoAd();
    return !!result;
  } catch (e) {
    console.warn("ads.js: ödüllü reklam gösterilemedi", e);
    return false;
  }
}
