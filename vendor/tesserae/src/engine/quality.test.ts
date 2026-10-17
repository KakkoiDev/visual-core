import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { assessQuality } from "./quality";
import { applyProductionProfile } from "./productionProfiles";

describe("quality gate", () => {
  it("assesses every shipping channel and returns a release grade", () => {
    const report = assessQuality(createBlankRecipe("QA"), new Map(), 8);
    expect(Object.keys(report.seams)).toEqual(["albedo", "normal", "height", "ao"]);
    expect(["ready", "review", "blocked"]).toContain(report.grade);
  });

  it("blocks export when a terrain drifts outside its production rules", () => {
    const recipe = createBlankRecipe("Guarded");
    applyProductionProfile(recipe, "orthogonal-90");
    recipe.shape.outerRadius = 0.25;
    recipe.shape.innerRadius = 0.25;
    const report = assessQuality(recipe, new Map(), 4);
    expect(report.grade).toBe("blocked");
    expect(report.issues.map((issue) => issue.id)).toContain("profile:orthogonal-corners");
  });
});
