import { createEvent } from "../../src/modules/competition";
import { arrange, step } from "./event";
export function finishedCup(version:1|2=2) {
 let s=step(createEvent("local-finale-tests","2026-10-31T00:00:00Z",version),{type:"OpenFirstRound"});
 for(let round=1;round<=7;round++){
  for(const m of s.matches.filter(m=>m.roundId===s.activeRoundId))s=arrange(s,m.id);
  s=step(s,{type:"StartRound",roundId:s.activeRoundId!});
  for(const m of s.matches.filter(m=>m.roundId===s.activeRoundId))s=step(s,{type:"SubmitResult",matchId:m.id,lineupRevisionId:m.activeLineupRevisionId!,whiteScore:15,blackScore:11});
  s=step(s,{type:"AdvanceRound",roundId:s.activeRoundId!});
 }return s;
}
