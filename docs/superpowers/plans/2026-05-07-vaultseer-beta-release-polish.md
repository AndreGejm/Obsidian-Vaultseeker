# Vaultseer Beta Release Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vaultseer ready for a private Obsidian beta by tightening the active-note workflow, provider diagnostics, semantic degradation, release metadata, documentation, and maintainability without adding broad new feature scope.

**Architecture:** Keep Vaultseer current-note-first: Obsidian remains the editor, Studio chat is the control surface, indexes are rebuildable, and active-note writes use visible redline proposals. Prefer small view/state helpers and explicit status messages over new framework layers.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Obsidian plugin API, esbuild, `@vaultseer/core`, local plugin install into `F:\Dev\Obsidian\.obsidian\plugins\vaultseer`.

---

## Release Target

This plan targets **private beta / local technical preview**, not public Obsidian community release.

Release name:

```text
0.1.0-local
```

Private beta means:

- the plugin can be installed and reloaded in the user vault
- active-note note creation and rewrite flows are pleasant enough to use
- errors are visible and recoverable
- heavy or external features are clearly labeled
- the current state is committed and reproducible

Private beta does not mean:

- public packaging is complete
- all source formats are supported
- native Codex bridge is guaranteed across machines
- source extraction is safe for untrusted PDFs at public-release level

---

## Current Evidence

- `apps/obsidian-plugin/manifest.json` still reports version `0.0.0`.
- `apps/obsidian-plugin/package.json` and root `package.json` still report version `0.0.0`.
- `README.md` says link suggestions are preview-only and some write paths remain limited.
- `docs/roadmap.md` marks semantic indexing, source intake, suggestions, guarded writes, and native chat as started or in progress.
- The current branch has many modified and untracked files. A release baseline must be committed before beta use.
- Recent full verification passed:
  - core tests: `134 passed`
  - Obsidian plugin tests: `497 passed`
  - plugin typecheck: passed
  - plugin build: passed

---

## Task 1: Commit-Safe Baseline And Release Version

**Files:**

- Modify: `package.json`
- Modify: `apps/obsidian-plugin/package.json`
- Modify: `apps/obsidian-plugin/manifest.json`
- Modify: `apps/obsidian-plugin/tests/manifest-release-contract.test.ts`

**Reason:** The installed plugin must identify itself as a real local beta and not an unversioned development build.

- [ ] **Step 1: Write failing manifest/package version test**

Add this test to `apps/obsidian-plugin/tests/manifest-release-contract.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Obsidian manifest release contract", () => {
  it("marks Vaultseer as desktop-only because native Codex and source extraction use Node APIs", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
      isDesktopOnly?: unknown;
    };

    expect(manifest.isDesktopOnly).toBe(true);
  });

  it("uses the same private beta version in manifest and package metadata", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    const pluginPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    const rootPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };

    expect(manifest.version).toBe("0.1.0-local");
    expect(pluginPackage.version).toBe("0.1.0-local");
    expect(rootPackage.version).toBe("0.1.0-local");
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/manifest-release-contract.test.ts
```

Expected:

```text
FAIL tests/manifest-release-contract.test.ts
expected '0.0.0' to be '0.1.0-local'
```

- [ ] **Step 3: Update version metadata**

Set these exact values:

```json
{
  "version": "0.1.0-local"
}
```

Files to update:

- `package.json`
- `apps/obsidian-plugin/package.json`
- `apps/obsidian-plugin/manifest.json`

Do not change `id`, `name`, or `isDesktopOnly`.

- [ ] **Step 4: Verify version test passes**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/manifest-release-contract.test.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add package.json apps/obsidian-plugin/package.json apps/obsidian-plugin/manifest.json apps/obsidian-plugin/tests/manifest-release-contract.test.ts
git commit -m "chore: mark Vaultseer private beta version"
```

Risk level: Low.

Manual check: Obsidian Community Plugins page should show Vaultseer version `0.1.0-local` after reinstall/reload.

---

## Task 2: Provider State Clarity And Semantic Failure Cleanup

**Files:**

- Modify: `apps/obsidian-plugin/src/codex-runtime-state.ts`
- Modify: `apps/obsidian-plugin/src/studio-status-strip.ts`
- Modify: `apps/obsidian-plugin/src/semantic-search-controller.ts`
- Modify: `apps/obsidian-plugin/src/source-semantic-search-controller.ts`
- Modify: `apps/obsidian-plugin/src/codex-read-only-tool-implementations.ts`
- Test: `apps/obsidian-plugin/tests/codex-runtime-state.test.ts`
- Test: `apps/obsidian-plugin/tests/studio-status-strip.test.ts`
- Test: `apps/obsidian-plugin/tests/semantic-search-controller.test.ts`
- Test: `apps/obsidian-plugin/tests/source-semantic-search-controller.test.ts`
- Test: `apps/obsidian-plugin/tests/codex-read-only-tool-implementations.test.ts`

**Reason:** The user should not see raw `Failed to fetch` noise in normal note work. Provider status should be obvious: connected, disabled, missing key, quota error, local embedding unavailable, or bridge timeout.

- [ ] **Step 1: Add failing runtime label tests**

Add cases to `apps/obsidian-plugin/tests/codex-runtime-state.test.ts`:

```ts
it("labels OpenAI quota failures as provider quota issues", () => {
  expect(formatCodexRuntimeFailure("OpenAI Responses API request failed with status 429")).toBe(
    "OpenAI quota or billing is not available."
  );
});

it("labels native bridge timeouts as bridge startup timeouts", () => {
  expect(formatCodexRuntimeFailure("Native Codex startup timed out after 120000ms.")).toBe(
    "Native Codex bridge timed out while starting."
  );
});
```

If `formatCodexRuntimeFailure` does not exist yet, create the test around the nearest existing status/label function and name the new helper in the implementation step.

- [ ] **Step 2: Verify runtime label tests fail**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/codex-runtime-state.test.ts
```

Expected:

```text
FAIL
formatCodexRuntimeFailure is not defined
```

- [ ] **Step 3: Implement the smallest provider failure helper**

Add to `apps/obsidian-plugin/src/codex-runtime-state.ts`:

```ts
export function formatCodexRuntimeFailure(message: string): string {
  if (message.includes("status 429") || message.includes("insufficient_quota")) {
    return "OpenAI quota or billing is not available.";
  }
  if (message.includes("startup timed out") || message.includes("timed out while starting")) {
    return "Native Codex bridge timed out while starting.";
  }
  if (message.includes("API key")) {
    return "OpenAI API key is missing or invalid.";
  }
  return "Codex provider is unavailable.";
}
```

Wire this helper only where user-facing Studio status or assistant fallback text is currently formed. Do not expose raw provider responses in assistant-visible chat unless the user opens diagnostics.

- [ ] **Step 4: Add failing semantic degradation test**

Add to `apps/obsidian-plugin/tests/codex-read-only-tool-implementations.test.ts`:

```ts
it("does not include raw semantic fetch errors in note search output", async () => {
  const result = formatSearchToolResult({
    lexicalResults: [],
    semanticError: new Error("Failed to fetch")
  });

  expect(result).toContain("No results found.");
  expect(result).toContain("Semantic search is unavailable.");
  expect(result).not.toContain("Failed to fetch");
});
```

If `formatSearchToolResult` does not exist, extract the current formatting logic from the search tool implementation into that exact helper.

- [ ] **Step 5: Verify semantic degradation test fails**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/codex-read-only-tool-implementations.test.ts
```

Expected:

```text
FAIL
expected output not to contain Failed to fetch
```

- [ ] **Step 6: Implement clean semantic degradation message**

Format semantic failure as:

```text
Semantic search is unavailable. Lexical search still works.
```

Do not include raw `fetch`, endpoint, API key, or stack details in chat output. Keep raw details only in local diagnostics if such a surface already exists.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/codex-runtime-state.test.ts tests/studio-status-strip.test.ts tests/codex-read-only-tool-implementations.test.ts tests/semantic-search-controller.test.ts tests/source-semantic-search-controller.test.ts
```

Expected:

```text
passed
```

Risk level: Medium. This touches user-facing failure text and search tool output.

Manual check: In Obsidian with Ollama/semantic endpoint off, searching from chat should say lexical search still works and semantic search is unavailable, without raw browser fetch errors.

---

## Task 3: Active-Note Write Flow Becomes One Clear Path

**Files:**

- Modify: `apps/obsidian-plugin/src/studio-note-proposal-cards.ts`
- Modify: `apps/obsidian-plugin/src/studio-note-proposal-card-view.ts`
- Modify: `apps/obsidian-plugin/src/write-apply-controller.ts`
- Modify: `apps/obsidian-plugin/src/write-review-queue-controller.ts`
- Modify: `apps/obsidian-plugin/src/write-review-queue-state.ts`
- Modify: `apps/obsidian-plugin/src/write-review-queue-modal.ts`
- Test: `apps/obsidian-plugin/tests/studio-note-proposal-cards.test.ts`
- Test: `apps/obsidian-plugin/tests/studio-note-proposal-card-view.test.ts`
- Test: `apps/obsidian-plugin/tests/write-apply-controller.test.ts`
- Test: `apps/obsidian-plugin/tests/write-review-queue-state.test.ts`
- Test: `apps/obsidian-plugin/tests/write-review-queue-controller.test.ts`

**Reason:** For the active note, accepting a redline should write the note and remove the proposal from the immediate chat/review surface. The current flow has felt too cautious and confusing.

- [ ] **Step 1: Add failing card behavior test**

Add to `apps/obsidian-plugin/tests/studio-note-proposal-cards.test.ts`:

```ts
it("labels active-note rewrites as direct write actions", () => {
  const operation = rewriteOperationFor("Electronics/Ohm's law.md");

  const state = buildStudioNoteProposalCards({
    activePath: "Electronics/Ohm's law.md",
    writeOperations: [operation],
    decisions: [],
    applyResults: []
  });

  expect(state.cards[0]?.title).toBe("Rewrite note");
  expect(state.cards[0]?.controls.map((control) => control.label)).toEqual([
    "Write to note",
    "Edit draft",
    "Later",
    "Discard"
  ]);
});
```

Use the existing `rewriteOperation` test helper if present. If not present, create:

```ts
function rewriteOperationFor(targetPath: string): GuardedVaultWriteOperation {
  return {
    ...planNoteContentRewriteOperation({
      targetPath,
      currentContent: "# Ohm's law\n\nOld text.\n",
      proposedContent: "# Ohm's law\n\n## Summary\n\nClearer text.\n",
      reason: "Improve readability.",
      suggestionIds: ["suggestion:rewrite"],
      createdAt: "2026-05-07T10:00:00.000Z"
    }),
    id: "write-active-rewrite"
  };
}
```

- [ ] **Step 2: Verify card test fails only if behavior regressed**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/studio-note-proposal-cards.test.ts
```

Expected:

```text
FAIL
```

If it already passes, keep the test and proceed to apply-flow tests.

- [ ] **Step 3: Add failing apply-removal test**

Add to `apps/obsidian-plugin/tests/write-review-queue-state.test.ts`:

```ts
it("removes applied active-note proposals from pending review state", () => {
  const operation = rewriteOperationFor("Electronics/Ohm's law.md");
  const state = buildWriteReviewQueueState({
    activePath: "Electronics/Ohm's law.md",
    operations: [operation],
    decisions: [
      createVaultWriteDecisionRecord({
        operation,
        decision: "approved",
        decidedAt: "2026-05-07T10:05:00.000Z"
      })
    ],
    applyResults: [
      {
        operationId: operation.id,
        status: "applied",
        targetPath: operation.targetPath,
        beforeHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        appliedAt: "2026-05-07T10:06:00.000Z"
      }
    ],
    includeCompleted: false
  });

  expect(state.pendingCards).toEqual([]);
  expect(state.completedCount).toBe(1);
});
```

Adjust property names to existing state names, but preserve the behavior: applied active-note proposals must not remain in the primary pending list.

- [ ] **Step 4: Verify apply-removal test fails**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/write-review-queue-state.test.ts
```

Expected:

```text
FAIL
```

- [ ] **Step 5: Implement state filtering**

In `apps/obsidian-plugin/src/write-review-queue-state.ts`, ensure the primary queue excludes operations with latest apply result `status === "applied"` unless `includeCompleted === true`.

Use explicit local logic:

```ts
const latestApplyByOperationId = new Map(applyResults.map((result) => [result.operationId, result]));

function isCompleted(operation: GuardedVaultWriteOperation): boolean {
  return latestApplyByOperationId.get(operation.id)?.status === "applied";
}
```

Do not add a generic lifecycle registry.

- [ ] **Step 6: Implement one-click active-note write through existing controller**

In `apps/obsidian-plugin/src/write-apply-controller.ts`, preserve these invariants:

```text
1. Target path must equal the active note path for inline active-note writes.
2. The redline must be visible before the button is pressed.
3. The write must use the existing VaultWritePort.
4. The result must be recorded.
5. Applied proposal must disappear from active pending UI.
```

If the current file hash changed:

```text
Show: "This note changed since the draft was made. Refresh the draft before writing."
```

Do not implement force-write in this task.

- [ ] **Step 7: Verify focused write tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/studio-note-proposal-cards.test.ts tests/studio-note-proposal-card-view.test.ts tests/write-apply-controller.test.ts tests/write-review-queue-state.test.ts tests/write-review-queue-controller.test.ts
```

Expected:

```text
passed
```

Risk level: High for UX, medium for data safety. The write path is the heart of beta.

Manual check: Ask chat to rewrite the active note, inspect diff, press `Write to note`, confirm the Markdown file changes immediately and the proposal card disappears from chat.

---

## Task 4: Edit Draft Flow Must Be Obvious And Local

**Files:**

- Modify: `apps/obsidian-plugin/src/write-operation-edit.ts`
- Modify: `apps/obsidian-plugin/src/write-proposal-edit-modal.ts`
- Modify: `apps/obsidian-plugin/src/studio-note-proposal-card-view.ts`
- Test: `apps/obsidian-plugin/tests/write-operation-edit.test.ts`
- Test: `apps/obsidian-plugin/tests/studio-note-proposal-card-view.test.ts`

**Reason:** The user wants to tweak AI output before writing. Editing should feel like editing a draft, not entering a separate review system.

- [ ] **Step 1: Add failing edit-preserves-target test**

Add to `apps/obsidian-plugin/tests/write-operation-edit.test.ts`:

```ts
it("edits only the proposed Markdown while preserving the active note target and original hash", () => {
  const operation = rewriteOperationFor("Electronics/Resistor Types.md");
  const edited = updateRewriteOperationDraft(operation, "# Resistor Types\n\n## Better Summary\n\nEdited text.\n");

  expect(edited.targetPath).toBe(operation.targetPath);
  expect(edited.expectedCurrentHash).toBe(operation.expectedCurrentHash);
  expect(edited.preview.afterContent).toContain("## Better Summary");
  expect(edited.preview.afterContent).not.toContain("Old text");
});
```

- [ ] **Step 2: Verify edit test fails if helper is missing**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/write-operation-edit.test.ts
```

Expected:

```text
FAIL
updateRewriteOperationDraft is not defined
```

- [ ] **Step 3: Implement explicit draft edit helper**

In `apps/obsidian-plugin/src/write-operation-edit.ts`, implement:

```ts
export function updateRewriteOperationDraft(
  operation: GuardedVaultWriteOperation,
  nextMarkdown: string
): GuardedVaultWriteOperation {
  if (operation.kind !== "rewrite_note_content") {
    throw new Error("Only note rewrite drafts can be edited.");
  }

  return planNoteContentRewriteOperation({
    targetPath: operation.targetPath,
    currentContent: operation.preview.beforeContent,
    proposedContent: nextMarkdown,
    reason: operation.reason,
    suggestionIds: operation.suggestionIds,
    createdAt: operation.createdAt
  });
}
```

Then preserve `operation.id` if existing tests require stable IDs:

```ts
return {
  ...nextOperation,
  id: operation.id
};
```

- [ ] **Step 4: Make edit modal copy clear**

In `apps/obsidian-plugin/src/write-proposal-edit-modal.ts`, use these visible labels:

```text
Edit draft
This edits the proposed Markdown only. Your note is not changed until you press Write to note.
Save draft
Cancel
```

- [ ] **Step 5: Verify edit flow tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/write-operation-edit.test.ts tests/studio-note-proposal-card-view.test.ts
```

Expected:

```text
passed
```

Risk level: Medium. Keeps editing local to proposed content.

Manual check: Open a rewrite proposal, press `Edit draft`, change Markdown, save, confirm the redline updates before writing.

---

## Task 5: Right-Click Selection Actions Become Beta-Quality

**Files:**

- Modify: `apps/obsidian-plugin/src/selected-note-agent-action.ts`
- Modify: `apps/obsidian-plugin/src/register-vaultseer-commands.ts`
- Modify: `apps/obsidian-plugin/src/studio-view.ts`
- Test: `apps/obsidian-plugin/tests/selected-note-agent-action.test.ts`
- Test: `apps/obsidian-plugin/tests/register-vaultseer-commands.test.ts`

**Reason:** The fastest user workflow should be: select text, right-click, choose rewrite or fact check, let Vaultseer open Studio with the correct context.

- [ ] **Step 1: Add failing rewrite action packet test**

Add to `apps/obsidian-plugin/tests/selected-note-agent-action.test.ts`:

```ts
it("builds a rewrite request from selected active-note text", () => {
  const request = buildSelectedTextAgentRequest({
    action: "suggest-rewrite",
    activePath: "Electronics/Ohm's law.md",
    selectedText: "V=IR is a law.",
    noteTitle: "Ohm's law"
  });

  expect(request.userMessage).toContain("Suggest rewrite for selected text");
  expect(request.userMessage).toContain("Electronics/Ohm's law.md");
  expect(request.context.selectedText).toBe("V=IR is a law.");
  expect(request.requiresWeb).toBe(false);
});
```

- [ ] **Step 2: Add failing fact-check action packet test**

Add:

```ts
it("builds a user-initiated web-first fact-check request from selected text", () => {
  const request = buildSelectedTextAgentRequest({
    action: "fact-check",
    activePath: "Electronics/Ohm's law.md",
    selectedText: "Copper resistance always decreases with temperature.",
    noteTitle: "Ohm's law"
  });

  expect(request.userMessage).toContain("Fact check selected text");
  expect(request.userMessage).toContain("Use web research first");
  expect(request.context.selectedText).toContain("Copper resistance");
  expect(request.requiresWeb).toBe(true);
});
```

- [ ] **Step 3: Verify selection tests fail**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/selected-note-agent-action.test.ts
```

Expected:

```text
FAIL
```

- [ ] **Step 4: Implement selected action request builder**

In `apps/obsidian-plugin/src/selected-note-agent-action.ts`, expose:

```ts
export type SelectedTextAgentAction = "suggest-rewrite" | "fact-check";

export interface SelectedTextAgentRequest {
  userMessage: string;
  context: {
    activePath: string;
    noteTitle: string;
    selectedText: string;
  };
  requiresWeb: boolean;
}
```

Use plain prompts:

```ts
const actionText =
  input.action === "suggest-rewrite"
    ? "Suggest rewrite for selected text"
    : "Fact check selected text. Use web research first, then use the active note as context.";
```

- [ ] **Step 5: Ensure context menu labels are human**

Command labels:

```text
Vaultseer: Suggest rewrite for selection
Vaultseer: Fact check selection
```

Context menu labels:

```text
Suggest rewrite
Fact check
```

- [ ] **Step 6: Verify context-menu tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/selected-note-agent-action.test.ts tests/register-vaultseer-commands.test.ts
```

Expected:

```text
passed
```

Risk level: Medium. This improves entry flow without adding background automation.

Manual check: Select text in an active note, right-click, choose both options. Studio should open with the selected text request already sent or staged into the composer.

---

## Task 6: Marker And Source Intake Beta Guardrails

**Files:**

- Modify: `apps/obsidian-plugin/src/marker-source-extractor.ts`
- Modify: `apps/obsidian-plugin/src/source-extraction-controller.ts`
- Modify: `apps/obsidian-plugin/src/plugin-settings-tab.ts`
- Modify: `docs/go-live-smoke-checklist.md`
- Test: `apps/obsidian-plugin/tests/marker-source-extractor.test.ts`
- Test: `apps/obsidian-plugin/tests/source-extraction-controller.test.ts`

**Reason:** PDF extraction is useful but risky. For beta, it needs clear setup diagnostics, bounded execution, and friendly failure messages.

- [ ] **Step 1: Add failing Marker timeout test**

Add to `apps/obsidian-plugin/tests/marker-source-extractor.test.ts`:

```ts
it("returns a recoverable diagnostic when marker execution times out", async () => {
  const extractor = createMarkerSourceExtractor({
    markerCommand: "marker_single",
    timeoutMs: 1,
    runProcess: async () => new Promise(() => undefined)
  });

  const result = await extractor.extract(pdfFixture("datasheet.pdf"));

  expect(result.status).toBe("failed");
  expect(result.diagnostics[0]?.message).toBe("Marker extraction timed out.");
  expect(result.diagnostics[0]?.recoverable).toBe(true);
});
```

- [ ] **Step 2: Add failing missing-Marker setup test**

Add:

```ts
it("explains when marker_single is missing", async () => {
  const extractor = createMarkerSourceExtractor({
    markerCommand: "marker_single",
    timeoutMs: 30000,
    runProcess: async () => {
      throw new Error("ENOENT");
    }
  });

  const result = await extractor.extract(pdfFixture("datasheet.pdf"));

  expect(result.status).toBe("failed");
  expect(result.diagnostics[0]?.message).toBe("Marker is not available. Install marker_single and check Vaultseer settings.");
});
```

- [ ] **Step 3: Verify Marker tests fail**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/marker-source-extractor.test.ts
```

Expected:

```text
FAIL
```

- [ ] **Step 4: Implement timeout and missing-command diagnostics**

Keep this logic local to `marker-source-extractor.ts`. Do not create a generic process framework.

Messages:

```text
Marker extraction timed out.
Marker is not available. Install marker_single and check Vaultseer settings.
Marker extraction failed. See source extraction diagnostics.
```

- [ ] **Step 5: Add settings copy**

In `apps/obsidian-plugin/src/plugin-settings-tab.ts`, add visible help text near Marker settings:

```text
Marker runs as a local external tool for PDF extraction. Use it only for documents you trust. Vaultseer stores extracted source workspaces locally before any note is written.
```

- [ ] **Step 6: Verify source extraction tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/marker-source-extractor.test.ts tests/source-extraction-controller.test.ts
```

Expected:

```text
passed
```

Risk level: Medium. This touches external process error handling, not extraction quality.

Manual check: With Marker unavailable, `Run one PDF source extraction batch` should show a clear missing-Marker diagnostic. With Marker available, one small PDF should extract and be searchable.

---

## Task 7: Maintainability Pass On Studio View Boundaries

**Files:**

- Modify: `apps/obsidian-plugin/src/studio-view.ts`
- Create: `apps/obsidian-plugin/src/studio-chat-panel-view.ts`
- Create: `apps/obsidian-plugin/src/studio-command-panel-view.ts`
- Test: `apps/obsidian-plugin/tests/studio-codex-chat-composition.test.ts`
- Test: `apps/obsidian-plugin/tests/studio-command-catalog.test.ts`
- Test: `apps/obsidian-plugin/tests/studio-chat-shell-state.test.ts`

**Reason:** Studio is becoming the main app surface. Keep `studio-view.ts` from becoming a god module by moving rendering chunks, not business logic, into small files.

- [ ] **Step 1: Record current behavior with focused tests**

Run current tests before moving code:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/studio-codex-chat-composition.test.ts tests/studio-command-catalog.test.ts tests/studio-chat-shell-state.test.ts
```

Expected:

```text
passed
```

- [ ] **Step 2: Extract chat panel renderer without changing behavior**

Create `apps/obsidian-plugin/src/studio-chat-panel-view.ts`:

```ts
import type { StudioChatShellState } from "./studio-chat-shell-state";

export interface StudioChatPanelInput {
  shellState: StudioChatShellState;
  onSend: (message: string) => Promise<void>;
  onReset: () => Promise<void>;
}

export function renderStudioChatPanel(containerEl: HTMLElement, input: StudioChatPanelInput): void {
  // Move existing chat composer/message rendering from studio-view.ts here unchanged.
}
```

Move only UI rendering. Do not move provider, tool dispatch, write application, or index logic into this file.

- [ ] **Step 3: Extract command panel renderer without changing behavior**

Create `apps/obsidian-plugin/src/studio-command-panel-view.ts`:

```ts
import type { StudioCommandCatalogItem } from "./studio-command-catalog";

export interface StudioCommandPanelInput {
  commands: StudioCommandCatalogItem[];
  onCommand: (commandId: string) => Promise<void>;
}

export function renderStudioCommandPanel(containerEl: HTMLElement, input: StudioCommandPanelInput): void {
  // Move existing Commands button/menu rendering from studio-view.ts here unchanged.
}
```

- [ ] **Step 4: Keep `studio-view.ts` as coordinator only**

After extraction, `studio-view.ts` should still own:

```text
Obsidian ItemView lifecycle
event registration
calling render helpers
passing callbacks to controllers
```

It should not own:

```text
large chat DOM construction
large command DOM construction
formatting provider failure messages
write operation state calculation
```

- [ ] **Step 5: Verify no behavior changed**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin exec vitest run tests/studio-codex-chat-composition.test.ts tests/studio-command-catalog.test.ts tests/studio-chat-shell-state.test.ts
corepack pnpm --filter @vaultseer/obsidian-plugin typecheck
```

Expected:

```text
passed
```

Risk level: Medium. This is structural but should be behavior-preserving.

Manual check: Open Studio, send a chat message, open Commands, run `show-index-health`.

---

## Task 8: Beta Documentation And Smoke Checklist

**Files:**

- Modify: `README.md`
- Modify: `docs/go-live-smoke-checklist.md`
- Create: `docs/private-beta.md`
- Modify: `docs/roadmap.md`

**Reason:** The user needs a clear way to install, test, and understand the private beta without reading source code.

- [ ] **Step 1: Create private beta document**

Create `docs/private-beta.md` with this structure:

```markdown
# Vaultseer Private Beta

## What This Beta Is

Vaultseer is an Obsidian helper for active-note drafting, searching, source intake, tags, links, and reviewable note changes.

## What Works

- active-note chat
- read-only index rebuild and search
- chunk inspection
- selected-text rewrite request
- selected-text fact-check request
- active-note rewrite proposals with redline preview
- draft editing before writing
- writing approved active-note proposals
- PDF source extraction when Marker is installed

## What Is Limited

- semantic search needs a configured local embedding endpoint
- OpenAI direct mode needs API billing
- native Codex bridge may time out if local Codex ACP is not healthy
- link insertion is not fully automatic
- source image/table preview is still basic

## Safe Use Guidance

Use this beta on a git-backed vault. Review redlines before writing. Keep source extraction to documents you trust.

## First Run

1. Install or copy the plugin into `.obsidian/plugins/vaultseer`.
2. Reload Obsidian.
3. Enable Vaultseer.
4. Open `Vaultseer: Open native Studio`.
5. Run `Rebuild read-only vault index`.
6. Open a note and ask Vaultseer to review it.

## Provider Modes

OpenAI mode uses the OpenAI API and may send selected note context to OpenAI. Native bridge mode uses a local Codex ACP process and may fail if that process cannot start.

## PDF Extraction

Marker is used for high-fidelity PDF extraction. It runs locally as an external tool.
```

- [ ] **Step 2: Update README beta section**

Add near the top of `README.md`:

```markdown
## Private Beta Status

Vaultseer is currently a private local beta. It is intended for a git-backed personal vault and is not ready for public Obsidian community release.

See [Private Beta](docs/private-beta.md) and [Limited Go-Live Smoke Checklist](docs/go-live-smoke-checklist.md).
```

- [ ] **Step 3: Add smoke checklist**

Ensure `docs/go-live-smoke-checklist.md` contains these checks:

```markdown
## Private Beta Smoke Test

- [ ] Plugin loads in Obsidian without console errors.
- [ ] Studio opens.
- [ ] Index rebuild completes.
- [ ] Search returns a known note.
- [ ] Chat can inspect the active note.
- [ ] Chat can draft a rewrite proposal.
- [ ] Redline diff is visible.
- [ ] Edit draft opens and saves changed proposed Markdown.
- [ ] Write to note updates the active Markdown file.
- [ ] Completed proposal disappears from chat.
- [ ] Completed proposal is visible only in review/history.
- [ ] Selected-text Suggest rewrite opens Studio with selected text context.
- [ ] Selected-text Fact check opens Studio with web-first wording.
- [ ] Semantic provider disabled or unavailable shows clean degradation.
- [ ] Marker missing shows clean setup diagnostic, or Marker installed extracts one small PDF.
```

- [ ] **Step 4: Update roadmap status**

In `docs/roadmap.md`, add a `Private Beta Hardening` subsection near Phase 6.5:

```markdown
## Private Beta Hardening

Status: planned.

Goal: make the current active-note-first Studio flow reliable and pleasant enough for a git-backed personal vault.
```

- [ ] **Step 5: Verify docs have no stale `0.0.0` release claim**

Run:

```powershell
Select-String -Path README.md,docs\*.md,apps\obsidian-plugin\manifest.json,package.json,apps\obsidian-plugin\package.json -Pattern '0.0.0'
```

Expected:

```text
no output
```

Risk level: Low.

Manual check: A non-programmer should be able to read `docs/private-beta.md` and know how to start.

---

## Task 9: Full Verification And Local Install

**Files:**

- No source files unless verification exposes defects.
- Install target: `F:\Dev\Obsidian\.obsidian\plugins\vaultseer`

**Reason:** A beta is only useful if the installed Obsidian copy matches the verified build.

- [ ] **Step 1: Run full core tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test
```

Expected:

```text
Test Files 29 passed
Tests 134 passed
```

- [ ] **Step 2: Run full plugin tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test
```

Expected:

```text
Test Files 71 passed
Tests 497 passed
```

The exact test count may increase as earlier tasks add tests. Any increase is fine; failures are not.

- [ ] **Step 3: Run plugin typecheck**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin typecheck
```

Expected:

```text
exit code 0
```

- [ ] **Step 4: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected:

```text
exit code 0
```

Line-ending warnings are acceptable. Whitespace errors are not.

- [ ] **Step 5: Build plugin**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin build
```

Expected:

```text
dist\main.js
Done
```

- [ ] **Step 6: Install plugin to Obsidian vault**

Run:

```powershell
$source = 'F:\Dev\scripts\Mimir\obsidian-vaultseer\.worktrees\vaultseer-native-studio\apps\obsidian-plugin'
$target = 'F:\Dev\Obsidian\.obsidian\plugins\vaultseer'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'dist\main.js') -Destination (Join-Path $target 'main.js') -Force
Copy-Item -LiteralPath (Join-Path $source 'manifest.json') -Destination (Join-Path $target 'manifest.json') -Force
Copy-Item -LiteralPath (Join-Path $source 'styles.css') -Destination (Join-Path $target 'styles.css') -Force
Get-Item -LiteralPath (Join-Path $target 'main.js') | Select-Object FullName,Length,LastWriteTime
```

Expected:

```text
FullName                                             Length LastWriteTime
F:\Dev\Obsidian\.obsidian\plugins\vaultseer\main.js <nonzero> <current time>
```

Risk level: Low.

Manual check: Reload Obsidian and confirm Vaultseer opens.

---

## Task 10: Manual Obsidian Beta Acceptance Script

**Files:**

- Modify only if defects are found during the manual script.

**Reason:** The important failures have been in real Obsidian workflow, not just pure tests.

- [ ] **Step 1: Reload plugin**

In Obsidian:

```text
Settings -> Community Plugins -> Vaultseer -> Disable -> Enable
```

Expected:

```text
Vaultseer loads with no visible startup error.
```

- [ ] **Step 2: Open Studio**

Run command:

```text
Vaultseer: Open native Studio
```

Expected:

```text
Studio opens and shows current active note.
```

- [ ] **Step 3: Rebuild index**

In Studio chat or Commands:

```text
/rebuild-index
```

Press `Run`.

Expected:

```text
Index status becomes Ready.
Note and chunk counts are nonzero for a non-empty vault.
```

- [ ] **Step 4: Ask active-note rewrite**

Open a test note and send:

```text
review this note and make it clearer, better structured, and easier to read
```

Expected:

```text
Vaultseer inspects active note, drafts a proposal, and shows a redline.
```

- [ ] **Step 5: Edit draft**

Press:

```text
Edit draft
```

Change one heading and save.

Expected:

```text
Redline updates to show the edited heading.
```

- [ ] **Step 6: Write note**

Press:

```text
Write to note
```

Expected:

```text
The active Markdown note changes.
The proposal disappears from chat.
Completed history remains available in Review/history, not chat.
```

- [ ] **Step 7: Test selected text rewrite**

Select a paragraph in an active note, right-click:

```text
Suggest rewrite
```

Expected:

```text
Studio opens or focuses and the request includes the selected text.
```

- [ ] **Step 8: Test selected text fact check**

Select a factual claim, right-click:

```text
Fact check
```

Expected:

```text
Studio opens or focuses and the prompt says web research is user initiated and web-first.
```

- [ ] **Step 9: Test semantic unavailable state**

Disable semantic endpoint or leave it unavailable. Search:

```text
resistor
```

Expected:

```text
Lexical results still appear.
Message says semantic search is unavailable.
No raw Failed to fetch text appears in assistant response.
```

- [ ] **Step 10: Test provider failure state**

Use the configured provider mode with an intentionally unavailable provider.

Expected:

```text
OpenAI quota/missing key/native bridge timeout is labeled clearly.
No secret value appears in UI.
```

Risk level: Medium because this is where real plugin integration problems appear.

Acceptance: All steps pass or defects are logged with exact reproduction notes before release.

---

## Task 11: Release Commit And Tag

**Files:**

- All files changed by this plan.

**Reason:** The beta baseline must be recoverable.

- [ ] **Step 1: Inspect status**

Run:

```powershell
git status --short
```

Expected:

```text
modified and untracked files are only expected Vaultseer beta files
```

- [ ] **Step 2: Review diff summary**

Run:

```powershell
git diff --stat
```

Expected:

```text
diff only includes release polishing, docs, tests, and targeted Studio/provider/source files
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add apps packages docs README.md package.json
git commit -m "chore: prepare Vaultseer private beta"
```

Expected:

```text
[feature/vaultseer-native-studio <sha>] chore: prepare Vaultseer private beta
```

- [ ] **Step 4: Tag local beta**

Run:

```powershell
git tag vaultseer-v0.1.0-local
```

Expected:

```text
git tag --list vaultseer-v0.1.0-local
vaultseer-v0.1.0-local
```

- [ ] **Step 5: Push branch and tag when ready**

Run only when user approves pushing:

```powershell
git push origin feature/vaultseer-native-studio
git push origin vaultseer-v0.1.0-local
```

Risk level: Low if the manual beta script passed.

Manual check: Clone/pull elsewhere and verify the tagged version can build.

---

## Out Of Scope For This Beta

These are useful but should not block private beta:

- public Obsidian community plugin release
- full Office/EPUB ingestion
- rendered PDF image/table preview polish
- automatic background scheduling
- multi-file automatic edits
- tag rename/merge across the vault
- automatic link insertion without redline review
- public security audit of Marker/PDF parsing
- Mimisbrunnr bridge

---

## Self-Review

Spec coverage:

- Polishing: Tasks 2, 3, 4, 5, 8, 10.
- Maintainability: Task 7.
- Usability: Tasks 2, 3, 4, 5, 10.
- Release readiness: Tasks 1, 8, 9, 11.
- Safety without over-restriction: Tasks 3 and 4 keep active-note writes easy while preserving visible redlines.

Placeholder scan:

- No `TBD` placeholders.
- No unspecified “add error handling” steps.
- Every task has files, commands, expected output, and manual checks.

Type consistency:

- New helper names are intentionally explicit:
  - `formatCodexRuntimeFailure`
  - `formatSearchToolResult`
  - `updateRewriteOperationDraft`
  - `buildSelectedTextAgentRequest`
- If existing names differ, preserve existing public names and add these only as local extracted helpers where needed.

---

## Execution Recommendation

Use subagent-driven implementation by task group:

1. Worker A: Tasks 1, 8, 11 release metadata/docs/commit.
2. Worker B: Tasks 2 and 6 provider/semantic/Marker diagnostics.
3. Worker C: Tasks 3 and 4 active-note write/edit flow.
4. Worker D: Task 5 selected-text actions.
5. Main agent: Task 7 maintainability extraction, Task 9 verification, Task 10 manual acceptance.

The main agent should review each worker patch before merging because several files in `apps/obsidian-plugin/src` are already active and easy to conflict.
