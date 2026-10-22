/* TT Ski Downhill: the headless checks, run as game.check() in the page and by `node tools/check.js`.
   They ski whole races with pretend players (SKI.race.PILOTS) and check the brief's rules:
     finishable  every course ends with every skier over the line, on both levels, in every mode, whoever skis and
                 however badly (even mashing random keys), well before the safety cap; and a careful skier can get
                 down every course through every gate, so no gate is out of reach
     gates       a gate is passed between its poles (EASY: up to 1.5 m outside) and missed past that, to the
                 centimetre; each gate is judged exactly once; skipping one gate misses exactly that gate and adds
                 exactly its penalty (+1 s EASY, +3 s NORMAL); the CPUs ski clean
     timing      the clock starts on GO and nobody moves before it; the finish is timed inside the step, so a race
                 comes out the same at 30, 60 or 144 frames a second or a jumpy frame rate; time = finish + penalties;
                 places go by time; the clock shows hundredths, cut not rounded
     easyRace    on EASY a wobbly 5-year-old (PILOTS.kid) beats Foxy and Froggy on every course; on NORMAL the CPUs
                 are a real race: a careful skier wins, doing nothing loses
   run({ prove: true }) also breaks each rule on purpose (the race's `tweak` option) and checks that the check then
   fails, so a check that can't fail can't pass unnoticed. */
(function () {
  'use strict';
  const SKI = (window.SKI = window.SKI || {});
  const LEVELS = ['easy', 'normal'];

  function sim(course, players, o) {
    return SKI.race.simulate(Object.assign({ course, players, cpu: true }, o || {}));
  }

  function finishable(tweak) {
    const R = SKI.race, problems = [];
    let n = 0, longest = 0;
    for (const course of SKI.courses.list) {
      for (const level of LEVELS) {
        for (const pilot of ['idle', 'kid', 'good', 'wild']) {
          for (const mode of ['solo', 'race', '2p']) {
            const seeds = pilot === 'kid' || pilot === 'wild' ? [1, 2, 3] : [1];
            for (const seed of seeds) {
              const other = level === 'easy' ? 'normal' : 'easy';
              const players = mode === '2p'
                ? [{ who: 'teddy', level, pilot }, { who: 'tommy', level: other, pilot: pilot === 'good' ? 'kid' : pilot }]
                : [{ who: 'teddy', level, pilot }];
              const r = sim(course, players, { cpu: mode === 'race', seed, tweak });
              n++;
              const tag = `${course.id} ${level} ${pilot} ${mode} seed ${seed}`;
              if (!r.done || r.capped) { problems.push(`${tag}: not everyone got down (stopped at ${r.time.toFixed(0)} s)`); continue; }
              for (const sk of r.skiers) {
                longest = Math.max(longest, sk.finishT);
                if (!(sk.finishT > 0) || !isFinite(sk.final)) problems.push(`${tag}: ${sk.id} has no time`);
                if (sk.gates.length !== course.gates.length) problems.push(`${tag}: ${sk.id} was judged at ${sk.gates.length} of ${course.gates.length} gates`);
                if (!isFinite(sk.s) || !isFinite(sk.x) || Math.abs(sk.x) > course.W / 2) problems.push(`${tag}: ${sk.id} left the course`);
              }
              if (pilot === 'good') {
                const sk = r.skiers[0];
                if (sk.misses) problems.push(`${tag}: a careful skier missed ${sk.misses} gate(s), e.g. gate ${sk.gates.indexOf('miss')}`);
                if (sk.bonks) problems.push(`${tag}: a careful skier bonked ${sk.bonks} time(s)`);
              }
            }
          }
        }
      }
    }
    if (longest > 120) problems.push(`the longest run took ${longest.toFixed(0)} s, too long for a 5-year-old`);
    return { problems, stat: `${n} races, everyone down, the longest run ${R.fmt(longest)} s` };
  }

  function gates(tweak) {
    const R = SKI.race, problems = [];
    let n = 0;
    // 1. the edges, straight through the judge and through a real crossing (skiing dead straight at a chosen x)
    for (const level of LEVELS) {
      const L = R.LEVELS[level];
      for (const course of SKI.courses.list) {
        const g = course.gates[2];
        const edge = g.w / 2 + L.tol, e = 0.01;
        for (const [dx, want] of [[0, true], [edge - e, true], [-(edge - e), true], [edge + e, false], [-(edge + e), false]]) {
          const x = g.x + dx;
          if (Math.abs(x) > course.W / 2 - 1) continue;
          const straight = (race, sk) => {
            sk.input.steer = 1e-9; // steering (so no EASY help), but dead straight
            if (sk.s < g.s - 2) { sk.x = x; sk.yaw = 0; }
          };
          const r = R.create({ course, players: [{ who: 'teddy', level, pilot: straight }], cpu: false, tweak });
          while (!r.done && r.skiers[0].gate <= 2) r.step(1 / 60);
          const got = r.skiers[0].gates[2] === 'pass';
          n++;
          if (got !== want) problems.push(`${course.id} ${level}: ${dx.toFixed(2)} m from the middle of a ${g.w} m gate was ${got ? 'passed' : 'missed'}`);
          if (R.judge(level, g, x) !== want) problems.push(`${course.id} ${level}: judge(${dx.toFixed(2)}) is wrong`);
        }
      }
    }
    // 2. skip one gate: exactly that one is missed, once, and costs exactly its penalty
    for (const course of SKI.courses.list) {
      for (const level of LEVELS) {
        const L = R.LEVELS[level];
        for (const skip of [1, Math.floor(course.gates.length / 2), course.gates.length - 1]) {
          const r = sim(course, [{ who: 'teddy', level, pilot: 'dodge', skip }], { cpu: true, tweak });
          const sk = r.skiers[0];
          n++;
          const tag = `${course.id} ${level} skip gate ${skip}`;
          const missed = sk.gates.map((x, i) => (x === 'miss' ? i : -1)).filter((i) => i >= 0);
          if (missed.join() !== String(skip)) problems.push(`${tag}: missed gates [${missed}]`);
          if (sk.gates.length !== course.gates.length) problems.push(`${tag}: ${sk.gates.length} gate results for ${course.gates.length} gates`);
          if (Math.abs(sk.final - (sk.finishT + L.penalty)) > 1e-9) problems.push(`${tag}: time ${sk.final} is not ${sk.finishT} + ${L.penalty}`);
          const evs = r.events.filter((e) => e.i === 0 && (e.type === 'gate' || e.type === 'miss'));
          if (evs.length !== course.gates.length) problems.push(`${tag}: ${evs.length} gate events`);
          for (const c of r.skiers.filter((x) => !x.human)) if (c.misses) problems.push(`${tag}: ${c.name} missed ${c.misses}`);
        }
      }
    }
    return { problems, stat: `${n} gate tests` };
  }

  function timing(tweak) {
    const R = SKI.race, problems = [];
    let n = 0;
    const rates = { '30 fps': 1 / 30, '60 fps': 1 / 60, '144 fps': 1 / 144, jumpy: (k) => [1 / 61, 1 / 23, 1 / 140, 1 / 45][k % 4] };
    for (const course of SKI.courses.list) {
      for (const level of LEVELS) {
        for (const pilot of ['good', 'kid']) {
          let ref = null;
          for (const [name, dt] of Object.entries(rates)) {
            const r = sim(course, [{ who: 'teddy', level, pilot }], { cpu: true, seed: 4, dt, tweak });
            const got = r.skiers.map((sk) => sk.final);
            n++;
            const tag = `${course.id} ${level} ${pilot} at ${name}`;
            if (!ref) ref = got;
            else if (got.some((t, i) => Math.abs(t - ref[i]) > 1e-9)) problems.push(`${tag}: times ${got.map(R.fmt)} but ${ref.map(R.fmt)} at 30 fps`);
            for (const sk of r.skiers) {
              // the line was crossed inside step finishN, so the time is inside that step's slot after GO
              const lo = (sk.finishN - 1 - r.startN) * R.H, hi = (sk.finishN - r.startN) * R.H;
              if (!(sk.finishT > lo - 1e-9 && sk.finishT <= hi + 1e-9)) problems.push(`${tag}: ${sk.id} time ${sk.finishT.toFixed(4)} is outside its step ${lo.toFixed(4)}..${hi.toFixed(4)}`);
              if (Math.abs(sk.final - (sk.finishT + sk.misses * sk.L.penalty)) > 1e-9) problems.push(`${tag}: ${sk.id} time is not finish + penalties`);
            }
            const order = r.results();
            for (let k = 1; k < order.length; k++) if (order[k].final < order[k - 1].final) problems.push(`${tag}: place ${k + 1} is faster than place ${k}`);
            if (order.map((x) => x.place).join() !== order.map((x, k) => k + 1).join()) problems.push(`${tag}: places ${order.map((x) => x.place)}`);
          }
        }
      }
    }
    // nobody moves in the count-in, and everybody is moving right after GO
    const r = R.create({ course: SKI.courses.list[0], players: [{ who: 'teddy', level: 'easy', pilot: 'wild' }, { who: 'tommy', level: 'normal', pilot: 'good' }], cpu: true, tweak });
    r.jump(0);
    while (r.time < -1e-9) {
      r.step(1 / 60);
      if (r.time < -1e-9 && r.skiers.some((sk) => sk.s !== 0 || sk.v !== 0)) { problems.push(`someone moved in the count-in at ${r.time.toFixed(2)} s`); break; }
    }
    r.step(0.5);
    if (r.skiers.some((sk) => !(sk.s > 0))) problems.push('someone was still standing half a second after GO');
    // the clock face
    for (const [t, want] of [[32.456, '32.45'], [9.999, '9.99'], [60.5, '1:00.50'], [0.07, '0.07'], [75.009, '1:15.00']]) {
      if (R.fmt(t) !== want) problems.push(`fmt(${t}) is ${R.fmt(t)}, not ${want}`);
    }
    return { problems, stat: `${n} races at 4 frame rates agree` };
  }

  function easyRace(tweak) {
    const R = SKI.race, problems = [];
    let n = 0, worst = -Infinity;
    for (const course of SKI.courses.list) {
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const who of ['tommy', 'teddy']) {
          const r = sim(course, [{ who, level: 'easy', pilot: 'kid' }], { seed, tweak });
          n++;
          const me = r.skiers[0];
          if (me.place !== 1) problems.push(`${course.id} EASY seed ${seed}: the kid came ${me.place}${['st', 'nd', 'rd'][me.place - 1] || 'th'}`);
          const cpuBest = Math.min(...r.skiers.filter((x) => !x.human).map((x) => x.final));
          worst = Math.max(worst, me.final - cpuBest);
        }
      }
      for (const [pilot, want] of [['good', 1], ['idle', 3]]) {
        const r = sim(course, [{ who: 'teddy', level: 'normal', pilot }], { seed: 1, tweak });
        n++;
        if (r.skiers[0].place !== want) problems.push(`${course.id} NORMAL: ${pilot} came ${r.skiers[0].place}, not ${want}`);
      }
    }
    return { problems, stat: `${n} races, the kid's closest EASY win by ${(-worst).toFixed(1)} s` };
  }

  const CHECKS = { finishable, gates, timing, easyRace };
  // each check, broken on purpose in a way it must notice
  const BREAKS = [
    ['finishable', 'wall', 'a fence across the middle of the course'],
    ['finishable', 'gap', 'a gate swung too far across to reach'],
    ['gates', 'lenient', 'every gate counts as passed'],
    ['gates', 'nopenalty', 'missed gates cost nothing'],
    ['gates', 'double', 'a passed gate is counted twice'],
    ['timing', 'coarse', 'the finish stamped at the end of the frame'],
    ['timing', 'clockEarly', 'the clock started in the count-in'],
    ['easyRace', 'fastCpu', 'Foxy and Froggy 25% faster'],
  ];

  function run(o) {
    o = o || {};
    const t0 = Date.now();
    const results = [];
    for (const [name, fn] of Object.entries(CHECKS)) {
      if (o.only && o.only !== name) continue;
      const r = fn(null);
      results.push({ name, ok: r.problems.length === 0, stat: r.stat, problems: r.problems });
    }
    const prove = [];
    if (o.prove) {
      for (const [name, tweak, why] of BREAKS) {
        if (o.only && o.only !== name) continue;
        const r = CHECKS[name](tweak);
        prove.push({ name, tweak, why, caught: r.problems.length > 0, first: r.problems[0] || 'NOT CAUGHT' });
      }
    }
    return { ok: results.every((r) => r.ok) && prove.every((p) => p.caught), results, prove, ms: Date.now() - t0 };
  }

  SKI.checks = { run, CHECKS, BREAKS };
})();
