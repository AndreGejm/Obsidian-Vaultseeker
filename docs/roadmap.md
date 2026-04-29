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

Status: in progress. The core model namespace, deterministic queue planner, persisted semantic records, pure job transitions, and explicit worker batch controller are implemented; provider adapters, cancellation UI, and semantic search UI are not implemented yet.

Goal: add embeddings without making them a platform dependency.

Implementation steps:

- add cancellable embedding jobs (**core cancellation transition is implemented; cancellation UI is not implemented yet**)
- add resumable queue state (**stored embedding jobs are persisted and reloadable; worker resume is not implemented yet**)
- store model metadata and vector dimensions (**implemented for planning profile and vector namespace**)
- namespace vectors by provider and model (**implemented as provider/model:dimensions namespace**)
- enforce max batch size and backoff (**planner limit and retry `nextAttemptAt` are implemented; worker backoff loop is not implemented yet**)
- keep lexical search as fallback
- mark semantic search degraded when provider calls fail

Next implementation steps:

- add an Obsidian setting for semantic indexing mode without enabling it by default (**implemented with disabled-by-default endpoint, provider id, model id, dimensions, and batch size settings**)
- add an Ollama-compatible provider adapter behind the `EmbeddingProviderPort`
- add an explicit command to run one semantic batch manually before adding background scheduling
- plugin command `Vaultseer: Plan semantic indexing queue` now plans jobs without provider calls when semantic indexing is enabled

Exit gate:

- Obsidian remains responsive during indexing
- closing and reopening Obsidian can resume or safely restart work
- model dimension changes do not corrupt old vector records
- failed semantic indexing does not break lexical search

## Phase 5: Read-Only Suggestions

Goal: produce explainable gardening suggestions without applying them.

Implementation steps:

- suggest tags from existing vault vocabulary
- suggest related notes from links, tags, lexical search, and semantic search
- suggest missing links from unresolved mentions and strong related-note evidence
- detect narrow formatting issues only: missing frontmatter field, duplicate aliases, empty title, malformed tag, broken internal link
- store suggestion evidence and confidence separately

Exit gate:

- each suggestion has provenance
- suggestions can be dismissed or kept without changing notes
- no suggestion requires semantic search to exist

## Phase 6: Guarded Write Actions

Goal: allow explicit, safe changes after preview.

Implementation steps:

- add `VaultWritePort`
- create proposed operations for tag insertion, link insertion, and frontmatter cleanup
- generate preview diffs
- verify current file hash before apply
- record decisions and write results
- reject stale operations when the file changed since analysis

Exit gate:

- no analysis result can write directly
- every write has preview, approval, hash check, and decision record
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
