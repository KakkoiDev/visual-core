import type { TerrainRecipe } from "../types";
import type { QualityReport } from "./quality";
import { getTerrainMasks } from "./topology";

export type DesignProofStatus = "pass" | "review" | "blocked";

export interface DesignProofCheck {
  id: "contract" | "connections" | "seams" | "cliff" | "patterns" | "gameplay";
  status: DesignProofStatus;
  value: string;
}

export interface DesignProofReport {
  status: DesignProofStatus;
  checks: DesignProofCheck[];
}

export function buildDesignProof(recipe: TerrainRecipe, quality: QualityReport): DesignProofReport {
  const profile = recipe.productionProfile ?? "free";
  const profileIssues = quality.issues.filter((issue) => issue.id.startsWith("profile:"));
  const seamReports = Object.values(quality.seams);
  const cliff = recipe.layers.find((layer) => layer.enabled && layer.cliffEnabled);
  const checks: DesignProofCheck[] = [
    {
      id: "contract",
      status: profileIssues.some((issue) => issue.severity === "error") ? "blocked" : profile === "free" ? "review" : "pass",
      value: profile,
    },
    {
      id: "connections",
      status: "pass",
      value: String(getTerrainMasks(recipe).length),
    },
    {
      id: "seams",
      status: seamReports.some((report) => report.grade === "broken") ? "blocked" : seamReports.some((report) => report.grade === "watch") ? "review" : "pass",
      value: String(seamReports.reduce((sum, report) => sum + report.testedPairs, 0)),
    },
    {
      id: "cliff",
      status: quality.issues.some((issue) => issue.id === "cliff:repeat-y" || issue.id === "cliff:height") ? "review" : "pass",
      value: cliff ? (cliff.cliffVerticalSampling === "preserve" ? "preserve" : "repeat") : "unused",
    },
    {
      id: "patterns",
      status: recipe.patterns.length > 0 ? "pass" : "review",
      value: String(recipe.patterns.length),
    },
    {
      id: "gameplay",
      status: recipe.semantics.terrainId && recipe.semantics.surfaceType && recipe.semantics.footstep ? "pass" : "review",
      value: [recipe.semantics.physicsEnabled, recipe.semantics.navigationEnabled, recipe.semantics.occlusionEnabled].filter(Boolean).length.toString(),
    },
  ];
  const status = checks.some((check) => check.status === "blocked") ? "blocked" : checks.some((check) => check.status === "review") ? "review" : "pass";
  return { status, checks };
}
