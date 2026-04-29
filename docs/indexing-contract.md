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
| Embedded files/PDFs/images | Not indexed | Markdown notes are the current boundary |
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

These guarantees apply only to queue planning. Core also exposes pure queue transitions and an injected-provider worker batch controller. The Obsidian plugin can run one explicit persisted batch through an Ollama-compatible provider, but it does not yet expose cancellation controls, schedule background jobs, or merge semantic results into search.

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
- Failed jobs increment `attemptCount`; retryable failures return to `queued` with a future `nextAttemptAt`, and terminal failures move to `failed`.

## Phase 4 Worker Batch Guarantees

- `runEmbeddingWorkerBatch` processes only jobs claimed from the persisted embedding queue.
- The worker receives an injected `EmbeddingProviderPort`; core does not know about Ollama or any HTTP endpoint.
- The provider receives chunk text from stored chunk records.
- Returned vectors must match the claimed job count and configured dimensions.
- Successful jobs store vector records and move to `completed`.
- Provider or vector-shape failures leave existing vectors intact and move affected jobs through the retry/failure transition rules.

## Not Yet Guaranteed

- Semantic search.
- Automatic persisted embedding queue execution.
- Automatic background scheduling.
- Embedding providers other than the first Ollama-compatible adapter.
- Vector preservation across mirror rebuilds.
- Dataview-compatible querying.
- Metadata Menu schema validation.
- Task indexing.
- Write previews or guarded note mutations.
