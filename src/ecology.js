import { getSymbioticNeighbours } from './engine.js';
import { esc } from './icons.js';

// Reports retain operation-time activity and the branch before end-of-jump
// mutations. Post-jump room artwork alone cannot establish a working link.
export function getVisualLinks(evidence) {
  const reports=evidence?.cellReports;
  if(!reports)return [];
  const links=[],seen=new Set();
  function add(source,target,kind,text) {
    const a=Math.min(source,target),b=Math.max(source,target);
    const key=['synergy','danger'].includes(kind)?`${kind}:${a}:${b}`:`${kind}:${source}:${target}`;
    if(seen.has(key))return;
    seen.add(key);links.push({a,b,kind,source,target,text});
  }
  reports.forEach((report,index)=>{
    for(const target of report?.localTargets||[]){
      // A new child's reciprocal entry is provenance, not outgoing growth.
      if(target.kind==='growth'&&report.trajectory?.grewThisJump)continue;
      add(index,target.index,target.kind,target.text);
    }
  });
  const operating=reports.map(report=>report?.uid?{
    id:report.id,uid:report.uid,active:report.status==='active',
    mutation:report.trajectory?.mutation?.before,
  }:null);
  operating.forEach((item,index)=>{
    if(!item?.active||item.mutation!=='symbiotic')return;
    for(const near of getSymbioticNeighbours(operating,index)) {
      add(near,index,'symbiosis',`Bay ${near+1} supports the Symbiotic ${reports[index].name} in bay ${index+1}. One bonus is enabled; extra neighbours do not stack.`);
    }
  });
  return links;
}

export function ecologyOverlay(links,selected) {
  if(!links.length)return '';
  const edges=new Map();
  for(const link of links){const key=`${link.a}:${link.b}`;if(!edges.has(key))edges.set(key,[]);edges.get(key).push(link);}
  const connections=[...edges.values()].map(records=>{
    const {a,b}=records[0],horizontal=b-a===1;
    const x=((a%5+b%5)/2+.5)*100,y=((Math.floor(a/5)+Math.floor(b/5))/2+.5)*100;
    const kinds=[...new Set(records.map(r=>r.kind))];
    const focused=selected===a||selected===b;
    return `<g class="ecology-edge ${focused?'focused':''} ${Number.isInteger(selected)&&!focused?'subdued':''}" data-edge="${a}:${b}" transform="translate(${x} ${y}) rotate(${horizontal?0:90})">${kinds.map((kind,i)=>{
      const matching=records.filter(r=>r.kind===kind),offset=(i-(kinds.length-1)/2)*11;
      const detail=matching.map(r=>r.text).join(' ');
      const visual=['synergy','symbiosis'].includes(kind)
        ? `<image href="assets/ecology-v6/${kind}.webp" x="-32" y="-11" width="64" height="22" preserveAspectRatio="xMidYMid meet"/>`
        : `<path class="influence-track" d="M-25 0 H25"/>${kind==='danger'?'<path d="M-5 -5 L0 0 L-5 5 M5 -5 L0 0 L5 5"/>':matching.map(r=>`<path class="influence-arrow" d="${r.source===a?'M5 -4 L12 0 L5 4':'M-5 -4 L-12 0 L-5 4'}"/>`).join('')}`;
      return `<g class="ecology-link ${kind}" data-link-kind="${kind}" data-sources="${matching.map(r=>`${r.source}>${r.target}`).join(',')}" transform="translate(0 ${offset})"><title>${esc(detail)}</title>${visual}</g>`;
    }).join('')}</g>`;
  }).join('');
  return `<svg class="ecology-overlay" viewBox="0 0 500 400" preserveAspectRatio="none" aria-hidden="true">${connections}</svg>`;
}

export function ecologyNote(links,selected) {
  const support=links.filter(link=>link.kind==='symbiosis'&&(link.source===selected||link.target===selected));
  if(!support.length)return '';
  const recipients=[...new Set(support.map(link=>link.target+1))];
  return `<p class="ecology-note"><span class="symbiosis-key">Symbiotic support</span> ${recipients.map(index=>`Bay ${index}`).join(', ')}: one bonus enabled by neighbouring life. Extra supporters do not stack.</p>`;
}
