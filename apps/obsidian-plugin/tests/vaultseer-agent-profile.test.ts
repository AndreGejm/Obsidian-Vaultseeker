import { describe, expect, it } from "vitest";
import {
  buildVaultseerAgentProfileReference,
  buildVaultseerAgentSystemMessage,
  DEFAULT_VAULTSEER_AGENT_PROFILE,
  listVaultseerAgentProfiles
} from "../src/vaultseer-agent-profile";

describe("vaultseer agent profiles", () => {
  it("builds a lean technical-writer profile on top of the base Vaultseer guardrails", () => {
    const message = buildVaultseerAgentSystemMessage();

    expect(DEFAULT_VAULTSEER_AGENT_PROFILE.id).toBe("technical-writer");
    expect(message).toContain("You are Vaultseer");
    expect(message).toContain("Treat the active note as the center of the conversation");
    expect(message).toContain("Active profile: Technical writer and knowledge graph maintainer");
    expect(message).toContain("Classify the active note before proposing structural changes");
    expect(message).toContain("Prefer small, evidence-backed proposals");
    expect(message).toContain("Do not force a note template when a smaller structure is clearer");
    expect(message).toContain("Distinguish supported facts, inferred claims, unsupported claims, contradictions, and open questions");
  });

  it("lists available profiles without exposing mutable profile definitions", () => {
    const profiles = listVaultseerAgentProfiles();

    expect(profiles).toEqual([
      expect.objectContaining({
        id: "technical-writer",
        title: "Technical writer and knowledge graph maintainer"
      })
    ]);

    profiles[0]!.instructions.push("mutated by test");

    expect(listVaultseerAgentProfiles()[0]!.instructions).not.toContain("mutated by test");
  });

  it("adds a compact profile reference only for maintenance-shaped requests", () => {
    const reference = buildVaultseerAgentProfileReference("review this note and suggest tags and related links");

    expect(reference).toContain("Technical writer reference");
    expect(reference).toContain("Note types: concept, project, decision, source, manual, scratch, index");
    expect(reference).toContain("Stage one proposal per logical change");
    expect(reference).toContain("supported, inferred, unsupported, contradicted, or unclear");
    expect(buildVaultseerAgentProfileReference("hello, what are you?")).toBeNull();
  });
});
