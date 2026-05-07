# Vaultseer

Vaultseer is an Obsidian-native workbench for reading, finding, searching, and organizing a personal Markdown vault.

The project goal is not to ship the fastest possible plugin. The goal is to build a stable personal note-management platform that can safely become the main way to inspect, search, and garden an Obsidian vault.

## Private Beta Status

Vaultseer is currently a private local beta. It is intended for a git-backed personal vault and is not ready for public Obsidian community release.

See [Private Beta](docs/private-beta.md) and [Limited go-live smoke checklist](docs/go-live-smoke-checklist.md).

The project is intentionally split into:

- `packages/core`: Obsidian-free indexing, normalization, search, and suggestion logic.
- `apps/obsidian-plugin`: Obsidian plugin shell, vault adapter, views, settings, and approved writes.

Markdown notes remain the source of truth. Generated indexes are disposable and must be rebuildable from the vault.

Vaultseer stores lightweight plugin settings in Obsidian's normal plugin `data.json`. The heavier rebuildable mirror, including note chunks, source workspaces, embedding queues, vectors, suggestions, and guarded write records, is stored separately as `.obsidian/plugins/vaultseer/vaultseer-index.json` on desktop vaults. On first load after upgrading from an older build, Vaultseer migrates any legacy embedded index out of `data.json` and leaves settings behind. If the index file is deleted, rebuild the read-only index and rerun any source or semantic jobs you still need.

The current write scope is active-note-first and reviewable. Vaultseer can stage an active-note rewrite, show a redline preview, let the user edit the proposed Markdown, and write the approved proposal to the current note. It can also create a new Markdown note from an approved source-note proposal, stage tag/frontmatter updates, and stage link-update proposals. Writes re-check the current file hash before editing existing notes. Vaultseer does not yet rename tags, clean arbitrary frontmatter, copy attachments, batch apply proposals, or apply background changes automatically.

Approved source notes are created in the configured source note folder. The default is `Source Notes`, and Vaultseer expects that folder to already exist before an approved write is applied.

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
- `Vaultseer: Open native Studio`
- `Vaultseer: Check native Codex setup`
- `Vaultseer: Reset native Codex session`
- `Vaultseer: Plan semantic indexing queue`
- `Vaultseer: Run one semantic indexing batch`
- `Vaultseer: Cancel active semantic indexing jobs`
- `Vaultseer: Plan source semantic indexing queue`
- `Vaultseer: Run one source semantic indexing batch`
- `Vaultseer: Cancel active source semantic indexing jobs`

Studio chat also exposes quick action buttons plus a `Commands` button. Selecting a Vaultseer command from either place queues the command as a chat requested action; it does not run until the user presses `Run`. The composer also accepts command ids as slash actions, such as `/rebuild-index` or `/plan-semantic-index`, and queues the same approval-gated action without sending the slash text to Codex. Use `/commands` or `/help` to list the available Vaultseer slash actions inside the chat.

## Design Documents

- [Architecture](docs/architecture.md)
- [Limited go-live smoke checklist](docs/go-live-smoke-checklist.md)
- [Indexing contract](docs/indexing-contract.md)
- [Platform principles](docs/platform-principles.md)
- [Reuse audit](docs/reuse-audit.md)
- [Roadmap](docs/roadmap.md)
