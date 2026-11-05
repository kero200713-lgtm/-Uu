/** Minimal line icons (24x24, currentColor). Drawn for this project. */
const P: Record<string, string> = {
  pipe: '<path d="M5 19L19 5"/><path d="M16 4l4 4"/><circle cx="5.5" cy="18.5" r="1.5"/>',
  pistol: '<path d="M3 8h15l2 2v2h-7l-1 2h-2l-1 5H5l1-5H4z"/><path d="M11 12v2"/>',
  shotgun: '<path d="M2 10h17l3-1v3l-3 1H10l-2 3H5l1-3H3z"/><path d="M13 13v2h3"/>',
  bullets: '<rect x="5" y="8" width="3.5" height="11" rx="1"/><rect x="10.25" y="8" width="3.5" height="11" rx="1"/><rect x="15.5" y="8" width="3.5" height="11" rx="1"/><path d="M5 8c0-3 3.5-3 3.5 0M10.25 8c0-3 3.5-3 3.5 0M15.5 8c0-3 3.5-3 3.5 0"/>',
  shells: '<rect x="6" y="6" width="5" height="13" rx="1"/><rect x="13" y="6" width="5" height="13" rx="1"/><path d="M6 15h5M13 15h5"/>',
  bandage: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-30 12 12)"/><path d="M10 10l4 4M12 9l3 3M9 12l3 3"/>',
  medkit: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M12 10v7M8.5 13.5h7"/>',
  syringe: '<path d="M14 4l6 6M17 7l-9 9-3 1 1-3 9-9M5 19l-2 2M10 10l2 2M12 8l2 2"/>',
  knife: '<path d="M4 20l6-6M10 14l9-10c1 4-1 8-6 11z"/><path d="M8 16l-1-1"/>',
  flare: '<path d="M9 21l6-12"/><path d="M15 9c-1-3 1-5 2-6 0 2 3 3 2 6-1 2-3 2-4 0z"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M7 10v4M10 10v4"/>',
  backpack: '<path d="M7 7V5a5 5 0 0 1 10 0v2"/><rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 14h6v4H9z"/>',
  key: '<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M17 12v3M20 12v2"/>',
  cutter: '<path d="M7 3l4 9M17 3l-4 9M11 12l-5 9M13 12l5 9"/><circle cx="12" cy="12" r="1.5"/>',
  fuse: '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M12 1v3M12 20v3M9 10h6M9 14h6"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M6 15h5"/>',
  fuel: '<path d="M6 21V7l4-4h7v18z"/><path d="M10 3v4H6M12 12h3"/>',
  tape: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><path d="M10 12h4M6 19l2-3h8l2 3"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h5"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6.5 7S5 19 4 16l-1.5-4a1.5 1.5 0 0 1 2.7-1.2L8 13"/>',
  door: '<path d="M6 21V3h12v18"/><path d="M3 21h18M14 12h1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  fire: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  run: '<circle cx="14" cy="4.5" r="2"/><path d="M10 9l4-1 2 4 3 1M14 8l-2 6 3 3v4M12 14l-3 3-4-1M8 11l2-2"/>',
  crouch: '<circle cx="12" cy="5" r="2"/><path d="M12 8v5l-4 3v4M12 13l4 1 1 6M8 11l4-1"/>',
  flash: '<path d="M7 3h10l-2 6H9z"/><path d="M9 9h6v12H9zM12 13v3"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  heart: '<path d="M2 12h4l2-4 3 9 3-11 2 6h6"/>',
  radio: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9L16 3M7 14h3M15 14.5a2 2 0 1 0 0 .1"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
};

export function icon(name: string, size = 24, stroke = 1.6): string {
  const body = P[name] || P.doc;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
