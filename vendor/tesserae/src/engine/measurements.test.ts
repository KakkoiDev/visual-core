import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { rescaleSpatialRecipeValues } from "./measurements";

describe("measurement units", () => {
  it("preserves pixel distances when tile size changes", () => {
    const recipe = createBlankRecipe();
    const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    border.width = 16 / 128;
    recipe.shape.cutoutExtrusion = 12 / 128;
    cliff.cliffHeightSteps = 37 / 128;
    rescaleSpatialRecipeValues(recipe, 128, 64);
    recipe.shape.tileSize = 64;
    expect(border.width * recipe.shape.tileSize).toBe(16);
    expect(recipe.shape.cutoutExtrusion * recipe.shape.tileSize).toBe(12);
    expect(cliff.cliffHeightSteps * recipe.shape.tileSize).toBe(37);
  });

  it("clamps values that cannot fit in the new tile", () => {
    const recipe = createBlankRecipe();
    const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
    border.width = 1;
    rescaleSpatialRecipeValues(recipe, 512, 16);
    expect(border.width).toBe(1);
    expect(recipe.shape.outerRadius).toBe(0.5);
  });
});
