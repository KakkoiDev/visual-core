import { describe, expect, it } from "vitest";
import { createBlankRecipe, DEFAULT_RECIPE } from "../types";
import { createProject, migrateLegacyRecipe, parseProjectLibrary, removeProject, upsertProject } from "./projects";
import type { ProjectLibrary } from "./projects";

describe("project library", () => {
  it("starts empty when no storage exists or data is corrupted", () => {
    expect(parseProjectLibrary(null).projects).toEqual([]);
    expect(parseProjectLibrary("not-json").activeProjectId).toBeNull();
  });

  it("creates a genuinely minimal editable terrain with its inner border", () => {
    const blank = createBlankRecipe();
    expect(blank.name).toBe("Untitled Terrain");
    expect(blank.layers).toHaveLength(4);
    expect(blank.layers.map((layer) => layer.kind)).toEqual(["inside", "band", "band", "outside"]);
    expect(blank.layers[1]).toMatchObject({ width: 0.2, placement: "inner" });
    expect(blank.layers[2]).toMatchObject({ cliffFaceOnly: true, cliffOverlap: 0, enabled: false });
    expect(blank.shape.transparentBackground).toBe(true);
    expect(blank.shape.tileSize).toBe(64);
    expect(blank.variants.count).toBe(1);
    expect(blank.overrides).toEqual({});
  });

  it("upserts, renames and reorders the active project", () => {
    const first = createProject(DEFAULT_RECIPE, "first", 100);
    const blank = createBlankRecipe("Archipel");
    let library: ProjectLibrary = { schemaVersion: 1, activeProjectId: first.id, projects: [first] };
    library = upsertProject(library, "blank", blank, 200);
    expect(library.activeProjectId).toBe("blank");
    expect(library.projects.map((project) => project.id)).toEqual(["blank", "first"]);

    blank.name = "Archipel nocturne";
    library = upsertProject(library, "blank", blank, 300);
    expect(library.projects[0].name).toBe("Archipel nocturne");
    expect(library.projects[0].createdAt).toBe(200);
    expect(library.projects[0].updatedAt).toBe(300);
  });

  it("migrates the legacy single recipe exactly once", () => {
    const migrated = migrateLegacyRecipe(null, JSON.stringify(DEFAULT_RECIPE), "legacy", 4700);
    expect(migrated.projects).toHaveLength(1);
    expect(migrated.activeProjectId).toBe("legacy");
    expect(migrated.projects[0].recipe.layers).toHaveLength(6);

    const preserved = migrateLegacyRecipe(JSON.stringify(migrated), JSON.stringify(createBlankRecipe()), "other", 4800);
    expect(preserved.projects).toHaveLength(1);
    expect(preserved.projects[0].id).toBe("legacy");
  });

  it("selects a safe fallback when the active project is deleted", () => {
    const first = createProject(DEFAULT_RECIPE, "first", 100);
    const second = createProject(createBlankRecipe(), "second", 200);
    const next = removeProject({ schemaVersion: 1, activeProjectId: "second", projects: [second, first] }, "second");
    expect(next.activeProjectId).toBe("first");
    expect(next.projects.map((project) => project.id)).toEqual(["first"]);
  });
});
