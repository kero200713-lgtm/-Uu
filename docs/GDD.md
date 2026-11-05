# UĞULTU — Oyun Tasarım Dokümanı

Bu doküman, oyunun **şu an kodda olan** hâlini anlatır. Sayılar `src/items/ItemDefs.ts`, `src/enemies/Types.ts` ve `src/areas/*.ts` dosyalarından alınmıştır; tasarım değiştiğinde önce oradaki veriler değişir, sonra bu doküman güncellenir.

## 1. Tek cümle
Karantinadaki bir maden kasabasının altında "şarkı söyleyen" bir şeyi susturmaya inen bir telsiz teknisyeninin, az mermi, az ışık ve çok sesle geçen bir gecesi.

## 2. Tasarım sütunları
1. **Ses tehlikedir.** Koşmak, ateş etmek, kapı çarpmak duyulur. Düşmanların çoğu seni önce *duyar*. Sessizlik bir kaynaktır.
2. **Az ama yeterli.** Mermi ve iyileştirme sıkı tutulur; dikkatli oynayan oyuncu hiçbir zaman tamamen çaresiz kalmaz, savurgan oynayan kalır.
3. **Karanlık ama okunur.** Ekran asla tamamen siyah olmaz: pişirilmiş dolaylı ışık + karakter dolgu ışığı + fener. Korku görünmeyenden değil, *yarım görünenden* gelir.
4. **Mekân hikâyeyi anlatır.** Ara sahne yerine belgeler, kasetler, eşyaların yerleşimi ve lambaların söndüğü yerler.
5. **Telefonda rahat.** Az buton, bağlamsal eylemler, büyük dokunma alanları, kısa oturumlarla ilerlenebilen kayıt aralıkları.

## 3. Hikâye özeti
* **Yer/zaman:** Karaçam, kuzey Anadolu'da bir maden kasabası. Kasım 2006. Kasaba 1996'dan beri "gaz sızıntısı" gerekçesiyle karantinada.
* **Ana karakter:** **Ela Demir** — telsiz teknisyeni, 30'larında. Omuz hizasında koyu saç, haki iş ceketi, lacivert pantolon, koyu atkı. Silah eğitimi yok; yakın dövüşte zayıf, nişanda sabırlı.
* **Kanca:** Ela, ölü sivil savunma frekansında on yıl önce kaybolan babasının (jeofizikçi, Meridyen Tesisi) sesini duyar: *"Ela. Kapat onu."*
* **Gerçek:** Meridyen Tesisi -410 m'de, kayanın içinde rezonans yapan canlı bir yapıya ("KORO") ulaştı. Uğultuyu duyan insanlar zamanla **Oyuk**'a dönüştü. Baba, KORO'yu ters faz bir kayıtla susturmanın yolunu buldu ama uygulayamadı.
* **Final:** Ela üç rezonatörü kapatır, babasının kasetini ana konsolda çalar, çöken kuyudan kaçar. Epilog: kasabanın üstünde ilk kez sessizlik — ve telsizde son bir parazit.

## 4. Oyun döngüsü
```
Keşfet (ses/ışık yönetimi) → Kaynak topla → Engel (kilit, güç, yakıt) → Çözüm parçasını bul
      ↑                                                                     ↓
  Güvenli oda (telsiz = kayıt, sakin müzik)  ←  Tehlike (kaç / sus / savaş)  ←
```
* **Anlık döngü (10–30 sn):** yürü → dinle → feneri aç/kapat → bir köşeyi kontrol et → eşya al.
* **Orta döngü (3–8 dk):** bir kapı/kilit hedefi, onu açan anahtar/eşya, yol üstünde 1–3 karşılaşma.
* **Uzun döngü (bölge, 10–20 dk):** bölge girişi (otomatik kayıt) → güvenli oda → ana bulmaca → çıkış.

## 5. Bölgeler ve ilerleme
| # | Bölge | Ana hedef | Kilit / anahtar | Düşmanlar | Öğrettiği şey |
|---|---|---|---|---|---|
| 1 | **Orman Yolu** | Karaçam'a ulaş | — | 2 Oyuk | Hareket, fener, eşya alma, demir boru, ses = tehlike |
| 2 | **Karaçam (kasaba)** | Sağlık ocağının zincirli kapısını aç | Ev anahtarı, karakol anahtarı → **zincir makası** | 6 Oyuk | Tabanca, nişan, kaçınma, kilitli kapı + anahtar, ilk telsiz |
| 3 | **Sağlık Ocağı** | Arka kapıya güç ver | **Sigorta** → sigorta kutusu; Meridyen kartı | 3 Oyuk, 3 Pusucu | Dar koridor, pusu, yakalanma ve çakı |
| 4 | **Maden Sahası** | Jeneratörü çalıştır, asansörle in | Ofis anahtarı → **yakıt** → jeneratör → asansör | 5 Oyuk, 1 Şişkin | Pompalı tüfek, dayanıklı düşmandan kaçma/oyalama (fişek) |
| 5 | **Meridyen Tesisi (-410)** | Babanın laboratuvarı, kuyu | Tuş takımı kodu (belgelerden çıkarılır) → **ters faz kaseti** | 3 Oyuk, 1 Pusucu, 1 Dinleyen | Gizlilik: öldürülemez kör düşman, eğilerek yürüme |
| 6 | **KORO** | 3 rezonatörü kapat, kaseti çal, kaç | Rezonatörler → konsol → çöküş | KORO + 4 Oyuk, 1 Pusucu, 1 Dinleyen | Her şeyin birleşimi; zamanlı kaçış |

Ara geri dönüşler: bölgeler çift yönlü kapılarla bağlıdır, önceki bölgelere dönülebilir (alınmış eşyalar ve ölü düşmanlar kayıtta tutulur).

## 6. Karakter ve kontroller
| Eylem | Dokunmatik | Not |
|---|---|---|
| Yürü / koş | Sol yarıda yüzen joystick (sonuna kadar it = koş) | Koşmak dayanıklılık harcar ve gürültü yapar |
| Kamera | Sağ yarıda sürükle | Hassasiyet X/Y ayrı, Y ters çevrilebilir |
| Nişan | Nişan butonu (dokun-aç/kapa) | Yumuşak nişan yardımı (kapatılabilir) |
| Blok | Boru/çıplak elle nişan butonunun yerinde kalkan butonu (basılı tut) | Klavye V / sağ tık, gamepad LB |
| Yuvarlan | Yalnızca düşman yakındayken beliren buton | Joystick yönüne, joystick boşsa kameraya doğru; Boşluk, gamepad RB |
| Ateş / vuruş | Ateş butonu | Silaha göre bağlamsal |
| Etkileşim | Yalnızca yakında bir şey varken beliren etiketli buton | "Al: Demir Boru", "Kaydet", "Aç" … |
| Şarjör, İyileş | Yalnızca gerektiğinde görünür | İyileş butonu yalnızca can azken |
| Eğil | Buton | Sessiz hareket |
| Üst çubuk | Silah değiştir, fener, envanter, duraklat | Solak düzen, buton boyutu/opaklığı |

Kamera: omuz üstü, duvar çarpışmalı (küre süpürme + yumuşak geri dönüş), nişanda yakınlaşır.

## 7. Savaş
| Silah | Hasar | Şarjör | Menzil | Gürültü | Rol |
|---|---|---|---|---|---|
| Demir boru | 30 / 22 | — | 1.9 m | 5 | Sınırsız; kombo: tepeden ağır vuruş (isabet ~0,4 sn, sersemletir 0.7) → hızlı geri savuruş (22, nadiren sersemletir) → tekrar. Vuruş sırasında basılan tuş hafızada tutulur, isabetten ~0,2 sn sonra sıradaki vuruş başlar. Her vuruş dayanıklılık yer (8 / 6); bitkinken kombo olmaz. Yakındaki düşmana yönelir, isabette kısa duraksama |
| 9mm tabanca | 28 | 10 | 45 m | 26 | Ana silah |
| Pompalı tüfek | 7 × 17 | 4 | 18 m | 34 | Nadir; yere serer, panik butonu |
| Çakı | — | tek kullanım | — | — | Yakalanınca otomatik kurtarır |
| İşaret fişeği | — | — | atış | yüksek | Işık + ses: düşmanları çeker/oyalar |

**Savunma (yakın dövüş):** blok basılı tutulunca boru iki elle göğüs önünde çapraz tutulur (çıplak elle kollar yüz önünde). Önden gelen darbenin yalnızca %22'si (boru) / %40'ı (el) geçer, karşılığında dayanıklılık harcanır; dayanıklılık biterse blok kırılır ve darbenin %70'i geçer. Bloğu darbeden hemen önce (ilk ~0,3 sn) kaldırmak **parry**dir: hasar yok, saldıran sendeler, metal "çın" sesi + kısa duraksama. Bloklu oyuncu yakalanamaz. Vuruşun toparlanma süresi blok veya yuvarlanmayla kesilebilir. **Yuvarlanma:** ~1,7 m, 0,42 sn dokunulmazlık, 14 dayanıklılık, 0,85 sn bekleme. Tamamen var olan animasyonlar + hafif prosedürel IK; ek çizim/ağ yükü yok.

**Silah tutuşları:** tabanca (gerçek boyutlu, ~19 cm, tek çizim çağrısı) nişanda iki elle izosceles duruşta, nişan dışında iki elle alçak hazır pozisyonda; destek eli atış elini sarar. Boru yumruğun başparmak ekseni boyunca, sapın ucundan tutulur (önkola/dirseğe girmez); yürürken ucu ileri-aşağı.

**Mermi ekonomisi:** sabit mermiler bölümlere dengeli dağıtılır (9mm: Kasaba 28, Sağlık Ocağı 24, Maden 20, Tesis 20, Koro 20; fişek: Maden 10, Tesis 6, Koro 6). Düşen bir yaratık, oyuncunun mermisi azaldıkça daha olası şekilde birkaç mermi bırakır (9mm: <8 → %60, <20 → %22, değilse %5; fişek <3 → %30). Tabanca nişan dışında sağ elde, uyluk yanında namlu yere bakarak taşınır.

Kafaya isabet tüm silahlarda ×3 hasar verir (tek tabanca mermisi bir Oyuk'u düşürür) ve kafa geriye savrulur; gövde isabetleri gövdeyi sarsar, sendeletme eşiğini geçerse saldırıyı keser.

Geri bildirim: isabet sesi + kan/kıvılcım parçacığı, düşmanın sendelemesi/yere düşmesi, kamera sarsıntısı (ayarlanabilir), titreşim (ayarlanabilir), isabet işareti (öldürme ve kafa vuruşu için ayrı renk), atış sonrası nişangâhın açılması.

## 8. Düşmanlar
| Ad | Can | Hız (yürü/koş) | Görüş | İşitme | Davranış |
|---|---|---|---|---|---|
| **Oyuk** | 80 | 0.75 / 2.35 | 15 m, dar koni | ×1 | Devriye, ses kaynağına gider, son görülen yeri arar, geri döner; yakalar |
| **Pusucu** | 60 | 1.2 / 3.35 | 9 m | ×0.9 | Ölü gibi yatar; yaklaşınca sıçrar; vur-kaç |
| **Şişkin** | 440 | 0.62 / 1.15 | 13 m | ×1.5 | Yavaş, çok dayanıklı, pes etmez (iz sürer) |
| **Dinleyen** | ∞ | 0.85 / 4.1 | kör | ×1.8 | Yalnızca sesle avlar; duyduğu sürece kovalar; öldürülemez |
| **KORO** | boss | sabit | — | — | Kırmızı halkayla önceden gösterilen yere vuruşlar; her kapanan rezonatörde vuruş aralığı kısalır (8 → 3.6 sn) ve ikinci rezonatörden sonra rastgele ek vuruşlar gelir |

**AI durumları:** `idle / patrol → suspicious (ses/kısa görüş) → investigate (son bilinen konum) → chase → attack/grab → search → return`.
Algı: görüş konisi + menzil + DDA görüş hattı; gürültü olayları (`src/combat/Noise.ts`) mesafe ve duvarla zayıflar.
Maliyet: uzak düşmanlarda AI ve animasyon güncellemesi seyreltilir; görünmeyenler düşük poligonlu gövde kullanır.

## 9. Ekonomi (bölge başına toplanabilir kaynaklar)
| Bölge | 9mm | Fişek (av) | Bandaj | İlk yardım | Adrenalin | Pil | İşaret fişeği | Diğer |
|---|---|---|---|---|---|---|---|---|
| Orman | – | – | 2 | – | – | 2 | 2 | boru, çakı |
| Kasaba | 4 | – | 2 | 1 | – | 3 | 3 | tabanca, sırt çantası |
| Sağlık Ocağı | 3 | – | 3 | 1 | 1 | 1 | 1 | çakı |
| Maden | 1 | 2 | 1 | 1 | – | 1 | 1 | pompalı |
| Tesis | 2 | 1 | 1 | 1 | 1 | 1 | 2 | – |
| KORO | 1 | 1 | – | 1 | – | – | – | – |

Kural: her bölgede *bütün* düşmanları öldürmeye yetecek mermi yoktur. Kaçınmak ve oyalamak bilinçli bir seçenektir.

## 10. Zorluk eğrisi
1. **Orman:** iki yavaş düşman, bol ışık, silah yok → kaçmayı öğrenir.
2. **Kasaba:** tabanca gelir; açık alan, kaçış yolları bol.
3. **Sağlık ocağı:** dar mekân + pusu → ilk gerçek gerilim; çakı burada öğretilir.
4. **Maden:** dayanıklı Şişkin → "her şeyi vuramazsın"; pompalı tüfek ödül olarak gelir.
5. **Tesis:** öldürülemez Dinleyen → oyunun en sessiz, en gergin bölümü.
6. **KORO:** her şeyin karışımı, ardından zamanlı kaçış; müzik ilk kez tam güçte.

Her bölge girişinde otomatik kayıt, her bölgede bir telsiz (manuel kayıt) vardır; ölüm cezası en fazla birkaç dakikalık ilerlemedir.

## 11. Atmosfer ve ses
* **Işık:** pişirilmiş dolaylı ışık + AO; sınırlı sayıda dinamik nokta ışık (havuz); titreyen/sönen lambalar; hacimsel ışık konileri; gölgeli el feneri. "Asla zifiri karanlık yok" kuralı: her karede karakterin silüeti okunur.
* **Post-process:** ACES ton eşleme, renk derecelendirmesi, vinyet, film greni, kromatik sapma, hasar/düşük can efekti; bloom yalnızca yüksek kalitede.
* **Ses katmanları:** prosedürel rüzgâr/oda tonu/drone, 3B HRTF konumlu efektler, duvar arkası boğuklaştırma, ayak sesi varyasyonları (zemin türüne göre), düşük canda kalp atışı. Müzik çoğu zaman *yoktur*; güvenli oda, kovalama, boss ve final için ayrı parçalar çapraz geçişle girer.
* **Uğultu:** derine inildikçe (bölge ayarı) ve Dinleyen'e yaklaştıkça yükselen küresel "Hum" değeri; enfekte dokuların parlaması, ekran efekti ve uğultu ambiyansının seviyesi buna bağlıdır.

## 12. Sanat yönü
* Gerçekçiye yakın, düşük doygunluklu, 2000'ler Türk taşra dokusu: beton, sac, paslı metal, çam ormanı, eski sağlık ocağı yeşili, Sovyet-vari maden tesisi.
* Karakterler tek ortak taban gövde + bölgeye/role göre elle boyanmış dokular (`tools/pipeline/paint_characters.py`). Ela omuz hizasında saç modeli kullanır; saç kartlarının arasında kafa derisi görünmesin diye gövdenin saçlı bölgesinden yüklemede ince bir "saç kapağı" kabuğu üretilir ve aynı saç dokusuyla kaplanır (`buildHairCap`). Boyalı saç çizgisi alnın üstünde kalır. Ceket gövdeye yapışık durmasın diye yüklemede düzgünleştirilip hafifçe şişirilir (`src/player/Player.ts`).
* Ela'nın kıyafetleri boya değil, gerçek giysi katmanlarıdır: haki kanvas ceket (bel boyu, dik yaka, manşetler, fermuar), koyu kot ve kahverengi deri botlar; gövdeyle aynı iskelete bağlıdır ve altındaki gövde üçgenleri çizilmez (`src/player/Garments.ts`, CC0 kumaş dokuları).
* İç mekânlar: kasabadaki odalar zemin türü ve büyüklüğüne göre (oturma odası, yatak odası, mutfak, banyo, dükkân, ofis) otomatik döşenir: duvar diplerinde mobilya, pencerelerde perde, büyük odaların ortasında oturma köşesi, yemek masası, raf koridoru ya da çalışma masası adacıkları (`Level.dressRooms`). Kapı önleri, hikâye eşyaları ve elle yerleştirilmiş modeller boş bırakılır.
* Enfeksiyon dili: soğuk camgöbeği damarlar, yavaş nabız atan parıltı. Oyuklar insan kalır; ne kadar ileri gidilirse o kadar bozulurlar.

## 13. Teknik bütçe (düşük kalite, orta segment telefon hedefi)
| Ölçüt | Hedef | Ölçülen (otomatik test) |
|---|---|---|
| Üçgen / kare | < 200k | 32k – 153k |
| Çizim çağrısı | < 150 | 31 – 112 |
| Shader programı | sabit, bölge değişiminde artmaz | ~19 |
| Texture belleği | bölgeler arası sabit | `trimGPU` ile boşaltılır |
| Kare süresi | 30 fps (dinamik çözünürlük ile) | cihazda doğrulanmalı |

## 14. Kayıt
`localStorage`, sağlama toplamlı (bozuk kayıt yüklenmez). İki yuva: manuel (telsiz) ve otomatik (bölge girişi, 90 sn'de bir, uygulama arka plana alındığında / sayfa kapanırken). "Devam Et" en yeni geçerli kaydı yükler. Saklananlar: bölge, konum, yön, can, envanter (silahlar, mermi, anahtar eşyalar), bayraklar (alınan eşyalar, açılan/kilidi kaldırılan kapılar, şalterler, hikâye olayları), öldürülen düşmanlar, okunan belgeler, hedef, oynama süresi. Ayarlar ayrı anahtarda.

## 15. Erişilebilirlik ve ayarlar
Grafik (Otomatik/Düşük/Orta/Yüksek, render ölçeği, dinamik çözünürlük, FPS göstergesi), ses (ana/müzik/efekt/ortam), kontroller (hassasiyet X/Y, Y ters, nişan yardımı, nişan dokun-aç/kapa, joystick boyutu, buton opaklığı, solak düzen, titreşim), dil (Türkçe/İngilizce), altyazı, metin boyutu, ekran sarsıntısı, yanıp sönme azaltma.

## 16. Test
* `node tests/flow.mjs` — dokunmatikle eşya alma, nişan+ateş, düşman ölümü, düşman saldırısı, envanter, belge, telsiz kaydı → sayfa yenileme → devam.
* `node tests/story.mjs` — oyunun baştan sona otomatik oynanışı (zincir makası → sağlık ocağı → sigorta → maden → yakıt/jeneratör → asansör → tesis → kod → kaset → kuyu → KORO → 3 rezonatör → konsol → çöküş → kaçış → epilog → krediler).
* `S=areas node tests/playtest.mjs` — altı bölgenin her kalite kademesinde yüklenmesi, ekran görüntüsü ve çizim istatistikleri.
* `node tests/ipad.mjs` — iPad Pro 11 emülasyonu: GitHub Pages alt-yolu, çoklu dokunuş (joystick + kamera), butonlar, duraklatma, döndürme, service worker ile yeniden açılış.
* `node tests/native.mjs` — Capacitor köprüsü taklidiyle native davranış: kayıtların işletim sistemi deposuna yedeklenmesi ve geri yüklenmesi, Android geri tuşu, arka plana geçiş.
* `node tests/hair.mjs long` — Ela'nın yakın plan görüntüleri (saç/ceket kontrolü).
