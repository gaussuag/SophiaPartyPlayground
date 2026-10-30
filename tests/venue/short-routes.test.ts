import { describe, expect, it } from "vitest";
import { createEvent, project, type EventState } from "../../src/modules/competition";
import { AvatarMotion, avatarRoute } from "../../src/modules/venue/avatar-motion";
import { AvatarPlacements, nearestBenchPoint } from "../../src/modules/venue/avatar-placements";
import { isBenchPoint, playerPlacement, worldLayout, type Point } from "../../src/modules/venue/world";
import { LocalChoreography } from "../../src/modules/venue/local-choreography";
import { completeRound, step } from "../fixtures/event";
const layout = worldLayout(390, 844);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const open = () => step(createEvent("local-short-routes", "2026-10-30T00:00:00Z"), { type: "OpenFirstRound" });
const assign = (state: EventState, playerId = "W02", slotId = "WHITE-1") => step(state, { type: "AssignPlayer", matchId: "M-R01-C01", slotId, playerId });
describe("shortest local routes and nearby exits", () => {
  it.each([[[-9,.07,8.4],[-10.1,.18,3.15]], [[-10.1,.18,3.15],[10.1,.18,3.15]], [[-9,.07,-8.4],[7.1,.18,-3.15]]] as [Point, Point][])("takes a direct diagonal when no net obstructs %j to %j", (from, to) => {
    expect(avatarRoute(from, to, layout)).toEqual([to]);
  });
  it("takes the mathematically shortest rectangular-net detour rather than a court-side door", () => {
    const from: Point = [0,.18,3.15], to: Point = [0,.18,-3.15]; let previous = from, length = 0;
    for (const point of avatarRoute(from, to, layout)) { length += distance(previous, point); previous = point; }
    expect(length).toBeCloseTo(2 * Math.hypot(3.25, 3.15 - .4) + .8, 6);
  });
  it("flies straight through courts and nets, retargets from its visible pose and respects pause/reduced motion", () => {
    const from: Point = [13.7,.07,0], to: Point = [-10.1,.18,-3.15];
    expect(avatarRoute(from, to, layout, "fly")).toEqual([to]);
    const motion = new AvatarMotion(from, Math.atan2(to[0]-from[0],to[2]-from[2]), "live", "fly"); motion.retarget(to, 0, layout, "live");
    for (let i=0;i<50;i++) motion.step(1/60);
    const visible: Point = [...motion.position]; expect(distance(from, visible)).toBeGreaterThan(0);
    const cross = Math.abs((visible[0]-from[0])*(to[2]-from[2])-(visible[2]-from[2])*(to[0]-from[0])); expect(cross).toBeLessThan(.00001);
    const next: Point = [1.5,.18,3.15]; motion.retarget(next, Math.PI, layout, "live"); expect(motion.position).toEqual(visible);
    motion.step(0); expect(motion.position).toEqual(visible); motion.step(1/60,true); expect(motion.position).toEqual(next);
  });
  it("chooses the closest spot in an end row and avoids an occupied waiting position", () => {
    const from: Point = [10.1,.18,3.15], near = nearestBenchPoint(from,layout);
    expect(near[0]).toBeCloseTo(from[0]); expect(near[2]).toBeCloseTo(8.4); expect(distance(from,near)).toBeCloseTo(5.25);
    const other = nearestBenchPoint(from,layout,[near]); expect(distance(near,other)).toBeGreaterThanOrEqual(2.8-.00001);
    expect(isBenchPoint(other,"WHITE",layout)).toBe(true); expect(isBenchPoint(other,"BLACK",layout)).toBe(true);
  });
  it("latches a nearby bench destination through optimistic removal and its confirmation", () => {
    let state = open(); const poses = new AvatarPlacements(); poses.sync(state,project(state),layout);
    const original = poses.get("W02")!.position; state = assign(state); poses.sync(state,project(state),layout);
    const court = poses.get("W02")!.position, context = poses.context;
    const preview = step(state,{type:"RemovePlayer",matchId:"M-R01-C01",slotId:"WHITE-1"});
    const before = JSON.stringify(preview); poses.sync(state,project(preview),layout, id=>id==="W02"?court:undefined);
    const exit = poses.get("W02")!; expect(distance(court,exit.position)).toBeLessThan(distance(court,original));
    poses.sync(preview,project(preview),layout); expect(poses.get("W02")).toBe(exit); expect(poses.context).toBe(context); expect(JSON.stringify(preview)).toBe(before);
    const activity = new LocalChoreography(7); activity.sync(preview,project(preview),layout,poses); expect(activity.pose("W02")!.base).toEqual(exit.position);
    // Rejection of that local preview returns to the authoritative court, not a second bench copy.
    poses.sync(state,project(state),layout); expect(poses.get("W02")!.position).toEqual(court); expect(poses.get("W02")!.onCourt).toBe(true);
  });
  it("uses visible origins during cancellation and preserves settled bench places across unrelated updates", () => {
    let state=assign(open()); const poses=new AvatarPlacements(); poses.sync(state,project(state),layout);
    const visible: Point=[-12.5,.18,5.9]; state=step(state,{type:"RemovePlayer",matchId:"M-R01-C01",slotId:"WHITE-1"});
    poses.sync(state,project(state),layout,id=>id==="W02"?visible:undefined); const exit=poses.get("W02")!;
    expect(distance(visible,exit.position)).toBeLessThan(3); expect(Math.abs(exit.position[2])).toBeCloseTo(8.4);
    poses.sync({...state,revision:state.revision+1},project(state),layout); expect(poses.get("W02")).toBe(exit);
  });
  it("moves everyone to distinct nearby edges on round advance and snaps only for history or restore", () => {
    let state=completeRound(open()); const poses=new AvatarPlacements(); poses.sync(state,project(state),layout); const context=poses.context;
    const people=state.lineups.flatMap(l=>l.participants.map(p=>p.playerId));
    state=step(state,{type:"AdvanceRound",roundId:"R01"}); poses.sync(state,project(state),layout);
    expect(poses.context).toBe(context); const positions=people.map(id=>poses.get(id)!.position); expect(new Set(positions.map(p=>p.join())).size).toBe(people.length);
    for(const [index,id] of people.entries()) { expect(isBenchPoint(positions[index],"WHITE",layout)).toBe(true); expect(poses.get(id)!.onCourt).toBe(false); expect(Math.abs(positions[index][2])).toBeCloseTo(8.4); }
    poses.sync(state,project(state,{roundId:"R01"}),layout); expect(poses.context).not.toBe(context); expect(poses.get(people[0])!.onCourt).toBe(true);
    const restored={...state,generation:1}; poses.sync(restored,project(restored),layout); expect(poses.get("W02")!.position).toEqual(playerPlacement(restored,project(restored),"W02",layout).position);
  });
});
