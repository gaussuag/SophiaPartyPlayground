import { describe, expect, it } from "vitest";
import { createEvent, decide, finaleOutcome, project, roundStartStatus, verifySnapshot, type EventState } from "../../src/modules/competition";
import { arrange, step } from "../fixtures/event";
import { finishedCup } from "../fixtures/finished-cup";

const decision=(s:EventState,roundId=s.activeRoundId!)=>decide(s,{type:"StartRound",roundId},{now:s.updatedAt,actorId:"manager",commandId:"batch-confirm"});
describe("one confirmation for a real round",()=>{
 it("refuses incomplete rounds without changing any phase, revision or lineup",()=>{
  let s=step(createEvent("local-round-start","2026-10-31T00:00:00Z"),{type:"OpenFirstRound"});s=arrange(s,s.matches[0].id);const before=JSON.stringify(s);
  expect(roundStartStatus(project(s))).toMatchObject({ready:1,canStart:false});expect(decision(s)).toMatchObject({ok:false,error:{code:"INCOMPLETE_LINEUP"}});expect(JSON.stringify(s)).toBe(before);
 });
 it("confirms three unique lineups at one revision and one audit entry",()=>{
  let s=step(createEvent("local-round-three","2026-10-31T00:00:00Z"),{type:"OpenFirstRound"});for(const m of s.matches.slice(0,3))s=arrange(s,m.id);
  expect(roundStartStatus(project(s)).canStart).toBe(true);const next=decision(s);if(!next.ok)throw new Error(next.error.code);
  expect(next.state.revision).toBe(s.revision+1);expect(next.state.lineups).toHaveLength(3);expect(new Set(next.state.lineups.map(l=>l.id)).size).toBe(3);expect(next.state.audit).toHaveLength(s.audit.length+1);
  expect(next.state.matches.slice(0,3).every(m=>m.phase==="PLAYING")).toBe(true);expect(verifySnapshot(next.state)).toBeNull();expect(decision(next.state)).toMatchObject({ok:false,error:{code:"NO_PENDING_MATCHES"}});
 });
 it("preserves already-started compatibility matches and validates all remaining seats",()=>{
  let s=step(createEvent("local-round-remaining","2026-10-31T00:00:00Z"),{type:"OpenFirstRound"});for(const m of s.matches.slice(0,3))s=arrange(s,m.id);
  s=step(s,{type:"StartMatch",matchId:s.matches[0].id});const first=s.lineups[0];const next=decision(s);if(!next.ok)throw new Error(next.error.code);
  expect(next.state.lineups[0]).toEqual(first);expect(next.state.lineups).toHaveLength(3);expect(decision(s,"R02")).toMatchObject({ok:false,error:{code:"NOT_CURRENT_ROUND"}});
 });
 it.each([1,2] as const)("finishes all seven v%s rounds through batch starts without an eighth match round",v=>{
  const s=finishedCup(v);expect(s.rounds).toHaveLength(7);expect(s.matches).toHaveLength(v===2?21:20);expect(s.lineups).toHaveLength(s.matches.length);expect(s.audit.filter(a=>a.type==="StartRound")).toHaveLength(7);expect(verifySnapshot(s)).toBeNull();expect(finaleOutcome(s).unlocked).toBe(true);
  expect(finaleOutcome(s).winner).toBe(v===2?"WHITE":null);
 });
 it("requires the final round to be explicitly closed and derives corrections without tie breakers",()=>{
  let s=finishedCup();const last=structuredClone(s);last.rounds[6].phase="OPEN";last.activeRoundId="R07";expect(finaleOutcome(last).unlocked).toBe(false);
  let changed=0;const total=finaleOutcome(s).totals.WHITE;
  for(const m of s.matches){const result=s.results.find(r=>r.id===m.activeResultRevisionId)!,weight=s.lineups.find(l=>l.id===result.lineupRevisionId)!.participants.some(p=>p.playerId==="B01")?2:1;if(changed+weight>total/2)continue;
   s=step(s,{type:"CorrectResult",matchId:m.id,lineupRevisionId:result.lineupRevisionId,resultRevisionId:result.id,whiteScore:11,blackScore:15,reason:"SCORE_ENTRY_ERROR"});changed+=weight;if(changed===total/2)break;
  }
  expect(finaleOutcome(s)).toMatchObject({unlocked:true,winner:null,totals:{WHITE:total/2,BLACK:total/2}});
 });
});
