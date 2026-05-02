# Vaultseer Native Studio Design

Date: 2026-05-02

## Purpose

Vaultseer should become the native Obsidian helper layer for note creation, literature research, search, planning, release notes, and guarded vault changes. The active Obsidian note remains the primary workspace. Vaultseer helps around that note instead of replacing Obsidian as the editor.

This design supersedes the earlier assumption that Vaultseer is mainly a side utility for search, source intake, and review queue commands. The new target is a first-class native studio inside Obsidian with Codex chat, note-aware context, source research, and safe write approvals.

## Product Position

Vaultseer is not a production multi-user system. It is a personal knowledge and research workbench for one Obsidian vault.

The product should optimize for:

- writing and improving Markdown notes;
- finding related notes and weak connections;
- suggesting tags, aliases, links, headings, and formatting changes;
- converting downloaded literature and source files into searchable source workspaces;
- creating reviewed canonical notes from evidence;
- planning and release-note workflows inside ordinary Markdown files;
- explicit user approval before vault mutation.

The product should not optimize for:

- autonomous vault cleanup;
- hidden background web research;
- direct Codex file mutation;
- replacing Obsidian's editor;
- storing every chat transcript as a note;
- broad cross-platform process management in the first native-chat slice.

## Approved Design Decisions

### Studio Shape

Vaultseer should use a **Mode-Based Studio** shape with the following first-version modes:

- **Note:** active note context, metadata, tags, links, sanity checks, and inline approvals.
- **Chat:** native Codex chat that follows the active note.
- **Search:** canonical notes plus managed source material, clearly labeled.
- **Sources:** literature/source workspaces, extraction status, source review, and source-to-note preparation.
- **Plans:** structured Markdown planning notes with light frontmatter conventions.
- **Releases:** structured Markdown release, changelog, and go-live notes with light frontmatter conventions.
- **Review:** guarded write proposals and larger multi-note changes.

The first opening experience should be **current-note first**. Vaultseer should feel attached to the note the user is already editing.

### Chat Persistence

Native chat is **ephemeral by default**. Chat messages should remain in Vaultseer UI state while useful, but should not automatically create Markdown chat-log notes.

Durable output is explicit:

- a proposed note;
- a proposed metadata/tag/link change;
- a source review note;
- a plan note;
- a release note;
- a user-approved saved summary.

### Codex Runtime

Vaultseer should start Codex itself from inside Obsidian for the first native-chat version.

The first implementation is **Windows-first** and targets the user's current desktop workflow. It may later grow cross-platform support, but initial stability should focus on Windows Obsidian desktop.

Vaultseer needs a Codex process manager that can:

- start Codex;
- report starting/running/stopped/failed state;
- restart Codex;
- surface useful error messages;
- keep chat bound to the active note;
- avoid blocking the Obsidian UI.

Mobile Obsidian is out of scope for native process launch.

### Active Note Context

One chat follows the active note. When the user changes notes, Vaultseer updates the context around the new active note.

The chat context may include:

- current note path, title, aliases, tags, frontmatter, headings, links, backlinks, and selected text when available;
- index health;
- related notes;
- source excerpts;
- staged suggestions;
- pending review items involving the note.

Context should be assembled by Vaultseer and sent to Codex as structured evidence, not as an unbounded dump.

### Codex Permission Model

Codex may automatically:

- read active-note context supplied by Vaultseer;
- search canonical notes;
- search managed source material;
- inspect tags, aliases, links, and backlinks;
- identify related notes;
- detect narrow sanity issues.

Codex may propose or stage:

- tags;
- aliases;
- metadata/frontmatter updates;
- related links;
- heading or structure changes;
- summaries;
- source notes;
- atomic concept notes;
- plan notes;
- release notes;
- fact-check requests.

Codex may write only after approval:

- metadata/frontmatter changes;
- tag updates;
- link insertions;
- new canonical notes;
- source review notes;
- plan notes;
- release notes.

Codex must never silently:

- delete files;
- rename files;
- mass-edit notes;
- run broad cleanup;
- perform web research;
- create notes;
- bypass preview, approval, hash check, and decision recording.

### Approval Model

Vaultseer should use a mixed approval model:

- **Inline approval** for small current-note changes, such as tags, aliases, frontmatter fields, simple formatting, and narrow link proposals.
- **Review queue approval** for new notes, source-to-note creation, cross-note link updates, batch tag normalization, and any change touching multiple files.

All writes still follow the existing safety ladder:

1. Analyze current vault state.
2. Produce a proposed operation.
3. Show a preview diff.
4. Verify the current file hash still matches the analyzed hash.
5. Apply only after explicit approval.
6. Record the decision and result.
7. Provide recovery notes when possible.

Inline approval is allowed to be fast, but it is not allowed to be hidden.

## Literature And Source Research Model

Vaultseer should support downloaded books, datasheets, papers, presentations, code, scripts, and other technical source material. Typical first use cases include electronics design books, VHDL material, C++ references, component datasheets, design presentations, and converted Markdown.

### Source Pipeline

Source material should move through this pipeline:

1. **Import source:** user selects or adds a source file.
2. **Extract:** Vaultseer converts the file to Markdown plus staged images, tables, and diagnostics when supported.
3. **Store source workspace:** extracted material appears in a managed source folder inside the Obsidian vault.
4. **Chunk and index:** Vaultseer builds lexical chunks and semantic vectors for source material in a source-specific namespace.
5. **Search and inspect:** user and Codex can search source workspaces separately from canonical notes.
6. **Review:** user and Codex discuss the source in an adjacent review note.
7. **Create source note:** user approves a reviewed source summary note.
8. **Extract concept notes:** user may later ask Vaultseer to propose smaller atomic concept notes from the reviewed source.

### Managed Source Folder

Extracted source material should be visible in Obsidian, but clearly separated from canonical notes.

Example:

```text
Sources/
  Electronics/
    Art of Electronics/
      source.md
      review.md
      extraction-report.md
      images/
      tables/
```

Rules:

- `source.md` is generated evidence and treated as read-only by Vaultseer.
- `review.md` is editable and used for user comments, corrections, questions, summaries, and draft thinking.
- `extraction-report.md` stores conversion diagnostics and provenance.
- `images/` and `tables/` contain extracted or staged assets when available.
- Canonical knowledge notes are created elsewhere in the normal vault structure after review.

Vaultseer should label results as canonical-note results, managed-source results, or review-note results.

### Source Notes And Concept Notes

Canonical note creation should happen in two deliberate steps:

1. Create one reviewed source note from the source workspace.
2. Optionally run an "extract concept notes" follow-up action.

This avoids a large automatic note dump and keeps user involvement central.

### Evidence And Claims

Vaultseer should distinguish:

- what a source claims;
- what existing vault notes say;
- what Codex infers;
- what an online fact check supports or contradicts.

A proposed canonical note should include evidence links back to source chunks, pages, sections, tables, images, or review notes when available.

Codex may say "the source claims X" when backed by source evidence. Codex should not present "X is true" unless the user has accepted the source as trusted or explicitly requested external fact checking.

### Online Fact Checking

Web research and online fact checking are user-initiated only.

Vaultseer must not browse or fact-check online in the background. Valid user-initiated examples include:

- "Fact-check this claim."
- "Check if this datasheet value is current."
- "Find manufacturer documentation for this part."
- "Compare this book's claim with newer sources."
- "Verify this C++ or VHDL behavior against official docs."

The first implementation should support explicit single-claim checks before batch note-level fact checking.

Fact-check output should show:

- the source claim;
- relevant vault context;
- external sources checked;
- conflicts or uncertainty;
- suggested note text only after evidence is displayed.

## Plans And Releases

Plans and releases are ordinary Markdown notes with light frontmatter conventions. They are not hidden Vaultseer records.

Example plan note:

```yaml
---
vaultseer_type: plan
status: active
related_notes:
  - "[[VHDL Timing Notes]]"
source_workspaces:
  - "Sources/Electronics/Some Datasheet/source.md"
---
```

Example release note:

```yaml
---
vaultseer_type: release
status: draft
release_target: vaultseer-native-chat-v1
date: 2026-05-02
related_plans:
  - "[[Vaultseer Native Chat Plan]]"
---
```

Vaultseer may help draft and update these notes, but writes still use guarded operations.

## Architecture

The target architecture remains compatible with the current Vaultseer platform principles:

- Markdown files remain the source of truth.
- Obsidian metadata is the production metadata authority.
- Core logic consumes normalized records and remains Obsidian-free.
- Generated indexes are disposable and rebuildable.
- AI features are optional assistants, not required for lexical search.
- Analysis results do not directly mutate notes.

### Proposed New Boundaries

Add the following conceptual boundaries:

- **Studio UI:** renders modes, active-note panels, chat, search, sources, plans, releases, and review surfaces.
- **Active Note Context Builder:** converts current Obsidian state plus indexed evidence into bounded context packets for Codex.
- **Codex Process Manager:** starts, stops, restarts, and monitors the Windows-local Codex process.
- **Codex Chat Adapter:** sends user messages and context packets to Codex, receives responses and tool requests.
- **Vaultseer Tool Dispatcher:** exposes only safe Vaultseer tools to Codex, such as search, inspect, propose, and stage.
- **Source Workspace Manager:** maps extracted source workspaces to visible managed folders and protects generated evidence files.
- **Fact Check Controller:** runs only explicit user-initiated online checks and records cited evidence.
- **Plan/Release Note Service:** creates and updates structured Markdown plan and release proposals through guarded writes.

### Dependency Direction

Expected direction:

```text
Obsidian UI -> plugin controllers -> core services/contracts
Codex process -> Codex chat adapter -> Vaultseer tool dispatcher -> plugin/core services
write proposals -> guarded write queue/inline approval -> VaultWritePort -> Obsidian vault
```

Codex should not call Obsidian APIs directly. Codex should not receive raw write access to the vault.

## State Model

### Codex Runtime State

The process manager should model:

- `disabled`: native chat is not configured or is turned off.
- `stopped`: configured but not running.
- `starting`: launch requested and process handshake pending.
- `running`: chat can send messages.
- `failed`: launch, handshake, or runtime failed.
- `stopping`: shutdown requested.

Invalid transitions:

- `failed` -> `running` without a successful restart or reconnect.
- `disabled` -> `starting` without required settings.
- `running` -> note write without a Vaultseer proposed operation.

### Chat State

Native chat should model:

- active note identity;
- transient messages;
- current Codex runtime state;
- pending tool request, if any;
- last context packet summary;
- error or degraded state.

Chat history is not a durable note by default.

### Source Workspace State

Managed source workspaces should model:

- imported;
- extracting;
- extracted;
- indexed;
- degraded;
- failed;
- reviewed;
- source-note-proposed;
- source-note-created.

Source workspace state should not imply canonical note authority. A created canonical note must be represented separately.

## Reuse Notes

Before implementation, reuse should be checked against:

- `research/obsidian-agent-client` for ACP client, process/session handling, message state, permission handling, and vault context ideas;
- `research/plugins/obsidian-omnisearch` for search UX and indexed-document concepts;
- `research/plugins/metadatamenu` for metadata editing patterns and field conventions;
- `research/plugins/metadata-extractor` for vault metadata extraction patterns;
- local Mimir/Mimisbrunnr for bounded context packets, tool dispatch boundaries, source evidence, retrieval traces, and guarded promotion concepts.

Reuse means borrowing concepts and contracts before copying code. Vaultseer must keep its Obsidian-free core and guarded-write model.

## Non-Goals For The First Native Studio Plan

- No mobile support.
- No autonomous cleanup.
- No direct Codex write access.
- No automatic web research.
- No persistent full chat logs.
- No full project-management system.
- No hidden source workspace outside Obsidian for the primary source material.
- No automatic batch concept-note creation without explicit follow-up action.
- No broad cross-platform launcher until Windows-native behavior is stable.

## Acceptance Criteria

The first native-studio implementation plan should produce a sequence where:

- Vaultseer opens as a current-note-first studio inside Obsidian.
- Native Codex chat can be launched from Vaultseer on Windows.
- The chat follows the active note.
- Codex can request controlled Vaultseer tools for note search, source search, and current-note inspection.
- Codex can stage suggestions, but cannot apply writes directly.
- Small current-note changes can be approved inline.
- Larger or multi-note changes go through the review queue.
- Managed source workspaces are visible in the vault and distinguish evidence from canonical notes.
- Source search includes chunked/vectorized source material when indexing is available.
- Online fact checking is explicit and user initiated.
- Plans and releases are Markdown notes with light frontmatter conventions.
- Existing tests, typecheck, and build remain the required safety gate.
