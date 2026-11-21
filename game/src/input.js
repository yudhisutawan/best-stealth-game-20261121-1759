// Keyboard and mouse input: WASD/arrows to move, Shift to sneak, P/Esc to pause, M to mute,
// Space/Enter/click to confirm, R to restart a wing. The game reads it once a frame.
export const ACTION_CONFIRM = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_MUTE = 1 << 2;
export const ACTION_RESTART = 1 << 3;

const KEY_DIRS = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;

  function onKeyDown(event) {
    if (event.code in KEY_DIRS) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      held.add(event.code);
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onPointerDown(event) {
    event.preventDefault();
    actions |= ACTION_CONFIRM;
  }

  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);

  return {
    /** The movement vector this frame, from the keys held down. */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const dir = KEY_DIRS[code];
        if (!dir) continue;
        x += dir[0];
        y += dir[1];
      }
      return { x, y };
    },
    sneak() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** The one-shot actions pressed since the last call, then cleared. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
