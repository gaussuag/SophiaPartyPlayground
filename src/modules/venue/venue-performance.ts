type Stage = "input" | "camera" | "labels" | "renderCpu" | "frame" | "inputToFrame";
const stages: Stage[] = ["input", "camera", "labels", "renderCpu", "frame", "inputToFrame"];

/** Opt-in, bounded local diagnostics. Render CPU time excludes GPU execution;
 * frame intervals exclude demand-render sleep gaps, reported separately. */
export class VenuePerformance {
  private samples = new Map<Stage, number[]>();
  private lastFrame = 0;
  private lastInput = 0;
  private lastPublish = 0;
  frames = 0;
  sleepGaps = 0;
  longFrames = 0;
  constructor(readonly enabled: boolean) {}
  record(stage: Stage, milliseconds: number) {
    if (!this.enabled) return;
    const values = this.samples.get(stage) ?? [];
    values.push(milliseconds); if (values.length > 600) values.shift();
    this.samples.set(stage, values);
  }
  input(started: number) { if (this.enabled) { this.record("input", performance.now() - started); this.lastInput = started; } }
  frame(now: number) {
    if (!this.enabled) return;
    this.frames++;
    if (this.lastFrame) {
      const interval = now - this.lastFrame;
      if (interval < 250) { this.record("frame", interval); if (interval > 50) this.longFrames++; }
      else this.sleepGaps++;
    }
    if (this.lastInput) { this.record("inputToFrame", now - this.lastInput); this.lastInput = 0; }
    this.lastFrame = now;
  }
  publish(node: HTMLElement, now: number) {
    if (!this.enabled || now - this.lastPublish < 240) return;
    this.lastPublish = now;
    const result: Record<string, unknown> = { frames: this.frames, sleepGaps: this.sleepGaps, longFrames: this.longFrames };
    for (const stage of stages) {
      const values = [...(this.samples.get(stage) ?? [])].sort((a, b) => a - b);
      const percentile = (p: number) => Math.round((values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? 0) * 100) / 100;
      result[stage] = { count: values.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: percentile(1) };
    }
    node.dataset.performance = JSON.stringify(result);
  }
}
