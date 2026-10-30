import { expect, it } from "vitest";
import { matchStatus, roundProgress, venueStep } from "../../app/match-presentation";
import { project } from "../../src/modules/competition";
import { arrange, completeRound, readyForRound, step } from "../fixtures/event";

it("distinguishes preparing, ready and actual playing without treating the current round as a match", () => {
  let state = readyForRound(1), view = project(state), match = view.matches[0];
  expect(view.roundLabel).toBe("当前轮"); expect(matchStatus(match)).toBe("安排阵容"); expect(roundProgress(view)).toBe("已录分 0/3 场");
  expect(venueStep(state, view, match, false, true).next).toContain("安排阵容");
  state = arrange(state, match.id); view = project(state); match = view.matches[0];
  expect(matchStatus(match)).toBe("准备完成"); expect(roundProgress(view)).toBe("已录分 0/3 场");
  expect(venueStep(state, view, match, false, true).next).toBe("等待管理者确认上场");
  expect(venueStep(state, view, match, true, true).next).toContain("点记分牌确认上场");
  state = step(state, { type: "StartMatch", matchId: match.id }); view = project(state); match = view.matches[0];
  expect(matchStatus(match)).toBe("比赛中"); expect(view.roundLabel).toBe("当前轮");
  expect(venueStep(state, view, match, false, true).next).toContain("录入比分");
  expect(venueStep(state, view, match, false, false).next).toBe("点记分牌查看对阵");
});

it("completed progress counts results, guests wait for management and the seventh round has two matches", () => {
  const state = completeRound(readyForRound(7)), view = project(state);
  expect(roundProgress(view)).toBe("已录分 2/2 场");
  expect(venueStep(state, view, undefined, false, true).next).toBe("等待管理者确认本轮结束");
  const historical = project(state, { roundId: state.rounds[0].id });
  expect(venueStep(state, historical, historical.matches[0], false, true)).toEqual({ status: "本轮已结束", next: "点记分牌查看赛果" });
});
