import type { TerrainRecipe, TextureRegistry } from "../types";
import { cliffTextureKey } from "../types";
import { validateRecipe } from "./recipeFormat";
import { analyzeSeams } from "./seams";
import type { SeamChannel, SeamReport } from "./seams";
import { evaluateProductionProfile } from "./productionProfiles";

export type QualitySeverity = "error" | "warning" | "info";

export interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  message: string;
}

export interface QualityReport {
  grade: "ready" | "review" | "blocked";
  issues: QualityIssue[];
  seams: Record<SeamChannel, SeamReport>;
}

const CHANNELS: SeamChannel[] = ["albedo", "normal", "height", "ao"];

export function assessQuality(recipe: TerrainRecipe, textures: TextureRegistry, sampleSize = 12): QualityReport {
  const issues: QualityIssue[] = validateRecipe(recipe).map((issue, index) => ({
    id: `recipe:${issue.path}:${index}`,
    severity: issue.severity,
    message: `${issue.path}: ${issue.message}`,
  }));
  issues.push(...evaluateProductionProfile(recipe));
  const seams = Object.fromEntries(CHANNELS.map((channel) => [channel, analyzeSeams(recipe, textures, sampleSize, channel)])) as Record<SeamChannel, SeamReport>;
  for (const channel of CHANNELS) {
    const report = seams[channel];
    if (report.grade === "broken") issues.push({ id: `seam:${channel}`, severity: "error", message: `${channel} seam peak ${report.maximum.toFixed(1)} exceeds 18` });
    else if (report.grade === "watch") issues.push({ id: `seam:${channel}`, severity: "warning", message: `${channel} seam peak ${report.maximum.toFixed(1)} should be reviewed` });
  }
  const cliff = recipe.layers.find((layer) => layer.enabled && layer.cliffEnabled);
  if (cliff) {
    const source = textures.get(cliffTextureKey(cliff.id, "front"));
    const expectedDepth = Math.round(recipe.shape.tileSize * cliff.cliffHeightSteps);
    if (!source) issues.push({ id: "cliff:procedural", severity: "info", message: "Cliff uses the procedural fallback" });
    else {
      const authoredHeight = Math.round(source.height * cliff.cliffPatternSizePx / Math.max(1, source.width));
      if (cliff.cliffVerticalSampling === "preserve" && authoredHeight !== expectedDepth) issues.push({ id: "cliff:height", severity: "warning", message: `Cliff source displays at ${authoredHeight}px for a ${expectedDepth}px face; transparent padding or clipping may remain` });
      if (cliff.cliffVerticalSampling === "repeat") issues.push({ id: "cliff:repeat-y", severity: "warning", message: "Vertical repetition is enabled and can repeat transparent padding" });
    }
  }
  const grade = issues.some((issue) => issue.severity === "error") ? "blocked"
    : issues.some((issue) => issue.severity === "warning") ? "review"
      : "ready";
  return { grade, issues, seams };
}

export function assertQuality(report: QualityReport): void {
  if (report.grade !== "blocked") return;
  throw new Error(`Quality gate blocked the export: ${report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`);
}
