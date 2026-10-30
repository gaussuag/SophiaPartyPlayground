import type { EventProjection, EventState, MatchView } from "../src/modules/competition";

export const matchStatus = (match: MatchView) => match.phase === "PLANNING" ? match.planningLabel : match.phase === "COMPLETED" ? "比赛结束" : "比赛中";
export const roundProgress = (view: EventProjection) => `已录分 ${view.completed}/${view.total} 场`;

/** Text for existing scene entrances; never grants a permission or starts an action. */
export function venueStep(state: EventState, view: EventProjection, match: MatchView | undefined, manage: boolean, collaborate: boolean) {
  if (view.round.phase === "UPCOMING") return { status: "尚未开始", next: "新轮开放后重新安排阵容" };
  if (!view.isCurrent || view.round.phase === "CLOSED") return { status: "本轮已结束", next: "点记分牌查看赛果" };
  if (state.phase === "PREPARED" || state.phase === "WARMUP") return { status: "赛前热身", next: manage ? "准备好后开放第一轮" : "等待管理者开放第一轮" };
  if (view.canAdvance) return { status: "本轮已录分完成", next: manage ? view.round.number === state.rounds.length ? "确认最后一轮结束" : "确认本轮结束，进入下一轮" : "等待管理者确认本轮结束" };
  if (!match) return { status: `${view.roundLabel} · ${roundProgress(view)}`, next: "点球场或记分牌查看当前步骤" };
  if (match.phase === "PLANNING") return { status: matchStatus(match), next: match.canStart ? manage ? "点记分牌确认上场并开始" : "等待管理者确认上场" : collaborate ? "点球友或空位安排阵容" : "等待阵容安排" };
  return { status: matchStatus(match), next: match.phase === "COMPLETED" ? "点记分牌查看赛果" : collaborate ? "打完后点记分牌录入比分" : "点记分牌查看对阵" };
}
