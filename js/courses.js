/* TT Ski Downhill: the three slopes. Plain data and maths, no Three.js, so node can load it for the checks.
   A course runs downhill along s (metres from the start hut) with x across it (0 = the middle, fences at ±W/2).
   Each one is made from a seed, so it is the same course every time:
     gates    slalom gates, red and blue in turn, swinging left and right
     jumps    snow ramps (跳台) in the middle of the run
     moguls   fields of snow bumps that bounce you
     snowmen  friendly snowmen off the racing line (bonk!)
   SKI.courses.ground(c, s, x) is how high the snow is over the flat slope there (bumps and ramps), for the
   skiers and the snow mesh alike. */
(function () {
  'use strict';
  const SKI = (window.SKI = window.SKI || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFS = [
    { id: 'bunny', name: 'BUNNY HILL', emoji: '🐰', tile: '#8fd8ff', L: 480, W: 26, gap: 34, amp: 3.4, gw: 7.5, jumps: [215], moguls: [], snowmen: 3, seed: 11,
      sky: ['#5fb4ff', '#d8f0ff'], sun: '#fff4c8', trees: 0.8 },
    { id: 'forest', name: 'PINE FOREST', emoji: '🌲', tile: '#7ed99a', L: 640, W: 26, gap: 30, amp: 4.8, gw: 6.6, jumps: [200, 470], moguls: [[300, 380]], snowmen: 5, seed: 23,
      sky: ['#4f9cf0', '#e6f4ff'], sun: '#fff1b0', trees: 1.3 },
    { id: 'mountain', name: 'BIG MOUNTAIN', emoji: '🏔️', tile: '#b9a6ff', L: 800, W: 28, gap: 27, amp: 6, gw: 5.8, jumps: [175, 430, 660], moguls: [[255, 335], [525, 605]], snowmen: 7, seed: 37,
      sky: ['#ff9a6b', '#ffe3c2'], sun: '#ffd27a', trees: 1.0 },
  ];
  const RAMP = { w: 9, len: 6, h: 1.3 };
  const GRADE = 0.21; // how steep the slope looks (the skiers' speed comes from js/ski.js, not from this)

  function build(d) {
    const r = rng(d.seed);
    const c = Object.assign({}, d, { gates: [], jumps: [], moguls: [], snowmen: [], ways: [] });
    const lim = d.W / 2 - d.gw / 2 - 1.2;
    const inJumpZone = (s, before, after) => d.jumps.some((j) => s > j - before && s < j + RAMP.len + after);
    // the gates: every `gap` metres, left then right, skipping the stretch round each jump
    let side = r() < 0.5 ? -1 : 1;
    for (let s = 46; s < d.L - 26; s += d.gap + (r() - 0.5) * 6) {
      if (inJumpZone(s, 20, 34)) continue;
      const x = Math.max(-lim, Math.min(lim, side * d.amp * (0.75 + r() * 0.4)));
      c.gates.push({ s: Math.round(s * 10) / 10, x: Math.round(x * 100) / 100, w: d.gw });
      side = -side;
    }
    c.gates.forEach((g, i) => { g.i = i; g.color = i % 2 ? 'blue' : 'red'; });
    for (const s of d.jumps) c.jumps.push({ s, x: 0, w: RAMP.w, len: RAMP.len, h: RAMP.h });
    // mogul fields: rows of bumps across the whole width, every other row shifted
    for (const [a, b] of d.moguls) {
      let row = 0;
      for (let s = a; s <= b; s += 4.6, row++) {
        for (let x = -d.W / 2 + 2 + (row % 2) * 2.1; x < d.W / 2 - 1.5; x += 4.2) {
          c.moguls.push({ s: s + (r() - 0.5) * 0.8, x: x + (r() - 0.5) * 0.8, r: 1.7, h: 0.38 + r() * 0.14 });
        }
      }
    }
    c.moguls.sort((m, n) => m.s - n.s);
    // the aiming points, in order: gates and ramps (what a good skier heads for)
    c.ways = c.gates.map((g) => ({ s: g.s, x: g.x, w: g.w, kind: 'gate', gate: g.i }))
      .concat(c.jumps.map((j) => ({ s: j.s + j.len, x: j.x, w: j.w, kind: 'jump' })))
      .sort((m, n) => m.s - n.s);
    // snowmen: well away from the line between the aiming points, from the gates and from the ramps
    for (let tries = 0; c.snowmen.length < d.snowmen && tries < 400; tries++) {
      const s = 70 + r() * (d.L - 120);
      if (inJumpZone(s, 16, 30)) continue;
      if (c.gates.some((g) => Math.abs(g.s - s) < 9)) continue;
      if (c.snowmen.some((m) => Math.abs(m.s - s) < 30)) continue;
      const lx = lineX(c, s);
      const x = lx > 0 ? lx - 6 - r() * 3 : lx + 6 + r() * 3;
      if (Math.abs(x) > d.W / 2 - 2.2) continue;
      c.snowmen.push({ s, x, r: 0.9 });
    }
    c.snowmen.sort((m, n) => m.s - n.s);
    c.mogulR = 1.7;
    return c;
  }

  // the straight line between the aiming points, at s
  function lineX(c, s) {
    const w = c.ways;
    if (!w.length || s <= w[0].s) return w.length ? w[0].x * Math.max(0, s / w[0].s) : 0;
    for (let i = 1; i < w.length; i++) {
      if (s <= w[i].s) return w[i - 1].x + (w[i].x - w[i - 1].x) * (s - w[i - 1].s) / (w[i].s - w[i - 1].s);
    }
    return w[w.length - 1].x;
  }

  // the first mogul that could reach s (they are sorted by s)
  function firstMogul(c, s) {
    let lo = 0, hi = c.moguls.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c.moguls[mid].s < s - c.mogulR) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // the snow's height over the flat slope at (s, x), and the ramp the point is on, if any
  const out = { g: 0, ramp: null, mogul: false };
  function ground(c, s, x) {
    out.g = 0;
    out.ramp = null;
    out.mogul = false;
    for (const j of c.jumps) {
      if (s >= j.s && s <= j.s + j.len && Math.abs(x - j.x) <= j.w / 2) {
        out.g = j.h * (s - j.s) / j.len;
        out.ramp = j;
        return out;
      }
    }
    for (let i = firstMogul(c, s); i < c.moguls.length; i++) {
      const m = c.moguls[i];
      if (m.s > s + m.r) break;
      const u2 = ((s - m.s) * (s - m.s) + (x - m.x) * (x - m.x)) / (m.r * m.r);
      if (u2 < 1) {
        out.g += m.h * (1 - u2) * (1 - u2);
        out.mogul = true;
      }
    }
    return out;
  }

  // the flat slope's height: steady down to the finish, then gentler for the run-out
  function baseY(c, s) {
    return s <= c.L ? -GRADE * s : -GRADE * c.L - GRADE * 0.35 * (s - c.L);
  }

  const list = DEFS.map(build);
  SKI.courses = { list, get: (id) => list.find((c) => c.id === id) || list[0], build, ground, baseY, lineX, rng, RAMP, GRADE };
})();
