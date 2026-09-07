import { CATALOG } from './content.js';
import { esc } from './icons.js';

const branches=new Set(['efficient','symbiotic','feral']);
export function artFor(specimen) {
  const item=CATALOG[specimen?.id];
  if(!item)return 'assets/empty-bay.webp';
  return item.kind==='organism'&&branches.has(specimen.mutation)
    ? `assets/evolution-v4/${item.id}-${specimen.mutation}.webp`
    : item.art;
}

// The authored sheet is irregular: five equal slices include neighbouring
// rooms. These bounds sit inside its measured dark seams, retaining each frame.
const columns=[[8,501],[513,978],[991,1459],[1473,1982],[1996,2552]];
const rows=[[8,498],[514,992],[1007,1478],[1492,1984]];
const order=['void-lung','grave-moss','radiovore','frost-lichen','sun-coral',
  'bloom-stomach','shield-fern','hull-leech','echo-polyp','cinder-bloom',
  'reactor','engine','crew','storage','hydroponics',
  'radiator','scrubber','empty-bay','window-bay','cockpit'];
export const ROOM_RECTS=Object.freeze(Object.fromEntries(order.map((id,i)=>{
  const [x,right]=columns[i%5],[y,bottom]=rows[Math.floor(i/5)];
  return [id,Object.freeze({x,y,width:right-x,height:bottom-y})];
})));

export function roomArt(specimen,{alt='',lazy=false}={}) {
  const evolved=CATALOG[specimen?.id]?.kind==='organism'&&branches.has(specimen.mutation);
  const rect=evolved?null:ROOM_RECTS[specimen?.id]||ROOM_RECTS['empty-bay'];
  const style=rect?`width:${2560/rect.width*100}%;height:${2048/rect.height*100}%;left:${-rect.x/rect.width*100}%;top:${-rect.y/rect.height*100}%;`:'';
  return `<span class="room-art ${rect?'atlas-room':'evolved-room'}"${rect?` data-room="${specimen?.id||'empty-bay'}"`:''}><img src="${rect?'assets/rooms-atlas-v6.webp':artFor(specimen)}" alt="${esc(alt)}" draggable="false"${lazy?' loading="lazy"':''}${style?` style="${style}"`:''}></span>`;
}
