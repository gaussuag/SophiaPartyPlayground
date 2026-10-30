import { describe, expect, it } from "vitest";
import { canExecute, roleForIdentity } from "../../src/modules/records/permissions";

describe("participation and management identity", () => {
  it("keeps anonymous collaborators separate from signed-in participants and explicitly listed managers", () => {
    expect(roleForIdentity(null, "owner", "owner")).toBe("guest");
    expect(roleForIdentity("someone-else", "owner", "owner")).toBe("participant");
    expect(roleForIdentity("owner", "owner", "owner")).toBe("admin");
    expect(roleForIdentity("operator", " operator ", "owner")).toBe("operator");
    expect(roleForIdentity("own", "owner", "owner")).toBe("participant");
    expect(roleForIdentity("member", "", "")).toBe("participant");
  });
  it("does not confuse signed-in participation with confirmation or correction authority", () => {
    const member = roleForIdentity("member", "owner", "owner");
    expect(canExecute(member, "MovePlayer")).toBe(true);
    expect(canExecute(member, "SubmitResult")).toBe(true);
    expect(canExecute("guest", "MovePlayer")).toBe(true);
    expect(canExecute("guest", "SubmitResult")).toBe(true);
    expect(canExecute("guest", "StartMatch")).toBe(false);
    expect(canExecute("guest", "AdvanceRound")).toBe(false);
    expect(canExecute("guest", "CorrectResult")).toBe(false);
    for (const command of ["StartMatch", "AdvanceRound", "CorrectResult", "CorrectRecordedLineup", "UndoStart", "WithdrawCurrentResult"] as const) expect(canExecute(member, command)).toBe(false);
    expect(canExecute("viewer", "AssignPlayer")).toBe(false);
    expect(canExecute("viewer", "SubmitResult")).toBe(false);
  });
});
