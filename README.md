# Vaultseer

Vaultseer is an Obsidian-native workbench for reading, finding, searching, and organizing a personal Markdown vault.

The project goal is not to ship the fastest possible plugin. The goal is to build a stable personal note-management platform that can safely become the main way to inspect, search, and garden an Obsidian vault.

The project is intentionally split into:

- `packages/core`: Obsidian-free indexing, normalization, search, and suggestion logic.
- `apps/obsidian-plugin`: Obsidian plugin shell, vault adapter, views, settings, and approved writes.

Markdown notes remain the source of truth. Generated indexes are disposable and must be rebuildable from the vault.

The current write scope is deliberately small: Vaultseer can create a new Markdown note from an approved source-note proposal through the guarded write review queue. It does not yet edit existing notes, tags, links, frontmatter, aliases, or attachments.

## Current Plugin Commands

- `Vaultseer: Rebuild read-only vault index`
- `Vaultseer: Clear read-only vault index`
- `Vaultseer: Check read-only vault index health`
- `Vaultseer: Search read-only vault index`
- `Vaultseer: Search stored source workspaces`
- `Vaultseer: Open guarded write review queue`
- `Vaultseer: Import active text/code file as source workspace`
- `Vaultseer: Choose text/code file to import as source workspace`
- `Vaultseer: Plan PDF source extraction queue`
- `Vaultseer: Show source extraction queue status`
- `Vaultseer: Run one PDF source extraction batch`
- `Vaultseer: Recover interrupted source extraction jobs`
- `Vaultseer: Cancel active source extraction jobs`
- `Vaultseer: Open read-only workbench`
- `Vaultseer: Plan semantic indexing queue`
- `Vaultseer: Run one semantic indexing batch`
- `Vaultseer: Cancel active semantic indexing jobs`
- `Vaultseer: Plan source semantic indexing queue`
- `Vaultseer: Run one source semantic indexing batch`
- `Vaultseer: Cancel active source semantic indexing jobs`

## Design Documents

- [Architecture](docs/architecture.md)
- [Indexing contract](docs/indexing-contract.md)
- [Platform principles](docs/platform-principles.md)
- [Reuse audit](docs/reuse-audit.md)
- [Roadmap](docs/roadmap.md)
