import type { TerrainRecipe } from "../types";
import { blobAtlasCoords, getBlobMasks, maskLabel } from "./blob47";
import { dualMaskLabel, getDualMasks } from "./dual16";

export function getTerrainMasks(recipe: TerrainRecipe): readonly number[] {
  return recipe.topology === "dual16" ? getDualMasks() : getBlobMasks();
}

export function terrainMaskLabel(recipe: TerrainRecipe, mask: number, language: "en" | "fr" = "en"): string {
  return recipe.topology === "dual16" ? dualMaskLabel(mask, language) : maskLabel(mask, language);
}

export function terrainAtlasLayout(recipe: TerrainRecipe): { columns: number; rows: number } {
  return recipe.topology === "dual16" ? { columns: 4, rows: 4 } : { columns: 12, rows: 4 };
}

export function terrainAtlasCoords(recipe: TerrainRecipe, mask: number, index: number): { x: number; y: number } {
  if (recipe.topology === "blob47") return blobAtlasCoords(mask);
  const layout = terrainAtlasLayout(recipe);
  return { x: index % layout.columns, y: Math.floor(index / layout.columns) };
}
