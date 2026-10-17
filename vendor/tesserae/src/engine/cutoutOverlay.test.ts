import { describe, expect, it } from "vitest";
import { buildGodotCutoutRuntime, buildGodotImporter, buildManifest } from "./export";
import { renderAuxiliaryTilePixels, renderProjectedMapPixels, renderProjectedTilePixels } from "./render";
import { analyzeSeams } from "./seams";
import { evaluateProductionProfile } from "./productionProfiles";
import { getTerrainMasks } from "./topology";
import { appendInnerBorder, createBlankRecipe, normalizeRecipe } from "../types";

function alphaAt(pixels: Uint8ClampedArray, index: number): number {
  return pixels[index * 4 + 3];
}

describe("cut-out overlays", () => {
  it.each(["blob47", "dual16"] as const)("keeps inside/outside modes perfectly complementary in %s", (topology) => {
    const insideRecipe = createBlankRecipe();
    insideRecipe.topology = topology;
    insideRecipe.shape.tileSize = 32;
    insideRecipe.shape.transparentBackground = false;
    insideRecipe.shape.outputMode = "cutout-inside";
    const outsideRecipe = structuredClone(insideRecipe);
    outsideRecipe.shape.outputMode = "cutout-outside";

    const mask = getTerrainMasks(insideRecipe).find((candidate) => {
      const rendered = renderProjectedTilePixels(insideRecipe, candidate, 32).pixels;
      const alphas = Array.from({ length: 32 * 32 }, (_, index) => alphaAt(rendered, index));
      return alphas.some((alpha) => alpha < 16) && alphas.some((alpha) => alpha > 239);
    });
    expect(mask).toBeDefined();

    const inside = renderProjectedTilePixels(insideRecipe, mask!, 32);
    const outside = renderProjectedTilePixels(outsideRecipe, mask!, 32);
    expect(inside.footprint).toEqual({ logicalSize: 32, width: 32, height: 32, originX: 0, originY: 0, margins: { left: 0, top: 0, right: 0, bottom: 0 } });
    expect(outside.footprint).toEqual(inside.footprint);
    for (let index = 0; index < 32 * 32; index += 1) {
      expect(alphaAt(inside.pixels, index) + alphaAt(outside.pixels, index)).toBeCloseTo(255, 0);
    }
  });

  it.each(["blob47", "dual16"] as const)("uses the same cut-out pixels in preview and export for every %s state", (topology) => {
    const recipe = createBlankRecipe();
    recipe.topology = topology;
    recipe.shape.outputMode = "cutout-outside";
    recipe.shape.transparentBackground = false;
    for (const mask of getTerrainMasks(recipe)) {
      const tile = renderProjectedTilePixels(recipe, mask, 24);
      const preview = renderProjectedMapPixels(recipe, [{ x: 0, y: 0, mask }], 1, 1, 24);
      expect(preview.footprint).toEqual(tile.footprint);
      expect(preview.pixels, `mask ${mask}`).toEqual(tile.pixels);
    }
  });

  it("prefills the bounded Blob canvas before carving terrain cells", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outputMode = "cutout-outside";
    const map = renderProjectedMapPixels(recipe, [{ x: 2, y: 2, mask: 255 }], 5, 5, 16);
    const visible = Array.from({ length: 5 * 5 * 16 * 16 }, (_, index) => alphaAt(map.pixels, index)).filter((alpha) => alpha > 127).length;
    expect(visible / (5 * 5 * 16 * 16)).toBeGreaterThan(0.8);
    expect(alphaAt(map.pixels, 0)).toBe(255);
  });

  it.each(["cutout-inside", "cutout-outside"] as const)("grows the generated transparent side by the configured extrusion in %s mode", (outputMode) => {
    const recipe = createBlankRecipe();
    recipe.shape.tileSize = 32;
    recipe.shape.outputMode = outputMode;
    recipe.shape.cutoutExtrusion = 0;
    const mask = getTerrainMasks(recipe).find((candidate) => {
      const pixels = renderProjectedTilePixels(recipe, candidate, 32).pixels;
      const alphas = Array.from({ length: 32 * 32 }, (_, index) => alphaAt(pixels, index));
      return alphas.some((alpha) => alpha < 16) && alphas.some((alpha) => alpha > 239);
    });
    expect(mask).toBeDefined();

    const unextruded = renderProjectedTilePixels(recipe, mask!, 32).pixels;
    const extrudedRecipe = structuredClone(recipe);
    extrudedRecipe.shape.cutoutExtrusion = 8 / 32;
    const extruded = renderProjectedTilePixels(extrudedRecipe, mask!, 32).pixels;
    const visiblePixels = (pixels: Uint8ClampedArray) => Array.from({ length: 32 * 32 }, (_, index) => alphaAt(pixels, index)).filter((alpha) => alpha > 127).length;
    expect(visiblePixels(extruded)).toBeLessThan(visiblePixels(unextruded));
  });

  it("renders a newly added inner border when digging outside", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outputMode = "cutout-inside";
    const withInnerBorder = appendInnerBorder(recipe, "Inner border", "below", "sandpath-border");
    const border = withInnerBorder.layers.find((layer) => layer.id === "sandpath-border")!;
    border.color = "#ff0000";
    border.accent = "#ff0000";
    border.width = 0.4;
    border.distanceOffset = 0;

    expect(renderProjectedTilePixels(withInnerBorder, 17, 32).pixels).not.toEqual(renderProjectedTilePixels(recipe, 17, 32).pixels);
  });

  it("cuts the uploaded surface bitmap rather than falling back to another layer", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outputMode = "cutout-outside";
    const surface = recipe.layers.find((layer) => layer.kind === "inside")!;
    const textures = new Map([[surface.id, {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        24, 210, 72, 255, 24, 210, 72, 255,
        24, 210, 72, 255, 24, 210, 72, 255,
      ]),
    }]]);
    const textured = renderProjectedTilePixels(recipe, 0, 32, textures).pixels;
    const procedural = renderProjectedTilePixels(recipe, 0, 32).pixels;
    expect(textured).not.toEqual(procedural);
    let visible = 0;
    for (let index = 1; index < 32 * 32; index += 1) if (alphaAt(textured, index) > alphaAt(textured, visible)) visible = index;
    expect(alphaAt(textured, visible)).toBeGreaterThan(0);
    expect(textured[visible * 4 + 1]).toBeGreaterThan(textured[visible * 4]);
    expect(textured[visible * 4 + 1]).toBeGreaterThan(textured[visible * 4 + 2]);
  });

  it.each(["cutout-inside", "cutout-outside"] as const)("preserves source PNG transparency in %s mode", (outputMode) => {
    const recipe = createBlankRecipe();
    recipe.shape.outputMode = outputMode;
    const surface = recipe.layers.find((layer) => layer.kind === "inside")!;
    const textures = new Map([[surface.id, {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        240, 32, 48, 0,
        24, 210, 72, 255,
      ]),
    }]]);

    const rendered = renderProjectedTilePixels(recipe, outputMode === "cutout-inside" ? 255 : 0, 32, textures).pixels;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 16; x += 1) expect(alphaAt(rendered, y * 32 + x)).toBe(0);
    }
    expect(Array.from({ length: 32 * 16 }, (_, index) => alphaAt(rendered, Math.floor(index / 16) * 32 + 16 + index % 16)).some((alpha) => alpha > 0)).toBe(true);
    for (const channel of ["normal", "height", "ao"] as const) {
      const auxiliary = renderAuxiliaryTilePixels(recipe, outputMode === "cutout-inside" ? 255 : 0, 32, channel, 0, textures);
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 16; x += 1) expect(alphaAt(auxiliary, y * 32 + x)).toBe(0);
      }
    }
  });

  it("exports automatic transparency and migrates old recipes to composed terrain", () => {
    const cutout = createBlankRecipe();
    cutout.shape.outputMode = "cutout-outside";
    cutout.shape.transparentBackground = false;
    cutout.shape.cutoutExtrusion = 0.25;
    expect(buildManifest(cutout)).toMatchObject({
      outputMode: "cutout-outside",
      cutoutExtrusion: 0.25,
      cutoutExtrusionPx: 16,
      transparentBackground: true,
      atlas: { tileCount: 48, terrainStateCount: 47 },
      utilityTiles: [{ role: "cutout-fill", atlas: { x: 10, y: 1 }, terrain: false }],
    });
    expect(buildGodotImporter(cutout)).toContain("source.create_tile(CUTOUT_FILL_COORDS)");
    expect(buildGodotCutoutRuntime()).toContain("set_cells_terrain_connect");

    const legacy = createBlankRecipe();
    delete (legacy.shape as Partial<typeof legacy.shape>).outputMode;
    delete (legacy.shape as Partial<typeof legacy.shape>).cutoutExtrusion;
    const normalized = normalizeRecipe(legacy);
    expect(normalized.shape.outputMode).toBe("composite");
    expect(normalized.shape.cutoutExtrusion).toBe(0);
  });

  it("treats hidden composite layers and automatic alpha as valid production output", () => {
    const recipe = createBlankRecipe();
    recipe.productionProfile = "orthogonal-90";
    recipe.shape.outputMode = "cutout-outside";
    recipe.shape.transparentBackground = false;
    recipe.shape.deformationMode = "straight";
    recipe.shape.roughness = 0;
    recipe.shape.outerRadius = 0;
    recipe.shape.innerRadius = 0;
    for (const layer of recipe.layers.filter((candidate) => candidate.cliffEnabled)) layer.cliffVerticalSampling = "repeat";
    expect(evaluateProductionProfile(recipe)).toEqual([]);
  });

  it.each(["blob47", "dual16"] as const)("keeps cut-out albedo seams healthy in %s", (topology) => {
    const recipe = createBlankRecipe();
    recipe.topology = topology;
    recipe.shape.outputMode = "cutout-outside";
    const report = analyzeSeams(recipe, new Map(), 12, "albedo");
    expect(report.maximum).toBe(0);
  });
});
