// Presentation only. Audio follows committed state and never gates a game action.
export function musicState(state) {
  if(state?.outcome==='loss')return 'silent';
  if(['win','evacuation'].includes(state?.outcome))return 'refuge';
  if(!state)return 'discovery';
  const r=state.resources;
  if(r.hull<=10||state.crew<=3||r.oxygen<=4||r.biomass<=3||r.heat>=18)return 'danger';
  const grid=state.plan?.baseline?.grid||state.grid;
  const living=grid.filter(x=>x&&!['reactor','engine','crew','storage','hydroponics','radiator','scrubber'].includes(x.id)&&!x.paused);
  return living.length>=4||living.filter(x=>x.mutation).length>=2?'living':'discovery';
}

export function createAudio(AudioCtor=globalThis.Audio) {
  const make=(path,volume,loop=false)=>{
    const track=new AudioCtor(path);track.volume=volume;track.loop=loop;track.preload='none';return track;
  };
  const beds={
    discovery:make('assets/audio-v8/music-loop.mp3',.27,true),
    living:make('assets/audio-v8/living-loop.mp3',0,true),
    danger:make('assets/audio-v8/danger-loop.mp3',0,true),
    refuge:make('assets/audio-v8/refuge-loop.mp3',0,true),
  };
  const ambience=make('assets/ambience.mp3',.09,true);
  const cues={
    jump:make('assets/jump.mp3',.38),
    graft:make('assets/audio-v3/place-organic.mp3',.44),
    'graft-air':make('assets/audio-v4/graft-air.mp3',.36),
    'graft-energy':make('assets/audio-v4/graft-energy.mp3',.34),
    'graft-metabolic':make('assets/audio-v4/graft-metabolic.mp3',.38),
    tick:make('assets/audio-v4/select-tick.mp3',.23),
    place:make('assets/audio-v3/place-mechanical.mp3',.54),
    confirm:make('assets/audio-v3/confirm.mp3',.5),
    mutation:make('assets/audio-v3/mutation.mp3',.42),
    alert:make('assets/audio-v3/alert.mp3',.3),
    arrival:make('assets/audio-v3/arrival.mp3',.5),
    failure:make('assets/audio-v3/failure.mp3',.52),
  };
  let enabled=false,suspended=globalThis.document?.hidden||false,preferences={music:true,effects:true};
  let mood='discovery',ducked=false,duckTimer,fadeTimer,outcomeTimer,runId=null;
  const playing=new Set(),lastPlayed=new Map();
  const play=track=>{try{const pending=track.play();pending?.catch?.(()=>{});}catch{}};
  const stop=track=>{track.pause();playing.delete(track);};
  const musicAllowed=()=>enabled&&preferences.music&&!suspended&&mood!=='silent';
  const bedLevel=()=>ducked?.1:mood==='danger'?.23:mood==='refuge'?.29:.27;
  for(const track of Object.values(cues))track.addEventListener('ended',()=>playing.delete(track));
  function syncMusic(fade=false){
    clearTimeout(fadeTimer);
    if(!musicAllowed()){
      for(const track of Object.values(beds))track.pause();
      ambience.pause();return;
    }
    play(ambience);
    const target=beds[mood];play(target);
    if(!fade){
      for(const [key,track] of Object.entries(beds)){track.volume=key===mood?bedLevel():0;if(key!==mood)track.pause();}
      return;
    }
    const starts=Object.fromEntries(Object.entries(beds).map(([key,track])=>[key,track.volume]));
    let frame=0;
    const step=()=>{
      if(!musicAllowed())return;
      const amount=++frame/24;
      for(const [key,track] of Object.entries(beds)){
        track.volume=starts[key]+((key===mood?bedLevel():0)-starts[key])*amount;
        if(frame===24&&key!==mood)track.pause();
      }
      if(frame<24)fadeTimer=setTimeout(step,50);
    };
    step();
  }
  const clearOutcome=()=>{clearTimeout(outcomeTimer);outcomeTimer=null;};
  function sync(){
    syncMusic();
    if(!enabled||!preferences.effects||suspended){clearOutcome();for(const track of Object.values(cues))stop(track);}
  }
  function cue(name){
    if(!enabled||!preferences.effects||suspended)return;
    const key={select:'confirm',move:'place',evacuation:'arrival'}[name]||name;
    const track=cues[key];if(!track)return;
    const now=performance.now();if(now-(lastPlayed.get(key)??-Infinity)<120)return;
    lastPlayed.set(key,now);
    if(playing.size>=3&&!playing.has(track))stop(playing.values().next().value);
    track.currentTime=0;playing.add(track);play(track);
    if(['jump','mutation','failure','arrival'].includes(key)){
      clearTimeout(duckTimer);ducked=true;
      if(beds[mood])beds[mood].volume=.1;
      duckTimer=setTimeout(()=>{ducked=false;syncMusic(true);},key==='jump'?1400:2500);
    }
  }
  return {
    set(value,settings=preferences){enabled=!!value;preferences={music:settings.music!==false,effects:settings.effects!==false};sync();},
    scene(state){
      if(runId!==state?.runId){clearOutcome();runId=state?.runId;}
      const next=musicState(state);if(next===mood)return;
      mood=next;syncMusic(true);
    },
    cue,
    graft(specimen){
      const id=specimen?.id;
      cue(['void-lung','frost-lichen','echo-polyp','shield-fern'].includes(id)?'graft-air':['radiovore','sun-coral','cinder-bloom'].includes(id)?'graft-energy':['grave-moss','bloom-stomach','hull-leech'].includes(id)?'graft-metabolic':'place');
    },
    jump(outcome){
      clearOutcome();cue('jump');
      if(outcome&&enabled&&preferences.effects&&!suspended)outcomeTimer=setTimeout(()=>{stop(cues.jump);cue(outcome);outcomeTimer=null;},900);
    },
    pause(){suspended=true;clearOutcome();clearTimeout(duckTimer);ducked=false;for(const track of Object.values(beds))track.volume=track===beds[mood]?bedLevel():0;sync();},
    resume(){const wasSuspended=suspended;suspended=false;if(wasSuspended)sync();else if(musicAllowed()){if(beds[mood].paused)play(beds[mood]);if(ambience.paused)play(ambience);}},
  };
}
