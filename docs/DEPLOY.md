# Web sürümü ve iPad'de test

Asıl ürün Android ve iOS uygulamasıdır ([`NATIVE.md`](NATIVE.md)). Bu sayfa, aynı oyunun **yalnızca test için** kullanılan web sürümünü anlatır: `npm run build` → `dist/` klasörü ücretsiz bir statik sunucuda yayınlanır ve iPad Safari'de doğrudan açılır. Hiçbir adım ücret gerektirmez.

## Seçenek A — GitHub Pages (önerilen, tamamen ücretsiz)
GitHub'ın ücretsiz planında Pages yalnızca **public (herkese açık)** depolarda çalışır. Bu depo şu an **private**.

1. GitHub'da depo → **Settings → General → Danger Zone → Change repository visibility → Public**.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions** sekmesi → "Web build (GitHub Pages)" → **Run workflow** (ya da bir sonraki push'u bekle).
4. 1–2 dakika sonra oyun şu adreste: **https://kero200713-lgtm.github.io/-Uu/**

Sonraki her push'ta (`main` ve `claude/**` dalları) iş akışı oyunu yeniden derler ve yayınlar. Depo private kaldıkça iş akışı yine derlemeyi yapar (derleme bozulursa kırmızı görünür) ama yayın adımını atlar.

## Seçenek B — Depo private kalsın: Netlify veya Cloudflare Pages (ücretsiz plan)
* **Netlify:** netlify.com → GitHub ile giriş → "Add new site → Import an existing project" → bu depo. Ayarlar `netlify.toml` dosyasından otomatik gelir (komut `npm run build`, klasör `dist`). Her push'ta yeniden yayınlar; adres `https://<isim>.netlify.app`.
* **Cloudflare Pages:** dash.cloudflare.com → Workers & Pages → Create → Pages → GitHub'a bağlan → bu depo. Build command: `npm run build`, output: `dist`.

İkisi de kredi kartı istemeden private depoyla çalışır.

## iPad'de oynama
* Adresi **Safari**'de aç. Menü gelince bir yere dokun (iOS sesi ancak ilk dokunuştan sonra açar).
* **Tam ekran için:** Paylaş → **Ana Ekrana Ekle**. Ana ekrandaki simgeden açılan oyun Safari çubukları olmadan, tam ekran çalışır ve ilk açılıştan sonra çevrimdışı da açılır.
* Yatay tutmak önerilir; dikeyde de oynanabilir.
* Gereksinim: iPadOS 15 veya üstü (WebGL 2). Daha eskiyse açılış ekranında bunu söyleyen bir mesaj çıkar.
* Grafik kalitesi iPad'de otomatik **Orta** başlar; dinamik çözünürlük kare hızına göre ayarlanır. Ayarlar → Grafik'ten değiştirilebilir.

### Sorun olursa
* Adresin sonuna `?debug` ekle (ör. `.../-Uu/?debug`): hatalar ekranın sol altında yazılır ve service worker devre dışı kalır. Ekran görüntüsünü paylaşman yeterli.
* Yeni bir sürüm yayınlandığında, oyun menüdeyken kendini bir kez yeniler; eski dokular önbellekten gelmez (önbellek adı her derlemede değişir).
* Grafik belleği iOS tarafından sıfırlanırsa oyun kaydeder ve kendini yeniden yükler; "Devam Et" ile kalınan yerden sürer.

## Yerelde doğrulama (geliştirici)
```bash
npm run build
node tests/ipad.mjs     # iPad Pro 11 ekranı + çoklu dokunuş + GitHub Pages alt-yolu + döndürme
node tests/flow.mjs     # oynanış akışı (dokunmatik)
node tests/story.mjs    # baştan sona hikâye
```
`tests/ipad.mjs` Chromium'da iPad'i taklit eder; gerçek Safari'deki son kontrol iPad'in kendisinde yapılır.
