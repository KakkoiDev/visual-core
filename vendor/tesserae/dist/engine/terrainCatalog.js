export function buildTerrainCatalog(recipes) {
    const nodes = recipes.map((recipe) => ({ id: recipe.semantics.terrainId, name: recipe.name, topology: recipe.topology, tileSize: recipe.shape.tileSize, group: recipe.semantics.transitionGroup, priority: recipe.semantics.transitionPriority }));
    const edges = [];
    for (let first = 0; first < nodes.length; first += 1)
        for (let second = first + 1; second < nodes.length; second += 1) {
            const a = nodes[first];
            const b = nodes[second];
            const reason = a.topology !== b.topology ? "different-topology"
                : a.tileSize !== b.tileSize ? "different-tile-size"
                    : a.group !== b.group ? "different-group"
                        : "shared-contract";
            edges.push({ from: a.id, to: b.id, compatible: reason === "shared-contract", reason });
        }
    return { schemaVersion: 1, nodes, edges };
}
