import { blobAtlasCoords, getBlobMasks, maskLabel } from "./blob47.js";
import { dualMaskLabel, getDualMasks } from "./dual16.js";
export function getTerrainMasks(recipe) {
    return recipe.topology === "dual16" ? getDualMasks() : getBlobMasks();
}
export function terrainMaskLabel(recipe, mask, language = "en") {
    return recipe.topology === "dual16" ? dualMaskLabel(mask, language) : maskLabel(mask, language);
}
export function terrainAtlasLayout(recipe) {
    return recipe.topology === "dual16" ? { columns: 4, rows: 4 } : { columns: 12, rows: 4 };
}
export function terrainAtlasCoords(recipe, mask, index) {
    if (recipe.topology === "blob47")
        return blobAtlasCoords(mask);
    const layout = terrainAtlasLayout(recipe);
    return { x: index % layout.columns, y: Math.floor(index / layout.columns) };
}
