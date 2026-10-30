import { describe, expect, it } from "vitest";
import { AvatarAttention } from "../../src/modules/venue/avatar-attention";

describe("candidate invitation", () => {
  it("waves briefly, then leaves a static highlight without requesting more frames", () => {
    const motion = new AvatarAttention(); motion.cue("C01:BLACK-1");
    for (let i = 0; i < 15; i++) motion.step(1 / 60);
    const animated = motion.step(1 / 60);
    expect(animated.active).toBe(true); expect(animated.animating).toBe(true); expect(animated.wave).toBeGreaterThan(1); expect(animated.ringScale).toBeGreaterThan(1);
    for (let i = 0; i < 180; i++) motion.step(1 / 60);
    expect(motion.step(1 / 60)).toEqual({ active: true, animating: false, wave: 0, ringScale: 1 });
  });
  it("does not restart on every poll or render, but invites again for a different slot", () => {
    const motion = new AvatarAttention(); motion.cue("first");
    for (let i = 0; i < 180; i++) { motion.cue("first"); motion.step(1 / 60); }
    expect(motion.step(1 / 60).animating).toBe(false);
    motion.cue("second"); expect(motion.step(1 / 60).animating).toBe(true);
    motion.cue(null); expect(motion.step(1 / 60)).toEqual({ active: false, animating: false, wave: 0, ringScale: 1 });
  });
  it("keeps the same eligible highlight with reduced motion or a hidden page", () => {
    const motion = new AvatarAttention(); motion.cue("first", true);
    expect(motion.step(1 / 60, true)).toEqual({ active: true, animating: false, wave: 0, ringScale: 1 });
    motion.cue("second"); motion.step(1 / 60); expect(motion.step(1 / 60, false, true).animating).toBe(false);
    expect(motion.step(1 / 60).animating).toBe(false);
    motion.cue("third"); motion.cancelMotion(); expect(motion.step(1 / 60).animating).toBe(false);
  });
});
