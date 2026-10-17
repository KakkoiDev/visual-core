import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { buildTerrainCatalog } from "./terrainCatalog";

describe("terrain transition catalog", () => {
  it("links recipes only when their grid and transition family contracts match", () => {
    const sand = createBlankRecipe("Sand");
    const grass = createBlankRecipe("Grass");
    grass.semantics.transitionGroup = sand.semantics.transitionGroup;
    const catalog = buildTerrainCatalog([sand, grass]);
    expect(catalog.edges[0]).toMatchObject({ compatible: true, reason: "shared-contract" });
  });
});
