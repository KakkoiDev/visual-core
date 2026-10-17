import type { TerrainRecipe, TextureRegistry } from "../types";
import { compatibleHorizontal, compatibleVertical } from "./blob47";
import { compatibleDualHorizontal, compatibleDualVertical } from "./dual16";
import { renderAuxiliaryTilePixels, renderTilePixels } from "./render";
import { getTerrainMasks } from "./topology";
import { terrainEdgeDeformations } from "../types";

export interface SeamFinding {
  channel: SeamChannel;
  orientation: "horizontal" | "vertical";
  firstMask: number;
  secondMask: number;
  firstVariant: number;
  secondVariant: number;
  score: number;
}

export type SeamChannel = "albedo" | "normal" | "height" | "ao";
export type SeamCause = "healthy" | "override" | "variant" | "cliff" | "material";

export interface SeamDiagnostic {
  finding: SeamFinding;
  size: number;
  first: Uint8ClampedArray;
  second: Uint8ClampedArray;
  heatmap: Uint8ClampedArray;
  peakDelta: number;
  peakOffset: number;
  cause: SeamCause;
}

export interface SeamReport {
  average: number;
  maximum: number;
  testedPairs: number;
  grade: "healthy" | "watch" | "broken";
  worst: SeamFinding[];
}

function pixelDifference(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
  size: number,
  orientation: "horizontal" | "vertical",
): number {
  let total = 0;
  for (let offset = 0; offset < size; offset += 1) {
    const firstPixel =
      orientation === "horizontal" ? (offset * size + (size - 1)) * 4 : ((size - 1) * size + offset) * 4;
    const secondPixel = orientation === "horizontal" ? offset * size * 4 : offset * 4;
    total +=
      Math.abs(first[firstPixel] - second[secondPixel]) +
      Math.abs(first[firstPixel + 1] - second[secondPixel + 1]) +
      Math.abs(first[firstPixel + 2] - second[secondPixel + 2]);
  }
  return total / (size * 3);
}

export function analyzeSeams(
  recipe: TerrainRecipe,
  textures: TextureRegistry = new Map(),
  size = 24,
  channel: SeamChannel = "albedo",
): SeamReport {
  const masks = getTerrainMasks(recipe);
  const variants = terrainEdgeDeformations(recipe.shape).some((effect) => effect.mode === "artistic")
    ? Array.from({ length: recipe.variants.count }, (_, index) => index)
    : [0];
  const renderKey = (mask: number, variant: number) => `${mask}:${variant}`;
  const rendered = new Map<string, Uint8ClampedArray>();
  for (const mask of masks) {
    for (const variant of variants) {
      rendered.set(
        renderKey(mask, variant),
        channel === "albedo"
          ? renderTilePixels(recipe, mask, size, textures, variant)
          : renderAuxiliaryTilePixels(recipe, mask, size, channel, variant, textures),
      );
    }
  }
  const findings: SeamFinding[] = [];

  for (const firstMask of masks) {
    for (const secondMask of masks) {
      const horizontalMatches = recipe.topology === "dual16"
        ? compatibleDualHorizontal(firstMask, secondMask)
        : compatibleHorizontal(firstMask, secondMask);
      const verticalMatches = recipe.topology === "dual16"
        ? compatibleDualVertical(firstMask, secondMask)
        : compatibleVertical(firstMask, secondMask);
      for (const firstVariant of variants) {
        for (const secondVariant of variants) {
          if (horizontalMatches) {
            findings.push({
              channel,
              orientation: "horizontal",
              firstMask,
              secondMask,
              firstVariant,
              secondVariant,
              score: pixelDifference(
                rendered.get(renderKey(firstMask, firstVariant))!,
                rendered.get(renderKey(secondMask, secondVariant))!,
                size,
                "horizontal",
              ),
            });
          }
          if (verticalMatches) {
            findings.push({
              channel,
              orientation: "vertical",
              firstMask,
              secondMask,
              firstVariant,
              secondVariant,
              score: pixelDifference(
                rendered.get(renderKey(firstMask, firstVariant))!,
                rendered.get(renderKey(secondMask, secondVariant))!,
                size,
                "vertical",
              ),
            });
          }
        }
      }
    }
  }

  const sum = findings.reduce((total, finding) => total + finding.score, 0);
  const average = findings.length ? sum / findings.length : 0;
  const maximum = findings.reduce((max, finding) => Math.max(max, finding.score), 0);
  // Below 8/255 per channel the edge delta remains visually negligible after texture filtering.
  const grade = maximum < 8 ? "healthy" : maximum < 18 ? "watch" : "broken";
  const worst = [...findings].sort((a, b) => b.score - a.score).slice(0, 8);
  return { average, maximum, testedPairs: findings.length, grade, worst };
}

function findingCause(recipe: TerrainRecipe, finding: SeamFinding): SeamCause {
  if (finding.score < 8) return "healthy";
  if (recipe.overrides[String(finding.firstMask)] || recipe.overrides[String(finding.secondMask)]) return "override";
  if (finding.firstVariant !== finding.secondVariant && terrainEdgeDeformations(recipe.shape).some((effect) => effect.mode === "artistic")) return "variant";
  if (recipe.layers.some((layer) => layer.enabled && layer.cliffEnabled)) return "cliff";
  return "material";
}

export function buildSeamDiagnostic(
  recipe: TerrainRecipe,
  textures: TextureRegistry,
  finding: SeamFinding,
  size = 48,
): SeamDiagnostic {
  const render = (mask: number, variant: number) => finding.channel === "albedo"
    ? renderTilePixels(recipe, mask, size, textures, variant)
    : renderAuxiliaryTilePixels(recipe, mask, size, finding.channel, variant, textures);
  const first = render(finding.firstMask, finding.firstVariant);
  const second = render(finding.secondMask, finding.secondVariant);
  const heatmap = new Uint8ClampedArray(size * 4);
  let peakDelta = 0;
  let peakOffset = 0;
  for (let offset = 0; offset < size; offset += 1) {
    const firstPixel = finding.orientation === "horizontal" ? (offset * size + size - 1) * 4 : ((size - 1) * size + offset) * 4;
    const secondPixel = finding.orientation === "horizontal" ? offset * size * 4 : offset * 4;
    const delta = (
      Math.abs(first[firstPixel] - second[secondPixel])
      + Math.abs(first[firstPixel + 1] - second[secondPixel + 1])
      + Math.abs(first[firstPixel + 2] - second[secondPixel + 2])
      + Math.abs(first[firstPixel + 3] - second[secondPixel + 3])
    ) / 4;
    if (delta > peakDelta) { peakDelta = delta; peakOffset = offset; }
    const intensity = Math.min(255, Math.round(delta * 6));
    heatmap[offset * 4] = intensity;
    heatmap[offset * 4 + 1] = Math.max(0, 180 - intensity);
    heatmap[offset * 4 + 2] = 210 - Math.round(intensity * 0.6);
    heatmap[offset * 4 + 3] = 255;
  }
  return { finding, size, first, second, heatmap, peakDelta, peakOffset, cause: findingCause(recipe, finding) };
}
