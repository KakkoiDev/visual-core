import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import {
  blendTileOverride,
  defaultTileOverrideSettings,
  rotateTerrainMask,
  rotateTextureBitmap,
  safeCenterWeight,
  tileDesignCells,
  tileRotationFamily,
} from "./tileDesign";
import { renderTilePixels, renderTileWithOverridePixels } from "./render";

describe("tile design studio", () => {
  it("rotates canonical Blob contacts clockwise", () => {
    const recipe = createBlankRecipe();
    expect(rotateTerrainMask(recipe, 16, 1)).toBe(64);
    expect(rotateTerrainMask(recipe, 20, 1)).toBe(80);
    expect(rotateTerrainMask(recipe, 255, 3)).toBe(255);
  });

  it("reports only unique rotation variants", () => {
    const recipe = createBlankRecipe();
    expect(tileRotationFamily(recipe, 255)).toHaveLength(1);
    expect(tileRotationFamily(recipe, 20)).toHaveLength(4);
    expect(tileRotationFamily(recipe, 17)).toHaveLength(2);
  });

  it("supports Dual Grid corner anatomy", () => {
    const recipe = createBlankRecipe();
    recipe.topology = "dual16";
    expect(rotateTerrainMask(recipe, 1)).toBe(2);
    expect(tileDesignCells(recipe, 5).filter((cell) => cell.connected).map((cell) => cell.key)).toEqual(["top-left", "bottom-right"]);
  });

  it("keeps the protected seam ring at zero weight", () => {
    const settings = { ...defaultTileOverrideSettings(32), insetPx: 4, featherPx: 2 };
    expect(safeCenterWeight(0, 12, 32, settings)).toBe(0);
    expect(safeCenterWeight(4, 12, 32, settings)).toBe(0);
    expect(safeCenterWeight(5, 12, 32, settings)).toBeCloseTo(0.5);
    expect(safeCenterWeight(8, 12, 32, settings)).toBe(1);
  });

  it("replaces only the safe center and respects the generated silhouette", () => {
    const size = 8;
    const base = new Uint8ClampedArray(size * size * 4);
    const custom = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      base.set([20, 30, 40, x === 4 && y === 4 ? 0 : 255], index);
      custom.set([240, 80, 120, 255], index);
    }
    const output = blendTileOverride(base, custom, size, { mode: "safe-center", insetPx: 2, featherPx: 0 });
    expect([...output.slice(0, 4)]).toEqual([20, 30, 40, 255]);
    expect([...output.slice((3 * size + 3) * 4, (3 * size + 3) * 4 + 4)]).toEqual([240, 80, 120, 255]);
    expect([...output.slice((4 * size + 4) * 4, (4 * size + 4) * 4 + 4)]).toEqual([20, 30, 40, 0]);
  });

  it("rotates rectangular custom art without losing pixels", () => {
    const bitmap = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const rotated = rotateTextureBitmap(bitmap, 1);
    expect([rotated.width, rotated.height]).toEqual([1, 2]);
    expect([...rotated.data]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("keeps every exported edge pixel identical in protected-center mode", () => {
    const recipe = createBlankRecipe();
    recipe.shape.tileSize = 32;
    recipe.overrides["20"] = "fixture";
    recipe.overrideSettings["20"] = { mode: "safe-center", insetPx: 4, featherPx: 2 };
    const custom = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
    for (let index = 0; index < custom.data.length; index += 4) custom.data.set([255, 0, 170, 255], index);
    const textures = new Map([["override:20", custom]]);
    const generated = renderTilePixels(recipe, 20, 32, textures);
    const protectedTile = renderTileWithOverridePixels(recipe, 20, 32, textures);
    for (let coordinate = 0; coordinate < 32; coordinate += 1) {
      for (const pixel of [coordinate, 31 * 32 + coordinate, coordinate * 32, coordinate * 32 + 31]) {
        expect([...protectedTile.slice(pixel * 4, pixel * 4 + 4)]).toEqual([...generated.slice(pixel * 4, pixel * 4 + 4)]);
      }
    }
  });
});
