import { previewFinalDeparture } from './engine.js';
import { routeForecast } from './rescue-views.js';
import { esc, icon } from './icons.js';

const names={power:'power',oxygen:'oxygen',biomass:'food',heat:'heat',hull:'hull'};
const signed=n=>`${n>0?'+':''}${n}`;

export function finalDepartureOffer(state,ui) {
  if(ui.guide||!ui.routePreview)return null;
  const offer=previewFinalDeparture(state,ui.routePreview);
  return offer.available?offer:null;
}

// Header and selected route read exactly the same forecast mode. The engine's
// ledger keeps its post-contact baseline; displayed totals include that contact.
export function selectedRouteForecast(state,ui,offer) {
  if(!ui.routePreview)return null;
  if(ui.finalDeparture){
    const final=offer===undefined?finalDepartureOffer(state,ui):offer;
    if(final)return {...final.simulation,finalDeparture:final,deltas:Object.fromEntries(Object.keys(names).map(key=>[key,final.simulation.resources[key]-state.resources[key]]))};
  }
  return routeForecast(state,ui.routePreview);
}

export function finalDepartureControls(ui,offer) {
  if(!offer)return '';
  const toggle=`<button type="button" class="secondary final-preview-toggle" data-action="preview-final" data-focus="preview-final" aria-expanded="${Boolean(ui.finalDeparture)}">${ui.finalDeparture?'Back to contact forecast':'Leave the specimen and use this ship'} ${icon(ui.finalDeparture?'back':'arrow')}</button>`;
  if(!ui.finalDeparture)return toggle;
  const effects=Object.entries(offer.immediate.deltas).filter(([,value])=>value).map(([key,value])=>`${signed(value)} ${names[key]}`).join(' · ')||'No reserve change';
  return `<section class="final-departure" aria-label="Final departure without the specimen"><span class="section-label">${esc(offer.encounter.title)}</span><p>Leave <b>${esc(offer.refusal.forgoneItem.name)}</b> behind. ${esc(offer.refusal.description)}</p><p class="final-trade">${esc(offer.refusal.label)}: <b>${esc(effects)}</b> now, after storage limits.</p><p class="final-people"><b data-final-delivered="${offer.simulation.crew}">${offer.simulation.crew} people reach Eos.</b> Current layout and operation settings.</p><details class="causes final-causes" ${ui.causesOpen?'open':''}><summary>What changes and why ${icon('plus')}</summary><ol>${offer.simulation.events.map(event=>`<li class="${event.type}">${esc(event.text)}</li>`).join('')}</ol></details><button type="button" class="primary" data-action="depart-final" data-route="${offer.route.id}" data-focus="depart-final">Leave specimen &amp; jump to Eos ${icon('arrow')}</button>${toggle}</section>`;
}
