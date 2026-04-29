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

Goal: make Vaultseer a reliable read-only mirror of the vault.

Implementation steps:

- add persistent local index storage with schema versioning (**implemented with Obsidian plugin data backend**)
- add explicit index states: empty, indexing, ready, stale, degraded, error (**implemented for the store contract**)
- detect file changes and mark affected index data stale (**implemented for file-version comparison and controller stale checks**)
- add clear-index and rebuild-index recovery paths
- expose index health in the plugin (**implemented as a command/notice surface**)
- expand fixture vaults to cover realistic personal notes
- document what is indexed and what is ignored

Exit gate:

- index can be cleared and rebuilt without manual cleanup
- stale files are detected
- failed indexing reports recoverable diagnostics
- plugin UI can show whether the mirror is trustworthy
- no AI or write feature is required for basic search/index health

## Phase 2: Chunking And Lexical Search

Goal: search useful pieces of notes without relying on embeddings.

Reuse check before implementation:

- study Mimir/Mimisbrunnr chunk identity, bounded retrieval, and lexical search contracts;
- review Omnisearch-style query behavior from `research/`;
- keep only the pieces that fit Vaultseer's personal-vault scope.

Implementation steps:

- define stable chunk boundaries around headings and blocks
- create chunk IDs from note path, heading path, normalized block text hash, and collision ordinal only when needed
- store chunk records in the index store
- build a lexical search index over titles, aliases, headings, tags, and chunk text
- return explainable search results with matched fields
- keep search read-only

Exit gate:

- unchanged chunks survive nearby edits
- search works without an embedding provider
- results explain why they matched
- chunk index can be rebuilt from notes

## Phase 3: Read-Only Workbench Panel

Goal: make the plugin useful without allowing writes.

Implementation steps:

- show current note metadata
- show outgoing links, backlinks, unresolved links, and weak relationship warnings
- show related notes from lexical search and relationship graph data
- show index health and last rebuild time
- provide buttons for rebuild and clear index

Exit gate:

- the panel cannot mutate notes
- every displayed relationship can be traced to indexed evidence
- stale index state is visible

## Phase 4: Semantic Search Queue

Goal: add embeddings without making them a platform dependency.

Implementation steps:

- add cancellable embedding jobs
- add resumable queue state
- store model metadata and vector dimensions
- namespace vectors by provider and model
- enforce max batch size and backoff
- keep lexical search as fallback
- mark semantic search degraded when provider calls fail

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
