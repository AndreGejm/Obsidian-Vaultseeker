# Vaultseer Indexing Contract

Vaultseer indexes a read-only mirror of an Obsidian vault. Markdown files remain the source of truth, and Obsidian's metadata cache remains the production metadata authority.

## Reuse Notes

This contract borrows concepts from local references instead of inventing everything from scratch:

- **Obsidian Tags Overview:** use Obsidian metadata cache tags, expand nested tags such as `source/literature` into `source` and `source/literature`, and deduplicate tags before analysis.
- **Dataview fixtures:** expect personal notes to contain frontmatter fields, inline fields such as `Author::`, and Dataview code blocks. Vaultseer preserves the note content but does not interpret Dataview queries in Phase 1.
- **Metadata Menu fixtures:** expect typed frontmatter such as `fileClass`, numeric fields, and blank property values. Vaultseer keeps frontmatter as raw metadata but only normalizes the fields it owns today.
- **Mimir/Mimisbrunnr chunking:** future chunking should respect headings, block boundaries, and code fences. Phase 1 only stores note and file-version records.

## Indexed In Phase 1

Vaultseer currently indexes these fields from normalized adapter records:

| Data | Source | Current use |
|---|---|---|
| Note path | Obsidian file path | Stable note identity and maps |
| Basename/title | Obsidian file basename plus optional frontmatter `title` | Display title and lookup |
| File stats | Obsidian file stat | File-version records and stale checks |
| Content hash | Note content | Stale checks and future write safety |
| Frontmatter object | Obsidian metadata cache | Preserved for future analysis |
| Tags | Frontmatter `tags`/`tag` plus Obsidian cache tags | Tag lookup and relationship graph |
| Aliases | Frontmatter `aliases`/`alias` plus adapter aliases | Search/display preparation |
| Internal links | Obsidian metadata cache links | Relationship graph and backlinks |
| Headings | Obsidian metadata cache headings | Heading paths and future chunking |

## Ignored Or Preserved But Not Interpreted

| Data | Current behavior | Reason |
|---|---|---|
| Raw Markdown parsing | Not performed in core | Avoids drift from Obsidian metadata behavior |
| Dataview query execution | Not interpreted | Out of scope for trusted mirror |
| Dataview inline fields | Preserved only as content/frontmatter if provided by adapter | Query semantics belong to Dataview |
| Metadata Menu field schemas | Preserved as frontmatter values | Field schema enforcement is a later suggestion feature |
| Task state | Preserved as content only | Task indexing is not part of Phase 1 |
| Embedded files/PDFs/images | Not indexed | Markdown notes are the current boundary |
| `.obsidian` folder | Excluded by default settings | Plugin config is not personal note content |
| `research` folder | Excluded by default settings | Local cloned references should not become personal notes |
| Operator-configured excluded folders | Skipped by plugin controller | Supports archives and private scratch spaces |

## Fixture Vaults

The fixture vaults under `tests/fixtures` are intentionally small. They are not demo content; they are regression surfaces for platform behavior.

- `vault-basic`: minimal two-note linking behavior.
- `vault-literature`: literature-style source note with aliases, nested tags, heading links, and source tags.
- `vault-tags`: nested tag behavior.
- `vault-personal-knowledge`: realistic personal notes with maps, literature, people, references, project notes, Dataview-style content, Metadata Menu-style `fileClass`, unresolved links, and an excluded archive note.

Tests pair these Markdown files with normalized adapter records. This is intentional: production metadata comes from Obsidian's cache, while test fixture Markdown keeps the examples readable for humans.

## Phase 1 Guarantees

- Indexing is read-only.
- Index data is rebuildable.
- Stale checks are based on path, size, and content hash.
- Mtime-only changes do not mark notes stale.
- Unsupported persistent index schemas fail closed with `error` health.
- Clear index plus rebuild index is the recovery path.

## Not Yet Guaranteed

- Chunk-level search.
- Semantic search.
- Dataview-compatible querying.
- Metadata Menu schema validation.
- Task indexing.
- Write previews or guarded note mutations.

