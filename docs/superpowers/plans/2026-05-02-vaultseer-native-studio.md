# Vaultseer Native Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Vaultseer into a current-note-first native Obsidian Studio with Windows-started Codex chat, controlled Vaultseer tools, managed source workspaces, plans/releases as Markdown, and guarded approvals.

**Architecture:** Keep the existing split: `packages/core` owns deterministic, Obsidian-free state and contracts; `apps/obsidian-plugin` owns Obsidian views, settings, runtime process handling, and vault writes. Codex is treated as an external reasoning process behind a narrow adapter and tool dispatcher; it may request search/inspection/proposal tools, but all vault writes still flow through existing guarded write operations.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest, existing `@vaultseer/core`, existing plugin data store, existing guarded write queue, Windows desktop process launch through Obsidian/Electron-compatible Node APIs.

---

## Scope Check

The approved design covers several subsystems. Implement it as a sequence of working vertical slices, not one large rewrite.

This plan is ordered so each phase leaves the plugin usable:

1. Studio shell over the current workbench.
2. Current-note context packets.
3. Native Codex runtime state and process manager.
4. Ephemeral chat with controlled read-only tools.
5. Proposal staging and inline approval.
6. Managed visible source workspaces.
7. Plan/release Markdown conventions.
8. User-initiated fact-checking surface.

Do not implement autonomous cleanup, hidden web research, persistent chat logs, direct Codex vault writes, mobile process launching, or automatic batch concept-note creation.

## File Structure And Responsibilities

### New Core Files

- `packages/core/src/context/active-note-context.ts`
  - Builds bounded, evidence-labeled context packets from normalized notes, chunks, relationships, suggestions, write queue items, and sources.
- `packages/core/src/context/types.ts`
  - Public context packet types used by plugin chat and tool dispatch.
- `packages/core/src/studio/types.ts`
  - Obsidian-free Studio mode, runtime, and permission state types.
- `packages/core/src/studio/studio-state.ts`
  - Pure state builder for Studio mode selection, active-note availability, and feature readiness.
- `packages/core/src/plans/plan-release-types.ts`
  - Light frontmatter conventions and validators for `vaultseer_type: plan` and `vaultseer_type: release`.

### New Plugin Files

- `apps/obsidian-plugin/src/studio-view.ts`
  - Main docked Studio view with modes: Note, Chat, Search, Sources, Plans, Releases, Review.
- `apps/obsidian-plugin/src/studio-state.ts`
  - Plugin presentation state that combines core Studio state with Obsidian active-file state.
- `apps/obsidian-plugin/src/active-note-context-controller.ts`
  - Loads store data and active Obsidian note content, then calls core context builder.
- `apps/obsidian-plugin/src/codex-runtime-state.ts`
  - Pure runtime transition helpers for `disabled`, `stopped`, `starting`, `running`, `failed`, `stopping`.
- `apps/obsidian-plugin/src/codex-process-manager.ts`
  - Windows-first process manager for starting, stopping, and restarting Codex.
- `apps/obsidian-plugin/src/codex-chat-adapter.ts`
  - Adapter interface for sending chat messages and receiving responses/tool requests.
- `apps/obsidian-plugin/src/codex-chat-state.ts`
  - Pure ephemeral chat state builder and message reducer.
- `apps/obsidian-plugin/src/codex-tool-dispatcher.ts`
  - Safe tool dispatcher exposing search/inspect/propose/stage behavior to Codex.
- `apps/obsidian-plugin/src/source-workspace-materializer.ts`
  - Writes visible managed source workspace files through guarded or source-specific approved flows.
- `apps/obsidian-plugin/src/plan-release-controller.ts`
  - Creates plan/release proposal operations using Markdown frontmatter conventions.
- `apps/obsidian-plugin/src/fact-check-controller.ts`
  - User-initiated fact-check request shaping; no background browsing.

### Modified Existing Files

- `packages/core/src/index.ts`
  - Export new context, Studio, and plan/release contracts.
- `apps/obsidian-plugin/src/main.ts`
  - Register Studio view and commands; wire Codex manager, chat adapter, context controller, and tool dispatcher.
- `apps/obsidian-plugin/src/settings-model.ts`
  - Add Windows Codex launcher settings, Studio defaults, managed source folder, plan folder, release folder.
- `apps/obsidian-plugin/src/settings.ts`
  - Add settings controls with clear operator text.
- `apps/obsidian-plugin/src/plugin-data-store.ts`
  - Normalize new settings while preserving old plugin data.
- `apps/obsidian-plugin/src/workbench-view.ts`
  - Keep as compatibility entry point initially; delegate to Studio Note mode in a separate compatibility cleanup slice where practical.
- `apps/obsidian-plugin/src/write-review-queue-modal.ts`
  - Reuse from Studio Review mode without widening write behavior.

### Test Files

- `packages/core/tests/active-note-context.test.ts`
- `packages/core/tests/studio-state.test.ts`
- `packages/core/tests/plan-release-types.test.ts`
- `apps/obsidian-plugin/tests/studio-state.test.ts`
- `apps/obsidian-plugin/tests/codex-runtime-state.test.ts`
- `apps/obsidian-plugin/tests/codex-chat-state.test.ts`
- `apps/obsidian-plugin/tests/codex-tool-dispatcher.test.ts`
- `apps/obsidian-plugin/tests/active-note-context-controller.test.ts`
- `apps/obsidian-plugin/tests/source-workspace-materializer.test.ts`
- `apps/obsidian-plugin/tests/plan-release-controller.test.ts`
- `apps/obsidian-plugin/tests/fact-check-controller.test.ts`

---

## Phase 0: Safety Baseline

### Task 0.1: Verify Existing Baseline

**Files:**
- Read: `docs/superpowers/specs/2026-05-02-vaultseer-native-studio-design.md`
- Read: `docs/platform-principles.md`
- Read: `docs/roadmap.md`
- No code changes.

- [ ] **Step 1: Confirm clean worktree**

Run:

```powershell
git status --short
```

Expected: no unrelated changes. If unrelated user changes exist, do not revert them.

- [ ] **Step 2: Run baseline tests**

Run:

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
git diff --check
```

Expected: all pass before feature work starts.

- [ ] **Step 3: Record current write surface**

Run:

```powershell
Select-String -Path "apps/obsidian-plugin/src/*.ts" -Pattern "vault\\.create|vault\\.modify|vault\\.delete|vault\\.rename"
```

Expected: only the known guarded write port calls appear. Any new write call introduced by this work must be justified by this plan and tests.

---

## Phase 1: Studio Shell

### Task 1.1: Add Core Studio State

**Files:**
- Create: `packages/core/src/studio/types.ts`
- Create: `packages/core/src/studio/studio-state.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/studio-state.test.ts`

- [ ] **Step 1: Write failing core Studio state tests**

Create `packages/core/tests/studio-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildStudioState } from "../src/studio/studio-state";

describe("buildStudioState", () => {
  it("opens current-note first when an active indexed note exists", () => {
    const state = buildStudioState({
      requestedMode: null,
      activePath: "Notes/VHDL.md",
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "stopped",
      indexStatus: "ready"
    });

    expect(state.activeMode).toBe("note");
    expect(state.currentNoteStatus).toBe("indexed");
    expect(state.availableModes.map((mode) => mode.id)).toEqual([
      "note",
      "chat",
      "search",
      "sources",
      "plans",
      "releases",
      "review"
    ]);
  });

  it("keeps chat visible but degraded when Codex is not running", () => {
    const state = buildStudioState({
      requestedMode: "chat",
      activePath: "Notes/VHDL.md",
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "failed",
      indexStatus: "ready"
    });

    expect(state.activeMode).toBe("chat");
    expect(state.modeSummaries.chat.status).toBe("degraded");
    expect(state.modeSummaries.chat.message).toContain("Codex");
  });

  it("blocks note-specific modes when no note is active", () => {
    const state = buildStudioState({
      requestedMode: null,
      activePath: null,
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "stopped",
      indexStatus: "ready"
    });

    expect(state.currentNoteStatus).toBe("none");
    expect(state.modeSummaries.note.status).toBe("blocked");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- studio-state.test.ts
```

Expected: fail because `buildStudioState` does not exist.

- [ ] **Step 3: Add core Studio types**

Create `packages/core/src/studio/types.ts`:

```ts
import type { IndexStatus } from "../storage/types";

export type StudioModeId = "note" | "chat" | "search" | "sources" | "plans" | "releases" | "review";

export type CodexRuntimeStatus = "disabled" | "stopped" | "starting" | "running" | "failed" | "stopping";

export type StudioModeStatus = "ready" | "blocked" | "degraded";

export type StudioModeSummary = {
  id: StudioModeId;
  label: string;
  status: StudioModeStatus;
  message: string;
};

export type StudioCurrentNoteStatus = "indexed" | "not_indexed" | "none";

export type BuildStudioStateInput = {
  requestedMode: StudioModeId | null;
  activePath: string | null;
  indexedNotePaths: string[];
  codexRuntimeStatus: CodexRuntimeStatus;
  indexStatus: IndexStatus;
};

export type StudioState = {
  activeMode: StudioModeId;
  currentNoteStatus: StudioCurrentNoteStatus;
  availableModes: StudioModeSummary[];
  modeSummaries: Record<StudioModeId, StudioModeSummary>;
};
```

- [ ] **Step 4: Add core Studio state builder**

Create `packages/core/src/studio/studio-state.ts`:

```ts
import type {
  BuildStudioStateInput,
  StudioCurrentNoteStatus,
  StudioModeId,
  StudioModeSummary,
  StudioModeStatus,
  StudioState
} from "./types";

const MODE_LABELS: Record<StudioModeId, string> = {
  note: "Note",
  chat: "Chat",
  search: "Search",
  sources: "Sources",
  plans: "Plans",
  releases: "Releases",
  review: "Review"
};

const MODE_ORDER: StudioModeId[] = ["note", "chat", "search", "sources", "plans", "releases", "review"];

export function buildStudioState(input: BuildStudioStateInput): StudioState {
  const currentNoteStatus = getCurrentNoteStatus(input.activePath, input.indexedNotePaths);
  const modeSummaries = Object.fromEntries(
    MODE_ORDER.map((mode) => [mode, buildModeSummary(mode, input, currentNoteStatus)])
  ) as Record<StudioModeId, StudioModeSummary>;

  return {
    activeMode: input.requestedMode ?? "note",
    currentNoteStatus,
    availableModes: MODE_ORDER.map((mode) => modeSummaries[mode]),
    modeSummaries
  };
}

function getCurrentNoteStatus(activePath: string | null, indexedNotePaths: string[]): StudioCurrentNoteStatus {
  if (!activePath) return "none";
  return indexedNotePaths.includes(activePath) ? "indexed" : "not_indexed";
}

function buildModeSummary(
  id: StudioModeId,
  input: BuildStudioStateInput,
  currentNoteStatus: StudioCurrentNoteStatus
): StudioModeSummary {
  if (id === "note" && currentNoteStatus === "none") {
    return summary(id, "blocked", "Open a Markdown note to use note mode.");
  }

  if (id === "note" && currentNoteStatus === "not_indexed") {
    return summary(id, "degraded", "The active note is not in the current Vaultseer index.");
  }

  if (id === "chat" && input.codexRuntimeStatus !== "running") {
    return summary(id, "degraded", "Codex is not running. Start Codex to chat with the active note.");
  }

  if ((id === "search" || id === "sources") && input.indexStatus === "empty") {
    return summary(id, "blocked", "Rebuild the Vaultseer index before using this mode.");
  }

  return summary(id, "ready", `${MODE_LABELS[id]} mode is ready.`);
}

function summary(id: StudioModeId, status: StudioModeStatus, message: string): StudioModeSummary {
  return {
    id,
    label: MODE_LABELS[id],
    status,
    message
  };
}
```

- [ ] **Step 5: Export core Studio contracts**

Modify `packages/core/src/index.ts`:

```ts
export { buildStudioState } from "./studio/studio-state";
export type {
  BuildStudioStateInput,
  CodexRuntimeStatus,
  StudioCurrentNoteStatus,
  StudioModeId,
  StudioModeStatus,
  StudioModeSummary,
  StudioState
} from "./studio/types";
```

- [ ] **Step 6: Verify tests**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- studio-state.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/core/src/studio packages/core/src/index.ts packages/core/tests/studio-state.test.ts
git commit -m "feat: add vaultseer studio state"
```

### Task 1.2: Add Plugin Studio View Shell

**Files:**
- Create: `apps/obsidian-plugin/src/studio-state.ts`
- Create: `apps/obsidian-plugin/src/studio-view.ts`
- Modify: `apps/obsidian-plugin/src/main.ts`
- Test: `apps/obsidian-plugin/tests/studio-state.test.ts`

- [ ] **Step 1: Write failing plugin Studio state tests**

Create `apps/obsidian-plugin/tests/studio-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPluginStudioState } from "../src/studio-state";

describe("buildPluginStudioState", () => {
  it("summarizes active note and mode labels for the view", () => {
    const state = buildPluginStudioState({
      requestedMode: null,
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      indexStatus: "ready",
      codexRuntimeStatus: "stopped"
    });

    expect(state.title).toBe("Vaultseer Studio");
    expect(state.activeNoteLabel).toBe("VHDL");
    expect(state.activeMode).toBe("note");
    expect(state.modes).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- studio-state.test.ts
```

Expected: fail because `buildPluginStudioState` does not exist.

- [ ] **Step 3: Add plugin Studio presentation state**

Create `apps/obsidian-plugin/src/studio-state.ts`:

```ts
import { buildStudioState, type CodexRuntimeStatus, type IndexStatus, type StudioModeId } from "@vaultseer/core";

export type StudioStateNoteSummary = {
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
};

export type BuildPluginStudioStateInput = {
  requestedMode: StudioModeId | null;
  activePath: string | null;
  notes: StudioStateNoteSummary[];
  indexStatus: IndexStatus;
  codexRuntimeStatus: CodexRuntimeStatus;
};

export type PluginStudioState = {
  title: string;
  activeMode: StudioModeId;
  activeNoteLabel: string;
  activeNotePath: string | null;
  modes: Array<{
    id: StudioModeId;
    label: string;
    status: string;
    message: string;
    selected: boolean;
  }>;
};

export function buildPluginStudioState(input: BuildPluginStudioStateInput): PluginStudioState {
  const coreState = buildStudioState({
    requestedMode: input.requestedMode,
    activePath: input.activePath,
    indexedNotePaths: input.notes.map((note) => note.path),
    codexRuntimeStatus: input.codexRuntimeStatus,
    indexStatus: input.indexStatus
  });
  const activeNote = input.notes.find((note) => note.path === input.activePath);

  return {
    title: "Vaultseer Studio",
    activeMode: coreState.activeMode,
    activeNoteLabel: activeNote?.title ?? (input.activePath ? "Active note not indexed" : "No active note"),
    activeNotePath: input.activePath,
    modes: coreState.availableModes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      status: mode.status,
      message: mode.message,
      selected: mode.id === coreState.activeMode
    }))
  };
}
```

- [ ] **Step 4: Add Studio view shell**

Create `apps/obsidian-plugin/src/studio-view.ts`:

```ts
import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type { CodexRuntimeStatus, IndexHealth, NoteRecord, StudioModeId, VaultseerStore } from "@vaultseer/core";
import { buildPluginStudioState } from "./studio-state";

export const VAULTSEER_STUDIO_VIEW_TYPE = "vaultseer-studio";

export class VaultseerStudioView extends ItemView {
  private activeMode: StudioModeId | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly store: VaultseerStore,
    private readonly getActivePath: () => string | null,
    private readonly getCodexRuntimeStatus: () => CodexRuntimeStatus
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VAULTSEER_STUDIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Vaultseer Studio";
  }

  getIcon(): string {
    return "compass";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", () => void this.refresh()));
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    try {
      const [health, notes] = await Promise.all([this.store.getHealth(), this.store.getNoteRecords()]);
      this.render(health, notes);
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.createEl("h2", { text: "Vaultseer Studio" });
      this.contentEl.createEl("p", { text: error instanceof Error ? error.message : "Could not load Studio state." });
      new Notice("Vaultseer Studio could not load.");
    }
  }

  private render(health: IndexHealth, notes: NoteRecord[]): void {
    const state = buildPluginStudioState({
      requestedMode: this.activeMode,
      activePath: this.getActivePath(),
      notes,
      indexStatus: health.status,
      codexRuntimeStatus: this.getCodexRuntimeStatus()
    });

    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: state.title });
    this.contentEl.createEl("p", { text: `Current note: ${state.activeNoteLabel}` });

    const nav = this.contentEl.createDiv({ cls: "vaultseer-studio-nav" });
    for (const mode of state.modes) {
      const button = nav.createEl("button", {
        text: mode.label,
        title: mode.message,
        cls: mode.selected ? "vaultseer-studio-mode-selected" : ""
      });
      button.addEventListener("click", async () => {
        this.activeMode = mode.id;
        await this.refresh();
      });
    }

    const body = this.contentEl.createDiv({ cls: "vaultseer-studio-body" });
    body.createEl("h3", { text: state.modes.find((mode) => mode.selected)?.label ?? "Note" });
    body.createEl("p", { text: state.modes.find((mode) => mode.selected)?.message ?? "Mode is ready." });
  }
}

export async function activateVaultseerStudio(app: { workspace: { getLeavesOfType(type: string): WorkspaceLeaf[]; getRightLeaf(split: boolean): WorkspaceLeaf | null; revealLeaf(leaf: WorkspaceLeaf): Promise<void> } }): Promise<WorkspaceLeaf | null> {
  const existing = app.workspace.getLeavesOfType(VAULTSEER_STUDIO_VIEW_TYPE)[0];
  if (existing) {
    await app.workspace.revealLeaf(existing);
    return existing;
  }

  const leaf = app.workspace.getRightLeaf(false);
  if (!leaf) return null;
  await leaf.setViewState({ type: VAULTSEER_STUDIO_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
  return leaf;
}
```

- [ ] **Step 5: Register Studio in plugin main**

Modify `apps/obsidian-plugin/src/main.ts`:

```ts
import { activateVaultseerStudio, VAULTSEER_STUDIO_VIEW_TYPE, VaultseerStudioView } from "./studio-view";
```

Inside `onload`, register the view:

```ts
this.registerView(
  VAULTSEER_STUDIO_VIEW_TYPE,
  (leaf) =>
    new VaultseerStudioView(
      leaf,
      this.store,
      () => this.app.workspace.getActiveFile()?.path ?? null,
      () => "stopped"
    )
);
```

Add command:

```ts
this.addCommand({
  id: "open-studio",
  name: "Open native Studio",
  callback: async () => {
    await activateVaultseerStudio(this.app);
  }
});
```

- [ ] **Step 6: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- studio-state.test.ts
corepack pnpm typecheck
corepack pnpm build
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/studio-state.ts apps/obsidian-plugin/src/studio-view.ts apps/obsidian-plugin/src/main.ts apps/obsidian-plugin/tests/studio-state.test.ts
git commit -m "feat: add vaultseer studio shell"
```

---

## Phase 2: Current-Note Context Packets

### Task 2.1: Add Core Active-Note Context Builder

**Files:**
- Create: `packages/core/src/context/types.ts`
- Create: `packages/core/src/context/active-note-context.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/active-note-context.test.ts`

- [ ] **Step 1: Write failing context tests**

Create `packages/core/tests/active-note-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildActiveNoteContextPacket } from "../src/context/active-note-context";
import type { NoteRecord } from "../src/types";

const note: NoteRecord = {
  path: "Notes/VHDL.md",
  title: "VHDL Timing",
  aliases: ["timing"],
  tags: ["vhdl"],
  frontmatter: { tags: ["vhdl"] },
  headings: [{ level: 2, text: "Setup time", line: 4 }],
  links: [{ raw: "[[Flip Flop]]", target: "Flip Flop", position: { startLine: 8, endLine: 8 } }],
  stats: { sizeBytes: 100, mtime: 1 }
};

describe("buildActiveNoteContextPacket", () => {
  it("builds bounded context for the active note", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Notes/VHDL.md",
      notes: [note],
      chunks: [
        {
          id: "chunk-1",
          notePath: "Notes/VHDL.md",
          headingPath: ["Setup time"],
          normalizedTextHash: "hash",
          ordinal: 0,
          text: "Setup time must be met before the clock edge."
        }
      ],
      relatedNotes: [],
      sourceExcerpts: [],
      maxChunkCharacters: 80
    });

    expect(packet.status).toBe("ready");
    expect(packet.note?.path).toBe("Notes/VHDL.md");
    expect(packet.note?.tags).toEqual(["vhdl"]);
    expect(packet.noteChunks[0]?.text).toContain("Setup time");
  });

  it("returns blocked when the active note is not indexed", () => {
    const packet = buildActiveNoteContextPacket({
      activePath: "Missing.md",
      notes: [note],
      chunks: [],
      relatedNotes: [],
      sourceExcerpts: []
    });

    expect(packet.status).toBe("blocked");
    expect(packet.message).toContain("not indexed");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- active-note-context.test.ts
```

Expected: fail because context builder does not exist.

- [ ] **Step 3: Add context types**

Create `packages/core/src/context/types.ts`:

```ts
export type ActiveNoteContextStatus = "ready" | "blocked";

export type ActiveNoteContextPacket = {
  status: ActiveNoteContextStatus;
  message: string;
  note: {
    path: string;
    title: string;
    aliases: string[];
    tags: string[];
    headings: string[];
    links: string[];
  } | null;
  noteChunks: Array<{
    chunkId: string;
    headingPath: string[];
    text: string;
  }>;
  relatedNotes: Array<{
    path: string;
    title: string;
    reason: string;
  }>;
  sourceExcerpts: Array<{
    sourceId: string;
    sourcePath: string;
    chunkId: string;
    text: string;
    evidenceLabel: string;
  }>;
};
```

- [ ] **Step 4: Add active-note context builder**

Create `packages/core/src/context/active-note-context.ts`:

```ts
import type { ChunkRecord } from "../storage/types";
import type { NoteRecord } from "../types";
import type { ActiveNoteContextPacket } from "./types";

export type BuildActiveNoteContextPacketInput = {
  activePath: string | null;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  relatedNotes: Array<{ path: string; title: string; reason: string }>;
  sourceExcerpts: Array<{ sourceId: string; sourcePath: string; chunkId: string; text: string; evidenceLabel: string }>;
  maxChunkCharacters?: number;
};

export function buildActiveNoteContextPacket(input: BuildActiveNoteContextPacketInput): ActiveNoteContextPacket {
  if (!input.activePath) {
    return blocked("Open a Markdown note before chatting with Vaultseer.");
  }

  const note = input.notes.find((candidate) => candidate.path === input.activePath);
  if (!note) {
    return blocked("The active note is not indexed. Rebuild the Vaultseer index before using note-aware chat.");
  }

  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: note.path,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      headings: note.headings.map((heading) => heading.text),
      links: note.links.map((link) => link.raw)
    },
    noteChunks: input.chunks
      .filter((chunk) => chunk.notePath === note.path)
      .map((chunk) => ({
        chunkId: chunk.id,
        headingPath: chunk.headingPath,
        text: truncate(chunk.text, input.maxChunkCharacters ?? 1200)
      })),
    relatedNotes: input.relatedNotes.slice(0, 8),
    sourceExcerpts: input.sourceExcerpts.slice(0, 8).map((excerpt) => ({
      ...excerpt,
      text: truncate(excerpt.text, input.maxChunkCharacters ?? 1200)
    }))
  };
}

function blocked(message: string): ActiveNoteContextPacket {
  return {
    status: "blocked",
    message,
    note: null,
    noteChunks: [],
    relatedNotes: [],
    sourceExcerpts: []
  };
}

function truncate(value: string, maxCharacters: number): string {
  return value.length <= maxCharacters ? value : `${value.slice(0, maxCharacters).trimEnd()}...`;
}
```

- [ ] **Step 5: Export context contracts**

Modify `packages/core/src/index.ts`:

```ts
export { buildActiveNoteContextPacket } from "./context/active-note-context";
export type { BuildActiveNoteContextPacketInput } from "./context/active-note-context";
export type { ActiveNoteContextPacket, ActiveNoteContextStatus } from "./context/types";
```

- [ ] **Step 6: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- active-note-context.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/core/src/context packages/core/src/index.ts packages/core/tests/active-note-context.test.ts
git commit -m "feat: build active note context packets"
```

### Task 2.2: Add Plugin Context Controller

**Files:**
- Create: `apps/obsidian-plugin/src/active-note-context-controller.ts`
- Test: `apps/obsidian-plugin/tests/active-note-context-controller.test.ts`

- [ ] **Step 1: Write failing controller test**

Create `apps/obsidian-plugin/tests/active-note-context-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildActiveNoteContextFromStore } from "../src/active-note-context-controller";
import { InMemoryVaultseerStore, buildVaultSnapshot, chunkVaultInputs, buildLexicalIndex } from "@vaultseer/core";

describe("buildActiveNoteContextFromStore", () => {
  it("loads note and chunk records from the store", async () => {
    const store = new InMemoryVaultseerStore();
    const inputs = [
      {
        path: "Notes/VHDL.md",
        title: "VHDL",
        aliases: [],
        tags: ["vhdl"],
        frontmatter: {},
        headings: [],
        links: [],
        stats: { sizeBytes: 20, mtime: 1 },
        content: "VHDL setup time matters."
      }
    ];
    const snapshot = buildVaultSnapshot(inputs);
    const chunks = chunkVaultInputs(inputs);
    await store.replaceNoteIndex(snapshot, "2026-05-02T00:00:00.000Z", chunks, buildLexicalIndex(snapshot, chunks));

    const packet = await buildActiveNoteContextFromStore({
      store,
      activePath: "Notes/VHDL.md"
    });

    expect(packet.status).toBe("ready");
    expect(packet.note?.title).toBe("VHDL");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- active-note-context-controller.test.ts
```

Expected: fail because controller does not exist.

- [ ] **Step 3: Add controller**

Create `apps/obsidian-plugin/src/active-note-context-controller.ts`:

```ts
import { buildActiveNoteContextPacket, type ActiveNoteContextPacket, type VaultseerStore } from "@vaultseer/core";

export type BuildActiveNoteContextFromStoreInput = {
  store: VaultseerStore;
  activePath: string | null;
};

export async function buildActiveNoteContextFromStore(
  input: BuildActiveNoteContextFromStoreInput
): Promise<ActiveNoteContextPacket> {
  const [notes, chunks] = await Promise.all([input.store.getNoteRecords(), input.store.getChunkRecords()]);

  return buildActiveNoteContextPacket({
    activePath: input.activePath,
    notes,
    chunks,
    relatedNotes: [],
    sourceExcerpts: []
  });
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- active-note-context-controller.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/active-note-context-controller.ts apps/obsidian-plugin/tests/active-note-context-controller.test.ts
git commit -m "feat: load active note chat context"
```

---

## Phase 3: Windows Codex Runtime

### Task 3.1: Add Codex Runtime State Machine

**Files:**
- Create: `apps/obsidian-plugin/src/codex-runtime-state.ts`
- Test: `apps/obsidian-plugin/tests/codex-runtime-state.test.ts`

- [ ] **Step 1: Write failing runtime-state tests**

Create `apps/obsidian-plugin/tests/codex-runtime-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canStartCodexRuntime, transitionCodexRuntime } from "../src/codex-runtime-state";

describe("codex runtime state", () => {
  it("allows start from stopped when launcher is configured", () => {
    expect(canStartCodexRuntime({ status: "stopped", configured: true })).toBe(true);
  });

  it("does not allow start when disabled or unconfigured", () => {
    expect(canStartCodexRuntime({ status: "disabled", configured: true })).toBe(false);
    expect(canStartCodexRuntime({ status: "stopped", configured: false })).toBe(false);
  });

  it("records failed launch with a user-visible message", () => {
    const state = transitionCodexRuntime(
      { status: "starting", message: "Starting Codex.", processId: null },
      { type: "launch_failed", message: "codex.exe was not found" }
    );

    expect(state.status).toBe("failed");
    expect(state.message).toContain("codex.exe");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-runtime-state.test.ts
```

Expected: fail because runtime state helpers do not exist.

- [ ] **Step 3: Add runtime state helpers**

Create `apps/obsidian-plugin/src/codex-runtime-state.ts`:

```ts
import type { CodexRuntimeStatus } from "@vaultseer/core";

export type CodexRuntimeState = {
  status: CodexRuntimeStatus;
  message: string;
  processId: number | null;
};

export type CodexRuntimeEvent =
  | { type: "start_requested" }
  | { type: "started"; processId: number | null }
  | { type: "launch_failed"; message: string }
  | { type: "stop_requested" }
  | { type: "stopped" };

export type CanStartCodexRuntimeInput = {
  status: CodexRuntimeStatus;
  configured: boolean;
};

export function canStartCodexRuntime(input: CanStartCodexRuntimeInput): boolean {
  return input.configured && (input.status === "stopped" || input.status === "failed");
}

export function transitionCodexRuntime(state: CodexRuntimeState, event: CodexRuntimeEvent): CodexRuntimeState {
  switch (event.type) {
    case "start_requested":
      return { status: "starting", message: "Starting Codex.", processId: null };
    case "started":
      return { status: "running", message: "Codex is running.", processId: event.processId };
    case "launch_failed":
      return { status: "failed", message: event.message, processId: null };
    case "stop_requested":
      return { ...state, status: "stopping", message: "Stopping Codex." };
    case "stopped":
      return { status: "stopped", message: "Codex is stopped.", processId: null };
  }
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-runtime-state.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-runtime-state.ts apps/obsidian-plugin/tests/codex-runtime-state.test.ts
git commit -m "feat: model codex runtime state"
```

### Task 3.2: Add Windows-First Codex Settings

**Files:**
- Modify: `apps/obsidian-plugin/src/settings-model.ts`
- Modify: `apps/obsidian-plugin/src/settings.ts`
- Modify: `apps/obsidian-plugin/src/plugin-data-store.ts`
- Test: `apps/obsidian-plugin/tests/plugin-data-store.test.ts`

- [ ] **Step 1: Add failing settings normalization test**

Modify `apps/obsidian-plugin/tests/plugin-data-store.test.ts` with a case:

```ts
it("normalizes native Codex settings", async () => {
  const host = createHost({
    settings: {
      nativeCodexEnabled: true,
      codexCommand: "codex",
      codexWorkingDirectory: "F:\\Dev\\Obsidian"
    },
    index: null
  });
  const store = new VaultseerPluginDataStore(host);

  const settings = await store.loadSettings();

  expect(settings.nativeCodexEnabled).toBe(true);
  expect(settings.codexCommand).toBe("codex");
  expect(settings.codexWorkingDirectory).toBe("F:\\Dev\\Obsidian");
});
```

- [ ] **Step 2: Run failing settings test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- plugin-data-store.test.ts
```

Expected: fail because settings fields do not exist.

- [ ] **Step 3: Add settings fields**

Modify `apps/obsidian-plugin/src/settings-model.ts`:

```ts
export type VaultseerSettings = {
  excludedFolders: string[];
  semanticSearchEnabled: boolean;
  semanticIndexingEnabled: boolean;
  embeddingEndpoint: string;
  embeddingProviderId: string;
  embeddingModelId: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
  sourceNoteFolder: string;
  nativeCodexEnabled: boolean;
  codexCommand: string;
  codexWorkingDirectory: string;
  managedSourceFolder: string;
  planFolder: string;
  releaseFolder: string;
};

export const DEFAULT_MANAGED_SOURCE_FOLDER = "Sources";
export const DEFAULT_PLAN_FOLDER = "Plans";
export const DEFAULT_RELEASE_FOLDER = "Releases";
```

Add defaults:

```ts
nativeCodexEnabled: false,
codexCommand: "codex",
codexWorkingDirectory: "",
managedSourceFolder: DEFAULT_MANAGED_SOURCE_FOLDER,
planFolder: DEFAULT_PLAN_FOLDER,
releaseFolder: DEFAULT_RELEASE_FOLDER
```

- [ ] **Step 4: Normalize new settings in plugin data store**

Modify `apps/obsidian-plugin/src/plugin-data-store.ts` inside `normalizeSettings`:

```ts
nativeCodexEnabled:
  typeof raw.nativeCodexEnabled === "boolean" ? raw.nativeCodexEnabled : DEFAULT_SETTINGS.nativeCodexEnabled,
codexCommand: normalizeNonEmptyString(raw.codexCommand, DEFAULT_SETTINGS.codexCommand),
codexWorkingDirectory:
  typeof raw.codexWorkingDirectory === "string" ? raw.codexWorkingDirectory.trim() : DEFAULT_SETTINGS.codexWorkingDirectory,
managedSourceFolder: normalizeVaultFolderPath(raw.managedSourceFolder, DEFAULT_SETTINGS.managedSourceFolder),
planFolder: normalizeVaultFolderPath(raw.planFolder, DEFAULT_SETTINGS.planFolder),
releaseFolder: normalizeVaultFolderPath(raw.releaseFolder, DEFAULT_SETTINGS.releaseFolder)
```

- [ ] **Step 5: Add settings UI**

Modify `apps/obsidian-plugin/src/settings.ts` with controls for:

- Native Codex enabled.
- Codex command.
- Codex working directory.
- Managed source folder.
- Plan folder.
- Release folder.

Use descriptions that say Windows desktop process launching is experimental and writes still require approval.

- [ ] **Step 6: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- plugin-data-store.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/settings-model.ts apps/obsidian-plugin/src/settings.ts apps/obsidian-plugin/src/plugin-data-store.ts apps/obsidian-plugin/tests/plugin-data-store.test.ts
git commit -m "feat: add native codex settings"
```

### Task 3.3: Add Codex Process Manager Interface And Stub

**Files:**
- Create: `apps/obsidian-plugin/src/codex-process-manager.ts`
- Test: `apps/obsidian-plugin/tests/codex-process-manager.test.ts`

- [ ] **Step 1: Write process-manager tests against a fake launcher**

Create `apps/obsidian-plugin/tests/codex-process-manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CodexProcessManager } from "../src/codex-process-manager";

describe("CodexProcessManager", () => {
  it("reports stopped when disabled", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: false,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("disabled");
  });

  it("moves to running when launch succeeds", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("running");
    expect(result.processId).toBe(123);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-process-manager.test.ts
```

Expected: fail because process manager does not exist.

- [ ] **Step 3: Add process manager with injected launcher**

Create `apps/obsidian-plugin/src/codex-process-manager.ts`:

```ts
import type { CodexRuntimeState } from "./codex-runtime-state";
import { transitionCodexRuntime } from "./codex-runtime-state";

export type NativeCodexProcessSettings = {
  nativeCodexEnabled: boolean;
  codexCommand: string;
  codexWorkingDirectory: string;
};

export type CodexLaunchResult = {
  processId: number | null;
};

export type CodexProcessLauncher = {
  getSettings(): NativeCodexProcessSettings;
  launch(settings: NativeCodexProcessSettings): Promise<CodexLaunchResult>;
  stop(processId: number | null): Promise<void>;
};

export class CodexProcessManager {
  private state: CodexRuntimeState = { status: "stopped", message: "Codex is stopped.", processId: null };

  constructor(private readonly launcher: CodexProcessLauncher) {}

  getState(): CodexRuntimeState {
    return this.state;
  }

  async start(): Promise<CodexRuntimeState> {
    const settings = this.launcher.getSettings();
    if (!settings.nativeCodexEnabled) {
      this.state = { status: "disabled", message: "Native Codex chat is disabled in Vaultseer settings.", processId: null };
      return this.state;
    }

    this.state = transitionCodexRuntime(this.state, { type: "start_requested" });
    try {
      const result = await this.launcher.launch(settings);
      this.state = transitionCodexRuntime(this.state, { type: "started", processId: result.processId });
    } catch (error) {
      this.state = transitionCodexRuntime(this.state, {
        type: "launch_failed",
        message: error instanceof Error ? error.message : "Codex launch failed."
      });
    }
    return this.state;
  }

  async stop(): Promise<CodexRuntimeState> {
    this.state = transitionCodexRuntime(this.state, { type: "stop_requested" });
    await this.launcher.stop(this.state.processId);
    this.state = transitionCodexRuntime(this.state, { type: "stopped" });
    return this.state;
  }
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-runtime-state.test.ts codex-process-manager.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-process-manager.ts apps/obsidian-plugin/tests/codex-process-manager.test.ts
git commit -m "feat: add codex process manager"
```

---

## Phase 4: Ephemeral Chat And Controlled Tools

### Task 4.1: Add Chat State Reducer

**Files:**
- Create: `apps/obsidian-plugin/src/codex-chat-state.ts`
- Test: `apps/obsidian-plugin/tests/codex-chat-state.test.ts`

- [ ] **Step 1: Write failing chat-state tests**

Create `apps/obsidian-plugin/tests/codex-chat-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyChatEvent, createEmptyChatState } from "../src/codex-chat-state";

describe("codex chat state", () => {
  it("keeps chat messages ephemeral and active-note scoped", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, { type: "user_message", content: "Suggest tags" });
    state = applyChatEvent(state, { type: "assistant_message", content: "Suggested tag: vhdl/timing" });

    expect(state.activePath).toBe("Notes/VHDL.md");
    expect(state.messages).toHaveLength(2);
    expect(state.persistToVault).toBe(false);
  });

  it("clears messages when active note changes", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, { type: "user_message", content: "Hello" });
    state = applyChatEvent(state, { type: "active_note_changed", activePath: "Notes/C++.md" });

    expect(state.activePath).toBe("Notes/C++.md");
    expect(state.messages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-chat-state.test.ts
```

Expected: fail because chat state does not exist.

- [ ] **Step 3: Add chat state reducer**

Create `apps/obsidian-plugin/src/codex-chat-state.ts`:

```ts
export type CodexChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type CodexChatState = {
  activePath: string | null;
  messages: CodexChatMessage[];
  persistToVault: false;
  error: string | null;
};

export type CodexChatEvent =
  | { type: "user_message"; content: string }
  | { type: "assistant_message"; content: string }
  | { type: "error"; message: string }
  | { type: "active_note_changed"; activePath: string | null }
  | { type: "clear" };

export function createEmptyChatState(activePath: string | null): CodexChatState {
  return {
    activePath,
    messages: [],
    persistToVault: false,
    error: null
  };
}

export function applyChatEvent(state: CodexChatState, event: CodexChatEvent): CodexChatState {
  switch (event.type) {
    case "user_message":
      return appendMessage(state, "user", event.content);
    case "assistant_message":
      return appendMessage(state, "assistant", event.content);
    case "error":
      return { ...state, error: event.message };
    case "active_note_changed":
      return createEmptyChatState(event.activePath);
    case "clear":
      return createEmptyChatState(state.activePath);
  }
}

function appendMessage(state: CodexChatState, role: CodexChatMessage["role"], content: string): CodexChatState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        role,
        content,
        createdAt: new Date().toISOString()
      }
    ],
    error: null
  };
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-chat-state.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-chat-state.ts apps/obsidian-plugin/tests/codex-chat-state.test.ts
git commit -m "feat: add ephemeral codex chat state"
```

### Task 4.2: Add Controlled Tool Dispatcher

**Files:**
- Create: `apps/obsidian-plugin/src/codex-tool-dispatcher.ts`
- Test: `apps/obsidian-plugin/tests/codex-tool-dispatcher.test.ts`

- [ ] **Step 1: Write failing dispatcher tests**

Create `apps/obsidian-plugin/tests/codex-tool-dispatcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dispatchCodexToolRequest } from "../src/codex-tool-dispatcher";

describe("dispatchCodexToolRequest", () => {
  it("allows current note inspection", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "inspect_current_note", input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready", title: "VHDL" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe("inspect_current_note");
  });

  it("rejects unknown or write-like tools", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "write_file", input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not allowed");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-tool-dispatcher.test.ts
```

Expected: fail because dispatcher does not exist.

- [ ] **Step 3: Add controlled dispatcher**

Create `apps/obsidian-plugin/src/codex-tool-dispatcher.ts`:

```ts
export type AllowedCodexTool = "inspect_current_note" | "search_notes" | "search_sources" | "stage_suggestion";

export type CodexToolRequest = {
  tool: string;
  input: unknown;
};

export type CodexToolResult =
  | { ok: true; tool: AllowedCodexTool; output: unknown }
  | { ok: false; tool: string; message: string };

export type CodexToolImplementations = {
  inspectCurrentNote(): Promise<unknown>;
  searchNotes(input: unknown): Promise<unknown>;
  searchSources(input: unknown): Promise<unknown>;
  stageSuggestion(input: unknown): Promise<unknown>;
};

export async function dispatchCodexToolRequest(input: {
  request: CodexToolRequest;
  tools: CodexToolImplementations;
}): Promise<CodexToolResult> {
  switch (input.request.tool) {
    case "inspect_current_note":
      return { ok: true, tool: "inspect_current_note", output: await input.tools.inspectCurrentNote() };
    case "search_notes":
      return { ok: true, tool: "search_notes", output: await input.tools.searchNotes(input.request.input) };
    case "search_sources":
      return { ok: true, tool: "search_sources", output: await input.tools.searchSources(input.request.input) };
    case "stage_suggestion":
      return { ok: true, tool: "stage_suggestion", output: await input.tools.stageSuggestion(input.request.input) };
    default:
      return {
        ok: false,
        tool: input.request.tool,
        message: `Codex tool '${input.request.tool}' is not allowed by Vaultseer.`
      };
  }
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-tool-dispatcher.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-tool-dispatcher.ts apps/obsidian-plugin/tests/codex-tool-dispatcher.test.ts
git commit -m "feat: add controlled codex tool dispatcher"
```

### Task 4.3: Add Chat UI To Studio With Fake Adapter First

**Files:**
- Create: `apps/obsidian-plugin/src/codex-chat-adapter.ts`
- Modify: `apps/obsidian-plugin/src/studio-view.ts`
- Modify: `apps/obsidian-plugin/src/main.ts`
- Test: `apps/obsidian-plugin/tests/codex-chat-state.test.ts`

- [ ] **Step 1: Add adapter contract**

Create `apps/obsidian-plugin/src/codex-chat-adapter.ts`:

```ts
import type { ActiveNoteContextPacket } from "@vaultseer/core";

export type CodexChatAdapterRequest = {
  message: string;
  context: ActiveNoteContextPacket;
};

export type CodexChatAdapterResponse = {
  content: string;
  toolRequests: Array<{ tool: string; input: unknown }>;
};

export interface CodexChatAdapter {
  send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse>;
}

export class NotConfiguredCodexChatAdapter implements CodexChatAdapter {
  async send(): Promise<CodexChatAdapterResponse> {
    return {
      content: "Native Codex chat is not connected yet. Start Codex from Vaultseer settings, then retry.",
      toolRequests: []
    };
  }
}
```

- [ ] **Step 2: Extend Studio view constructor**

Modify `apps/obsidian-plugin/src/studio-view.ts` to accept:

```ts
private readonly buildActiveNoteContext: () => Promise<ActiveNoteContextPacket>,
private readonly chatAdapter: CodexChatAdapter
```

Render Chat mode with:

- existing ephemeral messages;
- input field;
- send button;
- error text.

The first UI can be plain Obsidian DOM elements. Do not introduce a UI framework.

- [ ] **Step 3: Wire default adapter in main**

Modify `apps/obsidian-plugin/src/main.ts`:

```ts
import { buildActiveNoteContextFromStore } from "./active-note-context-controller";
import { NotConfiguredCodexChatAdapter } from "./codex-chat-adapter";
```

Pass to `VaultseerStudioView`:

```ts
async () =>
  buildActiveNoteContextFromStore({
    store: this.store,
    activePath: this.app.workspace.getActiveFile()?.path ?? null
  }),
new NotConfiguredCodexChatAdapter()
```

- [ ] **Step 4: Verify no persistence**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-chat-state.test.ts studio-state.test.ts
corepack pnpm typecheck
corepack pnpm build
```

Expected: pass. The chat UI exists but only returns a not-configured response until the real adapter is wired.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-chat-adapter.ts apps/obsidian-plugin/src/studio-view.ts apps/obsidian-plugin/src/main.ts
git commit -m "feat: add native chat shell"
```

---

## Phase 5: Controlled Codex Integration

### Task 5.1: Study And Adapt ACP Runtime From Research

**Files:**
- Read: `research/obsidian-agent-client/src/acp/acp-client.ts`
- Read: `research/obsidian-agent-client/src/acp/acp-handler.ts`
- Read: `research/obsidian-agent-client/src/services/message-sender.ts`
- Read: `research/obsidian-agent-client/src/services/message-state.ts`
- Create: `docs/reuse/native-codex-acp-adaptation.md`

- [ ] **Step 1: Inspect ACP research files**

Run:

```powershell
Get-Content -Raw "research/obsidian-agent-client/src/acp/acp-client.ts"
Get-Content -Raw "research/obsidian-agent-client/src/acp/acp-handler.ts"
Get-Content -Raw "research/obsidian-agent-client/src/services/message-sender.ts"
Get-Content -Raw "research/obsidian-agent-client/src/services/message-state.ts"
```

Expected: identify session start, message send, streaming/tool update, permission handling, and error-shaping patterns.

- [ ] **Step 2: Write adaptation notes**

Create `docs/reuse/native-codex-acp-adaptation.md` with:

```md
# Native Codex ACP Adaptation

## Borrowed Concepts

- ACP session lifecycle from Agent Client.
- Message update normalization from Agent Client message state.
- Permission boundary concept from Agent Client permission handler.

## Vaultseer-Specific Changes

- Chat history remains ephemeral by default.
- Vaultseer owns active-note context packet creation.
- Vaultseer tool dispatcher exposes only inspect/search/propose/stage tools.
- Vault writes are not ACP tools; they remain guarded Vaultseer operations.

## Non-Copied Surfaces

- Do not copy Agent Client's full React UI.
- Do not copy persistent session history for v1.
- Do not let Codex terminal actions mutate vault files directly.
```

- [ ] **Step 3: Commit reuse note**

Run:

```powershell
git add docs/reuse/native-codex-acp-adaptation.md
git commit -m "docs: record native codex acp reuse plan"
```

### Task 5.2: Replace Fake Adapter With ACP-Compatible Adapter

**Files:**
- Modify: `apps/obsidian-plugin/src/codex-chat-adapter.ts`
- Modify: `apps/obsidian-plugin/src/codex-process-manager.ts`
- Test: `apps/obsidian-plugin/tests/codex-chat-adapter.test.ts`

- [ ] **Step 1: Write adapter tests with fake transport**

Create `apps/obsidian-plugin/tests/codex-chat-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AcpCodexChatAdapter } from "../src/codex-chat-adapter";

describe("AcpCodexChatAdapter", () => {
  it("sends message with active note context", async () => {
    const sent: unknown[] = [];
    const adapter = new AcpCodexChatAdapter({
      send: async (payload) => {
        sent.push(payload);
        return { content: "I found one tag idea.", toolRequests: [] };
      }
    });

    const response = await adapter.send({
      message: "Suggest tags",
      context: {
        status: "ready",
        message: "ready",
        note: { path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [], headings: [], links: [] },
        noteChunks: [],
        relatedNotes: [],
        sourceExcerpts: []
      }
    });

    expect(response.content).toContain("tag");
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-chat-adapter.test.ts
```

Expected: fail because `AcpCodexChatAdapter` does not exist.

- [ ] **Step 3: Add transport-backed adapter**

Modify `apps/obsidian-plugin/src/codex-chat-adapter.ts`:

```ts
export type CodexChatTransport = {
  send(payload: { message: string; context: ActiveNoteContextPacket }): Promise<CodexChatAdapterResponse>;
};

export class AcpCodexChatAdapter implements CodexChatAdapter {
  constructor(private readonly transport: CodexChatTransport) {}

  async send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse> {
    if (request.context.status !== "ready") {
      return {
        content: request.context.message,
        toolRequests: []
      };
    }

    return this.transport.send({
      message: request.message,
      context: request.context
    });
  }
}
```

- [ ] **Step 4: Wire real ACP transport only after research confirms command shape**

Add the real process/stdio transport in a separate commit after confirming Codex ACP command and handshake on Windows. Keep tests transport-injected so the adapter can be verified without launching Codex.

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- codex-chat-adapter.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/codex-chat-adapter.ts apps/obsidian-plugin/tests/codex-chat-adapter.test.ts
git commit -m "feat: add acp codex chat adapter"
```

---

## Phase 6: Inline Approval And Proposal Staging

### Task 6.1: Add Inline Approval State For Current-Note Tag Updates

**Files:**
- Create: `apps/obsidian-plugin/src/inline-approval-state.ts`
- Modify: `apps/obsidian-plugin/src/studio-view.ts`
- Reuse: `apps/obsidian-plugin/src/tag-write-proposal-controller.ts`
- Test: `apps/obsidian-plugin/tests/inline-approval-state.test.ts`

- [ ] **Step 1: Write failing inline approval tests**

Create `apps/obsidian-plugin/tests/inline-approval-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildInlineApprovalState } from "../src/inline-approval-state";

describe("buildInlineApprovalState", () => {
  it("allows inline approval for current-note tag updates", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_tags",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("inline");
    expect(state.message).toContain("current note");
  });

  it("routes multi-file changes to the review queue", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_links",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: true
    });

    expect(state.surface).toBe("review_queue");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- inline-approval-state.test.ts
```

Expected: fail because inline state does not exist.

- [ ] **Step 3: Add inline approval state**

Create `apps/obsidian-plugin/src/inline-approval-state.ts`:

```ts
import type { VaultWriteOperationType } from "@vaultseer/core";

export type InlineApprovalSurface = "inline" | "review_queue";

export type BuildInlineApprovalStateInput = {
  operationType: VaultWriteOperationType;
  targetPath: string;
  activePath: string | null;
  touchesMultipleFiles: boolean;
};

export type InlineApprovalState = {
  surface: InlineApprovalSurface;
  message: string;
};

export function buildInlineApprovalState(input: BuildInlineApprovalStateInput): InlineApprovalState {
  if (input.touchesMultipleFiles || input.targetPath !== input.activePath || input.operationType === "create_note_from_source") {
    return {
      surface: "review_queue",
      message: "This change belongs in the guarded review queue."
    };
  }

  return {
    surface: "inline",
    message: "This current note change can be reviewed inline."
  };
}
```

- [ ] **Step 4: Wire Studio Note mode to show inline current-note tag actions**

Modify `apps/obsidian-plugin/src/studio-view.ts` so Note mode can reuse the same tag proposal staging flow as `workbench-view.ts`. Keep actual write application in existing guarded apply paths until a dedicated inline apply path is tested.

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- inline-approval-state.test.ts tag-write-proposal-controller.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/inline-approval-state.ts apps/obsidian-plugin/src/studio-view.ts apps/obsidian-plugin/tests/inline-approval-state.test.ts
git commit -m "feat: route current note approvals"
```

---

## Phase 7: Managed Visible Source Workspaces

### Task 7.1: Expand Source Workspace Status Model

**Files:**
- Modify: `packages/core/src/source/types.ts`
- Modify: `packages/core/tests/source-workspace-store.test.ts`

- [ ] **Step 1: Add source status test**

Modify `packages/core/tests/source-workspace-store.test.ts` to assert a source can use:

```ts
status: "reviewed"
```

and remains distinct from canonical note records.

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- source-workspace-store.test.ts
```

Expected: fail if the status union rejects reviewed state.

- [ ] **Step 3: Expand status union**

Modify `packages/core/src/source/types.ts`:

```ts
export type SourceWorkspaceStatus =
  | "imported"
  | "extracting"
  | "extracted"
  | "indexed"
  | "degraded"
  | "failed"
  | "reviewed"
  | "source_note_proposed"
  | "source_note_created";
```

Update any exhaustive status handling in preview/search tests to preserve current behavior for `failed` and treat all non-failed statuses as previewable evidence.

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- source-workspace-store.test.ts source-lexical-search.test.ts source-note-proposal.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add packages/core/src/source/types.ts packages/core/tests/source-workspace-store.test.ts
git commit -m "feat: expand source workspace states"
```

### Task 7.2: Materialize Managed Source Folder Files

**Files:**
- Create: `apps/obsidian-plugin/src/source-workspace-materializer.ts`
- Test: `apps/obsidian-plugin/tests/source-workspace-materializer.test.ts`

- [ ] **Step 1: Write failing materializer tests**

Create `apps/obsidian-plugin/tests/source-workspace-materializer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildManagedSourceWorkspacePlan } from "../src/source-workspace-materializer";

describe("buildManagedSourceWorkspacePlan", () => {
  it("places generated source files in a managed visible folder", () => {
    const plan = buildManagedSourceWorkspacePlan({
      managedSourceFolder: "Sources",
      topic: "Electronics",
      sourceTitle: "Art of Electronics",
      extractedMarkdown: "# Chapter 1",
      diagnosticsMarkdown: "No warnings."
    });

    expect(plan.files.map((file) => file.path)).toEqual([
      "Sources/Electronics/Art of Electronics/source.md",
      "Sources/Electronics/Art of Electronics/review.md",
      "Sources/Electronics/Art of Electronics/extraction-report.md"
    ]);
    expect(plan.files[0]?.managedRole).toBe("source");
    expect(plan.files[1]?.managedRole).toBe("review");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- source-workspace-materializer.test.ts
```

Expected: fail because materializer does not exist.

- [ ] **Step 3: Add materializer planner**

Create `apps/obsidian-plugin/src/source-workspace-materializer.ts`:

```ts
import { normalizeVaultFolderPath } from "./settings-model";

export type ManagedSourceFileRole = "source" | "review" | "extraction_report";

export type ManagedSourceWorkspaceFile = {
  path: string;
  content: string;
  managedRole: ManagedSourceFileRole;
};

export type ManagedSourceWorkspacePlan = {
  workspaceFolder: string;
  files: ManagedSourceWorkspaceFile[];
};

export type BuildManagedSourceWorkspacePlanInput = {
  managedSourceFolder: string;
  topic: string;
  sourceTitle: string;
  extractedMarkdown: string;
  diagnosticsMarkdown: string;
};

export function buildManagedSourceWorkspacePlan(input: BuildManagedSourceWorkspacePlanInput): ManagedSourceWorkspacePlan {
  const root = normalizeVaultFolderPath(input.managedSourceFolder, "Sources");
  const topic = sanitizePathSegment(input.topic);
  const sourceTitle = sanitizePathSegment(input.sourceTitle);
  const workspaceFolder = `${root}/${topic}/${sourceTitle}`;

  return {
    workspaceFolder,
    files: [
      {
        path: `${workspaceFolder}/source.md`,
        content: input.extractedMarkdown,
        managedRole: "source"
      },
      {
        path: `${workspaceFolder}/review.md`,
        content: createReviewTemplate(input.sourceTitle),
        managedRole: "review"
      },
      {
        path: `${workspaceFolder}/extraction-report.md`,
        content: input.diagnosticsMarkdown,
        managedRole: "extraction_report"
      }
    ]
  };
}

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createReviewTemplate(sourceTitle: string): string {
  return `# Review - ${sourceTitle}\n\n## Questions\n\n## Corrections\n\n## Candidate notes\n`;
}
```

- [ ] **Step 4: Do not write files yet**

This task only creates the plan. A separate approved source-workspace creation task must apply it through a guarded or explicitly approved flow. Do not call `vault.create` from this file.

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- source-workspace-materializer.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/source-workspace-materializer.ts apps/obsidian-plugin/tests/source-workspace-materializer.test.ts
git commit -m "feat: plan visible source workspaces"
```

---

## Phase 8: Plans And Releases

### Task 8.1: Add Plan/Release Frontmatter Contracts

**Files:**
- Create: `packages/core/src/plans/plan-release-types.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/plan-release-types.test.ts`

- [ ] **Step 1: Write failing plan/release tests**

Create `packages/core/tests/plan-release-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlanFrontmatter, buildReleaseFrontmatter } from "../src/plans/plan-release-types";

describe("plan/release frontmatter", () => {
  it("builds plan frontmatter", () => {
    expect(buildPlanFrontmatter({ status: "active", relatedNotes: ["[[VHDL Timing]]"], sourceWorkspaces: [] })).toEqual({
      vaultseer_type: "plan",
      status: "active",
      related_notes: ["[[VHDL Timing]]"],
      source_workspaces: []
    });
  });

  it("builds release frontmatter", () => {
    expect(buildReleaseFrontmatter({ status: "draft", releaseTarget: "vaultseer-v1", date: "2026-05-02", relatedPlans: [] })).toEqual({
      vaultseer_type: "release",
      status: "draft",
      release_target: "vaultseer-v1",
      date: "2026-05-02",
      related_plans: []
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- plan-release-types.test.ts
```

Expected: fail because contracts do not exist.

- [ ] **Step 3: Add contracts**

Create `packages/core/src/plans/plan-release-types.ts`:

```ts
export type VaultseerPlanStatus = "draft" | "active" | "paused" | "done";
export type VaultseerReleaseStatus = "draft" | "ready" | "released";

export type VaultseerPlanFrontmatter = {
  vaultseer_type: "plan";
  status: VaultseerPlanStatus;
  related_notes: string[];
  source_workspaces: string[];
};

export type VaultseerReleaseFrontmatter = {
  vaultseer_type: "release";
  status: VaultseerReleaseStatus;
  release_target: string;
  date: string;
  related_plans: string[];
};

export function buildPlanFrontmatter(input: {
  status: VaultseerPlanStatus;
  relatedNotes: string[];
  sourceWorkspaces: string[];
}): VaultseerPlanFrontmatter {
  return {
    vaultseer_type: "plan",
    status: input.status,
    related_notes: input.relatedNotes,
    source_workspaces: input.sourceWorkspaces
  };
}

export function buildReleaseFrontmatter(input: {
  status: VaultseerReleaseStatus;
  releaseTarget: string;
  date: string;
  relatedPlans: string[];
}): VaultseerReleaseFrontmatter {
  return {
    vaultseer_type: "release",
    status: input.status,
    release_target: input.releaseTarget,
    date: input.date,
    related_plans: input.relatedPlans
  };
}
```

- [ ] **Step 4: Export contracts**

Modify `packages/core/src/index.ts`:

```ts
export { buildPlanFrontmatter, buildReleaseFrontmatter } from "./plans/plan-release-types";
export type {
  VaultseerPlanFrontmatter,
  VaultseerPlanStatus,
  VaultseerReleaseFrontmatter,
  VaultseerReleaseStatus
} from "./plans/plan-release-types";
```

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/core test -- plan-release-types.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/core/src/plans packages/core/src/index.ts packages/core/tests/plan-release-types.test.ts
git commit -m "feat: add plan release note contracts"
```

### Task 8.2: Add Plan/Release Proposal Controller

**Files:**
- Create: `apps/obsidian-plugin/src/plan-release-controller.ts`
- Test: `apps/obsidian-plugin/tests/plan-release-controller.test.ts`

- [ ] **Step 1: Write failing controller tests**

Create `apps/obsidian-plugin/tests/plan-release-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlanNoteMarkdown, buildReleaseNoteMarkdown } from "../src/plan-release-controller";

describe("plan-release-controller", () => {
  it("builds a plan note markdown body", () => {
    const markdown = buildPlanNoteMarkdown({
      title: "VHDL Study Plan",
      status: "active",
      relatedNotes: ["[[VHDL Timing]]"],
      sourceWorkspaces: []
    });

    expect(markdown).toContain("vaultseer_type: plan");
    expect(markdown).toContain("# VHDL Study Plan");
  });

  it("builds a release note markdown body", () => {
    const markdown = buildReleaseNoteMarkdown({
      title: "Vaultseer Native Studio v1",
      status: "draft",
      releaseTarget: "vaultseer-native-studio-v1",
      date: "2026-05-02",
      relatedPlans: []
    });

    expect(markdown).toContain("vaultseer_type: release");
    expect(markdown).toContain("# Vaultseer Native Studio v1");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- plan-release-controller.test.ts
```

Expected: fail because controller does not exist.

- [ ] **Step 3: Add Markdown builders**

Create `apps/obsidian-plugin/src/plan-release-controller.ts`:

```ts
import {
  buildPlanFrontmatter,
  buildReleaseFrontmatter,
  type VaultseerPlanStatus,
  type VaultseerReleaseStatus
} from "@vaultseer/core";

export function buildPlanNoteMarkdown(input: {
  title: string;
  status: VaultseerPlanStatus;
  relatedNotes: string[];
  sourceWorkspaces: string[];
}): string {
  const frontmatter = buildPlanFrontmatter({
    status: input.status,
    relatedNotes: input.relatedNotes,
    sourceWorkspaces: input.sourceWorkspaces
  });
  return `${toYaml(frontmatter)}\n# ${input.title}\n\n## Goal\n\n## Steps\n\n## Notes\n`;
}

export function buildReleaseNoteMarkdown(input: {
  title: string;
  status: VaultseerReleaseStatus;
  releaseTarget: string;
  date: string;
  relatedPlans: string[];
}): string {
  const frontmatter = buildReleaseFrontmatter({
    status: input.status,
    releaseTarget: input.releaseTarget,
    date: input.date,
    relatedPlans: input.relatedPlans
  });
  return `${toYaml(frontmatter)}\n# ${input.title}\n\n## Summary\n\n## Changes\n\n## Verification\n\n## Release decision\n`;
}

function toYaml(value: Record<string, unknown>): string {
  const lines = Object.entries(value).flatMap(([key, raw]) => {
    if (Array.isArray(raw)) {
      return raw.length === 0 ? [`${key}: []`] : [`${key}:`, ...raw.map((item) => `  - "${String(item).replace(/"/g, '\\"')}"`)];
    }
    return [`${key}: ${String(raw)}`];
  });
  return ["---", ...lines, "---"].join("\n");
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- plan-release-controller.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/plan-release-controller.ts apps/obsidian-plugin/tests/plan-release-controller.test.ts
git commit -m "feat: build plan release notes"
```

---

## Phase 9: User-Initiated Fact Checking

### Task 9.1: Add Fact-Check Request Shape

**Files:**
- Create: `apps/obsidian-plugin/src/fact-check-controller.ts`
- Test: `apps/obsidian-plugin/tests/fact-check-controller.test.ts`

- [ ] **Step 1: Write failing fact-check tests**

Create `apps/obsidian-plugin/tests/fact-check-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFactCheckRequest } from "../src/fact-check-controller";

describe("buildFactCheckRequest", () => {
  it("requires explicit user initiation", () => {
    const request = buildFactCheckRequest({
      initiatedByUser: true,
      claim: "74HC595 maximum clock frequency is 100 MHz.",
      sourceEvidence: [{ label: "datasheet page 4", text: "fmax = 100 MHz" }],
      vaultContext: []
    });

    expect(request.ok).toBe(true);
  });

  it("rejects background fact checks", () => {
    const request = buildFactCheckRequest({
      initiatedByUser: false,
      claim: "74HC595 maximum clock frequency is 100 MHz.",
      sourceEvidence: [],
      vaultContext: []
    });

    expect(request.ok).toBe(false);
    expect(request.message).toContain("user initiated");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- fact-check-controller.test.ts
```

Expected: fail because controller does not exist.

- [ ] **Step 3: Add fact-check request builder**

Create `apps/obsidian-plugin/src/fact-check-controller.ts`:

```ts
export type FactCheckEvidence = {
  label: string;
  text: string;
};

export type FactCheckRequest =
  | {
      ok: true;
      claim: string;
      sourceEvidence: FactCheckEvidence[];
      vaultContext: FactCheckEvidence[];
      instruction: string;
    }
  | {
      ok: false;
      message: string;
    };

export function buildFactCheckRequest(input: {
  initiatedByUser: boolean;
  claim: string;
  sourceEvidence: FactCheckEvidence[];
  vaultContext: FactCheckEvidence[];
}): FactCheckRequest {
  if (!input.initiatedByUser) {
    return { ok: false, message: "Online fact checking must be user initiated." };
  }

  const claim = input.claim.trim();
  if (claim.length === 0) {
    return { ok: false, message: "Choose a claim before requesting a fact check." };
  }

  return {
    ok: true,
    claim,
    sourceEvidence: input.sourceEvidence,
    vaultContext: input.vaultContext,
    instruction:
      "Fact-check this single claim using online sources only because the user explicitly requested it. Return source claim, vault context, online evidence, conflicts, and suggested note text."
  };
}
```

- [ ] **Step 4: Wire through Chat as a tool request, not background work**

Expose a Chat-mode button or slash command for "Fact-check selected claim" only after the active note/source context can provide the claim text. Do not schedule automatic checks.

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @vaultseer/obsidian-plugin test -- fact-check-controller.test.ts
corepack pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add apps/obsidian-plugin/src/fact-check-controller.ts apps/obsidian-plugin/tests/fact-check-controller.test.ts
git commit -m "feat: shape explicit fact check requests"
```

---

## Phase 10: Polish, Hardening, And Plugin Trial

### Task 10.1: End-To-End Verification

**Files:**
- Modify if needed: `docs/go-live-smoke-checklist.md`
- Modify if needed: `docs/roadmap.md`
- No production code changes unless tests reveal a defect.

- [ ] **Step 1: Run full automated gate**

Run:

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Re-scan write surface**

Run:

```powershell
Select-String -Path "apps/obsidian-plugin/src/*.ts" -Pattern "vault\\.create|vault\\.modify|vault\\.delete|vault\\.rename"
```

Expected:

- existing guarded write port write calls only;
- any new source materialization writes must be explicitly approved and documented if introduced by source materialization work.

- [ ] **Step 3: Manual Obsidian smoke test**

In Obsidian desktop:

1. Reload Obsidian.
2. Open command palette.
3. Run `Vaultseer: Open native Studio`.
4. Open a Markdown note.
5. Confirm Studio updates to that note.
6. Switch to Chat mode.
7. Confirm chat shows Codex runtime state.
8. Start Codex from Studio if native launcher is enabled.
9. Ask a note-scoped question.
10. Confirm no Markdown file changes until an approval action is used.

Expected: Studio works as a helper around the active note.

- [ ] **Step 4: Update docs**

Update:

- `docs/roadmap.md` with native Studio progress.
- `docs/go-live-smoke-checklist.md` with Studio smoke steps.
- `docs/platform-principles.md` only if a new non-negotiable invariant was added during implementation.

- [ ] **Step 5: Commit final docs**

Run:

```powershell
git add docs/roadmap.md docs/go-live-smoke-checklist.md docs/platform-principles.md
git commit -m "docs: update native studio rollout guidance"
```

---

## Risks And Guardrails

- **Codex process launch can be flaky inside Obsidian.** Keep launch state explicit and test with injected launchers before real process wiring.
- **ACP protocol details may differ from assumptions.** Study `research/obsidian-agent-client` and adapt only confirmed surfaces.
- **Chat can accidentally become a second editor.** Keep chat ephemeral and force all durable output into proposals or explicit Markdown note creation.
- **Visible source workspaces can pollute canonical notes.** Keep managed source folder labeling and result labels strict.
- **Inline approval can weaken safety.** Inline approval still needs preview, expected hash, and recorded decision.
- **Online fact checking can get noisy.** Start with explicit single-claim checks only.

## Required Final Verification Before Trial

Run:

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
git diff --check
Select-String -Path "apps/obsidian-plugin/src/*.ts" -Pattern "vault\\.create|vault\\.modify|vault\\.delete|vault\\.rename"
```

Manual trial in `F:\Dev\Obsidian` should confirm:

- Studio opens.
- Active note follows Obsidian.
- Chat is ephemeral.
- Codex runtime state is understandable.
- Controlled tools can search/inspect but not write directly.
- Inline approvals and review queue remain distinct.
- Source files are visibly managed as evidence.
- No hidden web research occurs.

## Plan Self-Review

- Spec coverage: every accepted design decision maps to a phase above.
- Scope control: the plan is split into small commits and keeps Codex process launch behind an injected interface before real ACP wiring.
- Write safety: no task grants Codex direct vault mutation.
- Testability: every new pure state or controller has a focused Vitest test before implementation.
- Reuse: ACP research is a required task before the real adapter is wired.
- Remaining deliberate follow-up: actual high-fidelity source image/table preview and batch fact-checking remain outside this first native Studio plan.
