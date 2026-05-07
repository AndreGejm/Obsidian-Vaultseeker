import { describe, expect, it } from "vitest";
import { shouldRefreshIndexAfterAcceptedWrite } from "../src/write-review-followup";

describe("shouldRefreshIndexAfterAcceptedWrite", () => {
  it("refreshes the index after an accepted write changes the active note", () => {
    expect(
      shouldRefreshIndexAfterAcceptedWrite({
        status: "applied",
        targetPath: "Electronics/Ohm's law.md",
        activePath: "Electronics/Ohm's law.md"
      })
    ).toBe(true);
  });

  it("does not refresh when the apply failed or targeted a different note", () => {
    expect(
      shouldRefreshIndexAfterAcceptedWrite({
        status: "failed",
        targetPath: "Electronics/Ohm's law.md",
        activePath: "Electronics/Ohm's law.md"
      })
    ).toBe(false);
    expect(
      shouldRefreshIndexAfterAcceptedWrite({
        status: "applied",
        targetPath: "Electronics/Ohm's law.md",
        activePath: "Electronics/Resistor Types.md"
      })
    ).toBe(false);
  });
});
