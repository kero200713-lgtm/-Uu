import type { Loc } from '../world/types';

export const OBJECTIVES: Record<string, Loc> = {
  obj_reach_town: { tr: 'Karaçam\'a ulaş.', en: 'Reach Karaçam.' },
  obj_find_way: { tr: 'Sağlık ocağına giden yolu aç.', en: 'Find a way to the health centre.' },
  obj_find_tool: { tr: 'Sağlık ocağı kapısındaki zinciri kesecek bir şey bul.', en: 'Find something to cut the chain on the health centre gate.' },
  obj_cut_chain: { tr: 'Zincir makasıyla sağlık ocağı kapısını aç (kuzey).', en: 'Open the health centre gate with the bolt cutters (north).' },
  obj_clinic: { tr: 'Sağlık ocağından geçip maden yoluna çık.', en: 'Get through the health centre to the mine road.' },
  obj_clinic_power: { tr: 'Arka kapının kilidine güç ver — sigorta kutusu.', en: 'Restore power to the back door — the fuse box.' },
  obj_generator: { tr: 'Jeneratörü çalıştır — yakıt gerekli.', en: 'Start the generator — it needs fuel.' },
  obj_lift: { tr: 'Kuyu kulesindeki asansörle aşağı in.', en: 'Take the lift in the headframe tower down.' },
  obj_lab: { tr: 'Babanın laboratuvarını bul.', en: "Find your father's laboratory." },
  obj_shaft: { tr: 'Sondaj kuyusundan KORO\'ya in.', en: 'Descend the drill shaft to the CHOIR.' },
  obj_resonators: { tr: 'Rezonatörleri kapat', en: 'Shut down the resonators' },
  obj_tape: { tr: 'Kaseti ana konsolda çal.', en: 'Play the tape at the main console.' },
  obj_escape: { tr: 'KAÇ! Kuyuya dön.', en: 'RUN! Back to the shaft.' },
};
