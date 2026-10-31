export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type CompletionName = { id: string; x: number; y: number; width: number; height: number; radius: number; outward: number; body: ScreenRect };
export type NamePlacement = { id: string; x: number; y: number; visible: boolean };
export const overlaps = (a: ScreenRect, b: ScreenRect, gap = 2) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
/** Screen-space display only. Remember a valid slot to avoid labels swapping sides every frame. */
export class CompletionNames {
  private slots = new Map<string, number>();
  private viewport = "";
  layout(actors: readonly CompletionName[], width: number, height: number, camera = ""): NamePlacement[] {
    const key = width + ":" + height + ":" + camera;
    if (key !== this.viewport) { this.slots.clear(); this.viewport = key; }
    const safe = { left: 8, right: width - 8, top: height < 620 ? 186 : 200, bottom: height - 82 };
    const occupied: ScreenRect[] = [], output: NamePlacement[] = [];
    const ids = new Set(actors.map(a => a.id)); for (const id of this.slots.keys()) if (!ids.has(id)) this.slots.delete(id);
    const ordered = [...actors].sort((a, b) => Math.abs(a.outward) - Math.abs(b.outward) || a.id.localeCompare(b.id));
    for (const a of ordered) {
      if (a.body.right < 0 || a.body.left > width || a.body.bottom < 0 || a.body.top > height) { this.slots.delete(a.id); output.push({ id: a.id, x: a.x, y: a.y, visible: false }); continue; }
      const candidates: [number, number][] = [], gap = 6;
      const add = (x: number, y: number) => candidates.push([Math.max(safe.left + a.width / 2, Math.min(safe.right - a.width / 2, x)), Math.max(safe.top + a.height / 2, Math.min(safe.bottom - a.height / 2, y))]);
      if (a.outward) {
        for (const dy of [0, 20, -20, 40, -40, 60, -60]) for (const extra of [0, 12, 24, 40]) add(a.x + a.outward * (a.radius + a.width / 2 + gap + extra), a.y + 8 + dy);
      } else {
        for (const dy of [0, 12, 24]) for (const dx of [0, -12, 12, -24, 24]) add(a.x + dx, a.body.bottom + gap + a.height / 2 + dy);
        add(a.x, a.body.top - gap - a.height / 2);
      }
      const primaryCount = candidates.length;
      const rect = (p: [number, number]): ScreenRect => ({ left: p[0] - a.width / 2, right: p[0] + a.width / 2, top: p[1] - a.height / 2, bottom: p[1] + a.height / 2 });
      const valid = (i: number) => { const r = rect(candidates[i]); return r.left >= safe.left && r.right <= safe.right && r.top >= safe.top && r.bottom <= safe.bottom && !actors.some(other => overlaps(r, other.body)) && !occupied.some(other => overlaps(r, other)); };
      const former = this.slots.get(a.id);
      let index = former !== undefined && former < primaryCount && valid(former) ? former : candidates.findIndex((_, i) => valid(i));
      if (index < 0) {
        const sweep: [number, number][] = [];
        for (let y = safe.top + a.height / 2; y <= safe.bottom - a.height / 2; y += a.height + 4) {
          const edges = a.outward ? [a.outward < 0 ? safe.left + a.width / 2 : safe.right - a.width / 2] : [a.x, safe.left + a.width / 2, safe.right - a.width / 2];
          for (const x of edges) sweep.push([x, y]);
        }
        sweep.sort((p, q) => Math.hypot(p[0] - a.x, p[1] - a.y) - Math.hypot(q[0] - a.x, q[1] - a.y)); candidates.push(...sweep);
        index = candidates.findIndex((_, i) => i >= primaryCount && valid(i));
      }
      if (index < 0) { output.push({ id: a.id, x: a.x, y: a.y, visible: false }); continue; }
      if (index < primaryCount) this.slots.set(a.id, index); else this.slots.delete(a.id); occupied.push(rect(candidates[index])); output.push({ id: a.id, x: candidates[index][0], y: candidates[index][1], visible: true });
    }
    return output;
  }
}
