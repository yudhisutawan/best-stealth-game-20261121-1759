// The screenshot scenes behind ?shot=start|play|alarm|win. Each scene is a real game state:
// the world is loaded, the rules are stepped forward (guards patrol, detection builds, relics
// are collected by a cautious autopilot), and the renderer paints exactly what a player would
// see. The same seed always gives the same frame.
import { GUARD, STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_GAME_DONE, EVENT_LEVEL_DONE, hasLineOfSight } from './world.js';
import { isShadowAt } from './levels.js';
import { SCREEN_CAUGHT, SCREEN_GAME_DONE, SCREEN_LEVEL_DONE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 18;
const ALARM_LIMIT_SECONDS = 6;

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Would any guard see a player standing at (x, y) right now? */
function visibleToAnyGuard(state, x, y) {
  const level = state.level;
  const inShadow = isShadowAt(level, x, y);
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= GUARD.viewRange) continue;
    if (Math.abs(angleDifference(Math.atan2(dy, dx), guard.facing)) >= GUARD.viewHalfAngle) continue;
    if (!hasLineOfSight(level, guard.x, guard.y, x, y)) continue;
    if (inShadow && dist >= GUARD.shadowRevealRange) continue;
    return true;
  }
  return false;
}

/** Would any guard be close enough to grab a player standing at (x, y)? */
function tooCloseToAnyGuard(state, x, y) {
  for (const guard of state.guards) {
    if (Math.hypot(guard.x - x, guard.y - y) < 78) return true;
  }
  return false;
}

/**
 * A cautious thief: walk to the nearest relic, creep when a guard is near, and wait (or sidestep)
 * rather than cross a lit cone. Returns the move {x, y} and whether to sneak this step.
 */
function autopilot(state) {
  const player = state.player;
  let target = null;
  let bestDist = Infinity;
  for (const relic of state.level.relics) {
    if (relic.taken) continue;
    const d = Math.hypot(relic.x - player.x, relic.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      target = relic;
    }
  }
  if (!target) target = state.level.exit;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  const want = { x: dx / len, y: dy / len };
  const nearGuard = state.guards.some((g) => Math.hypot(g.x - player.x, g.y - player.y) < 280);
  const sneak = nearGuard || state.detection > 10;
  // Try the direct line, then sidesteps, then waiting: never step into a lit cone or
  // within arm's reach of a guard (a patrol walks into a thief standing in its lane).
  const candidates = [
    want,
    { x: want.x * 0.7 - want.y * 0.7, y: want.x * 0.7 + want.y * 0.7 },
    { x: want.x * 0.7 + want.y * 0.7, y: -want.x * 0.7 + want.y * 0.7 },
    { x: -want.y, y: want.x },
    { x: want.y, y: -want.x },
    { x: 0, y: 0 },
  ];
  for (const move of candidates) {
    const nx = player.x + move.x * 34;
    const ny = player.y + move.y * 34;
    if (move.x === 0 && move.y === 0) return { move, sneak: true };
    if (tooCloseToAnyGuard(state, nx, ny)) continue;
    if (!visibleToAnyGuard(state, nx, ny)) return { move, sneak };
  }
  return { move: { x: 0, y: 0 }, sneak: true };
}

/**
 * Set `world` to the named scene (start, play, alarm or win; any other name is start) and
 * return the screen to draw over it, the best score to show and the level breakdown for the
 * win screen.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'alarm' && name !== 'win') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false);
    return { screen: SCREEN_TITLE, best: 0, breakdown: null };
  }
  if (name === 'alarm') {
    // Keep the thief hovering just ahead of the nearest guard's torch, tracking it as it
    // patrols, until the meter fills and the alarm sounds; then run, so the frame shows the
    // chase and the banner, not the capture. All movement goes through the real step().
    const guard = state.guards[0];
    const fx0 = Math.cos(guard.facing);
    const fy0 = Math.sin(guard.facing);
    state.player.x = guard.x + fx0 * 120 - fy0 * 45;
    state.player.y = guard.y + fy0 * 120 + fx0 * 45;
    for (let i = 0; i < ALARM_LIMIT_SECONDS / STEP; i += 1) {
      const player = state.player;
      const fx = Math.cos(guard.facing);
      const fy = Math.sin(guard.facing);
      const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
      let move;
      if (dist < 60) {
        // Too close: back straight away from the guard.
        move = { x: (player.x - guard.x) / dist, y: (player.y - guard.y) / dist };
      } else {
        // The point just ahead of the torch, off to one side of the patrol lane.
        const tx = guard.x + fx * 120 - fy * 45;
        const ty = guard.y + fy * 120 + fx * 45;
        const dx = tx - player.x;
        const dy = ty - player.y;
        const len = Math.hypot(dx, dy) || 1;
        move = len > 12 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
      }
      const events = world.step(STEP, move, false);
      if (events & EVENT_CAUGHT) break;
      if (state.alarm) {
        for (let j = 0; j < 12; j += 1) {
          const gx = state.player.x - guard.x;
          const gy = state.player.y - guard.y;
          const glen = Math.hypot(gx, gy) || 1;
          const ev = world.step(STEP, { x: gx / glen, y: gy / glen }, false);
          if (ev & EVENT_CAUGHT) break;
        }
        break;
      }
    }
    return { screen: state.caught ? SCREEN_CAUGHT : SCREEN_PLAY, best: 0, breakdown: null };
  }
  if (name === 'win') {
    // The wing cleared: every relic in hand, the thief at the open exit, the rules finishing
    // the level as they would for a player who earned it.
    for (const relic of state.level.relics) relic.taken = true;
    state.relicsTaken = state.relicsTotal;
    state.player.x = state.level.exit.x;
    state.player.y = state.level.exit.y;
    for (let i = 0; i < 2 / STEP; i += 1) {
      const events = world.step(STEP, { x: 0, y: 0 }, false);
      if (events & (EVENT_LEVEL_DONE | EVENT_GAME_DONE)) break;
    }
    const breakdown = {
      relics: state.relicsTotal * 500,
      timeBonus: Math.max(0, Math.round((state.level.par - state.levelTime) * 10)),
      ghost: state.everAlarmedLevel ? 0 : 1000,
      levelScore: state.levelScore,
    };
    return { screen: SCREEN_LEVEL_DONE, best: state.score, breakdown };
  }
  // play: the autopilot steals for a while; the frame shows a real mid-game moment.
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    const { move, sneak } = autopilot(state);
    const events = world.step(STEP, move, sneak);
    if (events & EVENT_CAUGHT) break;
    if (events & (EVENT_LEVEL_DONE | EVENT_GAME_DONE)) break;
  }
  return { screen: SCREEN_PLAY, best: 0, breakdown: null };
}
