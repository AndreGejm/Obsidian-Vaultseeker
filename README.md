# Vaultseer

Vaultseer is an Obsidian-native workbench for reading, finding, searching, and organizing a personal Markdown vault.

The project goal is not to ship the fastest possible plugin. The goal is to build a stable personal note-management platform that can safely become the main way to inspect, search, and garden an Obsidian vault.

The project is intentionally split into:

- `packages/core`: Obsidian-free indexing, normalization, search, and suggestion logic.
- `apps/obsidian-plugin`: Obsidian plugin shell, vault adapter, views, settings, and approved writes.

Markdown notes remain the source of truth. Generated indexes are disposable and must be rebuildable from the vault.

## Current Plugin Commands

- `Vaultseer: Rebuild read-only vault index`
- `Vaultseer: Clear read-only vault index`
- `Vaultseer: Check read-only vault index health`
- `Vaultseer: Search read-only vault index`
- `Vaultseer: Open read-only workbench`

## Design Documents

- [Architecture](docs/architecture.md)
- [Indexing contract](docs/indexing-contract.md)
- [Platform principles](docs/platform-principles.md)
- [Roadmap](docs/roadmap.md)
