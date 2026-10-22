/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button (top left).
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: window.SKI_TITLE,
  cols: ['Teddy (left)', 'Tommy (right)'],
  keys: [
    ['steer left / right', 'A D', '← →'],
    ['tuck down low: faster!', 'hold S', 'hold ↓'],
    ['jump · a trick in the air', 'W or Space', '↑ or Enter'],
    ['call your brother · high five', 'T', 'T'],
    ['pick a slope', 'A D', '← →'],
    ['level 🐣 / 🔥', 'W S', '↑ ↓'],
    ['who skis', '1 2 3', '1 2 3'],
    ['time trial or race', 'R', 'R'],
    ['ski! · again', 'Enter or Space', 'Enter or Space'],
    ['pause', 'P or Esc', 'P or Esc'],
    ['sound on / off', 'M', 'M'],
  ],
  note: 'Ski between the two flags of every gate. A missed gate adds seconds to your time. Do a trick on a ramp and land it for a speed boost. In 1 player both sets of keys work and T calls your brother for a speed tuck; with 2 players, T is a high five.',
  touch: 'Hold ◀ ▶ to steer, hold ⬇ to tuck, tap ⬆ to jump. Tap your brother\'s face to call him.',
  button: { top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 'max(10px, env(safe-area-inset-left, 0px))' },
});
// The language button goes right under the ? button, and the kit's speaker under that: a column in the top left corner,
// away from the steering and jump buttons at the bottom.
Kit.lang.setup({ button: { top: 'calc(env(safe-area-inset-top, 0px) + 58px)', left: 'max(10px, env(safe-area-inset-left, 0px))' } });
