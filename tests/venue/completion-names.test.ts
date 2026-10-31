import { describe, expect, it } from "vitest";
import { CompletionNames, overlaps, type CompletionName } from "../../src/modules/venue/completion-names";
const cast = (): CompletionName[] => [...Array.from({ length: 12 }, (_, i) => {
  const side = i < 6 ? -1 : 1, x = side < 0 ? 112 : 208, y = 230 + i % 6 * 36;
  return { id: "p" + i, x, y, width: i === 3 ? 61 : 37, height: 20, radius: 25, outward: side, body: { left: x - 12, right: x + 12, top: y - 30, bottom: y } };
}), { id: "Sophia", x: 160, y: 315, width: 45, height: 20, radius: 0, outward: 0, body: { left: 132, right: 188, top: 265, bottom: 315 } }];
const rectangle = (p: { x: number; y: number }, actor: CompletionName) => ({ left: p.x - actor.width / 2, right: p.x + actor.width / 2, top: p.y - actor.height / 2, bottom: p.y + actor.height / 2 });
describe("completion names outside the actual silhouettes", () => {
  it("fits all thirteen names outside bodies and each other at a small viewport", () => {
    const actors = cast(), before = JSON.stringify(actors), placed = new CompletionNames().layout(actors, 320, 568);
    expect(placed).toHaveLength(13); expect(placed.every(p => p.visible)).toBe(true);
    for (const p of placed) {
      const r = rectangle(p, actors.find(a => a.id === p.id)!);
      expect(r.left).toBeGreaterThanOrEqual(8); expect(r.right).toBeLessThanOrEqual(312); expect(r.top).toBeGreaterThanOrEqual(186); expect(r.bottom).toBeLessThanOrEqual(486);
      for (const actor of actors) expect(overlaps(r, actor.body)).toBe(false);
      for (const q of placed.filter(q => q.id !== p.id)) expect(overlaps(r, rectangle(q, actors.find(a => a.id === q.id)!))).toBe(false);
    }
    expect(JSON.stringify(actors)).toBe(before);
  });
  it("follows motion while preserving valid slots and clears old identities", () => {
    const names = new CompletionNames(), actors = cast(), initial = names.layout(actors, 320, 568);
    const shifted = actors.map(a => ({ ...a, y: a.y + 1, body: { ...a.body, top: a.body.top + 1, bottom: a.body.bottom + 1 } }));
    const next = names.layout(shifted, 320, 568);
    for (const p of next) { const old = initial.find(a => a.id === p.id)!; expect(p.x).toBe(old.x); expect(p.y).toBeCloseTo(old.y + 1); }
    expect(names.layout([], 320, 568)).toEqual([]);
    expect(names.layout(actors, 320, 568)).toEqual(initial);
  });
  it("reanchors names when the camera returns from a crowded close view", () => {
    const names = new CompletionNames(), actors = cast();
    const crowded = actors.map(a => ({ ...a, x: a.x * 1.8, y: a.y * 1.5, body: { left: a.body.left * 1.8, right: a.body.right * 1.8, top: a.body.top * 1.5, bottom: a.body.bottom * 1.5 } }));
    names.layout(crowded, 320, 568, "close");
    expect(names.layout(actors, 320, 568, "home")).toEqual(new CompletionNames().layout(actors, 320, 568, "home"));
  });
  it("does not put an unreadable name over a scene with no free space", () => {
    const actors = [{ ...cast()[0], body: { left: 0, right: 320, top: 0, bottom: 568 } }];
    expect(new CompletionNames().layout(actors, 320, 568)[0].visible).toBe(false);
    expect(new CompletionNames().layout([{ ...actors[0], body: { left: -200, right: -100, top: 200, bottom: 240 } }], 320, 568)[0].visible).toBe(false);
  });
});
