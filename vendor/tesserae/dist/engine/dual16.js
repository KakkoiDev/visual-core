export const DUAL_BIT = {
    NW: 1,
    NE: 2,
    SE: 4,
    SW: 8,
};
export function getDualMasks() {
    return Array.from({ length: 16 }, (_, mask) => mask);
}
export function dualMaskFromGrid(grid, vertexX, vertexY) {
    let mask = 0;
    if (grid[vertexY - 1]?.[vertexX - 1])
        mask |= DUAL_BIT.NW;
    if (grid[vertexY - 1]?.[vertexX])
        mask |= DUAL_BIT.NE;
    if (grid[vertexY]?.[vertexX])
        mask |= DUAL_BIT.SE;
    if (grid[vertexY]?.[vertexX - 1])
        mask |= DUAL_BIT.SW;
    return mask;
}
export function dualMaskLabel(mask, language = "en") {
    if (mask === 0)
        return language === "en" ? "Empty" : "Vide";
    if (mask === 15)
        return language === "en" ? "Full" : "Plein";
    const corners = ["NW", "NE", "SE", "SW"]
        .filter((corner) => (mask & DUAL_BIT[corner]) !== 0);
    if (corners.length === 1)
        return `${language === "en" ? "Corner" : "Coin"} ${corners[0]}`;
    if (corners.length === 2 && (mask === 5 || mask === 10))
        return language === "en" ? "Diagonal" : "Diagonale";
    if (corners.length === 3)
        return `${language === "en" ? "Notch" : "Creux"} ${["NW", "NE", "SE", "SW"].find((corner) => (mask & DUAL_BIT[corner]) === 0)}`;
    return `${language === "en" ? "Edge" : "Bord"} ${corners.join("·")}`;
}
export function compatibleDualHorizontal(first, second) {
    return Boolean(first & DUAL_BIT.NE) === Boolean(second & DUAL_BIT.NW)
        && Boolean(first & DUAL_BIT.SE) === Boolean(second & DUAL_BIT.SW);
}
export function compatibleDualVertical(first, second) {
    return Boolean(first & DUAL_BIT.SW) === Boolean(second & DUAL_BIT.NW)
        && Boolean(first & DUAL_BIT.SE) === Boolean(second & DUAL_BIT.NE);
}
