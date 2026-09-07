import { validEnvelope } from './persistence.js';
import { esc } from './icons.js';

export const BUILD='0.7.2-playtest.1';

export function createPlaytestReport(snapshot,context={}) {
  const save={version:2,run:snapshot.run,archive:snapshot.archive,settings:snapshot.settings};
  if(!validEnvelope(save))throw new Error('A valid voyage and archive are required for this report.');
  const dimension=n=>Number.isFinite(n)?Math.max(0,Math.min(20000,Math.round(n))):0;
  return JSON.parse(JSON.stringify({
    format:'arkship-playtest-v1',build:BUILD,voyage:save.run?.seed??null,
    browser:{width:dimension(context.width),height:dimension(context.height),userAgent:String(context.userAgent||'').slice(0,500),language:String(context.language||'').slice(0,40)},
    save,
  }));
}

export function playtestControls(state,open,options={}) {
  const note=`ARKSHIP ${BUILD}\nVoyage: ${state?.seed||'Not started'} · Jump: ${state?.turn??0}\n\nI was trying to…\nI expected…\nWhat happened was…\nThe most interesting choice was…`;
  return `<div class="playtest-bar"><span>PLAYTEST / ${BUILD}</span>${state?'<button type="button" class="text-button" data-action="copy-voyage" data-focus="copy-voyage">Copy voyage link</button>':''}<button type="button" class="text-button" data-action="playtest" data-focus="playtest">Playtest feedback</button><nav class="support-links" aria-label="Support and privacy"><a href="support.html">Help &amp; support</a><a href="privacy.html">Privacy</a></nav></div>${open?`<dialog class="playtest-dialog" aria-labelledby="playtest-title"><div class="playtest-heading"><h2 id="playtest-title">Help shape the next voyage.</h2><button type="button" class="secondary" data-action="close-playtest" aria-label="Close playtest feedback">Close</button></div>${options.shareLink?`<label for="share-voyage-link">Copy this voyage link</label><input id="share-voyage-link" type="text" readonly value="${esc(options.shareLink)}"><p>This shares the voyage code. It does not send your save or inherited genomes.</p>`:''}<label class="analytics-choice"><input type="checkbox" name="analytics" aria-label="Share anonymous playtest stats" ${options.analytics?'checked':''}> Share anonymous playtest stats <small>Optional · Plausible counts visits, jumps, routes and endings. No save uploads, typed codes or screen recordings. Turn this off at any time.</small></label><p>Send a note to the person who shared ARKSHIP with you. Copy this outline and add anything that surprised or confused you.</p><label for="feedback-note">Your feedback outline</label><textarea id="feedback-note" rows="8" readonly>${esc(note)}</textarea><p>A voyage report includes your current ship, choices, genome archive, build version and browser details. Download it to attach to your note. The report is not uploaded by the game.</p><button type="button" class="primary" data-action="download-report">Download voyage report</button></dialog>`:''}`;
}
