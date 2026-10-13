export const COLS = 31;
export const ROWS = 25;
export const TILE = 52;
export const DIRECTIONS = {
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  right: { x: 1, y: 0, angle: 0 },
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
};
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const keyOf = (x, y) => `${x},${y}`;

export function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function roadAt(grid, x, y) { return grid[y]?.[x] === 0; }
export function exits(grid, x, y) {
  return Object.keys(DIRECTIONS).filter(dir => roadAt(grid, x + DIRECTIONS[dir].x, y + DIRECTIONS[dir].y));
}

export function distanceMap(grid, origin, blocked = new Set()) {
  const dist = new Map([[keyOf(origin.x, origin.y), 0]]);
  const queue = [origin];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const d of Object.values(DIRECTIONS)) {
      const x = p.x + d.x, y = p.y + d.y, key = keyOf(x, y);
      if (!roadAt(grid, x, y) || blocked.has(key) || dist.has(key)) continue;
      dist.set(key, dist.get(keyOf(p.x, p.y)) + 1);
      queue.push({ x, y });
    }
  }
  return dist;
}

export function createWorld(round = 1) {
  const random = randomGenerator(8274 + round * 901);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  const spawn = { x: 1, y: 1 };
  const stack = [{ ...spawn }];
  grid[1][1] = 0;
  while (stack.length) {
    const here = stack[stack.length - 1];
    const choices = Object.values(DIRECTIONS).filter(d => {
      const x = here.x + d.x * 2, y = here.y + d.y * 2;
      return x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && grid[y][x] === 1;
    });
    if (!choices.length) { stack.pop(); continue; }
    const d = choices[Math.floor(random() * choices.length)];
    grid[here.y + d.y][here.x + d.x] = 0;
    const next = { x: here.x + d.x * 2, y: here.y + d.y * 2 };
    grid[next.y][next.x] = 0;
    stack.push(next);
  }
  // Open loops so a pursuit always offers opportunities to change route.
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (grid[y][x] && (x % 2 !== y % 2) && random() < .37) grid[y][x] = 0;
  }
  for (let x = 1; x <= 7; x++) grid[1][x] = 0;
  const roads = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (!grid[y][x]) roads.push({ x, y });
  }
  const distances = distanceMap(grid, spawn);
  const reserved = new Set([keyOf(1, 1)]);
  const obstacles = [];
  const candidates = [...roads];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // Place obstacles only where the remaining street network stays connected.
  for (const p of candidates) {
    if (obstacles.length >= 4 + Math.min(round - 1, 3)) break;
    if (distances.get(keyOf(p.x, p.y)) < 10 || exits(grid, p.x, p.y).length !== 2) continue;
    const blocked = new Set([...obstacles, p].map(p => keyOf(p.x, p.y)));
    if (distanceMap(grid, spawn, blocked).size === roads.length - blocked.size) {
      obstacles.push(p); reserved.add(keyOf(p.x, p.y));
    }
  }
  const flags = [];
  // Spatially spread flags over the entire map; start with one near the player.
  flags.push({ x: 7, y: 1, special: false, collected: false });
  reserved.add(keyOf(7, 1));
  for (let i = 1; i < 10; i++) {
    let best = null, bestScore = -1;
    for (const p of candidates) {
      if (reserved.has(keyOf(p.x, p.y)) || distances.get(keyOf(p.x, p.y)) < 7) continue;
      const spread = Math.min(...flags.map(f => Math.abs(f.x - p.x) + Math.abs(f.y - p.y)));
      const score = spread + random() * 2;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    flags.push({ ...best, special: i === 3, collected: false });
    reserved.add(keyOf(best.x, best.y));
  }
  const fuels = [];
  for (const p of candidates) {
    if (fuels.length === 4) break;
    if (reserved.has(keyOf(p.x, p.y)) || distances.get(keyOf(p.x, p.y)) < 12) continue;
    if (fuels.some(f => Math.abs(f.x - p.x) + Math.abs(f.y - p.y) < 9)) continue;
    fuels.push({ ...p, collected: false });
    reserved.add(keyOf(p.x, p.y));
  }
  const enemySpawns = candidates.filter(p => distances.get(keyOf(p.x, p.y)) > 30 && !reserved.has(keyOf(p.x, p.y)))
    .filter(p => p.x > COLS / 2 || p.y > ROWS / 2).slice(0, Math.min(3 + Math.floor((round - 1) / 2), 6));
  return { grid, spawn, roads, flags, fuels, obstacles, enemySpawns, random };
}

export function createActor(x, y, dir = 'right') {
  return { x, y, fromX: x, fromY: y, toX: x, toY: y, progress: 0, moving: false, dir, angle: DIRECTIONS[dir].angle };
}

export function reverseActor(actor) {
  if (!actor.moving) return;
  [actor.fromX, actor.toX] = [actor.toX, actor.fromX];
  [actor.fromY, actor.toY] = [actor.toY, actor.fromY];
  actor.progress = 1 - actor.progress;
  actor.dir = OPPOSITE[actor.dir];
}

export function moveActor(actor, speed, dt, grid, chooseDirection) {
  let remaining = speed * dt;
  let guard = 0;
  while (remaining > 0 && guard++ < 20) {
    if (!actor.moving) {
      const dir = chooseDirection(actor);
      if (!dir) break;
      const d = DIRECTIONS[dir];
      if (!roadAt(grid, actor.fromX + d.x, actor.fromY + d.y)) break;
      actor.dir = dir;
      actor.toX = actor.fromX + d.x;
      actor.toY = actor.fromY + d.y;
      actor.progress = 0;
      actor.moving = true;
    }
    const step = Math.min(remaining, 1 - actor.progress);
    actor.progress += step;
    remaining -= step;
    actor.x = actor.fromX + (actor.toX - actor.fromX) * actor.progress;
    actor.y = actor.fromY + (actor.toY - actor.fromY) * actor.progress;
    if (actor.progress >= 1 - 1e-8) {
      actor.fromX = actor.toX; actor.fromY = actor.toY;
      actor.x = actor.fromX; actor.y = actor.fromY;
      actor.progress = 0; actor.moving = false;
    }
  }
}
