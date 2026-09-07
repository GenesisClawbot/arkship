import { roomArt } from './art.js';
import { getLifeSupport, getRescueSchedule, getRescueOpportunity, previewRescue, previewRoute, getEncounter, getPeopleRecord } from './engine.js';
import { esc, icon } from './icons.js';

const names={power:'Power',oxygen:'Oxygen',biomass:'Food',heat:'Heat',hull:'Hull'};
const hazards={solar:'Solar flare',debris:'Debris field',spores:'Spore cloud'};

export function peopleDemand(state,forecast=null) {
  if(state.ruleset!==5)return '';
  const demand=getLifeSupport(state),remaining=Math.max(0,forecast?.crew??state.crew);
  return `<div class="people-demand"><button type="button" data-help="people" aria-label="Explain life support for ${demand.people} people">${icon('crew')}<span><b>${demand.people} people</b> · ${demand.oxygen} oxygen + ${demand.biomass} food each jump</span>${icon('info')}</button>${forecast&&remaining<state.crew?`<p class="danger-text" data-people-forecast="${remaining}">This plan loses ${state.crew-remaining} people. ${remaining} would remain.</p>`:''}</div>`;
}

export function rescueSchedule(state) {
  const schedule=getRescueSchedule(state);
  if(!schedule.length)return '';
  return `<section class="rescue-schedule"><strong>Optional lifeboat signals</strong><p>Carry six more people at each signal you reach. They share your air and food until arrival.</p><ol>${schedule.map(x=>`<li><b>Jump ${x.system}</b><span>6 people · ${hazards[x.hazard]}</span></li>`).join('')}</ol><small>Each replaces one specimen route. No rescue quota; take the load your ark can support.</small></section>`;
}

export function rescueOffer(state,route) {
  const opportunity=getRescueOpportunity(state,route);
  if(!opportunity)return null;
  const before=getLifeSupport(state),after=getLifeSupport(state,state.crew+opportunity.people);
  return {opportunity,before,after,text:`${before.oxygen} → ${after.oxygen} oxygen · ${before.biomass} → ${after.biomass} food each jump`};
}

// Both surfaces receive the same result produced by the actual encounter path.
export function routeForecast(state,routeId) {
  const rescue=previewRescue(state,routeId,true);
  return rescue?{...rescue.simulation,rescue}:previewRoute(state,routeId);
}

export function rescueForecastNote(forecast) {
  if(!forecast?.rescue)return '';
  const {rescue}=forecast,total=rescue.lifeSupport.people,remaining=Math.max(0,forecast.crew);
  return `<p class="rescue-forecast-note ${remaining<total?'danger-text':''}"><b data-people-forecast="${remaining}">${remaining} people after this jump${remaining<total?` · ${total-remaining} would be lost`:''}.</b> Forecast includes accepting the six passengers. You can refit after contact.</p>`;
}

export function rescueEncounter(state) {
  const opportunity=getRescueOpportunity(state);
  if(!opportunity)return '';
  const offer=rescueOffer(state,state.route),encounter=getEncounter(state);
  const accept=previewRescue(state,state.route.id,true),decline=previewRescue(state,state.route.id,false);
  if(!accept||!decline||!encounter)return '<p>The lifeboat forecast is unavailable.</p>';
  const survivors=Math.max(0,accept.simulation.crew),expected=accept.lifeSupport.people;
  return `<span class="eyebrow mint">02 / CONTACT · LIFEBOATS</span><div class="rescue-contact">${roomArt({id:'crew'},{alt:"Inhabited lifeboats connect to the ark's life support"})}<span>${icon('crew')}<b>6</b> people seeking passage</span></div><h2>${esc(encounter.title)}</h2><p>Connect their lifeboats to your ark. Six more people will share your oxygen and food on every remaining jump.</p><div class="rescue-demand"><strong>Life support on each jump</strong><span data-rescue-demand>${esc(offer.text)}</span><small>The connected lifeboats provide their own berths; ship bays remain available for life support.</small></div><table class="rescue-comparison"><caption>Next jump with your current layout</caption><thead><tr><th>After the jump</th><th>Connect six</th><th>Continue</th></tr></thead><tbody><tr class="people-row"><th>People alive</th><td data-rescue-people="accept" class="${survivors<expected?'danger-text':''}">${survivors}</td><td data-rescue-people="decline">${Math.max(0,decline.simulation.crew)}</td></tr>${Object.entries(names).map(([key,name])=>`<tr><th>${name}</th><td data-rescue-projected="${key}">${accept.simulation.resources[key]}</td><td data-decline-projected="${key}">${decline.simulation.resources[key]}</td></tr>`).join('')}</tbody></table>${survivors<expected?`<p class="rescue-caution danger-text">This layout would lose ${expected-survivors} people. Dock only if you can improve life support before committing.</p>`:''}<div class="choice-list">${encounter.choices.map(choice=>`<button type="button" class="choice-option" data-action="choice" data-choice="${choice.id}" data-focus="choice-${choice.id}" ${choice.disabled?'disabled':''}><strong>${esc(choice.label)} ${icon('arrow')}</strong><span>${choice.id==='accept-rescue'?`+6 people aboard · ${accept.lifeSupport.oxygen} oxygen and ${accept.lifeSupport.biomass} food used each jump`:'Keep the current load. This signal will not return.'}</span>${choice.disabled?`<span class="disabled-reason">${esc(choice.disabledReason)}</span>`:''}</button>`).join('')}</div><p class="field-note">Docking is final. Ship refits stay reversible until you jump. Later signals bring different people.</p>`;
}

export function peopleEnding(state) {
  const record=getPeopleRecord(state);
  if(state.ruleset!==5)return '';
  const win=state.outcome==='win',evacuated=state.outcome==='evacuation';
  return `<section class="people-ending"><span class="eyebrow">${win?'PEOPLE DELIVERED':evacuated?'PEOPLE EVACUATED':'PEOPLE AT LAST CONTACT'}</span><b data-delivered-people="${record.delivered}">${win?record.delivered:record.aboard}</b><p>${win?'Reached Eos Refuge.':evacuated?'Reached the service beacon.':'The ark did not reach Eos Refuge.'}</p><small><span data-embarked-people="${record.embarked}">${record.embarked} embarked</span> · <span data-lost-people="${record.lost}">${record.lost} ${record.lost===1?'life':'lives'} lost ${win||evacuated?'during the voyage':'before the final transmission'}</span></small></section>`;
}
