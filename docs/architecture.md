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

No note write operations exist yet.

## Storage And Index Health

The core package defines the storage contract before semantic search or suggestion writes exist. The first implementations are `InMemoryVaultseerStore` for tests and transient runs, and `PersistentVaultseerStore` for plugin-backed persistence.

Stored entity shapes are defined for:

- note records
- file version records
- chunk records
- lexical index records
- vector records
- source records
- source chunk records
- suggestion records
- suggestion decision records
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
- `Vaultseer: Plan semantic indexing queue`
- `Vaultseer: Run one semantic indexing batch`
- `Vaultseer: Cancel active semantic indexing jobs`
- `Vaultseer: Search stored source workspaces`
- `Vaultseer: Import active text/code file as source workspace`
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
- related notes from linked notes, backlinks, shared tags, and lexical matches.

The view refreshes when Obsidian opens another file and after Vaultseer rebuilds or clears the index. It opens notes through Obsidian when the operator clicks a related note or link. It does not mutate notes.

The workbench toolbar exposes `Rebuild index` and `Clear index`. These actions operate only on Vaultseer's disposable mirror through the same plugin methods as the command palette commands. They do not edit Markdown notes, frontmatter, tags, links, aliases, or vault files.

Current limitation: the workbench is still a read-only mirror inspector. It does not yet show guarded actions, suggestion decisions, semantic results, or gardener queues.

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

`packages/core/src/source/chunk-source.ts` derives `SourceChunkRecord` values from extracted Markdown. It uses the same shared block splitting, text normalization, and stable hash helpers as vault note chunking, but keeps source chunks in the `source-chunk:` ID namespace. Source headings come from extracted Markdown because external sources do not have Obsidian metadata cache entries. Fenced code blocks stay intact, unchanged source blocks keep stable IDs across nearby edits, and duplicate blocks in the same source section use an ordinal only as a collision breaker.

`packages/core/src/source/source-lexical-search.ts` builds a source-only lexical index over filenames, source section paths, and extracted source chunk text. Results are grouped by source workspace, include matched fields and matched source chunks, and stay read-only. The tokenizer is shared with vault-note lexical search so case and diacritic behavior stays consistent across notes and sources.

`packages/core/src/source/source-semantic-search.ts` adds source-only semantic ranking over stored vector records. It uses the same vector math as vault-note semantic search, but groups results by source workspace instead of note path and only accepts current vectors for `source-chunk:` records whose stored content hash still matches the current source chunk hash. This is a ranking primitive only: it does not run Marker, MarkItDown, Ollama, an embedding queue, or any vault write.

`planSourceEmbeddingQueue` adds source-only semantic queue planning. It reuses the same model namespace and vector freshness rules as note chunk planning, but creates jobs with `targetKind: "source"`, `sourceId`, and `sourcePath` instead of pretending source chunks are note chunks. Failed source workspaces and orphan source chunks are skipped. Source jobs are protected from the note worker and note semantic plugin controls.

`runSourceEmbeddingWorkerBatch` is the core source counterpart to the note worker. It claims only `targetKind: "source"` jobs, reads stored source chunks, sends source chunk text to an injected `EmbeddingProviderPort`, validates vector shape, stores vector records under source chunk IDs, and completes or fails source jobs through the same retry rules. It does not call Marker, MarkItDown, Ollama directly, schedule background work, or write final notes.

The plugin now exposes explicit source semantic controls. `Vaultseer: Plan source semantic indexing queue` persists source jobs from stored source workspaces while preserving note jobs. `Vaultseer: Run one source semantic indexing batch` runs one ready source batch through the configured Ollama-compatible provider when semantic indexing is enabled. `Vaultseer: Cancel active source semantic indexing jobs` cancels queued or running source jobs while preserving note jobs and completed diagnostics.

`VaultseerStore` now persists source records and source chunks through `replaceSourceWorkspace`, `getSourceRecords`, and `getSourceChunkRecords`. These records are stored separately from Obsidian note records. Rebuilding the vault note mirror preserves source workspaces, while a full local state clear removes them with the rest of Vaultseer's disposable local state.

`Vaultseer: Import active text/code file as source workspace` is the first source intake path. It reads only the active Obsidian file through the vault adapter, supports Markdown, plain text, scripts, source code, JSON, YAML, and similar readable files, then stores a source workspace and source chunks through `VaultseerStore`. Unsupported files, including PDFs for now, are stored as failed source workspaces with diagnostics. This command does not read arbitrary filesystem paths and does not write Obsidian notes.

`Vaultseer: Search stored source workspaces` opens a read-only modal over stored source records and source chunks. The modal builds a source lexical index once from stored source data when it opens, uses that cached modal-session index for live lexical searches, and only calls the semantic provider when the operator explicitly runs semantic search. Semantic evidence is blended with lexical evidence through an explicit source-ranking policy, and provider failures degrade to lexical-only results without mutating source workspaces or notes. Search results can open a read-only source preview modal for the selected stored source workspace.

The source preview modal reads stored source records and source chunks, then displays source metadata, extraction diagnostics, staged attachment metadata, extracted Markdown, and chunk groups. It does not run extractors, render staged attachments, copy images or tables into the vault, or create Obsidian notes.

Current limitations: no Marker adapter, MarkItDown adapter, source file picker, attachment staging directory, rendered image/table preview, or source-to-note proposal path exists yet.
