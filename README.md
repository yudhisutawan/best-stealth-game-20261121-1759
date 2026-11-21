[![best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/c/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/yudhisutawan/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/c/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/yudhisutawan/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/c/best-stealth-game-20261121-1759)

# Shadow Vault — a quiet heist

A complete top-down stealth game that plays offline in a desktop browser from its own files.
You are a thief in a museum after dark. Sneak past patrolling guards, stay out of their torch
cones, hide in shadows and bushes, steal every relic, and slip out the exit unseen.

## How to play

- **WASD / arrow keys** — move
- **SHIFT** — sneak (slower, quieter, harder to spot)
- **P / Esc** — pause · **M** — mute · **R** — restart the wing
- Guards patrol with vision cones. The eye meter fills while you are seen; at full it
  triggers the **alarm** and every guard chases you. Break line of sight and hide until
  the alarm stands down.
- Running near a guard is heard even out of sight. Crates block a guard's view; shadows
  and bushes hide you unless a guard gets very close.
- Collect all relics to unlock the exit. Finish a wing without ever raising the alarm for
  a **Ghost bonus**. Three wings: The Marble Gallery, The Vault Floor, The Rooftop Garden.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request, no files outside `game/`. All sounds are synthesised
with WebAudio.

## Entry

Built for [best-stealth-game-20261121-1759](https://make.fun/c/best-stealth-game-20261121-1759)
on make.fun. `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are real renders of the game's own code, staged through
`?shot=start|play|alarm|win&seed=1` in `game/src/shots.js`.

## License

MIT — see [LICENSE](LICENSE).
