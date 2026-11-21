// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, wing cleared, caught and game done.
//
// ?seed=N fixes the guard patrol timing. ?shot=start|play|alarm|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, GAME, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM, EVENT_ALARM_END, EVENT_CAUGHT, EVENT_GAME_DONE, EVENT_LEVEL_DONE, EVENT_RELIC, EVENT_SPOTTED } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_GAME_DONE, SCREEN_LEVEL_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function rankFor(score, ghost) {
  if (ghost && score >= 6000) return 'Ghost Legend';
  if (score >= 6000) return 'Master Thief';
  if (score >= 4000) return 'Shadow Pro';
  if (score >= 2500) return 'Quiet Thief';
  return 'Sneaky Beginner';
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { breakdown: scene.breakdown });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let breakdown = null;
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.ensure();
    audio.click();
    world.reset();
    accumulator = 0;
    breakdown = null;
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.level.name}. Steal ${world.state.level.relics.length} relics and reach the exit unseen.`);
  }

  function nextLevel() {
    audio.ensure();
    audio.click();
    world.nextLevel();
    accumulator = 0;
    breakdown = null;
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.level.name}.`);
  }

  function retryLevel() {
    audio.ensure();
    audio.click();
    world.loadLevel(world.state.levelIndex);
    accumulator = 0;
    breakdown = null;
    screen = SCREEN_PLAY;
    announce(`Retrying ${world.state.level.name}.`);
  }

  function endLevel(events) {
    const state = world.state;
    const timeBonus = Math.max(0, Math.round((state.level.par - state.levelTime) * GAME.timeBonusPerSecond));
    breakdown = {
      relics: state.relicsTaken * GAME.relicPoints,
      timeBonus,
      ghost: state.everAlarmedLevel ? 0 : GAME.ghostBonus,
      levelScore: state.levelScore,
    };
    audio.alarmStop();
    if (events & EVENT_GAME_DONE) {
      audio.gameDone();
      if (state.score > best) {
        best = state.score;
        saveBest(best);
      }
      screen = SCREEN_GAME_DONE;
      announce(`The vault is yours. Final score ${state.score}.`);
    } else {
      audio.levelDone();
      screen = SCREEN_LEVEL_DONE;
      announce(`${state.level.name} cleared. Wing score ${state.levelScore}. Total ${state.score}.`);
    }
  }

  function endCaught() {
    audio.alarmStop();
    audio.caught();
    screen = SCREEN_CAUGHT;
    announce(`Caught. Score so far ${world.state.score}. Press R to retry.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CAUGHT)) {
      retryLevel();
      return;
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_LEVEL_DONE) nextLevel();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_CAUGHT) retryLevel();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_GAME_DONE) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.alarmStop();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false);
      return;
    }
    const events = world.step(STEP, input.direction(), input.sneak());
    stepCount += 1;
    // Footsteps: the player's own scuff, and a nearby guard's boots, panned by screen position.
    const player = world.state.player;
    if (player.moving && stepCount % (player.sneaking ? 26 : 15) === 0) {
      audio.footstep(player.sneaking, (player.x - 640) / 640);
    }
    if (stepCount % 20 === 0) {
      for (const guard of world.state.guards) {
        if (!guard.moving) continue;
        const dist = Math.hypot(guard.x - player.x, guard.y - player.y);
        if (dist < 420) audio.guardStep(dist, (guard.x - 640) / 640);
      }
    }
    if (events & EVENT_RELIC) {
      audio.pickup();
      announce(`Relic ${world.state.relicsTaken} of ${world.state.relicsTotal}. ${world.state.relicsTaken >= world.state.relicsTotal ? 'The exit is open.' : ''}`);
    }
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('A guard is suspicious.');
    }
    if (events & EVENT_ALARM) {
      audio.alarmStart();
      announce('Alarm! Break line of sight and hide.');
    }
    if (events & EVENT_ALARM_END) {
      audio.alarmStop();
      announce('The alarm stands down. They lost you.');
    }
    if (events & EVENT_CAUGHT) endCaught();
    else if (events & (EVENT_LEVEL_DONE | EVENT_GAME_DONE)) endLevel(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const extras = { breakdown, rank: rankFor(world.state.score, !world.state.everAlarmed) };
    renderer.draw(world.state, screen, best, extras);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.alarmStop();
      announce('Paused.');
    }
  });

  announce('Shadow Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
