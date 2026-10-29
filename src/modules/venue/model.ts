import type { EventProjection, EventState, Gender, TeamId } from "../competition";
export type SelectionBasis = Pick<EventState, "revision" | "generation">;
export type Placement = { matchId: string; courtId: string; slotId: string; sideId: TeamId; gender: Gender | null; occupantId: string | null; allowed: boolean; reason: string | null };
export type PlayerSelection = { playerId: string; basis: SelectionBasis };
export type SlotSelection = { matchId: string; slotId: string; basis: SelectionBasis };
export type VenueIntent =
  | { type: "court"; courtId: string }
  | { type: "player"; playerId: string; dragging?: boolean }
  | { type: "slot"; matchId: string; slotId: string }
  | { type: "place"; playerId: string; matchId: string; slotId: string; basis: SelectionBasis }
  | { type: "scoreboard"; matchId: string };
export type VenueProps = {
  state: EventState; view: EventProjection; courtId: string | null;
  selection: PlayerSelection | null; slotSelection: SlotSelection | null;
  placements: Placement[]; onIntent: (intent: VenueIntent) => void;
  editable: boolean; editingMatchId?: string;
};
