# Vaultseer Roadmap

This roadmap favors a stable personal note-management platform over rapid feature delivery. Each phase has an exit gate. Do not move to the next phase just because the previous one has visible UI.

Before starting any new subsystem, run a reuse check against `research/` and the local Mimir repo. The goal is to borrow proven concepts, contracts, and safety patterns instead of rewriting everything from scratch.

## Phase 0: Foundation Scaffold

Status: implemented.

Includes:

- workspace scaffold
- Obsidian-free core package
- Obsidian plugin shell
- normalized note model
- read-only vault adapter
- in-memory index store
- index health shape
- relationship graph

Exit gate:

- tests pass
- typecheck passes
- build passes
- no note write operations exist

## Phase 1: Trusted Vault Mirror

Status: implemented.

Goal: make Vaultseer a reliable read-only mirror of the vault.

Implementation steps:

- add persistent local index storage with schema versioning (**implemented with Obsidian plugin data backend**)
- add explicit index states: empty, indexing, ready, stale, degraded, error (**implemented for the store contract**)
- detect file changes and mark affected index data stale (**implemented for file-version comparison and controller stale checks**)
- add clear-index and rebuild-index recovery paths (**implemented as plugin commands and controller tests**)
- expose index health in the plugin (**implemented as a command/notice surface**)
- expand fixture vaults to cover realistic personal notes (**implemented with `vault-personal-knowledge`**)
- document what is indexed and what is ignored (**implemented in `docs/indexing-contract.md`**)

Exit gate:

- index can be cleared and rebuilt without manual cleanup
- stale files are detected
- failed indexing reports recoverable diagnostics
- plugin UI can show whether the mirror is trustworthy
- no AI or write feature is required for basic search/index health

## Phase 2: Chunking And Lexical Search

Status: implemented for the first read-only search surface. Core chunk derivation, persisted chunk storage, core lexical search, and the Obsidian search command are implemented.

Goal: search useful pieces of notes without relying on embeddings.

Reuse check before implementation:

- study Mimir/Mimisbrunnr chunk identity, bounded retrieval, and lexical search contracts;
- review Omnisearch-style query behavior from `research/`;
- keep only the pieces that fit Vaultseer's personal-vault scope.

Implementation steps:

- define stable chunk boundaries around headings and blocks (**implemented in core**)
- create chunk IDs from note path, heading path, normalized block text hash, and collision ordinal only when needed (**implemented in core**)
- store chunk records in the index store (**implemented for read-only rebuilds**)
- build a lexical search index over titles, aliases, headings, tags, and chunk text (**implemented in core and persisted by rebuilds**)
- return explainable search results with matched fields (**implemented in core**)
- keep search read-only (**implemented by the modal search command**)

Exit gate:

- unchanged chunks survive nearby edits
- search works without an embedding provider
- results explain why they matched
- chunk index can be rebuilt from notes

## Phase 3: Read-Only Workbench Panel

Status: implemented for the read-only v1. A docked workbench exists for the active note and includes mirror rebuild/clear controls.

Goal: make the plugin useful without allowing writes.

Implementation steps:

- show current note metadata (**implemented**)
- show outgoing links, backlinks, unresolved links, and weak relationship warnings (**implemented**)
- show related notes from lexical search and relationship graph data (**implemented**)
- show index health and last rebuild time (**implemented as health summary; last rebuild detail remains available through health command**)
- provide buttons for rebuild and clear index (**implemented as mirror-only controls**)

Exit gate:

- the panel cannot mutate notes
- every displayed relationship can be traced to indexed evidence
- stale index state is visible

## Phase 4: Semantic Search Queue

Status: in progress. The core model namespace, deterministic queue planner, persisted semantic records, pure job transitions, explicit worker batch controller, core semantic vector ranking, Ollama-compatible provider adapter, provider-backed query search controller, semantic search modal integration, manual batch command, active-job cancellation command, and startup recovery of interrupted running note jobs are implemented; background scheduling is not implemented yet.

Goal: add embeddings without making them a platform dependency.

Implementation steps:

- add cancellable embedding jobs (**implemented through core cancellation transition and command-palette cancellation for active queued/running jobs**)
- add resumable queue state (**stored embedding jobs are persisted and reloadable; startup recovery requeues interrupted running jobs**)
- store model metadata and vector dimensions (**implemented for planning profile and vector namespace**)
- namespace vectors by provider and model (**implemented as provider/model:dimensions namespace**)
- enforce max batch size and backoff (**planner limit and retry `nextAttemptAt` are implemented; worker backoff loop is not implemented yet**)
- keep lexical search as fallback (**implemented in the search modal merge path**)
- mark semantic search degraded when provider calls fail (**implemented in the semantic query controller and modal state**)

Next implementation steps:

- add an Obsidian setting for semantic indexing mode without enabling it by default (**implemented with disabled-by-default endpoint, provider id, model id, dimensions, and batch size settings**)
- add an Ollama-compatible provider adapter behind the `EmbeddingProviderPort` (**implemented for explicit manual batches**)
- add an explicit command to run one semantic batch manually before adding background scheduling (**implemented**)
- add a pure core semantic ranking function over stored vectors (**implemented**)
- add a plugin controller that embeds a query and ranks stored vectors without mutating the vault (**implemented and exposed in the modal when semantic search is enabled**)
- merge semantic evidence into the read-only search modal without hiding lexical results (**implemented**)
- plugin command `Vaultseer: Plan semantic indexing queue` now plans jobs without provider calls when semantic indexing is enabled
- plugin command `Vaultseer: Run one semantic indexing batch` processes one queued batch through the configured local Ollama-compatible endpoint when semantic indexing is enabled
- plugin command `Vaultseer: Cancel active semantic indexing jobs` now cancels queued/running jobs without touching completed jobs
- plugin startup now requeues semantic jobs that were left `running` by a previous interrupted session
- note semantic worker and plugin controls now preserve source jobs for future source-specific workers

Exit gate:

- Obsidian remains responsive during indexing
- closing and reopening Obsidian can resume or safely restart work
- model dimension changes do not corrupt old vector records
- failed semantic indexing does not break lexical search

## Phase 4.5: High-Fidelity Source Intake

Status: in progress. Core source/extractor contracts, normalized source records, persisted source records, persisted source chunks, source preservation across vault mirror rebuilds, persisted source extraction jobs, pure source extraction queue transitions, core source extraction worker execution, Marker PDF adapter, plugin source extraction queue planning/status/manual-run/recovery/cancellation controls, deterministic extracted-Markdown source chunking, pure source lexical search, pure source semantic vector ranking, pure source embedding queue planning, source-job protection from note semantic controls, the core source embedding worker, explicit plugin source semantic controls, a read-only source search modal, a read-only source preview modal, vault-local active-file text/code intake, a vault-local text/code source picker, and deterministic read-only source-to-note proposal previews are implemented. No MarkItDown adapter, automatic source extraction scheduler, rendered image/table preview, AI-authored source proposal path, or guarded source-to-note write path exists yet.

Goal: turn external source files into searchable, reviewable source workspaces before any Obsidian note is written.

This phase is intentionally separate from guarded writes. Imported sources are evidence, not notes. Vaultseer should extract, preserve provenance, chunk, search, and preview source material first. A reviewed source can later become a proposed Obsidian note through the guarded write path.

Extractor order:

1. **Marker adapter for serious PDF intake.** Use Marker as the primary PDF engine for papers, datasheets, manuals, literature, scanned or OCR-heavy documents, tables, equations, images, and layout-sensitive PDFs. Marker should run as an external job, not inside the Obsidian UI thread.
2. **Microsoft MarkItDown adapter for broad file intake.** Use MarkItDown for DOCX, PPTX, XLSX, HTML, EPUB, text-based formats, and other non-PDF sources where broad coverage matters more than high-fidelity PDF layout.
3. **Built-in text and code intake.** Use native Vaultseer extraction for Markdown, plain text, scripts, batch files, source code, JSON, YAML, and similar readable files. Code-like sources should preserve language and path first; line-range provenance remains future work. This path is implemented for the active Obsidian file, not for an arbitrary file picker.

Implementation steps:

- define a `SourceExtractorPort` with explicit supported file types, dependencies, and failure modes (**implemented as a core contract only**)
- add a built-in text/code extractor for vault-local readable files (**implemented for Markdown, plain text, scripts, source code, JSON, YAML, and similar files through `Vaultseer: Import active text/code file as source workspace` and `Vaultseer: Choose text/code file to import as source workspace`**)
- add a resumable source extraction job queue before wiring heavy extractors (**implemented in core with planning, claim, complete, cancel, fail/backoff, recovery transitions, store persistence, worker execution, and plugin planning/status/manual-run/recovery/cancellation commands**)
- define normalized source records separate from Obsidian note records (**implemented in core storage types**)
- store original source metadata: path, filename, extension, size, content hash, import time, extractor name, extractor version, and extraction options (**implemented in `SourceRecord`**)
- store extracted Markdown separately from the final Obsidian note proposal (**implemented as source workspace data, not as a vault note**)
- store extracted images and attachments in a staging area before any vault write (**implemented for Marker output metadata staged under the plugin-local source workspace folder; rendered preview remains future work**)
- preserve source provenance at page, section, image, table, and line level when the extractor provides it (**implemented in the source record/chunk shapes; extractor support remains future work**)
- chunk extracted source content using the same stable chunking principles as vault notes, but keep source chunk IDs in a separate namespace (**implemented for extracted Markdown using source-owned headings, shared block splitting, shared text hashing, and `source-chunk:` IDs**)
- support lexical search over extracted sources without embeddings (**implemented in core for filenames, source section paths, and extracted chunk text, and exposed through `Vaultseer: Search stored source workspaces`**)
- support semantic ranking over extracted source chunks when vectors already exist (**implemented in core against stored vectors and `source-chunk:` IDs, with optional source search modal integration when semantic search is enabled**)
- support semantic indexing of extracted source chunks when semantic search is enabled (**implemented for core queue planning, core source worker execution, explicit plugin planning/running/cancellation commands, startup recovery, and optional source search modal evidence**)
- expose a source preview panel with extracted text, diagnostics, staged attachment metadata, and searchable chunks (**implemented as a read-only modal opened from source search results; image/table rendering remains future work**)
- let AI propose note title, summary, headings, tags, aliases, links, and related notes from the extracted source (**deterministic read-only seed proposals are implemented in source preview; AI generation remains future work**)
- require user review before turning any source proposal into a vault write operation

Exit gate:

- PDF extraction uses the high-fidelity Marker path when configured
- source extraction cannot freeze Obsidian; long work is cancellable or safely resumable
- failed extraction leaves diagnostics and does not affect the vault mirror
- extracted source content is searchable before it becomes a note
- source chunks and vault-note chunks are distinguishable in storage and search results
- images and attachments are staged, previewable, and not silently copied into the vault
- no source intake path can write a final Obsidian note directly

## Phase 5: Read-Only Suggestions

Status: started. Read-only tag suggestions, broken-link target suggestions, narrow note sanity checks, semantic related notes, deterministic source-to-note seed proposals, persisted suggestion records, and separate current decision records are implemented in core. Source proposal suggestions are persisted from the source preview. Suggestion records and suggestion decisions survive read-only mirror rebuilds. Suggestions and diagnostics are evidence-bearing and cannot mutate notes.

Goal: produce explainable gardening suggestions without applying them.

Implementation steps:

- suggest tags from existing vault vocabulary (**implemented for the current workbench note using linked notes, backlinks, co-tags, tag frequency, and existing tag vocabulary only**)
- suggest related notes from links, tags, lexical search, and semantic search (**implemented for the workbench using links, backlinks, shared tags, lexical matches, and stored note vectors when current chunk vectors already exist**)
- suggest note structure, tags, links, and related notes from reviewed source intake workspaces (**implemented as deterministic read-only source preview proposals; AI-assisted proposal generation and persistence remain future work**)
- suggest missing links from unresolved mentions and strong related-note evidence (**implemented for current-note unresolved Obsidian links using existing notes, aliases, titles, and token overlap; still read-only and not yet backed by semantic evidence**)
- detect narrow formatting issues only: missing frontmatter field, duplicate aliases, empty title, malformed tag, broken internal link (**implemented as read-only current-note sanity checks in the workbench**)
- store suggestion evidence and confidence separately (**implemented for source proposal suggestions, with separate latest decision records; workbench suggestion persistence and decision UI remain future work**)

Exit gate:

- each suggestion has provenance
- suggestions can be dismissed or kept without changing notes
- no suggestion requires semantic search to exist

## Phase 6: Guarded Write Actions

Status: started. Core now has the first guarded-write contract for source-to-note creation: a source proposal can become a proposed operation with target path, expected current file hash, preview diff, source provenance, suggestion IDs, and an approval decision record shape. Proposed write operations and write decisions are persisted separately from suggestions and survive read-only mirror rebuilds. The plugin source preview stores the generated source-note operation and exposes a dry-run review modal for that proposed operation. No Obsidian write adapter, apply command, write result store, or note mutation exists yet.

Goal: allow explicit, safe changes after preview.

Implementation steps:

- add `VaultWritePort` (**implemented as a core interface only; no plugin adapter yet**)
- create proposed operations for tag insertion, link insertion, and frontmatter cleanup
- create proposed operations for source-to-note creation after source intake review (**implemented in core as `planSourceNoteCreationOperation`**)
- generate preview diffs (**implemented for source note creation as an added-file diff**)
- verify current file hash before apply (**implemented as `evaluateVaultWritePrecondition`; plugin apply wiring remains future work**)
- record decisions and write results (**approval/defer/reject decision records are implemented and persisted; apply-result storage remains future work**)
- expose a dry-run review surface before any apply path (**implemented from the source preview as a read-only operation/diff/safety modal**)
- reject stale operations when the file changed since analysis

Exit gate:

- no analysis result can write directly
- every write has preview, approval, hash check, and decision record
- source-created notes show both the final Markdown preview and the staged attachment plan before apply
- stale suggestions fail closed

## Phase 7: Mimisbrunnr Bridge

Goal: allow selected tags, relationship insights, and note structures to inform Mimir/Mimisbrunnr later.

Implementation steps:

- define export-only payloads first
- preserve Obsidian note authority
- keep bridge optional
- require explicit approval before sending note-derived context outside the vault workflow

Exit gate:

- bridge can be disabled without affecting Vaultseer
- exported records are explainable and source-linked
- no bridge behavior can mutate notes directly
