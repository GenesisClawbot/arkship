import { CATALOG, RESOURCE_KEYS } from './content.js';
import { act, getEncounter, getItemStats, neighbours, simulate, getLifeSupport } from './engine.js';
import { esc } from './icons.js';

export const RESOURCE_HELP = {
  power: { title: 'Power · stored energy', text: 'Pooled across the ship. A jump uses 4 power; modules also pay their listed input each jump. A negative final balance triggers an emergency jump: −3 hull. Zero power alone is safe. Check the forecast before committing.' },
  oxygen: { title: 'Oxygen · keep it above zero', text: 'The crew uses 4 oxygen each jump. At zero or below after operation and hazards, lose 2 crew and 4 hull. Stored oxygen buys preparation time. All rooms draw from the same reserve.' },
  biomass: { title: 'Food · biomass for life and refits', text: 'The crew uses 3 food each jump. Organisms may consume more. At zero or below after the jump, lose 1 crew and 3 hull. Refits and growth also cost food; their price is paid on commit, before production.' },
  heat: { title: 'Heat · 0–15 is safe', text: 'Above 15 after the jump, each 2 excess heat costs 1 hull, rounded up. For example, 18 heat costs 2 hull. Lower is usually safer; base Cinder Bloom needs 3 available heat to operate. Strains can change that input. Heat is pooled, not a temperature in each room.' },
  hull: { title: 'Hull · damage persists', text: 'Reach zero hull and the voyage ends, even at Eos Refuge. Debris, overheating and shortages damage it. Plan a repair for 4 food → 6 hull, up to the 30 hull maximum. Forecasts include incoming damage.' },
};
export function resourceHelp(key,state) {
  if(!state||state.ruleset!==5)return RESOURCE_HELP[key];
  const life=getLifeSupport(state);
  if(key==='people')return {title:`${life.people} people aboard`,text:`Each committed jump uses ${life.oxygen} oxygen and ${life.biomass} food for the living people aboard. Optional lifeboats add six people, with their own berths. More people need more air and food every jump. Only people still alive at Eos count as delivered.`};
  if(key==='oxygen')return {title:'Oxygen · keep people breathing',text:`${life.people} people use ${life.oxygen} oxygen each jump, before modules operate. Organisms may need additional oxygen. At zero or below after operation and hazards, lose 2 people and 4 hull. Reserves and new life support can fund an optional rescue.`};
  if(key==='biomass')return {title:'Food · people, organisms and refits',text:`${life.people} people use ${life.biomass} food each jump. Organisms also pay their inputs. Refits and growing seeds compete for this same reserve. At zero or below after operation and hazards, lose 1 person and 3 hull.`};
  return RESOURCE_HELP[key];
}
const labels = { power:'power', oxygen:'oxygen', biomass:'food', heat:'heat', hull:'hull' };
export function rateText(stats) {
  const input=Object.entries(stats.input).filter(([,v])=>v).map(([k,v])=>`${v} ${labels[k]}`).join(', ') || 'no input';
  const output=Object.entries(stats.output).filter(([,v])=>v).map(([k,v])=>`${v>0?'+':''}${v} ${labels[k]}`);
  if(stats.defence) output.push(`${stats.defence} debris shielding`);
  return `${input} → ${output.join(', ') || 'no production'}`;
}
export function mutationComparison(specimen, branch, route, options={}) {
  const context={ruleset:options.ruleset,hazard:route?.hazard,symbioticActive:options.symbioticActive===true};
  const before=getItemStats({...specimen,mutation:null},context);
  const after=getItemStats({...specimen,mutation:branch},context);
  const changes=[];
  for(const kind of ['input','output']) for(const key of Object.keys(labels)) {
    if(before[kind][key]!==after[kind][key]) changes.push(`${labels[key]} ${kind}: ${before[kind][key]} → ${after[kind][key]}`);
  }
  if(before.defence!==after.defence)changes.push(`debris shielding: ${before.defence} → ${after.defence}`);
  return {
    text:changes.join(' · ') || 'No rate change in these conditions.',
    isolated:rateText(getItemStats({...specimen,mutation:branch},{...context,symbioticActive:false})),
    paired:branch==='symbiotic'?rateText(getItemStats({...specimen,mutation:branch},{...context,symbioticActive:true})):null,
  };
}

export function plannedRepairEvent(report) {
  return report?.events?.find(e=>e.type==='plan'&&e.source==='refit'&&e.delta?.hull>0);
}

export function reportSummary(state) {
  const events=state.lastReport?.events||[];
  const casualties=events.some(e=>e.type==='pressure'&&['oxygen','biomass'].includes(e.source));
  const pressure=events.find(e=>e.type==='pressure');
  const damage=events.find(e=>e.delta?.hull<0&&['hazard','danger','damage'].includes(e.type));
  const dormant=events.find(e=>e.type==='dormant'&&!e.text.startsWith('Paused by you'));
  const mutation=events.find(e=>e.type==='mutation');
  const growth=events.find(e=>e.type==='growth');
  const repair=plannedRepairEvent(state.lastReport);
  const before=state.lastReport?.before?.hull,after=state.lastReport?.after?.hull;
  if(casualties)return {tone:'loss',title:'Life support<br>has failed.',text:`Not everyone survived this crossing. ${Math.max(0,state.crew)} ${state.ruleset===5?'people':'crew'} remain. Check life support before the next jump.`};
  if(pressure)return {tone:'warning',title:'The crossing<br>left a mark.',text:pressure.text};
  if(damage&&repair&&Number.isFinite(before)&&Number.isFinite(after)){
    const damageTaken=-events.filter(e=>e.delta?.hull<0&&['hazard','danger','damage','pressure'].includes(e.type)).reduce((sum,e)=>sum+e.delta.hull,0);
    const net=after-before;
    return {
      tone:net<0?'warning':'stable',
      title:net>0?'Repairs outpaced<br>the damage.':net<0?'Damage outpaced<br>the repairs.':'Repairs held<br>the hull together.',
      text:`The refit restored ${repair.delta.hull} hull before ${damageTaken} damage. Hull ${net===0?`held at ${after}`:`${net>0?'rose':'fell'} from ${before} to ${after}`}.`,
    };
  }
  if(damage&&state.lastReport?.after?.hull>state.lastReport?.before?.hull)return {tone:'stable',title:'Repairs outpaced<br>the damage.',text:`Hull recovered from ${state.lastReport.before.hull} to ${state.lastReport.after.hull}, after incoming damage.`};
  if(damage)return {tone:'warning',title:'Damage taken.<br>Still together.',text:damage.text};
  if(dormant)return {tone:'warning',title:'A part of the ark<br>fell quiet.',text:dormant.text};
  if(mutation)return {tone:'mutation',title:'Something new<br>is alive aboard.',text:'A strain changed this crossing. Its new anatomy and operating rates are recorded below.'};
  if(growth)return {tone:'growth',title:'Life has found<br>another foothold.',text:growth.text};
  if(repair&&after>before)return {tone:'stable',title:'Repairs restored<br>the hull.',text:`The refit restored ${repair.delta.hull} hull. Hull rose from ${before} to ${after}.`};
  return state.lastReport?.synergies?.length
    ? {tone:'stable',title:'Life works<br>together.',text:'Your active neighbours sustained the ark through this crossing.'}
    : {tone:'stable',title:'Another crossing.<br>Still alive.',text:'Your ark has crossed another stretch of the dark.'};
}
export function offerForRoute(state, route) {
  const selected=act(state,{type:'SELECT_ROUTE',routeId:route.id});
  const contact=getEncounter(selected);
  const choice=contact?.choices.find(c=>c.reward?.items?.length);
  if(!choice)return null;
  const cost=Object.entries(choice.cost).filter(([,v])=>v).map(([k,v])=>`${v} ${labels[k]}`).join(' + ') || 'no supplies';
  const item=CATALOG[choice.reward.items[0]];
  const alternatives=contact.choices.filter(c=>c.id!=='reject'&&!c.reward.items.length&&RESOURCE_KEYS.some(k=>c.reward.resources[k])).map(c=>{
    const resolved=c.disabled?null:act(selected,{type:'CHOOSE',choiceId:c.id});
    return {
      id:c.id,label:c.label,cost:{...c.cost},reward:{...c.reward.resources},disabled:c.disabled,reason:c.disabledReason,
      immediate:resolved?{before:{...selected.resources},after:{...resolved.resources},deltas:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,resolved.resources[k]-selected.resources[k]]))}:null,
    };
  });
  return { role:item?.role || item?.category || (item?.kind==='organism'?'Living specimen':'Ship module'), cost, disabled:choice.disabled, reason:choice.disabledReason, encounterId:contact.id, encounterTitle:contact.title, alternatives };
}

const KEY='arkship.preferences.v1';
export function createPreferences(storage) {
  let value={version:1,music:true,effects:true,guideDone:false,guideRun:null};
  try {
    const saved=JSON.parse(storage?.getItem(KEY)||'null');
    if(saved?.version===1) for(const key of ['music','effects','guideDone']) if(typeof saved[key]==='boolean') value[key]=saved[key];
    if(typeof saved?.guideRun==='string'&&saved.guideRun.length<=100)value.guideRun=saved.guideRun;
  } catch {}
  return { get:()=>({...value}), set(patch) {
    for(const key of ['music','effects','guideDone'])if(typeof patch[key]==='boolean')value[key]=patch[key];
    if(patch.guideRun===null||typeof patch.guideRun==='string'&&patch.guideRun.length<=100)value.guideRun=patch.guideRun;
    try{storage?.setItem(KEY,JSON.stringify(value));}catch{}
    return {...value};
  }};
}

export function guideStep(state,ui) {
  if(!ui.guide||!state||state.phase==='ended')return null;
  if(state.turn>=2&&!ui.guideReplay)return { title:'You have the controls.', text:'Choose routes for your ship. Keep inspecting the forecast: new life can change the balance. Mutations change a specimen’s rates; the archive keeps the strains you bank.', action:'guide-done', label:'Continue on my own', target:null };
  if(state.phase==='route')return ui.routePreview
    ? {title:'Read the consequence.',text:'These are this ship’s reserves after the selected hazard. Buying the find costs extra. Contact a signal to inspect its find and prepare; the later Commit button makes the jump.',target:'[data-action="take-route"]'}
    : {title:state.turn?'Prepare for what is ahead.':'1. Choose a crossing.',text:'Each signal offers a find and a known hazard. Tap one to see what it means for this ship before travelling.',target:'[data-action="route"]'};
  if(state.phase==='encounter')return {title:'2. Decide what comes aboard.',text:'The scan shows what this specimen consumes and produces each jump. The price below is paid now. You can also keep your supplies and leave.',target:'.specimen-scan'};
  if(state.phase==='report')return {title:'Check what actually happened.',text:'Compare Before → After and read the highlighted interactions. A highlighted pair shares a local effect; power, oxygen and food are pooled everywhere.',target:'.report-resources'};
  if(state.phase!=='build')return null;
  const lung=state.grid.findIndex(x=>x?.id==='void-lung');
  const cargoLung=state.cargo.find(x=>x.id==='void-lung');
  const hydro=state.grid.findIndex(x=>x?.id==='hydroponics');
  const targets=neighbours(hydro).filter(i=>state.openBays.includes(i)&&!state.grid[i]);
  const chosen=state.cargo.find(item=>item.uid===ui.placing);
  if(state.turn===0&&chosen&&chosen.id!=='void-lung'&&cargoLung&&targets.length){
    const bay=state.openBays.find(i=>!state.grid[i]&&i!==targets[0]);
    if(bay!==undefined)return {title:'Place the find you chose.',text:`Your ${CATALOG[chosen.id].name} is selected. Tap highlighted bay ${bay+1} to graft it. Bay ${targets[0]+1} stays open for a Lung beside Hydroponics; we can try that local partnership next.`,target:`.bay[data-index="${bay}"]`,cargo:null,bay};
  }
  if(state.turn===0&&cargoLung&&targets.length) return {title:'3. Give the ark breath.',text:ui.placing===cargoLung.uid?`Tap highlighted bay ${targets[0]+1}. The Lung makes oxygen; beside Hydroponics, its warmth adds 2 food per jump.`:'Select your Void Lung, then place it beside Hydroponics. This teaches a real local interaction.',target:ui.placing===cargoLung.uid?`.bay[data-index="${targets[0]}"]`:`[data-action="cargo"][data-uid="${cargoLung.uid}"]`,cargo:ui.placing===cargoLung.uid?null:cargoLung.uid,bay:ui.placing===cargoLung.uid?targets[0]:null};
  if(state.turn===0&&lung>=0&&!neighbours(lung).includes(hydro))return {title:'Try the neighbouring bay.',text:'The Lung makes oxygen here, but Hydroponics gains 2 food only when they touch edge to edge. A new graft can be moved freely before committing.',target:`.bay[data-index="${lung}"]`};
  const radiator=state.cargo.find(x=>x.id==='radiator');
  const alreadyCooled=state.turn===0&&radiator&&simulate(state).cellReports.some(cell=>cell.status==='active'&&cell.id!=='radiator'&&cell.outputs.heat<0);
  if(state.turn===0&&radiator&&!alreadyCooled){
    const bay=state.openBays.find(i=>!state.grid[i]);
    return {title:'4. Make room for cooling.',text:'The Lung adds heat. Your Radiator spends 1 power to remove 4 heat anywhere aboard. It does not need to touch the Lung. Heat from 0 to 15 is safe.',target:ui.placing===radiator.uid&&bay!==undefined?`.bay[data-index="${bay}"]`:`[data-action="cargo"][data-uid="${radiator.uid}"]`,cargo:ui.placing===radiator.uid?null:radiator.uid,bay:ui.placing===radiator.uid?bay:null};
  }
  return {title:state.turn?'Refit for this crossing.':'5. Preview, then commit.',text:state.turn?(state.ruleset>=4?'Pause optional rooms to save their inputs; they stop producing and helping neighbours. Moving an established graft costs a refit, 2 food and one dormant jump. Undo is free.':'New cargo is freely placeable. Moving an established graft uses a refit, costs 2 food and makes it dormant for this jump. Undo is free until commit.'):'The forecast includes your actual layout and chosen hazard. Nothing ages while you plan. Undo freely, then commit the jump when the reserves look safe.',target:'.forecast'};
}
export function guideMarkup(step) {
  if(!step)return '';
  return `<aside class="coach" aria-label="Guided voyage"><div><span class="eyebrow mint">FLIGHT GUIDE</span><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p></div><div class="coach-actions"><button type="button" class="text-button" data-action="${step.action||'guide-target'}">${esc(step.label||'Show me')}</button><button type="button" class="text-button" data-action="guide-skip">Skip guide</button></div></aside>`;
}
