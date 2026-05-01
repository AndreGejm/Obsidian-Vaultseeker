# Vaultseer Indexing Contract

Vaultseer indexes a read-only mirror of an Obsidian vault. Markdown files remain the source of truth, and Obsidian's metadata cache remains the production metadata authority.

## Reuse Notes

This contract borrows concepts from local references instead of inventing everything from scratch:

- **Obsidian Tags Overview:** use Obsidian metadata cache tags, expand nested tags such as `source/literature` into `source` and `source/literature`, and deduplicate tags before analysis.
- **Dataview fixtures:** expect personal notes to contain frontmatter fields, inline fields such as `Author::`, and Dataview code blocks. Vaultseer preserves the note content but does not interpret Dataview queries in Phase 1.
- **Metadata Menu fixtures:** expect typed frontmatter such as `fileClass`, numeric fields, and blank property values. Vaultseer keeps frontmatter as raw metadata but only normalizes the fields it owns today.
- **Mimir/Mimisbrunnr chunking:** chunking borrows the Mimir pattern of heading-aware, block-oriented note slices while adapting the identity rule for personal-vault stability. Vaultseer uses Obsidian-provided heading positions as the heading authority, keeps fenced code blocks together, and avoids using block index in the chunk ID unless duplicate text under the same heading needs a collision ordinal.

## Indexed In Phase 1

Vaultseer currently indexes these fields from normalized adapter records:

| Data | Source | Current use |
|---|---|---|
| Note path | Obsidian file path | Stable note identity and maps |
| Basename/title | Obsidian file basename plus optional frontmatter `title` | Display title and lookup |
| File stats | Obsidian file stat | File-version records and stale checks |
| Content hash | Note content | Stale checks and future write safety |
| Frontmatter object | Obsidian metadata cache | Preserved for future analysis |
| Tags | Frontmatter `tags`/`tag` plus Obsidian cache tags | Tag lookup and relationship graph |
| Aliases | Frontmatter `aliases`/`alias` plus adapter aliases | Search/display preparation |
| Internal links | Obsidian metadata cache links | Relationship graph and backlinks |
| Headings | Obsidian metadata cache headings | Heading paths and future chunking |

## Chunked In Phase 2 Core

`packages/core` can derive deterministic chunk records from normalized note input, and the read-only index rebuild now stores those chunk records. The rebuild path also stores a lexical index derived from note titles, aliases, headings, tags, and chunk text.

| Data | Source | Current use |
|---|---|---|
| Chunk text | Markdown content supplied by the adapter | Persisted rebuildable input for future lexical and semantic search |
| Chunk note path | Normalized note path | Stable note ownership |
| Chunk heading path | Obsidian metadata cache heading hierarchy plus note title context | Explaining where a chunk came from |
| Normalized text hash | Trimmed chunk text with stable line endings | Stable identity across nearby edits |
| Collision ordinal | Duplicate chunk text under the same note and heading path | Disambiguating duplicate blocks only |

Chunk boundaries are intentionally simple:

- headings create section boundaries when Obsidian metadata includes heading positions;
- blank lines split normal prose blocks;
- fenced code blocks stay together as one chunk;
- notes without positioned headings are chunked under the note title.

Chunk IDs are created from note path, heading path, normalized block text hash, and collision ordinal only when needed. This means inserting a nearby paragraph should not change the IDs of unchanged chunks.

## Ignored Or Preserved But Not Interpreted

| Data | Current behavior | Reason |
|---|---|---|
| Raw Markdown parsing | Not performed in core | Avoids drift from Obsidian metadata behavior |
| Dataview query execution | Not interpreted | Out of scope for trusted mirror |
| Dataview inline fields | Preserved only as content/frontmatter if provided by adapter | Query semantics belong to Dataview |
| Metadata Menu field schemas | Preserved as frontmatter values | Field schema enforcement is a later suggestion feature |
| Task state | Preserved as content only | Task indexing is not part of Phase 1 |
| Embedded files/PDFs/images inside notes | Not indexed as vault note content | Markdown notes are the current mirror boundary |
| `.obsidian` folder | Excluded by default settings | Plugin config is not personal note content |
| `research` folder | Excluded by default settings | Local cloned references should not become personal notes |
| Operator-configured excluded folders | Skipped by plugin controller | Supports archives and private scratch spaces |

## Fixture Vaults

The fixture vaults under `tests/fixtures` are intentionally small. They are not demo content; they are regression surfaces for platform behavior.

- `vault-basic`: minimal two-note linking behavior.
- `vault-literature`: literature-style source note with aliases, nested tags, heading links, and source tags.
- `vault-tags`: nested tag behavior.
- `vault-personal-knowledge`: realistic personal notes with maps, literature, people, references, project notes, Dataview-style content, Metadata Menu-style `fileClass`, unresolved links, and an excluded archive note.

Tests pair these Markdown files with normalized adapter records. This is intentional: production metadata comes from Obsidian's cache, while test fixture Markdown keeps the examples readable for humans.

## Phase 1 Guarantees

- Indexing is read-only.
- Index data is rebuildable.
- Stale checks are based on path, size, and content hash.
- Mtime-only changes do not mark notes stale.
- Unsupported persistent index schemas fail closed with `error` health.
- Clear index plus rebuild index is the recovery path.

## Phase 2 Chunking Guarantees

- Chunking is read-only.
- Chunking depends on normalized adapter input and Obsidian heading positions, not a second metadata parser in core.
- Fenced code blocks are preserved as one chunk.
- Unchanged prose blocks keep stable chunk IDs when nearby blocks are inserted.
- Duplicate blocks under the same note and heading path receive different IDs through a collision ordinal.

These guarantees apply to `chunkNoteInput`, `chunkVaultInputs`, and the read-only rebuild path that stores chunk records through `VaultseerStore`. They do not yet mean chunks are searchable in the UI.

## Phase 2 Lexical Search Guarantees

- Lexical indexing is read-only and rebuildable from note records plus chunk records.
- Search terms are case-insensitive and diacritic-insensitive.
- Nested tags are searchable by full tag, such as `workflow/reading`, and by their component terms.
- Results include matched terms, matched fields, and matched chunks so callers can explain why a note appeared.
- Current scoring is deterministic field weighting: title, alias, tag, heading, then body.

These guarantees apply to `buildLexicalIndex` and `searchLexicalIndex`. The plugin rebuild path persists lexical records, `Vaultseer: Search read-only vault index` exposes a modal search field over the persisted mirror, and `Vaultseer: Open read-only workbench` uses the same mirror for active-note related-note evidence.

## Phase 4 Semantic Queue Planning Guarantees

- Vector records are namespaced by provider id, model id, and dimensions, for example `ollama/nomic-embed-text:768`.
- `planEmbeddingQueue` compares chunk records with existing vector records and queues only chunks without a matching namespace, dimension count, and normalized text hash.
- Existing vectors for other model namespaces are not treated as replacements.
- Existing vectors for the same namespace with an old content hash are counted as stale and queued for refresh.
- `maxJobs` limits how much work is planned at once while reporting how many chunks were skipped by that limit.

These guarantees apply only to queue planning. Core also exposes pure queue transitions and an injected-provider worker batch controller. The Obsidian plugin can run one explicit persisted batch through an Ollama-compatible provider and can cancel active queued/running jobs through a command-palette command, but it does not yet schedule background jobs.

## Phase 4 Semantic Storage Guarantees

- `VaultseerStore` can persist vector records separately from embedding job records.
- `vectorCount` reports stored vector records, not queued jobs.
- Clearing the mirror clears notes, chunks, lexical records, vectors, embedding jobs, suggestions, and decisions.
- Rebuilding the mirror resets vector records and embedding jobs so semantic state is replanned from the current chunk set.
- Persistent store hydration tolerates older schema-version-compatible records that do not yet contain semantic arrays.

## Phase 4 Queue Transition Guarantees

- `claimEmbeddingJobs` only claims queued jobs whose `nextAttemptAt` is empty or due.
- Claimed jobs move to `running` without calling an embedding provider.
- Completed jobs move to `completed` and clear retry metadata.
- Cancelled jobs move to `cancelled` and clear retry scheduling.
- The plugin cancellation controller cancels queued/running jobs and preserves completed jobs.
- Startup recovery requeues jobs left in `running` state by an interrupted plugin session and records a recovery diagnostic in `lastError`.
- Failed jobs increment `attemptCount`; retryable failures return to `queued` with a future `nextAttemptAt`, and terminal failures move to `failed`.

## Phase 4 Worker Batch Guarantees

- `runEmbeddingWorkerBatch` processes only jobs claimed from the persisted embedding queue.
- `runEmbeddingWorkerBatch` claims only note jobs. Legacy jobs without `targetKind` are treated as note jobs.
- Source jobs with `targetKind: "source"` remain queued for a future source worker instead of being failed as missing note chunks.
- The worker receives an injected `EmbeddingProviderPort`; core does not know about Ollama or any HTTP endpoint.
- The provider receives chunk text from stored chunk records.
- Returned vectors must match the claimed job count and configured dimensions.
- Successful jobs store vector records and move to `completed`.
- Provider or vector-shape failures leave existing vectors intact and move affected jobs through the retry/failure transition rules.

## Phase 4 Semantic Ranking Guarantees

- `searchSemanticVectors` is read-only and works only on stored vectors, stored chunks, and stored notes.
- The query vector must already be produced by an adapter; core does not call an embedding provider during search.
- Ranking only considers vectors from the requested model namespace.
- Ranking only considers vectors whose dimensions match the query vector.
- Ranking only considers vectors whose content hash still matches the current chunk hash.
- Zero, empty, or non-finite query vectors return no results.
- Results are grouped by note and include matched chunk evidence with cosine similarity scores.

## Phase 4 Semantic Query Controller Guarantees

- `searchSemanticIndex` is disabled by default through settings-driven input.
- Blank semantic queries do not call an embedding provider.
- Query embedding happens through an injected `EmbeddingProviderPort`; the controller does not know about Ollama-specific HTTP details.
- Provider failures and query vector-shape failures return degraded search results instead of mutating stored vectors or jobs.
- Semantic query search reads only stored notes, chunks, and vectors from `VaultseerStore`.
- The search modal merges ready semantic results with lexical results without direct note writes.
- If semantic search degrades, lexical search results remain visible and the degraded message is shown.
- Duplicate lexical and semantic hits for the same note become one hybrid row with combined evidence.
- Note semantic plugin planning, cancellation, and startup recovery preserve source embedding jobs instead of deleting, cancelling, or requeueing them.

## Phase 4.5 Source Workspace Storage Guarantees

- Source workspaces are not Obsidian notes.
- Source records are stored separately from note records.
- Source chunks are stored separately from vault note chunks.
- Source extraction jobs are stored separately from note embedding jobs and source chunks.
- `SourceExtractorPort` describes extractor capabilities, dependency checks, and explicit failure modes before any Marker or MarkItDown adapter exists.
- Source records preserve original source metadata: path, filename, extension, size, content hash, import time, extractor identity, extractor version, extraction options, diagnostics, extracted Markdown, and staged attachment metadata.
- Source chunks preserve source provenance such as page, section, line range, or unknown provenance.
- Rebuilding the vault note mirror preserves source records, source chunks, and source extraction jobs.
- Clearing Vaultseer's full local state clears source workspaces together with notes, chunks, vectors, jobs, suggestions, and decisions.
- No source workspace API writes a final Obsidian note.

## Phase 4.5 Source Extraction Queue Guarantees

- `planSourceExtractionQueue` is a pure core planner and does not call Marker, MarkItDown, Obsidian APIs, or the filesystem.
- Planned job identity includes extractor id, vault source path, source content hash, and extraction options.
- Current extracted source workspaces with the same extractor id, content hash, and extraction options are counted as reusable instead of queued again.
- Existing queued or running extraction jobs with the same identity are counted as already queued instead of duplicated.
- Existing source workspaces with the same source path and extractor id but a different content hash or extraction options are counted as stale and can be queued.
- Failed current source workspaces are not retried automatically unless the planner is explicitly asked to retry failed sources.
- `maxJobs` limits newly planned extraction jobs while reporting how many candidates were skipped by the limit.
- Source extraction job transitions are explicit and testable: claim due jobs, complete jobs, cancel jobs, fail with retry/backoff, and recover interrupted running jobs.
- Source extraction jobs are persisted through `VaultseerStore` and survive vault note mirror rebuilds.
- Clearing Vaultseer's local state clears source extraction jobs.
- This queue foundation does not yet provide a worker, background scheduler, Marker adapter, MarkItDown adapter, attachment staging, or note writes.

## Phase 4.5 Source Extraction Plugin Control Guarantees

- `Vaultseer: Plan PDF source extraction queue` scans Obsidian's vault file list and plans Marker jobs only for PDF files.
- The plugin planner honors Vaultseer's excluded-folder settings before creating candidates.
- The plugin planner creates a bounded batch of up to 8 new jobs per invocation so large vaults do not enqueue every PDF at once.
- The plugin planner uses a temporary vault-file fingerprint of `vault-file:<size>:<mtime>` until a Marker worker can produce stronger extracted-content hashes.
- The planned Marker options preserve images and tables so PDF intake starts from the high-fidelity path required for papers, datasheets, and technical literature.
- Planning stores jobs through `VaultseerStore` and does not read PDF bytes, run Marker, call MarkItDown, call an embedding provider, or write Obsidian notes.
- `Vaultseer: Show source extraction queue status` reports persisted source extraction job counts by status.
- `Vaultseer: Run one PDF source extraction batch` checks for the local `marker_single` command, claims one queued Marker job, runs Marker as an external process, and stores the result as a source workspace.
- Marker output is staged under `.obsidian/plugins/<plugin-id>/source-workspaces/marker` before it is represented as stored source metadata.
- Successful Marker extraction stores extracted Markdown, source chunks, and image/attachment metadata; it does not copy attachments into final note locations.
- Failed Marker extraction stores diagnostics and moves the job through retry/failure metadata.
- `Vaultseer: Recover interrupted source extraction jobs` requeues only source extraction jobs left in `running` state and records a recovery diagnostic.
- `Vaultseer: Cancel active source extraction jobs` cancels only queued or running source extraction jobs and preserves completed jobs for diagnostics.
- Plugin startup also recovers interrupted source extraction jobs so stale `running` state does not block later explicit execution.

## Phase 4.5 Built-In Text/Code Source Intake Guarantees

- `BuiltInTextSourceExtractor` supports Markdown, plain text, scripts, source code, JSON, YAML, and similar readable text files without an external process.
- The Obsidian plugin command `Vaultseer: Import active text/code file as source workspace` reads only the active vault file through Obsidian's vault adapter.
- The Obsidian plugin command `Vaultseer: Choose text/code file to import as source workspace` opens a vault-local picker that lists only supported built-in text/code extensions and honors Vaultseer's excluded-folder settings.
- Both built-in intake commands store extracted source records and source chunks through `VaultseerStore`; they do not create or modify Obsidian notes.
- Markdown sources preserve their extracted Markdown as-is after newline normalization.
- Plain text sources are wrapped under a source filename heading.
- Code-like sources are wrapped in fenced Markdown code blocks with a language hint when the extension is known.
- Unsupported active files, including PDFs until Marker is wired, are stored as failed source workspaces with diagnostics and no chunks.
- Re-importing the same source path replaces the previous stored source workspace for that path instead of leaving stale chunks behind.
- These intake paths do not read arbitrary filesystem paths, run Marker, run MarkItDown, render attachments, or create source-to-note proposals.

## Phase 4.5 Source Chunking Guarantees

- Source chunking is read-only and operates only on stored `SourceRecord` values.
- Failed source workspaces are not chunked.
- Source chunks use the `source-chunk:` ID namespace, not the vault note `chunk:` namespace.
- Source sections come from headings in extracted Markdown because external source files do not have Obsidian metadata cache heading records.
- Notes and sources use the same shared block splitting, text normalization, and hash helpers.
- Blank lines split normal prose blocks.
- Fenced code blocks are preserved as one source chunk.
- Unchanged extracted blocks keep stable source chunk IDs when nearby blocks are inserted.
- Duplicate blocks under the same source and section path receive different IDs through a collision ordinal.

## Phase 4.5 Source Lexical Search Guarantees

- Source lexical search is read-only and operates only on caller-provided source records, source chunks, and source lexical index records.
- Source lexical index records are separate from vault note lexical index records.
- Source search results are grouped by `sourceId` and expose `sourcePath`, `filename`, matched terms, matched fields, and matched source chunks.
- Source fields currently include filename, section, and body text.
- Source search uses the same query and text tokenization as vault-note lexical search, including case-insensitive and diacritic-insensitive matching.
- Source search requires every query term to be present in a returned source result.
- Failed source workspaces and chunks belonging to failed source workspaces are ignored.
- Source lexical results are exposed through `Vaultseer: Search stored source workspaces`, where the plugin builds the source lexical index from stored source records and chunks when the modal opens.
- Source search does not write source results into notes.

## Phase 4.5 Source Semantic Ranking Guarantees

- `searchSourceSemanticVectors` is read-only and works only on caller-provided source records, source chunks, and stored vector records.
- The query vector must already be produced by an adapter; core does not call an embedding provider during source search.
- Ranking only considers vectors from the requested model namespace.
- Ranking only considers vectors whose dimensions match the query vector.
- Ranking only considers vectors whose content hash still matches the current source chunk hash.
- Failed source workspaces are ignored.
- Zero, empty, or non-finite query vectors return no results.
- Results are grouped by source workspace and include matched source chunk evidence with cosine similarity scores.
- Source semantic ranking can be used by `Vaultseer: Search stored source workspaces` when semantic search is enabled and stored source vectors exist.
- Source semantic ranking does not write source results into notes.

## Phase 4.5 Source Embedding Queue Planning Guarantees

- `planSourceEmbeddingQueue` is read-only and plans jobs only from caller-provided source records, source chunks, vector records, and model metadata.
- Source queue planning uses the same provider/model/dimension namespace as note chunk queue planning.
- Source jobs use `targetKind: "source"` with `sourceId` and `sourcePath`; they do not use `notePath`.
- Existing vectors for the requested namespace, dimensions, and current source chunk hash are counted as reusable.
- Existing vectors for the requested namespace and dimensions with an old source chunk hash are counted as stale and queued for refresh.
- Existing vectors from other model namespaces are not treated as replacements.
- Failed source workspaces and orphan source chunks are skipped.
- `maxJobs` limits how much source work is planned at once while reporting how many source chunks were skipped by that limit.
- Source queue planning does not call an embedding provider, run a worker, or write Obsidian notes.

## Phase 4.5 Source Embedding Worker Guarantees

- `runSourceEmbeddingWorkerBatch` processes only source jobs claimed from the persisted embedding queue.
- Note jobs, including legacy jobs without `targetKind`, are not claimed by the source worker.
- The worker reads source chunk text from stored source chunk records, not from vault note chunks.
- Returned vectors are stored under `source-chunk:` IDs and use the same provider/model/dimensions namespace as note vectors.
- Provider failures, missing source chunks, or wrong vector shapes move claimed source jobs through the same retry/failure transition rules as note jobs.
- Source embedding execution does not call Marker, MarkItDown, or Obsidian APIs, does not schedule background work, and does not write Obsidian notes.

## Phase 4.5 Source Semantic Plugin Control Guarantees

- `planSourceSemanticIndexQueue` persists planned source jobs from stored source records and source chunks while preserving note jobs.
- `runSourceSemanticIndexBatch` delegates to the source embedding worker with an injected provider and does not claim note jobs.
- `cancelSourceSemanticIndexQueue` cancels only queued or running source jobs and preserves note jobs.
- `recoverSourceSemanticIndexQueue` requeues only running source jobs after an interrupted plugin session and preserves note jobs.
- Source semantic plugin commands are guarded by the existing disabled-by-default semantic indexing setting.
- The first plugin provider path is the same Ollama-compatible adapter used by note semantic batches.
- Source semantic plugin controls do not run extractors, open source previews, schedule background jobs, or write Obsidian notes.

## Phase 4.5 Source Search Modal Guarantees

- `Vaultseer: Search stored source workspaces` reads only stored source records, source chunks, and stored vectors.
- Lexical source search works without embeddings.
- The modal builds its source lexical index once per open modal session and reuses it for live lexical queries.
- Optional semantic source search embeds the query through the configured provider only when semantic search is enabled, stored current source vectors exist, and the operator explicitly runs semantic search.
- Semantic provider failures degrade to lexical-only results and show a degraded message.
- Source search rank fusion gives semantic evidence an explicit modal ranking weight, merges hybrid source evidence, and sorts the merged result set before applying the display limit.
- Results display filename, source path, evidence reason, and excerpt.
- Result filenames open a read-only source preview modal for the selected stored source workspace.
- The modal does not run extractors, render attachments inline, or write Obsidian notes.

## Phase 4.5 Source Preview Modal Guarantees

- Source preview reads only stored source records and source chunks.
- Missing stored source ids show a closed missing-state message instead of guessing from source paths.
- Failed source workspaces show extraction diagnostics and no searchable chunk groups.
- Extracted source workspaces show source metadata, diagnostics, staged attachment metadata, extracted Markdown, and searchable source chunks grouped by section path.
- Staged attachments are displayed as metadata only; the preview does not copy, render, or write attachment files.
- Source preview does not run Marker, MarkItDown, semantic embedding, source extraction, source-to-note proposal creation, or Obsidian note writes.

## Not Yet Guaranteed

- Automatic or background persisted embedding queue execution.
- Automatic background scheduling.
- Embedding providers other than the first Ollama-compatible adapter.
- Vector preservation across mirror rebuilds.
- Automatic or scheduled Marker PDF extraction.
- MarkItDown broad file extraction.
- Source extraction workers other than the manual Marker batch command.
- Source file picker support for PDF, Word, PowerPoint, Excel, image, or other external-extractor formats.
- Rendered image/table source preview.
- Staged attachment persistence outside the stored metadata shape.
- Source-to-note proposal creation.
- Dataview-compatible querying.
- Metadata Menu schema validation.
- Task indexing.
- Write previews or guarded note mutations.
