# Vaultseer Limited Go-Live Smoke Checklist

This checklist is for a private beta trial on a small personal vault. Use a git-backed vault or a disposable copy.

## Preconditions

- Obsidian can load the local Vaultseer plugin build.
- The vault contains at least one ordinary Markdown note.
- The configured source note folder exists if source-note creation will be tested. The default folder is `Source Notes`.
- Semantic features may stay disabled unless you are testing embeddings.
- Marker may stay uninstalled unless you are testing PDF extraction.

## Private Beta Smoke Test

1. Plugin loads in Obsidian without a startup error.
   - Verify: disable and re-enable Vaultseer from Community Plugins.
2. Studio opens.
   - Verify: run `Vaultseer: Open native Studio`.
3. Index rebuild completes.
   - Verify: run `Rebuild read-only vault index`; the status strip shows `Ready`.
4. Search returns a known note.
   - Verify: run `Search read-only vault index` or search from Studio.
5. Chat can inspect the active note.
   - Verify: ask `review this note`; the response should mention active-note context.
6. Chat can draft a rewrite proposal.
   - Verify: ask `make this note clearer`; a redline proposal appears.
7. Redline diff is visible.
   - Verify: the proposal card shows `Preview diff`.
8. Edit draft opens and saves changed proposed Markdown.
   - Verify: press `Edit draft`, change a heading, save, and confirm the diff updates.
9. Write to note updates the active Markdown file.
   - Verify: press `Write to note`; the note content changes in Obsidian.
10. Completed proposal disappears from the active chat proposal list.
    - Verify: the current note says no proposed changes are waiting, or shows completed changes only in history.
11. Completed proposal remains visible in review/history.
    - Verify: expand completed changes or open the guarded write review queue.
12. Selected-text `Suggest rewrite` opens Studio with selected text context.
    - Verify: select text in a note, right-click, choose `Vaultseer: Suggest rewrite`.
13. Selected-text `Fact check` opens Studio with web-first wording.
    - Verify: select a factual claim, right-click, choose `Vaultseer: Fact check`.
14. Semantic provider disabled or unavailable shows clean degradation.
    - Verify: search still returns lexical results and says semantic search is unavailable, without raw `Failed to fetch` text.
15. Marker missing shows a clean setup diagnostic, or Marker installed extracts one small PDF.
    - Verify: run one PDF source extraction batch and inspect the source extraction status.

## Expected Failure Checks

- If the target note changed after a proposal was staged, writing should fail before changing the note.
- If the target folder for a new source note does not exist, source-note creation should fail before writing.
- If Marker is missing, the diagnostic should say Marker is not available and mention `marker_single`.
- If Marker times out, the diagnostic should say Marker extraction timed out.
- If OpenAI quota or billing is unavailable, Studio should show a quota/billing message without exposing secrets.

## Current Beta Limits

- Use the beta on a git-backed vault.
- Background multi-note edits are not part of the beta.
- Link insertion proposals exist, but link maintenance is still not a full vault-wide cleanup workflow.
- Source image/table preview is basic.
- Office, EPUB, and broad document intake are not beta-ready.
- Public Obsidian release packaging is not complete.
