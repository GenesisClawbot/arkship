const paths = {
 power:'m13 2-9 12h7l-1 8 10-13h-8l1-7Z',
 oxygen:'M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z',
 biomass:'M20 3C7 2 2 8 6 16c7 5 15-2 14-13ZM5 21 16 9',
 heat:'M12 3c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-6 0 3 2 3 3 4 2-3 0-5 0-10Z',
 hull:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z',
 arrow:'M4 12h16m-6-6 6 6-6 6',
 back:'M20 12H4m6-6-6 6 6 6',
 close:'m6 6 12 12M18 6 6 18',
 archive:'M4 5h16v4H4V5Zm2 4v11h12V9M9 13h6',
 sound:'m4 10 5 0 5-5v14l-5-5H4v-4Zm13-2q5 4 0 8',
 mute:'m4 10 5 0 5-5v14l-5-5H4v-4Zm13-1 5 6m0-6-5 6',
 plus:'M12 5v14M5 12h14',
 repair:'m4 20 9-9M14 3a5 5 0 0 0 7 7l-4-1-2-3-1-3ZM4 20l-1-3 3-2 2 2-1 3H4Z',
 move:'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
 mutation:'M6 3c12 6 0 12 12 18M18 3C6 9 18 15 6 21M7 5h10M7 19h10M9 9h6M9 15h6',
 check:'m5 12 4 4L19 6',
 alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',
 crew:'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3 21v-4a6 6 0 0 1 12 0v4M16 5a3 3 0 0 1 0 6m2 3c2 1 3 3 3 6',
 lock:'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4',
 star:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
 debris:'m6 3 4 3-2 5-5-2 3-6Zm9 10 6 2-2 6-7-2 3-6ZM17 4l3 2-1 4-4-2 2-4Z',
 solar:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2',
 spores:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM7 7 4 4m13 3 3-3M7 17l-3 3m13-3 3 3M12 2v3M2 12h3m14 0h3m-10 7v3',
 info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7v6m0-10v1',
 stop:'M5 5h14v14H5V5Z'
};
export function icon(name, cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.star}"/></svg>`; }
export const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
