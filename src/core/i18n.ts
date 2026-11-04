import { settings } from './Settings';
import type { Loc } from '../world/types';

const S: Record<string, [string, string]> = {
  continue: ['Devam Et', 'Continue'], newGame: ['Yeni Oyun', 'New Game'], settings: ['Ayarlar', 'Settings'], credits: ['Katkıda Bulunanlar', 'Credits'],
  resume: ['Devam', 'Resume'], quit: ['Ana Menü', 'Main Menu'], back: ['Geri', 'Back'], yes: ['Evet', 'Yes'], no: ['Hayır', 'No'], close: ['Kapat', 'Close'],
  graphics: ['Grafik', 'Graphics'], audio: ['Ses', 'Audio'], controls: ['Kontroller', 'Controls'], language: ['Dil', 'Language'], access: ['Erişilebilirlik', 'Accessibility'],
  quality: ['Kalite', 'Quality'], q_auto: ['Otomatik', 'Auto'], q_low: ['Düşük', 'Low'], q_medium: ['Orta', 'Medium'], q_high: ['Yüksek', 'High'],
  renderScale: ['Çözünürlük ölçeği', 'Resolution scale'], dynRes: ['Dinamik çözünürlük', 'Dynamic resolution'], showFps: ['FPS göster', 'Show FPS'],
  master: ['Genel ses', 'Master volume'], music: ['Müzik', 'Music'], sfx: ['Efektler', 'Effects'], ambience: ['Ortam', 'Ambience'],
  sensX: ['Kamera hassasiyeti (yatay)', 'Camera sensitivity (horizontal)'], sensY: ['Kamera hassasiyeti (dikey)', 'Camera sensitivity (vertical)'], invertY: ['Dikey ekseni ters çevir', 'Invert vertical axis'],
  aimAssist: ['Nişan yardımı', 'Aim assist'], aimToggle: ['Nişan: dokun-aç/kapa', 'Aim: tap to toggle'], joystickSize: ['Joystick boyutu', 'Joystick size'], controlsOpacity: ['Buton opaklığı', 'Button opacity'], leftHanded: ['Solak düzen', 'Left-handed layout'],
  subtitles: ['Altyazılar', 'Subtitles'], screenShake: ['Ekran sarsıntısı', 'Screen shake'], reduceFlashing: ['Yanıp sönmeyi azalt', 'Reduce flashing'], textScale: ['Metin boyutu', 'Text size'], vibration: ['Titreşim', 'Vibration'],
  reset: ['Varsayılana dön', 'Reset to defaults'],
  inventory: ['Envanter', 'Inventory'], keyItems: ['Önemli Eşyalar', 'Key Items'], files: ['Belgeler', 'Files'], use: ['Kullan', 'Use'], equip: ['Kuşan', 'Equip'], examine: ['İncele', 'Examine'], drop: ['Bırak', 'Discard'], combine: ['Birleştir', 'Combine'],
  equipped: ['Kuşanıldı', 'Equipped'], empty: ['Boş', 'Empty'], health: ['Sağlık', 'Health'], battery: ['Fener', 'Flashlight'], objective: ['Hedef', 'Objective'], map: ['Harita', 'Map'],
  h_fine: ['İyi', 'Fine'], h_caution: ['Dikkat', 'Caution'], h_danger: ['Tehlike', 'Danger'],
  pickedUp: ['Alındı', 'Picked up'], invFull: ['Envanter dolu', 'Inventory full'], locked: ['Kilitli', 'Locked'], unlocked: ['Kilit açıldı', 'Unlocked'],
  p_open: ['Aç', 'Open'], p_take: ['Al', 'Take'], p_read: ['Oku', 'Read'], p_listen: ['Dinle', 'Listen'], p_save: ['Telsiz', 'Radio'], p_go: ['Geç', 'Go'], p_use: ['Kullan', 'Use'],
  saveQ: ['Telsizin kırmızı ışığı yanıp sönüyor. İlerlemeni kaydetmek istiyor musun?', 'The radio\'s red light blinks. Save your progress?'],
  saved: ['İlerleme kaydedildi', 'Progress saved'], autosaved: ['Otomatik kayıt', 'Autosaved'],
  died: ['ÖLDÜN', 'YOU DIED'], retry: ['Son kayıttan devam', 'Continue from last save'],
  loading: ['Yükleniyor', 'Loading'], tapToStart: ['Başlamak için dokun', 'Tap to start'],
  tap: ['VUR!', 'TAP!'], struggle: ['Kurtul!', 'Break free!'],
  noSave: ['Kayıt yok', 'No save found'], newGameQ: ['Yeni oyun başlatılsın mı? Mevcut kayıt silinecek.', 'Start a new game? Your current save will be overwritten.'],
  rotate: ['Daha iyi bir deneyim için cihazını yatay çevir', 'Rotate your device to landscape for the best experience'],
  hint_move: ['Sol taraf: hareket. Sağ taraf: kamera.', 'Left side: move. Right side: look.'],
  hint_run: ['Joystick\'i sonuna kadar itersen koşarsın — ama gürültü yapar.', 'Push the stick all the way to run — but running is loud.'],
  hint_interact: ['Parlayan nesnelere yaklaşıp el simgesine dokun.', 'Approach glinting objects and tap the hand icon.'],
  hint_aim: ['Nişan butonu ile nişan al, ateş butonu ile ateş et.', 'Use the aim button to aim, the fire button to shoot.'],
  hint_crouch: ['Eğilerek yürümek neredeyse sessizdir.', 'Crouch-walking is almost silent.'],
  hint_flare: ['İşaret fişeği fırlat: onları oyalar.', 'Throw a flare: it lures them away.'],
  ammoLabel: ['Cephane', 'Ammo'], noAmmo: ['Cephane yok', 'No ammo'],
  gameBy: ['Bir oyun', 'A game'], thanks: ['Oynadığın için teşekkürler.', 'Thank you for playing.'],
  licenses: ['Lisans bildirimleri', 'Licence notices'],
  credits_text: ['Tasarım, kod, hikâye, bölümler: UĞULTU ekibi', 'Design, code, story, levels: the UĞULTU team'],
  fps: ['FPS', 'FPS'], end: ['SON', 'THE END'],
  quitConfirm: ['Ana menüye dönülsün mü? Son kayıttan sonraki ilerleme kaybolabilir.', 'Return to main menu? Progress since your last save may be lost.'],
  howToPlay: ['Nasıl Oynanır', 'How to Play'],
};

export function t(key: string): string {
  const v = S[key];
  if (!v) return key;
  return settings.data.language === 'tr' ? v[0] : v[1];
}

export function L(loc: Loc | string | undefined): string {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  return settings.data.language === 'tr' ? loc.tr : loc.en;
}
