import { describe, expect, it } from "vitest";
import { BIT, canonicalizeMask, getBlobMasks, hasBit, maskFromGrid } from "./blob47";
import { composeBlob47FromBlob15 } from "./blob15";
import { dualMaskFromGrid, getDualMasks } from "./dual16";
import { appendCliffLayer, appendInnerBorder, automaticCliffCrownWidth, cliffTextureKey, createArtisticCoastRecipe, createBlankRecipe, DEFAULT_CLIFF_HEIGHT_STEPS, DEFAULT_RECIPE, MAX_EDGE_DEFORMATION, MAX_SHADOW_BLUR, MAX_SHADOW_DISTANCE, normalizeCliffHeight, normalizeRecipe } from "../types";
import { buildDistanceField, buildDualDistanceField, cliffDepthForEdge, cliffDepthForNormal, cliffTextureWeightsForNormal, cliffWallTextureCoordinates, projectionFootprint, renderAuxiliaryTilePixels, renderOutsidePixels, renderProjectedAuxiliaryTilePixels, renderProjectedMapPixels, renderProjectedTilePixels, renderTilePixels, sampleDirectionalCliffTexture } from "./render";
import { atlasCellFootprint, buildGodotDualRuntime, buildGodotImporter, buildGodotShader, buildManifest, createStoreZip, inspectPng } from "./export";
import { analyzeSeams } from "./seams";
import { createLabGrid } from "./lab";
import { artisticVariantInteriorWeight, periodicCoastMotif, periodicNoise } from "./noise";
import type { TerrainRecipe } from "../types";

function pixelAt(pixels: Uint8ClampedArray, size: number, x: number, y: number): [number, number, number, number] {
  const index = (y * size + x) * 4;
  return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
}

describe("blob-47 topology", () => {
  it("enumerates exactly 47 canonical states", () => {
    const masks = getBlobMasks();
    expect(masks).toHaveLength(47);
    expect(new Set(masks).size).toBe(47);
    expect(masks).toContain(0);
    expect(masks).toContain(255);
  });

  it("removes diagonal neighbors without both supporting cardinals", () => {
    expect(canonicalizeMask(BIT.NE)).toBe(0);
    expect(canonicalizeMask(BIT.N | BIT.E | BIT.NE)).toBe(BIT.N | BIT.E | BIT.NE);
  });

  it("derives a canonical center mask from a painted grid", () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => true));
    expect(maskFromGrid(grid, 1, 1)).toBe(255);
  });
});

describe("dual-grid-16 topology", () => {
  it("enumerates the 16 Marching Squares states", () => {
    expect(getDualMasks()).toEqual(Array.from({ length: 16 }, (_, index) => index));
    const grid = [[true, false], [false, true]];
    expect(dualMaskFromGrid(grid, 1, 1)).toBe(5);
  });

  it("renders distinct empty, full and ambiguous diagonal states", () => {
    const dual = structuredClone(DEFAULT_RECIPE);
    dual.topology = "dual16";
    const empty = renderTilePixels(dual, 0, 24);
    const full = renderTilePixels(dual, 15, 24);
    const solidDifference = full.reduce((sum, value, index) => sum + Math.abs(value - empty[index]), 0);
    expect(solidDifference).toBeGreaterThan(5000);
    dual.dualDiagonal = "separate";
    const separate = renderTilePixels(dual, 5, 24);
    dual.dualDiagonal = "connected";
    const connected = renderTilePixels(dual, 5, 24);
    const diagonalDifference = connected.reduce((sum, value, index) => sum + Math.abs(value - separate[index]), 0);
    expect(diagonalDifference).toBeGreaterThan(500);
  });

  it("keeps all compatible dual-grid borders continuous", () => {
    const dual = structuredClone(DEFAULT_RECIPE);
    dual.topology = "dual16";
    const report = analyzeSeams(dual, new Map(), 20);
    expect(report.testedPairs).toBe(128);
    expect(report.maximum).toBeLessThan(8);
    expect(report.grade).toBe("healthy");
  });

  it("keeps sine-deformed Dual Grid borders continuous", () => {
    const dual = createBlankRecipe();
    dual.topology = "dual16";
    dual.shape.deformationMode = "wave";
    dual.shape.roughness = 0.6;
    dual.shape.frequency = 5;
    dual.shape.deformationPhase = 0.31;
    const report = analyzeSeams(dual, new Map(), 24);
    expect(report.testedPairs).toBe(128);
    expect(report.maximum).toBeLessThan(8);
    expect(report.grade).toBe("healthy");
  });

  it("keeps high-amplitude Dual Grid contours seamless", () => {
    for (const deformationMode of ["wave", "organic"] as const) {
      const dual = createBlankRecipe();
      dual.topology = "dual16";
      dual.shape.deformationMode = deformationMode;
      dual.shape.roughness = MAX_EDGE_DEFORMATION;
      dual.shape.frequency = deformationMode === "organic" ? 1.75 : 5;
      dual.shape.deformationPhase = 0.31;
      if (deformationMode === "organic") {
        dual.shape.organicOctaves = 6;
        dual.shape.organicPersistence = 1;
      }
      const report = analyzeSeams(dual, new Map(), 24);
      expect(report.testedPairs).toBe(128);
      expect(report.maximum, deformationMode).toBeLessThan(8);
      expect(report.grade, deformationMode).toBe("healthy");
    }
  });

  it("makes organic detail layers, persistence and offset visibly independent", () => {
    const base = createBlankRecipe();
    base.shape.deformationMode = "organic";
    base.shape.roughness = 1.5;
    base.shape.frequency = 1.25;
    base.shape.organicOctaves = 1;
    base.shape.organicPersistence = 0;
    base.shape.deformationPhase = 0;
    const simple = renderTilePixels(base, 0, 64);

    const detailed = structuredClone(base);
    detailed.shape.organicOctaves = 6;
    detailed.shape.organicPersistence = 0.8;
    const detailedPixels = renderTilePixels(detailed, 0, 64);
    const detailDifference = simple.reduce((sum, value, index) => sum + Math.abs(value - detailedPixels[index]), 0);
    expect(detailDifference).toBeGreaterThan(5000);

    const shifted = structuredClone(detailed);
    shifted.shape.organicOffset = 0.37;
    const shiftedPixels = renderTilePixels(shifted, 0, 64);
    const offsetDifference = detailedPixels.reduce((sum, value, index) => sum + Math.abs(value - shiftedPixels[index]), 0);
    expect(offsetDifference).toBeGreaterThan(5000);
  });

  it("interpolates organic frequency gradually without breaking periodic seams", () => {
    let nextStepDifference = 0;
    let fullDifference = 0;
    const secondUserStep = 0.25 + 1.75 / 9;
    for (let y = 0; y < 32; y += 3) {
      for (let x = 0; x < 32; x += 3) {
        const low = periodicNoise(x, y, 31, 1847, 0.25, 4, 0.5);
        const nextStep = periodicNoise(x, y, 31, 1847, secondUserStep, 4, 0.5);
        const high = periodicNoise(x, y, 31, 1847, 2, 4, 0.5);
        nextStepDifference += Math.abs(nextStep - low);
        fullDifference += Math.abs(high - low);
      }
      expect(periodicNoise(0, y, 31, 1847, secondUserStep, 4, 0.5)).toBeCloseTo(periodicNoise(31, y, 31, 1847, secondUserStep, 4, 0.5), 10);
    }
    expect(nextStepDifference).toBeGreaterThan(0);
    expect(nextStepDifference).toBeLessThan(fullDifference * 0.5);
  });

  it("builds periodic artistic coast motifs with variants locked at tile edges", () => {
    const period = 63;
    for (let offset = 0; offset <= period; offset += 7) {
      expect(periodicCoastMotif(0, offset, period, 7301, 0.8, 5, 0.42))
        .toBeCloseTo(periodicCoastMotif(period, offset, period, 7301, 0.8, 5, 0.42), 10);
      expect(periodicCoastMotif(offset, 0, period, 7301, 0.8, 5, 0.42))
        .toBeCloseTo(periodicCoastMotif(offset, period, period, 7301, 0.8, 5, 0.42), 10);
    }
    expect(artisticVariantInteriorWeight(0, 32, 64)).toBe(0);
    expect(artisticVariantInteriorWeight(32, 32, 64)).toBe(1);
  });

  it("keeps artistic variants mix-safe while making their interiors distinct", () => {
    const recipe = createArtisticCoastRecipe();
    const size = 64;
    const first = renderTilePixels(recipe, 0, size, new Map(), 0);
    const second = renderTilePixels(recipe, 0, size, new Map(), 1);
    let interiorDifference = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = (y * size + x) * 4;
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
          expect([...second.slice(index, index + 4)]).toEqual([...first.slice(index, index + 4)]);
        } else if (x > 12 && x < size - 12 && y > 12 && y < size - 12) {
          interiorDifference += Math.abs(first[index] - second[index]);
          interiorDifference += Math.abs(first[index + 1] - second[index + 1]);
          interiorDifference += Math.abs(first[index + 2] - second[index + 2]);
        }
      }
    }
    expect(interiorDifference).toBeGreaterThan(1000);

    const singleVariant = structuredClone(recipe);
    singleVariant.variants.count = 1;
    singleVariant.variants.weights = [100];
    const singleReport = analyzeSeams(singleVariant, new Map(), 20);
    const mixedReport = analyzeSeams(recipe, new Map(), 20);
    expect(mixedReport.testedPairs).toBe(singleReport.testedPairs * 16);
    expect(mixedReport.maximum).toBeLessThan(8);
    expect(mixedReport.grade).toBe("healthy");
  });

  it("preserves the legacy organic contour when only the sine phase differs", () => {
    const legacy = createBlankRecipe();
    legacy.shape.deformationMode = "organic";
    legacy.shape.roughness = 1.2;
    legacy.shape.frequency = 2;
    legacy.shape.organicOffset = 0;
    legacy.shape.deformationPhase = 0;
    const phaseZero = renderTilePixels(legacy, 0, 64);

    legacy.shape.deformationPhase = 0.83;
    const legacySavedPhase = renderTilePixels(legacy, 0, 64);
    expect(legacySavedPhase).toEqual(phaseZero);
  });

  it("projects Dual Grid widths above 50% progressively beyond the contour tile", () => {
    for (const deformationMode of ["wave", "organic"] as const) {
      const projectedAreas: number[] = [];
      for (const width of [0.51, 0.6, 0.75, 0.99]) {
        const recipe = createBlankRecipe();
        recipe.topology = "dual16";
        recipe.shape.transparentBackground = true;
        recipe.shape.deformationMode = deformationMode;
        recipe.shape.roughness = 0.8;
        recipe.shape.frequency = 6;
        const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
        border.width = width;
        border.fadeInward = 0;
        border.distanceOffset = -0.045;
        border.cutoff = 0.008;
        const projected = renderProjectedTilePixels(recipe, 3, 64);
        let outsidePixels = 0;
        for (let y = 0; y < projected.footprint.originY; y += 1) {
          for (let x = 0; x < projected.footprint.width; x += 1) {
            if (projected.pixels[(y * projected.footprint.width + x) * 4 + 3] > 0) outsidePixels += 1;
          }
        }
        projectedAreas.push(outsidePixels);
      }
      expect(projectedAreas[0], deformationMode).toBeGreaterThan(0);
      for (let index = 1; index < projectedAreas.length; index += 1) expect(projectedAreas[index]).toBeGreaterThanOrEqual(projectedAreas[index - 1]);
      expect(projectedAreas.at(-1)!).toBeGreaterThan(projectedAreas[0]);
    }
  });

  it("uses pixel-distance widths and applies corner rounding in Dual Grid", () => {
    const recipe = createBlankRecipe();
    const sharpShape = { ...recipe.shape, outerRadius: 0 };
    const roundedShape = { ...recipe.shape, outerRadius: 0.5 };
    const sharp = buildDualDistanceField(1, 64, sharpShape);
    const rounded = buildDualDistanceField(1, 64, roundedShape);
    const roundingDifference = rounded.distance.reduce((sum, value, index) => sum + Math.abs(value - sharp.distance[index]), 0);
    expect(roundingDifference).toBeGreaterThan(500);
    const narrow = Array.from(rounded.distance).filter((distance) => Math.abs(distance) <= 3.2).length;
    const wide = Array.from(rounded.distance).filter((distance) => Math.abs(distance) <= 6.4).length;
    expect(wide / narrow).toBeGreaterThan(1.5);
    expect(wide / narrow).toBeLessThan(2.5);
  });

  it("maps Dual Grid percentages linearly to straight-tile coverage", () => {
    const recipe = createBlankRecipe();
    recipe.topology = "dual16";
    recipe.shape.transparentBackground = true;
    recipe.shape.deformationMode = "straight";
    recipe.shape.roughness = 0;
    recipe.shape.outerRadius = 0;
    recipe.shape.innerRadius = 0;
    const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
    border.fadeInward = 0;
    border.opacity = 1;
    border.innerFade = 0;
    border.outerFade = 0;
    border.distanceOffset = 0;
    border.cutoff = 0;
    border.relief = 0;
    const size = 64;
    const texture = { width: 1, height: 1, data: new Uint8ClampedArray([241, 37, 83, 255]) };
    for (const expectedCoverage of [0.25, 0.5]) {
      border.width = expectedCoverage;
      const pixels = renderTilePixels(recipe, 3, size, new Map([[border.id, texture]]));
      let replacedPixels = 0;
      for (let pixel = 0; pixel < size * size; pixel += 1) {
        const index = pixel * 4;
        if (pixels[index] === 241 && pixels[index + 1] === 37 && pixels[index + 2] === 83 && pixels[index + 3] > 0) replacedPixels += 1;
      }
      const coverage = replacedPixels / (size * size);
      expect(coverage).toBeGreaterThan(expectedCoverage - 0.05);
      expect(coverage).toBeLessThan(expectedCoverage + 0.05);
    }
  });

  it("keeps 51–100% Dual Grid bands uniform across tile seams", () => {
    const size = 32;
    const grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, () => y >= 3));
    const cells: Array<{ x: number; y: number; mask: number }> = [];
    for (let y = 0; y <= grid.length; y += 1) for (let x = 0; x <= grid.length; x += 1) cells.push({ x, y, mask: dualMaskFromGrid(grid, x, y) });
    const texture = { width: 1, height: 1, data: new Uint8ClampedArray([238, 92, 70, 255]) };
    for (const widthPercent of [0.51, 0.75, 1]) for (const fadeInward of [0, 1]) {
      const recipe = createBlankRecipe();
      recipe.topology = "dual16";
      recipe.shape.transparentBackground = true;
      recipe.shape.deformationMode = "straight";
      recipe.shape.roughness = 0;
      const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
      border.width = widthPercent;
      border.fadeInward = fadeInward;
      border.relief = 0;
      const rendered = renderProjectedMapPixels(recipe, cells, 8, 8, size, new Map([[border.id, texture]]));
      const xStart = rendered.footprint.originX + size * 2;
      const xEnd = rendered.footprint.originX + size * 6;
      for (let y = 0; y < rendered.height; y += 1) {
        const first = (y * rendered.width + xStart) * 4;
        if (rendered.pixels[first + 3] < 250) continue;
        for (let x = xStart + 1; x < xEnd; x += 1) {
          const index = (y * rendered.width + x) * 4;
          expect(Math.abs(rendered.pixels[index] - rendered.pixels[first]), `red seam at ${widthPercent}/${fadeInward}/${x}/${y}`).toBeLessThanOrEqual(2);
          expect(Math.abs(rendered.pixels[index + 1] - rendered.pixels[first + 1]), `green seam at ${widthPercent}/${fadeInward}/${x}/${y}`).toBeLessThanOrEqual(2);
          expect(Math.abs(rendered.pixels[index + 2] - rendered.pixels[first + 2]), `blue seam at ${widthPercent}/${fadeInward}/${x}/${y}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe("blank project defaults", () => {
  it("starts new terrain recipes in Blob 47", () => {
    expect(DEFAULT_RECIPE.topology).toBe("blob47");
    expect(createBlankRecipe().topology).toBe("blob47");
  });

  it("starts as a clean rounded terrain with a straight 20% inner border", () => {
    const blank = createBlankRecipe();
    const bands = blank.layers.filter((layer) => layer.kind === "band" && !layer.cliffFaceOnly);
    expect(blank.shape).toMatchObject({
      transparentBackground: true,
      roughness: 0,
      outerRadius: 0.5,
      innerRadius: 0.5,
      thickness: 1,
    });
    expect(blank.variants).toMatchObject({ count: 1, contourVariation: 0 });
    expect(blank.shape.tileSize).toBe(64);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      placement: "inner",
      width: 0.2,
      distanceOffset: 0,
      innerFade: 0,
      outerFade: 0,
      feather: 0,
      taper: 0,
      roughness: 0,
      innerContour: { mode: "straight", amplitude: 0 },
      outerContour: { mode: "straight", amplitude: 0 },
      sides: { N: true, E: true, S: true, W: true },
      cliffHeightSteps: DEFAULT_CLIFF_HEIGHT_STEPS,
    });
  });

  it("adds inner borders below the previous one in ten-percent increments", () => {
    const blank = createBlankRecipe();
    const second = appendInnerBorder(blank, "Inner border", "below", "border-2");
    const third = appendInnerBorder(second, "Inner border", "below", "border-3");
    const borders = third.layers.filter((layer) => layer.kind === "band" && !layer.cliffFaceOnly);
    expect(borders.map((layer) => layer.id)).toEqual(["inner-border", "border-2", "border-3"]);
    expect(borders.map((layer) => layer.width)).toEqual([0.2, 0.3, 0.4]);
    expect(third.selectedLayerId).toBe("border-3");
    expect(third.stackOrder).toBe("top-first");
  });

  it("recreates the default inner border after the last border is removed", () => {
    const blank = createBlankRecipe();
    blank.layers = blank.layers.filter((layer) => layer.kind !== "band" || layer.cliffFaceOnly);
    const restored = appendInnerBorder(blank, "Inner border", "below", "restored-border");
    const borders = restored.layers.filter((layer) => layer.kind === "band" && !layer.cliffFaceOnly);
    expect(borders).toHaveLength(1);
    expect(borders[0]).toMatchObject({ id: "restored-border", width: 0.2, placement: "inner", cliffFaceOnly: false });
    expect(restored.layers.findIndex((layer) => layer.id === "restored-border"))
      .toBeLessThan(restored.layers.findIndex((layer) => layer.cliffFaceOnly));
  });

  it("starts cliffs as a texture-only face without a hidden overlap control", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    expect(cliff).toMatchObject({
      enabled: false,
      cliffEnabled: true,
      cliffFaceOnly: true,
      cliffOverlap: 0,
      cliffHeightSteps: 3,
      cliffDirection: "S",
      cliffSideDepth: 0.8,
      cliffRearDepth: 0,
      cliffPatternSizePx: 64,
      cliffTextureOffsetXPx: 0,
      cliffCrownEnabled: false,
      cliffCrownWidthPx: 6,
      cliffCrownPatternSizePx: 64,
      cliffSideTextureScale: 1,
      cliffDirectionalLight: 0,
      shadowOpacity: 0.85,
      shadowDistance: 0.3,
      shadowAngle: 90,
      shadowBlur: 0.1,
      scale: 1,
      sides: { N: false, E: false, S: true, W: false },
    });
  });

  it("infers a compact crown from square materials and preserves authored strip height", () => {
    expect(automaticCliffCrownWidth(128, 128, 128)).toBe(13);
    expect(automaticCliffCrownWidth(256, 18, 128)).toBe(18);
  });

  it("recreates one removable cliff that always projects downward", () => {
    const blank = createBlankRecipe();
    blank.layers = blank.layers.filter((layer) => !layer.cliffEnabled);
    const front = appendCliffLayer(blank, "Cliff", "front-cliff");
    const duplicateAttempt = appendCliffLayer(front, "Cliff", "side-cliff");
    const cliffs = duplicateAttempt.layers.filter((layer) => layer.cliffEnabled);
    expect(cliffs.map((layer) => layer.id)).toEqual(["front-cliff"]);
    expect(cliffs.map((layer) => layer.cliffDirection)).toEqual(["S"]);
    expect(duplicateAttempt.selectedLayerId).toBe("front-cliff");
  });

  it("preserves real alpha in albedo, auxiliary maps and the outside fill", () => {
    const blank = createBlankRecipe();
    const albedo = renderTilePixels(blank, 0, 32);
    const normal = renderAuxiliaryTilePixels(blank, 0, 32, "normal");
    const albedoAlpha = Array.from({ length: 32 * 32 }, (_, index) => albedo[index * 4 + 3]);
    const normalAlpha = Array.from({ length: 32 * 32 }, (_, index) => normal[index * 4 + 3]);
    expect(albedoAlpha.some((alpha) => alpha === 0)).toBe(true);
    expect(albedoAlpha.some((alpha) => alpha === 255)).toBe(true);
    expect(normalAlpha).toEqual(albedoAlpha);
    expect(renderOutsidePixels(blank, 16).every((value) => value === 0)).toBe(true);
    expect(buildManifest(blank).transparentBackground).toBe(true);
  });

  it("keeps four-way painted junctions as one uninterrupted surface", () => {
    const blank = createBlankRecipe();
    const size = 32;
    const masks = [BIT.E | BIT.S | BIT.SE, BIT.W | BIT.S | BIT.SW, BIT.N | BIT.E | BIT.NE, BIT.N | BIT.W | BIT.NW];
    const samples = [
      pixelAt(renderTilePixels(blank, masks[0], size), size, size - 1, size - 1),
      pixelAt(renderTilePixels(blank, masks[1], size), size, 0, size - 1),
      pixelAt(renderTilePixels(blank, masks[2], size), size, size - 1, 0),
      pixelAt(renderTilePixels(blank, masks[3], size), size, 0, 0),
    ];
    for (const [red, green, blue, alpha] of samples) {
      expect(alpha).toBe(255);
      expect(red).toBeLessThan(180);
      expect(green).toBeGreaterThan(red);
      expect(blue).toBeLessThan(60);
    }
  });

  it("uses canonical convex corner cells to round the hole in the ring preset", () => {
    const blank = createBlankRecipe();
    const grid = createLabGrid("ring", blank.shape.seed, 13);
    expect(grid[3][3]).toBe(true);
    expect(grid[4][4]).toBe(false);
    const mask = maskFromGrid(grid, 3, 3);
    expect(mask).toBe(BIT.N | BIT.W | BIT.NW);
    const pixels = renderTilePixels(blank, mask, 32);
    expect(pixelAt(pixels, 32, 0, 0)[3]).toBe(255);
    expect(pixelAt(pixels, 32, 31, 31)[3]).toBe(0);
  });
});

describe("terrain renderer", () => {
  it.each([0, 8, 16, 32])("keeps the %ipx radius free of false inner-border contours", (radius) => {
    const recipe = createBlankRecipe();
    const size = 64;
    recipe.shape.outerRadius = radius / size;
    recipe.shape.innerRadius = recipe.shape.outerRadius * 0.84;
    const field = buildDistanceField(255, size, recipe.shape);
    const borderWidth = recipe.layers.find((layer) => layer.id === "inner-border")!.width * size;
    for (let y = 0; y < size; y += 8) for (let x = 0; x < size; x += 8) {
      expect(field.distance[y * size + x], `false contour at ${x},${y}`).toBeLessThan(-borderWidth);
    }
  });

  it.each([0, 8, 16, 32])("gives exterior and interior Blob corners the same %ipx geometry", (radius) => {
    const recipe = createBlankRecipe();
    const size = 64;
    recipe.shape.outerRadius = radius / size;
    recipe.shape.innerRadius = recipe.shape.outerRadius;
    const exterior = buildDistanceField(0, size, recipe.shape);
    const interior = buildDistanceField(BIT.N | BIT.W | BIT.NW, size, recipe.shape);
    const reach = Math.max(1, radius);
    for (let y = 0; y < reach; y += 2) for (let x = 0; x < reach; x += 2) {
      const exteriorDistance = exterior.distance[y * size + x];
      const interiorDistance = interior.distance[(size - 1 - y) * size + size - 1 - x];
      expect(interiorDistance, `corner mismatch at ${x},${y}`).toBeCloseTo(exteriorDistance, 5);
    }
  });

  it("limits a 16px fillet to the corner instead of turning a 32px quadrant into a detached disc", () => {
    const recipe = createBlankRecipe();
    const size = 64;
    recipe.shape.outerRadius = 16 / size;
    recipe.shape.innerRadius = recipe.shape.outerRadius;
    const island = buildDistanceField(0, size, recipe.shape);
    expect(island.distance[0], "the outermost corner stays outside the rounded silhouette").toBeGreaterThan(0);
    expect(island.distance[31 * size + 31], "pixels beyond the 16px fillet stay inside the full Blob cell").toBeLessThan(0);
  });

  it.each([0, 32])("never lets a 16px inner border change the Blob silhouette at %ipx rounding", (radius) => {
    const recipe = createBlankRecipe();
    recipe.shape.outerRadius = radius / 64;
    recipe.shape.innerRadius = recipe.shape.outerRadius;
    recipe.layers.find((layer) => layer.id === "inner-border")!.width = 16 / 64;
    const surfaceOnly = structuredClone(recipe);
    surfaceOnly.layers.find((layer) => layer.id === "inner-border")!.enabled = false;
    for (const mask of getBlobMasks()) {
      const withBorder = renderTilePixels(recipe, mask, 32);
      const withoutBorder = renderTilePixels(surfaceOnly, mask, 32);
      for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
        expect(withBorder[pixel * 4 + 3], `mask ${mask}, pixel ${pixel}`).toBe(withoutBorder[pixel * 4 + 3]);
      }
    }
  });

  it("builds one continuous inner-border junction around a rectangular Blob hole", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outerRadius = 0.5;
    recipe.shape.innerRadius = 0.5;
    recipe.layers.find((layer) => layer.id === "inner-border")!.width = 0.25;
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => true));
    for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) grid[y][x] = false;
    const cells: Array<{ x: number; y: number; mask: number }> = [];
    for (let y = 0; y < grid.length; y += 1) for (let x = 0; x < grid.length; x += 1) {
      if (grid[y][x]) cells.push({ x, y, mask: maskFromGrid(grid, x, y) });
    }
    const size = 32;
    const rendered = renderProjectedMapPixels(recipe, cells, grid.length, grid.length, size);
    const rgbaAt = (x: number, y: number): [number, number, number, number] => {
      const index = ((rendered.footprint.originY + y) * rendered.width + rendered.footprint.originX + x) * 4;
      return [rendered.pixels[index], rendered.pixels[index + 1], rendered.pixels[index + 2], rendered.pixels[index + 3]];
    };
    const corner = size * 2;
    const join = rgbaAt(corner - 3, corner - 3);
    const horizontal = rgbaAt(corner + 3, corner - 3);
    const vertical = rgbaAt(corner - 3, corner + 3);
    expect(join[3], "the diagonal owner tile must remain opaque at the join").toBeGreaterThan(128);
    expect(join.slice(0, 3), "the join must use the same border material as the horizontal run").toEqual(horizontal.slice(0, 3));
    expect(join.slice(0, 3), "the join must use the same border material as the vertical run").toEqual(vertical.slice(0, 3));
  });

  it("keeps the canonical concave owner intact and gives its border a square joining distance", () => {
    const recipe = createBlankRecipe();
    const size = 64;
    recipe.shape.outerRadius = 0.5;
    recipe.shape.innerRadius = 0.5;
    // The centre tile owns the north-west quadrant of a vertex whose
    // south-east neighbour is missing: this is the actual concave junction
    // visible around a rectangular Blob hole.
    const field = buildDistanceField(255 & ~BIT.SE, size, recipe.shape);
    const sample = (values: Float32Array, x: number, y: number) => values[y * size + x];
    expect(sample(field.distance, 60, 60), "rounding must not punch a hole into the diagonal owner tile").toBeLessThan(0);
    expect(sample(field.distance, 48, 48), "the owner tile must stay connected behind the join").toBeLessThan(0);
    expect(sample(field.bandDistance, 60, 60), "the join must start at the missing diagonal").toBeLessThan(0);
    expect(Math.abs(sample(field.bandDistance, 60, 60) - sample(field.bandDistance, 60, 63)), "the joining distance must meet the straight run without a gap").toBeLessThan(0.001);
  });

  it.each([0.125, 0.25, 0.5])("keeps clean horizontal and vertical runs exactly straight at %f radius", (outerRadius) => {
    const recipe = createBlankRecipe();
    const size = 64;
    recipe.shape.outerRadius = outerRadius;
    recipe.shape.innerRadius = outerRadius;
    const horizontal = buildDistanceField(BIT.E | BIT.W, size, recipe.shape);
    const vertical = buildDistanceField(BIT.N | BIT.S, size, recipe.shape);
    for (let y = 0; y < size; y += 1) {
      const horizontalRow = Array.from({ length: size }, (_, x) => horizontal.distance[y * size + x]);
      expect(Math.max(...horizontalRow) - Math.min(...horizontalRow), `horizontal row ${y}`).toBeLessThan(0.0001);
    }
    for (let x = 0; x < size; x += 1) {
      const verticalColumn = Array.from({ length: size }, (_, y) => vertical.distance[y * size + x]);
      expect(Math.max(...verticalColumn) - Math.min(...verticalColumn), `vertical column ${x}`).toBeLessThan(0.0001);
    }
  });

  it("ignores legacy stroke thickness in straight Blob rendering", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "straight";
    recipe.shape.roughness = 0;
    recipe.shape.outerRadius = 0.25;
    recipe.shape.innerRadius = 0.25;
    const fullCellShape = { ...recipe.shape, thickness: 1 };
    const legacyShape = { ...recipe.shape, thickness: 0.62 };
    const mask = BIT.E | BIT.S | BIT.SE;
    expect(Array.from(buildDistanceField(mask, 64, legacyShape).distance)).toEqual(Array.from(buildDistanceField(mask, 64, fullCellShape).distance));
  });

  it("applies one periodic sine deformation across compatible tile seams", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "wave";
    recipe.shape.roughness = 0.55;
    recipe.shape.frequency = 3;
    recipe.shape.deformationPhase = 0.23;
    const size = 64;
    const left = buildDistanceField(BIT.E, size, recipe.shape);
    const right = buildDistanceField(BIT.W, size, recipe.shape);
    const edgeDifference = Array.from({ length: size }, (_, y) => Math.abs(left.distance[y * size + size - 1] - right.distance[y * size]));
    expect(Math.max(...edgeDifference)).toBeLessThan(0.0001);
    const run = buildDistanceField(BIT.E | BIT.W, size, recipe.shape);
    const middleRow = Array.from({ length: size }, (_, x) => run.distance[Math.floor(size / 2) * size + x]);
    expect(Math.max(...middleRow) - Math.min(...middleRow)).toBeGreaterThan(2);
  });

  it("keeps projected cliffs attached to the deformed terrain contour", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "wave";
    recipe.shape.roughness = 0.7;
    recipe.shape.frequency = 4;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    const size = 48;
    const base = renderTilePixels(recipe, 0, size);
    const projected = renderProjectedTilePixels(recipe, 0, size);
    let checked = 0;
    for (let x = 0; x < size; x += 1) {
      let edgeY = -1;
      for (let y = 0; y < size; y += 1) if (base[(y * size + x) * 4 + 3] > 8) edgeY = y;
      if (edgeY < 0 || edgeY >= size - 1) continue;
      const alpha = projected.pixels[((projected.footprint.originY + edgeY + 1) * projected.footprint.width + projected.footprint.originX + x) * 4 + 3];
      expect(alpha, `detached cliff below column ${x}`).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(8);
  });

  it("keeps cast shadows disabled by default and renders them non-destructively when enabled", () => {
    const baseRecipe = createBlankRecipe();
    baseRecipe.shape.transparentBackground = false;
    expect(baseRecipe.layers.every((layer) => layer.shadowEnabled === false)).toBe(true);
    const shadowed = structuredClone(baseRecipe);
    const surface = shadowed.layers.find((layer) => layer.id === "surface")!;
    surface.shadowEnabled = true;
    surface.shadowOpacity = 0.75;
    surface.shadowDistance = 0.12;
    surface.shadowBlur = 0.03;
    surface.shadowAngle = 90;
    const plainPixels = renderTilePixels(baseRecipe, 0, 64);
    const shadowPixels = renderTilePixels(shadowed, 0, 64);
    const albedoDifference = shadowPixels.reduce((sum, value, index) => sum + Math.abs(value - plainPixels[index]), 0);
    expect(albedoDifference).toBeGreaterThan(1000);
    const plainAo = renderAuxiliaryTilePixels(baseRecipe, 0, 64, "ao");
    const shadowAo = renderAuxiliaryTilePixels(shadowed, 0, 64, "ao");
    const aoDifference = shadowAo.reduce((sum, value, index) => sum + Math.abs(value - plainAo[index]), 0);
    expect(aoDifference).toBeGreaterThan(500);
    const seamReport = analyzeSeams(shadowed, new Map(), 24);
    expect(seamReport.grade).toBe("healthy");
    expect(seamReport.maximum).toBeLessThan(8);
  });

  it("keeps a flat material external shadow visible in the composed map", () => {
    const shadowed = createBlankRecipe();
    shadowed.shape.transparentBackground = true;
    const border = shadowed.layers.find((layer) => layer.id === "inner-border")!;
    border.shadowEnabled = true;
    border.shadowOpacity = 1;
    border.shadowDistance = 0.5;
    border.shadowBlur = 0.1;
    border.shadowColor = "#ff0000";
    const disabled = structuredClone(shadowed);
    disabled.layers.find((layer) => layer.id === "inner-border")!.shadowOpacity = 0.000001;
    const alternate = structuredClone(shadowed);
    alternate.layers.find((layer) => layer.id === "inner-border")!.shadowColor = "#000000";
    const cells = [{ x: 0, y: 0, mask: 0 }];
    const shadowMap = renderProjectedMapPixels(shadowed, cells, 1, 1, 64);
    const disabledMap = renderProjectedMapPixels(disabled, cells, 1, 1, 64);
    const alternateMap = renderProjectedMapPixels(alternate, cells, 1, 1, 64);
    expect(shadowMap.width).toBe(alternateMap.width);
    const enabledDifference = shadowMap.pixels.reduce((sum, value, index) => sum + Math.abs(value - disabledMap.pixels[index]), 0);
    expect(enabledDifference).toBeGreaterThan(5000);
    const difference = shadowMap.pixels.reduce((sum, value, index) => sum + Math.abs(value - alternateMap.pixels[index]), 0);
    expect(difference).toBeGreaterThan(5000);
  });

  it("keeps the Wild Coast sand shadow visible across the ring laboratory map", () => {
    const red = structuredClone(DEFAULT_RECIPE);
    red.shape.transparentBackground = true;
    for (const layer of red.layers) if (layer.cliffEnabled) layer.enabled = false;
    const sand = red.layers.find((layer) => layer.id === "sand")!;
    sand.shadowEnabled = true;
    sand.shadowOpacity = 1;
    sand.shadowDistance = 0.5;
    sand.shadowBlur = 0.1;
    sand.shadowColor = "#ff0000";
    const black = structuredClone(red);
    black.layers.find((layer) => layer.id === "sand")!.shadowColor = "#000000";
    const grid = createLabGrid("ring", red.shape.seed, 13);
    const cells: Array<{ x: number; y: number; mask: number }> = [];
    for (let y = 0; y < grid.length; y += 1) for (let x = 0; x < grid.length; x += 1) if (grid[y][x]) cells.push({ x, y, mask: maskFromGrid(grid, x, y) });
    const redMap = renderProjectedMapPixels(red, cells, grid.length, grid.length, 64);
    const blackMap = renderProjectedMapPixels(black, cells, grid.length, grid.length, 64);
    const difference = redMap.pixels.reduce((sum, value, index) => sum + Math.abs(value - blackMap.pixels[index]), 0);
    expect(difference).toBeGreaterThan(100000);
  });

  it("renders a deformed cliff shadow as one bounded silhouette without overdraw", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "organic";
    recipe.shape.roughness = 0.9;
    recipe.shape.frequency = 7;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.shadowEnabled = true;
    cliff.shadowOpacity = 0.35;
    cliff.shadowDistance = 0.25;
    cliff.shadowAngle = 0;
    cliff.shadowBlur = 0.05;
    const rendered = renderProjectedTilePixels(recipe, 0, 64);
    expect(rendered.footprint.margins.right).toBeGreaterThan(0);
    let shadowPixels = 0;
    let maximumAlpha = 0;
    for (let y = 0; y < rendered.footprint.height; y += 1) {
      for (let x = rendered.footprint.originX + 64; x < rendered.footprint.width; x += 1) {
        const alpha = rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3];
        if (alpha <= 0) continue;
        shadowPixels += 1;
        maximumAlpha = Math.max(maximumAlpha, alpha);
      }
    }
    expect(shadowPixels).toBeGreaterThan(20);
    expect(maximumAlpha).toBeLessThanOrEqual(Math.ceil(cliff.shadowOpacity * 255) + 2);
  });

  it("keeps a clearly opaque shadow below the foot of a downward cliff", () => {
    const recipe = createBlankRecipe();
    recipe.shape.transparentBackground = true;
    recipe.shape.deformationMode = "straight";
    recipe.shape.roughness = 0;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.shadowEnabled = true;
    cliff.shadowColor = "#000000";
    cliff.shadowOpacity = 0.85;
    cliff.shadowDistance = 0.3;
    cliff.shadowAngle = 90;
    cliff.shadowBlur = 0.1;
    const size = 64;
    const rendered = renderProjectedTilePixels(recipe, 0, size);
    const guaranteedBelowWall = rendered.footprint.originY + size * 2;
    const alphas: number[] = [];
    for (let y = guaranteedBelowWall; y < rendered.footprint.height; y += 1) {
      for (let x = 0; x < rendered.footprint.width; x += 1) alphas.push(rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3]);
    }
    expect(alphas.filter((alpha) => alpha >= 100).length).toBeGreaterThan(20);
    expect(Math.max(...alphas)).toBeGreaterThanOrEqual(170);
  });

  it("composites the chosen cliff-shadow color into the map preview", () => {
    const recipe = createBlankRecipe();
    recipe.shape.transparentBackground = true;
    recipe.shape.deformationMode = "straight";
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.shadowEnabled = true;
    cliff.shadowColor = "#ff0000";
    cliff.shadowOpacity = 0.85;
    cliff.shadowDistance = 0.3;
    cliff.shadowAngle = 90;
    cliff.shadowBlur = 0.1;
    const rendered = renderProjectedMapPixels(recipe, [{ x: 0, y: 0, mask: 0 }], 1, 1, 64);
    const terrain = renderTilePixels(recipe, 0, 64);
    let redShadowPixels = 0;
    for (let index = 0; index < rendered.pixels.length; index += 4) {
      if (rendered.pixels[index] > 140 && rendered.pixels[index] > rendered.pixels[index + 1] * 2) redShadowPixels += 1;
    }
    expect(redShadowPixels).toBeGreaterThan(100);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
      const terrainIndex = (y * 64 + x) * 4;
      if (terrain[terrainIndex + 3] < 220) continue;
      const mapIndex = ((rendered.footprint.originY + y) * rendered.width + rendered.footprint.originX + x) * 4;
      expect(rendered.pixels[mapIndex]).toBeLessThanOrEqual(rendered.pixels[mapIndex + 1] * 2);
    }
  });

  it("expands transparent exports for large flat-material shadows", () => {
    const recipe = createBlankRecipe();
    recipe.shape.transparentBackground = true;
    const surface = recipe.layers.find((layer) => layer.id === "surface")!;
    surface.shadowEnabled = true;
    surface.shadowOpacity = 0.8;
    surface.shadowDistance = 1.5;
    surface.shadowAngle = 0;
    surface.shadowBlur = 0.5;
    const rendered = renderProjectedTilePixels(recipe, 0, 32);
    expect(rendered.footprint.margins.right).toBeGreaterThanOrEqual(64);
    expect(rendered.footprint.margins.left).toBe(0);
    let externalShadowPixels = 0;
    for (let y = 0; y < rendered.footprint.height; y += 1) {
      for (let x = rendered.footprint.originX + 32; x < rendered.footprint.width; x += 1) {
        if (rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3] > 0) externalShadowPixels += 1;
      }
    }
    expect(externalShadowPixels).toBeGreaterThan(100);
  });

  it("renders maximum-size cliff shadows inside automatically enlarged margins", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.shadowEnabled = true;
    cliff.shadowOpacity = 0.6;
    cliff.shadowDistance = MAX_SHADOW_DISTANCE;
    cliff.shadowAngle = 0;
    cliff.shadowBlur = MAX_SHADOW_BLUR;
    const rendered = renderProjectedTilePixels(recipe, 0, 24);
    expect(rendered.footprint.margins.right).toBeGreaterThanOrEqual(72);
    expect(rendered.footprint.width).toBeGreaterThanOrEqual(96);
    expect(rendered.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it("blurs adjacent cliff shadows as one continuous map-sized silhouette", () => {
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.transparentBackground = true;
    recipe.shape.deformationMode = "straight";
    recipe.shape.roughness = 0;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.shadowEnabled = true;
    cliff.shadowOpacity = 0.6;
    cliff.shadowDistance = 0.5;
    cliff.shadowAngle = 90;
    cliff.shadowBlur = 0.5;
    const size = 32;
    const rendered = renderProjectedMapPixels(recipe, [
      { x: 0, y: 0, mask: BIT.E },
      { x: 1, y: 0, mask: BIT.W },
    ], 2, 1, size);
    const seamX = rendered.footprint.originX + size;
    let sampleY = rendered.footprint.originY + size;
    let strongestSeamAlpha = 0;
    for (let y = sampleY; y < rendered.height; y += 1) {
      const alpha = rendered.pixels[(y * rendered.width + seamX) * 4 + 3];
      if (alpha > strongestSeamAlpha) { strongestSeamAlpha = alpha; sampleY = y; }
    }
    const seamAlpha = Array.from({ length: 9 }, (_, offset) => rendered.pixels[(sampleY * rendered.width + seamX - 4 + offset) * 4 + 3]);
    expect(Math.max(...seamAlpha)).toBeGreaterThan(0);
    expect(Math.max(...seamAlpha) - Math.min(...seamAlpha)).toBeLessThanOrEqual(2);
    const lastRowAlpha = Array.from({ length: rendered.width }, (_, x) => rendered.pixels[((rendered.height - 1) * rendered.width + x) * 4 + 3]);
    expect(Math.max(...lastRowAlpha)).toBe(0);
  });

  it("uses only the shared contour when a global sine or organic deformation is active", () => {
    for (const deformationMode of ["wave", "organic"] as const) {
      const profiled = createBlankRecipe();
      profiled.shape.deformationMode = deformationMode;
      profiled.shape.roughness = 0.8;
      profiled.shape.frequency = 6;
      const border = profiled.layers.find((layer) => layer.id === "inner-border")!;
      border.innerContour = { mode: "organic", amplitude: 0.45, frequency: 11, phase: 0.17 };
      border.outerContour = { mode: "wave", amplitude: 0.45, frequency: 12, phase: 0.73 };
      const sharedOnly = structuredClone(profiled);
      const cleanBorder = sharedOnly.layers.find((layer) => layer.id === "inner-border")!;
      cleanBorder.innerContour = { mode: "straight", amplitude: 0, frequency: 1, phase: 0 };
      cleanBorder.outerContour = { mode: "straight", amplitude: 0, frequency: 1, phase: 0 };
      expect(renderTilePixels(profiled, 0, 64), deformationMode).toEqual(renderTilePixels(sharedOnly, 0, 64));
      const report = analyzeSeams(profiled, new Map(), 24);
      expect(report.maximum, deformationMode).toBeLessThan(8);
    }
  });

  it("fades an inner-border material across its full authored width", () => {
    const solid = createBlankRecipe();
    const faded = structuredClone(solid);
    faded.layers.find((layer) => layer.id === "inner-border")!.fadeInward = 1;
    const solidPixels = renderTilePixels(solid, 0, 64);
    const fadedPixels = renderTilePixels(faded, 0, 64);
    const difference = fadedPixels.reduce((sum, value, index) => sum + Math.abs(value - solidPixels[index]), 0);
    expect(difference).toBeGreaterThan(5000);
  });

  it("approaches a full-tile Dual projection continuously before 100%", () => {
    const almostFull = createBlankRecipe();
    almostFull.topology = "dual16";
    almostFull.shape.transparentBackground = false;
    const full = structuredClone(almostFull);
    almostFull.layers.find((layer) => layer.id === "inner-border")!.width = 0.99;
    full.layers.find((layer) => layer.id === "inner-border")!.width = 1;
    almostFull.shape.transparentBackground = true;
    full.shape.transparentBackground = true;
    const before = renderProjectedTilePixels(almostFull, 3, 64);
    const endpoint = renderProjectedTilePixels(full, 3, 64);
    expect(before.footprint.margins.top).toBeGreaterThanOrEqual(31);
    expect(endpoint.footprint.margins.top).toBeGreaterThanOrEqual(33);
    expect(endpoint.footprint.margins.top - before.footprint.margins.top).toBeLessThanOrEqual(3);
  });

  it("keeps inward fade visible on a 100% Dual Grid border", () => {
    const solid = createBlankRecipe();
    solid.topology = "dual16";
    solid.shape.transparentBackground = false;
    const border = solid.layers.find((layer) => layer.id === "inner-border")!;
    border.width = 1;
    border.fadeInward = 0;
    const faded = structuredClone(solid);
    faded.layers.find((layer) => layer.id === "inner-border")!.fadeInward = 1;
    const solidPixels = renderTilePixels(solid, 3, 64);
    const fadedPixels = renderTilePixels(faded, 3, 64);
    const difference = fadedPixels.reduce((sum, value, index) => sum + Math.abs(value - solidPixels[index]), 0);
    expect(difference).toBeGreaterThan(5000);
  });

  it("covers the complete Blob interior and projects a complete Dual tile at 100% width", () => {
    for (const topology of ["blob47", "dual16"] as const) {
      const recipe = createBlankRecipe();
      recipe.topology = topology;
      recipe.shape.transparentBackground = false;
      const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
      border.width = 1;
      border.fadeInward = 0;
      border.color = "#f2c14e";
      border.accent = "#f2c14e";
      border.roughness = 0;
      const size = 64;
      if (topology === "blob47") {
        const pixels = renderTilePixels(recipe, 255, size);
        expect(pixelAt(pixels, size, size / 2, size / 2), topology).toEqual([242, 193, 78, 255]);
      } else {
        recipe.shape.transparentBackground = true;
        const projected = renderProjectedTilePixels(recipe, 3, size);
        expect(projected.footprint.margins.top).toBeGreaterThanOrEqual(size / 2);
        const topMargin = Array.from({ length: projected.footprint.originY * projected.footprint.width }, (_, pixel) => projected.pixels[pixel * 4 + 3]);
        expect(Math.max(...topMargin)).toBeGreaterThan(0);
        expect(Math.max(...Array.from({ length: projected.footprint.width }, (_, x) => projected.pixels[x * 4 + 3]))).toBe(0);
      }
    }
  });

  it("replaces Blob terrain pixels and exports Dual continuation pixels at 100%", () => {
    const texture = { width: 1, height: 1, data: new Uint8ClampedArray([241, 37, 83, 255]) };
    for (const topology of ["blob47", "dual16"] as const) {
      const masks = topology === "blob47" ? getBlobMasks() : getDualMasks().filter((mask) => mask !== 0);
      for (const mask of masks) {
        const recipe = createBlankRecipe();
        recipe.topology = topology;
        recipe.shape.transparentBackground = true;
        const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
        border.width = 1;
        border.fadeInward = 0;
        border.opacity = 1;
        border.relief = 0;
        border.reliefStrength = 0;
        border.sides = { N: true, E: true, S: true, W: true };
        const surfaceOnly = structuredClone(recipe);
        surfaceOnly.layers.find((layer) => layer.id === "inner-border")!.enabled = false;
        const size = 32;
        const terrainMask = renderTilePixels(surfaceOnly, mask, size);
        if (topology === "blob47") {
          const replaced = renderTilePixels(recipe, mask, size, new Map([[border.id, texture]]));
          for (let pixel = 0; pixel < size * size; pixel += 1) {
            if (terrainMask[pixel * 4 + 3] === 0) continue;
            expect(Array.from(replaced.slice(pixel * 4, pixel * 4 + 3)), `${topology} mask ${mask} pixel ${pixel}`).toEqual([241, 37, 83]);
          }
        } else if (mask !== 15) {
          const projected = renderProjectedTilePixels(recipe, mask, size, new Map([[border.id, texture]]));
          let matching = 0;
          for (let pixel = 0; pixel < projected.pixels.length; pixel += 4) {
            if (projected.pixels[pixel] === 241 && projected.pixels[pixel + 1] === 37 && projected.pixels[pixel + 2] === 83) matching += 1;
          }
          expect(matching, `dual16 mask ${mask}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("applies inward fade independently across two overlapping inner borders", () => {
    const base = appendInnerBorder(createBlankRecipe(), "Inner border", "below previous", "inner-border-2");
    base.shape.transparentBackground = false;
    const first = base.layers.find((layer) => layer.id === "inner-border")!;
    const second = base.layers.find((layer) => layer.id === "inner-border-2")!;
    first.width = 0.42;
    first.color = "#ef476f";
    first.accent = "#ef476f";
    first.roughness = 0;
    second.width = 0.82;
    second.color = "#118ab2";
    second.accent = "#118ab2";
    second.roughness = 0;

    const solid = renderTilePixels(base, 0, 64);
    const firstFadedRecipe = structuredClone(base);
    firstFadedRecipe.layers.find((layer) => layer.id === "inner-border")!.fadeInward = 1;
    const secondFadedRecipe = structuredClone(base);
    secondFadedRecipe.layers.find((layer) => layer.id === "inner-border-2")!.fadeInward = 1;
    const firstFaded = renderTilePixels(firstFadedRecipe, 0, 64);
    const secondFaded = renderTilePixels(secondFadedRecipe, 0, 64);
    const firstDifference = firstFaded.reduce((sum, value, index) => sum + Math.abs(value - solid[index]), 0);
    const secondDifference = secondFaded.reduce((sum, value, index) => sum + Math.abs(value - solid[index]), 0);
    expect(firstDifference).toBeGreaterThan(5000);
    expect(secondDifference).toBeGreaterThan(5000);
  });

  it("keeps both faded inner borders visible in Dual Grid contour states", () => {
    const recipe = appendInnerBorder(createBlankRecipe(), "Inner border", "below previous", "inner-border-2");
    recipe.topology = "dual16";
    recipe.shape.transparentBackground = false;
    const first = recipe.layers.find((layer) => layer.id === "inner-border")!;
    const second = recipe.layers.find((layer) => layer.id === "inner-border-2")!;
    first.width = 0.5;
    first.fadeInward = 1;
    first.color = first.accent = "#f2c14e";
    second.width = 0.5;
    second.fadeInward = 1;
    second.color = second.accent = "#b86f3c";
    const withoutSecond = structuredClone(recipe);
    withoutSecond.layers.find((layer) => layer.id === "inner-border-2")!.enabled = false;
    const withoutFirst = structuredClone(recipe);
    withoutFirst.layers.find((layer) => layer.id === "inner-border")!.enabled = false;
    let firstContribution = 0;
    let secondContribution = 0;
    for (const mask of getDualMasks().filter((mask) => mask !== 0 && mask !== 15)) {
      const both = renderTilePixels(recipe, mask, 64);
      const noFirst = renderTilePixels(withoutFirst, mask, 64);
      const noSecond = renderTilePixels(withoutSecond, mask, 64);
      firstContribution += both.reduce((sum, value, index) => sum + Math.abs(value - noFirst[index]), 0);
      secondContribution += both.reduce((sum, value, index) => sum + Math.abs(value - noSecond[index]), 0);
    }
    expect(firstContribution).toBeGreaterThan(5000);
    expect(secondContribution).toBeGreaterThan(5000);
  });

  it("keeps inward fade visible on a 100% Blob border", () => {
    const solid = createBlankRecipe();
    solid.shape.transparentBackground = false;
    const border = solid.layers.find((layer) => layer.id === "inner-border")!;
    border.width = 1;
    border.fadeInward = 0;
    const faded = structuredClone(solid);
    faded.layers.find((layer) => layer.id === "inner-border")!.fadeInward = 1;
    const solidPixels = renderTilePixels(solid, 0, 64);
    const fadedPixels = renderTilePixels(faded, 0, 64);
    const difference = fadedPixels.reduce((sum, value, index) => sum + Math.abs(value - solidPixels[index]), 0);
    expect(difference).toBeGreaterThan(5000);
  });

  it("keeps 100% borders seam-safe with and without inward fade", () => {
    for (const topology of ["blob47", "dual16"] as const) {
      for (const fadeInward of [0, 1]) {
        const recipe = createBlankRecipe();
        recipe.topology = topology;
        const border = recipe.layers.find((layer) => layer.id === "inner-border")!;
        border.width = 1;
        border.fadeInward = fadeInward;
        const report = analyzeSeams(recipe, new Map(), 24);
        expect(report.maximum, `${topology} fade ${fadeInward}: ${JSON.stringify(report.worst)}`).toBeLessThan(8);
        expect(report.grade, `${topology} fade ${fadeInward}`).toBe("healthy");
      }
    }
  });

  it("fills fully surrounded Blob tiles uniformly at 100% without deformation islands", () => {
    for (const deformationMode of ["wave", "organic"] as const) {
      const bordered = createBlankRecipe();
      bordered.shape.transparentBackground = false;
      bordered.shape.deformationMode = deformationMode;
      bordered.shape.roughness = 1;
      bordered.shape.frequency = 7;
      const border = bordered.layers.find((layer) => layer.id === "inner-border")!;
      border.width = 1;
      border.fadeInward = 0;
      const stableFull = structuredClone(bordered);
      stableFull.shape.deformationMode = "straight";
      stableFull.shape.roughness = 0;
      const surfaceOnly = structuredClone(bordered);
      surfaceOnly.layers.find((layer) => layer.id === "inner-border")!.enabled = false;
      const withBorder = renderTilePixels(bordered, 255, 64);
      const stableBorder = renderTilePixels(stableFull, 255, 64);
      const withoutBorder = renderTilePixels(surfaceOnly, 255, 64);
      const deformationDifference = withBorder.reduce((sum, value, index) => sum + Math.abs(value - stableBorder[index]), 0);
      const materialDifference = withBorder.reduce((sum, value, index) => sum + Math.abs(value - withoutBorder[index]), 0);
      const field = buildDistanceField(255, 64, bordered.shape);
      const distances = Array.from(field.distance);
      expect(deformationDifference, `${deformationMode} distance ${Math.min(...distances)}..${Math.max(...distances)}`).toBeLessThan(500);
      expect(materialDifference, deformationMode).toBeGreaterThan(5000);
      const report = analyzeSeams(bordered, new Map(), 24);
      expect(report.maximum, deformationMode).toBeLessThan(8);
    }
  });

  it("maps uploaded textures at the selected tile-relative scale", () => {
    const oneToOne = createBlankRecipe();
    oneToOne.layers.forEach((layer) => { layer.enabled = layer.id === "surface"; });
    const oneEighth = structuredClone(oneToOne);
    oneEighth.layers.find((layer) => layer.id === "surface")!.scale = 0.125;
    const checker = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 255, 255,
        0, 0, 255, 255, 255, 0, 0, 255,
      ]),
    };
    const textures = new Map([["surface", checker]]);
    const normalScale = renderTilePixels(oneToOne, 255, 64, textures);
    const tiledScale = renderTilePixels(oneEighth, 255, 64, textures);
    const difference = tiledScale.reduce((sum, value, index) => sum + Math.abs(value - normalScale[index]), 0);
    expect(difference).toBeGreaterThan(100000);
  });

  it("samples every column of an imported square texture without wrapping or directional warping", () => {
    const recipe = createBlankRecipe();
    recipe.shape.transparentBackground = false;
    recipe.layers.forEach((layer) => { layer.enabled = layer.id === "surface" || layer.kind === "outside"; });
    const texture = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(Array.from({ length: 16 }, (_, index) => {
        const red = [10, 60, 120, 240][index % 4];
        return [red, 30, 20, 255];
      }).flat()),
    };
    const pixels = renderTilePixels(recipe, 255, 4, new Map([["surface", texture]]));
    const first = pixelAt(pixels, 4, 0, 2);
    const last = pixelAt(pixels, 4, 3, 2);
    expect(last[0] - first[0]).toBeGreaterThan(150);
  });

  it("preserves imported texture colors independently from the procedural Color setting", () => {
    const firstRecipe = createBlankRecipe();
    firstRecipe.shape.transparentBackground = false;
    firstRecipe.layers.forEach((layer) => { layer.enabled = layer.id === "surface" || layer.kind === "outside"; });
    const secondRecipe = structuredClone(firstRecipe);
    const firstSurface = firstRecipe.layers.find((layer) => layer.id === "surface")!;
    const secondSurface = secondRecipe.layers.find((layer) => layer.id === "surface")!;
    firstSurface.color = "#ff0000"; firstSurface.accent = "#ff0000";
    secondSurface.color = "#0000ff"; secondSurface.accent = "#0000ff";
    const texture = { width: 1, height: 1, data: new Uint8ClampedArray([37, 149, 211, 255]) };
    const textures = new Map([["surface", texture]]);
    expect(renderTilePixels(firstRecipe, 255, 16, textures)).toEqual(renderTilePixels(secondRecipe, 255, 16, textures));
  });

  it("adjusts imported texture brightness per material without changing alpha", () => {
    const neutral = createBlankRecipe();
    neutral.shape.transparentBackground = false;
    neutral.layers.forEach((layer) => { layer.enabled = layer.id === "surface" || layer.kind === "outside"; });
    const dark = structuredClone(neutral);
    const light = structuredClone(neutral);
    dark.layers.find((layer) => layer.id === "surface")!.brightness = -0.5;
    light.layers.find((layer) => layer.id === "surface")!.brightness = 0.5;
    const texture = { width: 1, height: 1, data: new Uint8ClampedArray([40, 120, 200, 255]) };
    const textures = new Map([["surface", texture]]);
    const neutralPixel = pixelAt(renderTilePixels(neutral, 255, 16, textures), 16, 8, 8);
    const darkPixel = pixelAt(renderTilePixels(dark, 255, 16, textures), 16, 8, 8);
    const lightPixel = pixelAt(renderTilePixels(light, 255, 16, textures), 16, 8, 8);

    expect(darkPixel.slice(0, 3).every((channel, index) => channel < neutralPixel[index])).toBe(true);
    expect(lightPixel.slice(0, 3).every((channel, index) => channel > neutralPixel[index])).toBe(true);
    expect([darkPixel[3], neutralPixel[3], lightPixel[3]]).toEqual([255, 255, 255]);
  });

  it("defaults cliffs to a straight three-tile south-facing wall", () => {
    const cliff = DEFAULT_RECIPE.layers.find((layer) => layer.id === "cliff")!;
    expect(cliff).toMatchObject({
      cliffEnabled: true,
      cliffDirection: "S",
      cliffHeightSteps: 3,
      cliffOffsetX: 0,
      cliffOffsetY: 0,
      cliffShear: 0,
      taper: 0,
      feather: 0,
      innerFade: 0,
      outerFade: 0,
      cutoff: 0,
      sides: { N: false, E: false, S: true, W: false },
      innerContour: { mode: "straight", amplitude: 0 },
      outerContour: { mode: "straight", amplitude: 0 },
    });
    expect(projectionFootprint(DEFAULT_RECIPE, 32)).toMatchObject({ width: 32, height: 128, originX: 0, originY: 0 });
    const rendered = renderProjectedTilePixels(DEFAULT_RECIPE, 0, 32);
    const bottomByColumn: number[] = [];
    for (let x = 0; x < rendered.footprint.width; x += 1) {
      let bottom = -1;
      for (let y = rendered.footprint.originY + 32; y < rendered.footprint.height; y += 1) {
        if (rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3] > 0) bottom = y;
      }
      if (bottom >= 0) bottomByColumn.push(bottom);
    }
    expect(bottomByColumn.length).toBeGreaterThan(8);
    expect(Math.max(...bottomByColumn) - Math.min(...bottomByColumn)).toBeLessThan(16);
  });

  it("uses a deep front face, compressed sides and a thin rear lip", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffDirectional = true;
    cliff.cliffDirection = "S";
    cliff.cliffHeightSteps = 1;
    cliff.cliffSideDepth = 0.34;
    cliff.cliffRearDepth = 0.08;

    expect(cliffDepthForEdge(cliff, "S", 100)).toBe(100);
    expect(cliffDepthForEdge(cliff, "E", 100)).toBe(34);
    expect(cliffDepthForEdge(cliff, "W", 100)).toBe(34);
    expect(cliffDepthForEdge(cliff, "N", 100)).toBe(8);
    const diagonalDepth = cliffDepthForNormal(cliff, Math.SQRT1_2, Math.SQRT1_2, 100);
    expect(diagonalDepth).toBeGreaterThan(34);
    expect(diagonalDepth).toBeLessThan(100);
  });

  it("rotates the authored front, side and rear cliff profile", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffDirectional = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffSideDepth = 0.34;
    cliff.cliffRearDepth = 0.08;
    const opposite = { N: "S", E: "W", S: "N", W: "E" } as const;
    const sides = { N: ["E", "W"], E: ["N", "S"], S: ["E", "W"], W: ["N", "S"] } as const;

    for (const direction of ["N", "E", "S", "W"] as const) {
      cliff.cliffDirection = direction;
      expect(cliffDepthForEdge(cliff, direction, 100)).toBe(100);
      expect(cliffDepthForEdge(cliff, opposite[direction], 100)).toBe(8);
      for (const side of sides[direction]) expect(cliffDepthForEdge(cliff, side, 100)).toBe(34);
    }
  });

  it("assigns front, side and rear materials from the local contour direction", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffDirection = "S";
    expect(cliffTextureWeightsForNormal(cliff, 0, 1)).toEqual({ front: 1, side: 0, rear: 0 });
    expect(cliffTextureWeightsForNormal(cliff, 1, 0)).toEqual({ front: 0, side: 1, rear: 0 });
    expect(cliffTextureWeightsForNormal(cliff, 0, -1)).toEqual({ front: 0, side: 0, rear: 1 });
    const corner = cliffTextureWeightsForNormal(cliff, Math.SQRT1_2, Math.SQRT1_2);
    expect(corner.front).toBeGreaterThan(0);
    expect(corner.side).toBeGreaterThan(0);
    expect(corner.front + corner.side + corner.rear).toBeCloseTo(1, 10);
  });

  it("samples optional directional cliff sources without replacing the main texture", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffDirection = "S";
    cliff.cliffRearDepth = 0.25;
    cliff.cliffPatternSizePx = 1;
    const solid = (red: number, green: number, blue: number) => ({ width: 1, height: 1, data: new Uint8ClampedArray([red, green, blue, 255]) });
    const textures = new Map([
      [cliff.id, solid(240, 10, 10)],
      [`${cliff.id}:cliff-side`, solid(10, 240, 10)],
      [`${cliff.id}:cliff-rear`, solid(10, 10, 240)],
    ]);
    expect(sampleDirectionalCliffTexture(cliff, 0, 0, textures, 0, 1)?.color).toEqual([240, 10, 10]);
    expect(sampleDirectionalCliffTexture(cliff, 0, 0, textures, 1, 0)?.color).toEqual([10, 240, 10]);
    expect(sampleDirectionalCliffTexture(cliff, 0, 0, textures, 0, -1)?.color).toEqual([10, 10, 240]);
    const fallback = new Map([[cliff.id, solid(80, 90, 100)]]);
    expect(sampleDirectionalCliffTexture(cliff, 0, 0, fallback, 1, 0)?.color).toEqual([80, 90, 100]);
  });

  it("keeps procedural cliff colors valid while texture flow rotates through corners", () => {
    const recipe = createBlankRecipe();
    recipe.shape.transparentBackground = true;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffDirectionalLight = 0.7;
    const rendered = renderProjectedTilePixels(recipe, 0, 48);
    let coloredWallPixels = 0;
    for (let index = 0; index < rendered.pixels.length; index += 4) {
      if (rendered.pixels[index + 3] > 0 && rendered.pixels[index] + rendered.pixels[index + 1] + rendered.pixels[index + 2] > 24) coloredWallPixels += 1;
    }
    expect(coloredWallPixels).toBeGreaterThan(200);
  });

  it("extrudes the complete rounded terrain silhouette without corner holes", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffOverlap = 0;
    cliff.cliffCrownEnabled = false;
    const size = 48;
    const base = renderTilePixels(recipe, 0, size);
    const projected = renderProjectedTilePixels(recipe, 0, size);
    let activeColumns = 0;
    const bottomRows: number[] = [];
    let coveredCornerColumns = 0;
    for (let x = 0; x < size; x += 1) {
      let edgeY = -1;
      for (let y = 0; y < size; y += 1) {
        if (base[(y * size + x) * 4 + 3] > 8) edgeY = y;
      }
      if (edgeY < 0) continue;
      activeColumns += 1;
      if (edgeY < size - 1) {
        const cornerAlpha = projected.pixels[((projected.footprint.originY + edgeY + 1) * projected.footprint.width + projected.footprint.originX + x) * 4 + 3];
        expect(cornerAlpha, `corner gap below column ${x}`).toBeGreaterThan(0);
        coveredCornerColumns += 1;
      }
      let bottom = -1;
      for (let y = edgeY + 1; y < projected.footprint.height; y += 1) {
        const alpha = projected.pixels[((projected.footprint.originY + y) * projected.footprint.width + projected.footprint.originX + x) * 4 + 3];
        if (alpha > 0) bottom = y;
      }
      expect(bottom, `projected depth at column ${x}`).toBeGreaterThan(edgeY);
      for (let y = edgeY + 1; y <= bottom; y += 1) {
        const alpha = projected.pixels[((projected.footprint.originY + y) * projected.footprint.width + projected.footprint.originX + x) * 4 + 3];
        expect(alpha, `column ${x}, row ${y}`).toBeGreaterThan(0);
      }
      bottomRows.push(bottom);
    }
    expect(activeColumns).toBeGreaterThan(size / 2);
    expect(coveredCornerColumns).toBeGreaterThan(4);
    expect(new Set(bottomRows).size).toBeGreaterThan(1);
  });

  it("produces finite, colored terrain pixels", () => {
    const pixels = renderTilePixels(DEFAULT_RECIPE, 255, 16);
    const center = ((8 * 16) + 8) * 4;
    expect([...pixels.slice(center, center + 3)].some((channel) => channel > 20)).toBe(true);
  });

  it("renders independent nonlinear inner and outer contours", () => {
    const shaped = structuredClone(DEFAULT_RECIPE);
    const flat = structuredClone(DEFAULT_RECIPE);
    shaped.shape.deformationMode = "straight";
    shaped.shape.roughness = 0;
    flat.shape.deformationMode = "straight";
    flat.shape.roughness = 0;
    for (const layer of flat.layers) {
      if (layer.kind !== "band") continue;
      layer.innerContour = { mode: "straight", amplitude: 0, frequency: 1, phase: 0 };
      layer.outerContour = { mode: "straight", amplitude: 0, frequency: 1, phase: 0 };
    }
    const shapedPixels = renderTilePixels(shaped, 0, 32);
    const flatPixels = renderTilePixels(flat, 0, 32);
    const difference = shapedPixels.reduce((sum, value, index) => sum + Math.abs(value - flatPixels[index]), 0);
    expect(difference).toBeGreaterThan(1000);
  });

  it("supports embossed and engraved relief", () => {
    const embossed = structuredClone(DEFAULT_RECIPE);
    const engraved = structuredClone(DEFAULT_RECIPE);
    for (const recipe of [embossed, engraved]) {
      recipe.layers.forEach((layer) => { if (layer.kind === "band") layer.enabled = layer.id === "lip"; });
      const reliefBand = recipe.layers.find((layer) => layer.id === "lip")!;
      reliefBand.sides = { N: true, E: true, S: true, W: true };
    }
    embossed.layers.find((layer) => layer.id === "lip")!.relief = 0.9;
    engraved.layers.find((layer) => layer.id === "lip")!.relief = -0.9;
    const high = renderTilePixels(embossed, 0, 32);
    const low = renderTilePixels(engraved, 0, 32);
    const difference = high.reduce((sum, value, index) => sum + Math.abs(value - low[index]), 0);
    // Relief is evaluated on the canonical contour. This threshold proves
    // that embossing and engraving remain visibly distinct without coupling
    // the assertion to the former deformation-only primitive geometry.
    expect(difference).toBeGreaterThan(150);
  });

  it("keeps nonlinear relief profiles continuous across compatible seams", () => {
    const report = analyzeSeams(DEFAULT_RECIPE, new Map(), 20);
    expect(report.testedPairs).toBeGreaterThan(0);
    expect(report.maximum).toBeLessThan(8);
    expect(report.grade).toBe("healthy");
  });

  it("generates aligned height, normal and AO maps with seam-safe borders", () => {
    for (const channel of ["height", "normal", "ao"] as const) {
      const pixels = renderAuxiliaryTilePixels(DEFAULT_RECIPE, 255, 20, channel);
      expect(pixels).toHaveLength(20 * 20 * 4);
      expect(pixels[3]).toBe(255);
    }
    expect([...renderAuxiliaryTilePixels(DEFAULT_RECIPE, 255, 20, "normal").slice(0, 3)]).toEqual([128, 128, 255]);
    expect([...renderAuxiliaryTilePixels(DEFAULT_RECIPE, 255, 20, "ao").slice(0, 3)]).toEqual([255, 255, 255]);
  });

  it("applies cinematic grading without changing topology", () => {
    const warm = structuredClone(DEFAULT_RECIPE);
    warm.artDirection.temperature = .5;
    warm.artDirection.saturation = 1.5;
    const neutralPixels = renderTilePixels(DEFAULT_RECIPE, 255, 20);
    const warmPixels = renderTilePixels(warm, 255, 20);
    const difference = warmPixels.reduce((sum, value, index) => sum + Math.abs(value - neutralPixels[index]), 0);
    expect(difference).toBeGreaterThan(1000);
  });

  it("projects cliff faces beyond the logical tile in whole tile steps", () => {
    const recipe = structuredClone(DEFAULT_RECIPE);
    for (const layer of recipe.layers) layer.cliffEnabled = false;
    const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffHeightSteps = 2;
    cliff.cliffOffsetX = 0;
    cliff.cliffOffsetY = 0;
    cliff.cliffShear = 0;
    const footprint = projectionFootprint(recipe, 32);
    expect(footprint).toMatchObject({ width: 32, height: 96, originX: 0, originY: 0 });
    const rendered = renderProjectedTilePixels(recipe, 0, 32);
    expect(rendered.pixels).toHaveLength(32 * 96 * 4);
    const projectedAlpha = Array.from({ length: 32 * 64 }, (_, index) => rendered.pixels[(32 * 32 + index) * 4 + 3]);
    expect(projectedAlpha.some((alpha) => alpha > 0)).toBe(true);
    for (const channel of ["normal", "height", "ao"] as const) {
      expect(renderProjectedAuxiliaryTilePixels(recipe, 0, 32, channel).pixels).toHaveLength(32 * 96 * 4);
    }
    const silhouette = renderProjectedTilePixels(recipe, 0, 32, new Map(), 0, true);
    expect(silhouette.footprint).toMatchObject({ width: 32, height: 96, originY: 0 });
    expect(Array.from({ length: 32 * 64 }, (_, index) => silhouette.pixels[(32 * 32 + index) * 4 + 3]).every((alpha) => alpha === 0)).toBe(true);

    recipe.topology = "dual16";
    expect(renderProjectedTilePixels(recipe, 5, 32).pixels).toHaveLength(32 * 96 * 4);
  });

  it("supports exact pixel cliff heights from 1px to four tile lengths", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.25;
    expect(projectionFootprint(recipe, 64)).toMatchObject({ width: 64, height: 80, originY: 0 });
    expect(renderProjectedTilePixels(recipe, 0, 64).pixels).toHaveLength(64 * 80 * 4);
    cliff.cliffHeightSteps = 4;
    expect(projectionFootprint(recipe, 64)).toMatchObject({ width: 64, height: 320, originY: 0 });
    cliff.cliffHeightSteps = 37 / 64;
    expect(cliffDepthForEdge(cliff, "S", 64)).toBe(37);
    expect(projectionFootprint(recipe, 64)).toMatchObject({ width: 64, height: 102, originY: 0 });
    expect(normalizeCliffHeight(0.1)).toBe(0.1);
    expect(normalizeCliffHeight(0.62)).toBe(0.62);
    expect(normalizeCliffHeight(0, 73)).toBe(1 / 73);
    expect(normalizeCliffHeight(9)).toBe(4);
  });

  it("keeps side and rear cliff heights independent from the main height", () => {
    const recipe = createBlankRecipe();
    recipe.shape.tileSize = 73;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffDirectional = true;
    cliff.cliffDirection = "S";
    cliff.cliffHeightSteps = 137 / 73;
    cliff.cliffSideDepth = 154 / 137;
    cliff.cliffRearDepth = 91 / 137;

    const normalized = normalizeRecipe(recipe);
    const normalizedCliff = normalized.layers.find((layer) => layer.cliffFaceOnly)!;
    expect(cliffDepthForEdge(normalizedCliff, "S", 73)).toBe(137);
    expect(cliffDepthForEdge(normalizedCliff, "E", 73)).toBe(154);
    expect(cliffDepthForEdge(normalizedCliff, "N", 73)).toBe(91);
  });

  it("pads a 64px tile with a 48px cliff to a fixed 64x128 atlas cell", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.75;
    expect(projectionFootprint(recipe, 64)).toMatchObject({ width: 64, height: 112, originY: 0 });
    expect(atlasCellFootprint(recipe, 64)).toMatchObject({
      width: 64,
      height: 128,
      originY: 0,
      margins: { left: 0, top: 0, right: 0, bottom: 64 },
    });
    expect(buildManifest(recipe).atlas).toMatchObject({
      regionWidth: 64,
      regionHeight: 128,
      contentWidth: 64,
      contentHeight: 112,
      padding: { right: 0, bottom: 16 },
    });
    expect(buildGodotImporter(recipe)).toContain("const REGION_SIZE := Vector2i(64, 128)");
  });

  it("starts an imported cliff texture at y=0 directly below the imported Blob alpha edge", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.25;
    cliff.cliffShadow = 0;
    cliff.cliffCrownEnabled = false;
    const size = 16;
    const override = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size / 2; y += 1) for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      override.set([240, 30, 180, 255], index);
    }
    const cliffTexture = new Uint8ClampedArray([
      255, 240, 20, 255,
      20, 40, 255, 255,
    ]);
    const rendered = renderProjectedTilePixels(recipe, 0, size, new Map([
      ["override:0", { width: size, height: size, data: override }],
      [cliff.id, { width: 1, height: 2, data: cliffTexture }],
    ]));
    const logicalPixel = ((rendered.footprint.originY + 7) * rendered.footprint.width + rendered.footprint.originX + 8) * 4;
    expect([...rendered.pixels.slice(logicalPixel, logicalPixel + 4)]).toEqual([240, 30, 180, 255]);
    const firstFacePixel = ((rendered.footprint.originY + 8) * rendered.footprint.width + rendered.footprint.originX + 8) * 4;
    const firstFace = [...rendered.pixels.slice(firstFacePixel, firstFacePixel + 4)];
    expect(firstFace[0]).toBeGreaterThan(200);
    expect(firstFace[1]).toBeGreaterThan(180);
    expect(firstFace[2]).toBeLessThan(80);
    expect(firstFace[3]).toBe(255);
  });

  it("supports fractional visual offsets without changing structural height", () => {
    const recipe = structuredClone(DEFAULT_RECIPE);
    const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
    cliff.cliffHeightSteps = 1;
    cliff.cliffOffsetX = -0.25;
    cliff.cliffOffsetY = 0.125;
    cliff.cliffShear = 0;
    const footprint = projectionFootprint(recipe, 32);
    expect(footprint.originX).toBe(8);
    expect(footprint.height).toBe(68);
    expect((footprint.width - footprint.logicalSize) % 2).toBe(0);
    expect((footprint.height - footprint.logicalSize) % 2).toBe(0);
  });

  it("projects each cardinal cliff only from terrain edges facing that direction", () => {
    for (const direction of ["N", "E", "S", "W"] as const) {
      const recipe = structuredClone(DEFAULT_RECIPE);
      for (const layer of recipe.layers) layer.cliffEnabled = false;
      const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
      cliff.cliffEnabled = true;
      cliff.cliffDirection = direction;
      cliff.cliffHeightSteps = 1;
      cliff.cliffOffsetX = 0;
      cliff.cliffOffsetY = 0;
      cliff.cliffShear = 0;
      cliff.sides = { N: direction === "N", E: direction === "E", S: direction === "S", W: direction === "W" };
      const rendered = renderProjectedTilePixels(recipe, 0, 32);
      const { footprint } = rendered;
      let projectedPixels = 0;
      for (let y = 0; y < footprint.height; y += 1) for (let x = 0; x < footprint.width; x += 1) {
        const logical = x >= footprint.originX && x < footprint.originX + 32 && y >= footprint.originY && y < footprint.originY + 32;
        if (!logical && rendered.pixels[(y * footprint.width + x) * 4 + 3] > 0) projectedPixels += 1;
      }
      expect(projectedPixels, direction).toBeGreaterThan(20);
    }
  });

  it("composites the hidden cliff overlap behind unchanged terrain pixels", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffOverlap = 0;
    cliff.cliffCrownEnabled = false;
    const base = renderTilePixels(recipe, 0, 32);
    const projected = renderProjectedTilePixels(recipe, 0, 32);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      const baseIndex = (y * 32 + x) * 4;
      if (base[baseIndex + 3] !== 255) continue;
      const projectedIndex = ((projected.footprint.originY + y) * projected.footprint.width + projected.footprint.originX + x) * 4;
      expect([...projected.pixels.slice(projectedIndex, projectedIndex + 4)]).toEqual([...base.slice(baseIndex, baseIndex + 4)]);
    }
  });

  it("keeps projected south-facing walls continuous across connected tiles", () => {
    const recipe = structuredClone(DEFAULT_RECIPE);
    for (const layer of recipe.layers) layer.cliffEnabled = false;
    const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffHeightSteps = 1;
    cliff.cliffOffsetX = 0;
    cliff.cliffOffsetY = 0;
    cliff.cliffShear = 0;
    cliff.sides = { N: false, E: false, S: true, W: false };
    const left = renderProjectedTilePixels(recipe, BIT.E, 32);
    const right = renderProjectedTilePixels(recipe, BIT.W, 32);
    let samples = 0;
    let delta = 0;
    for (let y = 0; y < left.footprint.height; y += 1) {
      const leftIndex = (y * left.footprint.width + left.footprint.originX + 31) * 4;
      const rightIndex = (y * right.footprint.width + right.footprint.originX) * 4;
      if (left.pixels[leftIndex + 3] === 0 || right.pixels[rightIndex + 3] === 0) continue;
      samples += 1;
      delta += Math.abs(left.pixels[leftIndex] - right.pixels[rightIndex]);
      delta += Math.abs(left.pixels[leftIndex + 1] - right.pixels[rightIndex + 1]);
      delta += Math.abs(left.pixels[leftIndex + 2] - right.pixels[rightIndex + 2]);
    }
    expect(samples).toBeGreaterThan(8);
    expect(delta / (samples * 3)).toBeLessThan(12);
  });

  it("renders the cliff crown as a structural ribbon independent from inner borders", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffCrownEnabled = true;
    cliff.cliffCrownWidthPx = 5;
    cliff.cliffCrownPatternSizePx = 1;
    const crown = { width: 1, height: 1, data: new Uint8ClampedArray([245, 24, 220, 255]) };
    const textures = new Map([[cliffTextureKey(cliff.id, "crown"), crown]]);
    const rendered = renderProjectedTilePixels(recipe, 0, 32, textures);
    const withoutCrown = structuredClone(recipe);
    withoutCrown.layers.find((layer) => layer.cliffEnabled)!.cliffCrownEnabled = false;
    const flat = renderProjectedTilePixels(withoutCrown, 0, 32, textures);
    const changed = rendered.pixels.reduce((sum, value, index) => sum + Math.abs(value - flat.pixels[index]), 0);
    expect(changed).toBeGreaterThan(5000);

    const widerBorder = structuredClone(recipe);
    widerBorder.layers.find((layer) => layer.id === "inner-border")!.width = 0.8;
    const withWiderBorder = renderProjectedTilePixels(widerBorder, 0, 32, textures);
    const crownMask = (pixels: Uint8ClampedArray) => Array.from({ length: pixels.length / 4 }, (_, index) => {
      const source = index * 4;
      return pixels[source] > 180 && pixels[source + 2] > 150 && pixels[source + 1] < 100;
    });
    expect(crownMask(withWiderBorder.pixels)).toEqual(crownMask(rendered.pixels));
  });

  it("tiles the band texture directly across the projected cliff face", () => {
    const recipe = structuredClone(DEFAULT_RECIPE);
    for (const layer of recipe.layers) layer.cliffEnabled = false;
    const cliff = recipe.layers.find((layer) => layer.id === "cliff")!;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffHeightSteps = 1;
    cliff.cliffOffsetX = 0;
    cliff.cliffOffsetY = 0;
    cliff.cliffShear = 0;
    cliff.cliffShadow = 0;
    cliff.cliffPatternSizePx = 2;
    cliff.cliffVerticalSampling = "repeat";
    cliff.sides = { N: false, E: false, S: true, W: false };
    const checker = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        230, 20, 20, 255, 20, 20, 230, 255,
        20, 20, 230, 255, 230, 20, 20, 255,
      ]),
    };
    const rendered = renderProjectedTilePixels(recipe, 0, 24, new Map([["cliff", checker]]));
    let red = 0;
    let blue = 0;
    for (let y = 24; y < rendered.footprint.height; y += 1) for (let x = 0; x < rendered.footprint.width; x += 1) {
      const index = (y * rendered.footprint.width + x) * 4;
      if (rendered.pixels[index + 3] === 0) continue;
      if (rendered.pixels[index] > 150 && rendered.pixels[index + 2] < 60) red += 1;
      if (rendered.pixels[index + 2] > 150 && rendered.pixels[index] < 60) blue += 1;
    }
    expect(red).toBeGreaterThan(5);
    expect(blue).toBeGreaterThan(5);
  });

  it("shifts the projected cliff texture horizontally in exact output pixels", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.25;
    cliff.cliffShadow = 0;
    cliff.cliffCrownEnabled = false;
    cliff.cliffPatternSizePx = 4;
    cliff.cliffTextureOffsetXPx = 0;
    cliff.cliffVerticalSampling = "repeat";
    cliff.cliffDirectionalLight = 0;
    cliff.cliffMacroVariation = 0;
    const stripe = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        240, 20, 20, 255,
        20, 240, 20, 255,
        20, 20, 240, 255,
        240, 220, 20, 255,
      ]),
    };
    const size = 16;
    const textures = new Map([[cliff.id, stripe]]);
    const base = renderProjectedTilePixels(recipe, 0, size, textures);
    const shiftedRecipe = structuredClone(recipe);
    shiftedRecipe.layers.find((layer) => layer.cliffFaceOnly)!.cliffTextureOffsetXPx = 1;
    const shifted = renderProjectedTilePixels(shiftedRecipe, 0, size, textures);
    const facePixel = (pixels: Uint8ClampedArray, x: number) => {
      const y = base.footprint.originY + size;
      const index = (y * base.footprint.width + base.footprint.originX + x) * 4;
      return [...pixels.slice(index, index + 4)];
    };

    expect(facePixel(shifted.pixels, 8)).toEqual(facePixel(base.pixels, 9));
    expect(facePixel(shifted.pixels, 8)).not.toEqual(facePixel(base.pixels, 8));
  });

  it("renders a cliff without an imported texture as a genuinely flat color", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.textureUrl = undefined;
    cliff.textureName = undefined;
    cliff.color = "#804020";
    cliff.accent = "#20A0E0";
    cliff.pattern = "rock";
    cliff.roughness = 1;
    cliff.frequency = 7;
    cliff.cliffHeightSteps = 0.5;
    cliff.cliffCrownEnabled = false;
    cliff.cliffShadow = 0;
    cliff.cliffMacroVariation = 1;
    const size = 32;
    const rendered = renderProjectedTilePixels(recipe, 0, size);
    const colors: number[][] = [];
    for (let y = rendered.footprint.originY + size; y < rendered.footprint.height; y += 1) {
      for (let x = rendered.footprint.originX; x < rendered.footprint.originX + size; x += 1) {
        const index = (y * rendered.footprint.width + x) * 4;
        if (rendered.pixels[index + 3] > 0) colors.push([...rendered.pixels.slice(index, index + 4)]);
      }
    }

    expect(colors.every((color) => color[3] === 255)).toBe(true);
    expect(new Set(colors.map((color) => color.join(","))).size).toBe(1);
    // No procedural grain, brightness, face shadow, macro variation or
    // tile-local overlay may alter the chosen hexadecimal color.
    expect(colors[0].slice(0, 3)).toEqual([128, 64, 32]);
  });

  it("keeps imported cliff pixels invariant across retired face modifiers", () => {
    const recipe = createBlankRecipe();
    recipe.shape.outerRadius = 0.35;
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffDirectional = true;
    cliff.cliffSideDepth = 0.6;
    cliff.cliffRearDepth = 0.3;
    cliff.cliffHeightSteps = 0.5;
    cliff.cliffCrownEnabled = false;
    cliff.cliffMacroVariation = 1;
    cliff.cliffDirectionalLight = 1;
    cliff.cliffSideTextureScale = 0.2;
    const main = { width: 3, height: 2, data: new Uint8ClampedArray([
      240, 20, 20, 255, 20, 240, 20, 255, 20, 20, 240, 255,
      20, 20, 240, 255, 240, 20, 20, 255, 20, 240, 20, 255,
    ]) };
    const side = { width: 1, height: 1, data: new Uint8ClampedArray([250, 240, 10, 255]) };
    const textures = new Map([[cliff.id, main], [cliffTextureKey(cliff.id, "side"), side]]);
    const modified = renderProjectedTilePixels(recipe, 0, 32, textures).pixels;
    const changed = structuredClone(recipe);
    const changedCliff = changed.layers.find((layer) => layer.cliffFaceOnly)!;
    changedCliff.cliffSideTextureScale = 1;
    changedCliff.cliffMacroVariation = 0;
    changedCliff.cliffDirectionalLight = 0;
    const faithful = renderProjectedTilePixels(changed, 0, 32, textures).pixels;
    expect(faithful).toEqual(modified);
  });

  it("uses identical output-pixel texture coordinates on front, side and rear faces", () => {
    const cliff = createBlankRecipe().layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.cliffTextureOffsetXPx = 3;
    cliff.cliffSideDepth = 0.25;
    cliff.cliffRearDepth = 0.75;
    cliff.cliffSideTextureScale = 0.2;
    cliff.cliffMacroVariation = 1;
    const front = cliffWallTextureCoordinates(cliff, 12, 40, 9, 0, 1, 5, 7);
    const side = cliffWallTextureCoordinates(cliff, 40, 12, 9, 1, 0, 7, 5);
    const rear = cliffWallTextureCoordinates(cliff, 12, 40, 9, 0, -1, 5, 7);

    expect(front).toEqual({ x: 20, y: 8 });
    expect(side).toEqual(front);
    expect(rear).toEqual(front);
  });

  it("keeps a multi-tile plain cliff face free of tile overlays", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.color = "#804020";
    cliff.accent = "#20A0E0";
    cliff.pattern = "rock";
    cliff.roughness = 1;
    cliff.frequency = 7;
    cliff.cliffHeightSteps = 0.5;
    cliff.cliffCrownEnabled = false;
    cliff.cliffShadow = 0;
    cliff.cliffMacroVariation = 1;
    const size = 16;
    const cellCount = 8;
    const cells = Array.from({ length: cellCount }, (_, x) => ({
      x,
      y: 0,
      mask: (x > 0 ? BIT.W : 0) | (x < cellCount - 1 ? BIT.E : 0),
    }));
    const rendered = renderProjectedMapPixels(recipe, cells, cellCount, 1, size);
    const y = rendered.footprint.originY + size;
    const colors: string[] = [];
    for (let x = size; x < (cellCount - 1) * size; x += 1) {
      const index = (y * rendered.width + rendered.footprint.originX + x) * 4;
      if (rendered.pixels[index + 3] > 0) colors.push([...rendered.pixels.slice(index, index + 4)].join(","));
    }

    expect(colors.length).toBeGreaterThan(size * 4);
    expect(new Set(colors).size).toBe(1);
  });

  it("keeps wall_top_terrain_64 cliff pixels identical across inner and outer walls at the same world X", () => {
    const tileSize = 64;
    const source = {
      width: tileSize * 5,
      height: tileSize * 4,
      data: new Uint8ClampedArray(tileSize * 5 * tileSize * 4 * 4).fill(255),
    };
    const composition = composeBlob47FromBlob15(source);
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.tileSize = tileSize;
    recipe.shape.transparentBackground = true;
    recipe.overrides = Object.fromEntries([...composition.tiles.keys()].map((mask) => [String(mask), "wall_top_terrain_64"]));
    recipe.overrideSettings = Object.fromEntries([...composition.tiles.keys()].map((mask) => [String(mask), { mode: "replace" as const, insetPx: 0, featherPx: 0 }]));
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffDirectional = true;
    cliff.cliffHeightSteps = 48 / tileSize;
    cliff.cliffPatternSizePx = 64;
    cliff.cliffVerticalSampling = "preserve";
    cliff.cliffCrownEnabled = false;
    cliff.shadowEnabled = false;

    const wall = { width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4) };
    for (let y = 0; y < wall.height; y += 1) for (let x = 0; x < wall.width; x += 1) {
      const index = (y * wall.width + x) * 4;
      const left = x < 32;
      wall.data.set([left ? 70 + y : 170 - y, left ? 95 : 55 + y, left ? 40 : 120, 255], index);
    }
    const textures = new Map([...composition.tiles].map(([mask, bitmap]) => [`override:${mask}`, bitmap]));
    textures.set(cliffTextureKey(cliff.id, "front"), wall);
    const grid = createLabGrid("ring", recipe.shape.seed, 13);
    const cells = grid.flatMap((row, y) => row.flatMap((filled, x) => filled ? [{ x, y, mask: maskFromGrid(grid, x, y) }] : []));
    const rendered = renderProjectedMapPixels(recipe, cells, grid.length, grid.length, tileSize, textures);
    const innerTop = tileSize * 3;
    const outerBottom = tileSize * 12;
    const compareStartX = tileSize * 4;
    const compareEndX = tileSize * 9;
    for (let y = 0; y < wall.height; y += 1) for (let x = compareStartX; x < compareEndX; x += 1) {
      const inner = (innerTop + y) * rendered.width + x;
      const outer = (outerBottom + y) * rendered.width + x;
      expect([...rendered.pixels.slice(inner * 4, inner * 4 + 4)]).toEqual([...rendered.pixels.slice(outer * 4, outer * 4 + 4)]);
    }
    const leftHalf = (innerTop + 16) * rendered.width + compareStartX + 2;
    const rightHalf = (innerTop + 16) * rendered.width + compareStartX + 34;
    expect([...rendered.pixels.slice(leftHalf * 4, leftHalf * 4 + 4)]).not.toEqual([...rendered.pixels.slice(rightHalf * 4, rightHalf * 4 + 4)]);
  });

  it("does not rasterize sparse or tile-edge side contours as vertical needles", () => {
    const tileSize = 64;
    const mask = BIT.S;
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.tileSize = tileSize;
    recipe.shape.transparentBackground = true;
    recipe.overrides = { [String(mask)]: "sparse-wall-top" };
    recipe.overrideSettings = { [String(mask)]: { mode: "replace", insetPx: 0, featherPx: 0 } };
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffDirectional = true;
    cliff.cliffHeightSteps = 48 / tileSize;
    cliff.cliffSideDepth = 0.8;
    cliff.cliffRearDepth = 0;
    cliff.cliffCrownEnabled = false;
    cliff.shadowEnabled = false;

    // A vertical wall-top post is visible artwork, not a terrain boundary.
    // The former alpha-driven projector extruded its lower edge into a
    // two-pixel-wide, 48-pixel-tall needle below the tile.
    const sparseTop = { width: tileSize, height: tileSize, data: new Uint8ClampedArray(tileSize * tileSize * 4) };
    for (let y = 0; y < tileSize - 1; y += 1) for (const x of [0, 14, 15, tileSize - 1]) {
      sparseTop.data.set([240, 240, 240, 255], (y * tileSize + x) * 4);
    }
    const wall = { width: tileSize, height: 48, data: new Uint8ClampedArray(tileSize * 48 * 4).fill(255) };
    const textures = new Map([
      [`override:${mask}`, sparseTop],
      [cliffTextureKey(cliff.id, "front"), wall],
    ]);
    const rendered = renderProjectedTilePixels(recipe, mask, tileSize, textures);

    expect(pixelAt(rendered.pixels, rendered.footprint.width, 14, tileSize + 20)[3]).toBe(0);
    expect(pixelAt(rendered.pixels, rendered.footprint.width, 0, tileSize + 20)[3]).toBe(0);
  });

  it("projects exactly the exposed front faces across all 47 sparse Blob overrides", () => {
    const tileSize = 64;
    const wallHeight = 48;
    const masks = getBlobMasks();
    const recipe = createBlankRecipe();
    recipe.topology = "blob47";
    recipe.shape.tileSize = tileSize;
    recipe.shape.transparentBackground = true;
    recipe.overrides = Object.fromEntries(masks.map((mask) => [String(mask), `sparse-${mask}`]));
    recipe.overrideSettings = Object.fromEntries(masks.map((mask) => [String(mask), { mode: "replace" as const, insetPx: 0, featherPx: 0 }]));
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffEnabled = true;
    cliff.cliffDirection = "S";
    cliff.cliffDirectional = true;
    cliff.cliffHeightSteps = wallHeight / tileSize;
    cliff.cliffSideDepth = 0.8;
    cliff.cliffRearDepth = 0;
    cliff.cliffCrownEnabled = false;
    cliff.shadowEnabled = false;

    const wall = { width: tileSize, height: wallHeight, data: new Uint8ClampedArray(tileSize * wallHeight * 4) };
    for (let y = 0; y < wallHeight; y += 1) for (let x = 0; x < tileSize; x += 1) {
      wall.data.set([(x * 3 + y) % 256, (x + y * 5) % 256, (220 - x + y) % 256, 255], (y * tileSize + x) * 4);
    }
    let referenceFace: Uint8ClampedArray | undefined;
    for (const mask of masks) {
      const top = { width: tileSize, height: tileSize, data: new Uint8ClampedArray(tileSize * tileSize * 4) };
      for (let y = 0; y < tileSize - 1; y += 1) for (const x of [0, 14, 15, 48, 49, tileSize - 1]) {
        top.data.set([240, 240, 240, 255], (y * tileSize + x) * 4);
      }
      if (!hasBit(mask, BIT.S)) for (let x = 0; x < tileSize; x += 1) {
        top.data.set([240, 240, 240, 255], ((tileSize - 1) * tileSize + x) * 4);
      }
      const textures = new Map([
        [`override:${mask}`, top],
        [cliffTextureKey(cliff.id, "front"), wall],
      ]);
      const rendered = renderProjectedTilePixels(recipe, mask, tileSize, textures);
      const face = new Uint8ClampedArray(tileSize * wallHeight * 4);
      for (let y = 0; y < wallHeight; y += 1) {
        const start = ((tileSize + y) * rendered.footprint.width) * 4;
        face.set(rendered.pixels.subarray(start, start + tileSize * 4), y * tileSize * 4);
      }

      if (hasBit(mask, BIT.S)) {
        expect(face.every((value) => value === 0), `mask ${mask} must not project through its south neighbor`).toBe(true);
      } else {
        referenceFace ??= face;
        expect(face, `mask ${mask} must preserve the same complete front texture`).toEqual(referenceFace);
        expect(face).toEqual(wall.data);
      }
    }
  });

  it("gates imported cliff projection by the exposed cardinal neighbor in every direction", () => {
    const tileSize = 16;
    const masks = getBlobMasks();
    const directions = [
      { direction: "N" as const, bit: BIT.N },
      { direction: "E" as const, bit: BIT.E },
      { direction: "S" as const, bit: BIT.S },
      { direction: "W" as const, bit: BIT.W },
    ];
    for (const { direction, bit } of directions) {
      const recipe = createBlankRecipe();
      recipe.topology = "blob47";
      recipe.shape.tileSize = tileSize;
      recipe.shape.transparentBackground = true;
      recipe.overrides = Object.fromEntries(masks.map((mask) => [String(mask), `opaque-${mask}`]));
      recipe.overrideSettings = Object.fromEntries(masks.map((mask) => [String(mask), { mode: "replace" as const, insetPx: 0, featherPx: 0 }]));
      const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
      cliff.enabled = true;
      cliff.cliffEnabled = true;
      cliff.cliffDirection = direction;
      cliff.cliffDirectional = false;
      cliff.cliffHeightSteps = 0.5;
      cliff.cliffCrownEnabled = false;
      cliff.shadowEnabled = false;
      const top = { width: tileSize, height: tileSize, data: new Uint8ClampedArray(tileSize * tileSize * 4).fill(255) };

      for (const mask of masks) {
        const rendered = renderProjectedTilePixels(recipe, mask, tileSize, new Map([[`override:${mask}`, top]]));
        let projectedPixels = 0;
        for (let y = 0; y < rendered.footprint.height; y += 1) for (let x = 0; x < rendered.footprint.width; x += 1) {
          const insideLogicalTile = x >= rendered.footprint.originX && x < rendered.footprint.originX + tileSize
            && y >= rendered.footprint.originY && y < rendered.footprint.originY + tileSize;
          if (!insideLogicalTile && rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3] > 0) projectedPixels += 1;
        }
        if (hasBit(mask, bit)) {
          expect(projectedPixels, `${direction} face of mask ${mask} must be occluded by its neighbor`).toBe(0);
        } else {
          expect(projectedPixels, `${direction} face of mask ${mask} must project outside the logical tile`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps the crown fixed when the wall texture offset changes", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.5;
    cliff.cliffShadow = 0;
    cliff.cliffCrownEnabled = true;
    cliff.cliffCrownWidthPx = 4;
    cliff.cliffCrownPatternSizePx = 4;
    cliff.cliffTextureOffsetXPx = 0;
    cliff.cliffDirectionalLight = 0;
    cliff.cliffMacroVariation = 0;
    const crown = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        240, 20, 220, 255,
        20, 220, 240, 255,
        220, 180, 20, 255,
        120, 20, 240, 255,
      ]),
    };
    const textures = new Map([[cliffTextureKey(cliff.id, "crown"), crown]]);
    const size = 16;
    const base = renderProjectedTilePixels(recipe, 0, size, textures);
    const shiftedRecipe = structuredClone(recipe);
    shiftedRecipe.layers.find((layer) => layer.cliffFaceOnly)!.cliffTextureOffsetXPx = 1;
    const shifted = renderProjectedTilePixels(shiftedRecipe, 0, size, textures);
    const logicalTile = (pixels: Uint8ClampedArray) => {
      const result: number[] = [];
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        const index = ((base.footprint.originY + y) * base.footprint.width + base.footprint.originX + x) * 4;
        result.push(...pixels.slice(index, index + 4));
      }
      return result;
    };

    expect(logicalTile(shifted.pixels)).toEqual(logicalTile(base.pixels));
  });

  it("preserves a 32x48 cliff texture at native 1:1 scale on a 64px tile", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.75;
    cliff.cliffShadow = 0;
    cliff.scale = 1;
    cliff.cliffPatternSizePx = 32;
    const texture = {
      width: 32,
      height: 48,
      data: new Uint8ClampedArray(32 * 48 * 4),
    };
    for (let y = 0; y < texture.height; y += 1) for (let x = 0; x < texture.width; x += 1) {
      const index = (y * texture.width + x) * 4;
      const color = y === 0 ? [230, 230, 20] : y >= 44 ? [20, 20, 230] : x < 16 ? [230, 20, 20] : [20, 230, 20];
      texture.data[index] = color[0];
      texture.data[index + 1] = color[1];
      texture.data[index + 2] = color[2];
      texture.data[index + 3] = 255;
    }
    const size = 64;
    const override = {
      width: size,
      height: size,
      data: new Uint8ClampedArray(size * size * 4),
    };
    for (let index = 0; index < override.data.length; index += 4) override.data.set([255, 255, 255, 255], index);
    const rendered = renderProjectedTilePixels(recipe, 0, size, new Map([
      [cliff.id, texture],
      ["override:0", override],
    ]));
    const facePixel = (sourceX: number, step: number) => {
      const x = rendered.footprint.originX + sourceX;
      const y = rendered.footprint.originY + size - 1 + step;
      const index = (y * rendered.footprint.width + x) * 4;
      return [...rendered.pixels.slice(index, index + 3)];
    };
    const firstVisibleRow = facePixel(16, 1);
    expect(firstVisibleRow[0]).toBeGreaterThan(firstVisibleRow[2]);
    expect(firstVisibleRow[1]).toBeGreaterThan(firstVisibleRow[2]);
    const firstRepeat = facePixel(16, 2);
    const secondRepeat = facePixel(48, 2);
    expect(firstRepeat[1]).toBeGreaterThan(firstRepeat[0]);
    expect(secondRepeat[1]).toBeGreaterThan(secondRepeat[0]);
    let bluePixels = 0;
    for (let y = rendered.footprint.originY + size; y < rendered.footprint.height; y += 1) for (let x = 0; x < rendered.footprint.width; x += 1) {
      const index = (y * rendered.footprint.width + x) * 4;
      if (rendered.pixels[index + 2] > rendered.pixels[index] && rendered.pixels[index + 2] > rendered.pixels[index + 1]) bluePixels += 1;
    }
    expect(bluePixels).toBeGreaterThan(0);
  });

  it("preserves transparent pixels while repeating an uploaded cliff texture", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 0.25;
    cliff.scale = 1;
    cliff.cliffPatternSizePx = 1;
    cliff.cliffVerticalSampling = "repeat";
    const size = 16;
    const override = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
    for (let index = 0; index < override.data.length; index += 4) override.data.set([255, 255, 255, 255], index);
    const texture = {
      width: 1,
      height: 4,
      data: new Uint8ClampedArray([
        220, 20, 20, 255,
        20, 220, 20, 0,
        20, 20, 220, 128,
        220, 220, 20, 255,
      ]),
    };
    const rendered = renderProjectedTilePixels(recipe, 0, size, new Map([
      [cliff.id, texture],
      ["override:0", override],
    ]));
    const alphaAtStep = (step: number) => {
      const x = rendered.footprint.originX + 8;
      const y = rendered.footprint.originY + size - 1 + step;
      return rendered.pixels[(y * rendered.footprint.width + x) * 4 + 3];
    };
    expect(alphaAtStep(1)).toBe(255);
    expect(alphaAtStep(2)).toBe(0);
    expect(alphaAtStep(3)).toBe(128);
    expect(alphaAtStep(4)).toBe(255);
  });

  it("keeps an uploaded cliff motif at the same pixel scale when tile size changes", () => {
    const recipe = createBlankRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffFaceOnly)!;
    cliff.enabled = true;
    cliff.cliffHeightSteps = 1;
    cliff.cliffPatternSizePx = 4;
    cliff.cliffVerticalSampling = "repeat";
    const texture = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        230, 20, 20, 255, 230, 20, 20, 255,
        20, 20, 230, 255, 20, 20, 230, 255,
      ]),
    };
    const sampleRows = (size: number) => {
      const override = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
      for (let index = 0; index < override.data.length; index += 4) override.data.set([255, 255, 255, 255], index);
      const rendered = renderProjectedTilePixels(recipe, 0, size, new Map([
        [cliff.id, texture],
        ["override:0", override],
      ]));
      return Array.from({ length: 8 }, (_, index) => {
        const x = rendered.footprint.originX + Math.floor(size / 2);
        const y = rendered.footprint.originY + size + index;
        const pixel = (y * rendered.footprint.width + x) * 4;
        return [...rendered.pixels.slice(pixel, pixel + 3)];
      });
    };

    expect(sampleRows(32)).toEqual(sampleRows(64));
  });
});

describe("recipe migration", () => {
  it("preserves arbitrary integer tile sizes within the supported range", () => {
    const recipe = createBlankRecipe();
    recipe.shape.tileSize = 73;
    expect(normalizeRecipe(recipe).shape.tileSize).toBe(73);
    recipe.shape.tileSize = 12.7;
    expect(normalizeRecipe(recipe).shape.tileSize).toBe(13);
  });

  it("upgrades the former cliff defaults to the new production profile", () => {
    const legacy = createBlankRecipe();
    const cliff = legacy.layers.find((layer) => layer.cliffEnabled)!;
    legacy.shape.tileSize = 128;
    cliff.cliffSideDepth = 0.34;
    cliff.cliffRearDepth = 0.08;
    cliff.cliffPatternSizePx = 96;
    cliff.cliffSideTextureScale = 0.62;
    cliff.cliffDirectionalLight = 0.35;

    const migrated = normalizeRecipe(legacy).layers.find((layer) => layer.cliffEnabled)!;
    expect(migrated).toMatchObject({
      cliffSideDepth: 0.8,
      cliffRearDepth: 0,
      cliffPatternSizePx: 128,
      cliffSideTextureScale: 1,
      cliffDirectionalLight: 0,
    });
  });

  it("clamps imported edge amplitude to the supported extended range", () => {
    const excessive = structuredClone(DEFAULT_RECIPE);
    excessive.shape.roughness = 99;
    expect(normalizeRecipe(excessive).shape.roughness).toBe(MAX_EDGE_DEFORMATION);

    const invalid = structuredClone(DEFAULT_RECIPE);
    invalid.shape.roughness = Number.NaN;
    expect(normalizeRecipe(invalid).shape.roughness).toBe(0);
  });

  it("defaults and clamps imported organic-noise controls", () => {
    const excessive = structuredClone(DEFAULT_RECIPE);
    excessive.shape.organicOctaves = 99;
    excessive.shape.organicPersistence = -3;
    const clamped = normalizeRecipe(excessive);
    expect(clamped.shape.organicOctaves).toBe(6);
    expect(clamped.shape.organicPersistence).toBe(0);

    const legacy = structuredClone(DEFAULT_RECIPE);
    delete (legacy.shape as Partial<typeof legacy.shape>).organicOctaves;
    delete (legacy.shape as Partial<typeof legacy.shape>).organicPersistence;
    delete (legacy.shape as Partial<typeof legacy.shape>).organicOffset;
    const migrated = normalizeRecipe(legacy);
    expect(migrated.shape.organicOffset).toBe(0);
    expect(migrated.shape.organicOctaves).toBe(4);
    expect(migrated.shape.organicPersistence).toBe(0.5);
  });

  it("defaults and clamps per-material brightness in imported recipes", () => {
    const imported = structuredClone(DEFAULT_RECIPE);
    const brightId = imported.layers[0].id;
    const darkId = imported.layers[1].id;
    const legacyId = imported.layers[2].id;
    imported.layers[0].brightness = 4;
    imported.layers[1].brightness = -4;
    delete (imported.layers[2] as Partial<typeof imported.layers[number]>).brightness;
    const normalized = normalizeRecipe(imported);
    expect(normalized.layers.find((layer) => layer.id === brightId)?.brightness).toBe(1);
    expect(normalized.layers.find((layer) => layer.id === darkId)?.brightness).toBe(-1);
    expect(normalized.layers.find((layer) => layer.id === legacyId)?.brightness).toBe(0);
  });

  it("clamps imported shadows to the extended large-shadow range", () => {
    const imported = structuredClone(DEFAULT_RECIPE);
    imported.layers[0].shadowDistance = 99;
    imported.layers[0].shadowBlur = 99;
    const normalized = normalizeRecipe(imported);
    const surface = normalized.layers.find((layer) => layer.id === imported.layers[0].id)!;
    expect(surface.shadowDistance).toBe(MAX_SHADOW_DISTANCE);
    expect(surface.shadowBlur).toBe(MAX_SHADOW_BLUR);
  });

  it("restores TileSetter-inspired settings in legacy recipes", () => {
    const legacy = structuredClone(DEFAULT_RECIPE);
    delete (legacy.shape as Partial<typeof legacy.shape>).transparentBackground;
    delete (legacy.shape as Partial<typeof legacy.shape>).mergePoint;
    delete (legacy.variants as Partial<typeof legacy.variants>).weights;
    delete (legacy as Partial<typeof legacy>).artDirection;
    delete (legacy as Partial<typeof legacy>).topology;
    delete (legacy as Partial<typeof legacy>).dualDiagonal;
    delete (legacy.layers[0] as Partial<typeof legacy.layers[0]>).transforms;
    delete (legacy.layers[0] as Partial<typeof legacy.layers[0]>).taper;
    const legacyBand = legacy.layers[1] as Partial<typeof legacy.layers[1]>;
    delete legacyBand.placement;
    delete legacyBand.innerFade;
    delete legacyBand.outerFade;
    delete legacyBand.innerContour;
    delete legacyBand.outerContour;
    delete legacyBand.relief;
    delete legacyBand.cliffEnabled;
    delete legacyBand.cliffDirection;
    delete legacyBand.cliffHeightSteps;
    delete legacyBand.cliffDirectional;
    delete legacyBand.cliffSideDepth;
    delete legacyBand.cliffRearDepth;
    delete legacyBand.cliffPatternSizePx;
    delete legacyBand.cliffCrownEnabled;
    delete legacyBand.cliffCrownWidthPx;
    delete legacyBand.cliffCrownPatternSizePx;
    delete legacyBand.cliffSideTextureScale;
    delete legacyBand.cliffDirectionalLight;
    delete legacyBand.cliffMacroVariation;
    delete legacyBand.cliffDetailDensity;
    delete legacyBand.cliffDetailStrength;
    const normalized = normalizeRecipe(legacy);
    expect(normalized.shape.mergePoint).toBe(0.5);
    expect(normalized.shape.transparentBackground).toBe(false);
    expect(normalized.topology).toBe("blob47");
    expect(normalized.createdWith).toBe("Tesserae");
    expect(normalized.variants.weights).toHaveLength(normalized.variants.count);
    expect(normalized.artDirection.normalStrength).toBe(1);
    expect(normalized.layers[0].transforms.E.rotation).toBe(90);
    expect(normalized.layers[0].taper).toBe(0);
    const migratedLip = normalized.layers.find((layer) => layer.id === "lip")!;
    expect(migratedLip.placement).toBe("inner");
    expect(migratedLip.innerContour.mode).toBeTruthy();
    expect(Number.isFinite(migratedLip.relief)).toBe(true);
    expect(migratedLip.cliffEnabled).toBe(false);
    expect(migratedLip.cliffDirection).toBe("S");
    expect(migratedLip.cliffHeightSteps).toBe(DEFAULT_CLIFF_HEIGHT_STEPS);
    expect(migratedLip.cliffDirectional).toBe(true);
    expect(migratedLip.cliffSideDepth).toBe(0.8);
    expect(migratedLip.cliffRearDepth).toBe(0);
    expect(migratedLip.cliffPatternSizePx).toBe(legacy.shape.tileSize);
    expect(migratedLip.cliffCrownEnabled).toBe(true);
    expect(migratedLip.cliffCrownWidthPx).toBe(automaticCliffCrownWidth(legacy.shape.tileSize, legacy.shape.tileSize, legacy.shape.tileSize));
    expect(migratedLip.cliffCrownPatternSizePx).toBe(legacy.shape.tileSize);
    expect(migratedLip.cliffSideTextureScale).toBe(1);
    expect(migratedLip.cliffDirectionalLight).toBe(0);
    expect(migratedLip.cliffMacroVariation).toBe(0);
    expect(migratedLip.cliffDetailDensity).toBe(0.18);
    expect(migratedLip.cliffDetailStrength).toBe(0.42);
    expect(normalized.stackOrder).toBe("top-first");
  });

  it("migrates legacy perspective cliffs to one downward projection", () => {
    const legacy = createBlankRecipe();
    const front = legacy.layers.find((layer) => layer.cliffEnabled)!;
    const side = structuredClone(front);
    side.id = "legacy-right-cliff";
    side.name = "Right perspective";
    side.detail = "Right perspective";
    side.cliffDirection = "E";
    side.sides = { N: false, E: true, S: false, W: false };
    legacy.layers.splice(legacy.layers.indexOf(front) + 1, 0, side);
    legacy.selectedLayerId = side.id;

    const normalized = normalizeRecipe(legacy);
    const cliffs = normalized.layers.filter((layer) => layer.cliffEnabled);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]).toMatchObject({ id: front.id, cliffDirection: "S", sides: { N: false, E: false, S: true, W: false } });
    expect(normalized.selectedLayerId).toBe(front.id);
  });

  it("restores canonical cliffs that an older normalization turned into borders", () => {
    const damaged = createBlankRecipe();
    const cliff = damaged.layers.find((layer) => layer.id === "cliff")!;
    cliff.enabled = true;
    cliff.cliffEnabled = false;
    cliff.cliffFaceOnly = false;
    cliff.shadowEnabled = true;
    cliff.shadowOpacity = 0.7;
    cliff.shadowDistance = 0.12;
    cliff.shadowAngle = 45;
    cliff.shadowBlur = 0.05;

    const restored = normalizeRecipe(damaged);
    const restoredCliff = restored.layers.find((layer) => layer.id === "cliff")!;
    expect(restoredCliff).toMatchObject({
      cliffEnabled: true,
      cliffFaceOnly: true,
      cliffDirection: "S",
      shadowEnabled: true,
      shadowOpacity: 0.85,
      shadowDistance: 0.3,
      shadowAngle: 90,
      shadowBlur: 0.1,
    });
  });

  it("removes retired inner-shadow settings from saved recipes", () => {
    const legacy = createBlankRecipe() as unknown as { layers: Array<Record<string, unknown>> };
    legacy.layers[0].innerShadowEnabled = true;
    legacy.layers[0].innerShadowColor = "#123456";
    legacy.layers[0].innerShadowOpacity = 0.8;
    legacy.layers[0].innerShadowDistance = 0.2;
    legacy.layers[0].innerShadowAngle = 90;
    legacy.layers[0].innerShadowBlur = 0.1;
    legacy.layers[0].innerShadowAffectsAo = true;

    const normalized = normalizeRecipe(legacy as unknown as TerrainRecipe);
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain("innerShadow");
  });
});

describe("Godot export contract", () => {
  it("serializes external shadows", () => {
    const recipe = createBlankRecipe();
    const surface = recipe.layers.find((layer) => layer.id === "surface")!;
    surface.shadowEnabled = true;
    const shadows = buildManifest(recipe).materialShadows;
    expect(shadows).toHaveLength(1);
    expect(shadows.map((shadow) => shadow.type)).toEqual(["external"]);
  });

  it("exports all masks and variant weights", () => {
    const manifest = buildManifest(DEFAULT_RECIPE);
    expect(manifest.generator).toBe("Tesserae");
    expect(manifest.transparentBackground).toBe(false);
    expect(manifest.edgeDeformation).toMatchObject({
      mode: "organic",
      amount: DEFAULT_RECIPE.shape.roughness,
      frequency: 2,
      organicOffset: 0,
      organicOctaves: 4,
      organicPersistence: 0.5,
    });
    expect(manifest.materialShadows).toEqual([]);
    expect(manifest.materialBrightness).toHaveLength(DEFAULT_RECIPE.layers.length);
    expect(manifest.materialBrightness.every((material) => material.brightness === 0)).toBe(true);
    expect(manifest.tiles).toHaveLength(47);
    expect(manifest.variants.weights).toEqual([40, 30, 20]);
    expect(manifest.edgeProfiles).toHaveLength(4);
    expect(manifest.edgeProfiles.find((profile) => profile.id === "sand")?.placement).toBe("inner");
    expect(manifest.channels.normal).toContain("normal");
    expect(manifest.artDirection.normalStrength).toBe(DEFAULT_RECIPE.artDirection.normalStrength);
    expect(manifest.renderRegion.height).toBeGreaterThan(manifest.logicalTileSize);
    expect(manifest.edgeProfiles.find((profile) => profile.id === "cliff")?.projectedCliff.enabled).toBe(true);
    expect(manifest.edgeProfiles.find((profile) => profile.id === "cliff")?.projectedCliff.hiddenOverlap).toBe(0);
    expect(manifest.edgeProfiles.find((profile) => profile.id === "sand")?.textureScale).toBe(1);
    expect(manifest.edgeProfiles.find((profile) => profile.id === "sand")?.inwardTransparency).toBe(0);
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain('"tesserae-atlas-v1.png"');
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain("base_dir.path_join");
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain("CanvasTexture.new()");
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain("TERRAIN_MODE_MATCH_CORNERS_AND_SIDES");
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain("texture_origin = TEXTURE_ORIGIN");
    expect(buildGodotImporter(DEFAULT_RECIPE)).toContain("source.texture_region_size = REGION_SIZE");
    expect(buildGodotImporter(DEFAULT_RECIPE)).not.toContain("tesserae-atlas-v2.png");
    expect(buildGodotShader()).toContain("NORMAL_MAP");
  });

  it("exports artistic variants as weighted Blob 47 alternatives", () => {
    const recipe = normalizeRecipe(createArtisticCoastRecipe());
    expect(recipe.shape.deformationMode).toBe("artistic");
    expect(recipe.variants).toMatchObject({ count: 4, weights: [40, 30, 20, 10] });
    const importer = buildGodotImporter(recipe);
    expect(importer).toContain('"tesserae-atlas-v4.png"');
    expect(importer).toContain('"tesserae-normal-v4.png"');
    expect(importer).toContain("const VARIANT_WEIGHTS := [40, 30, 20, 10]");
    expect(importer).toContain("tile_data.probability = max(0.0, VARIANT_WEIGHTS[variant_index])");
    expect(importer).toContain("source_ids.append(source_id)");
  });

  it("describes directional cliff materials with faithful pixel mapping in the manifest", () => {
    const recipe = createArtisticCoastRecipe();
    const cliff = recipe.layers.find((layer) => layer.cliffEnabled)!;
    cliff.cliffCrownEnabled = true;
    cliff.textureName = "front.png";
    cliff.cliffCrownTextureName = "crown.png";
    cliff.cliffSideTextureName = "sides.png";
    cliff.cliffRearTextureName = "rear.png";
    cliff.cliffDetailTextureName = "cracks.png";
    const projected = buildManifest(recipe).edgeProfiles.find((profile) => profile.id === cliff.id)!.projectedCliff;
    expect(projected).toMatchObject({
      textureMapping: "output-pixel faithful",
      detailDensity: 0.18,
      detailStrength: 0.42,
      crown: { enabled: true, widthPx: 13, patternSizePx: 128, texture: "crown.png", mapping: "contour ribbon" },
      directionalTextures: { front: "front.png", crown: "crown.png", side: "sides.png", rear: "rear.png", detail: "cracks.png" },
    });
  });

  it("exports a compact Dual Grid atlas and Godot runtime", () => {
    const dual = structuredClone(DEFAULT_RECIPE);
    dual.topology = "dual16";
    const manifest = buildManifest(dual);
    expect(manifest.topology).toBe("dual16");
    expect(manifest.atlas).toMatchObject({ columns: 4, rows: 4, tileCount: 16 });
    expect(manifest.tiles).toHaveLength(16);
    expect(manifest.tiles[5].corners.NW).toBe(true);
    expect(buildGodotImporter(dual)).toContain("dual_mask");
    expect(buildGodotDualRuntime(dual)).toContain("class_name TesseraeDualGrid16");
    expect(buildGodotDualRuntime(dual)).toContain("static func rebuild");
  });

  it("creates a valid ZIP envelope", async () => {
    const archive = createStoreZip([{ name: "proof.txt", data: new TextEncoder().encode("47") }]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("rejects malformed PNGs and reads validated IHDR dimensions", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, 768, false);
    view.setUint32(20, 256, false);
    expect(inspectPng(png)).toEqual({ width: 768, height: 256 });
    expect(() => inspectPng(new Uint8Array(24))).toThrow(/signature/);
  });
});
