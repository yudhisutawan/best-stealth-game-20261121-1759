// The simulation: one fixed-step update of the player, the guards and the level state.
// The world never touches the DOM; the renderer paints the state it returns.
import { FIELD, GUARD, GAME, PLAYER, TILE } from './config.js';
import { isShadowAt, isWalkableTile, parseLevel } from './levels.js';

export const EVENT_NONE = 0;
export const EVENT_RELIC = 1 << 0;
export const EVENT_SPOTTED = 1 << 1;
export const EVENT_ALARM = 1 << 2;
export const EVENT_ALARM_END = 1 << 3;
export const EVENT_CAUGHT = 1 << 4;
export const EVENT_LEVEL_DONE = 1 << 5;
export const EVENT_GAME_DONE = 1 << 6;

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_CHASE = 'chase';

/** Segment (x1,y1)-(x2,y2) against an axis-aligned rectangle; true when they touch. */
function segmentHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < rx || x1 > rx + rw) return false;
  } else {
    let t1 = (rx - x1) / dx;
    let t2 = (rx + rw - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < ry || y1 > ry + rh) return false;
  } else {
    let t1 = (ry - y1) / dy;
    let t2 = (ry + rh - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** True when nothing solid stands between the two points. Crates block sight like walls. */
export function hasLineOfSight(level, x1, y1, x2, y2) {
  const minTx = Math.floor(Math.min(x1, x2) / TILE);
  const maxTx = Math.floor(Math.max(x1, x2) / TILE);
  const minTy = Math.floor(Math.min(y1, y2) / TILE);
  const maxTy = Math.floor(Math.max(y1, y2) / TILE);
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const key = `${tx},${ty}`;
      if (level.walls.has(key) || level.crates.has(key)) {
        if (segmentHitsRect(x1, y1, x2, y2, tx * TILE, ty * TILE, TILE, TILE)) return false;
      }
    }
  }
  return true;
}

/** Move a circle against walls and crates, sliding along them, axis by axis. */
function moveCircle(level, body, dx, dy) {
  const r = body.radius;
  let nx = body.x + dx;
  if (!circleHitsSolid(level, nx, body.y, r)) body.x = nx;
  let ny = body.y + dy;
  if (!circleHitsSolid(level, body.x, ny, r)) body.y = ny;
}

function circleHitsSolid(level, x, y, r) {
  const minTx = Math.floor((x - r) / TILE);
  const maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE);
  const maxTy = Math.floor((y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const key = `${tx},${ty}`;
      if (!level.walls.has(key) && !level.crates.has(key)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  return false;
}

/** How far a ray from (x, y) in direction `angle` travels before hitting a wall or crate. */
export function rayDistance(level, x, y, angle, maxDist) {
  const step = 6;
  const dx = Math.cos(angle) * step;
  const dy = Math.sin(angle) * step;
  let px = x;
  let py = y;
  for (let d = 0; d < maxDist; d += step) {
    px += dx;
    py += dy;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (level.walls.has(`${tx},${ty}`) || level.crates.has(`${tx},${ty}`)) return d;
  }
  return maxDist;
}

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function createGuard(def, index) {
  const start = def.waypoints[0];
  return {
    index,
    x: start.x,
    y: start.y,
    radius: GUARD.radius,
    facing: 0,
    waypointIndex: 1,
    pauseLeft: 0,
    scanPhase: 0,
    state: GUARD_PATROL,
    awareness: 0,
    lastSeenX: start.x,
    lastSeenY: start.y,
    investigateLeft: 0,
    walkCycle: 0,
    moving: false,
  };
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: null,
    player: null,
    guards: [],
    score: 0,
    levelScore: 0,
    levelTime: 0,
    relicsTaken: 0,
    relicsTotal: 0,
    alarm: false,
    alarmUnseenFor: 0,
    everAlarmed: false,
    everAlarmedLevel: false,
    caught: false,
    levelDone: false,
    gameDone: false,
    detection: 0,
    time: 0,
    random,
  };

  function loadLevel(index) {
    const level = parseLevel(index);
    state.levelIndex = index;
    state.level = level;
    state.player = {
      x: level.playerStart.x,
      y: level.playerStart.y,
      radius: PLAYER.radius,
      facing: 0,
      sneaking: false,
      moving: false,
      walkCycle: 0,
      inShadow: false,
    };
    state.guards = level.guards.map((def, i) => createGuard(def, i));
    state.relicsTaken = 0;
    state.relicsTotal = level.relics.length;
    state.levelTime = 0;
    state.levelScore = 0;
    state.alarm = false;
    state.alarmUnseenFor = 0;
    state.everAlarmedLevel = false;
    state.caught = false;
    state.levelDone = false;
    state.detection = 0;
  }

  function reset() {
    state.score = 0;
    state.everAlarmed = false;
    state.gameDone = false;
    loadLevel(0);
  }

  /** Finish the level: time bonus, ghost bonus, then on to the next level (or the end). */
  function finishLevel() {
    const timeBonus = Math.max(0, Math.round((state.level.par - state.levelTime) * GAME.timeBonusPerSecond));
    const ghost = state.everAlarmedLevel ? 0 : GAME.ghostBonus;
    state.levelScore = state.relicsTaken * GAME.relicPoints + timeBonus + ghost;
    state.score += state.levelScore;
    state.levelDone = true;
    if (state.levelIndex + 1 >= 3) {
      state.gameDone = true;
      return EVENT_GAME_DONE;
    }
    return EVENT_LEVEL_DONE;
  }

  function nextLevel() {
    loadLevel(state.levelIndex + 1);
  }

  /**
   * One fixed step. `move` is {x, y} in [-1, 1] (already normalised) and `sneak` says the
   * player is creeping. Returns a bitmask of EVENT_* flags for this step.
   */
  function step(dt, move, sneak) {
    if (state.caught || state.levelDone) return EVENT_NONE;
    let events = EVENT_NONE;
    const level = state.level;
    const player = state.player;
    state.time += dt;
    state.levelTime += dt;

    // --- player ---
    const speed = sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    const moving = move.x !== 0 || move.y !== 0;
    player.moving = moving;
    player.sneaking = sneak && moving;
    if (moving) {
      const len = Math.hypot(move.x, move.y) || 1;
      const nx = (move.x / len) * speed * dt;
      const ny = (move.y / len) * speed * dt;
      moveCircle(level, player, nx, ny);
      player.facing = Math.atan2(move.y, move.x);
      player.walkCycle += dt * (sneak ? 6 : 11);
    }
    player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x));
    player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y));
    player.inShadow = isShadowAt(level, player.x, player.y);

    // --- relics ---
    for (const relic of level.relics) {
      if (relic.taken) continue;
      const dx = player.x - relic.x;
      const dy = player.y - relic.y;
      if (dx * dx + dy * dy < 30 * 30) {
        relic.taken = true;
        state.relicsTaken += 1;
        events |= EVENT_RELIC;
      }
    }

    // --- guards: sight, suspicion, movement ---
    let anyoneSees = false;
    let maxAwareness = 0;
    for (const guard of state.guards) {
      const dx = player.x - guard.x;
      const dy = player.y - guard.y;
      const dist = Math.hypot(dx, dy);
      const angleToPlayer = Math.atan2(dy, dx);
      const inCone = Math.abs(angleDifference(angleToPlayer, guard.facing)) < GUARD.viewHalfAngle;
      let sees = false;
      if (dist < GUARD.viewRange && inCone && hasLineOfSight(level, guard.x, guard.y, player.x, player.y)) {
        if (!player.inShadow || dist < GUARD.shadowRevealRange) sees = true;
      }
      if (sees) {
        anyoneSees = true;
        const closeness = 1 - (dist / GUARD.viewRange) * 0.65;
        let rate = GUARD.detectRate * closeness;
        if (player.sneaking) rate *= 0.5;
        if (player.inShadow) rate *= 0.5;
        guard.awareness = Math.min(100, guard.awareness + rate * dt);
        guard.lastSeenX = player.x;
        guard.lastSeenY = player.y;
      } else {
        // Loud footsteps give the player away even out of sight.
        if (moving && !sneak && dist < GUARD.hearRange && hasLineOfSight(level, guard.x, guard.y, player.x, player.y)) {
          guard.awareness = Math.min(100, guard.awareness + GUARD.hearRate * dt);
          guard.lastSeenX = player.x;
          guard.lastSeenY = player.y;
        } else {
          guard.awareness = Math.max(0, guard.awareness - GUARD.decayRate * dt);
        }
      }
      if (guard.awareness > maxAwareness) maxAwareness = guard.awareness;

      // State changes.
      if (guard.awareness >= GUARD.alarmAt && !state.alarm) {
        state.alarm = true;
        state.alarmUnseenFor = 0;
        state.everAlarmed = true;
        state.everAlarmedLevel = true;
        for (const g of state.guards) {
          g.state = GUARD_CHASE;
          g.lastSeenX = player.x;
          g.lastSeenY = player.y;
        }
        events |= EVENT_ALARM;
      } else if (guard.awareness >= GUARD.suspectAt && guard.state === GUARD_PATROL) {
        guard.state = GUARD_SUSPICIOUS;
        guard.investigateLeft = 3;
        events |= EVENT_SPOTTED;
      }

      // Movement by state.
      guard.moving = false;
      if (guard.state === GUARD_PATROL) {
        const target = level.guards[guard.index].waypoints[guard.waypointIndex];
        if (guard.pauseLeft > 0) {
          guard.pauseLeft -= dt;
          guard.scanPhase += dt;
          guard.facing += Math.sin(guard.scanPhase * 1.6) * 0.9 * dt;
        } else {
          const tdx = target.x - guard.x;
          const tdy = target.y - guard.y;
          const tdist = Math.hypot(tdx, tdy);
          if (tdist < 6) {
            guard.waypointIndex = (guard.waypointIndex + 1) % level.guards[guard.index].waypoints.length;
            guard.pauseLeft = GUARD.pauseAtWaypoint;
            guard.scanPhase = 0;
          } else {
            const want = Math.atan2(tdy, tdx);
            guard.facing = turnToward(guard.facing, want, 5 * dt);
            moveCircle(level, guard, (tdx / tdist) * GUARD.patrolSpeed * dt, (tdy / tdist) * GUARD.patrolSpeed * dt);
            guard.moving = true;
            guard.walkCycle += dt * 7;
          }
        }
      } else if (guard.state === GUARD_SUSPICIOUS) {
        const tdx = guard.lastSeenX - guard.x;
        const tdy = guard.lastSeenY - guard.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist > 10) {
          const want = Math.atan2(tdy, tdx);
          guard.facing = turnToward(guard.facing, want, 6 * dt);
          moveCircle(level, guard, (tdx / tdist) * GUARD.investigateSpeed * dt, (tdy / tdist) * GUARD.investigateSpeed * dt);
          guard.moving = true;
          guard.walkCycle += dt * 9;
        } else {
          guard.investigateLeft -= dt;
          guard.scanPhase += dt;
          guard.facing += Math.sin(guard.scanPhase * 2.2) * 1.4 * dt;
          if (guard.investigateLeft <= 0 && guard.awareness < GUARD.suspectAt) {
            guard.state = GUARD_PATROL;
            guard.scanPhase = 0;
          }
        }
      } else if (guard.state === GUARD_CHASE) {
        if (sees) {
          guard.lastSeenX = player.x;
          guard.lastSeenY = player.y;
        }
        const tdx = guard.lastSeenX - guard.x;
        const tdy = guard.lastSeenY - guard.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist > 8) {
          const want = Math.atan2(tdy, tdx);
          guard.facing = turnToward(guard.facing, want, 8 * dt);
          moveCircle(level, guard, (tdx / tdist) * GUARD.chaseSpeed * dt, (tdy / tdist) * GUARD.chaseSpeed * dt);
          guard.moving = true;
          guard.walkCycle += dt * 12;
        }
      }

      // Caught?
      const cdx = player.x - guard.x;
      const cdy = player.y - guard.y;
      if (cdx * cdx + cdy * cdy < PLAYER.catchRadius * PLAYER.catchRadius) {
        state.caught = true;
        return EVENT_CAUGHT;
      }
    }
    state.detection = maxAwareness;

    // --- alarm stands down once the player stays unseen a while ---
    if (state.alarm) {
      if (anyoneSees) state.alarmUnseenFor = 0;
      else state.alarmUnseenFor += dt;
      if (state.alarmUnseenFor >= GAME.alarmCooldown) {
        state.alarm = false;
        for (const guard of state.guards) {
          guard.state = guard.awareness >= GUARD.suspectAt ? GUARD_SUSPICIOUS : GUARD_PATROL;
          if (guard.state === GUARD_SUSPICIOUS) guard.investigateLeft = 2;
        }
        events |= EVENT_ALARM_END;
      }
    }

    // --- exit ---
    const exit = level.exit;
    const edx = player.x - exit.x;
    const edy = player.y - exit.y;
    if (state.relicsTaken >= state.relicsTotal && edx * edx + edy * edy < 32 * 32) {
      return finishLevel() | events;
    }
    return events;
  }

  function turnToward(angle, target, maxStep) {
    const d = angleDifference(target, angle);
    if (Math.abs(d) <= maxStep) return target;
    return angle + Math.sign(d) * maxStep;
  }

  reset();
  return { state, reset, step, nextLevel, loadLevel };
}
