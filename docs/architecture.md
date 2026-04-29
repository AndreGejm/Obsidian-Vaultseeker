# Vaultseer Architecture

Vaultseer is built around a strict analysis-before-write rule:

> No analysis result may directly mutate a note. All mutations must first become an explicit proposed operation with a target path, expected file hash, preview diff, and decision record.

## Boundaries

- `packages/core` is Obsidian-free. It receives normalized adapter input, validates it, and builds deterministic indexes.
- `apps/obsidian-plugin` owns Obsidian integration, settings, commands, views, and later guarded writes.
- Markdown files are the source of truth. Indexes, vectors, suggestions, and decisions are rebuildable support data unless explicitly written back through a guarded operation.

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

