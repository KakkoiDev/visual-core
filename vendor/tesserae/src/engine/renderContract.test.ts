import { describe, expect, it } from "vitest";
import { renderProjectedMapPixels, renderProjectedTilePixels } from "./render";
import { getTerrainMasks } from "./topology";
import { createBlankRecipe } from "../types";

describe("canonical preview/export rendering contract", () => {
  it.each(["blob47", "dual16"] as const)("uses the exported tile pixels in the %s map preview", (topology) => {
    const recipe = createBlankRecipe();
    recipe.topology = topology;
    recipe.shape.transparentBackground = true;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly);
    if (cliff) {
      cliff.enabled = true;
      cliff.cliffHeightSteps = 0.75;
      cliff.shadowEnabled = false;
    }

    for (const mask of getTerrainMasks(recipe)) {
      const exportedTile = renderProjectedTilePixels(recipe, mask, 32);
      const previewMap = renderProjectedMapPixels(recipe, [{ x: 0, y: 0, mask }], 1, 1, 32);
      expect(previewMap.footprint).toEqual(exportedTile.footprint);
      expect(previewMap.pixels, `mask ${mask}`).toEqual(exportedTile.pixels);
    }
  });
});
