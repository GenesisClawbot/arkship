import * as engine from './engine.js';
import { esc, icon, signed } from './icons.js';
import { rescueSchedule } from './rescue-views.js';

const names={power:'power',oxygen:'oxygen',biomass:'food',heat:'heat',hull:'hull'};

export function flightPlan(state) {
  if(!(state.ruleset>=4))return '';
  return `<ol class="flight-plan">${[1,4,7].map(start=>{
    const crossing=engine.getCrossing(state,start);
    return `<li class="${state.system>=start&&state.system<=crossing.end?'current':''}"><span>${start}–${crossing.end}</span><div><strong>${esc(crossing.name)}</strong><small>${esc(crossing.description)}</small></div></li>`;
  }).join('')}</ol>${rescueSchedule(state)}`;
}

export function crossingNotice(state) {
  if(!(state.ruleset>=4))return '';
  const current=engine.getCrossing(state),next=state.system<7?engine.getCrossing(state,state.system<4?4:7):null;
  return `<section class="crossing-notice ${current.id}" aria-label="Known crossing conditions"><span class="eyebrow">JUMPS ${current.start}–${current.end} · ${Math.max(0,current.end-state.system+1)} REMAINING</span><strong>${esc(current.name)}</strong><p>${esc(current.description)}</p>${next?`<p class="crossing-next">Ahead at ${next.start}: <b>${esc(next.name)}</b> · ${esc(next.description)}</p>`:''}<details><summary>Full flight plan ${icon('plus')}</summary>${flightPlan(state)}<p class="field-note">Conditions affect every signal in their crossing. Each route also has its own hazard. Services open before jumps 4 and 7.</p></details></section>`;
}

// A disclosed scenario, not a promise about the player's future choices.
// All operation, growth, exposure, pressure and caps still run through simulate.
export function crossingTrend(state, kind=state.route?.kind||'garden') {
  let projected=structuredClone(state);
  const end=Math.min(9,state.system+2),steps=[];
  for(let system=state.system;system<=end;system++){
    const route=system===state.system&&state.route?state.route:engine.getRoutes(projected).find(r=>r.kind===kind);
    const result=engine.simulate(projected,route);
    steps.push({system,route,resources:result.resources,crew:result.crew,outcome:result.outcome});
    if(result.outcome)break;
    projected={...projected,grid:result.grid,resources:result.resources,crew:result.crew,nextUid:result.nextUid,system:system+1,turn:projected.turn+1,plan:null,route:null,phase:'route'};
  }
  return steps;
}

export function trendMarkup(state) {
  if(!(state.ruleset>=4)||state.system>=9)return '';
  if(!engine.getPlan(state).committable)return '<p class="field-note">Resolve the draft cost or refit limit before projecting later jumps.</p>';
  const kind=state.route?.kind||'garden',steps=crossingTrend(state,kind);
  return `<details class="crossing-trend"><summary>Can this ship sustain ${steps.length} jumps? ${icon('plus')}</summary><p>Keep this layout and operation settings; follow <b>${kind==='salvage'?'derelict':kind==='anomaly'?'anomalous':'garden'} signals</b> afterward. No later rescues, trades or refits. Growth, exposure and shortages are included.</p><div class="trend-scroll"><table><caption>Projected reserves, including this planned jump</caption><thead><tr><th>Jump</th><th>Power</th><th>Oxygen</th><th>Food</th><th>Heat</th><th>Hull</th>${state.ruleset===5?'<th>People</th>':''}</tr></thead><tbody>${steps.map(step=>`<tr><th>${step.system}</th>${Object.keys(names).map(k=>`<td class="${(k==='heat'?step.resources[k]>15:step.resources[k]<=0)?'danger-text':''}">${step.resources[k]}</td>`).join('')}${state.ruleset===5?`<td>${Math.max(0,step.crew)}</td>`:''}</tr>`).join('')}</tbody></table></div>${steps.at(-1)?.outcome==='loss'?'<p class="danger-text">This unchanged plan does not survive the full crossing.</p>':''}</details>`;
}

export function portExchangeMarkup(state) {
  if(!(state.ruleset>=4))return '';
  const exchange=engine.getPortExchange(state);
  if(!exchange.available)return '';
  const actual=exchange.selected?engine.simulate(state).events.find(e=>e.type==='exchange')?.delta:exchange.flow;
  const choices=[['power-for-food','6 power → 4 food'],['food-for-power','4 food → 6 power'],[null,'Keep supplies']];
  return `<div class="port-exchange"><strong>Exchange reserves</strong><p>One exchange on commit. Keep your stockpile or fund the next adaptation.</p><div>${choices.map(([key,label])=>`<button type="button" class="secondary ${exchange.selected===key?'selected':''}" data-action="port-exchange" data-exchange="${key||''}" data-focus="exchange-${key||'keep'}" aria-pressed="${exchange.selected===key}">${esc(label)}</button>`).join('')}</div>${exchange.selected?`<small>Draft exchange: ${Object.entries(actual||exchange.flow).filter(([,v])=>v).map(([k,v])=>`${signed(v)} ${names[k]}`).join(' · ')}. After storage caps; included in the forecast. Undo or replace before departure.</small>`:''}</div>`;
}
