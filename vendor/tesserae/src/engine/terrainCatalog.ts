import type { TerrainRecipe } from "../types";

export interface TerrainCatalogNode {
  id: string;
  name: string;
  topology: TerrainRecipe["topology"];
  tileSize: number;
  group: string;
  priority: number;
}

export interface TerrainCatalogEdge {
  from: string;
  to: string;
  compatible: boolean;
  reason: "shared-contract" | "different-topology" | "different-tile-size" | "different-group";
}

export function buildTerrainCatalog(recipes: TerrainRecipe[]) {
  const nodes: TerrainCatalogNode[] = recipes.map((recipe) => ({ id: recipe.semantics.terrainId, name: recipe.name, topology: recipe.topology, tileSize: recipe.shape.tileSize, group: recipe.semantics.transitionGroup, priority: recipe.semantics.transitionPriority }));
  const edges: TerrainCatalogEdge[] = [];
  for (let first = 0; first < nodes.length; first += 1) for (let second = first + 1; second < nodes.length; second += 1) {
    const a = nodes[first];
    const b = nodes[second];
    const reason = a.topology !== b.topology ? "different-topology"
      : a.tileSize !== b.tileSize ? "different-tile-size"
        : a.group !== b.group ? "different-group"
          : "shared-contract";
    edges.push({ from: a.id, to: b.id, compatible: reason === "shared-contract", reason });
  }
  return { schemaVersion: 1, nodes, edges };
}
