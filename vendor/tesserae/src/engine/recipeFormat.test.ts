import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { canonicalRecipeJson, diffRecipes, validateRecipe } from "./recipeFormat";

describe("versioned recipe format", () => {
  it("is canonical and reports focused differences", () => {
    const first = createBlankRecipe();
    const second = structuredClone(first);
    second.semantics.surfaceType = "sand";
    expect(canonicalRecipeJson(first)).toBe(canonicalRecipeJson(structuredClone(first)));
    expect(diffRecipes(first, second)).toEqual([{ path: "semantics.surfaceType", before: "terrain", after: "sand" }]);
    expect(validateRecipe(first)).toEqual([]);
  });
});
