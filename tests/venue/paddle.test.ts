import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { createEvent } from "../../src/modules/competition";
import { avatarAppearance } from "../../src/modules/venue/avatar-appearance";
import { PADDLE_MOUNT, PADDLE_TIP, paddleAppearance, paddleGeometry, paddleMaterial } from "../../src/modules/venue/paddle-model";
const players = createEvent("local-paddle-model", "2026-10-30T00:00:00Z").players;
describe("shared procedural pickleball equipment", () => {
  it("gives every current player a distinct stable palette, independent of side or roster order", () => {
    expect(new Set(players.map(p => paddleAppearance(p.id).face)).size).toBe(players.length);
    const colours = new Map(players.map(p => [p.id, paddleAppearance(p.id)]));
    for (const p of [...players].reverse()) expect(paddleAppearance(p.id)).toEqual(colours.get(p.id));
    expect(paddleAppearance("unknown-history-player")).toEqual(paddleAppearance("unknown-history-player"));
  });
  it("has a broad solid blade, narrow extended handle and actual thickness within a small render budget", () => {
    const g = paddleGeometry("W01", "#d8aa82"), b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeGreaterThan(.34);
    expect(b.max.y).toBeGreaterThan(.50); expect(b.min.y).toBeLessThan(-.12);
    expect(b.max.z - b.min.z).toBeGreaterThan(.045);
    const points = g.getAttribute("position"); let narrow = 0, wide = 0;
    for (let i = 0; i < points.count; i++) { const x = Math.abs(points.getX(i)), y = points.getY(i); if (y < -.08) { expect(x).toBeLessThan(.045); narrow++; } if (y > .2 && x > .14) wide++; }
    expect(narrow).toBeGreaterThan(0); expect(wide).toBeGreaterThan(0);
    expect(points.count / 3).toBeLessThan(1100);
    expect(g.groups).toHaveLength(0); expect(paddleMaterial.vertexColors).toBe(true);
  });
  it("holds the blade above and in front of the grip rather than flat along the forearm", () => {
    const tip = new Vector3(...PADDLE_TIP).applyEuler(new Euler(...PADDLE_MOUNT.rotation));
    expect(tip.y).toBeGreaterThan(.4); expect(tip.z).toBeGreaterThan(.15); expect(tip.x).toBeGreaterThan(.10);
  });
  it("reuses buffers and one material; alternating players cannot recolour an existing paddle", () => {
    const first = paddleGeometry("W01", "#d8aa82"), before = Array.from(first.getAttribute("color").array);
    const other = paddleGeometry("B01", "#edc59f");
    expect(other).not.toBe(first); expect(paddleGeometry("W01", "#d8aa82")).toBe(first);
    expect(Array.from(first.getAttribute("color").array)).toEqual(before);
    expect(paddleMaterial.map).toBeNull();
    for (let i = 0; i < players.length; i++) {
      const p = players[i], g = paddleGeometry(p.id, avatarAppearance(i, p.teamId).skin);
      expect(g.getAttribute("color").count).toBe(g.getAttribute("position").count);
      expect(Array.from(g.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      expect(g.groups).toHaveLength(0);
    }
  });
});
