# Guarded Review Queue UX Hardening Design

Date: 2026-05-01

## Purpose

Vaultseer is close to a limited personal-vault trial, but the guarded write review queue still reads like an implementation dump. This slice makes the queue safer and calmer for daily use by improving labels, disabled-action explanations, stale/failure messaging, and operation summaries.

This is a polish and hardening slice. It must not widen the write surface.

## Current Behavior

The guarded write review queue currently lists persisted operations, decisions, apply results, linked suggestion IDs, and preview diffs.

Implemented operation types:

- `create_note_from_source`: applyable after approval if the target file is still absent and the parent folder exists.
- `update_note_tags`: applyable after approval if the current file hash still matches the reviewed content.
- `update_note_links`: reviewable only; not applyable yet.

The UI exposes the necessary information, but it does not explain action availability well enough for a non-programmer. In particular, link proposals show as queue items but apply is simply unavailable.

## Design Goals

- Make every queue item explain what it can do right now.
- Make disabled apply buttons explain why they are disabled.
- Make review state and apply state readable without knowing internal terms.
- Keep the core state builder testable outside Obsidian.
- Avoid adding new write paths, new dependencies, or broad UI redesign.

## Non-Goals

- Do not make `update_note_links` applyable in this slice.
- Do not add batch approval or batch apply.
- Do not add rollback.
- Do not redesign the full workbench.
- Do not introduce a UI framework.

## Proposed Approach

Add a small presentation layer to `apps/obsidian-plugin/src/write-review-queue-state.ts`:

- `operationTypeLabel`: already exists; keep it.
- `operationBadge`: short user-facing label such as `Create note`, `Tag update`, `Link preview`.
- `applyAvailabilityLabel`: human-readable explanation such as `Ready to apply`, `Approve before applying`, `Already applied`, `Preview only`, or `Target changed since review`.
- `applyButtonLabel`: move button-label logic out of the modal and into the state builder.

Update `apps/obsidian-plugin/src/write-review-queue-modal.ts` to render those labels instead of re-deriving policy in the UI. This keeps the modal mostly as a renderer and keeps apply rules tested in one place.

## Data Flow

1. The modal loads operations, decisions, and apply results from `VaultseerStore`.
2. `buildWriteReviewQueueState` merges those records into queue items.
3. Each queue item receives:
   - operation identity
   - review decision state
   - latest apply result state
   - apply availability explanation
   - preview diff
4. The modal renders the queue item and uses `canApply` only to enable or disable the apply button.
5. Actual writes still go through `applyApprovedVaultWriteOperation` and `VaultWritePort`.

## State Rules

- Pending, deferred, or rejected operations cannot be applied.
- Approved source-note creation can be applied unless it has already succeeded.
- Approved tag updates can be applied unless they have already succeeded.
- Failed apply results can only be retried when the failure record is retryable.
- Link updates remain preview-only and cannot be applied even when approved.

## Testing Plan

Add focused tests to `apps/obsidian-plugin/tests/write-review-queue-state.test.ts`:

- pending source-note operation reports `Approve before applying`;
- approved source-note operation reports `Ready to apply`;
- applied operation reports `Already applied`;
- failed retryable operation reports `Ready to retry`;
- failed non-retryable operation reports a blocked failure message;
- approved `update_note_links` reports `Preview only` and `canApply: false`.

No Obsidian runtime test is required for this slice because the policy belongs in the state builder. Existing modal tests are not present; the modal remains thin rendering code.

## Documentation Updates

Update:

- `docs/architecture.md`: note that queue apply availability is state-derived and link proposals are preview-only.
- `docs/go-live-smoke-checklist.md`: clarify that the queue should explain why link apply is unavailable.
- `docs/roadmap.md`: mark review queue UX hardening as part of Phase 6 polish.

## Acceptance Criteria

- The queue state exposes a clear apply availability explanation for every operation.
- The modal no longer owns apply-button policy beyond rendering and click handling.
- `update_note_links` remains non-applyable.
- Tests, typecheck, build, and write-surface scan pass.
- No new Obsidian write calls are introduced.
