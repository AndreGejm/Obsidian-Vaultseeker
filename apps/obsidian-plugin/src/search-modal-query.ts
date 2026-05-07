import type { BuildSearchModalStateInput, SearchModalState } from "./search-modal-state";
import { buildSearchModalState } from "./search-modal-state";
import type { SemanticSearchControllerResult } from "./semantic-search-controller";

export type SearchModalSemanticSearch = (query: string) => Promise<SemanticSearchControllerResult>;

export type BuildSearchModalQueryStateInput = BuildSearchModalStateInput & {
  semanticSearch?: SearchModalSemanticSearch;
};

export async function buildSearchModalQueryState(input: BuildSearchModalQueryStateInput): Promise<SearchModalState> {
  const initialState = buildSearchModalState(input);
  if (!input.semanticSearch || initialState.status === "blocked" || !input.query.trim()) {
    return initialState;
  }

  const semantic = await input.semanticSearch(input.query.trim()).catch(() => ({
    status: "degraded" as const,
    message: "Semantic search is unavailable. Lexical search still works.",
    results: []
  }));
  return buildSearchModalState({
    ...input,
    semantic
  });
}
