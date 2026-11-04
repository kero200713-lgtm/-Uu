# Android ve iOS uygulaması

Asıl ürün **Android ve iOS uygulamasıdır**. Oyun motoru (Three.js / WebGL) her iki platformda da [Capacitor](https://capacitorjs.com) (MIT, ücretsiz) ile native bir uygulamanın içinde çalışır. Çıktı Google Play / App Store'a yüklenebilen gerçek bir paket olur: APK/AAB ve Xcode projesi. Web sürümü ([`DEPLOY.md`](DEPLOY.md)) yalnızca iPad'den hızlı test içindir. Aynı kodu kullanır ama native sürümü hiçbir şekilde kısıtlamaz.

```
src/ (oyun)  --npm run build-->  dist/  --npx cap sync-->  android/  (Gradle projesi → APK / AAB)
                                                    └──>  ios/      (Xcode projesi, Swift Package Manager)
```

## Native tarafta neler var
| | Android | iOS |
|---|---|---|
| Ekran | Yatay kilit (`sensorLandscape`), tam ekran (durum + gezinme çubuğu gizli, kenardan kaydırınca kısa süre görünür) | Yatay kilit, durum çubuğu gizli, ana ekran çizgisi otomatik gizlenir, ekran kenarı hareketleri önce oyuna gider |
| Ekran kararması | Oyun açıkken kapalı | Oyun açıkken kapalı |
| Geri tuşu | Panel/envanter kapatır → oyunu duraklatır/devam ettirir → ana menüde uygulamayı arka plana alır | — |
| Arka plana geçiş | Oyun durur, otomatik kayıt, ses susar | Aynı |
| Kayıt | localStorage + işletim sisteminin kendi deposunda yedek (`@capacitor/preferences`); WebView verisi silinse bile kayıt geri yüklenir | Aynı |
| Titreşim | Native haptik (`@capacitor/haptics`) | Native haptik (Taptic Engine) |
| Service worker | Kullanılmaz (dosyalar uygulamanın içinde) | Kullanılmaz |
| İkon / açılış ekranı | `tools/pipeline/make_icons.py` ile üretilir | Aynı |

Bu davranışlar cihaz olmadan `node tests/native.mjs` ile test edilir: Capacitor köprüsü taklit edilir; kayıt yedeği, geri yükleme, geri tuşu ve arka plana geçiş kontrol edilir.

## Android
### APK'yı GitHub'dan indirme (ücretsiz)
Her push'ta **Actions → "Native builds (Android / iOS)"** iş akışı çalışır. İş bitince sayfanın altındaki **Artifacts** bölümünde `ugultu-android-debug-apk` çıkar. İndir, zip'i aç, `app-debug.apk` dosyasını Android cihaza at ve kur. Cihazda "bilinmeyen kaynaklardan yüklemeye izin ver" seçeneğini açman gerekebilir.

### Google Play için imzalı AAB (isteğe bağlı)
1. Ücretsiz bir yükleme anahtarı oluştur. Bilgisayarda Java varsa:
   `keytool -genkeypair -v -keystore upload.jks -alias ugultu -keyalg RSA -keysize 2048 -validity 10000`
   Bu dosyayı ve şifresini **kaybetme**. Depoya **koyma**.
2. GitHub → Settings → Secrets and variables → Actions'a şu dört gizli değeri ekle:
   `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks` çıktısı), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`ugultu`), `ANDROID_KEY_PASSWORD`.
3. Sonraki her derlemede Artifacts'ta `ugultu-android-release-aab` de çıkar. `versionCode` olarak her seferinde artan iş akışı çalıştırma numarası kullanılır.
4. Google Play'e yüklemek için Play Console geliştirici hesabı gerekir. Bu hesap **tek seferlik 25 $** tutar ve yayın kararı senindir; APK'yı cihaza kurup test etmek için gerekmez.

### Yerelde (bilgisayarda) derleme
Node.js 22+, JDK 21 ve Android SDK (Android Studio ya da komut satırı araçları, ücretsiz) gerekir.
```bash
npm run android:apk        # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open       # Android Studio'da aç (emülatör / cihazda çalıştır, profilleme)
```

## iOS
* `ios/` klasöründe hazır bir Xcode projesi var (Swift Package Manager; CocoaPods gerekmez).
* Her push'ta GitHub'ın macOS makinesinde **imzasız simülatör derlemesi** yapılır. Bu, projenin derlendiğini doğrular. Public depoda ücretsizdir; private depoda yalnızca elle (Run workflow) çalışır.
* **Gerçek bir iPhone/iPad'e kurmak için imza gerekir. Bunun Apple'ın koyduğu iki yolu var:**
  1. Bir **Mac + Xcode** ve ücretsiz Apple Kimliği. Kendi cihazına 7 gün geçerli kurulum yapılır.
  2. **Apple Developer Program**, yıllık 99 $. TestFlight ve App Store için şarttır.

  Para harcama yasağı nedeniyle bu adım şimdilik yapılmıyor. Karar senin. O zamana kadar iPad'deki test, aynı oyunu çalıştıran web sürümüyle yapılır ([`DEPLOY.md`](DEPLOY.md)).
* Mac'te: `npm run cap:sync && npm run ios:open` → Xcode'da Signing & Capabilities'ten takımını seç → Run.

## Uygulama kimliği
`com.ugultu.game` (`capacitor.config.ts`). Mağazaya ilk yüklemeden önce istenirse değiştirilebilir; yüklemeden sonra değiştirilemez.

## Performans notları
* Kalite ilk açılışta GPU'ya göre seçilir (Android: Adreno/Mali modeline göre; iOS: Orta). Ayarlar → Grafik'ten Yüksek'e kadar çıkılabilir. Native sürümde web'e özgü bir kısıtlama yoktur.
* Dinamik çözünürlük kare hızını korur; piksel bütçesi kaliteye göredir (`Engine.PIXEL_BUDGET`).
* Gerçek cihaz profillemesi için: Android Studio → Profiler, ya da Chrome → `chrome://inspect` (debug APK'da WebView incelenebilir).
