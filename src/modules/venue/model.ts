import type { EventProjection, EventState, Gender, TeamId } from "../competition";
import type { ReactNode } from "react";
export type SelectionBasis = Pick<EventState, "revision" | "generation">;
export type Placement = { matchId: string; courtId: string; slotId: string; sideId: TeamId; gender: Gender | null; occupantId: string | null; allowed: boolean; reason: string | null };
export type PlayerSelection = { playerId: string; basis: SelectionBasis };
export type SlotSelection = { matchId: string; slotId: string; basis: SelectionBasis };
export type VenueIntent =
  | { type: "court"; courtId: string }
  | { type: "start"; matchId: string }
  | { type: "player"; playerId: string; dragging?: boolean }
  | { type: "slot"; matchId: string; slotId: string }
  | { type: "place"; playerId: string; matchId: string; slotId: string; basis: SelectionBasis }
  | { type: "bench"; playerId: string; basis: SelectionBasis }
  | { type: "scoreboard"; matchId: string };
export type VenueProps = {
  state: EventState; view: EventProjection; courtId: string | null;
  /** Local planning poses only; never used for court state or available actions. */
  arrangementView?: EventProjection;
  cameraRequest: { courtId: string | null; key: number };
  selection: PlayerSelection | null; slotSelection: SlotSelection | null;
  candidatePlayerIds?: string[];
  /** Pauses browser-local decoration only; never changes business state. */
  animationActive?: boolean;
  placements: Placement[]; onIntent: (intent: VenueIntent) => void;
  editable: boolean; canWrite: boolean; readOnly: boolean; canConfirm: boolean; canCorrect: boolean; editingMatchId?: string;
  pending?: { playerId?: string; playerIds?: string[]; matchId?: string; slotId?: string; unknown: boolean };
  editor?: { matchId: string; content: ReactNode };
};
