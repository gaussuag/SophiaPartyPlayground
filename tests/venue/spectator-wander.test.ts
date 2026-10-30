import { describe, expect, it } from "vitest";
import { createEvent, project } from "../../src/modules/competition";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { playerPlacement, worldLayout } from "../../src/modules/venue/world";
import { arrange, step } from "../fixtures/event";
const layout=worldLayout(390,844);
function setup(seed=71){let state=step(createEvent("local-roaming","2026-10-31T00:00:00Z"),{type:"OpenFirstRound"});state=arrange(state,state.matches[0].id);state=step(state,{type:"StartMatch",matchId:state.matches[0].id});const c=new LocalChoreography(seed);c.sync(state,project(state),layout);c.configure(true,false);return{state,c,bench:state.players.filter(p=>!playerPlacement(state,project(state),p.id,layout).onCourt).map(p=>p.id)};}
const run=(c:LocalChoreography,seconds:number)=>{for(let i=0;i<seconds*60;i++)c.step(1/60);};
const point=(c:LocalChoreography,id:string)=>{const p=c.pose(id)!;return p.base.map((v,i)=>v+p.offset[i]);};
describe("unselected spectators roam and stop in end walkways",()=>{
 it("uses the actual off-court roster, travels beyond home positions and never enters a court",()=>{
  const {state,c,bench}=setup(),before=JSON.stringify(state),actions=new Set<string>(),travel=new Map(bench.map(id=>[id,0]));let minimum=Infinity;
  for(let frame=0;frame<10800;frame++){
   c.step(1/60);
   for(const id of bench){const p=c.pose(id)!,at=point(c,id);actions.add(p.action);travel.set(id,Math.max(travel.get(id)!,Math.hypot(p.offset[0],p.offset[2])));expect(Math.abs(at[0])).toBeLessThanOrEqual(13.5);expect(Math.abs(at[2])).toBeGreaterThanOrEqual(7.6-1e-8);expect(Math.abs(at[2])).toBeLessThanOrEqual(10.2+1e-8);}
   if(frame%15===0)for(let i=0;i<bench.length;i++)for(let j=i+1;j<bench.length;j++){const a=point(c,bench[i]),b=point(c,bench[j]);minimum=Math.min(minimum,Math.hypot(a[0]-b[0],a[2]-b[2]));}
  }
  expect(actions).toEqual(new Set(["rest","walk","stretch","paddle","watch"]));expect([...travel.values()].filter(n=>n>2).length).toBeGreaterThanOrEqual(bench.length-1);expect(minimum).toBeGreaterThan(1.8);
  expect(c.balls).toHaveLength(1);expect(JSON.stringify(state)).toBe(before);
 });
 it("freezes a roaming target through touch, click grace and selection, and pauses without advancing time",()=>{
  const {c,bench}=setup();run(c,10);const id=bench.find(id=>c.pose(id)!.walking)!;expect(id).toBeTruthy();
  c.interact({pressed:id});c.step(1/60);const at=point(c,id);run(c,2);expect(point(c,id)).toEqual(at);
  c.interact({pressed:null});run(c,.2);expect(point(c,id)).toEqual(at);c.interact({locked:[id]});run(c,2);expect(point(c,id)).toEqual(at);
  c.interact({locked:[]});run(c,8);expect(point(c,id)).not.toEqual(at);
  const snapshot=structuredClone(c.pose(id));c.configure(false,false);run(c,10);expect(c.pose(id)).toEqual(snapshot);expect(c.balls).toHaveLength(0);
  c.configure(true,true);run(c,5);expect(c.balls).toHaveLength(0);expect(c.pose(id)?.offset).toEqual([0,0,0]);
 });
 it("settles at the current walkway position when the last match ends",()=>{
  const initial=setup(),{c,bench}=initial;let state=initial.state;run(c,25);
  const id=bench.find(id=>Math.hypot(...c.pose(id)!.offset)>2)!;expect(id).toBeTruthy();const before=point(c,id);
  state=step(state,{type:"SubmitResult",matchId:state.matches[0].id,lineupRevisionId:state.matches[0].activeLineupRevisionId!,whiteScore:15,blackScore:11});
  c.sync(state,project(state),layout);run(c,6);const after=point(c,id);
  expect(Math.hypot(...before.map((n,i)=>n-after[i]))).toBeLessThan(.5);expect(c.balls).toHaveLength(0);
 });
 it("keeps local positions across unrelated reads and retires wandering immediately when assigned",()=>{
  const initial=setup(),{c,bench}=initial;let state=initial.state;run(c,20);const id=bench[0],before=structuredClone(c.pose(id));
  c.sync({...state,revision:state.revision+1},project(state),layout);expect(c.pose(id)).toEqual(before);
  state=arrange(state,state.matches[1].id);c.sync(state,project(state),layout);run(c,.1);
  for(const slot of state.matches[1].draftSlots){expect(c.pose(slot.playerId!)?.action).toBe("warmup");expect(playerPlacement(state,project(state),slot.playerId!,layout).onCourt).toBe(true);}
 });
});
