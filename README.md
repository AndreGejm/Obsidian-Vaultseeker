# Vaultseer

Vaultseer is an Obsidian-native workbench for reading, finding, searching, and organizing a personal Markdown vault.

The project is intentionally split into:

- `packages/core`: Obsidian-free indexing, normalization, search, and suggestion logic.
- `apps/obsidian-plugin`: Obsidian plugin shell, vault adapter, views, settings, and approved writes.

Markdown notes remain the source of truth. Generated indexes are disposable and must be rebuildable from the vault.

