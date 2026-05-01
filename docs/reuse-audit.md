# Reuse Audit

Vaultseer is reuse-first, but not copy-first. Before a new subsystem is added, check the local research repositories and the Mimir/Mimisbrunnr codebase, then adapt only the pieces that fit Vaultseer's scale and safety model.

Last refreshed: 2026-05-01. The local research clones were fetched and each checked as `0 0` against its configured upstream.

## Current Reuse Sources

| Source | Useful pattern | Vaultseer decision |
|---|---|---|
| `research/plugins/obsidian-tags-overview` | Builds a vault tag inventory from Obsidian metadata, expands nested tags, tracks tag paths and counts. | Reuse the nested-tag and tag-inventory idea. Keep the implementation in core over normalized `NoteRecord` values instead of adopting React views or plugin-local parsing. |
| `research/plugins/obsidian-dataview` | Treats page metadata as a stable indexed model and exposes full tags including parent tags. | Keep Obsidian metadata as the production authority, then normalize into core records. Avoid adding Dataview's query language or full page model. |
| `research/plugins/metadata-extractor` | Uses `metadataCache`, `getAllTags`, links, frontmatter, and backlinks as exportable metadata. | Keep metadata extraction at the Obsidian adapter boundary; do not make core parse Obsidian Markdown as the source of truth. |
| `research/plugins/obsidian-omnisearch` | Separates indexing from search, caches indexed documents, tracks stale documents, and explains search through weighted fields. | Already reflected in Vaultseer's rebuildable lexical index, stale mirror checks, and explainable search results. Do not import MiniSearch until a real scale problem appears. |
| `research/plugins/metadatamenu` | Uses explicit field models and Obsidian frontmatter APIs for metadata edits. | Save for Phase 6 guarded writes. Current Phase 5 work must stay read-only and produce proposals/evidence only. |
| `research/plugins/obsidian-db-folder` | Uses column/state models to control metadata views and table editing. | Useful later for structured review queues. Too heavy for the current workbench slice. |
| `research/obsidian-agent-client` and `research/codex-acp` | Existing chat/control surface for agent interaction. | Do not duplicate chat. Vaultseer should expose searchable context, suggestions, and safe note operations that can complement the user's existing chat plugin. |
| `F:/Dev/scripts/Mimir/mimir` | Stable chunking, vector namespace, source-workspace separation, queues, degraded fallback, and governed write boundaries. | Already adapted for chunk IDs, semantic/source queues, source workspaces, and the analysis-before-write rule. |

## Implemented From Phase 5

The first Phase 5 foundations are read-only tag suggestions, broken-link target suggestions, and narrow note sanity checks:

- Core owns `suggestTagsForNote`.
- The scorer uses the existing relationship graph and tag statistics instead of a new parser.
- Suggestions only use tags already present in the vault vocabulary.
- Suggestions exclude tags already present on the current note.
- Every suggestion includes evidence and a readable reason.
- The Obsidian workbench displays suggestions but does not apply them.
- Core also owns `suggestLinksForNote`.
- Link suggestions use unresolved links from the existing relationship graph and compare them to existing note aliases, titles, basenames, and path tokens.
- Suggested link targets are displayed as navigation-only buttons in the workbench; they do not rewrite Markdown links.
- Core owns `detectNoteQualityIssues`.
- Sanity checks reuse normalized note metadata and the existing relationship graph; they do not parse Markdown or apply formatting.
- The first diagnostics are intentionally narrow: missing frontmatter tags, duplicate aliases, empty title, malformed tags, and unresolved internal links.
- The workbench now reuses core `searchSemanticVectors` for related-note evidence when stored note vectors already exist. It does not call an embedding provider from the workbench.
- Core now owns `proposeSourceNote` for deterministic source-to-note seed proposals.
- Source proposals reuse the source workspace, source chunk, existing vault tag, existing note, and evidence-first contracts already used by search and suggestions.
- Source proposals stay read-only in the source preview modal; they produce a Markdown preview but no vault mutation or accepted decision.
- Core now owns `createSourceNoteProposalSuggestionRecords`, `mergeSuggestionRecords`, and `upsertDecisionRecord` so generated source proposal suggestions can be stored and reviewed independently from any future write operation.
- The source preview modal persists source proposal suggestion records through the existing rebuildable index store, preserving the analysis-before-write boundary.
- Core now owns the first guarded-write contract in `packages/core/src/writes/guarded-write.ts`.
- `planSourceNoteCreationOperation` adapts Mimir's governed-write idea to Vaultseer's smaller Obsidian scope: a source proposal becomes an explicit proposed operation with source provenance, target path, expected file hash, and a preview diff before any plugin adapter can write.
- `evaluateVaultWritePrecondition` and `createVaultWriteDecisionRecord` keep file-hash validation and approval metadata separate from analysis results.
- The source preview now opens a dry-run guarded note creation review modal. The modal renders operation metadata, precondition status, linked suggestions, and a preview diff, but it intentionally has no apply control.
- Core now persists guarded write operation records and write decision records through the store boundary.
- `mergeVaultWriteOperations` and `upsertVaultWriteDecisionRecord` keep generated operations and user decisions reviewable across sessions and mirror rebuilds without making them vault writes.
- The source preview persists the generated guarded source-note operation when it persists proposal suggestions, so the next review surface can load pending operations instead of regenerating them as hidden state.
- The guarded write review queue borrows the explicit review-control idea from metadata tooling without adopting direct frontmatter edits: decisions are stored as review metadata, while note mutation remains unavailable until a later `VaultWritePort` apply adapter exists.
- Workbench tag suggestions now borrow the same explicit proposal step: pressing `Stage tag review` stores `note_tag` suggestion records and an `update_note_tags` operation with evidence and a file hash. The guarded queue can apply an approved tag update only after rechecking that the current note hash still matches the reviewed content.
- Core now models and persists guarded write apply result records. Applied records capture before/after hashes and timestamp; failed records capture failure stage, expected hash, actual hash, retryability, and message so write work has an explicit recovery trail.
- The first controlled apply path now exists: approved `create_note_from_source` operations flow through `write-apply-controller.ts` and `obsidian-vault-write-port.ts`, reusing the Mimir-style governed write boundary while staying smaller than Mimir. The adapter can only call Obsidian `vault.create` for a new source-derived Markdown note and verifies the written content hash before recording success.

This deliberately borrows the useful behavior from Tags Overview, Dataview, Metadata Extractor, Omnisearch, and Mimir's explainable-evidence style while preserving Vaultseer's core/plugin boundary and write-safety ladder.

## Deferred

- No automatic tag writes.
- No controlled vocabulary editor.
- No tag merge or rename workflow.
- No Dataview-compatible query language.
- No MiniSearch dependency.
- No broad Obsidian editing command yet. Source-to-note creation and current-note tag additions can be applied from the guarded write queue after approval, but tag rename, link edit, arbitrary frontmatter cleanup, attachment copying, batch apply, and automatic apply remain deferred.
- No AI-authored source-to-note generation until the deterministic proposal shape has been reviewed against real sources.
- No workbench suggestion decision buttons yet; the store can record decisions, but the UI still needs an explicit review queue/control surface.
