import { hash } from "./noise.js";
export function createLabGrid(preset, seed, size = 9) {
    const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    const last = size - 1;
    const margin = 1;
    if (preset === "ring") {
        for (let y = margin; y < last; y += 1) {
            for (let x = margin; x < last; x += 1) {
                const border = x <= 2 || x >= last - 2 || y <= 2 || y >= last - 2;
                grid[y][x] = border;
            }
        }
        const innerStart = 3;
        const innerEnd = last - 3;
        grid[innerStart][innerStart] = true;
        grid[innerStart][innerEnd] = true;
        grid[innerEnd][innerStart] = true;
        grid[innerEnd][innerEnd] = true;
    }
    else if (preset === "u") {
        for (let y = margin; y < last; y += 1) {
            for (let x = margin; x < last; x += 1) {
                grid[y][x] = x <= 2 || x >= last - 2 || y >= last - 2;
            }
        }
    }
    else if (preset === "c") {
        for (let y = margin; y < last; y += 1) {
            for (let x = margin; x < last; x += 1) {
                grid[y][x] = x <= 2 || y <= 2 || y >= last - 2;
            }
        }
    }
    else if (preset === "maze") {
        for (let y = margin; y < last; y += 1) {
            for (let x = margin; x < last; x += 1) {
                const rail = x % 2 === 1 || y % 3 === 1;
                const carve = (x + y + seed) % 5 === 0;
                grid[y][x] = rail && !carve;
            }
        }
    }
    else {
        for (let y = margin; y < last; y += 1) {
            for (let x = margin; x < last; x += 1) {
                const value = hash(seed + x * 41 + y * 97);
                grid[y][x] = value > 0.46;
            }
        }
        grid[Math.floor(size / 2)][Math.floor(size / 2)] = true;
    }
    return grid;
}
export function automaticInteriorWallCells(grid, projection = "S") {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    const exterior = new Set();
    const queue = [];
    const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height || grid[y]?.[x])
            return;
        const key = `${x},${y}`;
        if (exterior.has(key))
            return;
        exterior.add(key);
        queue.push([x, y]);
    };
    for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
    }
    for (let index = 0; index < queue.length; index += 1) {
        const [x, y] = queue[index];
        enqueue(x - 1, y);
        enqueue(x + 1, y);
        enqueue(x, y - 1);
        enqueue(x, y + 1);
    }
    const inner = new Set();
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            if (!grid[y][x])
                continue;
            if (neighbours.some(([dx, dy]) => {
                const nx = x + dx;
                const ny = y + dy;
                return nx >= 0 && ny >= 0 && nx < width && ny < height && !grid[ny][nx] && !exterior.has(`${nx},${ny}`);
            }))
                inner.add(`${x},${y}`);
        }
    // Transparent Blob47 wall-top art can place the authored lower alpha edge
    // in the filled cell immediately upstream from the semantic cavity edge.
    // Include that source cell so the visible contour, not the logical cell
    // ownership, decides where the projected wall begins.
    const upstream = projection === "N" ? [0, 1] : projection === "E" ? [-1, 0] : projection === "W" ? [1, 0] : [0, -1];
    const tangent = projection === "N" || projection === "S" ? [1, 0] : [0, 1];
    for (const key of [...inner]) {
        const [x, y] = key.split(",").map(Number);
        const sourceX = x + upstream[0];
        const sourceY = y + upstream[1];
        if (!grid[sourceY]?.[sourceX])
            continue;
        inner.add(`${sourceX},${sourceY}`);
        // A Blob47 override can draw one continuous contour across several
        // logical source cells. Once that upstream contour is known to belong to
        // an enclosed cavity, keep its whole connected tangent run together so
        // the material cannot stop halfway between two authored corners.
        for (const sign of [-1, 1]) {
            let runX = sourceX + tangent[0] * sign;
            let runY = sourceY + tangent[1] * sign;
            while (grid[runY]?.[runX]) {
                inner.add(`${runX},${runY}`);
                runX += tangent[0] * sign;
                runY += tangent[1] * sign;
            }
        }
    }
    return inner;
}
