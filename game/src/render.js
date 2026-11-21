// Everything on screen: the level, the guards and their vision cones, the player, the HUD
// (level, relics, timer, detection meter, minimap) and every menu screen. The canvas is a fixed
// 1280x720 logical area scaled to the window; nothing here reads input or changes the world.
import { FIELD, FONT, GUARD, PALETTE, PLAYER, TILE } from './config.js';
import { rayDistance } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_DONE = 'level-done';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_GAME_DONE = 'game-done';

const CONE_RAYS = 22;

function coneColour(guard, alarm) {
  if (alarm || guard.state === 'chase') return { fill: PALETTE.coneAlarm, edge: 'rgba(255, 93, 93, 0.7)' };
  if (guard.state === 'suspicious') return { fill: PALETTE.coneSuspicious, edge: 'rgba(242, 140, 60, 0.6)' };
  return { fill: PALETTE.coneCalm, edge: PALETTE.coneCalmEdge };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }

  function drawFloor(level) {
    for (let ty = 0; ty < 18; ty += 1) {
      for (let tx = 0; tx < 32; tx += 1) {
        const key = `${tx},${ty}`;
        if (level.walls.has(key)) continue;
        ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // Carpet runners down the middle of each gallery, for a museum feel.
    ctx.fillStyle = PALETTE.carpet;
    for (const [x, y, w, h] of [[320, 0, 8, 720], [640, 0, 8, 720], [960, 0, 8, 720]]) {
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = PALETTE.carpetEdge;
    for (const [x, y, w, h] of [[318, 0, 2, 720], [330, 0, 2, 720], [638, 0, 2, 720], [650, 0, 2, 720], [958, 0, 2, 720], [970, 0, 2, 720]]) {
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawShadows(level) {
    for (const key of level.shadows) {
      const [tx, ty] = key.split(',').map(Number);
      const x = tx * TILE;
      const y = ty * TILE;
      if (level.bushes.has(key)) {
        ctx.fillStyle = PALETTE.bush;
        ctx.beginPath();
        ctx.arc(x + 12, y + 14, 13, 0, Math.PI * 2);
        ctx.arc(x + 27, y + 12, 14, 0, Math.PI * 2);
        ctx.arc(x + 20, y + 27, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.bushLight;
        ctx.beginPath();
        ctx.arc(x + 12, y + 12, 5, 0, Math.PI * 2);
        ctx.arc(x + 27, y + 10, 6, 0, Math.PI * 2);
        ctx.arc(x + 20, y + 25, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.shadow;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = PALETTE.shadowEdge;
        ctx.setLineDash([4, 5]);
        ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
        ctx.setLineDash([]);
      }
    }
  }

  function drawWalls(level) {
    for (const key of level.walls) {
      const [tx, ty] = key.split(',').map(Number);
      const x = tx * TILE;
      const y = ty * TILE;
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(x, y, TILE, 5);
      ctx.strokeStyle = PALETTE.wallEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }

  function drawCrates(level) {
    for (const key of level.crates) {
      const [tx, ty] = key.split(',').map(Number);
      const x = tx * TILE + 3;
      const y = ty * TILE + 3;
      const s = TILE - 6;
      ctx.fillStyle = PALETTE.crate;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = PALETTE.crateDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.crateEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
  }

  function drawRelics(level, time) {
    for (const relic of level.relics) {
      if (relic.taken) continue;
      const pulse = 1 + Math.sin(time * 3 + relic.x) * 0.12;
      const glow = ctx.createRadialGradient(relic.x, relic.y, 2, relic.x, relic.y, 34 * pulse);
      glow.addColorStop(0, PALETTE.relicGlow);
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(relic.x, relic.y, 34 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(relic.x, relic.y);
      ctx.rotate(Math.PI / 4 + Math.sin(time * 1.5 + relic.y) * 0.08);
      ctx.fillStyle = PALETTE.relic;
      const s = 11 * pulse;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(-s, -s, s, s);
      ctx.restore();
    }
  }

  function drawExit(level, open, time) {
    const { x, y } = level.exit;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, open ? 60 + Math.sin(time * 4) * 8 : 34);
    glow.addColorStop(0, open ? PALETTE.exitGlow : 'rgba(201, 79, 79, 0.25)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, open ? 60 : 34, 0, Math.PI * 2);
    ctx.fill();
    // The doorway: two posts and a lintel, like a museum's service door.
    ctx.fillStyle = open ? PALETTE.exitOpen : PALETTE.exitLocked;
    ctx.fillRect(x - 18, y - 18, 6, 36);
    ctx.fillRect(x + 12, y - 18, 6, 36);
    ctx.fillRect(x - 18, y - 18, 36, 6);
    if (!open) {
      ctx.strokeStyle = PALETTE.exitLocked;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 10);
      ctx.lineTo(x + 14, y + 10);
      ctx.moveTo(x + 14, y - 10);
      ctx.lineTo(x - 14, y + 10);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#0b0e16';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('EXIT', x, y + 2);
    }
  }

  function drawCone(level, guard, alarm) {
    const colours = coneColour(guard, alarm);
    const half = GUARD.viewHalfAngle;
    const points = [];
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = guard.facing - half + (2 * half * i) / CONE_RAYS;
      const dist = rayDistance(level, guard.x, guard.y, angle, GUARD.viewRange);
      points.push([guard.x + Math.cos(angle) * dist, guard.y + Math.sin(angle) * dist]);
    }
    const grad = ctx.createRadialGradient(guard.x, guard.y, 8, guard.x, guard.y, GUARD.viewRange);
    grad.addColorStop(0, colours.fill);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    for (const [px, py] of points) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colours.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    for (const [px, py] of points) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.stroke();
  }

  function drawGuard(guard, alarm, time) {
    const bob = guard.moving ? Math.sin(guard.walkCycle) * 2 : 0;
    // Shadow under the guard.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(guard.x, guard.y + 12, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body: a red uniform with a dark belt, facing where it looks.
    ctx.fillStyle = PALETTE.guard;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y + bob * 0.3, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.guardDark;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Visor: the direction it faces, so the cone's source is readable.
    const vx = Math.cos(guard.facing);
    const vy = Math.sin(guard.facing);
    ctx.fillStyle = '#2b0d0b';
    ctx.beginPath();
    ctx.arc(guard.x + vx * 7, guard.y + vy * 7, 5, 0, Math.PI * 2);
    ctx.fill();
    // Torch dot at the cone's root.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(guard.x + vx * 15, guard.y + vy * 15, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // "?" when suspicious, "!" when chasing: the guard's state, at a glance.
    if (guard.state === 'suspicious' || guard.state === 'chase') {
      const mark = guard.state === 'chase' ? '!' : '?';
      const pulse = guard.state === 'chase' ? 1 + Math.sin(time * 8) * 0.15 : 1;
      ctx.font = `bold ${Math.round(22 * pulse)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = guard.state === 'chase' ? '#ff5d5d' : '#f28c3c';
      ctx.fillText(mark, guard.x, guard.y - 20);
    }
    void alarm;
  }

  function drawPlayer(player, time) {
    const bob = player.moving ? Math.sin(player.walkCycle) * 1.5 : 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 12, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const r = player.sneaking ? PLAYER.radius - 2 : PLAYER.radius;
    // Cloak.
    ctx.fillStyle = PALETTE.playerCloak;
    ctx.beginPath();
    ctx.arc(player.x, player.y + bob * 0.3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hood, turned toward where the player moves.
    const hx = Math.cos(player.facing) * 4;
    const hy = Math.sin(player.facing) * 4;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(player.x + hx, player.y + hy + bob * 0.3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0e16';
    ctx.beginPath();
    ctx.arc(player.x + hx * 1.6, player.y + hy * 1.6 + bob * 0.3, 3, 0, Math.PI * 2);
    ctx.fill();
    if (player.sneaking) {
      ctx.strokeStyle = 'rgba(125, 215, 255, 0.55)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawHud(state) {
    const level = state.level;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 46.5);
    ctx.lineTo(FIELD.width, 46.5);
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`LEVEL ${state.levelIndex + 1} — ${level.name}`, 14, 24);
    // Relics.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(`◆ ${state.relicsTaken} / ${state.relicsTotal}`, 640, 24);
    // Timer.
    const mins = Math.floor(state.levelTime / 60);
    const secs = Math.floor(state.levelTime % 60);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, 780, 24);
    // Detection meter: an eye and a bar that fills as a guard notices you.
    const mx = 880;
    ctx.fillStyle = state.detection > 66 ? PALETTE.danger : state.detection > 33 ? '#f2c94c' : PALETTE.ok;
    ctx.beginPath();
    ctx.ellipse(mx, 23, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0e16';
    ctx.beginPath();
    ctx.arc(mx, 23, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(mx + 18, 15, 150, 16);
    const frac = state.detection / 100;
    ctx.fillStyle = state.detection > 66 ? PALETTE.danger : state.detection > 33 ? '#f2c94c' : PALETTE.ok;
    ctx.fillRect(mx + 18, 15, 150 * frac, 16);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(mx + 18.5, 15.5, 150, 16);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(state.alarm ? 'SPOTTED!' : state.detection > 55 ? 'SUSPICIOUS' : state.detection > 1 ? 'SEEN' : 'HIDDEN', mx + 176, 24);
    // Ghost badge: still unseen this level.
    if (!state.everAlarmedLevel) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('GHOST', FIELD.width - 14, 24);
    }
    // Alarm banner.
    if (state.alarm) {
      const flash = 0.55 + Math.sin(state.time * 9) * 0.25;
      ctx.fillStyle = `rgba(180, 20, 20, ${flash})`;
      ctx.fillRect(0, 46, FIELD.width, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('⚠  ALARM — BREAK LINE OF SIGHT AND HIDE  ⚠', FIELD.width / 2, 62);
    }
  }

  function drawMinimap(state) {
    const w = 208;
    const h = 117;
    const x0 = FIELD.width - w - 12;
    const y0 = FIELD.height - h - 12;
    const sx = w / FIELD.width;
    const sy = h / FIELD.height;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const level = state.level;
    ctx.fillStyle = '#2a3040';
    for (let ty = 0; ty < 18; ty += 1) {
      for (let tx = 0; tx < 32; tx += 1) {
        if (level.walls.has(`${tx},${ty}`)) continue;
        ctx.fillRect(x0 + tx * TILE * sx, y0 + ty * TILE * sy, TILE * sx + 0.5, TILE * sy + 0.5);
      }
    }
    for (const relic of level.relics) {
      if (relic.taken) continue;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x0 + relic.x * sx, y0 + relic.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = state.relicsTaken >= state.relicsTotal ? PALETTE.exitOpen : PALETTE.exitLocked;
    ctx.fillRect(x0 + level.exit.x * sx - 3, y0 + level.exit.y * sy - 3, 6, 6);
    for (const guard of state.guards) {
      ctx.fillStyle = '#ff5d5d';
      ctx.beginPath();
      ctx.arc(x0 + guard.x * sx, y0 + guard.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawVignette(alarm, time) {
    const grad = ctx.createRadialGradient(640, 360, 260, 640, 360, 720);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, alarm ? `rgba(160, 10, 10, ${0.35 + Math.sin(time * 6) * 0.12})` : 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function overlayBox(title, lines, accent) {
    ctx.fillStyle = 'rgba(5, 8, 16, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 218);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 292 + i * 32));
  }

  function draw(state, screen, best, extras = {}) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const level = state.level;
    const time = state.time;
    drawFloor(level);
    drawShadows(level);
    drawExit(level, state.relicsTaken >= state.relicsTotal, time);
    drawRelics(level, time);
    drawCrates(level);
    drawWalls(level);
    for (const guard of state.guards) drawCone(level, guard, state.alarm);
    for (const guard of state.guards) drawGuard(guard, state.alarm, time);
    drawPlayer(state.player, time);
    drawVignette(state.alarm, time);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(state);
      drawMinimap(state);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('WASD / arrows move · SHIFT sneak · P pause · M mute', 14, FIELD.height - 12);
    }
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(5, 8, 16, 0.66)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 76px ${FONT}`;
      ctx.fillText('SHADOW VAULT', FIELD.width / 2, 190);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `22px ${FONT}`;
      ctx.fillText('Steal every relic. Reach the exit unseen.', FIELD.width / 2, 252);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `17px ${FONT}`;
      ctx.fillText('Guards patrol with torches — stay out of their cones, hide in shadows and bushes,', FIELD.width / 2, 316);
      ctx.fillText('creep past crates, and never let the meter fill. Three wings. One quiet thief.', FIELD.width / 2, 342);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText('WASD / ARROWS — move      SHIFT — sneak      P — pause      M — mute', FIELD.width / 2, 408);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('PRESS SPACE OR CLICK TO BEGIN', FIELD.width / 2, 470);
      if (best > 0) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `15px ${FONT}`;
        ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 516);
      }
    } else if (screen === SCREEN_PAUSED) {
      overlayBox('PAUSED', ['The guards wait. Take a breath.', 'P or SPACE — keep sneaking    R — restart this wing'], PALETTE.text);
    } else if (screen === SCREEN_LEVEL_DONE) {
      const breakdown = extras.breakdown || { relics: 0, timeBonus: 0, ghost: 0, levelScore: 0 };
      overlayBox(`${level.name.toUpperCase()} — CLEARED`, [
        `Relics  ${breakdown.relics}  ·  Time bonus  ${breakdown.timeBonus}  ·  Ghost bonus  ${breakdown.ghost}`,
        `Wing score: ${breakdown.levelScore}      Total: ${state.score}`,
        '',
        'SPACE or CLICK — next wing',
      ], PALETTE.exitOpen);
    } else if (screen === SCREEN_CAUGHT) {
      overlayBox('CAUGHT!', [
        'A guard grabbed you in the light. The vault keeps its secrets — this time.',
        `Score so far: ${state.score}`,
        '',
        'R or CLICK — try this wing again',
      ], PALETTE.danger);
    } else if (screen === SCREEN_GAME_DONE) {
      const rank = extras.rank || 'Quiet Thief';
      overlayBox('THE VAULT IS YOURS', [
        `Every relic stolen, every wing crossed unseen enough.`,
        `Final score: ${state.score}      Rank: ${rank}`,
        best > 0 ? `Best score: ${best}` : '',
        '',
        'SPACE or CLICK — play again',
      ], PALETTE.gold);
    }
  }

  return { draw, resize };
}
