import { describe, expect, it } from "vitest";
import { createEvent, project } from "../../src/modules/competition";
import { finishedCup } from "../fixtures/finished-cup";
import { planFinale, sampleFinale, angelFinale, confettiPose, FINALE_CONFETTI_COUNT } from "../../src/modules/venue/finale";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { AvatarPlacements } from "../../src/modules/venue/avatar-placements";
import { worldLayout } from "../../src/modules/venue/world";
const layout=worldLayout(390,844);
describe("result-driven local curtain call",()=>{
 it("is absent before completion and gathers only the actual roster according to totals",()=>{
  expect(planFinale(createEvent("local-no-finale","2026-10-31T00:00:00Z"))).toBeUndefined();const s=finishedCup(),before=JSON.stringify(s),plan=planFinale(s)!;
  expect(plan.winner).toBe("WHITE");expect(Object.keys(plan.placements)).toHaveLength(s.players.length);expect(plan.winners).toHaveLength(6);expect(plan.receivers).toHaveLength(6);expect(plan.angel).toBe("B01");
  for(const id of plan.receivers){expect(Math.abs(plan.placements[id].position[0])).toBeLessThanOrEqual(2.05);expect(plan.placements[id].position[2]).toBeGreaterThan(0);}
  const sources=new Set<string>();for(let i=0;i<600;i++){const p=sampleFinale(plan,i/60);expect(p.balls.length).toBeLessThanOrEqual(6);for(const b of p.balls){sources.add(b.source);expect(plan.winners).toContain(b.source);expect(plan.receivers).toContain(b.receiver);expect(b.position.every(Number.isFinite)).toBe(true);}}
  expect(sources).toEqual(new Set(plan.winners));expect(JSON.stringify(s)).toBe(before);
 });
 it("flies Sophia across the venue and supplies a fixed ribbon pool without a clock of its own",()=>{
  expect(FINALE_CONFETTI_COUNT).toBe(112);expect(angelFinale(0).offset).not.toEqual(angelFinale(3).offset);
  for(let i=0;i<112;i++){const p=confettiPose(8.12,i);expect(p.position.every(Number.isFinite)).toBe(true);expect(p.position[1]).toBeGreaterThan(0);}
 });
 it("shares lifecycle and clears all effects on returning to a real round",()=>{
  const s=finishedCup(),view=project(s),plan=planFinale(s)!,positions=new AvatarPlacements(),c=new LocalChoreography(11);positions.present(s,plan);c.sync(s,view,layout,positions,plan);c.configure(true,false);
  for(let i=0;i<180;i++)c.step(1/60);expect(c.balls.length).toBeGreaterThan(0);const time=c.finaleClock;c.configure(false,false);c.step(1);expect(c.finaleClock).toBe(time);expect(c.balls).toHaveLength(0);
  c.configure(true,true);c.step(1);expect(c.balls).toHaveLength(0);c.configure(true,false);c.step(.05);expect(c.balls.length).toBeLessThanOrEqual(6);
  positions.sync(s,project(s,{roundId:"R01"}),layout);c.sync(s,project(s,{roundId:"R01"}),layout,positions);c.step(.05);expect(c.finale).toBeUndefined();expect(c.balls).toHaveLength(0);
 });
});
