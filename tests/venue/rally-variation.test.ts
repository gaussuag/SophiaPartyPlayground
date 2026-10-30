import { describe, expect, it } from "vitest";
import { RallyTimeline, type RallyActor } from "../../src/modules/venue/rally-motion";
import { BALL_RADIUS, paddleContact } from "../../src/modules/venue/paddle-pose";
import type { Point } from "../../src/modules/venue/world";
const actors: RallyActor[] = [{ id: "W0", base: [-1.5,.18,3.15], free: false },{ id: "W1", base: [1.5,.18,3.15], free: false },{ id: "B0", base: [-1.5,.18,-3.15], free: false },{ id: "B1", base: [1.5,.18,-3.15], free: true }];
const ids = ["W0","B0","W1","B1"], duration = .78;
const distance = (a: Point,b: Point) => Math.hypot(...a.map((v,i)=>v-b[i]));
const rally = (seed: number) => new RallyTimeline(ids,actors,duration,0,true,seed);
describe("varied local match routes with real paddle contact", () => {
  it("varies receiver order and both straight/cross court routes without starving a teammate", () => {
    const r = rally(71), sources = Array.from({length:64},(_,i)=>r.sample(i*duration).ball.source);
    expect(new Set(sources.filter((_,i)=>i%2===0))).toEqual(new Set(["W0","W1"]));
    expect(new Set(sources.filter((_,i)=>i%2===1))).toEqual(new Set(["B0","B1"]));
    for(let i=0;i<60;i+=4) expect(new Set(sources.slice(i,i+4))).toEqual(new Set(ids));
    expect(new Set(Array.from({length:16},(_,i)=>sources.slice(i*4,i*4+4).join())).size).toBeGreaterThan(2);
    expect(sources.some((id,i)=>i>=4&&id!==sources[i-4])).toBe(true);
    const pairs = new Set(sources.slice(0,-1).map((id,i)=>id+":"+sources[i+1])); expect(pairs.size).toBeGreaterThan(4);
  });
  it("varies contact targets, bounce depths, arc heights and local seeds while remaining replayable", () => {
    const a=rally(17),b=rally(991),same=rally(17),contactX:number[]=[],bounceZ:number[]=[],bounceAt:number[]=[],height:number[]=[];
    for(let hit=0;hit<30;hit++){
      const samples=Array.from({length:201},(_,i)=>a.sample((hit+i/200)*duration).ball);
      const low=samples.slice(1,-1).reduce((x,y)=>x.position[1]<y.position[1]?x:y);
      contactX.push(samples[0].position[0]);bounceZ.push(Math.abs(low.position[2]));bounceAt.push(low.phase);height.push(Math.max(...samples.map(b=>b.position[1])));
      expect(low.position[1]).toBeLessThan(.30);expect(Math.abs(low.position[0])).toBeLessThanOrEqual(2.65);
    }
    expect(Math.max(...bounceZ)-Math.min(...bounceZ)).toBeGreaterThan(.7);
    expect(Math.max(...bounceAt)-Math.min(...bounceAt)).toBeGreaterThan(.10);
    expect(Math.max(...height)-Math.min(...height)).toBeGreaterThan(.4);
    expect(new Set(contactX.map(n=>n.toFixed(1))).size).toBeGreaterThan(12);
    expect(a.sample(9.27)).toEqual(same.sample(9.27));expect(a.sample(9.27)).not.toEqual(b.sample(9.27));
  });
  it.each([1,37,981])("keeps every seeded hit continuous and attached to its actual right paddle: %s", seed => {
    const r=rally(seed);let previous=r.sample(0).ball.position,crossings=0;
    for(let hit=1;hit<=60;hit++){
      const sample=r.sample(hit*duration),actor=actors.find(a=>a.id===sample.ball.source)!,pose=sample.poses.get(actor.id)!;
      const root=actor.base.map((n,i)=>n+pose.offset[i]) as Point,face=paddleContact(root,pose.yaw,pose.stroke.lift,pose.stroke.arm);
      expect(distance(face.center,sample.ball.position)).toBeCloseTo(BALL_RADIUS,7);
      expect(distance(r.sample(hit*duration-1e-7).ball.position,r.sample(hit*duration+1e-7).ball.position)).toBeLessThan(.00002);
      for(let i=1;i<=60;i++){
        const ball=r.sample((hit-1+i/60)*duration).ball;
        if(previous[2]*ball.position[2]<0){expect(ball.position[1]).toBeGreaterThan(1);crossings++;}
        expect(Math.abs(ball.position[0])).toBeLessThanOrEqual(2.65+1e-8); expect(ball.position[1]).toBeGreaterThanOrEqual(.265);
        previous=ball.position;
      }
    }
    expect(crossings).toBe(60);
  });
});
