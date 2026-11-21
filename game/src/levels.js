// The three levels of Shadow Vault. Each map is 32 tiles wide and 18 tall, one character a tile:
//   '#' wall (blocks movement and sight)   '.' open floor
//   'C' crate (cover: blocks movement and sight)
//   'B' bush (walkable; hides the player like a shadow)
//   'S' shadow patch (walkable dark floor; hides the player)
//   'R' relic to steal   'E' exit   'P' where the player starts
// Guard patrols are waypoint lists in tile coordinates; the loader checks every waypoint and
// every straight leg between two waypoints is walkable, so a patrol never walks through a wall.
import { TILE } from './config.js';

const LEVELS = [
  {
    name: 'The Marble Gallery',
    subtitle: 'Three guards. Three relics. Slip past them all.',
    par: 75,
    map: [
      '################################',
      '#P......#.......#.......#..R...#',
      '#.......#.......#.......#......#',
      '#..C....#.......#...C...#......#',
      '#.......#...S...#.......#..S...#',
      '#.......#...............#......#',
      '#..S....#.......#.......#......#',
      '#.......#...C...#.......#..C...#',
      '#.......#...R...#.......#......#',
      '#.......#.......#...C...#......#',
      '#....C..#.......#.......#......#',
      '#.......#.......#.......#..S...#',
      '#...............#.......#......#',
      '#.......#.......#..............#',
      '#..R....#.......#.......#..C...#',
      '#.......#.......#...S...#..S...#',
      '#.......#.......#.......#....E.#',
      '################################',
    ],
    guards: [
      { waypoints: [[2, 2], [6, 2], [6, 9], [2, 9]] },
      { waypoints: [[10, 3], [14, 3], [14, 13], [10, 13]] },
      { waypoints: [[18, 4], [22, 4], [22, 14], [18, 14]] },
    ],
  },
  {
    name: 'The Vault Floor',
    subtitle: 'Four guards, tighter halls. The vault keeps its gold.',
    par: 90,
    map: [
      '################################',
      '#P.....C......S.......R........#',
      '#.........#...........C........#',
      '#.........#..............C.....#',
      '#....S....#....................#',
      '#...........................S..#',
      '#####.####################.#####',
      '#.............C.......S........#',
      '#..........C..............C....#',
      '#..S...........R.........S.....#',
      '#........C............C........#',
      '#..C........S.................R#',
      '###############.############.###',
      '#...S................#.........#',
      '#.......C............#.....R...#',
      '#............S.......#.........#',
      '#.....C.............S.......E..#',
      '################################',
    ],
    guards: [
      { waypoints: [[3, 2], [8, 2], [8, 5], [3, 5]] },
      { waypoints: [[13, 3], [20, 3], [20, 1], [13, 1]] },
      { waypoints: [[16, 8], [24, 8], [24, 9], [16, 9]] },
      { waypoints: [[12, 14], [19, 14], [19, 16], [12, 16]] },
    ],
  },
  {
    name: 'The Rooftop Garden',
    subtitle: 'Five guards among the hedges. The last relics wait.',
    par: 105,
    map: [
      '################################',
      '#P...B.......C.......B.....R...#',
      '#..........B............C......#',
      '#..C.....B........B....C.......#',
      '#.......B......R.......B.......#',
      '#..B.......C.......B......C....#',
      '####.#########.##########.######',
      '#....B......C.......B..........#',
      '#.........B...C..........B.....#',
      '#.......B........R....B....C...#',
      '#.......B......C.......B.......#',
      '#..B.......C.......B......S....#',
      '######.##########.##########.###',
      '#....B......C.......B..........#',
      '#.......B........C......B......#',
      '#.......B......S.......B...C...#',
      '#....C.......B.......R.....E...#',
      '################################',
    ],
    guards: [
      { waypoints: [[2, 2], [9, 2], [9, 5], [2, 5]] },
      { waypoints: [[14, 2], [22, 2], [22, 5], [14, 5]] },
      { waypoints: [[3, 8], [11, 8], [11, 10], [3, 10]] },
      { waypoints: [[16, 8], [24, 8], [24, 11], [16, 11]] },
      { waypoints: [[13, 15], [20, 15], [20, 16], [13, 16]] },
    ],
  },
];

/** Parse one level's ASCII map into sets of tiles and the objects placed on them. */
export function parseLevel(index) {
  const def = LEVELS[index];
  const rows = def.map.map((row) => row.padEnd(32, '#').slice(0, 32));
  while (rows.length < 18) rows.push('#'.repeat(32));
  const walls = new Set();
  const crates = new Set();
  const shadows = new Set();
  const bushes = new Set();
  const relics = [];
  let exit = null;
  let playerStart = null;
  for (let y = 0; y < 18; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const ch = rows[y][x];
      const key = `${x},${y}`;
      if (ch === '#') walls.add(key);
      else if (ch === 'C') crates.add(key);
      else if (ch === 'S') shadows.add(key);
      else if (ch === 'B') {
        shadows.add(key);
        bushes.add(key);
      } else if (ch === 'R') relics.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, taken: false });
      else if (ch === 'E') exit = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
      else if (ch === 'P') playerStart = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    }
  }
  const guards = def.guards.map((g) => ({
    waypoints: g.waypoints.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })),
  }));
  return {
    index,
    name: def.name,
    subtitle: def.subtitle,
    par: def.par,
    walls,
    crates,
    shadows,
    bushes,
    relics,
    exit,
    playerStart,
    guards,
  };
}

export const LEVEL_COUNT = LEVELS.length;

/** A tile is walkable when it is inside the map and holds no wall or crate. */
export function isWalkableTile(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= 32 || ty >= 18) return false;
  const key = `${tx},${ty}`;
  return !level.walls.has(key) && !level.crates.has(key);
}

/** True when the tile at pixel (x, y) is a shadow or a bush. */
export function isShadowAt(level, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return level.shadows.has(`${tx},${ty}`);
}
