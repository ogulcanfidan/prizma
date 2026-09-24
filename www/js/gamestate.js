// GameState — Sudoku-modeli ilerlemeyi tutar: "level N" yok, bunun yerine
// zorluk başına çözülen bulmaca sayısı, en iyi süre ve mevcut/en iyi seri
// (streak) tutulur. localStorage'a kaydedilir (Godot sürümünde user://
// prizma_stats.json idi — web/Capacitor'de doğal karşılığı localStorage).
// Godot autoload/GameState.gd dosyasının birebir JS karşılığı.
//
// v2 (genişletildi — aynı SAVE_KEY korunuyor, eski kayıtlar yeni alanlar
// için varsayılanlarla sorunsuz yükleniyor):
//  - settings: müzik/efekt sesi seviyesi + günlük bildirim açık/kapalı.
//  - playHours: 24 saatlik "en çok ne zaman oynadı" histogramı — bildirim
//    saatini hesaplamak için (bkz. notifications.js).
//  - allowance: günlük bulmaca hakkı ekonomisi — hakkın gün içinde kademeli
//    değil SÜREKLİ (anlık, adım adım değil) dolması hedeflenir: 24 saat /
//    30 hak = 48 dakikada bir +1 hak. Reklam izleyince +15, 39.99 TL'lik
//    uygulama içi alımla `unlimited=true` olup hak hiç tükenmez.

const SAVE_KEY = "prizma_stats_v1";

export const DIFFICULTIES = ["kolay", "orta", "zor", "usta"];

// --- Puan + Ünvan sistemi ----------------------------------------------------
// "Ne kadar iyisin?" ekranındaki üst özet artık ham "toplam çözülen bulmaca
// sayısı" yerine PUAN gösteriyor (zorluk arttıkça puan da orantısız artıyor,
// böylece zor/usta çözmek gerçek anlamda daha çok "değer" taşıyor) ve "en iyi
// seri" yerine bu toplam puana göre belirlenen bir ÜNVAN gösteriyor (bkz.
// main.js → refreshStats). Puan sınırları (0-500 / 500-1500 / 1500-3000 /
// 3000-5000 / 5000+) tasarım kararıyla belirlendi; ünvan adları oyunun
// Işın/Prizma temasına uygun, zorluk etiketleriyle (Kolay/Orta/Zor/Usta)
// çakışmayan, artan prestijde bir sıralama olacak şekilde seçildi.
export const DIFFICULTY_POINTS = { kolay: 1, orta: 5, zor: 9, usta: 17 };

// Zorluğa göre değişken hak tüketimi: kolay ve orta bulmacalar için 1, zor
// için 2, usta için 3 kredi harcanır. Eskiden TÜM zorluklar sabit 1 hak
// tüketiyordu (main.js -> tryStartEndlessPuzzle -> consumeAllowance(1));
// artık zorluğa göre değişken. `consumeAllowance` zaten değişken `n`
// parametresi kabul ediyordu (bkz. aşağıda) — sadece main.js'teki çağrı
// sitesi bu haritayla güncellendi.
export const DIFFICULTY_ALLOWANCE_COST = { kolay: 1, orta: 1, zor: 2, usta: 3 };

export function allowanceCost(diff) {
  return DIFFICULTY_ALLOWANCE_COST[diff] || 1;
}

const RANK_TIERS = [
  { min: 0, max: 500, key: "newPlayer" },
  { min: 500, max: 1500, key: "amateur" },
  { min: 1500, max: 3000, key: "expert" },
  { min: 3000, max: 5000, key: "prismMaster" },
  { min: 5000, max: Infinity, key: "legend" },
];

// Sadece rütbe ANAHTARINI döner (görünen metin i18n.js → t('rank.'+key) ile
// dile göre üretilir — bkz. main.js → refreshStats).
export function rankKeyForPoints(points) {
  for (const tier of RANK_TIERS) {
    if (points >= tier.min && points < tier.max) return tier.key;
  }
  return RANK_TIERS[RANK_TIERS.length - 1].key;
}

export const ALLOWANCE_CAP = 30;
// "24 saati 30'a böl, uygula" — 24*60/30 = 48 dakikada bir +1 hak.
export const ALLOWANCE_REFILL_MS = (24 * 60 * 60 * 1000) / ALLOWANCE_CAP;
export const REWARDED_AD_BONUS = 15;

function defaultStats() {
  const d = {};
  for (const diff of DIFFICULTIES) {
    // totalTimeMs — "Ne kadar iyisin?" istatistik ekranında ortalama süre
    // hesaplamakta kullanılır (bkz. recordSolve/averageTimeMs).
    d[diff] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
  }
  return d;
}

// En iyi süre birleştirme: -1 "hiç yok" demek, aksi halde KÜÇÜK olan kazanır.
function bestTime(a, b) {
  const x = typeof a === "number" ? a : -1;
  const y = typeof b === "number" ? b : -1;
  if (x < 0) return y;
  if (y < 0) return x;
  return Math.min(x, y);
}

function defaultDaily() {
  return { lastDate: null, streak: 0, bestStreak: 0, solvedCount: 0, bestTimeMs: -1 };
}

function defaultSettings() {
  // language: "auto" (varsayılan — cihaz diline göre otomatik algıla, bkz.
  // i18n.js → detectLanguage) ya da desteklenen bir dil kodu (kullanıcı
  // Ayarlar'dan elle seçtiyse, bkz. i18n.js → setLanguage).
  return {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    notificationsEnabled: true,
    language: "auto",
    vibrationEnabled: true,
    // Renk körlüğü modu: hedef/kaynak kürelerin üstüne renge EK olarak şekil
    // rozeti çizilir (bkz. board.js → colorGlyph).
    colorBlindMode: false,
  };
}

class GameStateStore {
  constructor() {
    this.stats = defaultStats();
    this.onboardingCompleted = false;
    this.settings = defaultSettings();
    this.playHours = new Array(24).fill(0);
    this.allowance = ALLOWANCE_CAP;
    this.allowanceLastUpdateMs = Date.now();
    this.daily = defaultDaily();
    // Açılmış Play Games başarıları (bkz. achievements.js) — giriş yokken de
    // işaretlenir, giriş olunca toplu gönderilir.
    this.unlockedAchievements = {};
    // Kampanya (Bölümler) ilerlemesi: { "12": { timeMs } } — çözülen bölümler.
    this.campaign = {};
    this.unlimited = false;
    this._load();
    this._refillAllowance();
  }

  recordSolve(difficulty, timeMs) {
    if (!this.stats[difficulty]) {
      this.stats[difficulty] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
    }
    const s = this.stats[difficulty];
    s.solved += 1;
    s.totalTimeMs = (s.totalTimeMs || 0) + timeMs;
    if (s.bestTimeMs < 0 || timeMs < s.bestTimeMs) s.bestTimeMs = timeMs;
    s.currentStreak += 1;
    if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
    this._save();
  }

  recordFailOrSkip(difficulty) {
    if (!this.stats[difficulty]) {
      this.stats[difficulty] = { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
    }
    this.stats[difficulty].currentStreak = 0;
    this._save();
  }

  // Ortalama çözüm süresi (ms) — hiç çözülmediyse YA DA süre verisi hiç
  // birikmediyse (totalTimeMs alanının eklenmesinden ÖNCEKİ eski kayıtlardan
  // gelen "solved" sayıları — bu çözümlerin gerçek süresi hiç kaydedilmemişti)
  // -1 döner. Bu, bazı zorluklarda ortalama sürenin hiç hesaplanmadığı
  // sorununun kök sebebiydi — eski solved>0 kayıtlarında totalTimeMs=0
  // olduğu için ortalama yanlışlıkla "00:00" gösteriliyordu; şimdi bu
  // durumda dürüstçe "—" gösteriliyor (bkz. main.js → formatStatTime), yeni
  // çözümler biriktikçe gerçek ortalama görünmeye başlar.
  averageTimeMs(difficulty) {
    const s = this.stats[difficulty];
    if (!s || !s.solved || !s.totalTimeMs) return -1;
    return Math.round(s.totalTimeMs / s.solved);
  }

  // Tüm zorluklardaki çözümlerden toplam puan (bkz. DIFFICULTY_POINTS).
  totalPoints() {
    let total = 0;
    for (const diff of DIFFICULTIES) {
      const s = this.stats[diff];
      if (s) total += (s.solved || 0) * (DIFFICULTY_POINTS[diff] || 0);
    }
    return total;
  }

  markOnboardingCompleted() {
    this.onboardingCompleted = true;
    this._save();
  }

  // --- Oynama saatleri ---------------------------------------------------
  // NOT: `notifications.js` artık bildirim saatini BUNDAN hesaplamıyor (bkz.
  // `msUntilFullAllowance()` ve dosya başındaki not) — "belirli saatte
  // değil, hak dolunca" mantığına geçildi. Histogram yine de tutuluyor
  // (ileride başka bir amaçla kullanılabilir, kaldırmak veri kaybı dışında
  // bir fayda sağlamıyor).

  // Her oyun ekranına girişte (onboarding hariç, bkz. main.js) çağrılır.
  recordPlaySession() {
    const hour = new Date().getHours();
    this.playHours[hour] = (this.playHours[hour] || 0) + 1;
    this._save();
  }

  // En çok oynanan saat (0-23) ya da hiç veri yoksa null.
  mostPlayedHour() {
    let best = -1;
    let bestCount = 0;
    for (let h = 0; h < 24; h++) {
      if ((this.playHours[h] || 0) > bestCount) {
        bestCount = this.playHours[h];
        best = h;
      }
    }
    return bestCount > 0 ? best : null;
  }

  // --- Ayarlar ---------------------------------------------------------------

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this._save();
  }

  // --- Günlük bulmaca hakkı ekonomisi -----------------------------------------

  // Son kayıtlı zamandan bu yana geçen süreyi sürekli (kesirli) hak olarak
  // hesaba katar — "kademeli değil, gün içinde sürekli dolsun" isteği.
  // Cihaz saati ileri alınarak bedava hak kazanılmasına karşı koruma.
  // performance.now() KULLANICI TARAFINDAN DEĞİŞTİRİLEMEZ (uygulama açıldığı
  // andan beri geçen gerçek süre). Uygulama AÇIKKEN duvar saati, bu gerçek
  // süreden belirgin biçimde (>60 sn) fazla ilerlediyse saat elle
  // değiştirilmiş demektir — o durumda gerçek süre esas alınır.
  // (Uygulama kapalıyken yapılan saat değişikliği sunucu olmadan tespit
  // edilemez; hak tavanı 30 olduğu için kazanç yine de sınırlıdır.)
  _trustedNow() {
    const now = Date.now();
    if (this._sessionWallStart === undefined) {
      this._sessionWallStart = now;
      this._sessionPerfStart = performance.now();
      return now;
    }
    const expected = this._sessionWallStart + (performance.now() - this._sessionPerfStart);
    return now > expected + 60000 ? expected : now;
  }

  _refillAllowance() {
    if (this.unlimited) return;
    const now = this._trustedNow();
    const elapsed = now - this.allowanceLastUpdateMs;
    if (elapsed <= 0) return;
    const gained = elapsed / ALLOWANCE_REFILL_MS;
    if (this.allowance < ALLOWANCE_CAP) {
      this.allowance = Math.min(ALLOWANCE_CAP, this.allowance + gained);
    }
    this.allowanceLastUpdateMs = now;
  }

  // Tam sayı olarak gösterilecek kalan hak (UI için) — sınırsızsa Infinity.
  // (bkz. _trustedNow — saat oynamalarına karşı koruma)
  get remainingAllowance() {
    this._refillAllowance();
    return this.unlimited ? Infinity : Math.floor(this.allowance);
  }

  // n artık zorluğa göre değişken maliyet olabilir (bkz.
  // allowanceCost/DIFFICULTY_ALLOWANCE_COST) — varsayılan 1, eski
  // çağrı yerleriyle (n verilmeden) geriye dönük uyumlu.
  canPlay(n = 1) {
    return this.unlimited || this.remainingAllowance >= n;
  }

  // Yeni bir bulmaca başlatmadan önce çağrılır. Yetmezse false döner (main.js
  // reklam izleme / sınırsız alım teklifini gösterir).
  consumeAllowance(n = 1) {
    if (this.unlimited) return true;
    this._refillAllowance();
    if (this.allowance < n) return false;
    this.allowance -= n;
    this._save();
    return true;
  }

  // Ödüllü reklam izleyince çağrılır. Bonus eklenirken de ALLOWANCE_CAP'e
  // sıkıca sınırlanıyor (eskiden sadece doğal dolumda sınırlanıyordu, reklam
  // bonusu tavanı aşabiliyordu — örn. 20 hak varken reklam izleyip 35'e
  // çıkabiliyordu).
  addAllowance(n) {
    this._refillAllowance();
    this.allowance = Math.min(ALLOWANCE_CAP, this.allowance + n);
    this._save();
  }

  // 39.99 TL uygulama içi alım tamamlanınca çağrılır.
  grantUnlimited() {
    this.unlimited = true;
    this._save();
  }

  // Bir sonraki +1 hakka kalan süre (ms) — 0 ise zaten tavanda/sınırsız.
  msUntilNextAllowance() {
    if (this.unlimited) return 0;
    this._refillAllowance();
    if (this.allowance >= ALLOWANCE_CAP) return 0;
    const frac = this.allowance - Math.floor(this.allowance);
    return Math.max(0, Math.round((1 - frac) * ALLOWANCE_REFILL_MS));
  }

  // TAMAMEN dolmasına (ALLOWANCE_CAP) kalan süre (ms) — 0 ise zaten tavanda/
  // sınırsız. `notifications.js` artık günün sabit bir saatinde DEĞİL, hak
  // tam dolduğu ANDA bir kereliğine bildirim planlamak için bunu kullanıyor.
  msUntilFullAllowance() {
    if (this.unlimited) return 0;
    this._refillAllowance();
    if (this.allowance >= ALLOWANCE_CAP) return 0;
    const remainingPoints = ALLOWANCE_CAP - this.allowance;
    return Math.max(0, Math.round(remainingPoints * ALLOWANCE_REFILL_MS));
  }

  _load() {
    this.stats = defaultStats();
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) return;
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) return;
      if (parsed.stats) {
        for (const diff of DIFFICULTIES) {
          // Eski kayıtlarda totalTimeMs yok — varsayılanla birleştirip
          // eksik alanı 0'la dolduruyoruz (crash/NaN önlemi).
          if (parsed.stats[diff]) this.stats[diff] = { ...this.stats[diff], ...parsed.stats[diff] };
        }
      }
      if (typeof parsed.onboardingCompleted === "boolean") {
        this.onboardingCompleted = parsed.onboardingCompleted;
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        this.settings = { ...defaultSettings(), ...parsed.settings };
      }
      if (Array.isArray(parsed.playHours) && parsed.playHours.length === 24) {
        this.playHours = parsed.playHours.map((n) => (typeof n === "number" && n >= 0 ? n : 0));
      }
      if (parsed.campaign && typeof parsed.campaign === "object") {
        this.campaign = { ...parsed.campaign };
      }
      if (parsed.unlockedAchievements && typeof parsed.unlockedAchievements === "object") {
        this.unlockedAchievements = { ...parsed.unlockedAchievements };
      }
      if (parsed.daily && typeof parsed.daily === "object") {
        this.daily = { ...defaultDaily(), ...parsed.daily };
      }
      if (typeof parsed.allowance === "number" && !Number.isNaN(parsed.allowance)) {
        this.allowance = parsed.allowance;
      }
      if (typeof parsed.allowanceLastUpdateMs === "number" && parsed.allowanceLastUpdateMs > 0) {
        this.allowanceLastUpdateMs = parsed.allowanceLastUpdateMs;
      }
      if (typeof parsed.unlimited === "boolean") {
        this.unlimited = parsed.unlimited;
      }
    } catch (e) {
      console.error("GameState: kayıt okunamadı", e);
    }
  }

  // --- Kampanya (Bölümler) --------------------------------------------------
  // Bölümler SIRAYLA açılır: bir bölüm, kendisinden önceki çözülmüşse oynanır
  // (ilk bölüm her zaman açık).
  isLevelSolved(index) {
    return !!this.campaign[String(index)];
  }

  isLevelUnlocked(index) {
    return index === 0 || this.isLevelSolved(index - 1);
  }

  levelBestTime(index) {
    const rec = this.campaign[String(index)];
    return rec && typeof rec.timeMs === "number" ? rec.timeMs : -1;
  }

  get campaignSolvedCount() {
    return Object.keys(this.campaign).length;
  }

  // Çözülmüş bölümlerin EN İYİ sürelerinin toplamı (ms). Bölüm listesinde
  // ve "tüm bölümler bitti" ekranında gösterilir; oyuncunun kendi rekorunu
  // kırmak için tekrar oynamasına sebep olan tek sayı bu (her bölümde daha
  // hızlı bir tur, toplamı düşürür).
  get campaignTotalTimeMs() {
    let sum = 0;
    for (const rec of Object.values(this.campaign)) {
      if (rec && typeof rec.timeMs === "number" && rec.timeMs > 0) sum += rec.timeMs;
    }
    return sum;
  }

  campaignAllSolved(total) {
    for (let i = 0; i < total; i++) if (!this.isLevelSolved(i)) return false;
    return true;
  }

  // İlk çözülmemiş bölümün indeksi (hepsi çözüldüyse son bölüm).
  nextLevelIndex(total) {
    for (let i = 0; i < total; i++) if (!this.isLevelSolved(i)) return i;
    return Math.max(0, total - 1);
  }

  recordLevelSolve(index, timeMs) {
    const key = String(index);
    const prev = this.campaign[key];
    const ms = Math.round(timeMs);
    if (!prev || ms < prev.timeMs) this.campaign[key] = { timeMs: ms };
    this._save();
  }

  isAchievementUnlocked(key) {
    return !!this.unlockedAchievements[key];
  }

  markAchievementUnlocked(key) {
    if (this.unlockedAchievements[key]) return;
    this.unlockedAchievements[key] = true;
    this._save();
  }

  // --- Bulut kayıt (bkz. cloudsave.js) --------------------------------------
  // Dışa aktarılan yapı, localStorage'a yazılanla AYNI alanları taşır.
  exportState() {
    return {
      v: 1,
      stats: this.stats,
      onboardingCompleted: this.onboardingCompleted,
      settings: this.settings,
      playHours: this.playHours,
      daily: this.daily,
      campaign: this.campaign,
      unlockedAchievements: this.unlockedAchievements,
      unlimited: this.unlimited,
    };
  }

  // Buluttan gelen kaydı yereldekiyle BİRLEŞTİRİR — hiçbir ilerleme
  // KAYBOLMAZ: her alanda "daha ileri" olan taraf kazanır (çözüm sayıları
  // ve seriler için büyük olan, en iyi süreler için küçük olan). Bulmaca
  // hakkı (allowance) BİLEREK dışarıda: zamana bağlı ve cihaza özel, ayrıca
  // iki cihazdan hak biriktirmeye açık olurdu.
  mergeState(remote) {
    if (!remote || typeof remote !== "object") return false;
    let changed = false;
    if (remote.stats && typeof remote.stats === "object") {
      for (const diff of DIFFICULTIES) {
        const r = remote.stats[diff];
        if (!r) continue;
        const l = this.stats[diff] || { solved: 0, bestTimeMs: -1, totalTimeMs: 0, currentStreak: 0, bestStreak: 0 };
        const merged = {
          solved: Math.max(l.solved || 0, r.solved || 0),
          totalTimeMs: Math.max(l.totalTimeMs || 0, r.totalTimeMs || 0),
          bestTimeMs: bestTime(l.bestTimeMs, r.bestTimeMs),
          currentStreak: Math.max(l.currentStreak || 0, r.currentStreak || 0),
          bestStreak: Math.max(l.bestStreak || 0, r.bestStreak || 0),
        };
        if (JSON.stringify(merged) !== JSON.stringify(l)) changed = true;
        this.stats[diff] = merged;
      }
    }
    if (remote.onboardingCompleted && !this.onboardingCompleted) {
      this.onboardingCompleted = true;
      changed = true;
    }
    if (remote.unlimited && !this.unlimited) {
      this.unlimited = true;
      changed = true;
    }
    if (remote.daily && typeof remote.daily === "object") {
      const r = remote.daily;
      const l = this.daily;
      // Daha yeni tarih daha güncel seriyi taşır; en iyiler her zaman maksimum.
      const remoteNewer = (r.lastDate || "") > (l.lastDate || "");
      this.daily = {
        lastDate: remoteNewer ? r.lastDate : l.lastDate,
        streak: remoteNewer ? r.streak || 0 : l.streak || 0,
        bestStreak: Math.max(l.bestStreak || 0, r.bestStreak || 0),
        solvedCount: Math.max(l.solvedCount || 0, r.solvedCount || 0),
        bestTimeMs: bestTime(l.bestTimeMs, r.bestTimeMs),
      };
      if (remoteNewer) changed = true;
    }
    if (remote.campaign && typeof remote.campaign === "object") {
      for (const [key, rec] of Object.entries(remote.campaign)) {
        const ms = rec && typeof rec.timeMs === "number" ? rec.timeMs : -1;
        const local = this.campaign[key];
        if (!local || (ms >= 0 && ms < local.timeMs)) {
          this.campaign[key] = { timeMs: ms >= 0 ? ms : local ? local.timeMs : 0 };
          changed = true;
        }
      }
    }
    if (remote.unlockedAchievements && typeof remote.unlockedAchievements === "object") {
      for (const key of Object.keys(remote.unlockedAchievements)) {
        if (remote.unlockedAchievements[key] && !this.unlockedAchievements[key]) {
          this.unlockedAchievements[key] = true;
          changed = true;
        }
      }
    }
    if (changed) this._save();
    return changed;
  }

  // --- Günlük bulmaca + seri ------------------------------------------------
  // Oyuncunun ertesi gün geri gelmesi için: her gün TEK bir bulmaca, tarihten
  // türetilen sabit bir tohumla üretilir (bkz. puzzleService → takeDaily).
  // Seri (streak) ardışık gün çözümüyle artar, bir gün atlanınca 1'e döner.
  // Tarih anahtarı CİHAZIN YEREL tarihidir ("YYYY-MM-DD").

  static dateKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  dailySolvedToday() {
    return this.daily.lastDate === GameStateStore.dateKey();
  }

  // Seri, dün de çözülmüşse devam eder; bugün zaten çözüldüyse değişmez.
  recordDailySolve(timeMs) {
    const today = GameStateStore.dateKey();
    if (this.daily.lastDate === today) return; // aynı gün ikinci çözüm seriyi artırmaz
    const yesterday = GameStateStore.dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    this.daily.streak = this.daily.lastDate === yesterday ? this.daily.streak + 1 : 1;
    if (this.daily.streak > this.daily.bestStreak) this.daily.bestStreak = this.daily.streak;
    this.daily.lastDate = today;
    this.daily.solvedCount += 1;
    if (typeof timeMs === "number" && (this.daily.bestTimeMs < 0 || timeMs < this.daily.bestTimeMs)) {
      this.daily.bestTimeMs = Math.round(timeMs);
    }
    this._save();
  }

  // Gösterim için: seri bugün ya da dün çözülmemişse KIRILMIŞ sayılır.
  get dailyStreak() {
    const today = GameStateStore.dateKey();
    const yesterday = GameStateStore.dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (this.daily.lastDate === today || this.daily.lastDate === yesterday) return this.daily.streak;
    return 0;
  }

  _save() {
    try {
      const payload = {
        daily: this.daily,
        campaign: this.campaign,
        unlockedAchievements: this.unlockedAchievements,
        stats: this.stats,
        onboardingCompleted: this.onboardingCompleted,
        settings: this.settings,
        playHours: this.playHours,
        allowance: this.allowance,
        allowanceLastUpdateMs: this.allowanceLastUpdateMs,
        unlimited: this.unlimited,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("GameState: kayıt yazılamadı", e);
    }
  }
}

export const GameState = new GameStateStore();

// Bugünün yerel tarih anahtarı ("YYYY-MM-DD") — günlük bulmaca için.
export function todayKey() {
  return GameStateStore.dateKey();
}
