# UĞULTU

**Android ve iOS için üçüncü şahıs kameralı survival horror.** Three.js + TypeScript ile yazıldı; [Capacitor](https://capacitorjs.com) ile native Android (APK/AAB) ve iOS (Xcode) uygulaması olarak derlenir ([`docs/NATIVE.md`](docs/NATIVE.md)). Aynı oyunun web sürümü yalnızca iPad'den hızlı test içindir ([`docs/DEPLOY.md`](docs/DEPLOY.md)). Tüm assetler ücretsizdir (bkz. [`ASSET_LICENSES.md`](ASSET_LICENSES.md)).

> *2006, Kasım. Telsiz teknisyeni Ela Demir, gece 03:17'de 1996'dan beri karantinada olan maden kasabası Karaçam'ın ölü sivil savunma frekansında on yıl önce kaybolan babasının sesini duyar: "Ela. Kapat onu."*

## Oynanış

| | |
|---|---|
| **Bölümler** | Orman Yolu → Karaçam (kasaba) → Sağlık Ocağı → Maden Sahası → Meridyen Tesisi (-410) → KORO (final) |
| **Düşmanlar** | **Oyuk** (devriye, sesle araştırır, yakalar), **Pusucu** (ölü gibi yatar, sıçrar, vur-kaç yapar), **Şişkin** (yavaş, çok dayanıklı, iz sürer), **Dinleyen** (kör, öldürülemez, yalnızca sesle avlar), **KORO** (boss) |
| **Silahlar** | Demir boru (yakın), 9mm tabanca, pompalı tüfek; çakı (yakalanınca otomatik kurtarır), işaret fişeği (ışık + ses ile oyalar) |
| **Kaynaklar** | Mermi, fişek, bandaj, ilk yardım, adrenalin, pil (fener şarjı), sırt çantası (+4 yuva), anahtarlar/görev eşyaları |
| **Hikâye** | 19 belge (not, resmî yazı, hasta dosyası, çocuk çizimi, kaset); çevresel anlatım; tek bir final + epilog |
| **Kayıt** | Telsizlerde manuel kayıt + bölge girişinde ve 90 sn'de bir otomatik kayıt + uygulama arka plana alındığında kayıt |

### Mobil kontroller
* **Sol yarı:** dokunduğun yerde beliren joystick (sonuna kadar itersen koşarsın — ama gürültü yapar).
* **Sağ yarı:** kamera sürükleme.
* **Bağlamsal butonlar:** Ateş/Saldırı, Nişan (dokun-aç/kapa, yumuşak nişan yardımı), Etkileşim (yalnızca yakında bir şey varken, etiketli), Şarjör (yalnızca gerektiğinde), Eğil, İyileş (yalnızca canın azken).
* **Üst:** silah değiştir, fener, envanter, duraklat. Solak düzen, buton boyutu/opaklığı ayarlanabilir.
* Klavye/fare (WASD, fare, E, R, C, Shift, Tab, L, Q, H, G, Esc) ve gamepad de desteklenir.

## Teknik özet
* **Bölüm formatı:** ASCII ızgara (1 karakter = 2 m) → malzeme başına tek mesh'e birleştirilmiş zemin/duvar/tavan, çarpışma ızgarası, A* + görüş hattı (DDA). Haritalar `tools/maps/*.py` ile üretilir.
* **Işık:** sabit boyutlu dinamik nokta ışık havuzu (shader yeniden derlemesi yok), CPU'da pişirilmiş AO + dolaylı ışık (vertex attribute, duvarlardan gölgeli), gölgeli el feneri, titreyen/yanıp sönen lambalar, hacimsel ışık konileri, fener huzmesinde görünen toz.
* **Optimizasyon:** prop'lar tek materyalli vertex-color paketler ve 16 m'lik chunk'lara birleştirilir; ağaçlar için mesafe LOD'u; düşmanlar için düşük poligonlu gövde; uzak düşmanlarda AI/animasyon seyreltme; bölge geçişinde GPU texture boşaltma; dinamik çözünürlük; 3 kalite kademesi (render ölçeği, MSAA, post-process, bloom, gölge, ışık sayısı, çizim mesafesi, parçacık yoğunluğu, texture çözünürlüğü).
* **Ses:** Web Audio; audio sprite, rastgele perde/ses varyasyonu, HRTF, duvar arkası boğuklaştırma (oklüzyon), prosedürel rüzgâr/oda tonu/drone/kalp atışı, dinamik müzik (keşif sessizliği, güvenli oda, kovalama, boss, final).

Tasarım ayrıntıları (bölgeler, düşmanlar, ekonomi, zorluk eğrisi, teknik bütçe): [`docs/GDD.md`](docs/GDD.md).

## Çalıştırma
```bash
npm install
npm run dev        # geliştirme sunucusu (telefondan aynı ağda açılabilir)
npm run build      # dist/ — herhangi bir statik sunucuda yayınlanabilir
npm run preview
```
Telefon için: `dist/` klasörünü HTTPS üzerinden yayınla (ör. GitHub Pages), tarayıcıda aç → "Ana ekrana ekle". Oyun tam ekran ve yatay modda PWA olarak çalışır, ilk oynanıştan sonra çevrimdışı açılır.

### iPad / ücretsiz web test sürümü
Her push'ta GitHub Actions oyunu derler; depo public ise GitHub Pages'e yayınlar: **https://kero200713-lgtm.github.io/-Uu/**. Depo private kalacaksa Netlify / Cloudflare Pages (ücretsiz) kullanılabilir. Adımlar, iPad'de tam ekran oynama ve sorun giderme: [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Android / iOS
```bash
npm run android:apk   # debug APK (JDK 21 + Android SDK gerekir)
npm run cap:sync      # web derlemesini android/ ve ios/ projelerine kopyalar
```
GitHub Actions her push'ta debug APK üretir (Artifacts), imza anahtarı tanımlıysa Google Play için AAB de üretir; iOS projesini simülatör için derleyerek doğrular. Ayrıntılar: [`docs/NATIVE.md`](docs/NATIVE.md).

## Testler
Chromium + Playwright ile otomatik oynanış testleri (dokunmatik emülasyonu):
```bash
npm run build
node tests/flow.mjs            # toplama, nişan+ateş, düşman saldırısı, envanter, belge, kayıt→yenile→devam
node tests/story.mjs           # oyunun baştan sona otomatik oynanışı (tüm bulmacalar, boss, final, krediler)
node tests/ipad.mjs            # iPad Pro 11 emülasyonu: çoklu dokunuş, butonlar, döndürme, Pages alt-yolu, service worker
node tests/native.mjs          # native köprü taklidi: kayıt yedeği/geri yükleme, Android geri tuşu, arka plana geçiş
S=areas Q=low node tests/playtest.mjs # tüm bölgeleri yükle (Q=low|medium|high), ekran görüntüsü + çizim istatistikleri
node tests/playtest.mjs        # orman turu + joystick testi
```
Çıktılar `tests/out/` klasörüne yazılır. Başka bir derleme klasörünü test etmek için `DIST=<klasör>` verilebilir.
`node tests/hair.mjs long` Ela'nın saç/ceket yakın planlarını çeker.

## Klasör yapısı
```
src/core      motor, giriş, ayarlar, kalite, asset yükleyici, dil
src/world     ızgara, bölüm inşası, ışık pişirme, ışık havuzu, atmosfer, materyaller
src/player    oyuncu, kamera, animasyon katmanları, karakter fabrikası
src/enemies   düşman AI, tipler, KORO boss
src/combat    isabet, yakın dövüş, nişan yardımı, efektler, gürültü sistemi
src/items     eşya tanımları, envanter
src/ui        HUD, dokunmatik kontroller, menüler, envanter, belgeler
src/audio     ses motoru, prosedürel ses
src/save      kayıt sistemi
src/platform  native katman (Capacitor: depolama yedeği, geri tuşu, yaşam döngüsü, haptik)
src/story     belgeler, hedefler, senaryo betikleri
src/areas     altı bölgenin verisi
tools/        asset pipeline'ı, harita ve ikon üreticileri
android/      Android Studio / Gradle projesi (Capacitor)
ios/          Xcode projesi (Capacitor, Swift Package Manager)
```
