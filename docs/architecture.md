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

## Metadata Contract

The core package consumes `NoteRecordInput`. In production, the Obsidian adapter fills this from `app.metadataCache` and `app.vault.cachedRead`. In tests, fixture adapters may parse raw Markdown, but core itself does not treat raw Markdown parsing as the authority for Obsidian metadata.

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
- suggestion records
- suggestion decision records
- index health metadata

The plugin uses `PersistentVaultseerStore` through an Obsidian data backend. Plugin settings and the stored index share the same Obsidian plugin data file through a wrapper shape:

- `settings`: user-facing plugin settings.
- `index`: the latest rebuildable Vaultseer index, or `null`.

The data store also accepts the original root-level settings shape as a legacy input so early local installs can load settings without requiring manual cleanup.

`rebuildReadOnlyIndex` and `clearReadOnlyIndex` return `IndexHealth`, which records schema version, status, last index time, note count, chunk count, vector count, suggestion count, and warnings.

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
