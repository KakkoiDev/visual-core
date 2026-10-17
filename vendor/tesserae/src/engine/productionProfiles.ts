import { terrainEdgeDeformations } from "../types";
import type { ProductionProfileId, TerrainRecipe } from "../types";

export interface ProductionProfileIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
}

export const PRODUCTION_PROFILES: ProductionProfileId[] = ["free", "pixel-strict", "orthogonal-90"];

function preserveCliffPixels(recipe: TerrainRecipe): void {
  for (const layer of recipe.layers) {
    if (layer.cliffEnabled) layer.cliffVerticalSampling = "preserve";
  }
}

export function applyProductionProfile(recipe: TerrainRecipe, profile: ProductionProfileId): void {
  recipe.productionProfile = profile;
  if (profile === "free") return;
  recipe.shape.deformationMode = "straight";
  recipe.shape.roughness = 0;
  recipe.shape.edgeDeformations = [];
  preserveCliffPixels(recipe);
  if (profile === "pixel-strict") {
    const radiusPixels = Math.round(recipe.shape.outerRadius * recipe.shape.tileSize);
    recipe.shape.outerRadius = radiusPixels / recipe.shape.tileSize;
    recipe.shape.innerRadius = recipe.shape.outerRadius;
    return;
  }
  recipe.shape.outerRadius = 0;
  recipe.shape.innerRadius = 0;
  recipe.shape.transparentBackground = true;
}

export function evaluateProductionProfile(recipe: TerrainRecipe): ProductionProfileIssue[] {
  const profile = recipe.productionProfile ?? "free";
  if (profile === "free") return [];
  const issues: ProductionProfileIssue[] = [];
  if (terrainEdgeDeformations(recipe.shape).length > 0) {
    issues.push({ id: "profile:deformation", severity: "error", message: "The production profile requires straight, undeformed edges" });
  }
  const repeatingCliff = recipe.shape.outputMode === "composite" && recipe.layers.some((layer) => layer.enabled && layer.cliffEnabled && layer.cliffVerticalSampling !== "preserve");
  if (repeatingCliff) issues.push({ id: "profile:cliff-sampling", severity: "error", message: "The production profile requires cliffs to preserve their authored vertical pixels once" });
  if (profile === "pixel-strict") {
    const radiusPixels = recipe.shape.outerRadius * recipe.shape.tileSize;
    if (Math.abs(radiusPixels - Math.round(radiusPixels)) > 0.0001) {
      issues.push({ id: "profile:pixel-grid", severity: "error", message: "The strict pixel profile requires corner radii on whole pixels" });
    }
    return issues;
  }
  if (recipe.shape.outerRadius !== 0 || recipe.shape.innerRadius !== 0) {
    issues.push({ id: "profile:orthogonal-corners", severity: "error", message: "The orthogonal profile requires square 90-degree corners" });
  }
  if (recipe.shape.outputMode === "composite" && !recipe.shape.transparentBackground) {
    issues.push({ id: "profile:transparent", severity: "error", message: "The orthogonal profile requires a transparent export background" });
  }
  return issues;
}
