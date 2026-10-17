import type { TerrainRecipe, TerrainTopology } from "../types";

export interface TopologyChangeImpact {
  overrideCount: number;
  requiresConfirmation: boolean;
}

export function topologyChangeImpact(recipe: TerrainRecipe, next: TerrainTopology): TopologyChangeImpact {
  const overrideCount = next === recipe.topology ? 0 : Object.keys(recipe.overrides).length;
  return { overrideCount, requiresConfirmation: overrideCount > 0 };
}
