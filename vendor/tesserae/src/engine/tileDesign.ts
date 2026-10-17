import type { TerrainRecipe, TextureBitmap, TileOverrideSettings } from "../types";
import { BIT, canonicalizeMask, hasBit } from "./blob47";
import { DUAL_BIT } from "./dual16";

const BLOB_ROTATION = new Map<number, number>([
  [BIT.N, BIT.E], [BIT.NE, BIT.SE], [BIT.E, BIT.S], [BIT.SE, BIT.SW],
  [BIT.S, BIT.W], [BIT.SW, BIT.NW], [BIT.W, BIT.N], [BIT.NW, BIT.NE],
]);

const DUAL_ROTATION = new Map<number, number>([
  [DUAL_BIT.NW, DUAL_BIT.NE], [DUAL_BIT.NE, DUAL_BIT.SE],
  [DUAL_BIT.SE, DUAL_BIT.SW], [DUAL_BIT.SW, DUAL_BIT.NW],
]);

export interface TileDesignCell {
  key: string;
  x: number;
  y: number;
  connected: boolean;
}

export function defaultTileOverrideSettings(tileSize: number): TileOverrideSettings {
  return {
    mode: "safe-center",
    insetPx: Math.max(2, Math.round(tileSize / 8)),
    featherPx: tileSize <= 32 ? 0 : 2,
  };
}

export function tileOverrideSettings(recipe: TerrainRecipe, mask: number): TileOverrideSettings {
  return recipe.overrideSettings?.[String(mask)] ?? {
    mode: "replace",
    insetPx: Math.max(2, Math.round(recipe.shape.tileSize / 8)),
    featherPx: 0,
  };
}

export function rotateTerrainMask(recipe: Pick<TerrainRecipe, "topology">, mask: number, quarterTurns = 1): number {
  let result = mask;
  const turns = ((quarterTurns % 4) + 4) % 4;
  const mapping = recipe.topology === "blob47" ? BLOB_ROTATION : DUAL_ROTATION;
  for (let turn = 0; turn < turns; turn += 1) {
    let rotated = 0;
    for (const [from, to] of mapping) if ((result & from) !== 0) rotated |= to;
    result = recipe.topology === "blob47" ? canonicalizeMask(rotated) : rotated;
  }
  return result;
}

export function tileRotationFamily(recipe: Pick<TerrainRecipe, "topology">, mask: number): Array<{ mask: number; quarterTurns: number }> {
  const family: Array<{ mask: number; quarterTurns: number }> = [];
  const seen = new Set<number>();
  for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
    const rotatedMask = rotateTerrainMask(recipe, mask, quarterTurns);
    if (seen.has(rotatedMask)) continue;
    seen.add(rotatedMask);
    family.push({ mask: rotatedMask, quarterTurns });
  }
  return family;
}

export function tileDesignCells(recipe: Pick<TerrainRecipe, "topology">, mask: number): TileDesignCell[] {
  if (recipe.topology === "dual16") {
    return [
      { key: "top-left", x: 0, y: 0, connected: Boolean(mask & DUAL_BIT.NW) },
      { key: "top-right", x: 2, y: 0, connected: Boolean(mask & DUAL_BIT.NE) },
      { key: "bottom-right", x: 2, y: 2, connected: Boolean(mask & DUAL_BIT.SE) },
      { key: "bottom-left", x: 0, y: 2, connected: Boolean(mask & DUAL_BIT.SW) },
    ];
  }
  return [
    { key: "top", x: 1, y: 0, connected: hasBit(mask, BIT.N) },
    { key: "top-right", x: 2, y: 0, connected: hasBit(mask, BIT.NE) },
    { key: "right", x: 2, y: 1, connected: hasBit(mask, BIT.E) },
    { key: "bottom-right", x: 2, y: 2, connected: hasBit(mask, BIT.SE) },
    { key: "bottom", x: 1, y: 2, connected: hasBit(mask, BIT.S) },
    { key: "bottom-left", x: 0, y: 2, connected: hasBit(mask, BIT.SW) },
    { key: "left", x: 0, y: 1, connected: hasBit(mask, BIT.W) },
    { key: "top-left", x: 0, y: 0, connected: hasBit(mask, BIT.NW) },
  ];
}

export function safeCenterWeight(x: number, y: number, size: number, settings: TileOverrideSettings): number {
  if (settings.mode === "replace") return 1;
  const distance = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (distance < settings.insetPx) return 0;
  if (settings.featherPx <= 0) return 1;
  const progress = Math.max(0, Math.min(1, (distance - settings.insetPx) / settings.featherPx));
  return progress * progress * (3 - 2 * progress);
}

export function blendTileOverride(
  base: Uint8ClampedArray,
  custom: Uint8ClampedArray,
  size: number,
  settings: TileOverrideSettings,
): Uint8ClampedArray {
  if (settings.mode === "replace") return new Uint8ClampedArray(custom);
  const output = new Uint8ClampedArray(base);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4;
    const topologyClip = base[index + 3] / 255;
    const weight = safeCenterWeight(x, y, size, settings) * topologyClip;
    if (weight <= 0) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      output[index + channel] = Math.round(base[index + channel] * (1 - weight) + custom[index + channel] * weight);
    }
  }
  return output;
}

export function rotateTextureBitmap(bitmap: TextureBitmap, quarterTurns: number): TextureBitmap {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return { width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(bitmap.data) };
  const width = turns % 2 === 0 ? bitmap.width : bitmap.height;
  const height = turns % 2 === 0 ? bitmap.height : bitmap.width;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < bitmap.height; y += 1) for (let x = 0; x < bitmap.width; x += 1) {
    let targetX = x;
    let targetY = y;
    if (turns === 1) { targetX = bitmap.height - 1 - y; targetY = x; }
    if (turns === 2) { targetX = bitmap.width - 1 - x; targetY = bitmap.height - 1 - y; }
    if (turns === 3) { targetX = y; targetY = bitmap.width - 1 - x; }
    const source = (y * bitmap.width + x) * 4;
    const target = (targetY * width + targetX) * 4;
    data.set(bitmap.data.subarray(source, source + 4), target);
  }
  return { width, height, data };
}
