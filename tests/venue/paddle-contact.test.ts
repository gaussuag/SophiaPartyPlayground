import { describe, expect, it } from "vitest";
import { Group, Vector3 } from "three";
import { RallyTimeline, type RallyActor } from "../../src/modules/venue/rally-motion";
import { AVATAR_SCALE, BALL_RADIUS, PADDLE_FACE, PADDLE_MOUNT, RIGHT_SHOULDER, paddleContact } from "../../src/modules/venue/paddle-pose";
import { createEvent, project } from "../../src/modules/competition";
import { AvatarPlacements, nearestBenchPoint } from "../../src/modules/venue/avatar-placements";
import { benchRows, isBenchPoint, playerPlacement, worldLayout, type Point } from "../../src/modules/venue/world";
import { completeRound, step } from "../fixtures/event";
const layout = worldLayout(390, 844);
const distance = (a: Point, b: Point) => Math.hypot(...a.map((v, i) => v - b[i]));
const actors: RallyActor[] = [
  {id:"W0",base:[-1.5,.18,3.15],free:false},{id:"W1",base:[1.5,.18,3.15],free:false},
  {id:"B0",base:[-1.5,.18,-3.15],free:false},{id:"B1",base:[1.5,.18,-3.15],free:false},
  {id:"B01",base:[1.5,.18,-3.15],free:true},
];
describe("paddle-centred contact and end-row waiting", () => {
  it("matches the real Three group hierarchy under root scale, yaw, arm rotation and flight lift", () => {
    for (const yaw of [0,.35,Math.PI,-2.7]) for (const lift of [0,.19,.225]) {
      const root = new Group(), body = new Group(), arm = new Group(), grip = new Group();
      root.position.set(8.6,.18,-3.15); root.scale.setScalar(AVATAR_SCALE);
      body.position.y=lift; body.rotation.y=yaw; arm.position.set(...RIGHT_SHOULDER); arm.rotation.set(-.85,0,.12);
      grip.position.set(...PADDLE_MOUNT.position); grip.rotation.set(...PADDLE_MOUNT.rotation);
      root.add(body); body.add(arm); arm.add(grip); root.updateMatrixWorld(true);
      const actual=grip.localToWorld(new Vector3(...PADDLE_FACE)).toArray() as Point;
      expect(distance(actual,paddleContact([8.6,.18,-3.15],yaw,lift).center)).toBeLessThan(1e-9);
    }
  });
  it.each([
    ["W0","B0"], ["W0","B0","W0","B1"], ["W0","B0","W1","B0"],
    ["W0","B0","W1","B1"], ["W0","B0","W1","B01"],
  ])("puts the ball surface against the actual paddle at every hit: %j", (...sequence: string[]) => {
    const rally = new RallyTimeline(sequence,actors,.78,0,true);
    for (let hit=1;hit<24;hit++) {
      const result=rally.sample(hit*.78), id=result.ball.source, actor=actors.find(a=>a.id===id)!, pose=result.poses.get(id)!;
      const root=actor.base.map((v,i)=>v+pose.offset[i]) as Point;
      const face=paddleContact(root,pose.yaw,pose.stroke.lift,pose.stroke.arm);
      expect(distance(face.center,result.ball.position)).toBeCloseTo(BALL_RADIUS,7);
      expect(distance(face.center,result.ball.impact!.center)).toBeLessThan(1e-7);
      const before=rally.sample(hit*.78-1e-7), after=rally.sample(hit*.78+1e-7);
      expect(distance(before.ball.position,after.ball.position)).toBeLessThan(.00001);
      expect(new Set(result.poses.keys())).toEqual(new Set(sequence));
    }
  });
  it("keeps Sophia's floating paddle aligned in the staggered second warmup lane", () => {
    const rally=new RallyTimeline(["W1","B01"],actors,1.3,.43,false);
    for(let hit=1;hit<16;hit++){
      const clock=(hit-.43)*1.3, r=rally.sample(clock), actor=actors.find(a=>a.id===r.ball.source)!, p=r.poses.get(actor.id)!;
      const face=paddleContact(actor.base.map((v,i)=>v+p.offset[i]) as Point,p.yaw,p.stroke.lift,p.stroke.arm);
      expect(distance(face.center,r.ball.position)).toBeCloseTo(BALL_RADIUS,7);
    }
  });
  it("clears the net, bounces above the court and accelerates away after contact without extra balls", () => {
    const rally=new RallyTimeline(["W0","B0","W1","B1"],actors,.78,0,true);
    let last=rally.sample(0).ball.position, crossings=0;
    for(let i=1;i<=600;i++) {
      const r=rally.sample(i*.013);
      expect(r.ball.position.every(Number.isFinite)).toBe(true);
      if(last[2]*r.ball.position[2]<0){expect(r.ball.position[1]).toBeGreaterThan(1);crossings++;}
      last=r.ball.position;
    }
    expect(crossings).toBeGreaterThan(8);
    expect(rally.sample(.78*.7).ball.position[1]).toBeCloseTo(.265);
    expect(rally.sample(.78*.7-.005).ball.position[1]).toBeGreaterThan(.265);
    expect(rally.sample(.78*.7+.005).ball.position[1]).toBeGreaterThan(.265);
    expect(distance(rally.sample(.06).ball.position,rally.sample(0).ball.position)).toBeGreaterThan(.3);
  });
  it("finds the exact nearest exclusion boundary and a clear gap in crowded rows", () => {
    const p=nearestBenchPoint([-10.1,.18,3.15],layout,[[-9,.07,8.4]]);
    expect(p[0]).toBeCloseTo(-11.8);expect(p[2]).toBe(8.4);
    const crowd:Point[]=[-8.4,8.4].flatMap(z=>[-11.5,-6.9,-2.3,2.3,6.9,11.5].map(x=>[x,.07,z] as Point));
    const gap=nearestBenchPoint([0,.18,3.15],layout,crowd);
    expect(gap[2]).toBe(8.4);expect(Math.min(...crowd.map(p=>distance(p,gap)))).toBeGreaterThan(2.2);
  });
  it("restricts all default and returned players, including Sophia, to the two end rows", () => {
    let state=step(createEvent("local-contact-rows","2026-10-30T00:00:00Z"),{type:"OpenFirstRound"});
    for(const player of state.players) expect(Math.abs(playerPlacement(state,project(state),player.id,layout).position[2])).toBeCloseTo(8.4);
    for(const x of [-13.15,-4.3,4.3,13.15]) expect(isBenchPoint([x,.07,0],"FREE",layout)).toBe(false);
    const near=nearestBenchPoint([10.1,.18,3.15],layout);
    expect(near).toEqual([10.1,.07,8.4]);
    const crowded=nearestBenchPoint([10.1,.18,3.15],layout,[near]);
    expect(Math.abs(crowded[2])).toBeCloseTo(8.4);expect(distance(crowded,near)).toBeGreaterThanOrEqual(2.8-1e-6);
    const poses=new AvatarPlacements(); state=completeRound(state);poses.sync(state,project(state),layout);
    state=step(state,{type:"AdvanceRound",roundId:"R01"});poses.sync(state,project(state),layout);
    const all=state.players.map(p=>poses.get(p.id)!.position);
    for(const p of all) expect(benchRows(layout).some(([, , z])=>Math.abs(p[2]-z)<.001)).toBe(true);
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)expect(distance(all[i],all[j])).toBeGreaterThanOrEqual(2.8-1e-6);
  });
});
