import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { analyzePatternRepetition, buildGodotPatternScript, gridToMacroPattern } from "./patterns";

describe("Macro Pattern Lab", () => {
  it("turns a painted stamp into stable Godot atlas cells", () => {
    const recipe = createBlankRecipe();
    const grid = [[false, true, false], [true, true, true], [false, true, false]];
    const pattern = gridToMacroPattern(grid, recipe, "Cross", "cross");
    expect(pattern.cells).toHaveLength(5);
    expect(buildGodotPatternScript(recipe, pattern)).toContain("TileMapPattern.new()");
    expect(analyzePatternRepetition(pattern).cellCount).toBe(5);
  });
});
