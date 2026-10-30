import { describe, expect, it } from "vitest";
import { AvatarMotion, avatarRoute } from "../../src/modules/venue/avatar-motion";
import { courtCenter, playerPlacement, worldLayout, type Point } from "../../src/modules/venue/world";
import { project } from "../../src/modules/competition";
import { readyForRound } from "../fixtures/event";

function crossesNet(from: Point, to: Point, layout: ReturnType<typeof worldLayout>) {
  return [1, 2, 3].some(number => {
    const [x, , z] = courtCenter(number, layout);
    if ((from[2] - z) * (to[2] - z) >= 0 || from[2] === to[2]) return false;
    const fraction = (z - from[2]) / (to[2] - from[2]);
    const atX = from[0] + (to[0] - from[0]) * fraction;
    return Math.abs(atX - x) < 3.2;
  });
}
function finish(motion: AvatarMotion) {
  for (let i = 0; i < 1600 && motion.moving; i++) motion.step(1 / 60);
  expect(motion.moving).toBe(false);
}

describe("avatar walking through venue aisles", () => {
  it("an assignment starts at the visible wandering pose and confirmation never absorbs it twice", () => {
    const layout = worldLayout(390, 844), start: Point = [-10.8, .07, 8.4], visible: Point = [-10.61, .07, 8.16], target: Point = [-10.1, .18, 3.15];
    const motion = new AvatarMotion(start, Math.PI, "live");
    motion.retarget(target, Math.PI, layout, "live", false, visible);
    expect(motion.position).toEqual(visible);
    motion.step(1 / 60); const walking = [...motion.position];
    motion.retarget(target, Math.PI, layout, "live", false, visible);
    expect(motion.position).toEqual(walking);
    finish(motion); expect(motion.position).toEqual(target);
  });
  for (const [width, height] of [[390, 844], [390, 600], [1024, 768]]) {
    const layout = worldLayout(width, height);
    it(`${width}×${height}: waiting, every seat and cross-court routes never cross a net`, () => {
      const points: Point[] = [1, 2, 3].flatMap(number => {
        const [x, y, z] = courtCenter(number, layout);
        return [-1.5, 1.5].flatMap(dx => [-3.15, 3.15].map(dz => [x + dx, y + 0.06, z + dz] as Point));
      });
      const state = readyForRound(1);
      points.push(...state.players.map(player => playerPlacement(state, project(state), player.id, layout).position));
      for (const from of points) for (const to of points) {
        const route = avatarRoute(from, to, layout);
        expect(route.at(-1) ?? from).toEqual(to);
        let previous = from;
        for (const point of route) { expect(crossesNet(previous, point, layout), `${from} → ${to} via ${previous} → ${point}`).toBe(false); previous = point; }
      }
    });
  }

  it("turns first, walks with distance-based gait and arrives facing the court", () => {
    const layout = worldLayout(390, 844), start: Point = [-5.4, 0.07, 0], target: Point = [-1.5, 0.18, 3.15];
    const motion = new AvatarMotion(start, Math.PI, "live");
    motion.retarget(target, Math.PI, layout, "live");
    motion.step(1 / 60);
    expect(motion.position).toEqual(start);
    expect(motion.yaw).not.toBe(Math.PI);
    finish(motion);
    expect(motion.position).toEqual(target);
    expect(motion.travelled).toBeGreaterThan(4);
    expect(motion.yaw).toBe(Math.PI);
  });

  it("redirects an in-flight player from the visible location without teleporting or crossing a net", () => {
    const layout = worldLayout(390, 844), initial: Point = [-5.4, 0.07, -15], first: Point = [1.5, 0.18, 18.15], final: Point = [-5.4, 0.07, -5];
    const motion = new AvatarMotion(initial, Math.PI / 2, "live");
    motion.retarget(first, Math.PI, layout, "live");
    for (let i = 0; i < 110; i++) motion.step(1 / 60);
    const visible = [...motion.position];
    expect(visible).not.toEqual(initial);
    expect(visible).not.toEqual(first);
    motion.retarget(final, Math.PI / 2, layout, "live");
    expect(motion.position).toEqual(visible);
    let previous: Point = [...motion.position];
    while (motion.moving) { motion.step(1 / 60); expect(crossesNet(previous, motion.position, layout)).toBe(false); previous = [...motion.position]; }
    expect(motion.position).toEqual(final);
  });

  it("unchanged authoritative targets do not restart movement or react to a failed save", () => {
    const layout = worldLayout(390, 844), start: Point = [-5.4, 0.07, 0], target: Point = [-1.5, 0.18, 3.15];
    const motion = new AvatarMotion(start, Math.PI / 2, "live");
    motion.retarget(start, Math.PI / 2, layout, "live");
    expect(motion.moving).toBe(false);
    motion.retarget(target, Math.PI, layout, "live");
    for (let i = 0; i < 30; i++) motion.step(1 / 60);
    const visible = [...motion.position], distance = motion.travelled;
    motion.retarget(target, Math.PI, layout, "live");
    expect(motion.position).toEqual(visible);
    expect(motion.travelled).toBe(distance);
    finish(motion);
    expect(motion.position).toEqual(target);
  });

  it("independent simultaneous walks finish, while reduced motion and view/generation changes snap", () => {
    const layout = worldLayout(1024, 768), destination: Point = [0, 0.18, -3.15];
    const players = [-10.8, -7.2, -3.6, 0].map(x => new AvatarMotion([x, 0.07, 8.4], Math.PI, "round1"));
    players.forEach(m => m.retarget(destination, 0, layout, "round1"));
    for (let i = 0; i < 100; i++) players.forEach(m => m.step(1 / 60));
    players[0].retarget(destination, 0, layout, "round1", true);
    players[1].retarget(destination, 0, layout, "round2");
    players[2].snap();
    expect(players.slice(0, 3).every(m => !m.moving)).toBe(true);
    players.forEach(finish);
    expect(players.every(m => JSON.stringify(m.position) === JSON.stringify(destination))).toBe(true);
  });
});
