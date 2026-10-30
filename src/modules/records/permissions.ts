import type { CompetitionCommand } from "../competition";
import type { Role } from "./protocol";

/** actorId must already come from the platform's trusted server context. */
export function roleForIdentity(actorId: string | null, operatorIds = "", adminIds = ""): Role {
  if (!actorId) return "guest";
  const listed = (value: string) => value.split(",").map(s => s.trim()).filter(Boolean).includes(actorId);
  if (listed(adminIds)) return "admin";
  return listed(operatorIds) ? "operator" : "participant";
}

// Shared command capability, checked again against trusted context on the server.
// Public collaboration and ordinary sign-in never grant match/round management.
export function canExecute(role: Role, type: CompetitionCommand["type"]): boolean {
  if (role === "admin" || role === "operator") return true;
  return (role === "guest" || role === "participant") && ["AssignPlayer", "ReplacePlayer", "MovePlayer", "RemovePlayer", "CancelDraft", "BeginResultEntry", "SubmitResult"].includes(type);
}
