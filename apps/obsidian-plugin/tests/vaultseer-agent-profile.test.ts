import { describe, expect, it } from "vitest";
import {
  buildVaultseerAgentProfileReference,
  buildVaultseerAgentSystemMessage,
  DEFAULT_VAULTSEER_AGENT_PROFILE,
  listVaultseerAgentProfiles
} from "../src/vaultseer-agent-profile";

describe("vaultseer agent profiles", () => {
  it("builds a vault-native note agent profile on top of the vault-only guardrails", () => {
    const message = buildVaultseerAgentSystemMessage();

    expect(DEFAULT_VAULTSEER_AGENT_PROFILE.id).toBe("vaultseer-note-agent");
    expect(message).toContain("You are Vaultseer");
    expect(message).toContain("Treat the active note as the center of the conversation");
    expect(message).toContain("Allowed freely inside the vault");
    expect(message).toContain("Do not run scripts, commands, terminals, shells, binaries, or executables");
    expect(message).toContain("Active profile: Vaultseer Obsidian note agent");
    expect(message).toContain("Act like a native Obsidian note agent");
    expect(message).toContain("Stage active-note changes promptly");
    expect(message).toContain("Distinguish supported facts, inferred claims, unsupported claims, contradictions, and open questions");
  });

  it("lists available profiles without exposing mutable profile definitions", () => {
    const profiles = listVaultseerAgentProfiles();

    expect(profiles).toEqual([
      expect.objectContaining({
        id: "vaultseer-note-agent",
        title: "Vaultseer Obsidian note agent"
      })
    ]);

    profiles[0]!.instructions.push("mutated by test");

    expect(listVaultseerAgentProfiles()[0]!.instructions).not.toContain("mutated by test");
  });

  it("adds a compact profile reference only for maintenance-shaped requests", () => {
    const reference = buildVaultseerAgentProfileReference("review this note and suggest tags and related links");

    expect(reference).toContain("Vaultseer note-maintenance reference");
    expect(reference).toContain("Note types: concept, project, decision, source, manual, scratch, index");
    expect(reference).toContain("Stage one proposal per logical change");
    expect(reference).toContain("supported, inferred, unsupported, contradicted, or unclear");
    expect(buildVaultseerAgentProfileReference("hello, what are you?")).toBeNull();
  });
});
