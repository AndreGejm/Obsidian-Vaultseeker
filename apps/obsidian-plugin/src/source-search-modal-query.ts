import type { BuildSourceSearchModalStateInput, SourceSearchModalState } from "./source-search-modal-state";
import { buildSourceSearchModalState } from "./source-search-modal-state";
import type { SourceSemanticSearchControllerResult } from "./source-semantic-search-controller";

export type SourceSearchModalSemanticSearch = (query: string) => Promise<SourceSemanticSearchControllerResult>;

export type BuildSourceSearchModalQueryStateInput = BuildSourceSearchModalStateInput & {
  semanticSearch?: SourceSearchModalSemanticSearch;
};

export async function buildSourceSearchModalQueryState(
  input: BuildSourceSearchModalQueryStateInput
): Promise<SourceSearchModalState> {
  const initialState = buildSourceSearchModalState(input);
  const hasSearchableSource = input.sources.some((source) => source.status === "extracted");
  if (!input.semanticSearch || !input.query.trim() || !hasSearchableSource) {
    return initialState;
  }

  const semantic = await input.semanticSearch(input.query.trim()).catch(() => ({
    status: "degraded" as const,
    message: "Source semantic search is unavailable. Lexical search still works.",
    results: []
  }));
  return buildSourceSearchModalState({
    ...input,
    semantic
  });
}
