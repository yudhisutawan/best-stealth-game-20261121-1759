// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One map tile, in pixels. Maps are 32 tiles wide and 18 tall. */
export const TILE = 40;

export const PLAYER = {
  radius: 13,
  walkSpeed: 165,
  sneakSpeed: 92,
  /** Seconds a guard needs, at point blank, to fill the detection meter. */
  catchRadius: 26,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 62,
  chaseSpeed: 132,
  investigateSpeed: 95,
  /** How far a guard can see, in pixels. */
  viewRange: 205,
  /** Half of the vision cone's angle, in radians. */
  viewHalfAngle: 0.61,
  /** Seconds a guard waits at each patrol waypoint, looking around. */
  pauseAtWaypoint: 1.4,
  /** Detection (0-100) at which a guard leaves patrol to investigate. */
  suspectAt: 55,
  /** Detection at which the alarm goes off. */
  alarmAt: 100,
  /** Detection gained per second while the player is seen at point blank. */
  detectRate: 62,
  /** Detection lost per second while the player is unseen. */
  decayRate: 26,
  /** Inside a shadow the player must be this close to be seen at all. */
  shadowRevealRange: 78,
  /** A running (non-sneaking) player this close is heard even out of sight. */
  hearRange: 150,
  hearRate: 14,
};

export const GAME = {
  /** Seconds without seeing the player before the alarm stands down. */
  alarmCooldown: 4,
  /** Points per relic, and the ghost bonus for a level finished without any alarm. */
  relicPoints: 500,
  ghostBonus: 1000,
  /** Time-bonus par per level, in seconds. */
  parSeconds: 75,
  timeBonusPerSecond: 10,
};

export const PALETTE = {
  backdrop: '#0b0e16',
  floorA: '#232838',
  floorB: '#1e2331',
  carpet: '#3a2b33',
  carpetEdge: '#57404a',
  wall: '#12141f',
  wallTop: '#3d4459',
  wallEdge: '#05060a',
  crate: '#6b4a2b',
  crateDark: '#4e3319',
  crateEdge: '#8a6136',
  bush: '#1d3a24',
  bushLight: '#2c5233',
  shadow: 'rgba(4, 8, 24, 0.55)',
  shadowEdge: 'rgba(120, 150, 255, 0.16)',
  relic: '#f2c94c',
  relicGlow: 'rgba(242, 201, 76, 0.35)',
  exitLocked: '#c94f4f',
  exitOpen: '#58d68d',
  exitGlow: 'rgba(88, 214, 141, 0.30)',
  player: '#7dd7ff',
  playerCloak: '#16283e',
  guard: '#e5534b',
  guardDark: '#8e2f2a',
  coneCalm: 'rgba(242, 201, 76, 0.20)',
  coneCalmEdge: 'rgba(242, 201, 76, 0.45)',
  coneSuspicious: 'rgba(242, 140, 60, 0.30)',
  coneAlarm: 'rgba(229, 83, 75, 0.34)',
  panel: 'rgba(10, 13, 22, 0.82)',
  panelEdge: '#39415a',
  text: '#eef1f5',
  muted: '#9aa3b5',
  gold: '#f2c94c',
  danger: '#ff5d5d',
  ok: '#58d68d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-vault.best';
