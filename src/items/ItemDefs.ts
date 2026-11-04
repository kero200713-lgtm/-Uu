import type { Loc } from '../world/types';

export interface WeaponDef {
  type: 'melee' | 'pistol' | 'shotgun';
  damage: number; mag: number; ammo?: string; fireDelay: number; spread: number; pellets: number;
  range: number; noise: number; recoil: number; reload: number; stagger: number; knockdown: number;
}

export interface ItemDef {
  id: string; name: Loc; desc: Loc;
  kind: 'weapon' | 'ammo' | 'health' | 'defense' | 'battery' | 'key' | 'quest' | 'upgrade';
  stack: number; icon: string; heal?: number; weapon?: WeaponDef; color?: string;
}

const L = (tr: string, en: string): Loc => ({ tr, en });

export const ITEMS: Record<string, ItemDef> = {
  pipe: { id: 'pipe', kind: 'weapon', stack: 1, icon: 'pipe', name: L('Demir Boru', 'Iron Pipe'), desc: L('Paslı, ağır bir su borusu. Mermisi bitmez ama seni yakına getirir.', 'A rusty, heavy water pipe. Never runs dry — but it brings you close.'),
    weapon: { type: 'melee', damage: 30, mag: 0, fireDelay: 0.85, spread: 0, pellets: 1, range: 1.9, noise: 5, recoil: 0, reload: 0, stagger: 0.7, knockdown: 0.15 } },
  pistol: { id: 'pistol', kind: 'weapon', stack: 1, icon: 'pistol', name: L('9mm Tabanca', '9mm Pistol'), desc: L('Jandarma karakolundan. Şarjör: 10. Kafaya isabet iki kat acıtır.', 'From the gendarmerie post. Magazine: 10. Headshots hurt twice as much.'),
    weapon: { type: 'pistol', damage: 28, mag: 10, ammo: 'ammo_9mm', fireDelay: 0.32, spread: 0.018, pellets: 1, range: 45, noise: 26, recoil: 0.05, reload: 1.6, stagger: 0.35, knockdown: 0.05 } },
  shotgun: { id: 'shotgun', kind: 'weapon', stack: 1, icon: 'shotgun', name: L('Pompalı Tüfek', 'Pump Shotgun'), desc: L('Maden bekçisinin tüfeği. Yakın mesafede yıkıcı. Fişekler nadir.', "The mine watchman's shotgun. Devastating up close. Shells are rare."),
    weapon: { type: 'shotgun', damage: 17, mag: 4, ammo: 'ammo_shell', fireDelay: 1.0, spread: 0.075, pellets: 7, range: 18, noise: 34, recoil: 0.13, reload: 2.3, stagger: 1, knockdown: 0.55 } },
  ammo_9mm: { id: 'ammo_9mm', kind: 'ammo', stack: 60, icon: 'bullets', name: L('9mm Mermi', '9mm Rounds'), desc: L('Tabanca mermisi.', 'Pistol ammunition.') },
  ammo_shell: { id: 'ammo_shell', kind: 'ammo', stack: 20, icon: 'shells', name: L('Av Fişeği', 'Shotgun Shells'), desc: L('12 kalibre fişek.', '12-gauge shells.') },
  bandage: { id: 'bandage', kind: 'health', stack: 5, icon: 'bandage', heal: 25, name: L('Bandaj', 'Bandage'), desc: L('Kanamayı durdurur. +25 sağlık.', 'Stops the bleeding. +25 health.') },
  medkit: { id: 'medkit', kind: 'health', stack: 3, icon: 'medkit', heal: 60, name: L('İlk Yardım Çantası', 'First Aid Kit'), desc: L('Sağlık ocağından. +60 sağlık.', 'From the health centre. +60 health.') },
  adrenaline: { id: 'adrenaline', kind: 'health', stack: 2, icon: 'syringe', heal: 100, name: L('Adrenalin Şırıngası', 'Adrenaline Shot'), desc: L('Tam iyileşme ve kısa süreli sınırsız dayanıklılık.', 'Full heal and a short burst of unlimited stamina.') },
  knife: { id: 'knife', kind: 'defense', stack: 3, icon: 'knife', name: L('Çakı', 'Pocket Knife'), desc: L('Biri seni yakaladığında otomatik kullanılır: kurtulursun.', 'Used automatically when something grabs you: you break free.') },
  flare: { id: 'flare', kind: 'defense', stack: 4, icon: 'flare', name: L('İşaret Fişeği', 'Road Flare'), desc: L('Fırlat: ışık ve tıslama sesi onları bir süre oyalar.', 'Throw it: the light and hiss lure them away for a while.') },
  battery: { id: 'battery', kind: 'battery', stack: 6, icon: 'battery', name: L('Pil', 'Battery'), desc: L('El fenerini %50 doldurur.', 'Recharges the flashlight by 50%.') },
  backpack: { id: 'backpack', kind: 'upgrade', stack: 1, icon: 'backpack', name: L('Sırt Çantası', 'Backpack'), desc: L('+4 envanter yuvası.', '+4 inventory slots.') },
  // key / quest items
  key_police: { id: 'key_police', kind: 'key', stack: 1, icon: 'key', name: L('Karakol Anahtarı', 'Gendarmerie Key'), desc: L('Ölü bir astsubayın kemerinden. Üzerinde "KRÇ-JND" yazıyor.', 'From a dead sergeant\'s belt. Tag reads "KRÇ-JND".') },
  key_house: { id: 'key_house', kind: 'key', stack: 1, icon: 'key', name: L('Ev Anahtarı', 'House Key'), desc: L('Babamın anahtarlığı. Hâlâ aynı yerdeydi: saksının altında.', 'Dad\'s key ring. Still where it always was: under the flowerpot.') },
  boltcutter: { id: 'boltcutter', kind: 'key', stack: 1, icon: 'cutter', name: L('Zincir Makası', 'Bolt Cutters'), desc: L('Zincirli kapılar için.', 'For chained gates.') },
  key_clinic_back: { id: 'key_clinic_back', kind: 'key', stack: 1, icon: 'key', name: L('Arka Kapı Anahtarı', 'Back Door Key'), desc: L('Sağlık ocağı arka kapısı — maden yolu.', 'Health centre back door — the mine road.') },
  fuse: { id: 'fuse', kind: 'key', stack: 1, icon: 'fuse', name: L('Sigorta', 'Fuse'), desc: L('Ağır tip seramik sigorta. 60A.', 'Heavy ceramic fuse. 60A.') },
  card_meridyen: { id: 'card_meridyen', kind: 'key', stack: 1, icon: 'card', name: L('Meridyen Kartı', 'Meridian Card'), desc: L('Dr. S. Aydın — Seviye 2 erişim. Manyetik şeridi çizik.', 'Dr. S. Aydın — Level 2 access. The magnetic strip is scratched.') },
  key_office: { id: 'key_office', kind: 'key', stack: 1, icon: 'key', name: L('Ofis Anahtarı', 'Office Key'), desc: L('Maden idari binası. "Vardiya Şefi".', 'Mine admin building. "Shift Foreman".') },
  fuel: { id: 'fuel', kind: 'key', stack: 1, icon: 'fuel', name: L('Dizel Bidonu', 'Diesel Can'), desc: L('Jeneratör için yeterli.', 'Enough for the generator.') },
  tape_inverse: { id: 'tape_inverse', kind: 'quest', stack: 1, icon: 'tape', name: L('"TERS FAZ" Kaseti', '"INVERSE" Tape'), desc: L('Babamın el yazısı: "Ela için. Sona sakla."', 'Dad\'s handwriting: "For Ela. Save it for the end."') },
  key_resonator: { id: 'key_resonator', kind: 'key', stack: 1, icon: 'key', name: L('Rezonatör Anahtarı', 'Resonator Key'), desc: L('Kırmızı, ağır, üzerinde "R-0".', 'Red, heavy, stamped "R-0".') },
};

export function itemName(id: string, lang: 'tr' | 'en') { return ITEMS[id]?.name[lang] ?? id; }
