export function angelPose(clock: number, moving: boolean, reduced: boolean) {
  if (reduced) return { lift: .16, wing: .18, bank: 0, leg: -.18 };
  return { lift: (moving ? .34 : .19) + Math.sin(clock * 2.4) * .035,
    wing: .22 + Math.sin(clock * (moving ? 10 : 4.2)) * (moving ? .48 : .18),
    bank: moving ? Math.sin(clock * 2) * .035 : 0, leg: moving ? -.4 : -.18 };
}
