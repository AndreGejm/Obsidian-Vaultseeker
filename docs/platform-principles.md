# Vaultseer Platform Principles

Vaultseer is a stable personal note-management platform for an Obsidian vault. The plugin is the control surface, but the platform contract is larger than the UI: it includes indexing, storage, relationship analysis, search, suggestions, write safety, and recovery.

## Product Goal

Vaultseer should help a single person maintain a useful Markdown vault over time.

It should support:

- reading and searching notes
- seeing relationships between notes
- finding weakly connected or duplicate notes
- suggesting tags, links, and structure
- preparing safe note changes for explicit review

It should not optimize for:

- production multi-user deployment
- fastest possible feature delivery
- autonomous note rewriting
- hidden background mutations
- replacing Obsidian as the source of truth

## Stability Contract

Vaultseer must first become a trustworthy mirror of the vault. Only after that should it become an assistant that suggests changes. Only after that should it become an assistant that applies changes.

This creates three platform stages:

1. **Mirror:** read the vault, normalize metadata, build indexes, report health.
2. **Advisor:** generate explainable suggestions from the mirror.
3. **Gardener:** apply approved changes through guarded write operations.

The stages are ordered. A later stage must not bypass an earlier stage.

## Non-Negotiable Invariants

- Markdown files are the source of truth.
- Obsidian metadata is the production metadata authority.
- Core logic consumes normalized records; it does not depend on Obsidian APIs.
- Generated indexes are disposable and rebuildable.
- Search must keep a lexical fallback even when semantic search exists.
- Analysis results must not directly mutate notes.
- Every proposed write must include a target path, expected file hash, preview diff, and decision record.
- Suggestions must include evidence, not only confidence.
- Index storage must be schema-versioned before it becomes persistent.
- Failed indexing must be recoverable by clearing and rebuilding the index.

## Trust Boundaries

### Obsidian Vault

The vault owns the Markdown files and Obsidian's metadata cache. Vaultseer reads files and metadata through the Obsidian adapter.

### Core Package

The core package owns deterministic analysis: normalization, snapshots, relationships, chunking, search, and suggestion scoring. It must stay independent of Obsidian so it can be tested with fixture vaults.

### Plugin Shell

The plugin shell owns Obsidian commands, settings, views, and user confirmation. It may ask core for analysis, but it must not hide writes behind analysis.

### Index Store

The index store owns rebuildable derived data: notes, file versions, chunks, lexical entries, vectors, suggestions, decisions, and health metadata.

### AI And Embeddings

AI models and embedding providers are optional assistants. They may improve search and suggestions, but they must not become the only way to find notes or understand why a suggestion exists.

## State Model

The index should be treated as a stateful mirror with explicit states:

- `empty`: no useful index exists.
- `indexing`: a rebuild or update is in progress.
- `ready`: the mirror matches the known vault snapshot.
- `stale`: the vault changed after the last mirror update.
- `degraded`: the mirror is usable, but some optional feature failed.
- `error`: the mirror is not reliable.

Valid transitions:

- `empty` -> `indexing` -> `ready`
- `ready` -> `stale` when files change
- `stale` -> `indexing` -> `ready`
- any state -> `error` when required indexing fails
- `ready` -> `degraded` when optional providers fail
- `degraded` -> `indexing` -> `ready` after repair

Invalid transitions:

- `error` -> `ready` without a successful rebuild
- `empty` -> `ready` without indexing
- `stale` -> write application without rechecking the target file hash

## Write Safety Ladder

Vaultseer should not write notes until this ladder exists:

1. Analyze current vault state.
2. Produce a proposed operation.
3. Show a preview diff.
4. Verify the current file hash still matches the analyzed hash.
5. Apply the operation only after explicit approval.
6. Record the decision and result.
7. Provide a recovery path when possible.

No suggestion engine may skip this ladder.

## Common Mistakes To Avoid

- Treating tags as proof that a note is connected. Tags describe notes; links and backlinks connect notes.
- Making embeddings mandatory for search. Lexical search must remain the primary fallback.
- Parsing production Markdown in core when Obsidian already parsed it. Core validates normalized input; adapters handle source-specific extraction.
- Adding automatic cleanup before guarded writes exist.
- Creating UI panels before the underlying index health and recovery model is trustworthy.

