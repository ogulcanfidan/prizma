# Prizma — Web/Capacitor sürümü

Bu proje, `prizma-godot-tasarim-kararlari.md` dosyasındaki tasarım kararlarının
(Sudoku modeli, gerçek solver, Stil A ikonlar, Prizma Bloğu, canlı ışın
animasyonu) HTML5 + CSS/SVG + Capacitor ile uygulanmış hâlidir. Godot
denemesinden (`prizma-godot/`) sonra, "gerçek glow gerekiyor ama Godot'un
motor mimarisiyle güvenilir/tutarlı biçimde elde edilemedi" tespiti üzerine
bu yola geçildi — SVG'nin `feGaussianBlur` tabanlı filtreleri, onaylanan
mockup'taki (`prizma-styles.html`) glow'u hiçbir ince ayar gerekmeden birebir
verir.

## Klasör yapısı

```
www/                 Capacitor'ın paketlediği tüm web uygulaması
  index.html          Tek sayfa; üç ekran de burada (menü/zorluk/oyun)
  css/style.css        "Karanlık + Neon Lab" tema (UITheme.gd karşılığı)
  js/
    celltypes.js        Hücre tipleri, yönler, ayna yansıma matematiği
    puzzledata.js        Bulmaca veri modeli
    solver.js             simulate() + minMirrorsToReach() (0-1 BFS)
    generator.js           Sonsuz mod prosedürel üretici + solver doğrulaması
    onboarding.js            6 elle tasarlanmış tanıtım bulmacası
    gamestate.js              İstatistik/ilerleme (localStorage)
    theme.js                   Renk paleti
    board.js                    SVG tahta render + dokunma etkileşimi
    logo.js                      Ana menü logosu
    audio.js                      Web Audio API müzik + efekt motoru (dosyasız sentez)
    notifications.js               Günlük "en çok oynanan saat" bildirimi
    ads.js                          AdMob banner + ödüllü reklam sarmalayıcısı
    iap.js                           39,99 TL "sınırsız oyna" uygulama içi alımı
    leaderboard.js                   Play Games Services v2 liderlik tablosu sarmalayıcısı
    i18n.js                          9 dilde arayüz metinleri
    main.js                          Ekranlar arası akış (Main.gd karşılığı)
tests/
  logic_test.mjs      DEV-ONLY. `node tests/logic_test.mjs` ile çalıştırılır.
                       Oyunun kendisinin parçası değildir, App'e paketlenmez
                       (www/ dışında olduğu için Capacitor onu görmez).
android/              `npx cap add android` ile üretilen tam native proje.
capacitor.config.json appId/AdMob vb. paketleme ayarlarını içerir.
```

## Nasıl derlenir (build/export)

```
npm install
npx cap sync android
npx cap open android      # Android Studio açılır, oradan Run/Build
```

`www/` içeriğini değiştirdikten sonra Android tarafına yansıtmak için tekrar
`npx cap sync android` çalıştırmak yeterli.

**ÖNEMLİ:** `package.json`'da 4 native plugin var (`@capacitor/app`,
`@capacitor/local-notifications`, `@capacitor-community/admob`,
`cordova-plugin-purchase`) — bu yüzden `npx cap sync android`'den ÖNCE mutlaka
`npm install` çalıştırılmalı, yoksa sync bu pluginleri Android projesine
eklemez ve aşağıda anlatılan özellikler (donanım geri tuşu, bildirim, reklam,
satın alma) sessizce devre dışı kalır (kod bunları GÜVENLİ biçimde no-op
yapacak şekilde yazıldı, çökme olmaz — ama çalışmaz da).

## Etkileşim modeli: Canlı (varsayılan) + Kör mod (sadece Zor/Usta)

`board.js` iki modu destekler; hangisinin kullanılacağına `main.js` karar verir:

- **Canlı mod** (`blind:false`, varsayılan — Kolay/Orta ve eğitimdeki ilk 6
  bulmaca): ışın her ayna yerleştirme/döndürmede anında yeniden hesaplanıp
  gösterilir ("Işını Çalıştır" bu modda yok/gizli).
- **Kör mod** (`blind:true` — sadece Zor/Usta zorluklarında VE sadece
  `generate()`'in "özel tur" (`puzzle.blindMode===true`) işaretlediği
  bulmacalarda, her turda değil — ve eğitimdeki 7. bulmaca): aynalar ışın
  görünmeden yerleştirilir; alttaki "Işını Çalıştır" düğmesine basınca ışın
  bir kez simüle edilip animasyonla çizilir. Çözüldüyse kazanma ekranı;
  çözülmediyse kısa bir süre yanlış sonuç gösterilir, ardından tahta otomatik
  sıfırlanır ve oyuncu aynı bulmacayı tekrar dener (`board.js` → `fire()`).

"Işını Çalıştır", oyunun genel mekaniği değil — portallar gibi sadece zorluk
artırmak için kullanılan bir mekanik. Bu yüzden Kolay/Orta ve eğitimin ilk 6
bulmacası canlı modda; kör mod sadece Zor/Usta'da ve eğitimin son bulmacasında
(`onboarding.js` → `puzzle7IsiniCalistir`, `blindDemo: true`) devrede — bu 7.
bulmaca, oyuncuyu Zor/Usta'ya geçmeden önce güvenli bir ortamda kör moda
hazırlıyor.

Sağ alttaki "Ayna hakkı" sayacı her iki modda da var — bulmacanın gerçek
minimum ayna sayısından başlayıp yerleştirdikçe azalır (`board.js` →
`maxMirrors`/`remainingMirrors`); bu, aynı anda yerleştirilebilecek ayna
sayısını sertçe sınırlıyor (canlı modda bile trial-and-error spam'ini önler).

Portal çıkış yönü göstergesi (`board.js` → `portalIcon()`): her portal, o
turun gerçek simülasyon sonucuna göre (ışın o portalden geçtiyse) küçük bir
ok ile çıkış yönünü gösterir. Portallar yön değiştirmediği için (teleport
sonrası ışın aynı yönde devam eder) bu ok, sadece ışın simüle edildikten sonra
(canlı modda her zaman, kör modda "Işını Çalıştır" sonrasında) görünür — kör
modun "önce göremezsin" tasarımını bozmuyor.

## Zorluk sistemi

`generator.js` → `TIER_CONFIG`:

| Zorluk (buton) | Gerçek min. ayna | Izgara | Kaynak/hedef | Splitter+portal dağılımı (her 10 bölümde) |
|---|---|---|---|---|
| Kolay | 4-6 | 8×8 | 1 kaynak, 1 hedef | Hiç (canlı mod, portal/splitter yok) |
| Orta | 5-7 | 9×9 | Splitter turunda 1 kaynak; portal turunda 2 kaynak, 2 veya 1 (paylaşılan) hedef | ~5 splitter-only, ~5 portal-only (asla ikisi birden) |
| Zor | 6-8 | 11×11 | HER bölümde en az 2 kaynak, 2 veya 1 (paylaşılan) hedef | ~4 hem-splitter-hem-portal, ~3 splitter-only, ~3 portal-only |
| Usta | 7-10 | 12×12 | HER bölümde tam 3 kaynak, 3 veya 1 (paylaşılan) hedef | 10/10 hem splitter hem portal |

"Az eleman, derin düşünme" ilkesi Kolay'da korunuyor; Orta/Zor/Usta bu tavanı
bilinçli aşıyor — zorluk ayna sayısından değil (bkz. `range`), yapı
karmaşıklığından (splitter + çoklu kaynak) ve mekân kısıtlamasından geliyor.

Zor/Usta'da her üretilen bulmaca, `TIER_CONFIG.specialChance` olasılığıyla
(Usta ~%80, Zor ~%60) bir "özel tur" (portal + kör mod) olarak işaretlenir
(`puzzle.blindMode`); diğer turlar aynı mekân zorluğuyla ama canlı modda ve
portalsız oynanır. `tests/logic_test.mjs` bu sıklığı 200 örnekle doğruluyor.

Hangi yapının (splitter/portal/ikisi) üretileceğine deneme döngüsünden önce
tek seferde karar veriliyor (her denemede yeniden zar atılmıyor) — aksi
takdirde başarı oranı düşük yapılar (örn. portal zorunlu turlar) "en yüksek
ayna sayısı" seçiminde neredeyse hiç kazanamıyor ve gerçekleşen dağılım
istenen orandan sapıyordu.

Splitter varken birden fazla kaynak istenmesi, splitter'ın tek-kaynaklı
matematiksel gereklilik kanıtıyla (bkz. aşağıdaki "Doğrulama" bölümü)
çelişiyordu — bunu çözmek için `tryComplexBeam` eklendi: kaynaklardan sadece
biri splitter'a zorunlu yönlendirilir (kanıt korunur), kalan kaynaklar
bağımsız bacaklar olarak eklenir. Eski `tryMixedBeam`/`tryTwoIndependent`
fonksiyonları tek bir `tryMultiBeam(numSources, singleTarget)` fonksiyonunda
birleştirildi.

### Bulmaca üretim algoritması

1. **Yol-hedefli duvar yerleştirme**: duvarların tamamen rastgele hücrelere
   denenmesi yerine, her duvar denemesinin %75'i güncel çözüm yolu üzerindeki
   (simüle edilmiş ışının gerçekten geçtiği) boş bir hücreyi hedefler
   (`pathCellsForLegs()`) — bu, ışını gerçekten dolambaca zorluyor (ya da o
   alt-yol çözülemez hale gelip eleniyor), gerçek zorluğu güvenilir biçimde
   artırıyor. Kalan %25 tamamen rastgele kalır (çeşitlilik için).
   `trySingleBeam` (Kolay/Orta'nın tek kaynaklı turları) da aynı yol-hedefli
   mekanizmayı paylaşır.
2. **"En zorunu seç"**: `generate()` ilk geçerli bulmacayı kabul etmek yerine,
   her zorlukta birkaç (`TIER_CONFIG.candidates`, 3-6 arası) geçerli bulmaca
   üretip aralarından gerçek ayna sayısı en yüksek olanı seçer. `candidates`
   Kolay hariç tüm bantlarda düşürüldü; `maxWalls`/`wallChance` bilinçli
   olarak eski değerlere yakın bırakıldı (ölçüldü: bunları agresif kısmak
   splitter'sız `tryMultiBeam` yapısının bandın alt ucuna bile ulaşmasını
   neredeyse imkânsızlaştırıyordu — bkz. `generator.js` içindeki "MİRROR
   SAYISI KONTROLÜ" notu).

Üretim süresi anlık (Usta'da bile ortalama ~90ms).

### Renk kuralları

- `celltypes.js > colorComplement(c)` bir rengin r/g/b kanallarını tersine
  çevirir.
- **Paylaşılan/beyaz hedef kuralı**: bir bölümde beyaz (paylaşılan) bir hedef
  varsa, o bölümdeki kaynakların TÜMÜ oraya gitmelidir — kısmi birleşme
  desteklenmez. Bu kural sadece `tryComplexBeam`'in `singleTarget === true`
  dalında uygulanır: orada (splitter'ın iki kolu dahil) bulmacadaki tüm
  kaynaklar aynı hedefte birleşir ve renkleri matematiksel olarak her zaman
  beyaza (1,1,1) varır — 2 kaynaklı hedefte ilk kaynak rastgele bir primary,
  ikincisi onun tam tamamlayıcısı; 3 kaynaklı (Usta) hedefte üç farklı
  primary (R+G+B) kullanılır.
- `!singleTarget` dalında (birden fazla ayrı hedef) hiçbir renk birleşmez —
  splitter'ın iki kolu da kendi tek renkli hedefine gider, kalan her bağımsız
  kaynak da kendi tek renkli hedefine gider.
- `theme.js > COLOR_MAP`, "111" renk anahtarını `#FFFFFF`'e eşler; hedefin
  rengi union olarak her zaman tam beyaz çıktığından render otomatik doğru
  olur.
- Eğitim akışındaki karşılık gelen bulmaca (`onboarding.js >
  puzzle4RenkKarisimi`, başlığı "Birleşen Işınlar") bu kurala uygun: iki
  kaynak (kırmızı + kırmızının tam tamamlayıcısı cyan), hedef her zaman
  beyaz. Açıklama metni ("İki ışın aynı hedefte birleşirse, o hedef HER ZAMAN
  beyaz olur — beyaz bir küre gördüğünde, oraya birden fazla ışın göndermen
  gerektiğini anla") 9 dilde güncel.
- 120 üretilmiş bulmaca (orta/zor/usta) üzerinde otomatik test: beyaz/union
  renkli bir hedef VE birden fazla hedefi olan tek bir bulmaca bile
  bulunmadı (0/120).

### Doğrulama: splitter/portal gerekliliği ve baypas kontrolü

Splitter'ın "matematiksel olarak gerekli" kanıtı: source[0]'ın tek ışını,
splitter olmadan `tStraight`/`tTurn`'ün ikisine birden asla ulaşamaz.

`hasBypassSolution(puzzle, maxMirrors)` (`generator.js`, `tryComplexBeam`'in
sonunda çağrılıyor): splitter ve portal hücreleri bulmacadan tamamen silinip
(WALL değil, EMPTY — "bu mekanik hiç yokmuş gibi"), kaynakların hedeflere tüm
olası eşleşmeleri (her kaynak bir hedefe gider ya da hiçbir yere; birden
fazla kaynak aynı hedefi paylaşabilir) denenir. Herhangi bir eşleşme
`jointSolve` ile gerçekten çözülüyor VE oyuncunun eline verilecek ayna
hakkını (`maxMirrorsHint`) aşmıyorsa, bu bir baypas demektir — bulmaca adayı
tamamen elenir, `generate()` başka bir aday dener. Kaynak/hedef sayıları
küçük olduğu için (Usta'da en fazla 4×4 = 256 kombinasyon) performans etkisi
ihmal edilebilir düzeyde.

Doğrulama: elle inşa edilmiş, bilerek baypaslanabilir bir test bulmacasında
fonksiyon baypası doğru tespit etti (`true`); meşru bir test bulmacasında
yanlış pozitif vermedi (`false`). 46 gerçek `generate()` çıktısı (splitter
içeren zor/usta bulmacaları) üzerinde harici olarak yeniden çalıştırıldığında
sızan hiçbir baypas bulunamadı (0/46). Ayrıca 150 `generate('usta')` çağrısı
(gerçek oyunla birebir aynı `Math.random` kullanımıyla) üzerinde tekli-beyaz-
hedef/bağımsız-4-hedef dağılımı ölçüldü: ~50/50 (71/79) — sistematik bir
yanlılık tespit edilmedi.

## Ekonomi: günlük bulmaca hakkı

`gamestate.js`: 30 hak/gün, sürekli (kademeli değil) dolum — 24 saat ÷ 30 =
48 dakikada bir +1 hak. Ödüllü reklam izleyince +15 hak (`ads.js` →
`showRewardedAd()`). Sadece sonsuz mod bulmacaları hak tüketir, eğitim her
zaman ücretsiz. Hak biterse Zorluk Seç ekranında bir overlay açılır: "Reklam
İzle (+15 Hak)" / "Sınırsız Oyna" / "Kapat".

Zorluk bazlı hak maliyeti: `gamestate.js > DIFFICULTY_ALLOWANCE_COST = {
kolay: 1, orta: 1, zor: 2, usta: 3 }`, `allowanceCost(diff)` ile hesaplanır;
`canPlay(n = 1)` istenen miktar kadar hakkın olup olmadığını kontrol eder.

Zorluk Seç ekranındaki hak rozeti (`#allowance-badge`) bir metin değil,
yıldırım ikonlu bir buton — dokununca (hak dolu olsa bile) aynı popup'ı açar
(`showAllowanceOverlay()`), popup başlığı duruma göre uyarlanır: hak
tükenmişse "Bugünlük hakkın bitti", hak varsa "Ekstra Hak Al", sınırsızsa
"Sınırsız Aktif" (bu durumda reklam/satın alma butonları gizlenir).

## Reklamlar (AdMob)

`ads.js` (`@capacitor-community/admob`) — alt banner sadece oyun ekranında
gösteriliyor, ödüllü reklam hak popup'ından tetikleniyor. AdMob uygulama
ID'si ve banner/ödüllü reklam birimi ID'leri (`Prizma-banner`, `Prizma-odul`)
gerçek — Google'ın test ID'leri kullanılmıyor. AdMob konsolunda kullanılmayan
eski bir geçiş (interstitial) reklam birimi (`Prizma-gecis`) hâlâ duruyor;
kod tarafında hiç referans edilmiyor (bu projede interstitial reklam yok),
istenirse konsoldan silinebilir/arşivlenebilir.

## Uygulama içi satın alma (IAP)

`iap.js` (`cordova-plugin-purchase`) — 39,99 TL karşılığında tek seferlik
"sınırsız oyna" ürünü. Kod tarafı tamam; kalan adımlar Play Console
erişimi gerektirir (bkz. "Yayın öncesi tamamlanması gerekenler").

Google Play Billing resmi olarak kullanıldığı için politika riski
beklenmiyor; asıl dikkat edilmesi gereken mağaza açıklamasının net olması ve
"çocuklara yönelik" hedef kitle işaretliyse ebeveyn onayı (parental gate)
gerekliliği.

## Play Games liderlik tablosu

Play Games Services v2 kullanılıyor (ekstra backend gerektirmiyor); skor:
tek toplam skor, `GameState.totalPoints()` ile birebir aynı değer, "Ne kadar
iyisin?" ekranındaki puanla tutarlı.

İlgili dosyalar:
- `android/app/src/main/java/com/fmjapps/prizma/PlayGamesPlugin.java`
  (yerel/npm'e yayınlanmamış Capacitor plugin — signIn/submitScore/showLeaderboard)
- `www/js/leaderboard.js` (ads.js/iap.js ile aynı desende JS sarmalayıcı)
- `MainActivity.java` (plugin kaydı), `AndroidManifest.xml` (APP_ID
  meta-data), `strings.xml` (2 yer tutucu ID), `variables.gradle` +
  `app/build.gradle` (play-services-games-v2:22.0.0 bağımlılığı), `main.js`
  (init + skor gönderme + buton), `index.html` ("Ne kadar iyisin?"
  ekranındaki kupa ikonlu "Sıralama" butonu), `i18n.js` (9 dilde
  `stats.leaderboardUnavailable`).

Yer tutucu ID'ler değiştirilmeden plugin'in tüm metotları sessizce başarısız
olur (uygulama çökmez, buton görünür ama "Sıralama şu anda kullanılamıyor"
uyarısı çıkar) — bu yüzden aşağıdaki kurulum adımları tamamlanmadan da
uygulama normal şekilde derlenip çalışır, sadece liderlik tablosu özelliği
pasif kalır. Kurulum adımları "Yayın öncesi tamamlanması gerekenler"
bölümünde listeleniyor.

## Ses ve müzik

`audio.js`: projede tek bir ses dosyası olmadığı için Web Audio API
osilatörleriyle anlık sentezleniyor. Tarayıcı/WebView autoplay politikası
gereği ilk kullanıcı dokunuşunda (`main.js` → `unlockAudio()`) başlar.

Katmanlar:
- **Drone + akor pad'i**: zemin sesi.
- **Melody**: her akor için sabit sıralı 4 notalık bir motif (G majör
  diyatonik, pad akorlarıyla aynı tonalite):
  - G (I): sol4-si4-re5-si4
  - D (V): fa#4-la4-re5-la4
  - Em (vi): sol4-si4-re5-sol4
  - C (IV): sol4-do5-mi5-do5

  4 akor arka arkaya çalındığında bu motifler tek, baştan sona takip
  edilebilir bir ezgi hattı oluşturur (`scheduleMelodyForChord`, akorun 9
  saniyelik penceresine 4 notayı eşit dilimlere bölüp yayar). Notalar arası
  süreye küçük (±%9) rastgele bir sapma bırakılır (mekanik "tık tık"
  hissini önlemek için) — ama sıra rastgele değildir. Nota tınısı (yumuşak
  sine + uzun üstel sönüş).
- Çok yavaş (~45sn/döngü) stereo pan hareketi.
- Her akor geçişinde (9sn'de bir) yumuşak bir "chime" notası.
- Kısa "blip" efektleri: ayna yerleştir/kaldır, ateşle, çöz, yanlış, tık.

Tamamen Web Audio API sentezi, ek asset yok. Daha "prodüksiyon kalitesi" bir
ses isteniyorsa gerçek .mp3/.ogg dosyaları eklenip `audio.js` bunları
çalacak şekilde genişletilebilir.

**Not**: `www/` içeriği değiştikten sonra cihaza yansıması için her
seferinde `npx cap sync android` + Android Studio'da yeniden Build/Run
gerekiyor. Sync sonrası hâlâ eski içerik görünüyorsa/duyuluyorsa, WebView'ün
eski bir paketlenmiş sürümü önbellekte tutuyor olma ihtimaline karşı
uygulamayı cihazdan tamamen kaldırıp yeniden kurmak (uninstall + reinstall)
denenmeli.

## Bildirimler

`gamestate.js` her sonsuz-mod bulmaca başlangıcında 24 saatlik bir histogram
tutar (`playHours`, `mostPlayedHour()`); `notifications.js` bu saate göre
`@capacitor/local-notifications` ile günde bir kez tekrarlayan bir bildirim
planlar. Ayarlardan kapatılabilir.

## Görsel kimlik

**Ana menü logosu** (`logo.js > renderLogo()`): tek renk (nötr,
`UI.textPrimary`), ince çizgi sanatı — prizmaya giren tek ışın + üçgenden
farklı açıyla kırılan tek çıkış ışını.

**Uygulama/launcher icon**: `logo.js`'in kendisiyle neredeyse birebir aynı —
tek bir giriş ışını, üçgen prizma anahatı (dolgu yok), tek bir çıkış ışını,
hepsi tek renk (`UI.textPrimary` #E6F2FF), koyu `#0B0C12` (UI.bgDeep) zemin
üzerinde çok hafif/tek renkli bir halo ile — "az elemanla anlat" prensibi,
sadece küçük boyutta okunsun diye çizgiler biraz kalınlaştırıldı. Standart
Android adaptive-icon yapısı dolduruldu:

- `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
  {ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png}` —
  Capacitor'ın varsayılan yer tutucu ikonlarının yerine geçti (doğru
  piksel boyutlarında: legacy 48/72/96/144/192, adaptive foreground 108dp
  tabanında aynı yoğunluk çarpanlarıyla 108/162/216/324/432). Foreground
  katmanı Android'in adaptive-icon "safe zone" dairesinin içinde kalacak
  şekilde küçük tutuldu (farklı launcher maskelerinde kırpılmasın diye),
  legacy/round ikonlar ise koyu zeminle birlikte tam kare kaplıyor.
- `android/app/src/main/res/values/ic_launcher_background.xml`: Capacitor'ın
  varsayılan beyaz (`#FFFFFF`) adaptive-icon arka planı, uygulamanın koyu
  temasıyla eşleşsin diye `#0B0C12`'ye çevrildi.
- Play Store mağaza listeleme sayfası için ayrı bir 512x512 ikon da
  (`play-store-icon-512.png`) mevcut — bu dosya APK'nın bir parçası
  değil, Play Console'daki "Uygulama simgesi" alanına elle yüklenmesi
  gerekiyor.
- İkonlar Python/Pillow ile üretildi; üretim script'i proje köküne
  eklenmedi (proje dışı bir araç).

İkonları değiştirdikten sonra `npx cap sync android` çalıştırıp yeniden
derlemek yeterli — yeni ikonlar otomatik paketlenir.

## İstatistik ekranı ("Ne kadar iyisin?")

Ana menüde "Başla" ile "Eğitimi Tekrar Oyna" arasında bir buton
(`#btn-stats`, eğitim tamamlanana kadar gizli). Açılan ekran
(`#screen-stats`), her zorluk için görsel bir çubuk (çözülen sayısına göre
ölçekli, zorluğun kendi rengiyle) + "en iyi süre" + "ortalama süre" gösterir,
üstte toplam çözülen bulmaca ve en iyi seri özet kartları var. `gamestate.js`
→ `stats[diff].totalTimeMs` alanı (her çözümde `recordSolve()` içinde
biriktirilir) ortalama süre hesaplamak için kullanılır; eski kayıtlarda bu
alan yoksa `_load()` varsayılanla birleştirip 0'la doldurur (crash riski
yok). Ekranın üst çubuğunda ayrıca liderlik tablosunu açan bir "Sıralama"
butonu var.

Eğitim tamamlandığında oyuncu doğrudan zorluk seçimine değil, önce
tamamlandığını bildiren ayrı bir ekrana yönlendirilir
(`#onboarding-done-overlay`), oradan "OYNA" ile zorluk seçimine geçilir.

## Bilinçli v1 sınırlamaları

- Tam "yanıltıcılık" (decoy) puanlaması çalıştırılmıyor; sadece gerçek
  minimum ayna sayısı (+ duvar/portal kalibrasyonu) filtre olarak
  kullanılıyor.
- Çoklu dil desteği (arayüz metinleri hariç, tam yerelleştirme anlamında)
  bilinçli olarak ertelendi.
- Müzik/efektler Web Audio API sentezi — gerçek stüdyo ses dosyası değil
  (proje hiç asset içermiyor). Daha "prodüksiyon kalitesi" bir ses
  isteniyorsa gerçek .mp3/.ogg dosyaları eklenip `audio.js` bunları çalacak
  şekilde genişletilebilir.
- Reklam/bildirim/satın alma pluginleri koda güvenli biçimde (plugin yokken
  sessizce no-op) entegre edildi, ama gerçek reklam birimi ID'leri ve Play
  Console ürün/billing kurulumu tamamlanmalı (bkz. "Yayın öncesi
  tamamlanması gerekenler").

## Önemli bir teknik not: SVG glow filtresi ve sıfır-bbox tuzağı

`board.js` ve `logo.js`, glow için `feGaussianBlur` + `feMerge` filtreleri
kullanıyor. İlk sürümde bu filtreler `objectBoundingBox` birimiyle
(`x="-80%" y="-80%" ...`) tanımlanmıştı — bu, **tam yatay veya tam dikey**
bir çizginin (örn. düz giden bir ışın, ya da yatay/dikey bir kenar) bounding
box'ının bir eksende yüksekliği/genişliği 0 olduğu için filtre bölgesinin de
0'a düşmesine ve **elemanın tamamen görünmez olmasına** yol açıyordu (menüdeki
orta ışının kaybolmasıyla fark edildi, test sırasında yakalandı ve düzeltildi).
Çözüm: `filterUnits="userSpaceOnUse"` + sabit piksel dolgu (`x="-2000" ...`)
kullanmak. **Bu dosyalara yeni glow'lu eleman eklerken bu tuzağa tekrar
düşülmemeli** — her zaman `userSpaceOnUse` + sabit dolgu kullanılmalı, yüzde
tabanlı filtre bölgesine dönülmemeli.

## Test

- `node tests/logic_test.mjs` — solver, generator (zorluk bantları +
  splitter/portal dağılım oranları + özel tur sıklığı dahil), onboarding
  bulmacalarının gerçek minimum ayna sayılarını ve çözülebilirliğini
  doğrular. Şu an 39 kontrol, hepsi geçiyor.
- Görsel doğrulama Playwright + headless Chromium ile yapıldı (menü + logo,
  ayarlar ekranı, zorluk seçimi + hak rozeti, hak-bitti overlay'i, grafik
  geri butonu, portal çıkış oku, 7 onboarding bulmacası + sonsuz mod) —
  ad-hoc test scriptleri proje dosyalarına dahil edilmedi.

## Yayın öncesi tamamlanması gerekenler

Aşağıdaki adımlar Play Console erişimi gerektirdiği için depo içinden
otomatikleştirilemez:

**Uygulama içi satın alma (`iap.js`):**
1. Play Console'da `prizma_unlimited` ID'li (ya da `iap.js`'te değiştirilmiş
   bir ID'li), tek seferlik/yönetilen bir ürün oluşturup fiyatını 39,99 TL
   yapın.

**Play Games liderlik tablosu:**
1. Play Console'da bir Google Cloud projesini oyuna bağlayıp Play Games
   Services'i kurun (Grow users > Play Games Services > Setup and
   management > Configuration) — oradaki sayısal Proje Kimliği'ni
   `strings.xml > game_services_project_id` içine yapıştırın.
2. Credentials bölümünden Android tipi bir OAuth istemcisi ekleyin (paket
   adı `com.fmjapps.prizma` + imzalama anahtarınızın SHA-1'i).
3. Setup and management > Leaderboards'tan yeni bir liderlik tablosu
   oluşturup ("Toplam Puan" gibi bir isim, sayı formatında, azalan sıralı)
   yayınlayın (Publish) — sayfasında görünen ID'yi
   `strings.xml > leaderboard_id_total_points` içine yapıştırın.
4. Setup and management > Testers'a kendi Google hesabınızı ekleyin — bu
   olmadan yayın öncesi girişler çalışmaz.
5. `npx cap sync android` çalıştırıp yeniden derleyin.

**Reklamlar (AdMob):** Banner ve ödüllü reklam birimi ID'leri zaten gerçek
ID'lerle yapılandırılmış durumda; ek bir işlem gerekmiyor. Konsolda
kullanılmayan bir eski geçiş (interstitial) birimi kaldı — isterseniz
silin/arşivleyin.

**Genel:** `www/` içeriğinde her değişiklikten sonra `npx cap sync android`
çalıştırıp Android Studio'da (ya da `./gradlew`) yeniden derleyin.
