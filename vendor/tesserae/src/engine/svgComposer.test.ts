import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { canUseSvgComposer, filledSvgCells, svgCellUnionPath, svgComposerLayers, svgComposerMetrics, svgExportScale } from "./svgComposer";

describe("SVG terrain composer", () => {
  it("treats surface, inner borders and cliff as distinct visual layers", () => {
    const recipe = createBlankRecipe();
    recipe.layers.find((layer) => layer.cliffEnabled)!.enabled = true;
    const layers = svgComposerLayers(recipe);
    expect(layers.surface.kind).toBe("inside");
    expect(layers.innerBorders).toHaveLength(1);
    expect(layers.innerBorders[0].placement).toBe("inner");
    expect(layers.cliff?.cliffEnabled).toBe(true);
  });

  it("builds one global cell union and reserves room for the projected wall", () => {
    const recipe = createBlankRecipe();
    recipe.layers.find((layer) => layer.cliffEnabled)!.enabled = true;
    const cells = filledSvgCells([[true, true], [false, true]]);
    const metrics = svgComposerMetrics(recipe, 2, 64);
    expect(cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(metrics.cliffDepth).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThan(128);
    expect(svgCellUnionPath([[true, true]], 64)).toBe("M0 0h64v64h-64ZM64 0h64v64h-64Z");
  });

  it("exports the preview at the recipe's native tile resolution", () => {
    const recipe = createBlankRecipe();
    recipe.shape.tileSize = 128;
    expect(svgExportScale(recipe, 64)).toBe(2);
  });

  it("keeps imported Blob overrides on the compatible raster renderer", () => {
    const recipe = createBlankRecipe();
    expect(canUseSvgComposer(recipe)).toBe(true);
    recipe.overrides["255"] = "data:image/png;base64,fixture";
    expect(canUseSvgComposer(recipe)).toBe(false);
    recipe.overrides = {};
    recipe.topology = "dual16";
    expect(canUseSvgComposer(recipe)).toBe(false);
  });
});
