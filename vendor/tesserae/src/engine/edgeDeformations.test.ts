import { describe, expect, it } from "vitest";
import { BIT } from "./blob47";
import { buildDistanceField, clearRenderCache, renderTilePixels } from "./render";
import { appendInnerBorder, createBlankRecipe, layerEdgeFrequencyLimit, layerEdgeStackDisplacement, MAX_EDGE_DEFORMATION, MAX_LAYER_EDGE_DEFORMATION, normalizeRecipe, terrainEdgeDeformations } from "../types";

function changedBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) changed += 1;
  return changed;
}

describe("layer edge deformation stacks", () => {
  it("applies several additive deformations to one border without changing the other layer settings", () => {
    const recipe = appendInnerBorder(createBlankRecipe(), "Inner border", "test", "second-border");
    const first = recipe.layers.find((layer) => layer.id === "inner-border")!;
    const second = recipe.layers.find((layer) => layer.id === "second-border")!;
    const clean = renderTilePixels(recipe, BIT.N | BIT.E | BIT.NE, 64);
    first.edgeDeformations = [{ id: "wave-1", mode: "wave", amount: 1.4, frequency: 3, phase: 0.12 }];

    const single = renderTilePixels(recipe, BIT.N | BIT.E | BIT.NE, 64);
    first.edgeDeformations.push({ id: "wave-2", mode: "wave", amount: 1.4, frequency: 3, phase: 0.12 });
    const stacked = renderTilePixels(recipe, BIT.N | BIT.E | BIT.NE, 64);

    expect(changedBytes(single, stacked)).toBeGreaterThan(40);
    expect(changedBytes(clean, stacked)).toBeGreaterThan(changedBytes(clean, single));
    expect(second.edgeDeformations).toEqual([]);
  });

  it("normalizes imported stacks and caps unsafe values", () => {
    const recipe = createBlankRecipe();
    const border = recipe.layers.find((layer) => layer.kind === "band" && !layer.cliffEnabled)!;
    border.edgeDeformations = [{
      id: "",
      mode: "fractured",
      amount: 99,
      frequency: -5,
      phase: 4,
    }];

    const normalized = normalizeRecipe(recipe).layers.find((layer) => layer.id === border.id)!;
    expect(normalized.edgeDeformations).toEqual([{
      id: "edge-1",
      mode: "fractured",
      amount: MAX_LAYER_EDGE_DEFORMATION,
      frequency: 0.25,
      phase: 1,
    }]);
  });

  it("keeps local amplitudes gentle and normalizes the complete stack without hard clipping", () => {
    const twoWaves = [
      { id: "wave-1", mode: "wave" as const, amount: 1, frequency: 4, phase: 0 },
      { id: "wave-2", mode: "wave" as const, amount: 1, frequency: 4, phase: 0.25 },
    ];
    expect(layerEdgeStackDisplacement(twoWaves, 64)).toBeCloseTo(2.56);

    const overloaded = Array.from({ length: 6 }, (_, index) => ({
      id: `wave-${index}`,
      mode: "wave" as const,
      amount: 1,
      frequency: 4,
      phase: index / 6,
    }));
    expect(layerEdgeStackDisplacement(overloaded, 64)).toBeCloseTo(6.4);
    expect(layerEdgeFrequencyLimit(16)).toBe(4);
    expect(layerEdgeFrequencyLimit(32)).toBe(8);
    expect(layerEdgeFrequencyLimit(64)).toBe(16);
  });

  it("preserves the expanded wave-frequency range when recipes are normalized", () => {
    const recipe = createBlankRecipe();
    recipe.shape.edgeDeformations = [{ id: "fine-wave", mode: "wave", amount: 1, frequency: 99, phase: 0 }];
    const border = recipe.layers.find((layer) => layer.kind === "band")!;
    border.edgeDeformations = [{ id: "fine-scallop", mode: "scallop", amount: 1, frequency: 99, phase: 0 }];

    const normalized = normalizeRecipe(recipe);

    expect(normalized.shape.edgeDeformations[0].frequency).toBe(16);
    expect(normalized.layers.find((layer) => layer.id === border.id)!.edgeDeformations[0].frequency).toBe(16);
  });
});

describe("terrain edge deformation stacks", () => {
  it("keeps a zero-amount scallop exactly identical to the clean contour", () => {
    const recipe = createBlankRecipe();
    const mask = BIT.N | BIT.E | BIT.NE;
    const cleanField = buildDistanceField(mask, 64, recipe.shape);
    const cleanPixels = renderTilePixels(recipe, mask, 64);

    recipe.shape.edgeDeformations = [{ id: "scallop-1", mode: "scallop", amount: 0, frequency: 1, phase: 0 }];
    clearRenderCache();
    const zeroField = buildDistanceField(mask, 64, recipe.shape);
    const zeroPixels = renderTilePixels(recipe, mask, 64);

    expect(Array.from(zeroField.distance)).toEqual(Array.from(cleanField.distance));
    expect(Array.from(zeroField.bandDistance)).toEqual(Array.from(cleanField.bandDistance));
    expect(Array.from(zeroPixels)).toEqual(Array.from(cleanPixels));
  });

  it("keeps a one-percent scallop sub-pixel and spatially smooth", () => {
    const recipe = createBlankRecipe();
    const mask = BIT.N | BIT.E | BIT.NE;
    const clean = buildDistanceField(mask, 64, recipe.shape).distance;
    recipe.shape.edgeDeformations = [{ id: "scallop-1", mode: "scallop", amount: 0.01, frequency: 1, phase: 0 }];
    clearRenderCache();
    const deformed = buildDistanceField(mask, 64, recipe.shape).distance;
    const delta = Float32Array.from(deformed, (value, index) => value - clean[index]);
    let maximumDisplacement = 0;
    let maximumNeighborStep = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = y * 64 + x;
        maximumDisplacement = Math.max(maximumDisplacement, Math.abs(delta[index]));
        if (x > 0) maximumNeighborStep = Math.max(maximumNeighborStep, Math.abs(delta[index] - delta[index - 1]));
        if (y > 0) maximumNeighborStep = Math.max(maximumNeighborStep, Math.abs(delta[index] - delta[index - 64]));
      }
    }

    expect(maximumDisplacement).toBeLessThanOrEqual(0.013);
    expect(maximumNeighborStep).toBeLessThan(0.004);
  });

  it("combines two sine waves on the shared terrain contour", () => {
    const recipe = createBlankRecipe();
    const mask = BIT.N | BIT.E | BIT.NE;
    const clean = renderTilePixels(recipe, mask, 64);

    recipe.shape.edgeDeformations = [{ id: "wave-1", mode: "wave", amount: 0.8, frequency: 2, phase: 0 }];
    const single = renderTilePixels(recipe, mask, 64);
    recipe.shape.edgeDeformations.push({ id: "wave-2", mode: "wave", amount: 0.8, frequency: 3, phase: 0.25 });
    const stacked = renderTilePixels(recipe, mask, 64);

    expect(changedBytes(clean, single)).toBeGreaterThan(40);
    expect(changedBytes(single, stacked)).toBeGreaterThan(40);
    expect(terrainEdgeDeformations(recipe.shape)).toHaveLength(2);
  });

  it("migrates the legacy single terrain deformation into the additive stack", () => {
    const recipe = createBlankRecipe();
    recipe.shape.deformationMode = "wave";
    recipe.shape.roughness = 0.75;
    recipe.shape.frequency = 3;
    recipe.shape.deformationPhase = 0.2;

    const normalized = normalizeRecipe(recipe);
    expect(normalized.shape.edgeDeformations).toEqual([{
      id: "edge-1",
      mode: "wave",
      amount: 3,
      frequency: 3,
      phase: 0.2,
    }]);
    expect(normalized.shape.edgeDeformations[0].amount).toBeLessThanOrEqual(MAX_EDGE_DEFORMATION);
  });
});
