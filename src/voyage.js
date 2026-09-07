export const INTRO_VOYAGE='PALE-BLUE-7';
export const VOYAGE_RULESET=5;

export function normaliseVoyageCode(value) {
  const code=typeof value==='string'?value.trim():'';
  return code&&code.length<=40?code:null;
}

export function freshVoyageCode(entropy=globalThis.crypto) {
  const words=new Uint32Array(2);
  if(entropy?.getRandomValues)entropy.getRandomValues(words);
  else for(let i=0;i<words.length;i++)words[i]=Math.floor(Math.random()*0x100000000);
  return `ARK-${[...words].map(n=>n.toString(36).toUpperCase().padStart(7,'0')).join('-')}`;
}

export function voyageLink(href,code,build,ruleset=VOYAGE_RULESET) {
  const valid=normaliseVoyageCode(code);
  if(!valid)throw new Error('Enter a voyage code of 1–40 characters first.');
  const url=new URL(href);
  url.search='';
  url.hash=new URLSearchParams({voyage:valid,rules:String(ruleset),build}).toString();
  return url.href;
}

export function readVoyageLink(href,build) {
  const params=new URLSearchParams(new URL(href).hash.slice(1));
  if(!params.has('voyage'))return {code:null,notice:''};
  const code=normaliseVoyageCode(params.get('voyage'));
  if(!code)return {code:null,notice:'That shared voyage code is invalid. Enter a code of 1–40 characters or make a fresh one.'};
  if(params.get('rules')!==String(VOYAGE_RULESET))return {code:null,notice:'That link uses unsupported voyage rules. Choose a fresh code for this version.'};
  return {code,notice:params.get('build')!==build?'This link is from a different build. Its opportunities may have changed.':''};
}
