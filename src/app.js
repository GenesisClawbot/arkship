import { createRun, simulate, act, neighbours, getItemStats, getLifeSupport } from './engine.js';
import { CATALOG } from './content.js';
import { createPersistence } from './persistence.js';
import { createAudio } from './audio.js';
import { header, pressures, ship, welcome, routePanel, encounterPanel, buildPanel, reportPanel, endPanel, archivePage, nameOf } from './views.js';
import { icon, esc } from './icons.js';
import { createPreferences, resourceHelp, rateText, guideStep, guideMarkup } from './guidance.js';
import { flightPlan } from './crossing-views.js';
import { playtestControls, createPlaytestReport, BUILD } from './playtest.js';
import { getVisualLinks } from './ecology.js';
import { selectedRouteForecast } from './departure-views.js';

let storage;
try { storage = window.localStorage; } catch { storage = null; }
const persistence = createPersistence(storage);
let snapshot = persistence.load();
let state = snapshot.run;
const preview = createRun('PALE-BLUE-7');
const audio = createAudio();
const preferences=createPreferences(storage);
audio.set(snapshot.settings.sound,preferences.get());
const ui = { page:state?'game':'welcome', selected:null, storedInspection:null, placing:null, moving:null, gridFocus:6, jumping:false, mutationOpen:false, causesOpen:false, seed:'PALE-BLUE-7', confirmNew:false, confirmEvac:false, reclaimTarget:null, routePreview:null, finalDeparture:false, seedKeys:[], bankKeys:[], notice:'' };
Object.assign(ui,{preferences:preferences.get(),guide:preferences.get().guideRun===state?.runId,guideChoice:!preferences.get().guideDone,soundOpen:false});
const app = document.querySelector('#app');
let noticeTimer, jumpTimer, currentForecast;
const help=document.createElement('aside');
help.id='context-help';help.className='context-help';help.setAttribute('role','tooltip');help.hidden=true;document.body.append(help);
let helpSource=null,helpPinned=false;
function hideHelp(){help.hidden=true;helpSource?.removeAttribute('aria-describedby');helpSource=null;helpPinned=false;}
function showHelp(source,pinned=false){
  let title,text;
  if(source.dataset.help){({title,text}=resourceHelp(source.dataset.help,state)||{});}
  else if(source.dataset.helpBay!==undefined){
    const i=Number(source.dataset.helpBay),specimen=state?.grid[i];
    if(!specimen)return;
    const cell=currentForecast?.cellReports?.[i],data=CATALOG[specimen.id];
    title=`${specimen.mutation?specimen.mutation+' ':''}${data.name}`;
    const stats=cell?{input:cell.inputs,output:cell.outputs,defence:cell.defence}:getItemStats(specimen,{ruleset:state.ruleset,hazard:state.route?.hazard});
    const life=getLifeSupport(state);
    text=['engine','crew'].includes(specimen.id)?`Each jump uses 4 power, ${life.oxygen} oxygen and ${life.biomass} food for ${life.people} people.`:`${rateText(stats)} per jump.`;
    const reason=['route','build'].includes(state.phase)&&cell?.reason==='Operated this jump.'?'Will operate on the next committed jump.':cell?.reason;
    text+=` ${reason||data.description}`;
    if(cell?.localTargets?.length)text+=` ${cell.localTargets.map(t=>`Bay ${t.index+1}: ${t.text}`).join(' ')}`;
    text+=getVisualLinks(currentForecast).filter(link=>link.kind==='symbiosis'&&(link.source===i||link.target===i)).map(link=>' '+link.text).join('');
    text+=' Tap the room for full details and exact affected cells.';
  }
  if(!title)return;
  hideHelp();helpSource=source;helpPinned=pinned;
  help.innerHTML=`<strong>${esc(title)}</strong><p>${esc(text)}</p>`;help.hidden=false;source.setAttribute('aria-describedby',help.id);
  const rect=source.getBoundingClientRect(),size=help.getBoundingClientRect();
  help.style.left=`${Math.max(12,Math.min(innerWidth-size.width-12,rect.left))}px`;
  help.style.top=`${Math.max(12,Math.min(innerHeight-size.height-90,rect.bottom+8))}px`;
}

function announce(text) {
  const node=document.querySelector('#announcer');
  node.textContent='';
  requestAnimationFrame(()=>{ node.textContent=text; });
}

function render(focus, phaseChanged=false) {
  const scroll=window.scrollY;
  hideHelp();
  const active = focus || document.activeElement?.dataset?.focus;
  const current = state || preview;
  const forecast=state?.phase==='build'?simulate(state):state?.phase==='route'&&ui.routePreview?selectedRouteForecast(state,ui):null;
  const cellEvidence=forecast||(['report','ended'].includes(state?.phase)&&state?.lastReport?{...state.lastReport,...state.lastSimulation,resources:state.lastReport.after,grid:state.grid}:null);
  currentForecast=cellEvidence;
  audio.scene(ui.page==='welcome'?null:state);
  let body;
  if(ui.page==='archive') body=archivePage(state,ui,snapshot);
  else if(ui.page==='welcome') body=welcome(preview,ui,snapshot);
  else {
    const panel=state.phase==='route'?routePanel(state,ui):state.phase==='encounter'?encounterPanel(state):state.phase==='build'?buildPanel(state,ui,forecast):state.phase==='report'?reportPanel(state,ui):endPanel(state,ui);
    const step=guideStep(state,ui);
    body=`${pressures(state,forecast)}<main class="layout game-layout phase-${state.phase} ${ui.guide?'guided':''}">${ship(state,ui,cellEvidence)}<section class="decision" id="decision" tabindex="-1" aria-label="Current decision">${guideMarkup(step)}${panel}</section></main><footer class="game-footer"><span>VOYAGE ${esc(state.seed)}<span class="desktop-only"> / ARK—07</span></span><span>${snapshot.available===false?'UNSAVED · STORAGE UNAVAILABLE':'VOYAGE SAVED ON THIS DEVICE'}</span>${state.phase!=='ended'?`<button type="button" data-action="restart" class="text-button" data-focus="restart">New voyage</button>`:''}</footer>`;
  }
  const toast=ui.notice || state?.notice || snapshot.notice;
  app.innerHTML=`${header(current,ui,snapshot)}${body}${playtestControls(state,ui.playtestOpen)}${toast?`<div class="toast" role="status">${icon('info')}<span>${esc(toast)}</span></div>`:''}${ui.confirmNew?`<div class="restart-banner"><span>Abandon this voyage? Your archive stays.</span><div><button type="button" class="secondary" data-action="cancel-new">Keep playing</button><button type="button" class="secondary" data-action="confirm-new">Abandon voyage</button></div></div>`:''}${ui.confirmEvac?`<div class="restart-banner evacuation-banner"><span>Evacuate to the beacon? Your draft is discarded. You may rescue one retained strain; the ark is abandoned.</span><div><button type="button" class="secondary" data-action="cancel-evac">Keep playing</button><button type="button" class="secondary" data-action="confirm-evac">Evacuate now</button></div></div>`:''}`;
  const playtestDialog=app.querySelector('.playtest-dialog');
  if(playtestDialog)playtestDialog.showModal();
  document.body.dataset.phase=ui.page==='game'?state.phase:ui.page;
  document.body.dataset.outcome=state?.outcome||'';
  const step=ui.page==='game'?guideStep(state,ui):null;
  if(step?.target)app.querySelector(step.target)?.classList.add('guide-target');
  if(ui.guide&&state?.phase==='build')app.querySelector('.coach')&&app.querySelector('.ship-scene').prepend(app.querySelector('.coach'));
  const grid=app.querySelector('.ship-grid');
  if(grid) grid.addEventListener('keydown',gridKeydown);
  app.querySelector('.specimen-details')?.addEventListener('toggle',e=>ui.specimenDetailsOpen=e.target.open);
  app.querySelector('.mutation-options')?.addEventListener('toggle',e=>ui.mutationOpen=e.target.open);
  app.querySelector('.causes')?.addEventListener('toggle',e=>ui.causesOpen=e.target.open);
  if(phaseChanged) {
    const target=state?.phase==='build'&&ui.page==='game'?app.querySelector('.placement-status'):app.querySelector('#decision');
    if(target) { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); }
    if(matchMedia('(max-width: 760px)').matches) window.scrollTo({top:0,behavior:'instant'});
  } else {
    if(active)app.querySelector(`[data-focus="${CSS.escape(active)}"]`)?.focus({preventScroll:true});
    window.scrollTo({top:scroll,behavior:'instant'});
  }
  if(toast) {
    clearTimeout(noticeTimer);
    noticeTimer=setTimeout(()=>{ ui.notice='';app.querySelector('.toast')?.remove(); },5500);
  }
}

function transition(action,focus,after) {
  if(!state) return;
  const previous=state;
  state=act(state,action);
  if(action.type==='DEPART_FINAL'&&state.turn===previous.turn){ui.notice='Direct departure is unavailable. Contact the signal to inspect and refit.';render();announce(ui.notice);return;}
  const changed=state.phase!==previous.phase;
  ui.notice='';
  if(action.type==='CHOOSE'&&changed){
    const added=state.cargo.filter(x=>!previous.cargo.some(c=>c.uid===x.uid));
    const costs=Object.entries(state.resources).filter(([r,n])=>n!==previous.resources[r]).map(([r,n])=>`${n-previous.resources[r]>0?'+':''}${n-previous.resources[r]} ${r==='biomass'?'food':r}`);
    ui.notice=[...costs,...added.map(x=>`${nameOf(x.id)} added to cargo`)].join(' · ');
    if(state.crew>previous.crew){const life=getLifeSupport(state);ui.notice=`${state.crew-previous.crew} people connected. Life support now uses ${life.oxygen} oxygen and ${life.biomass} food each jump.`;}
  }
  if(changed) {
    ui.selected=null;ui.storedInspection=null;ui.placing=null;ui.moving=null;ui.mutationOpen=false;ui.causesOpen=false;ui.reclaimTarget=null;ui.routePreview=null;ui.finalDeparture=false;ui.confirmEvac=false;ui.bankKeys=[];
    if(state.phase==='build') {
      const acquired=state.cargo.find(i=>!previous.cargo.some(x=>x.uid===i.uid));
      const hasRoom=state.openBays.some(i=>!state.grid[i]);
      ui.placing=hasRoom?acquired?.uid||null:null;
      if(acquired&&!hasRoom)ui.notice=`${nameOf(acquired.id)} added to cargo. Reclaim a hold or refit when ready.`;
    }
  }
  snapshot=persistence.saveRun(state);
  if(snapshot.run) state=snapshot.run;
  after?.();
  if(state.turn>previous.turn) {
    const outcomeCue=state.phase==='ended'?(state.outcome==='win'?'arrival':state.outcome==='evacuation'?'evacuation':'failure'):state.lastReport?.events?.some(e=>e.type==='pressure')?'alert':state.lastReport?.events?.some(e=>e.type==='mutation')?'mutation':null;
    audio.jump(outcomeCue);ui.jumping=true;clearTimeout(jumpTimer);
    jumpTimer=setTimeout(()=>{ui.jumping=false;app.querySelector('.ship-body')?.classList.remove('jumping');},900);
  }
  render(focus,changed);
  const placed=action.type==='PLACE'&&state.grid[action.index]?.uid===action.itemId;
  const moved=action.type==='MOVE'&&previous.grid[action.from]&&state.grid[action.to]?.uid===previous.grid[action.from].uid;
  const mutated=action.type==='MUTATE'&&state.grid[action.index]?.mutation===action.branch&&previous.grid[action.index]?.mutation!==action.branch;
  if(placed||moved||mutated){
    const index=moved?action.to:action.index,bay=app.querySelector(`.bay[data-index="${index}"]`),item=state.grid[index];
    bay?.classList.add(mutated?'mutation-arrival':'graft-arrival');
    const effect=mutated?'mutation':moved?'move':CATALOG[item.id].kind==='organism'?'graft':'place';
    if(placed)audio.graft(item);else audio.cue(effect);
    const text=`${nameOf(item.id)} ${mutated?`is now ${item.mutation}`:moved?'moved':'grafted'} in bay ${index+1}. Forecast updated.`;
    announce(text);
    const feedback=document.createElement('span');feedback.className='bay-feedback';feedback.textContent=mutated?item.mutation:moved?'Moved':'Grafted';bay?.append(feedback);
    setTimeout(()=>{bay?.classList.remove('mutation-arrival','graft-arrival');feedback.remove();},900);
  }
  if(state.turn===previous.turn&&changed&&state.phase==='ended')audio.cue?.(state.outcome==='win'?'arrival':state.outcome==='evacuation'?'evacuation':'failure');

  else if(action.type==='CHOOSE'&&changed)audio.cue('confirm');
  else if(['REPAIR','BUY_REFITS','RECLAIM','PORT_EXCHANGE','TOGGLE_OPERATION','UNDO_PLAN','RESET_PLAN','BANK_GENOMES'].includes(action.type)&&!state.notice)audio.cue('tick');
  if(!placed&&!moved&&!mutated)announce(state.notice || (changed?`${state.phase==='report'?'Jump complete.':state.phase==='ended'?'Voyage ended.':state.phase==='build'?'Prepare your ship.':'Choose your next route.'}`:'Ship updated. Forecast recalculated.'));
}

function clearSelection() { ui.specimenDetailsOpen=false;ui.selected=null;ui.storedInspection=null;ui.placing=null;ui.moving=null;ui.mutationOpen=false;ui.reclaimTarget=null; }
function selectBay(index) {
  ui.storedInspection=null;
  ui.gridFocus=index;
  if(!state||ui.page!=='game') return;
  if(state.phase!=='build') {ui.selected=state.grid[index]?index:null;audio.cue('tick');render(`bay-${index}`);announce('Inspecting this room. Reconfiguration opens after the encounter.');return;}
  if(!state.openBays.includes(index)){ui.reclaimTarget=index;ui.selected=index;render(`bay-${index}`);return;}
  ui.reclaimTarget=null;
  if(ui.placing) {
    if(state.grid[index]) {
      clearSelection();ui.selected=index;audio.cue('tick');render(`bay-${index}`);
      announce(`Inspecting ${nameOf(state.grid[index].id)}. The ungrafted specimen remains in cargo.`);return;
    }
    const uid=ui.placing;
    transition({type:'PLACE',itemId:uid,index},`bay-${index}`,()=>{if(state.grid[index]?.uid===uid){ui.selected=index;ui.placing=null;}});
    return;
  }
  if(ui.moving!==null) {
    if(state.grid[index]) { announce('That bay is occupied. Choose an empty bay or cancel.'); return; }
    const from=ui.moving;
    transition({type:'MOVE',from,to:index},`bay-${index}`,()=>{if(!state.grid[from]){ui.moving=null;ui.selected=index;}});
    return;
  }
  ui.selected=state.grid[index]?index:null;ui.specimenDetailsOpen=false;ui.mutationOpen=false;audio.cue('tick');render(`bay-${index}`);
}

function gridKeydown(e) {
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
  e.preventDefault();
  const i=Number(e.target.dataset.index),row=Math.floor(i/5),col=i%5;
  const target=e.key==='ArrowLeft'?row*5+Math.max(0,col-1):e.key==='ArrowRight'?row*5+Math.min(4,col+1):e.key==='ArrowUp'?Math.max(0,i-5):e.key==='ArrowDown'?Math.min(19,i+5):e.key==='Home'?row*5:row*5+4;
  ui.gridFocus=target;
  app.querySelectorAll('.bay').forEach((b,index)=>b.tabIndex=index===target?0:-1);
  app.querySelector(`[data-index="${target}"]`)?.focus();
}

app.addEventListener('input',e=>{
 if(e.target.id==='seed'){
  ui.seed=e.target.value;
  const chart=app.querySelector('.launch-plan');
  if(chart)chart.innerHTML=flightPlan(createRun(ui.seed.trim()||'PALE-BLUE-7',{},[],{ruleset:5}));
 }
 if(e.target.name==='guide')ui.guideChoice=e.target.checked;
});
app.addEventListener('submit',e=>{
 if(e.target.id!=='start-form') return;
 e.preventDefault();const form=new FormData(e.target),previousId=state?.runId;
 snapshot=persistence.startRun(String(form.get('seed')||'').trim().slice(0,40)||'PALE-BLUE-7',ui.seedKeys,{ruleset:5});
 state=snapshot.run;
 if(!state||state.runId===previousId){ui.notice=snapshot.notice||'The voyage could not be started.';render();return;}
 clearSelection();ui.page='game';ui.confirmNew=false;ui.routePreview=null;ui.bankKeys=[];
 ui.guide=form.has('guide');ui.guideReplay=false;ui.preferences=preferences.set({guideRun:ui.guide?state.runId:null});
 audio.set(snapshot.settings.sound,ui.preferences);render(undefined,true);announce('Voyage started. Preview one of three routes.');
});

app.addEventListener('click',e=>{
 const helpTarget=e.target.closest('[data-help]');if(helpTarget){e.preventDefault();if(helpSource===helpTarget&&helpPinned)hideHelp();else showHelp(helpTarget,true);return;}
 hideHelp();
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 const a=b.dataset.action;e.preventDefault();
 if(a==='playtest'){ui.playtestOpen=true;render();return;}
 if(a==='close-playtest'){ui.playtestOpen=false;render('playtest');return;}
 if(a==='download-report'){
   try {
     const report=createPlaytestReport(snapshot,{width:innerWidth,height:innerHeight,userAgent:navigator.userAgent,language:navigator.language});
     const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
     const link=document.createElement('a');link.href=url;link.download=`arkship-${BUILD}-${(state?.seed||'welcome').replace(/[^a-z0-9_-]/gi,'-')}.json`;
     document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
     announce('Voyage report downloaded. Nothing was sent automatically.');
   } catch(error) {announce(error.message);}
   return;
 }
 if(a==='sound'){snapshot=persistence.saveSettings({sound:!snapshot.settings.sound});audio.set(snapshot.settings.sound,ui.preferences);render('sound');return;}
 if(a==='sound-settings'){ui.soundOpen=!ui.soundOpen;render('sound-settings');return;}
 if(a==='music'||a==='effects'){ui.preferences=preferences.set({[a]:!ui.preferences[a]});audio.set(snapshot.settings.sound,ui.preferences);render(a);return;}
 if(a==='guide'){if(ui.page==='welcome'){ui.guideChoice=true;render();app.querySelector('.guide-choice')?.scrollIntoView({block:'center'});}else{ui.guide=true;ui.guideReplay=true;ui.preferences=preferences.set({guideRun:state.runId});render();app.querySelector('.coach')?.scrollIntoView({block:'center',behavior:'instant'});}return;}
 if(a==='guide-skip'||a==='guide-done'){ui.guide=false;ui.guideChoice=false;ui.preferences=preferences.set({guideDone:true,guideRun:null});render();return;}
 if(a==='guide-target'){
   const step=guideStep(state,ui);
   if(step?.cargo)app.querySelector(`[data-action="cargo"][data-uid="${step.cargo}"]`)?.click();
   const target=app.querySelector(guideStep(state,ui)?.target||'.coach');
   if(target){target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center',behavior:'instant'});target.focus({preventScroll:true});}
   return;
 }
 if(a==='archive'){audio.cue('tick');ui.page='archive';clearSelection();render(undefined,true);return;}
 if(a==='back'||a==='home'){audio.cue('tick');ui.page=state?'game':'welcome';ui.confirmNew=false;render(undefined,true);return;}
 if(a==='new'){if(state?.banking?.status==='pending')return;ui.seedKeys=[];ui.page='welcome';clearSelection();render(undefined,true);return;}
 if(a==='restart'){ui.confirmNew=true;render('restart');return;}
 if(a==='cancel-new'){ui.confirmNew=false;render('restart');return;}
 if(a==='confirm-new'){ui.confirmNew=false;ui.page='welcome';clearSelection();render(undefined,true);return;}
 if(a==='route'){if(ui.routePreview!==b.dataset.route)ui.finalDeparture=false;ui.routePreview=b.dataset.route;audio.cue('tick');render(`route-${b.dataset.route}`);announce('Route preview updated for this ship.');return;}
 if(a==='preview-final'){ui.finalDeparture=!ui.finalDeparture;audio.cue('tick');render('preview-final');announce(ui.finalDeparture?'Forecast includes refusing the specimen and the final jump.':'Contact forecast restored.');return;}
 if(a==='depart-final'){if(ui.guide)return;return transition({type:'DEPART_FINAL',routeId:b.dataset.route});}
 if(a==='take-route'){audio.cue('confirm');return transition({type:'SELECT_ROUTE',routeId:b.dataset.route});}
 if(a==='seed-choice'||a==='bank-choice'){const key=b.dataset.key,field=a==='seed-choice'?'seedKeys':'bankKeys',limit=a==='seed-choice'?2:state.banking.limit;ui[field]=ui[field].includes(key)?ui[field].filter(x=>x!==key):ui[field].length<limit?[...ui[field],key]:ui[field];render();return;}
 if(a==='bank')return transition({type:'BANK_GENOMES',keys:ui.bankKeys});
 if(a==='choice')return transition({type:'CHOOSE',choiceId:b.dataset.choice});
 if(a==='cargo'){clearSelection();ui.placing=b.dataset.uid;render(`cargo-${b.dataset.uid}`);audio.cue('tick');return;}
 if(a==='show-bays'){app.querySelector('.ship-grid')?.scrollIntoView({block:'center',behavior:'instant'});return;}
 if(a==='show-room'){const target=app.querySelector(`.bay[data-index="${ui.selected}"]`)||app.querySelector('.ship-grid');target?.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});return;}
 if(a==='show-forecast'){const target=app.querySelector('.forecast');target?.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});return;}
 if(a==='bay')return selectBay(Number(b.dataset.index));
 if(a==='cancel'){
   if(ui.moving!==null&&state.grid[ui.moving]){
     const index=ui.moving;
     ui.moving=null;ui.placing=null;ui.reclaimTarget=null;ui.selected=index;ui.gridFocus=index;
     render(`bay-${index}`);announce('Move cancelled. The room remains selected.');
   }else{clearSelection();render(`bay-${ui.gridFocus}`);announce('Placement cancelled.');}
   return;
 }
 if(a==='move'){audio.cue('tick');ui.moving=ui.selected;ui.placing=null;render(`bay-${ui.selected}`);return;}
 if(a==='store'){
   const i=ui.selected,inspection={uid:state.grid[i]?.uid,mutationOpen:ui.mutationOpen,detailsOpen:ui.specimenDetailsOpen};
   return transition({type:'REMOVE',index:i},`bay-${i}`,()=>{
     if(inspection.uid&&!state.grid[i]&&state.cargo.some(item=>item.uid===inspection.uid)){
       clearSelection();ui.storedInspection=inspection;
     }
   });
 }
 if(a==='discard'){const uid=ui.placing;transition({type:'DISCARD',itemId:uid},undefined,()=>{if(!state.cargo.some(x=>x.uid===uid))clearSelection();});return;}
 if(a==='show-mutation'){audio.cue('tick');ui.mutationOpen=true;render();app.querySelector('.mutation-options')?.scrollIntoView({behavior:'instant',block:'center'});app.querySelector('.mutation-options summary')?.focus({preventScroll:true});return;}
 if(a==='inspect'){ui.specimenDetailsOpen=true;render();app.querySelector('.inspector')?.scrollIntoView({behavior:'instant',block:'center'});return;}
 if(a==='mutate')return transition({type:'MUTATE',index:ui.selected,branch:b.dataset.branch},`bay-${ui.selected}`);
 if(a==='reclaim'){const index=ui.reclaimTarget;transition({type:'RECLAIM',index},`bay-${index}`,()=>{if(state.openBays.includes(index))ui.reclaimTarget=null;});return;}
 if(a==='undo'||a==='reset'){
   const selected=state.grid[ui.selected],stored=ui.storedInspection;
   const inspection=selected?{uid:selected.uid,mutationOpen:ui.mutationOpen,detailsOpen:ui.specimenDetailsOpen}:stored;
   return transition({type:a==='undo'?'UNDO_PLAN':'RESET_PLAN'},undefined,()=>{
     clearSelection();
     const index=inspection?.uid?state.grid.findIndex(item=>item?.uid===inspection.uid):-1;
     if(index>=0){ui.selected=index;ui.gridFocus=index;ui.mutationOpen=inspection.mutationOpen;ui.specimenDetailsOpen=inspection.detailsOpen;}
     else if(a==='undo'&&stored&&state.cargo.some(item=>item.uid===stored.uid))ui.storedInspection=stored;
   });
 }
 if(a==='buy-refits')return transition({type:'BUY_REFITS'},'buy-refits');
 if(a==='evacuate'){ui.confirmEvac=true;render();return;}
 if(a==='cancel-evac'){ui.confirmEvac=false;render('evacuate');return;}
 if(a==='confirm-evac'){ui.confirmEvac=false;return transition({type:'EVACUATE'});}
 if(a==='operation')return transition({type:'TOGGLE_OPERATION',index:ui.selected},'operation');
 if(a==='port-exchange')return transition({type:'PORT_EXCHANGE',exchange:b.dataset.exchange||null},b.dataset.focus);
 if(a==='repair')return transition({type:'REPAIR'},'repair');
 if(a==='depart')return transition({type:'DEPART'});
 if(a==='continue'){audio.cue('tick');return transition({type:'CONTINUE'});}
});

app.addEventListener('dragstart',e=>{const cargo=e.target.closest('[data-uid]');if(!cargo)return;clearSelection();ui.placing=cargo.dataset.uid;e.dataTransfer.setData('text/plain',cargo.dataset.uid);e.dataTransfer.effectAllowed='move';app.querySelectorAll('.bay.empty').forEach(b=>b.classList.add('place-target'));});
app.addEventListener('dragover',e=>{if(e.target.closest('.bay.empty')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
app.addEventListener('drop',e=>{const bay=e.target.closest('.bay');if(!bay)return;e.preventDefault();selectBay(Number(bay.dataset.index));});
app.addEventListener('pointerover',e=>{if(e.pointerType==='touch'||helpPinned)return;const target=e.target.closest('[data-help],[data-help-bay]');if(target&&target!==helpSource)showHelp(target);});
app.addEventListener('pointerout',e=>{if(!helpPinned&&helpSource&&!helpSource.contains(e.relatedTarget))hideHelp();});
app.addEventListener('focusin',e=>{const target=e.target.closest('[data-help]');if(target)showHelp(target);});
app.addEventListener('focusout',()=>{if(!helpPinned)hideHelp();});
app.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-help]:not(button)')){e.preventDefault();showHelp(e.target,true);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(ui.playtestOpen){e.preventDefault();ui.playtestOpen=false;render('playtest');return;}if(!help.hidden){hideHelp();return;}if(ui.soundOpen){ui.soundOpen=false;render('sound-settings');return;}if(ui.page==='archive'){ui.page=state?'game':'welcome';render('archive',true);}else if(ui.confirmEvac){ui.confirmEvac=false;render('evacuate');}else if(ui.confirmNew){ui.confirmNew=false;render('restart');}else{clearSelection();render(`bay-${ui.gridFocus}`);announce('Selection cleared.');}}});
window.addEventListener('scroll',hideHelp,{passive:true});
document.addEventListener('visibilitychange',()=>document.hidden?audio.pause():audio.resume());
// A saved opt-in may initially meet the browser's autoplay block. Retry loops
// on the next real input; missed effects are never replayed.
document.addEventListener('pointerdown',()=>{if(!document.hidden)audio.resume();},{passive:true});
document.addEventListener('keydown',()=>{if(!document.hidden)audio.resume();});
render();
