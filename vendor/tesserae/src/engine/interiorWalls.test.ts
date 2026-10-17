import { describe, expect, it } from "vitest";
import { BIT, maskFromGrid } from "./blob47";
import { automaticInteriorWallCells, createLabGrid } from "./lab";
import { createInteriorCliffVariant, renderProjectedMapPixels, renderProjectedTilePixels } from "./render";
import { buildGodotImporter, buildGodotProbe, buildManifest, renderInteriorAtlasTilePixels } from "./export";
import { cliffTextureKey, createBlankRecipe } from "../types";

function changedBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) changed += 1;
  return changed;
}

describe("paintable interior cliff walls", () => {
  it("creates a separate flat-color cliff variant without changing the base recipe", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.enabled = true;
    cliff.color = "#223344";
    cliff.cliffInteriorEnabled = true;
    cliff.cliffInteriorColor = "#d13f67";
    const mask = 0;
    const outer = renderProjectedTilePixels(recipe, mask, 64).pixels;
    const interior = createInteriorCliffVariant(recipe, new Map());
    const inner = renderProjectedTilePixels(interior.recipe, mask, 64, interior.textures).pixels;

    expect(changedBytes(outer, inner)).toBeGreaterThan(100);
    expect(cliff.color).toBe("#223344");
    expect(buildManifest(recipe).channels.interiorAlbedo).toBe("tesserae-atlas-inner-v{n}.png");
    const importer = buildGodotImporter(recipe);
    expect(importer).toContain('const INNER_ATLAS_FILES := ["tesserae-atlas-inner-v1.png"]');
    expect(importer).toContain('_apply_semantics(inner_data, "interior")');
    expect(importer).not.toContain("inner_data.terrain_set = 0");
    expect(buildGodotProbe(recipe)).toContain("const EXPECTED_SOURCES := 2");
  });

  it("anchors transparent Blob47 interior walls and preserves short boundary joins", () => {
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.transparentBackground = true;
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.enabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffDirectional = false;
    cliff.cliffHeightSteps = 8 / 32;
    cliff.cliffCrownEnabled = false;
    cliff.shadowEnabled = false;
    cliff.cliffInteriorEnabled = true;
    recipe.overrides = { [String(BIT.S)]: "wall_top_terrain_64" };
    recipe.overrideSettings = { [String(BIT.S)]: { mode: "replace", insetPx: 0, featherPx: 0 } };
    const wallTop = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
    for (let y = 4; y < 8; y += 1) for (let x = 0; x < 32; x += 1) {
      wallTop.data.set([230, 230, 230, 255], (y * 32 + x) * 4);
    }
    for (let y = 20; y < 24; y += 1) for (const x of [0, 1, 14, 15, 30, 31]) {
      wallTop.data.set([230, 230, 230, 255], (y * 32 + x) * 4);
    }
    const interiorTexture = { width: 1, height: 1, data: new Uint8ClampedArray([180, 90, 30, 255]) };
    const textures = new Map([
      [`override:${BIT.S}`, wallTop],
      [cliffTextureKey(cliff.id, "interior"), interiorTexture],
    ]);
    const exterior = renderProjectedTilePixels(recipe, BIT.S, 32, textures);
    const interior = createInteriorCliffVariant(recipe, textures);
    const rendered = renderProjectedTilePixels(interior.recipe, BIT.S, 32, interior.textures);
    const pixelBelowLowerEdge = (x: number) => (rendered.footprint.originY + 25) * rendered.footprint.width + rendered.footprint.originX + x;
    const leftJoin = pixelBelowLowerEdge(0);
    const isolatedPost = pixelBelowLowerEdge(14);
    const rightJoin = pixelBelowLowerEdge(31);

    expect(exterior.pixels[leftJoin * 4 + 3]).toBe(0);
    expect([...rendered.pixels.slice(leftJoin * 4, leftJoin * 4 + 4)]).toEqual([180, 90, 30, 255]);
    expect(rendered.pixels[isolatedPost * 4 + 3]).toBe(0);
    expect([...rendered.pixels.slice(rightJoin * 4, rightJoin * 4 + 4)]).toEqual([180, 90, 30, 255]);
  });

  it("applies the interior material only to automatically classified laboratory cells", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.enabled = true;
    cliff.color = "#223344";
    cliff.cliffInteriorEnabled = true;
    cliff.cliffInteriorColor = "#d13f67";
    const grid = createLabGrid("ring", recipe.shape.seed, 13);
    const cells = grid.flatMap((row, y) => row.flatMap((filled, x) => filled ? [{ x, y, mask: maskFromGrid(grid, x, y) }] : []));
    const outer = renderProjectedMapPixels(recipe, cells, 13, 13, 32).pixels;
    const wallMaterials = new Map([...automaticInteriorWallCells(grid)].map((key) => [key, "inner" as const]));
    const mixed = renderProjectedMapPixels(recipe, cells, 13, 13, 32, new Map(), 0, false, { wallMaterials }).pixels;

    expect(wallMaterials.size).toBeGreaterThan(0);
    expect(changedBytes(outer, mixed)).toBeGreaterThan(100);
  });

  it("keeps a complete interior face when the next Blob tile overlaps its authored edge", () => {
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.tileSize = 64;
    recipe.shape.transparentBackground = true;
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.enabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffDirectional = false;
    cliff.cliffHeightSteps = 24 / 64;
    cliff.cliffPatternSizePx = 48;
    cliff.cliffCrownEnabled = false;
    cliff.shadowEnabled = false;
    cliff.cliffInteriorEnabled = true;
    recipe.overrides = { [String(BIT.S)]: "upper", [String(BIT.N)]: "lower" };
    recipe.overrideSettings = {
      [String(BIT.S)]: { mode: "replace", insetPx: 0, featherPx: 0 },
      [String(BIT.N)]: { mode: "replace", insetPx: 0, featherPx: 0 },
    };
    const upper = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    for (let y = 60; y < 64; y += 1) for (let x = 28; x < 36; x += 1) {
      upper.data.set([230, 230, 230, 255], (y * 64 + x) * 4);
    }
    const lower = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    for (let y = 0; y < 16; y += 1) for (let x = 28; x < 36; x += 1) {
      lower.data.set([230, 230, 230, 255], (y * 64 + x) * 4);
    }
    const interiorTexture = { width: 48, height: 24, data: new Uint8ClampedArray(48 * 24 * 4) };
    for (let y = 0; y < 24; y += 1) for (let x = 0; x < 48; x += 1) {
      interiorTexture.data.set([40 + x * 3, 30 + y * 5, 20 + ((x + y) % 32) * 4, 255], (y * 48 + x) * 4);
    }
    const textures = new Map([
      [`override:${BIT.S}`, upper],
      [`override:${BIT.N}`, lower],
      [cliffTextureKey(cliff.id, "interior"), interiorTexture],
    ]);
    const rendered = renderProjectedMapPixels(
      recipe,
      [{ x: 0, y: 0, mask: BIT.S }, { x: 0, y: 1, mask: BIT.N }],
      1,
      2,
      64,
      textures,
      0,
      false,
      { wallMaterials: new Map([["0,0", "inner"]]) },
    );
    const reference = renderProjectedMapPixels(
      recipe,
      [{ x: 0, y: 0, mask: BIT.S }],
      1,
      1,
      64,
      textures,
      0,
      false,
      { wallMaterials: new Map([["0,0", "inner"]]) },
    );
    const exported = renderInteriorAtlasTilePixels(recipe, BIT.S, textures);
    const pixelAt = (y: number) => ((rendered.footprint.originY + y) * rendered.width + rendered.footprint.originX + 31) * 4;
    const referencePixelAt = (y: number) => ((reference.footprint.originY + y) * reference.width + reference.footprint.originX + 31) * 4;
    const exportedPixelAt = (y: number) => (y * exported.width + 31) * 4;

    expect(rendered.pixels[pixelAt(79) + 3]).toBeGreaterThan(0);
    expect(rendered.pixels[pixelAt(100) + 3]).toBe(255);
    for (let step = 0; step < 24; step += 1) {
      const expected = [...reference.pixels.slice(referencePixelAt(64 + step), referencePixelAt(64 + step) + 4)];
      expect([...rendered.pixels.slice(pixelAt(80 + step), pixelAt(80 + step) + 4)]).toEqual(expected);
      expect([...exported.pixels.slice(exportedPixelAt(80 + step), exportedPixelAt(80 + step) + 4)]).toEqual(expected);
    }
  });
});
