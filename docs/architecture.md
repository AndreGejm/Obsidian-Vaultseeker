# Vaultseer Architecture

Vaultseer is a stable personal note-management platform for an Obsidian vault. The architecture should favor correctness, explainability, recovery, and safe change review over rapid feature delivery.

Vaultseer is built around a strict analysis-before-write rule:

> No analysis result may directly mutate a note. All mutations must first become an explicit proposed operation with a target path, expected file hash, preview diff, and decision record.

The near-term architecture target is a trustworthy read-only mirror of the vault. Search, suggestions, semantic indexing, and write actions must build on that mirror rather than bypass it.

## Boundaries

- `packages/core` is Obsidian-free. It receives normalized adapter input, validates it, and builds deterministic indexes.
- `apps/obsidian-plugin` owns Obsidian integration, settings, commands, views, and later guarded writes.
- Markdown files are the source of truth. Indexes, vectors, suggestions, and decisions are rebuildable support data unless explicitly written back through a guarded operation.

See [platform principles](platform-principles.md) for the platform invariants and [roadmap](roadmap.md) for the gated implementation sequence.

See [indexing contract](indexing-contract.md) for the exact Phase 1 indexed and ignored fields.

## Metadata Contract

The core package consumes `NoteRecordInput`. In production, the Obsidian adapter fills this from `app.metadataCache` and `app.vault.cachedRead`. In tests, fixture adapters may parse raw Markdown, but core itself does not treat raw Markdown parsing as the authority for Obsidian metadata.

Chunking follows the same contract. `packages/core` receives note content and normalized heading metadata, then derives read-only `ChunkRecord` values from section and block boundaries. Obsidian heading positions remain the production authority for section starts; core does not try to rediscover heading structure with a competing parser.

## Current Slice

The initial implementation includes:

- workspace scaffold
- core normalized note model
- deterministic vault snapshot lookup maps
- tested Obsidian cache mapper
- tested read-only vault adapter
- minimal plugin command: `Vaultseer: Rebuild read-only vault index`

The only current note write path is the guarded Phase 6 source-note creation flow described below. It can create a new Markdown note from an approved source proposal, but it cannot edit existing notes, tags, links, frontmatter, aliases, or attachments.

## Storage And Index Health

The core package defines the storage contract before semantic search or suggestion writes exist. The first implementations are `InMemoryVaultseerStore` for tests and transient runs, and `PersistentVaultseerStore` for plugin-backed persistence.

Stored entity shapes are defined for:

- note records
- file version records
- chunk records
- lexical index records
- vector records
- source extraction job records
- source records
- source chunk records
- suggestion records
- suggestion decision records
- guarded write operation records
- guarded write decision records
- guarded write apply result records
- index health metadata

The plugin uses `PersistentVaultseerStore` through an Obsidian data backend. Plugin settings and the stored index share the same Obsidian plugin data file through a wrapper shape:

- `settings`: user-facing plugin settings.
- `index`: the latest rebuildable Vaultseer index, or `null`.

The data store also accepts the original root-level settings shape as a legacy input so early local installs can load settings without requiring manual cleanup.

Semantic settings are explicit but disabled by default. The plugin stores `semanticSearchEnabled`, `semanticIndexingEnabled`, embedding endpoint, provider id, model id, expected dimensions, and batch size. Indexing and search are separate switches: indexing prepares vectors through explicit commands, while search only embeds a query when the search modal is open and semantic search is enabled.

`rebuildReadOnlyIndex` and `clearReadOnlyIndex` return `IndexHealth`, which records schema version, status, last index time, note count, chunk count, vector count, suggestion count, and warnings.

The plugin currently exposes these operator commands:

- `Vaultseer: Rebuild read-only vault index`
- `Vaultseer: Clear read-only vault index`
- `Vaultseer: Check read-only vault index health`
- `Vaultseer: Search read-only vault index`
- `Vaultseer: Open read-only workbench`
- `Vaultseer: Open guarded write review queue`
- `Vaultseer: Plan semantic indexing queue`
- `Vaultseer: Run one semantic indexing batch`
- `Vaultseer: Cancel active semantic indexing jobs`
- `Vaultseer: Search stored source workspaces`
- `Vaultseer: Import active text/code file as source workspace`
- `Vaultseer: Choose text/code file to import as source workspace`
- `Vaultseer: Plan PDF source extraction queue`
- `Vaultseer: Show source extraction queue status`
- `Vaultseer: Run one PDF source extraction batch`
- `Vaultseer: Recover interrupted source extraction jobs`
- `Vaultseer: Cancel active source extraction jobs`
- `Vaultseer: Plan source semantic indexing queue`
- `Vaultseer: Run one source semantic indexing batch`
- `Vaultseer: Cancel active source semantic indexing jobs`

The health command checks file-version staleness before showing a status notice, so the operator can see whether the current mirror is empty, ready, stale, degraded, or failed.

The index health state model is explicit. Current statuses are:

- `empty`: no useful mirror exists.
- `indexing`: a rebuild or update is in progress.
- `ready`: the stored mirror was successfully rebuilt.
- `stale`: the vault changed after the stored mirror was built.
- `degraded`: the mirror is usable, but optional analysis failed.
- `error`: required indexing failed and the mirror should not be trusted without recovery.

The in-memory store preserves the last successful mirror when later indexing enters `indexing`, `stale`, `degraded`, or `error`. A failed rebuild marks the health as `error` and keeps the previous note records available for diagnostics.

File-version staleness detection compares stored file versions with the current vault snapshot. Added, deleted, or content-changed files mark the mirror as `stale`; mtime-only changes do not. This keeps the mirror focused on note content changes rather than filesystem noise.

Persistent storage fails closed on unsupported schema versions. If a stored index has a schema version that does not match the current `INDEX_SCHEMA_VERSION`, Vaultseer opens with `error` health and an empty mirror instead of trusting incompatible data. The operator recovery path is clear index, then rebuild index.

Future IndexedDB storage should implement the same `VaultseerStorageBackend` contract rather than changing plugin command behavior.

## Relationship Graph

The relationship graph is a read-only model built from a `VaultSnapshot`. It does not parse files and it does not mutate notes.

The graph currently contains:

- resolved internal links by source note path
- unresolved internal links by source note path
- backlinks by target note path
- tag statistics, including co-occurring tags
- orphan notes with no resolved outgoing links and no backlinks
- weakly connected notes with no resolved outgoing links and no backlinks

Tags are descriptive metadata, not proof that a note is connected to the vault's note network. A note with tags but no incoming or outgoing note links is still treated as weakly connected.

Internal link resolution is deterministic and intentionally conservative:

- exact note path
- note path without `.md`
- note basename

If multiple notes share the same basename, the first normalized note path wins. A later sprint can add ambiguity reporting before exposing automatic link suggestions.

## Chunking

The first Phase 2 slice adds deterministic chunk derivation in `packages/core/src/chunking/chunk-note.ts`.

The chunker is adapted from the local Mimir/Mimisbrunnr chunking idea, but scoped for an Obsidian personal vault:

- sections come from Obsidian metadata cache heading positions;
- blocks are split by blank lines;
- fenced code blocks stay intact;
- chunk identity is based on note path, heading path, and normalized block text hash;
- an ordinal is used only when duplicate blocks under the same note and heading path would otherwise collide.

This keeps unchanged chunks stable when nearby prose is inserted or removed. It also keeps the feature read-only: chunk records are derived analysis data, not note mutations.

The read-only rebuild path now stores chunk records through `VaultseerStore`, and index health reports `chunkCount`.

## Lexical Search

The second Phase 2 slice adds deterministic lexical indexing in `packages/core/src/search/lexical-search.ts`.

The design borrows two ideas without importing the full machinery:

- Mimir keeps lexical retrieval behind an explicit index/search boundary.
- Omnisearch treats tokenization, field weighting, cache recovery, and match explanation as first-class search behavior.

Vaultseer keeps the smaller personal-vault version:

- `buildLexicalIndex` creates rebuildable term records from note titles, aliases, headings, tags, and chunk text.
- `searchLexicalIndex` searches stored term records against stored notes and chunks.
- results include `matchedTerms`, `matchedFields`, and `matchedChunks`.
- matching is case-insensitive and diacritic-insensitive.
- nested tags are searchable by full tag path and component terms.

The plugin rebuild path persists lexical records through `VaultseerStore`.

The Obsidian command `Vaultseer: Search read-only vault index` opens a modal backed by the persisted mirror. The modal:

- checks index freshness before opening when possible;
- blocks search when the mirror is empty, indexing, or failed;
- keeps stale and degraded mirrors searchable with an operator-facing warning;
- renders title, path, match reason, and a short excerpt;
- opens selected notes through Obsidian without mutating files.

The modal is intentionally thin. `search-modal-state.ts` owns the presentable state and messages, while `search-modal.ts` only renders it. This keeps search behavior testable outside Obsidian UI runtime.

## Read-Only Workbench

The first Phase 3 slice adds a docked Obsidian view registered as `vaultseer-workbench` and exposed through `Vaultseer: Open read-only workbench`.

The workbench is backed by the persisted mirror, not live Markdown parsing. `workbench-state.ts` owns the testable presentation state and `workbench-view.ts` owns Obsidian rendering.

For the active note, the view shows:

- index health summary and freshness warning;
- current note title, path, tags, and aliases;
- resolved outgoing links;
- backlinks;
- unresolved links;
- relationship warnings such as weak connection or unresolved links;
- read-only sanity checks for missing tags frontmatter, duplicate aliases, empty titles, malformed tags, and unresolved internal links;
- related notes from linked notes, backlinks, shared tags, lexical matches, and stored semantic vectors when current note vectors are already available.
- read-only suggested tags from linked notes, backlinks, co-tag statistics, and tag frequency.
- read-only suggested link targets for unresolved links, using existing note aliases, titles, basenames, and token overlap.

Semantic related-note evidence is computed from vectors already stored in the mirror. The workbench does not call an embedding provider or schedule indexing while rendering related notes.

The sanity checks are diagnostics over the indexed mirror, not a formatter. They point out narrow issues only and do not infer a house style for headings, prose, templates, or frontmatter schemas.

The view refreshes when Obsidian opens another file and after Vaultseer rebuilds or clears the index. It opens notes through Obsidian when the operator clicks a related note, resolved link, or suggested link target. It does not mutate notes.

The workbench toolbar exposes `Rebuild index` and `Clear index`. These actions operate only on Vaultseer's disposable mirror through the same plugin methods as the command palette commands. They do not edit Markdown notes, frontmatter, tags, links, aliases, or vault files.

Current limitation: the workbench is still a read-only mirror inspector. It does not yet show guarded actions, suggestion decisions, semantic current-note results, or gardener queues.

## Source-To-Note Proposals

The first source-to-note slice is read-only and deterministic. `packages/core/src/source/source-note-proposal.ts` turns one extracted `SourceRecord`, its `SourceChunkRecord` values, and the current mirrored `NoteRecord` values into a `SourceNoteProposal`.

The proposal contains:

- title inferred from the first Markdown H1, source section, or filename;
- summary from the first useful source chunk;
- filename-derived aliases;
- outline headings from source chunk section paths;
- suggested tags from existing vault tags only;
- suggested links and related notes from title, alias, tag, and source-term evidence;
- a Markdown preview for human review.

This is not a write operation. The source preview modal displays the proposal, but it does not create a note, modify frontmatter, copy attachments, or mark a suggestion as accepted. Later AI-assisted proposal generation should produce the same proposal shape, and Phase 6 guarded writes must still convert any accepted proposal into an explicit operation with preview diff, expected file hash, approval, and decision record.

Source proposal suggestions now have a persistence boundary. `packages/core/src/suggestions/suggestion-records.ts` converts source-note proposals into stable `SuggestionRecord` values and stores the latest `DecisionRecord` for each suggestion separately. The plugin persists generated source proposal suggestions when the source preview opens. This makes suggestions reviewable later without granting them write authority; accepting, rejecting, or deferring a suggestion is still metadata about the suggestion, not a vault mutation.

Suggestion records and suggestion decisions are preserved across read-only mirror rebuilds. A rebuild may replace note, chunk, lexical, vector, and job data, but it does not erase the user's review trail for already generated suggestions.

## Guarded Write Foundation

Phase 6 starts with the write boundary rather than broad editing features. `packages/core/src/writes/guarded-write.ts` defines proposed operations, preview diffs, precondition checks, review decisions, and apply result records before any note mutation is allowed.

The current implemented operation is `create_note_from_source`:

- input: a reviewed `SourceNoteProposal`, an explicit target Markdown path, related suggestion IDs, and a creation timestamp;
- output: a proposed operation with normalized Markdown content, source provenance, `expectedCurrentHash: null`, and an added-file preview diff;
- validation: `evaluateVaultWritePrecondition` checks the current target file hash before any future apply call can proceed;
- decision metadata: `createVaultWriteDecisionRecord` records approval, rejection, or deferral separately from the proposed operation.

Guarded write operations now have a persistence boundary. `VaultseerStore` stores proposed `GuardedVaultWriteOperation` records separately from `VaultWriteDecisionRecord` records. `mergeVaultWriteOperations` upserts proposed operations by operation id, and `upsertVaultWriteDecisionRecord` stores the latest decision for each operation id. These records are preserved across read-only mirror rebuilds, so rebuilding the search/index mirror does not erase pending write reviews.

Apply result records are explicit. `VaultWriteApplyResultRecord` has `applied` and `failed` variants. Failures record stage, expected hash, actual hash, message, retryability, and timestamp so apply work can fail closed and explain recovery state instead of leaving an ambiguous partial operation.

The plugin exposes this through a dry-run review surface, not through an apply surface. `apps/obsidian-plugin/src/source-note-write-review-state.ts` builds the review state from a source proposal, stored note records, persisted suggestion records, the configured source note folder, and the core guarded-write functions. `apps/obsidian-plugin/src/source-note-write-review-modal.ts` renders the proposed operation, target path, source provenance, precondition status, linked suggestion IDs, and preview diff.

The source preview persists the generated source-note operation when it persists source proposal suggestions. This makes the dry-run review recoverable later, but it still does not authorize a note write.

The guarded write review queue is the first control surface over persisted operations. `apps/obsidian-plugin/src/write-review-queue-state.ts` builds a queue summary and item list from stored operations, decisions, and apply results. `apps/obsidian-plugin/src/write-review-queue-controller.ts` records approval, deferral, or rejection as Vaultseer review metadata. `apps/obsidian-plugin/src/write-review-queue-modal.ts` renders the queue, linked suggestions, preview diffs, apply result state, decision buttons, and a guarded `Create note` button for approved source-note operations.

The first real apply path is intentionally narrow:

- `apps/obsidian-plugin/src/write-apply-controller.ts` refuses anything except an approved operation, runs a dry-run precondition check, calls the write port, and stores either an applied record or a failed record.
- `apps/obsidian-plugin/src/obsidian-vault-write-port.ts` implements `VaultWritePort` for Obsidian using `vault.create` only for `create_note_from_source`.
- The adapter validates the approval payload against the operation, rechecks the target path before writing, verifies that the target parent folder already exists, creates the file, reads it back, verifies the final content hash, and returns the applied hash record.

This is a write feature, but only for creating a new note from an approved source proposal into the configured source note folder. The default folder is `Source Notes`; `apps/obsidian-plugin/src/settings-model.ts` owns the default and folder-path normalization. It does not create folders, modify existing notes, update frontmatter, insert tags, insert links, copy attachments, batch-apply operations, or run automatically.

## Semantic Queue Foundation

The first Phase 4 foundation is core-only and does not call an embedding provider. `packages/core/src/semantic/embedding-queue.ts` defines a model namespace from provider id, model id, and dimensions, then plans deterministic embedding jobs for chunks that do not already have a reusable vector record for that namespace.

This borrows Mimir's separation between embedding provider and vector index, while keeping Vaultseer smaller: lexical search remains the primary usable search path, and semantic work starts as queued chunk work rather than synchronous UI work.

The core store now persists vector records and embedding job records alongside the mirror. This makes planned semantic work reloadable across plugin restarts. Rebuilding or clearing the read-only mirror discards semantic records so stale vectors and jobs cannot silently survive a changed mirror.

The queue module also owns pure job transitions: claim due queued jobs, complete a running job, cancel jobs, recover interrupted running jobs, and record retryable or terminal failures with `nextAttemptAt` backoff. These helpers make the later background worker deterministic and testable before it exists.

`runEmbeddingWorkerBatch` is the first explicit worker controller. It claims due queued jobs, sends chunk text to an injected `EmbeddingProviderPort`, validates vector count and dimensions, writes vector records, and updates job state. Tests use a fake provider so this remains provider-independent core behavior.

The note embedding worker is target-aware. Legacy jobs without `targetKind` are treated as note jobs, while source jobs use `targetKind: "source"`. The existing note worker claims only note jobs, and the plugin's note semantic planning, cancellation, and startup recovery preserve source jobs instead of deleting, cancelling, or requeueing them.

`searchSemanticVectors` is the first read-only semantic ranking primitive. It accepts a query vector that has already been produced by an external adapter, filters stored vectors to the requested model namespace and current chunk content hash, ranks chunks by cosine similarity, and groups the best chunk evidence by note. It does not call an embedding provider, schedule work, mutate notes, or blend with lexical results.

`searchSemanticIndex` is the first plugin-side semantic query controller. It honors the disabled-by-default semantic search setting, uses an injected `EmbeddingProviderPort` to embed one query, reads notes/chunks/vectors from the persisted mirror, and delegates ranking to `searchSemanticVectors`. Provider failures and vector-shape mismatches return degraded results instead of changing the stored mirror.

The search modal now uses `buildSearchModalQueryState` to merge semantic evidence with lexical results when semantic search is enabled. Lexical results remain visible if the provider fails, and duplicate note rows are merged into a hybrid result instead of appearing twice.

`Vaultseer: Plan semantic indexing queue` is the first plugin-facing semantic command. It is disabled by default through settings, and when enabled it only plans queued jobs from stored chunks and vectors. It does not call an embedding provider.

`Vaultseer: Cancel active semantic indexing jobs` is an operator-facing cancellation command. It cancels only queued/running semantic jobs in the persisted queue and preserves completed jobs for diagnostics.

On plugin startup, Vaultseer recovers note and source semantic jobs left in `running` state by a previous interrupted session. Those jobs are requeued with a recovery diagnostic so the next explicit batch can retry them.

Current limitation: note and source queues only run when a caller explicitly invokes a batch command. There is no background scheduler yet.

## Source Intake Foundation

The first Phase 4.5 slice adds core contracts for source workspaces without adding any extractor process, UI, or note writes.

This borrows Mimir's import boundary: external source material is evidence, not canonical memory and not an Obsidian note. Vaultseer applies the same idea to personal vault work. A source workspace can hold extracted Markdown, diagnostics, attachments, and chunk provenance before any guarded write proposal exists.

`packages/core/src/source/types.ts` defines:

- `SourceExtractorPort`: the future adapter boundary for Marker, MarkItDown, and built-in text/code extractors.
- `SourceExtractorCapability`: supported file extensions, MIME types, external-process requirements, and whether the extractor preserves images or tables.
- `SourceExtractorDependency`: dependency checks such as external commands, services, Python packages, or libraries.
- `SourceExtractorFailureMode`: explicit failure categories for missing dependencies, unsupported files, read failures, extraction failures, and cancellation.
- `SourceRecord`: normalized extracted source metadata and extracted Markdown.
- `SourceChunkRecord`: source-owned chunks with source provenance, separate from vault `ChunkRecord` values.

`packages/core/src/source/source-extraction-queue.ts` defines the first source extraction job lifecycle before any heavy extractor is wired. It plans jobs from vault-local source candidates, existing source records, and existing extraction jobs. Job identity includes extractor id, vault source path, source content hash, and extraction options, so changing Marker-style options such as OCR or image preservation can create distinct work. Queue transitions are pure: claim due jobs, complete, cancel, fail with retry/backoff, and recover interrupted running jobs. This borrows the existing semantic queue shape so future Marker and MarkItDown workers can be explicit, cancellable, and reloadable instead of running long extraction in the Obsidian UI path.

`packages/core/src/source/chunk-source.ts` derives `SourceChunkRecord` values from extracted Markdown. It uses the same shared block splitting, text normalization, and stable hash helpers as vault note chunking, but keeps source chunks in the `source-chunk:` ID namespace. Source headings come from extracted Markdown because external sources do not have Obsidian metadata cache entries. Fenced code blocks stay intact, unchanged source blocks keep stable IDs across nearby edits, and duplicate blocks in the same source section use an ordinal only as a collision breaker.

`packages/core/src/source/source-lexical-search.ts` builds a source-only lexical index over filenames, source section paths, and extracted source chunk text. Results are grouped by source workspace, include matched fields and matched source chunks, and stay read-only. The tokenizer is shared with vault-note lexical search so case and diacritic behavior stays consistent across notes and sources.

`packages/core/src/source/source-semantic-search.ts` adds source-only semantic ranking over stored vector records. It uses the same vector math as vault-note semantic search, but groups results by source workspace instead of note path and only accepts current vectors for `source-chunk:` records whose stored content hash still matches the current source chunk hash. This is a ranking primitive only: it does not run Marker, MarkItDown, Ollama, an embedding queue, or any vault write.

`planSourceEmbeddingQueue` adds source-only semantic queue planning. It reuses the same model namespace and vector freshness rules as note chunk planning, but creates jobs with `targetKind: "source"`, `sourceId`, and `sourcePath` instead of pretending source chunks are note chunks. Failed source workspaces and orphan source chunks are skipped. Source jobs are protected from the note worker and note semantic plugin controls.

`runSourceEmbeddingWorkerBatch` is the core source counterpart to the note worker. It claims only `targetKind: "source"` jobs, reads stored source chunks, sends source chunk text to an injected `EmbeddingProviderPort`, validates vector shape, stores vector records under source chunk IDs, and completes or fails source jobs through the same retry rules. It does not call Marker, MarkItDown, Ollama directly, schedule background work, or write final notes.

The plugin now exposes explicit source semantic controls. `Vaultseer: Plan source semantic indexing queue` persists source jobs from stored source workspaces while preserving note jobs. `Vaultseer: Run one source semantic indexing batch` runs one ready source batch through the configured Ollama-compatible provider when semantic indexing is enabled. `Vaultseer: Cancel active source semantic indexing jobs` cancels queued or running source jobs while preserving note jobs and completed diagnostics.

`VaultseerStore` now persists source records and source chunks through `replaceSourceWorkspace`, `getSourceRecords`, and `getSourceChunkRecords`. Source extraction jobs are persisted through `replaceSourceExtractionQueue` and `getSourceExtractionJobRecords`. These records are stored separately from Obsidian note records. Rebuilding the vault note mirror preserves source workspaces and source extraction jobs, while a full local state clear removes them with the rest of Vaultseer's disposable local state.

`Vaultseer: Import active text/code file as source workspace` is the first source intake path. It reads only the active Obsidian file through the vault adapter, supports Markdown, plain text, scripts, source code, JSON, YAML, and similar readable files, then stores a source workspace and source chunks through `VaultseerStore`. Unsupported active files, including PDFs for now, are stored as failed source workspaces with diagnostics. This command does not read arbitrary filesystem paths and does not write Obsidian notes.

`Vaultseer: Choose text/code file to import as source workspace` opens a vault-local file picker over the same built-in readable text/code extractor. The picker lists only supported file extensions from Obsidian's vault file list and honors Vaultseer's excluded-folder settings, so `.obsidian`, `research`, and operator-configured excluded folders are not offered as source imports. Choosing a file reads it through `app.vault.cachedRead`, replaces any previous stored source workspace for that vault path, and still does not create or modify Obsidian notes.

`Vaultseer: Plan PDF source extraction queue` is the first plugin control for high-fidelity source extraction. It scans Obsidian's vault file list for PDF files, honors Vaultseer's excluded-folder settings, and stores a bounded batch of Marker extraction jobs for PDFs that do not already have a current extracted source workspace. The candidate fingerprint is based on the vault file size and mtime until the Marker worker can compute stronger extracted-content hashes. Planning does not read PDF bytes, run Marker, call an embedding provider, or create Obsidian notes.

`Vaultseer: Run one PDF source extraction batch` claims one queued Marker job and runs the external `marker_single` command through an adapter boundary. Marker output is read from a plugin-local staging folder under `.obsidian/plugins/<plugin-id>/source-workspaces/marker`, converted into a stored source workspace, chunked, and kept searchable separately from vault notes. The command checks that `marker_single` responds before claiming work. It does not create or modify Obsidian notes.

`Vaultseer: Show source extraction queue status`, `Vaultseer: Recover interrupted source extraction jobs`, and `Vaultseer: Cancel active source extraction jobs` expose the persisted source extraction queue. Recovery requeues jobs that were left in `running` state by an interrupted plugin session. Cancellation marks only queued or running source extraction jobs as cancelled and preserves completed jobs for diagnostics.

`Vaultseer: Search stored source workspaces` opens a read-only modal over stored source records and source chunks. The modal builds a source lexical index once from stored source data when it opens, uses that cached modal-session index for live lexical searches, and only calls the semantic provider when the operator explicitly runs semantic search. Semantic evidence is blended with lexical evidence through an explicit source-ranking policy, and provider failures degrade to lexical-only results without mutating source workspaces or notes. Search results can open a read-only source preview modal for the selected stored source workspace.

The source preview modal reads stored source records and source chunks, then displays source metadata, extraction diagnostics, staged attachment metadata, extracted Markdown, and chunk groups. It does not run extractors, render staged attachments, copy images or tables into the vault, or create Obsidian notes.

Current limitations: Marker execution is manual and depends on a local `marker_single` command; there is no MarkItDown adapter, automatic source extraction scheduler, rendered image/table preview, or source-to-note proposal path yet. The current source picker is intentionally limited to built-in text/code files and does not run Word, PowerPoint, Excel, or image extraction.
