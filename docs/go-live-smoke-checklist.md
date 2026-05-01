# Vaultseer Limited Go-Live Smoke Checklist

This checklist is for a small personal vault trial. It verifies that Vaultseer can index, search, review a source-note proposal, and create one approved note without broad write access.

## Preconditions

- Obsidian can load the local Vaultseer plugin build.
- The vault has the configured source note folder. The default folder is `Source Notes`.
- The vault contains at least one ordinary Markdown note.
- Optional semantic features can stay disabled for this smoke test.

Vaultseer does not create missing folders during source-note apply. If the configured source note folder is `Literature/Source Inbox`, create that folder in Obsidian before pressing `Create note`.

## Smoke Path

1. Open Obsidian with the test vault.
   - Expected: Vaultseer settings show a source note folder, defaulting to `Source Notes`.
   - Verify: change it only if you want approved source notes to land somewhere else, then create that folder manually.
2. Run `Vaultseer: Rebuild read-only vault index`.
   - Expected: a notice reports the number of indexed notes.
   - Verify: run `Vaultseer: Check read-only vault index health`; the mirror should be ready or explain why it is stale/degraded.
3. Run `Vaultseer: Search read-only vault index`.
   - Expected: existing vault notes appear for normal search terms.
   - Verify: clicking a result opens the note and does not edit it.
4. Open or choose a text/code source file and run one source intake command:
   - `Vaultseer: Import active text/code file as source workspace`
   - `Vaultseer: Choose text/code file to import as source workspace`
   - Expected: a source workspace is stored.
5. Run `Vaultseer: Search stored source workspaces`.
   - Expected: the imported source appears in search results.
   - Verify: opening the source preview shows extracted text and a deterministic note proposal.
6. From the source preview, review the source-note creation proposal.
   - Expected: the preview shows the target path, source provenance, linked suggestions, and an added-file diff.
   - Verify: no Markdown note is created at this point.
7. Run `Vaultseer: Open guarded write review queue`.
   - Expected: the stored source-note write proposal appears.
8. Approve the proposal, then press `Create note`.
   - Expected: Vaultseer creates exactly one new Markdown note at the target path and records an applied result.
   - Verify: the note exists in Obsidian, the queue shows an applied record, and pressing create again is disabled.

## Expected Failure Checks

- If the target note already exists, apply should fail before writing and record `target already exists`.
- If the target folder does not exist, apply should fail before writing and record `target folder does not exist`.
- If the approved preview hash does not match the operation, apply should fail before writing.
- If Obsidian writes different content than expected, apply should fail verification instead of recording success.

## Current Write Limits

The limited go-live write surface can only create a new Markdown note from an approved source-note proposal. Core can plan tag/frontmatter update previews, but the plugin does not apply those previews yet. It cannot:

- edit existing notes;
- apply tag insertions or tag renames;
- insert links;
- apply frontmatter updates;
- copy staged images or attachments;
- batch apply proposals;
- apply anything automatically.
