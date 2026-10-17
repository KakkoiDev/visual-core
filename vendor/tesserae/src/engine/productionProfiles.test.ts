import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { applyProductionProfile, evaluateProductionProfile } from "./productionProfiles";

describe("production profiles", () => {
  it("applies the orthogonal 90 degree contract", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "organic";
    recipe.shape.roughness = 0.4;
    recipe.shape.transparentBackground = false;
    applyProductionProfile(recipe, "orthogonal-90");
    expect(recipe.shape).toMatchObject({ outerRadius: 0, innerRadius: 0, deformationMode: "straight", roughness: 0, transparentBackground: true });
    expect(evaluateProductionProfile(recipe)).toEqual([]);
  });

  it("detects drift after a contract was applied", () => {
    const recipe = createBlankRecipe();
    applyProductionProfile(recipe, "orthogonal-90");
    recipe.shape.outerRadius = 0.25;
    recipe.shape.innerRadius = 0.25;
    expect(evaluateProductionProfile(recipe).map((issue) => issue.id)).toContain("profile:orthogonal-corners");
  });

  it("snaps strict pixel corners to whole output pixels", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outerRadius = 0.123;
    applyProductionProfile(recipe, "pixel-strict");
    expect(recipe.shape.outerRadius * recipe.shape.tileSize).toBe(Math.round(recipe.shape.outerRadius * recipe.shape.tileSize));
    expect(evaluateProductionProfile(recipe)).toEqual([]);
  });
});
