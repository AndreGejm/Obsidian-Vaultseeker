# Personal Knowledge Fixture Vault

This fixture vault captures common personal Obsidian patterns observed in the research repositories:

- frontmatter tags, aliases, and typed properties;
- nested tags for tag-tree behavior;
- Dataview-style inline fields and code blocks;
- Metadata Menu-style `fileClass` frontmatter;
- internal links, backlinks, and intentionally unresolved links;
- an `Archive` folder used by exclusion tests.

Vaultseer core does not parse these Markdown files as the source of metadata. Tests pair the Markdown files with normalized adapter records because production metadata should come from Obsidian's metadata cache.

