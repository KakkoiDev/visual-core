import { normalizeRecipe } from "../types.js";
import { getTerrainMasks } from "./topology.js";
function canonicalValue(value) {
    if (Array.isArray(value))
        return value.map(canonicalValue);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([first], [second]) => first.localeCompare(second)).map(([key, child]) => [key, canonicalValue(child)]));
    }
    return value;
}
export function canonicalRecipeJson(recipe) {
    return JSON.stringify(canonicalValue(normalizeRecipe(recipe)), null, 2) + "\n";
}
export function validateRecipe(recipeInput) {
    const recipe = normalizeRecipe(recipeInput);
    const issues = [];
    const masks = new Set(getTerrainMasks(recipe));
    if (!recipe.name.trim())
        issues.push({ severity: "error", path: "name", message: "Recipe name is empty" });
    if (recipe.topology === "blob47" && masks.size !== 47)
        issues.push({ severity: "error", path: "topology", message: `Blob 47 exposes ${masks.size} masks instead of 47` });
    if (recipe.topology === "dual16" && masks.size !== 16)
        issues.push({ severity: "error", path: "topology", message: `Dual Grid exposes ${masks.size} masks instead of 16` });
    const cliffLayers = recipe.layers.filter((layer) => layer.cliffEnabled);
    if (cliffLayers.length > 1)
        issues.push({ severity: "error", path: "layers", message: "Only one structural cliff layer is supported" });
    if (cliffLayers.some((layer) => layer.cliffDirection !== "S"))
        issues.push({ severity: "error", path: "layers.cliffDirection", message: "Structural cliffs must project south in the current Godot contract" });
    if (recipe.semantics.navigationEnabled && !recipe.semantics.walkable)
        issues.push({ severity: "warning", path: "semantics", message: "Navigation is enabled on a non-walkable terrain; no navigation polygon will be emitted" });
    const patternIds = new Set();
    for (const [patternIndex, pattern] of recipe.patterns.entries()) {
        if (patternIds.has(pattern.id))
            issues.push({ severity: "error", path: `patterns.${patternIndex}.id`, message: `Duplicate pattern id ${pattern.id}` });
        patternIds.add(pattern.id);
        for (const [cellIndex, cell] of pattern.cells.entries())
            if (!masks.has(cell.mask))
                issues.push({ severity: "error", path: `patterns.${patternIndex}.cells.${cellIndex}.mask`, message: `Mask ${cell.mask} does not belong to ${recipe.topology}` });
    }
    return issues;
}
export function diffRecipes(beforeInput, afterInput) {
    const before = canonicalValue(normalizeRecipe(beforeInput));
    const after = canonicalValue(normalizeRecipe(afterInput));
    const differences = [];
    const walk = (left, right, path) => {
        if (Object.is(left, right))
            return;
        if (Array.isArray(left) && Array.isArray(right)) {
            const length = Math.max(left.length, right.length);
            for (let index = 0; index < length; index += 1)
                walk(left[index], right[index], `${path}[${index}]`);
            return;
        }
        if (left && right && typeof left === "object" && typeof right === "object") {
            const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
            for (const key of [...keys].sort())
                walk(left[key], right[key], path ? `${path}.${key}` : key);
            return;
        }
        differences.push({ path, before: left, after: right });
    };
    walk(before, after, "");
    return differences;
}
