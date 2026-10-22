/* TT Ski Downhill: the race itself, with no drawing, so the page and node (the checks) run the very same rules.
   SKI.race.create({ course, players: [{ who, level, pilot? }], cpu, seed, tweak }) makes a race; step(dt) moves it.
   Everything moves in fixed 1/120 s steps, so a race comes out the same at any frame rate.

   The rules:
     - 3, 2, 1, GO: the clock starts at 0 on GO, and nobody moves before it.
     - Steer with -1..1 (hold to turn, let go to ski straight down); hold tuck to go faster but turn less.
       On EASY a little steering help points you at the next gate whenever you're not steering.
     - Gates: you pass a gate if you go between its poles (EASY also counts up to 1.5 m outside them).
       Each gate is judged once, when you cross it. A missed gate adds a penalty: +1 s on EASY, +3 s on NORMAL.
     - Your time is the moment you cross the finish line (worked out inside the step), plus the penalties.
       Fastest time wins; places go by that time.
     - Ramps throw you in the air; press jump in the air for a trick, and land it for a speed boost.
       Jump on the snow is a little hop (over moguls). The fences and snowmen bonk you and slow you down.
   Nothing ever stops a skier for good: the slope keeps everyone sliding to the finish. */
(function () {
  'use strict';
  const SKI = (window.SKI = window.SKI || {});
  const C = () => SKI.courses;

  const H = 1 / 120;
  const LEVELS = {
    easy: { vTop: 15, vTuck: 19, accel: 7, yawMax: 0.85, turn: 2.6, assist: 0.5, tol: 1.5, penalty: 1, mogulDrag: 1.2 },
    normal: { vTop: 19, vTuck: 25, accel: 8.5, yawMax: 0.95, turn: 3.2, assist: 0, tol: 0, penalty: 3, mogulDrag: 2.2 },
  };
  const PHYS = { grav: 18, countIn: 3, cap: 240, hop: 5.2, fenceIn: 0.7, minV: 4, brake: 9, trickTime: 0.45, boost: 1.4, tuckBoost: 5 };
  const CPUS = {
    foxy: { id: 'foxy', name: 'FOXY', emoji: '🦊', mult: { easy: 0.86, normal: 0.955 }, wobble: 0.6 },
    froggy: { id: 'froggy', name: 'FROGGY', emoji: '🐸', mult: { easy: 0.83, normal: 0.94 }, wobble: 0.9 },
  };
  const NAMES = { teddy: 'TEDDY', tommy: 'TOMMY' };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- aiming: where the next gate (or ramp) is
  function nextWay(c, sk) {
    for (const w of c.ways) if (w.s > sk.s + 0.5) return w;
    return null;
  }
  // the heading that points at x = tx on the line s = ts
  function yawTo(sk, tx, ts) {
    return Math.atan2(tx - sk.x, Math.max(3, ts - sk.s));
  }
  // where a good skier aims inside a gate: a little toward the gate after it, never near the poles
  function aimX(c, w, inset) {
    if (!w) return 0;
    const i = c.ways.indexOf(w), after = c.ways[i + 1];
    const room = Math.max(0, w.w / 2 - (inset || 1.2));
    return w.x + clamp(after ? (after.x - w.x) * 0.12 : 0, -room, room);
  }

  // ---------------------------------------------------------------- pretend players, for the checks and the demo
  const PILOTS = {
    // does nothing at all (on EASY the steering help still works)
    idle() { return () => {}; },
    // a careful 8-year-old: aims well, tucks on the straight bits and does tricks
    good() {
      return (race, sk) => {
        const c = race.course;
        let w = nextWay(c, sk);
        // nearly there and lined up inside it: start turning for the one after
        if (w && w.s - sk.s < sk.v * 0.3) {
          const px = sk.x + Math.tan(sk.yaw) * (w.s - sk.s);
          const after = c.ways[c.ways.indexOf(w) + 1];
          if (after && Math.abs(px - w.x) < w.w / 2 - 0.9) w = after;
        }
        const want = w ? yawTo(sk, aimX(c, w), w.s) : yawTo(sk, clamp(sk.x, -3, 3), sk.s + 20);
        const tuck = Math.abs(want) < 0.12 && Math.abs(sk.yaw) < 0.15;
        const ym = sk.L.yawMax * (tuck ? 0.72 : 1);
        sk.input.steer = clamp(want / ym, -1, 1) || 1e-9;
        sk.input.tuck = tuck;
        if (sk.air && !sk.trick && sk.hr - sk.g > 0.7) sk.input.jump = true;
      };
    },
    // a wobbly 5-year-old: full left or right in fits and starts, often not steering, sometimes the wrong way
    kid(rand) {
      let t = 0, steer = 0, tuck = false;
      return (race, sk, h) => {
        t -= h;
        if (t <= 0) {
          t = 0.22 + rand() * 0.3;
          const w = nextWay(race.course, sk);
          const want = w ? yawTo(sk, w.x, w.s) : 0;
          const roll = rand();
          if (roll < 0.3) steer = 0;
          else if (roll < 0.38) steer = -Math.sign(want) || 1;
          else steer = Math.abs(want - sk.yaw) > 0.12 ? Math.sign(want - sk.yaw) : 0;
          tuck = rand() < 0.2;
        }
        sk.input.steer = steer;
        sk.input.tuck = tuck;
        if (sk.air && rand() < 0.01) sk.input.jump = true;
      };
    },
    // mashing random keys
    wild(rand) {
      let t = 0, steer = 0, tuck = false;
      return (race, sk, h) => {
        t -= h;
        if (t <= 0) {
          t = 0.15 + rand() * 1.1;
          steer = [-1, 0, 1][Math.floor(rand() * 3)];
          tuck = rand() < 0.4;
          if (rand() < 0.3) sk.input.jump = true;
        }
        sk.input.steer = steer;
        sk.input.tuck = tuck;
      };
    },
    // good, except it skis round the outside of gate number `skip`
    dodge(rand, skip) {
      const good = PILOTS.good();
      return (race, sk, h) => {
        good(race, sk, h);
        const c = race.course, w = nextWay(c, sk);
        if (w && w.kind === 'gate' && w.gate === skip) {
          const out = w.x + (w.x >= 0 ? -1 : 1) * (w.w / 2 + sk.L.tol + 3.5);
          sk.input.steer = clamp(yawTo(sk, out, w.s) / sk.L.yawMax, -1, 1) || 1e-9;
          sk.input.tuck = false;
        }
      };
    },
  };

  // the CPU skiers: aim like a good skier, a bit off the best line, at their own pace
  function cpuPilot(rand, who) {
    let off = 0, t = 0;
    return (race, sk, h) => {
      t -= h;
      const c = race.course, w = nextWay(c, sk);
      if (t <= 0) { t = 0.8 + rand(); off = (rand() - 0.5) * who.wobble; }
      const want = w ? yawTo(sk, aimX(c, w, 1.6) + off, w.s) : yawTo(sk, clamp(sk.x, -4, 4), sk.s + 20);
      const tuck = race.level === 'normal' && Math.abs(want) < 0.1 && Math.abs(sk.yaw) < 0.12;
      sk.input.steer = clamp(want / (sk.L.yawMax * (tuck ? 0.72 : 1)), -1, 1) || 1e-9;
      sk.input.tuck = tuck;
      if (sk.air && !sk.trick && sk.hr - sk.g > 0.8 && rand() < 0.05) sk.input.jump = true;
    };
  }

  // ---------------------------------------------------------------- a race
  function create(o) {
    const tweak = o.tweak || null;
    const course = tweak === 'gap' ? gapCourse(o.course) : o.course;
    const rand = C().rng(o.seed || 1);
    const humans = o.players.map((p) => Object.assign({ level: 'easy' }, p));
    const level = humans.some((p) => p.level === 'easy') ? 'easy' : 'normal'; // the CPUs' level
    const list = humans.map((p) => ({ id: p.who, name: NAMES[p.who] || p.who.toUpperCase(), human: true, level: p.level, pilot: p.pilot, skip: p.skip }));
    if (o.cpu) for (const id of ['foxy', 'froggy']) list.push({ id, name: CPUS[id].name, emoji: CPUS[id].emoji, human: false, level, cpu: CPUS[id] });
    const starts = list.length === 1 ? [0] : list.length === 2 ? [-2.2, 2.2] : list.length === 3 ? [0, -4, 4] : [-1.8, 1.8, -5.4, 5.4];
    const skiers = list.map((p, i) => {
      const sk = {
        i, id: p.id, name: p.name, emoji: p.emoji || null, human: p.human, level: p.level, L: LEVELS[p.level], cpu: p.cpu || null,
        s: 0, x: starts[i], yaw: 0, v: 0, hr: 0, vh: 0, g: 0, air: false, airT: 0, vhG: null, onRamp: null, tucking: false,
        boostT: 0, tuckBoostT: 0, bonkT: 0, trick: null, tricks: 0, gate: 0, gates: [], misses: 0, bonks: 0,
        finishT: null, finishN: null, final: null, place: null, input: { steer: 0, tuck: false, jump: false },
      };
      if (p.cpu) sk.pilotFn = cpuPilot(C().rng((o.seed || 1) * 31 + i * 7), p.cpu);
      else if (p.pilot) sk.pilotFn = typeof p.pilot === 'function' ? p.pilot : PILOTS[p.pilot](C().rng((o.seed || 1) * 17 + i * 5), p.skip);
      return sk;
    });
    const startN = Math.round(PHYS.countIn / H);
    const race = {
      course, skiers, level, tweak, rand, n: 0, startN, time: -PHYS.countIn, acc: 0, done: false, capped: false, events: [],
      step, input, jump, boost, tuckBoost, results, H,
    };

    function input(i, inp) {
      const sk = skiers[i];
      if (!sk || !sk.human || sk.pilotFn) return;
      if ('steer' in inp) sk.input.steer = clamp(inp.steer, -1, 1);
      if ('tuck' in inp) sk.input.tuck = !!inp.tuck;
    }
    function jump(i) {
      const sk = skiers[i];
      if (sk && race.time >= 0 && sk.finishT === null) sk.input.jump = true;
    }
    // a short burst of speed (high fives and landed tricks)
    function boost(i, secs) {
      const sk = skiers[i];
      if (sk) sk.boostT = Math.max(sk.boostT, secs);
    }
    // the brother's speed tuck: tucked down low and extra fast, with full steering
    function tuckBoost(i, secs) {
      const sk = skiers[i];
      if (sk) sk.tuckBoostT = Math.max(sk.tuckBoostT, secs || PHYS.tuckBoost);
    }

    function step(dt) {
      if (race.done) return race;
      race.acc += Math.max(0, dt);
      while (race.acc >= H - 1e-12 && !race.done) {
        race.acc -= H;
        sub();
      }
      if (tweak === 'coarse') {
        // broken on purpose: the finish is stamped at the end of the frame instead of inside the step
        for (const sk of skiers) if (sk.finishT !== null && !sk.coarse) { sk.coarse = true; sk.finishT = race.time; sk.final = finalOf(sk); }
      }
      return race;
    }

    function sub() {
      race.n++;
      const moving = race.n > startN;
      const tPrev = (race.n - 1 - startN) * H;
      race.time = (race.n - startN) * H;
      if (!moving) return;
      const lead = leader();
      for (const sk of skiers) {
        if (sk.finishT !== null) { coast(sk); continue; }
        if (sk.pilotFn) sk.pilotFn(race, sk, H);
        move(sk, tPrev, lead);
      }
      if (skiers.every((sk) => sk.finishT !== null)) finish();
      else if (race.time >= PHYS.cap) { race.capped = true; finish(); }
    }

    // the human in front, for the CPUs' pace and the brothers' catch-up
    function leader() {
      let best = null;
      for (const sk of skiers) if (sk.human && (!best || sk.s > best.s)) best = sk;
      return best;
    }

    function move(sk, tPrev, lead) {
      const L = sk.L, inp = sk.input;
      const tuck = sk.tuckBoostT > 0 || inp.tuck;
      sk.tucking = tuck;
      // steering: the stick sets the heading you want, and you swing toward it
      const ym = L.yawMax * (tuck && sk.tuckBoostT <= 0 ? 0.72 : 1);
      let target = clamp(inp.steer, -1, 1) * ym;
      if (inp.steer === 0 && L.assist > 0 && sk.human && !sk.air) {
        const w = nextWay(race.course, sk);
        target = w ? clamp(L.assist * yawTo(sk, w.x, w.s), -ym, ym) : 0;
      }
      const rate = L.turn * (sk.air ? 0.5 : 1) * (tuck && sk.tuckBoostT <= 0 ? 0.75 : 1);
      sk.yaw += clamp(target - sk.yaw, -rate * H, rate * H);
      // speed: the slope pulls you up to your top speed; turning hard bleeds a little
      let vt = tuck ? L.vTuck : L.vTop;
      if (sk.cpu) vt *= cpuPace(sk, lead);
      const turn = Math.abs(sk.yaw) / L.yawMax;
      vt *= 1 - 0.22 * turn * turn;
      if (sk.boostT > 0) vt *= 1.18;
      if (sk.tuckBoostT > 0) vt *= 1.15;
      if (sk.human && lead && lead !== sk && lead.s - sk.s > 8) vt *= 1.08; // brothers' catch-up (2 players)
      if (!sk.air) {
        if (sk.v < vt) sk.v = Math.min(vt, sk.v + L.accel * (tuck ? 1.15 : 1) * H);
        else sk.v = Math.max(vt, sk.v - 2.5 * H);
        if (sk.onMogul) sk.v -= L.mogulDrag * H * (sk.v / 15);
        sk.v = Math.max(sk.v, PHYS.minV);
      }
      sk.boostT = Math.max(0, sk.boostT - H);
      sk.tuckBoostT = Math.max(0, sk.tuckBoostT - H);
      sk.bonkT = Math.max(0, sk.bonkT - H);
      // slide
      const sPrev = sk.s, xPrev = sk.x;
      sk.s += sk.v * Math.cos(sk.yaw) * H;
      sk.x += sk.v * Math.sin(sk.yaw) * H;
      if (tweak === 'wall' && sk.s > race.course.L / 2) { sk.s = race.course.L / 2; sk.v = 0; }
      // the fences
      const lim = race.course.W / 2 - PHYS.fenceIn;
      if (Math.abs(sk.x) > lim) {
        sk.x = Math.sign(sk.x) * lim;
        sk.yaw = -sk.yaw * 0.3;
        if (sk.bonkT <= 0) bonk(sk, 0.72, 'fence');
      }
      // snowmen
      for (const m of race.course.snowmen) {
        if (m.s > sk.s + 2) break;
        if (sk.air && sk.hr - sk.g > 0.8) continue;
        const ds = sk.s - m.s, dx = sk.x - m.x, rr = m.r + 0.45;
        if (ds * ds + dx * dx < rr * rr && sk.bonkT <= 0) {
          bonk(sk, 0.55, 'snowman');
          sk.x = m.x + (dx >= 0 ? 1 : -1) * (rr + 0.05);
          sk.yaw *= 0.3;
        }
      }
      // up and down: follow the snow, fly off ramps and bumps, hop, tricks
      const gr = C().ground(race.course, sk.s, sk.x);
      const g = gr.g, ramp = gr.ramp;
      sk.onMogul = gr.mogul && !sk.air;
      sk.g = g;
      if (inp.jump) {
        inp.jump = false;
        if (!sk.air) { launch(sk, PHYS.hop); ev('hop', sk); }
        else if (!sk.trick && sk.hr - g > 0.4) { sk.trick = { t: 0 }; ev('trick', sk); }
      }
      if (!sk.air) {
        const vhG = (g - sk.hr) / H;
        if (sk.onRamp && !ramp) {
          // off the end of a ramp (or off its side)
          const lip = sk.s >= sk.onRamp.s + sk.onRamp.len;
          launch(sk, lip ? sk.v * (sk.onRamp.h / sk.onRamp.len) * 1.7 + 2.2 : 0);
          if (lip) ev('jump', sk);
        } else if (sk.vhG !== null && vhG < sk.vhG - PHYS.grav * H * 1.2 && sk.vhG > -1) {
          launch(sk, Math.max(0, sk.vhG)); // the snow drops away faster than you fall: a little float off a bump
        } else {
          sk.hr = g;
          sk.vhG = vhG;
        }
        sk.onRamp = ramp;
      }
      if (sk.air) {
        sk.hr += sk.vh * H;
        sk.vh -= PHYS.grav * H;
        sk.airT += H;
        if (sk.trick) sk.trick.t += H;
        if (sk.hr <= g) land(sk, g);
      }
      // gates, judged where you cross them
      const gates = race.course.gates;
      while (sk.gate < gates.length && gates[sk.gate].s <= sk.s) {
        const gt = gates[sk.gate];
        const f = (gt.s - sPrev) / (sk.s - sPrev);
        const xc = xPrev + (sk.x - xPrev) * f;
        const ok = tweak === 'lenient' || judge(sk.level, gt, xc);
        sk.gates.push(ok ? 'pass' : 'miss');
        if (tweak === 'double' && ok) sk.gates.push('pass');
        if (!ok) sk.misses++;
        ev(ok ? 'gate' : 'miss', sk, { gate: gt.i, x: xc });
        sk.gate++;
      }
      // the finish line, timed inside the step
      const Lf = race.course.L;
      if (sk.s >= Lf) {
        const f = (Lf - sPrev) / (sk.s - sPrev);
        sk.finishT = tPrev + f * H + (tweak === 'clockEarly' ? PHYS.countIn : 0);
        sk.finishN = race.n;
        sk.final = finalOf(sk);
        ev('finish', sk);
      }
    }

    function launch(sk, vh) {
      sk.air = true;
      sk.vh = vh;
      sk.airT = 0;
      sk.vhG = null;
      sk.onRamp = null;
    }
    function land(sk, g) {
      const big = sk.airT > 0.35;
      sk.hr = g;
      sk.air = false;
      sk.vh = 0;
      sk.vhG = null;
      if (sk.trick) {
        if (sk.trick.t >= PHYS.trickTime) { sk.tricks++; sk.boostT = Math.max(sk.boostT, PHYS.boost); ev('landTrick', sk); }
        else ev('land', sk);
        sk.trick = null;
      } else if (big) ev('land', sk);
    }
    function bonk(sk, keep, what) {
      sk.v *= keep;
      sk.bonkT = 0.6;
      sk.bonks++;
      ev('bonk', sk, { what });
    }
    // after the line: glide to a stop in the run-out
    function coast(sk) {
      sk.v = Math.max(0, sk.v - PHYS.brake * H);
      sk.yaw *= 1 - 3 * H;
      sk.s += sk.v * Math.cos(sk.yaw) * H;
      sk.x += sk.v * Math.sin(sk.yaw) * H;
      sk.x = clamp(sk.x, -race.course.W / 2 + 1, race.course.W / 2 - 1);
      if (sk.air) {
        sk.hr += sk.vh * H;
        sk.vh -= PHYS.grav * H;
        if (sk.hr <= 0) { sk.hr = 0; sk.air = false; sk.trick = null; }
      } else sk.hr = 0;
    }
    // the CPUs' pace: their own speed, held back on EASY when they get ahead of the kid (most near the end)
    function cpuPace(sk, lead) {
      let m = sk.cpu.mult[sk.level] * (tweak === 'fastCpu' ? 1.25 : 1);
      if (!lead || skiers.every((k) => !k.human || k.finishT !== null)) return m; // nobody left to wait for
      // the kid's penalty seconds count as metres behind, so a CPU can't win just on the kid's missed gates
      const gap = sk.s - (lead.s - lead.misses * lead.L.penalty * lead.L.vTop), late = sk.s > race.course.L * 0.7;
      if (sk.level === 'easy') {
        if (gap > 6) m *= late ? 0.7 : 0.84;
        else if (gap < -30) m *= 1.06;
      } else {
        if (gap > 25) m *= 0.95;
        else if (gap < -25) m *= 1.04;
      }
      return m;
    }
    function finish() {
      race.done = true;
      results();
    }
    function ev(type, sk, extra) {
      race.events.push(Object.assign({ type, i: sk.i, t: race.time }, extra || {}));
      if (race.events.length > 400) race.events.splice(0, 100);
    }

    // the order: fastest time (finish + penalties) first; skiers still going come last, by how far they've got
    function results() {
      const order = skiers.slice().sort((a, b) => {
        if (a.final !== null && b.final !== null) return a.final - b.final || a.finishT - b.finishT || a.i - b.i;
        if (a.final !== null) return -1;
        if (b.final !== null) return 1;
        return b.s - a.s || a.i - b.i;
      });
      order.forEach((sk, k) => { sk.place = k + 1; });
      return order.map((sk) => ({ i: sk.i, id: sk.id, name: sk.name, human: sk.human, finishT: sk.finishT, misses: sk.misses, penalty: sk.misses * sk.L.penalty, final: sk.final, place: sk.place }));
    }
    function finalOf(sk) {
      return tweak === 'nopenalty' ? sk.finishT : sk.finishT + sk.misses * sk.L.penalty;
    }
    return race;
  }

  // passed or missed: between the poles, plus EASY's extra room
  function judge(level, gate, x) {
    return Math.abs(x - gate.x) <= gate.w / 2 + LEVELS[level].tol;
  }

  // broken on purpose (for the checks): a gate swung far across, right after the one before it
  function gapCourse(c) {
    const g = c.gates.map((x) => Object.assign({}, x));
    const k = 3;
    g[k].s = g[k - 1].s + 4;
    g[k].x = g[k - 1].x > 0 ? -c.W / 2 + g[k].w / 2 + 0.8 : c.W / 2 - g[k].w / 2 - 0.8;
    const ways = c.ways.map((w) => (w.kind === 'gate' && w.gate === k ? Object.assign({}, w, { s: g[k].s, x: g[k].x }) : w)).sort((a, b) => a.s - b.s);
    return Object.assign({}, c, { gates: g, ways });
  }

  // a whole race with pretend players, as fast as it goes
  function simulate(o) {
    const r = create(o);
    const dt = o.dt || 1 / 60;
    let guard = 0;
    while (!r.done && guard++ < 1e6) r.step(typeof dt === 'function' ? dt(guard) : dt);
    return r;
  }

  // 32.456 -> "32.45": hundredths, cut not rounded, like a ski clock
  function fmt(t) {
    if (t === null || t === undefined || !isFinite(t)) return '--.--';
    const cs = Math.floor(t * 100 + 1e-6);
    const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    return (m ? `${m}:${String(s).padStart(2, '0')}` : `${s}`) + '.' + String(c).padStart(2, '0');
  }

  SKI.race = { create, simulate, judge, fmt, LEVELS, PHYS, PILOTS, CPUS, H, nextWay, yawTo };
})();
