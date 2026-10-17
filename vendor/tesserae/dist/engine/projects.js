import { cloneRecipe, normalizeRecipe } from "../types.js";
export const PROJECT_LIBRARY_KEY = "tesserae.projects.v1";
export const LEGACY_PROJECT_LIBRARY_KEY = "tessera47.projects.v1";
export const LEGACY_RECIPE_KEY = "tessera47.recipe.v1";
export const EMPTY_PROJECT_LIBRARY = {
    schemaVersion: 1,
    activeProjectId: null,
    projects: [],
};
function normalizeProject(project) {
    const recipe = normalizeRecipe(project.recipe);
    return {
        id: String(project.id),
        name: project.name?.trim() || recipe.name || "Terrain sans titre",
        createdAt: Number(project.createdAt) || Date.now(),
        updatedAt: Number(project.updatedAt) || Number(project.createdAt) || Date.now(),
        recipe,
    };
}
export function parseProjectLibrary(raw) {
    if (!raw)
        return structuredClone(EMPTY_PROJECT_LIBRARY);
    try {
        const candidate = JSON.parse(raw);
        const projects = Array.isArray(candidate.projects)
            ? candidate.projects.map((project) => normalizeProject(project))
            : [];
        const requestedActive = typeof candidate.activeProjectId === "string" ? candidate.activeProjectId : null;
        return {
            schemaVersion: 1,
            activeProjectId: projects.some((project) => project.id === requestedActive)
                ? requestedActive
                : projects[0]?.id ?? null,
            projects: [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
        };
    }
    catch {
        return structuredClone(EMPTY_PROJECT_LIBRARY);
    }
}
export function createProject(recipe, id, timestamp = Date.now(), name = recipe.name) {
    const normalized = normalizeRecipe(recipe);
    normalized.name = name.trim() || "Terrain sans titre";
    return {
        id,
        name: normalized.name,
        createdAt: timestamp,
        updatedAt: timestamp,
        recipe: normalized,
    };
}
export function upsertProject(library, projectId, recipe, timestamp = Date.now()) {
    const existing = library.projects.find((project) => project.id === projectId);
    const project = createProject(recipe, projectId, timestamp);
    if (existing)
        project.createdAt = existing.createdAt;
    return {
        schemaVersion: 1,
        activeProjectId: projectId,
        projects: [project, ...library.projects.filter((item) => item.id !== projectId)]
            .sort((a, b) => b.updatedAt - a.updatedAt),
    };
}
export function removeProject(library, projectId) {
    const projects = library.projects.filter((project) => project.id !== projectId);
    return {
        ...library,
        activeProjectId: library.activeProjectId === projectId ? projects[0]?.id ?? null : library.activeProjectId,
        projects,
    };
}
export function migrateLegacyRecipe(libraryRaw, legacyRaw, legacyId = "legacy-project", timestamp = Date.now()) {
    const library = parseProjectLibrary(libraryRaw);
    if (library.projects.length > 0 || !legacyRaw)
        return library;
    try {
        const recipe = normalizeRecipe(JSON.parse(legacyRaw));
        const project = createProject(recipe, legacyId, timestamp);
        return { schemaVersion: 1, activeProjectId: project.id, projects: [project] };
    }
    catch {
        return library;
    }
}
export function cloneProjectRecipe(project) {
    return cloneRecipe(project.recipe);
}
