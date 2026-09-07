import { CATALOG } from './content.js';
import { getItemStats, getBankOptions } from './engine.js';
import { esc, icon, signed } from './icons.js';
import { roomArt } from './art.js';

const names={power:'power',oxygen:'oxygen',biomass:'food',heat:'heat',hull:'hull'};
export function genomeName(genome){return `${genome.mutation&&genome.mutation!=='base'?genome.mutation+' ':''}${CATALOG[genome.id]?.name||genome.name||genome.id}`;}
function genomeEffect(genome,ruleset=5){
 const specimen={id:genome.id,mutation:genome.mutation==='base'?null:genome.mutation};
 const stats=getItemStats(specimen,{ruleset});
 const inputs=Object.entries(stats.input||{}).filter(([,v])=>v).map(([k,v])=>`${v} ${names[k]}`).join(', ')||'no input';
 const outputs=Object.entries(stats.output||{}).filter(([,v])=>v).map(([k,v])=>`${signed(v)} ${names[k]}`).join(', ');
 const main=values=>values.mainOutput==='defence'?`blocks ${values.defence} debris damage`:`${signed(values.output[values.mainOutput])} ${names[values.mainOutput]}`;
 const conditions=[];
 if(specimen.mutation==='symbiotic')conditions.push(`Beside another active species: ${main(getItemStats(specimen,{ruleset,symbioticActive:true}))}.`);
 if(specimen.id==='radiovore'){
  const solar=getItemStats(specimen,{ruleset,hazard:'solar'});
  conditions.push(`Solar flare: ${main(solar)}${specimen.mutation==='symbiotic'?` alone, ${main(getItemStats(specimen,{ruleset,hazard:'solar',symbioticActive:true}))} beside another species`:''}.`);
 }
 if(specimen.id==='echo-polyp')conditions.push('Amplifies a neighbouring Void Lung; seed both for an early oxygen partnership.');
 return `${inputs} → ${outputs}${stats.defence?`${outputs?', ':''}blocks ${stats.defence} debris damage`:''} per jump${specimen.mutation==='symbiotic'?' in isolation':''}.${conditions.length?' '+conditions.join(' '):''}`;
}
function genomeCard(g,selected,action,disabled=false){return `<button type="button" class="genome-option ${selected?'selected':''}" data-action="${action}" data-key="${esc(g.key)}" aria-pressed="${selected}" ${disabled?'disabled':''}>${roomArt(g)}<span><strong>${esc(genomeName(g))}</strong><small>${esc(genomeEffect(g))}</small><span class="genome-price">3 food to grow · 1 open bay</span></span><i>${icon(selected?'check':'plus')}</i></button>`;}
export function seedChooser(archive,ui){
 const genomes=archive.genomes||[],selected=ui.seedKeys||[];
 if(!genomes.length)return '';
 return `<details class="seed-chooser" ${selected.length?'open':''}><summary>Choose inherited seeds <span>${selected.length}/2</span></summary><p>${selected.length?'Selected seeds replace the free Void Lung. Their food cost is paid when grown.':'No selection: start with a free Void Lung. Choose up to two banked strains for a different opening.'}</p><div class="genome-options">${genomes.map(g=>genomeCard(g,selected.includes(g.key),'seed-choice',selected.length>=2&&!selected.includes(g.key))).join('')}</div></details>`;
}
export function bankingPanel(state,ui){
 const bank=state.banking;
 if(bank?.status!=='pending')return `<p class="retained-note">${icon('archive')}${state.outcome==='loss'?'Observations retained. Unbanked strains lost. Your existing genome bank is safe.':`Lineage saved. ${bank?.receipt?.selectedKeys?.length||0} strains banked for successor voyages.`}</p>`;
 const selected=ui.bankKeys||[],options=getBankOptions(state);
 return `<section class="banking-panel"><span class="eyebrow mint">CHOOSE WHAT LIVES ON</span><h3>Bank up to ${bank.limit} ${bank.limit===1?'strain':'strains'}.</h3><p>${options.length?'Bank retained strains for the next voyage. Rates below describe their next launch; unchosen strains remain observations.':'No retained strain qualifies for banking. Your observations still remain.'}</p><div class="genome-options">${options.map(g=>genomeCard(g,selected.includes(g.key),'bank-choice',selected.length>=bank.limit&&!selected.includes(g.key))).join('')}</div><button type="button" class="primary" data-action="bank" data-focus="bank">${selected.length?`Bank ${selected.length} ${selected.length===1?'strain':'strains'}`:'Continue without banking'} ${icon('arrow')}</button></section>`;
}
export function genomeBank(archive){
 const genomes=archive.genomes||[];
 return `<section class="bank-section"><div class="section-label"><span>BANKED GENOMES</span><span>${genomes.length} AVAILABLE AT LAUNCH</span></div><p class="field-note">Operating rates shown for a fresh voyage.</p>${genomes.length?`<div class="banked-genomes">${genomes.map(g=>`<article class="banked-genome">${roomArt(g)}<div><h3>${esc(genomeName(g))}</h3><p>${esc(genomeEffect(g))}</p><small>Choose at launch · 3 food and one bay to grow</small></div></article>`).join('')}</div>`:'<p class="archive-empty">Reach Eos Refuge to bank two strains, or evacuate at system 7 to rescue one. Observing a species alone does not unlock a seed.</p>'}</section>`;
}
export function blueprintGallery(archive){
 if(!archive.blueprints?.length)return '';
 return `<section class="blueprint-section"><div class="section-label"><span>ARRIVAL BLUEPRINTS</span><span>LAYOUT REFERENCES</span></div><div class="blueprint-gallery">${[...archive.blueprints].reverse().map(b=>`<article class="blueprint"><div class="blueprint-grid" aria-label="Saved arrival layout for ${esc(b.seed)}">${b.grid.map((cell,i)=>`<span class="${b.openBays.includes(i)?'':'sealed'}" title="${esc(cell?CATALOG[cell.id]?.name||cell.id:'Empty bay')}">${roomArt(cell,{alt:cell?CATALOG[cell.id]?.name||cell.id:'Empty bay'})}${cell?.mutation?icon('mutation'):''}</span>`).join('')}</div><h3>${esc(b.seed)}</h3><p>Arrived at Eos Refuge · ${b.openBays.length} open bays</p></article>`).join('')}</div></section>`;
}
