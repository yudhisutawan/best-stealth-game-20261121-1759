// A small seeded random number generator, so a seed always builds the same game.
export function createRandom(seed) {
  let state = seed >>> 0 || 1;
  function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }
  return {
    next,
    /** An integer from 0 up to (but not including) `max`. */
    int(max) {
      return Math.floor(next() * max);
    },
    /** A value in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}
