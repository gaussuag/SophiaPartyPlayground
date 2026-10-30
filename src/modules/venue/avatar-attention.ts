/** A short invitation while choosing a slot, followed by a static highlight.
 * No timers, React updates, or match state are owned by this animation. */
export class AvatarAttention {
  private key: string | null = null;
  private remaining = 0;
  cue(key: string | null, reduced = false) {
    if (key === this.key) return;
    this.key = key; this.remaining = key && !reduced ? 2.6 : 0;
  }
  cancelMotion() { this.remaining = 0; }
  step(delta: number, reduced = false, hidden = false) {
    if (reduced || hidden) this.remaining = 0;
    else this.remaining = Math.max(0, this.remaining - Math.min(0.05, Math.max(0, delta)));
    const elapsed = 2.6 - this.remaining;
    const envelope = this.remaining > 0 ? Math.min(1, elapsed / 0.18, this.remaining / 0.3) : 0;
    return { active: !!this.key, animating: this.remaining > 0,
      wave: envelope * (1.8 + Math.sin(elapsed * 11) * 0.32),
      ringScale: 1 + envelope * (1 + Math.sin(elapsed * 7)) * 0.13 };
  }
}
