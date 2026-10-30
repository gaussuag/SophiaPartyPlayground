import template from "../../../data/event-template.json";
import type { CompetitionCommand, Decision, DecisionContext, EventProjection, EventState, Gender, Match, MatchType, Participant, Player, RuleError, Slot, TeamId } from "./model";
export type * from "./model";

class Rejection extends Error {
  constructor(readonly detail: RuleError) { super(detail.message); }
}
function reject(code: string, message: string, matchId?: string): never { throw new Rejection({ code, message, ...(matchId ? { matchId } : {}) }); }
function requireRule(condition: unknown, code: string, message: string, matchId?: string): asserts condition { if (!condition) reject(code, message, matchId); }
function slotsFor(type: MatchType): Slot[] {
  let genders: (Gender | null)[];
  switch (type) {
    case "MIXED_DOUBLES": genders = ["MALE", "FEMALE"]; break;
    case "MENS_DOUBLES": genders = ["MALE", "MALE"]; break;
    case "WOMENS_DOUBLES": genders = ["FEMALE", "FEMALE"]; break;
    case "MENS_SINGLES": genders = ["MALE"]; break;
    case "WOMENS_SINGLES": genders = ["FEMALE"]; break;
    case "OPEN_DOUBLES": genders = [null, null]; break;
  }
  return (["WHITE", "BLACK"] as TeamId[]).flatMap(sideId => genders.map((gender, i) => ({ id: `${sideId}-${i + 1}`, sideId, gender, playerId: null })));
}

/** Explicit initialization only. Loading a page never calls this factory. */
export function createEvent(id: string, now: string): EventState {
  requireRule(/^[a-zA-Z0-9_-]{1,80}$/.test(id), "INVALID_EVENT_ID", "活动编号无效");
  return {
    id, templateId: template.templateId, schemaVersion: 1, ruleVersion: 1, revision: 0, generation: 0,
    name: template.event.name, date: template.event.date, timeZone: template.event.timeZone,
    phase: "PREPARED", activeRoundId: null, updatedAt: now,
    teams: structuredClone(template.teams) as EventState["teams"], players: structuredClone(template.players) as Player[], courts: structuredClone(template.courts),
    rounds: template.rounds.map(r => ({ ...r, phase: "UPCOMING", openedAt: null, closedAt: null })),
    matches: template.matches.map(m => ({ ...m, type: m.type as MatchType, phase: "PLANNING", draftSlots: slotsFor(m.type as MatchType), activeLineupRevisionId: null, activeResultRevisionId: null, startedAt: null, endDeclaredAt: null })),
    courtBlocks: structuredClone(template.courtBlocks), lineups: [], results: [], audit: [],
  };
}

function lineup(state: EventState, match: Match): Participant[] {
  return state.lineups.find(l => l.id === match.activeLineupRevisionId)?.participants ?? [];
}
function occupiedSlots(state: EventState, match: Match): Slot[] {
  if (match.phase === "PLANNING") return match.draftSlots;
  return slotsFor(match.type).map(slot => ({ ...slot, playerId: lineup(state, match).find(p => p.slotId === slot.id)?.playerId ?? null }));
}
function roundAvailable(state: EventState, roundId: string): boolean {
  for (const sideId of ["WHITE", "BLACK"] as TeamId[]) {
    const slots = state.matches.filter(m => m.roundId === roundId).flatMap(m => occupiedSlots(state, m)).filter(s => s.sideId === sideId);
    const used = slots.filter(s => s.playerId).map(s => s.playerId!);
    if (new Set(used).size !== used.length) return false;
    const people = state.players.filter(p => p.teamId === sideId && !used.includes(p.id));
    const remaining = slots.filter(s => !s.playerId).sort((a, b) => Number(!a.gender) - Number(!b.gender));
    const fit = (index: number, available: Player[]): boolean => index === remaining.length || available.some((p, i) => (!remaining[index].gender || remaining[index].gender === p.gender) && fit(index + 1, available.filter((_, j) => i !== j)));
    if (!fit(0, people)) return false;
  }
  return true;
}
function checkPlayer(state: EventState, match: Match, slot: Slot, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  requireRule(player, "UNKNOWN_PLAYER", "找不到这位选手");
  requireRule(player.teamId === slot.sideId, "WRONG_TEAM", `此席位需要${slot.sideId === "WHITE" ? "白队" : "黑队"}选手`);
  requireRule(!slot.gender || player.gender === slot.gender, "WRONG_GENDER", `此席位需要${slot.gender === "MALE" ? "男性" : "女性"}选手`);
  for (const other of state.matches) {
    for (const used of occupiedSlots(state, other)) {
      if (used.playerId !== playerId || (other.id === match.id && used.id === slot.id)) continue;
      if (other.phase === "PLAYING" && match.roundId === state.activeRoundId) reject("PLAYER_PLAYING", `${player.name}正在 ${state.courts.find(c => c.id === other.courtId)?.number} 号场比赛`, other.id);
      if (other.roundId === match.roundId) reject(other.phase === "PLANNING" ? "PLAYER_RESERVED" : "PLAYED_THIS_ROUND", `${player.name}${other.phase === "PLANNING" ? "已在本轮其他席位占位" : "本轮已经参赛"}`, other.id);
    }
  }
}
function checkLineup(state: EventState, match: Match) {
  requireRule(match.draftSlots.every(s => s.playerId), "INCOMPLETE_LINEUP", "请先安排双方全部席位");
  for (const slot of match.draftSlots) checkPlayer(state, match, slot, slot.playerId!);
  requireRule(roundAvailable(state, match.roundId), "ROUND_INFEASIBLE", "此安排会使本轮其他场次缺少符合条件的选手");
}
function participant(state: EventState, slot: Slot): Participant {
  const p = state.players.find(p => p.id === slot.playerId)!;
  return { slotId: slot.id, sideId: slot.sideId, playerId: p.id, name: p.name, gender: p.gender, teamId: p.teamId };
}
function checkScores(white: number, black: number) {
  requireRule(Number.isSafeInteger(white) && Number.isSafeInteger(black) && white >= 0 && black >= 0, "INVALID_SCORE", "比分须为非负整数，空白不等于 0");
  requireRule(white !== black, "EQUAL_SCORE", "请输入有胜负的最终比分");
}

/** The only seam for business transitions. Input is never mutated. */
export function decide(snapshot: EventState, command: CompetitionCommand, context: DecisionContext): Decision {
  try {
    context = { ...context, now: Date.parse(context.now) < Date.parse(snapshot.updatedAt) ? snapshot.updatedAt : context.now };
    const state = structuredClone(snapshot);
    const changedIds: string[] = [];
    const currentRound = () => state.rounds.find(r => r.id === state.activeRoundId);
    const requireCurrent = (match: Match) => requireRule(state.phase === "ACTIVE" && match.roundId === state.activeRoundId && currentRound()?.phase === "OPEN", "NOT_CURRENT_ROUND", "只有当前开放轮次可以执行此操作");
    let match: Match | undefined;
    if ("matchId" in command) {
      match = state.matches.find(m => m.id === command.matchId);
      requireRule(match, "UNKNOWN_MATCH", "找不到这场比赛");
      changedIds.push(match.id);
    }
    switch (command.type) {
      case "StartWarmup":
        requireRule(state.phase === "PREPARED", "INVALID_PHASE", "活动已开始"); state.phase = "WARMUP"; break;
      case "OpenFirstRound": {
        requireRule(state.phase === "PREPARED" || state.phase === "WARMUP", "INVALID_PHASE", "正式活动已开始");
        const first = state.rounds[0]; first.phase = "OPEN"; first.openedAt = context.now;
        state.phase = "ACTIVE"; state.activeRoundId = first.id; changedIds.push(first.id); break;
      }
      case "AssignPlayer": case "ReplacePlayer": {
        requireCurrent(match!);
        requireRule(match!.phase === "PLANNING", "INVALID_PHASE", "确认上场后不能调整阵容草稿");
        const slot = match!.draftSlots.find(s => s.id === command.slotId);
        requireRule(slot, "UNKNOWN_SLOT", "找不到这个席位");
        requireRule(command.type === "ReplacePlayer" || !slot.playerId, "SLOT_OCCUPIED", "该席位已有选手，请使用替换操作");
        requireRule(command.type === "AssignPlayer" || slot.playerId, "SLOT_EMPTY", "此席位为空，请直接安排");
        checkPlayer(state, match!, slot, command.playerId);
        slot.playerId = command.playerId;
        requireRule(roundAvailable(state, match!.roundId), "ROUND_INFEASIBLE", "这样安排会使本轮其他比赛缺少符合条件的选手，请保留所需男性或女性选手");
        changedIds.push(command.playerId); break;
      }
      case "MovePlayer": {
        requireCurrent(match!);
        const source = state.matches.find(m => m.id === command.fromMatchId);
        requireRule(source, "UNKNOWN_MATCH", "原场次不存在，请重新选择球友");
        requireCurrent(source);
        requireRule(source.phase === "PLANNING" && match!.phase === "PLANNING", "INVALID_PHASE", "确认上场后锁定阵容，不能移动选手");
        const from = source.draftSlots.find(s => s.id === command.fromSlotId);
        const to = match!.draftSlots.find(s => s.id === command.slotId);
        requireRule(from && to, "UNKNOWN_SLOT", "找不到这个席位");
        requireRule(from.playerId === command.playerId, "SOURCE_CHANGED", "原位置已改变，请重新选择球友");
        requireRule(from !== to, "SAME_SLOT", "球友已在这个位置");
        const displaced = to.playerId;
        from.playerId = null;
        checkPlayer(state, match!, to, command.playerId);
        to.playerId = command.playerId;
        requireRule(roundAvailable(state, match!.roundId), "ROUND_INFEASIBLE", "这样安排会使本轮其他比赛缺少符合条件的选手");
        changedIds.push(source.id, command.playerId, ...(displaced ? [displaced] : [])); break;
      }
      case "RemovePlayer": case "CancelDraft": {
        requireCurrent(match!); requireRule(match!.phase === "PLANNING", "INVALID_PHASE", "只能移出尚未上场的草稿");
        const slots = "slotId" in command ? match!.draftSlots.filter(s => s.id === command.slotId) : match!.draftSlots;
        requireRule(slots.length, "UNKNOWN_SLOT", "找不到这个席位"); slots.forEach(s => { if (s.playerId) changedIds.push(s.playerId); s.playerId = null; }); break;
      }
      case "StartMatch": {
        requireCurrent(match!); requireRule(match!.phase === "PLANNING", "INVALID_PHASE", "此场已经确认上场");
        requireRule(!state.matches.some(m => m.id !== match!.id && m.courtId === match!.courtId && m.phase === "PLAYING"), "COURT_BUSY", "此场地仍有比赛进行中");
        checkLineup(state, match!);
        const id = `${context.commandId}:lineup`;
        state.lineups.push({ id, matchId: match!.id, participants: match!.draftSlots.map(s => participant(state, s)), confirmedAt: context.now, supersedes: state.lineups.filter(l => l.matchId === match!.id).at(-1)?.id ?? null, reason: null });
        match!.activeLineupRevisionId = id; match!.phase = "PLAYING"; match!.startedAt = context.now; match!.endDeclaredAt = null; changedIds.push(id); break;
      }
      case "UndoStart":
        requireCurrent(match!); requireRule(match!.phase === "PLAYING" && !match!.activeResultRevisionId, "INVALID_PHASE", "只能撤销尚未录分的误开赛");
        requireRule(command.reason === "ACTUAL_NOT_STARTED", "REASON_REQUIRED", "请确认真实比赛尚未开打");
        match!.draftSlots = occupiedSlots(state, match!); match!.phase = "PLANNING"; match!.activeLineupRevisionId = null; match!.startedAt = null; match!.endDeclaredAt = null; break;
      case "BeginResultEntry":
        // Compatibility for older clients. Opening an editor is no longer a
        // declaration that the real match has ended; only a valid score ends it.
        requireCurrent(match!); requireRule(match!.phase === "PLAYING", "INVALID_PHASE", "只有比赛中可以录入比分"); break;
      case "UndoEndDeclaration": {
        requireCurrent(match!); requireRule((match!.phase === "AWAITING_RESULT" || match!.phase === "PLAYING") && !match!.activeResultRevisionId, "INVALID_PHASE", "此场不能撤销结束声明");
        const ids = lineup(state, match!).map(p => p.playerId);
        requireRule(!state.matches.some(m => m.id !== match!.id && m.phase === "PLAYING" && (m.courtId === match!.courtId || lineup(state, m).some(p => ids.includes(p.playerId)))), "OCCUPANCY_CONFLICT", "场地或选手已被其他比赛占用");
        match!.phase = "PLAYING"; match!.endDeclaredAt = null; break;
      }
      case "SubmitResult": case "CorrectResult": {
        if (command.type === "SubmitResult") { requireCurrent(match!); requireRule(match!.phase === "PLAYING" || match!.phase === "AWAITING_RESULT", "INVALID_PHASE", "只有已确认上场的比赛可以录入赛果"); }
        else { requireRule(match!.phase === "COMPLETED", "INVALID_PHASE", "只有已完成的比赛可以更正比分"); requireRule(match!.activeResultRevisionId === command.resultRevisionId, "RESULT_CHANGED", "赛果已更新，请重新核对"); }
        requireRule(match!.activeLineupRevisionId === command.lineupRevisionId, "LINEUP_CHANGED", "确认阵容已改变，请核对参赛者后重新确认比分");
        checkScores(command.whiteScore, command.blackScore);
        const id = `${context.commandId}:result`;
        state.results.push({ id, matchId: match!.id, lineupRevisionId: command.lineupRevisionId, whiteScore: command.whiteScore, blackScore: command.blackScore, winnerTeamId: command.whiteScore > command.blackScore ? "WHITE" : "BLACK", submittedAt: context.now, actorId: context.actorId, supersedes: match!.activeResultRevisionId ?? state.results.filter(r => r.matchId === match!.id).at(-1)?.id ?? null, reason: "reason" in command ? command.reason : null });
        match!.activeResultRevisionId = id;
        if (command.type === "SubmitResult") match!.endDeclaredAt = context.now;
        match!.phase = "COMPLETED"; changedIds.push(id); break;
      }
      case "WithdrawCurrentResult": {
        requireCurrent(match!);
        const result = state.results.find(r => r.id === match!.activeResultRevisionId);
        requireRule(match!.phase === "COMPLETED" && result && !result.supersedes, "CANNOT_WITHDRAW", "仅当前轮首次赛果可以撤回；历史或已更正赛果请使用比分更正");
        match!.activeResultRevisionId = null; match!.phase = "PLAYING"; match!.endDeclaredAt = null; break;
      }
      case "CorrectRecordedLineup": {
        requireRule(match!.phase === "AWAITING_RESULT" || match!.phase === "COMPLETED", "INVALID_PHASE", "比赛结束后才可更正实际名单");
        requireRule(match!.activeLineupRevisionId === command.lineupRevisionId, "LINEUP_CHANGED", "实际名单已更新，请重新核对");
        const replacement = slotsFor(match!.type);
        requireRule(command.participants.length === replacement.length && new Set(command.participants.map(p => p.slotId)).size === replacement.length, "INCOMPLETE_LINEUP", "请核对全部实际参赛席位");
        for (const slot of replacement) { slot.playerId = command.participants.find(p => p.slotId === slot.id)?.playerId ?? null; requireRule(slot.playerId, "INCOMPLETE_LINEUP", "缺少实际参赛者"); }
        const priorLineup = match!.activeLineupRevisionId;
        const priorPhase = match!.phase;
        match!.phase = "PLANNING"; match!.draftSlots = replacement;
        checkLineup(state, match!);
        const ids = replacement.map(s => s.playerId!);
        const start = Date.parse(match!.startedAt!); const end = match!.endDeclaredAt ? Date.parse(match!.endDeclaredAt) : Infinity;
        for (const other of state.matches) {
          if (other.id === match!.id || !other.startedAt || !other.activeLineupRevisionId) continue;
          const overlap = start < (other.endDeclaredAt ? Date.parse(other.endDeclaredAt) : Infinity) && Date.parse(other.startedAt) < end;
          requireRule(!overlap || !lineup(state, other).some(p => ids.includes(p.playerId)), "HISTORICAL_OCCUPANCY_CONFLICT", "实际名单与另一场比赛的在场区间冲突", other.id);
        }
        const id = `${context.commandId}:lineup`;
        state.lineups.push({ id, matchId: match!.id, participants: replacement.map(s => participant(state, s)), confirmedAt: context.now, supersedes: priorLineup, reason: command.reason });
        match!.activeLineupRevisionId = id; match!.phase = priorPhase; changedIds.push(id);
        const old = state.results.find(r => r.id === match!.activeResultRevisionId);
        if (old) { const resultId = `${context.commandId}:result`; state.results.push({ ...old, id: resultId, lineupRevisionId: id, submittedAt: context.now, actorId: context.actorId, supersedes: old.id, reason: command.reason }); match!.activeResultRevisionId = resultId; changedIds.push(resultId); }
        break;
      }
      case "AdvanceRound": {
        const round = currentRound();
        requireRule(state.phase === "ACTIVE" && round?.phase === "OPEN" && round.id === command.roundId, "NOT_CURRENT_ROUND", "当前轮已改变，请重新核对");
        requireRule(state.matches.filter(m => m.roundId === round.id).every(m => m.phase === "COMPLETED" && m.activeResultRevisionId), "ROUND_INCOMPLETE", "本轮全部正式比赛录分完成后才能推进");
        round.phase = "CLOSED"; round.closedAt = context.now; changedIds.push(round.id);
        const next = state.rounds.find(r => r.number === round.number + 1);
        state.activeRoundId = next?.id ?? null;
        if (next) { next.phase = "OPEN"; next.openedAt = context.now; changedIds.push(next.id); } break;
      }
      case "FinishEvent":
        requireRule(state.phase === "ACTIVE" && state.rounds.every(r => r.phase === "CLOSED") && !state.activeRoundId, "EVENT_INCOMPLETE", "请先完成并关闭全部七轮"); state.phase = "FINISHED"; break;
      default: reject("UNKNOWN_COMMAND", "不支持的操作");
    }
    state.revision += 1; state.updatedAt = context.now;
    state.audit.push({ commandId: context.commandId, actorId: context.actorId, type: command.type, recordedAt: context.now, changedIds, reason: "reason" in command ? command.reason : null });
    return { ok: true, state, changedIds };
  } catch (error) { if (error instanceof Rejection) return { ok: false, error: error.detail }; throw error; }
}

/** Read-only UI facts; no scene position or animation participates. */
export function project(state: EventState, viewContext: { roundId?: string } = {}): EventProjection {
  const defaultRound = state.phase === "PREPARED" || state.phase === "WARMUP" ? state.rounds[0] : state.rounds.at(-1)!;
  const round = state.rounds.find(r => r.id === (viewContext.roundId ?? state.activeRoundId)) ?? defaultRound;
  const matches = state.matches.filter(m => m.roundId === round.id).map(m => {
    let canStart = false;
    if (m.phase === "PLANNING" && m.roundId === state.activeRoundId) { try { checkLineup(state, m); canStart = true; } catch { /* Explain each candidate through decide. */ } }
    return { ...m, participants: lineup(state, m), result: state.results.find(r => r.id === m.activeResultRevisionId) ?? null, canStart, planningLabel: canStart ? "准备完成" : "安排阵容" };
  });
  const completed = matches.filter(m => m.phase === "COMPLETED").length;
  const playerStates: EventProjection["playerStates"] = Object.fromEntries(state.players.map(p => [p.id, { status: "available", label: "可安排" }]));
  for (const match of state.matches.filter(m => m.roundId === round.id)) {
    const status = match.phase === "PLANNING" ? "reserved" : match.phase === "COMPLETED" ? "played_this_round" : "playing";
    for (const slot of occupiedSlots(state, match)) if (slot.playerId) playerStates[slot.playerId] = { status, matchId: match.id, label: status === "reserved" ? `${state.courts.find(c => c.id === match.courtId)?.number} 号场占位` : status === "playing" ? "比赛中" : "本轮已参赛" };
  }
  const roundLabel = round.phase === "CLOSED" ? "本轮已结束" : completed === matches.length ? "等待本轮确认" : round.phase === "UPCOMING" ? "尚未开始" : "当前轮";
  return { round, roundLabel, matches, completed, total: matches.length, canAdvance: state.phase === "ACTIVE" && round.phase === "OPEN" && round.id === state.activeRoundId && completed === matches.length, isCurrent: round.id === state.activeRoundId, playerStates };
}

/** Validate imported facts through the same invariants as live commands. */
export function verifySnapshot(candidate: EventState): RuleError | null {
  try {
    const validTime = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
    requireRule(candidate && candidate.schemaVersion === 1 && candidate.ruleVersion === 1 && Number.isSafeInteger(candidate.revision) && candidate.revision >= 0 && Number.isSafeInteger(candidate.generation) && candidate.generation >= 0, "INVALID_BACKUP", "备份版本无效");
    requireRule(validTime(candidate.updatedAt) && typeof candidate.name === "string" && (candidate.date === null || typeof candidate.date === "string") && (candidate.timeZone === null || typeof candidate.timeZone === "string"), "INVALID_BACKUP", "备份活动信息无效");
    const initial = createEvent(candidate.id, candidate.updatedAt);
    requireRule(candidate.templateId === initial.templateId && JSON.stringify(candidate.players) === JSON.stringify(initial.players) && JSON.stringify(candidate.courts) === JSON.stringify(initial.courts) && JSON.stringify(candidate.teams) === JSON.stringify(initial.teams) && JSON.stringify(candidate.courtBlocks) === JSON.stringify(initial.courtBlocks), "IDENTITY_MISMATCH", "备份名单、场地或模板身份不匹配");
    requireRule(candidate.rounds.length === 7 && candidate.matches.length === 20 && new Set(candidate.matches.map(m => m.id)).size === 20 && new Set(candidate.rounds.map(r => r.id)).size === 7, "INVALID_BACKUP", "备份必须包含七轮二十场");
    requireRule(["PREPARED", "WARMUP", "ACTIVE", "FINISHED"].includes(candidate.phase), "INVALID_BACKUP", "活动阶段无效");
    requireRule(new Set(candidate.lineups.map(l => l.id)).size === candidate.lineups.length && new Set(candidate.results.map(r => r.id)).size === candidate.results.length, "INVALID_BACKUP", "版本编号重复");
    const open = candidate.rounds.filter(r => r.phase === "OPEN");
    requireRule(open.length <= 1 && (open[0]?.id ?? null) === candidate.activeRoundId, "INVALID_BACKUP", "开放轮次与当前轮不一致");
    let upcomingSeen = false;
    for (const round of candidate.rounds) {
      const source = initial.rounds.find(r => r.id === round.id);
      requireRule(source && source.number === round.number && source.plannedStart === round.plannedStart && source.plannedEnd === round.plannedEnd && ["UPCOMING", "OPEN", "CLOSED"].includes(round.phase), "INVALID_BACKUP", "轮次定义不匹配");
      requireRule(!upcomingSeen || round.phase === "UPCOMING", "INVALID_BACKUP", "轮次顺序无效");
      if (round.phase !== "CLOSED") upcomingSeen = true;
      requireRule(round.phase === "UPCOMING" ? !round.openedAt && !round.closedAt : !!round.openedAt && (round.phase === "CLOSED" ? !!round.closedAt : !round.closedAt), "INVALID_BACKUP", "轮次时刻无效");
      requireRule(roundAvailable(candidate, round.id), "ROUND_INFEASIBLE", "备份存在同轮冲突或不可完成的阵容");
    }
    requireRule(candidate.phase === "ACTIVE" || !candidate.activeRoundId, "INVALID_BACKUP", "非比赛阶段不能有开放轮次");
    requireRule(!["PREPARED", "WARMUP"].includes(candidate.phase) || candidate.rounds.every(r => r.phase === "UPCOMING"), "INVALID_BACKUP", "未开始活动存在正式记录");
    requireRule(candidate.phase !== "FINISHED" || candidate.rounds.every(r => r.phase === "CLOSED"), "INVALID_BACKUP", "未完成活动不能结束");
    requireRule(candidate.phase !== "ACTIVE" || !!candidate.activeRoundId || candidate.rounds.every(r => r.phase === "CLOSED"), "INVALID_BACKUP", "比赛阶段缺少当前轮次");
    for (const r of candidate.rounds) { requireRule((r.openedAt === null || validTime(r.openedAt)) && (r.closedAt === null || validTime(r.closedAt)) && (!r.closedAt || Date.parse(r.closedAt) >= Date.parse(r.openedAt!)), "INVALID_BACKUP", "轮次时刻无效"); }
    for (const m of candidate.matches) {
      const source = initial.matches.find(x => x.id === m.id);
      requireRule(source && m.roundId === source.roundId && m.courtId === source.courtId && m.type === source.type && m.label === source.label && ["PLANNING", "PLAYING", "AWAITING_RESULT", "COMPLETED"].includes(m.phase), "INVALID_BACKUP", "场次定义不匹配");
      const canonical = slotsFor(m.type);
      requireRule(m.draftSlots.length === canonical.length && canonical.every(s => m.draftSlots.filter(d => d.id === s.id && d.sideId === s.sideId && d.gender === s.gender).length === 1), "INVALID_BACKUP", "草稿席位不匹配");
      for (const s of occupiedSlots(candidate, m)) if (s.playerId) checkPlayer(candidate, m, s, s.playerId);
      const l = candidate.lineups.find(l => l.id === m.activeLineupRevisionId);
      const r = candidate.results.find(r => r.id === m.activeResultRevisionId);
      requireRule(m.phase === "PLANNING" ? !m.activeLineupRevisionId && !m.startedAt && !m.endDeclaredAt : l?.matchId === m.id && !!m.startedAt, "INVALID_BACKUP", "阶段与确认阵容不一致");
      requireRule(m.phase === "PLAYING" ? !m.endDeclaredAt : m.phase === "PLANNING" || !!m.endDeclaredAt, "INVALID_BACKUP", "结束声明与阶段不一致");
      requireRule(m.phase === "COMPLETED" ? r?.matchId === m.id && r.lineupRevisionId === m.activeLineupRevisionId : !m.activeResultRevisionId, "INVALID_BACKUP", "阶段与有效赛果不一致");
      const round = candidate.rounds.find(r => r.id === m.roundId)!;
      requireRule(round.phase !== "CLOSED" || m.phase === "COMPLETED", "INVALID_BACKUP", "已关闭轮次缺少有效赛果");
      requireRule(round.phase !== "UPCOMING" || m.phase === "PLANNING" && m.draftSlots.every(s => !s.playerId), "INVALID_BACKUP", "未来轮次不能提前占位");
      requireRule((m.startedAt === null || validTime(m.startedAt)) && (m.endDeclaredAt === null || validTime(m.endDeclaredAt)) && (!m.endDeclaredAt || Date.parse(m.endDeclaredAt) >= Date.parse(m.startedAt!)), "INVALID_BACKUP", "比赛在场区间无效");
      requireRule(!l || m.draftSlots.every(s => l.participants.some(p => p.slotId === s.id && p.playerId === s.playerId)), "INVALID_BACKUP", "已确认阵容与席位不一致");
    }
    for (const [index, l] of candidate.lineups.entries()) {
      const m = candidate.matches.find(m => m.id === l.matchId);
      requireRule(m, "INVALID_BACKUP", "阵容引用不存在的场次");
      const slots = slotsFor(m.type);
      requireRule(l.participants.length === slots.length && new Set(l.participants.map(p => p.playerId)).size === slots.length && slots.every(s => l.participants.filter(p => p.slotId === s.id).length === 1), "INVALID_BACKUP", "确认阵容席位错误");
      for (const p of l.participants) { const player = candidate.players.find(x => x.id === p.playerId); const s = slots.find(x => x.id === p.slotId)!; requireRule(player && p.name === player.name && p.gender === player.gender && p.teamId === player.teamId && p.sideId === s.sideId && p.teamId === s.sideId && (!s.gender || p.gender === s.gender), "INVALID_BACKUP", "确认阵容身份或性别错误"); }
      requireRule(validTime(l.confirmedAt) && (!l.supersedes || candidate.lineups.slice(0, index).some(prior => prior.id === l.supersedes && prior.matchId === l.matchId)), "INVALID_BACKUP", "阵容历史引用或时刻无效");
    }
    for (const [index, r] of candidate.results.entries()) { checkScores(r.whiteScore, r.blackScore); requireRule(candidate.lineups.some(l => l.id === r.lineupRevisionId && l.matchId === r.matchId) && r.winnerTeamId === (r.whiteScore > r.blackScore ? "WHITE" : "BLACK"), "INVALID_BACKUP", "赛果引用或获胜方无效"); requireRule(validTime(r.submittedAt) && (!r.supersedes || candidate.results.slice(0, index).some(prior => prior.id === r.supersedes && prior.matchId === r.matchId)), "INVALID_BACKUP", "赛果历史引用或时刻无效"); }
    requireRule(candidate.audit.every(a => validTime(a.recordedAt) && typeof a.type === "string" && Array.isArray(a.changedIds) && a.changedIds.every(id => typeof id === "string") && (a.reason === null || typeof a.reason === "string")), "INVALID_BACKUP", "审计记录无效");
    for (const m of candidate.matches.filter(m => m.activeLineupRevisionId)) {
      const ids = lineup(candidate, m).map(p => p.playerId);
      for (const other of candidate.matches.filter(x => x.id !== m.id && x.activeLineupRevisionId)) {
        const overlaps = Date.parse(m.startedAt!) < (other.endDeclaredAt ? Date.parse(other.endDeclaredAt) : Infinity) && Date.parse(other.startedAt!) < (m.endDeclaredAt ? Date.parse(m.endDeclaredAt) : Infinity);
        requireRule(!overlaps || !lineup(candidate, other).some(p => ids.includes(p.playerId)) && other.courtId !== m.courtId, "HISTORICAL_OCCUPANCY_CONFLICT", "备份存在跨场在场区间冲突");
      }
    }
    return null;
  } catch (error) { return error instanceof Rejection ? error.detail : { code: "INVALID_BACKUP", message: "备份结构不完整或格式错误" }; }
}
