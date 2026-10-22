/* TT Ski Downhill: the game. Home screen, the count-in, skiing (1 or 2 players), the brother's speed tuck, the
   finish, the winner's celebration and the results. The rules live in js/ski.js, the 3D in js/world.js and
   js/skier.js. For tests, window.game:
     game.start({ course, mode, who, levels }) / game.step(seconds) / game.hold(on) / game.info() / game.check()
     game.buddy() / game.pause(bool) / game.home() / game.autopilot('good' | 'kid' | null) */
(function () {
  'use strict';
  const T = THREE;
  const SKI = window.SKI, R = SKI.race, W = SKI.world, K = SKI.skier;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const STORE = 'skiTT.v1';
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const HUMANS = ['teddy', 'tommy'];

  let save = { course: 'bunny', mode: 'trial', who: 'teddy', level: { teddy: 'easy', tommy: 'easy' }, best: {}, wins: { teddy: 0, tommy: 0 } };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) save = Object.assign(save, s, { level: Object.assign(save.level, s.level), best: s.best || {}, wins: Object.assign(save.wins, s.wins) });
  } catch (e) { /* storage blocked */ }
  if (!SKI.courses.list.some((c) => c.id === save.course)) save.course = 'bunny';
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }

  let state = 'loading', paused = false, held = false;
  let course = SKI.courses.get(save.course);
  let race = null, players = [], models = [], portraits = {};
  let cams = [], views = [];
  let finishWait = 0, celebrate = null, results = null;
  let seq = null, buddy = null, treat = null, ball = null;
  let fiveT = 0, fiveCool = 0, lastCount = null, streak = [0, 0];
  let lastNow = 0;
  const camLook = [new T.Vector3(), new T.Vector3()];
  const camOff = [new T.Vector3(4.2, 0.7, -8), new T.Vector3(0, 4, 7)];
  let demoT = 0;
  const keys = new Set();
  const padHeld = [{}, {}];

  // ---------------------------------------------------------------- start up
  function init() {
    W.init($('game'));
    portraits = Kit.portraits(HUMANS.map((id) => Kit.roster.get(id)), { size: 128 });
    for (let i = 0; i < 2; i++) cams.push(new T.PerspectiveCamera(62, 1, 0.1, 2000));
    const words = window.SKI_TITLE.split(' ');
    $('logo').querySelector('small').textContent = words.slice(0, -1).join(' ');
    $('logo').querySelector('big').textContent = words[words.length - 1];
    homeUI();
    hudUI();
    W.setCourse(course);
    goHome();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('resize', layout);
    window.addEventListener('pointerdown', () => Kit.sound.init(), { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.autoPause && isSkiing()) setPause(true);
    });
    Kit.sound.onMute(muteIcon);
    muteIcon(Kit.sound.isMuted());
    setTimeout(() => $('loading').classList.add('hidden'), 150);
    requestAnimationFrame((t) => { lastNow = t; requestAnimationFrame(loop); });
  }
  function isSkiing() { return state === 'count' || state === 'race' || state === 'finish'; }
  function muteIcon(m) { $('muteBtn').textContent = m ? '🔇' : '🔊'; }

  // ---------------------------------------------------------------- home
  function homeUI() {
    const box = $('courses');
    for (const c of SKI.courses.list) {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.id = c.id;
      b.style.setProperty('--tile', c.tile);
      b.setAttribute('aria-label', c.name);
      b.innerHTML = `<span class="emo">${c.emoji}</span><span class="nm">${c.name}</span><span class="best"></span>`;
      b.addEventListener('click', () => pickCourse(c.id));
      box.appendChild(b);
    }
    $('modes').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pickMode(b.dataset.mode)));
    $('who').querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => pickWho(b.dataset.who));
      const imgs = b.querySelectorAll('img');
      if (b.dataset.who === 'both') { imgs[0].src = portraits.teddy; imgs[1].src = portraits.tommy; } else imgs[0].src = portraits[b.dataset.who];
    });
    $('playBtn').addEventListener('click', () => startRace());
  }
  function pickCourse(id) {
    save.course = id;
    persist();
    setCourse(id);
    refreshHome();
    Kit.sound.click();
  }
  function setCourse(id) {
    if (course.id !== id) { course = SKI.courses.get(id); W.setCourse(course); }
    if (state === 'home') newDemo();
  }
  function pickMode(m) {
    save.mode = m;
    persist();
    refreshHome();
    if (state === 'home') newDemo();
    Kit.sound.click();
  }
  function pickWho(w) {
    save.who = w;
    persist();
    refreshHome();
    if (state === 'home') newDemo();
    Kit.sound.click();
  }
  function setLevel(id, lv) {
    save.level[id] = lv;
    persist();
    refreshHome();
    Kit.sound.click();
  }
  function whoList() { return save.who === 'both' ? HUMANS.slice() : [save.who]; }
  function bestKey(cid, id) { return `${cid}/${save.level[id]}/${id}`; }
  function refreshHome() {
    $('courses').querySelectorAll('.card').forEach((b) => {
      b.classList.toggle('on', b.dataset.id === save.course);
      const bests = whoList().map((id) => save.best[bestKey(b.dataset.id, id)]).filter((t) => t);
      b.querySelector('.best').textContent = bests.length ? '⏱️ ' + bests.map(R.fmt).join(' · ') : '';
    });
    $('modes').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === save.mode));
    $('who').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.who === save.who);
      const cups = b.querySelector('.cups');
      if (cups) cups.textContent = save.wins[b.dataset.who] ? `🏆${save.wins[b.dataset.who]}` : '';
    });
    const lv = $('lvls');
    lv.innerHTML = '';
    for (const id of whoList()) {
      const g = document.createElement('div');
      g.className = 'lvl';
      g.innerHTML = `<img alt="" src="${portraits[id]}"><button data-l="easy" aria-label="EASY"><span>🐣</span>EASY</button><button data-l="normal" aria-label="NORMAL"><span>🔥</span>NORMAL</button>`;
      g.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', save.level[id] === b.dataset.l);
        b.addEventListener('click', () => setLevel(id, b.dataset.l));
      });
      lv.appendChild(g);
    }
  }
  function goHome() {
    state = 'home';
    paused = false;
    celebrate = null;
    clearBuddy();
    for (const id of ['hud', 'pads', 'pause', 'results', 'buddyBtn', 'fiveBtn', 'split']) $(id).classList.add('hidden');
    $('home').classList.remove('hidden');
    $('zoom').classList.remove('on');
    refreshHome();
    newDemo();
    Kit.sound.music('title');
  }

  // the title screen's skier: the chosen boy skiing the chosen slope by himself, round and round
  function newDemo() {
    const who = save.who === 'both' ? HUMANS : [save.who];
    makeRace({ course, players: who.map((id) => ({ who: id, level: 'normal', pilot: 'good' })), cpu: save.mode === 'race', seed: 1 + Math.floor(Math.random() * 99) }, true);
    race.step(R.PHYS.countIn + 0.01);
    W.resetGates();
  }

  // ---------------------------------------------------------------- a race
  function makeRace(o, demo) {
    for (const m of models) K.remove(m, W.scene());
    race = R.create(o);
    players = race.skiers.filter((sk) => sk.human).map((sk) => sk.id);
    models = race.skiers.map((sk) => {
      const m = K.make(sk.id, { tag: race.skiers.length > 1 && !demo });
      K.add(m, W.scene());
      return m;
    });
    streak = [0, 0];
    lastCount = null;
  }

  function startRace(o) {
    o = o || {};
    if (o.course) { save.course = o.course; }
    if (o.mode) save.mode = o.mode;
    if (o.who) save.who = o.who;
    if (o.levels) Object.assign(save.level, o.levels);
    persist();
    setCourse(save.course);
    clearBuddy();
    W.resetGates();
    const who = whoList();
    makeRace({ course, players: who.map((id) => ({ who: id, level: save.level[id] })), cpu: save.mode === 'race', seed: 1 + Math.floor(Math.random() * 9999) });
    state = 'count';
    paused = false;
    celebrate = null;
    results = null;
    finishWait = 0;
    fiveT = fiveCool = 0;
    $('home').classList.add('hidden');
    $('results').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pads').classList.remove('hidden');
    $('buddyBtn').classList.toggle('hidden', players.length > 1);
    $('fiveBtn').classList.toggle('hidden', players.length < 2);
    $('split').classList.toggle('hidden', players.length < 2);
    if (players.length === 1) $('buddyFace').src = portraits[Kit.roster.buddyFor(players[0])];
    buildTrack();
    buildInfo();
    buildPads();
    layout();
    snapCams();
    Kit.sound.music('play');
  }
  function nextCourse() {
    const list = SKI.courses.list, i = list.findIndex((c) => c.id === save.course);
    save.course = list[(i + 1) % list.length].id;
    startRace();
  }
  function setPause(p) {
    if (!isSkiing()) return;
    paused = !!p;
    $('pause').classList.toggle('hidden', !paused);
    Kit.sound.music(paused ? 'pause' : 'play');
    keys.clear();
  }

  // ---------------------------------------------------------------- input
  function heldKey(codes) { return codes.some((c) => keys.has(c)); }
  function controls(pl) {
    const two = players.length > 1;
    const left = two ? (pl ? ['ArrowLeft'] : ['KeyA']) : ['KeyA', 'ArrowLeft'];
    const right = two ? (pl ? ['ArrowRight'] : ['KeyD']) : ['KeyD', 'ArrowRight'];
    const tuck = two ? (pl ? ['ArrowDown'] : ['KeyS']) : ['KeyS', 'ArrowDown'];
    const ph = padHeld[pl];
    const steer = (heldKey(right) || ph.right ? 1 : 0) - (heldKey(left) || ph.left ? 1 : 0);
    return { steer, tuck: heldKey(tuck) || !!ph.tuck };
  }
  function jumpKey(code) {
    const two = players.length > 1;
    if (!two) return ['Space', 'KeyW', 'ArrowUp'].includes(code) ? 0 : -1;
    if (code === 'KeyW' || code === 'Space') return 0;
    if (code === 'ArrowUp' || code === 'Enter' || code === 'NumpadEnter') return 1;
    return -1;
  }
  function doJump(pl) {
    if (!race || paused || state !== 'race') return;
    race.jump(pl);
  }

  function onKey(e) {
    const k = e.code;
    if (k === 'KeyM') { Kit.sound.init(); Kit.sound.toggleMute(); e.preventDefault(); return; }
    if (state !== 'loading') Kit.sound.init();
    if (state === 'home') {
      const list = SKI.courses.list, i = list.findIndex((c) => c.id === save.course);
      if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowRight' || k === 'KeyD') {
        pickCourse(list[(i + (k === 'ArrowLeft' || k === 'KeyA' ? list.length - 1 : 1)) % list.length].id);
      } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'KeyW' || k === 'KeyS') {
        const id = save.who === 'both' ? (k === 'KeyW' || k === 'KeyS' ? 'teddy' : 'tommy') : save.who;
        setLevel(id, k === 'ArrowUp' || k === 'KeyW' ? 'easy' : 'normal');
      } else if (k === 'Digit1') pickWho('teddy');
      else if (k === 'Digit2') pickWho('tommy');
      else if (k === 'Digit3') pickWho('both');
      else if (k === 'KeyR') pickMode(save.mode === 'race' ? 'trial' : 'race');
      else if (k === 'Enter' || k === 'Space') startRace();
      else return;
      e.preventDefault();
      return;
    }
    if (state === 'results') {
      if (k === 'Enter' || k === 'Space') startRace();
      else if (k === 'KeyN') nextCourse();
      else if (k === 'Escape' || k === 'KeyH') goHome();
      else return;
      e.preventDefault();
      return;
    }
    if (!isSkiing()) return;
    if (k === 'KeyP' || k === 'Escape') { setPause(!paused); e.preventDefault(); return; }
    if (paused) {
      if (k === 'Enter' || k === 'Space') setPause(false);
      e.preventDefault();
      return;
    }
    if (k === 'KeyT') { callBuddy(); e.preventDefault(); return; }
    if (['KeyA', 'KeyD', 'KeyS', 'KeyW', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'NumpadEnter'].includes(k)) {
      e.preventDefault();
      keys.add(k);
      const pl = jumpKey(k);
      if (pl >= 0 && !e.repeat) doJump(pl);
    }
  }

  // ---------------------------------------------------------------- the brother's speed tuck (1 player) and high fives (2 players)
  function callBuddy() {
    if (!race || paused || state !== 'race') return;
    if (players.length > 1) return highFive();
    const sk = race.skiers[0];
    if (sk.finishT !== null) return;
    const id = Kit.roster.buddyFor(players[0]);
    const entry = Kit.roster.get(id);
    if (!buddy || buddy.id !== id) {
      if (buddy) K.remove(buddy, W.scene());
      buddy = K.make(id, { scale: entry.buddyScale });
      buddy.out = true;
    }
    if (buddy.out) {
      K.add(buddy, W.scene());
      buddy.out = false;
      buddy.side = sk.x > 0 ? -1 : 1;
      buddy.pop = 0;
    }
    buddy.leaving = false; // called again while he was waving goodbye: he stays
    buddy.leave = 0;
    const [emoji, name] = TREATS[Math.floor(Math.random() * TREATS.length)];
    seq = { t: 0, entry, emoji, name, tossed: false, helped: false, bye: false, ball: false };
    $('buddyBtn').classList.add('here');
    Kit.sound.tone({ f: 520, to: 980, type: 'triangle', dur: 0.18, vol: 0.25 });
  }
  function clearBuddy() {
    if (buddy && !buddy.out) { K.remove(buddy, W.scene()); buddy.out = true; }
    seq = null;
    if (treat) { W.scene().remove(treat.sp); treat = null; }
    if (ball) { W.scene().remove(ball.sp); ball = null; }
    $('buddyBtn').classList.remove('here');
    $('zoom').classList.remove('on');
  }
  function highFive() {
    if (fiveCool > 0) return;
    fiveCool = 1.2;
    fiveT = 1.1;
    toast('✋ HIGH FIVE!', 'good', 0);
    toast('✋ HIGH FIVE!', 'good', 1);
    Kit.sound.tone({ f: 660, to: 1320, type: 'square', dur: 0.12, vol: 0.2 });
    Kit.sound.coin(3);
    race.skiers.forEach((sk, i) => { if (sk.human && sk.finishT === null) race.boost(i, 1.5); });
    const a = models[0].outer.position, b = models[1].outer.position;
    W.burst(a.clone().lerp(b, 0.5).add(new T.Vector3(0, 2, 0)), '#ffd400', 18, 3, 4);
  }

  const tv = new T.Vector3();
  function updateBuddy(dt) {
    if (!buddy || buddy.out || !race) return;
    const sk = race.skiers[0];
    buddy.pop = Math.min(1, (buddy.pop || 0) + dt * 4);
    const sc = buddy.scale * (buddy.leaving ? Math.max(0.01, 1 - buddy.leave * 3) : 1 - Math.pow(1 - buddy.pop, 3));
    buddy.outer.scale.setScalar(Math.max(0.01, sc));
    if (!seq) {
      // waving goodbye, then gone in a puff of snow
      buddy.leave = (buddy.leave || 0) + dt;
      const p = K.stand(buddy, buddy.s, buddy.x, 0, Math.PI, course);
      K.act(buddy, 'wave', dt);
      if (buddy.leave > 0.35) { W.puff(p, 14); K.remove(buddy, W.scene()); buddy.out = true; buddy.leaving = false; buddy.leave = 0; }
      return;
    }
    seq.t += dt;
    const t = seq.t, me = seq.entry.id;
    const lim = course.W / 2 - 1.2;
    let x = Math.max(-lim, Math.min(lim, sk.x + buddy.side * 2.6));
    if (Math.abs(x - sk.x) < 1.6) { buddy.side = -buddy.side; x = Math.max(-lim, Math.min(lim, sk.x + buddy.side * 2.6)); }
    const show = t < 1.9;
    buddy.s = sk.s + (show ? 3.2 : -0.6);
    buddy.x += (x - (buddy.x === undefined ? x : buddy.x)) * Math.min(1, dt * 6);
    if (!isFinite(buddy.x)) buddy.x = x;
    const g = SKI.courses.ground(course, buddy.s, buddy.x).g;
    const p = K.stand(buddy, buddy.s, buddy.x, g, show ? Math.PI : sk.yaw, course);
    if (show) {
      // his own move, facing you: Teddy boxes then shoots a 🏀, Tommy does his Y
      const mode = me === 'teddy' ? (t < 1.2 ? 'boxing' : 'jumpshot') : 'peace';
      K.act(buddy, mode, dt);
      if (me === 'teddy' && t > 1.2) buddy.outer.position.y += Math.sin(Math.min(1, (t - 1.2) / 0.6) * Math.PI) * 0.6;
      if (me === 'teddy' && !seq.ball && t > 1.45) { seq.ball = true; shootBall(p.clone().add(tv.set(0, 2.2, 0))); }
    } else if (sk.tuckBoostT > 0) K.act(buddy, 'tuck', dt);
    else K.act(buddy, 'stand', dt);
    if (!seq.tossed && t > 0.9) {
      seq.tossed = true;
      const s = seq;
      throwTreat(s.emoji, p.clone().add(tv.set(0, 1.6, 0)), () => {
        toast(`${s.emoji} ${s.name} FROM ${s.entry.name}!`, 'treat', 0);
        Kit.sound.coin(2);
      });
    }
    if (!seq.helped && t > 1.9) {
      seq.helped = true;
      toast(`${seq.entry.name} SAYS: TUCK AND ZOOM!`, 'buddy', 0);
      race.tuckBoost(0, R.PHYS.tuckBoost);
      Kit.sound.powerup();
      W.burst(models[0].outer.position.clone().add(tv.set(0, 1, 0)), '#8fd8ff', 20, 4, 3);
    }
    if (seq.helped && t > 1.9 + R.PHYS.tuckBoost + 0.2) {
      seq = null;
      buddy.leaving = true;
      buddy.leave = 0;
      $('buddyBtn').classList.remove('here');
    }
  }
  function sprite(emoji, size) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture(emoji), transparent: true, depthWrite: false }));
    sp.scale.setScalar(size);
    W.scene().add(sp);
    return sp;
  }
  function throwTreat(emoji, from, done) {
    if (treat) W.scene().remove(treat.sp);
    treat = { sp: sprite(emoji, 0.9), from: from.clone(), t: 0, done };
  }
  function shootBall(from) {
    if (ball) W.scene().remove(ball.sp);
    ball = { sp: sprite('🏀', 0.7), from: from.clone(), t: 0 };
  }
  function updateProps(dt) {
    if (treat) {
      treat.t += dt / 0.7;
      const to = models[0].outer.position.clone().add(tv.set(0, 1.4, 0));
      const e = Math.min(1, treat.t);
      treat.sp.position.lerpVectors(treat.from, to, e);
      treat.sp.position.y += Math.sin(e * Math.PI) * 1.8;
      if (treat.t >= 1) {
        W.burst(to, '#ffd400', 10, 2, 3);
        treat.done();
        W.scene().remove(treat.sp);
        treat = null;
      }
    }
    if (ball) {
      ball.t += dt;
      ball.sp.position.copy(ball.from);
      ball.sp.position.y += ball.t * 6 - ball.t * ball.t * 5;
      ball.sp.position.z += ball.t * 2;
      if (ball.t > 1.6) { W.scene().remove(ball.sp); ball = null; }
    }
  }

  // ---------------------------------------------------------------- the loop
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (held) return;
    frame(dt);
  }

  function frame(dt, noDraw) {
    if (state === 'loading') return;
    if (!paused) {
      if (state === 'home') tickDemo(dt);
      else if (isSkiing()) tickRace(dt);
      else if (state === 'results') tickResults(dt);
      fiveT = Math.max(0, fiveT - dt);
      fiveCool = Math.max(0, fiveCool - dt);
    }
    W.update(paused ? 0 : dt, views[0] && views[0].cam);
    if (noDraw) return;
    W.render(views);
    drawFx(paused ? 0 : dt);
  }

  function tickDemo(dt) {
    race.step(dt);
    race.events.length = 0;
    for (let i = 0; i < models.length; i++) K.place(models[i], race.skiers[i], dt, course);
    const sk = race.skiers[0];
    if (race.done || sk.s > course.L + 25) { newDemo(); snapCams(); }
    // looking back up the hill at him from in front and to the side
    const p = models[0].outer.position;
    const cam = cams[0];
    camOff[0].lerp(tv.set(4.2 + Math.sin(demoT * 0.3) * 1.5, 2.4 - 8 * SKI.courses.GRADE, -8), Math.min(1, dt * 2));
    demoT += dt;
    cam.position.copy(p).add(camOff[0]);
    cam.lookAt(tv.set(p.x, p.y + 1, p.z));
    sideView(cam);
  }
  // the home and results panels cover one side: shift the picture into the free part
  function sideView(cam) {
    const w = window.innerWidth, h = window.innerHeight;
    // landscape: the free part is the left 40%; portrait: the top third (a taller picture, so a wider lens)
    if (w / h > 1.1) { cam.fov = 50; cam.setViewOffset(w * 1.6, h, w * 0.6, 0, w, h); }
    else { cam.fov = 78; cam.setViewOffset(w, h * 1.7, 0, h * 0.67, w, h); }
    views = [{ cam, x: 0, y: 0, w: 1, h: 1 }];
  }

  function tickRace(dt) {
    for (let i = 0; i < players.length; i++) race.input(i, controls(i));
    race.step(dt);
    countIn();
    processEvents();
    updateBuddy(dt);
    updateProps(dt);
    for (let i = 0; i < models.length; i++) {
      const sk = race.skiers[i], m = models[i];
      if (race.time < 0) {
        K.stand(m, sk.s, sk.x, 0, 0, course);
        K.act(m, 'ready', dt);
      } else {
        K.place(m, sk, dt, course);
        if (fiveT > 0 && sk.human) Kit.people.pose(m.p, m.ph, 'give', 1 - Math.exp(-16 * dt));
      }
    }
    if (players.length === 1) $('zoom').classList.toggle('on', race.skiers[0].tuckBoostT > 0 || race.skiers[0].boostT > 0.2);
    updateCams(dt);
    updateHUD();
    if (state === 'race' && players.every((id, i) => race.skiers[i].finishT !== null)) {
      state = 'finish';
      finishWait = 0;
      clearBuddy();
    }
    if (state === 'finish') {
      finishWait += dt;
      if (finishWait > 2.3) showResults();
    }
  }

  function countIn() {
    if (state !== 'count') return;
    const n = Math.ceil(-race.time - 1e-9);
    if (race.time >= 0) {
      state = 'race';
      bigCount('GO!', true);
      Kit.sound.tone({ f: 880, to: 1320, type: 'square', dur: 0.35, vol: 0.25 });
      return;
    }
    if (n !== lastCount && n <= 3 && n >= 1) {
      lastCount = n;
      bigCount(String(n), false);
      Kit.sound.tone({ f: 520, type: 'square', dur: 0.15, vol: 0.2 });
    }
  }
  function bigCount(text, go) {
    const el = $('bigCount');
    el.textContent = text;
    el.className = go ? 'go' : '';
    void el.offsetWidth;
    el.classList.add('anim');
  }

  function processEvents() {
    const evs = race.events.splice(0);
    for (const ev of evs) {
      const sk = race.skiers[ev.i];
      if (!sk.human) continue;
      const pl = ev.i, solo = players.length === 1;
      const pos = models[ev.i].outer.position;
      switch (ev.type) {
        case 'gate':
          streak[pl] = (streak[pl] || 0) + 1;
          Kit.sound.coin(Math.min(8, streak[pl]));
          if (solo) W.gateResult(ev.gate, true);
          else W.burst(pos.clone().add(tv.set(0, 1.5, 0)), '#ffd400', 10, 2, 3);
          break;
        case 'miss':
          streak[pl] = 0;
          Kit.sound.bump();
          if (solo) W.gateResult(ev.gate, false);
          toast(`MISSED A GATE! +${sk.L.penalty}s`, 'oops', pl);
          break;
        case 'jump': Kit.sound.jump(); break;
        case 'hop': Kit.sound.tone({ f: 300, to: 520, type: 'sine', dur: 0.12, vol: 0.15 }); break;
        case 'trick': Kit.sound.swish(); break;
        case 'landTrick':
          Kit.sound.powerup();
          toast('TRICK! ZOOM!', 'good', pl);
          W.puff(pos, 12);
          break;
        case 'land': Kit.sound.land(); W.puff(pos, 8); break;
        case 'bonk':
          Kit.sound.stumble();
          W.puff(pos.clone().add(tv.set(0, 0.6, 0)), 16);
          toast(ev.what === 'snowman' ? 'BONK! A SNOWMAN!' : 'BONK!', 'oops', pl);
          break;
        case 'finish':
          toast(`🏁 FINISH! ${R.fmt(sk.final)}`, 'good', pl);
          Kit.sound.tone({ f: 660, to: 990, type: 'triangle', dur: 0.25, vol: 0.25 });
          Kit.sound.tone({ f: 990, to: 1320, type: 'triangle', dur: 0.3, vol: 0.25, at: 0.18 });
          break;
      }
    }
  }

  // ---------------------------------------------------------------- cameras
  function chase(cam, i, dt, snap) {
    const sk = race.skiers[i], p = models[i].outer.position;
    const G = SKI.courses.GRADE, yaw = sk.yaw * 0.45;
    const back = 7.5, air = sk.air ? Math.max(0, sk.hr - sk.g) * 0.5 : 0;
    // the camera rides along a little behind and above, easing round when he turns
    tv.set(-Math.sin(yaw) * back, 3.3 + back * G - air, Math.cos(yaw) * back);
    camOff[i].lerp(tv, snap ? 1 : 1 - Math.exp(-4 * dt));
    cam.position.copy(p).add(camOff[i]);
    const look = tv.set(Math.sin(yaw) * 6, 0.7 - 6 * G, -Math.cos(yaw) * 6);
    if (snap) camLook[i].copy(look); else camLook[i].lerp(look, 1 - Math.exp(-8 * dt));
    cam.lookAt(tv.copy(p).add(camLook[i]));
    const fov = sk.tuckBoostT > 0 ? 72 : sk.tucking ? 66 : 62;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
  }
  function updateCams(dt) {
    for (let i = 0; i < players.length; i++) { cams[i].clearViewOffset(); chase(cams[i], i, dt, false); }
  }
  function snapCams() {
    if (!race) return;
    if (state === 'home') return;
    for (let i = 0; i < players.length; i++) {
      K.stand(models[i], race.skiers[i].s, race.skiers[i].x, 0, 0, course);
      cams[i].fov = 62;
      chase(cams[i], i, 0, true);
    }
  }

  // ---------------------------------------------------------------- the finish, the celebration, results
  function placeWord(n) { return `${n}${['ST', 'ND', 'RD'][n - 1] || 'TH'}`; }
  function showResults() {
    while (!race.done) race.step(0.5); // anyone still skiing gets down
    const order = race.results();
    const win = order[0];
    const humans = order.filter((r) => r.human);
    const news = {};
    for (const r of humans) {
      const key = bestKey(course.id, r.id);
      if (!save.best[key] || r.final < save.best[key] - 1e-9) { news[r.id] = true; save.best[key] = r.final; }
    }
    const contest = order.length > 1;
    if (contest && win.human) save.wins[win.id] = (save.wins[win.id] || 0) + 1;
    persist();
    results = { order, news };
    // the head
    let head;
    if (!contest) head = `🎉 GREAT RUN, ${win.name}!`;
    else if (win.human) head = `🏆 ${win.name} WINS!`;
    else {
      const me = humans[0];
      head = `${R.CPUS[win.id].emoji} ${win.name} WINS! ${placeWord(me.place)} PLACE, GOOD TRY!`;
    }
    $('rHead').textContent = head;
    const rows = $('rRows');
    rows.innerHTML = '';
    for (const r of order) {
      const row = document.createElement('div');
      row.className = 'rrow' + (r.human ? ' me' : '');
      const face = r.human ? `<img alt="" src="${portraits[r.id]}">` : R.CPUS[r.id].emoji;
      const medal = ['🥇', '🥈', '🥉'][r.place - 1] || `${r.place}`;
      row.innerHTML = `<span class="medal"></span><span class="face">${face}</span><span class="nm"></span><span class="pen"></span><span class="tm"></span>`;
      row.querySelector('.medal').textContent = contest ? medal : '⏱️';
      row.querySelector('.nm').textContent = r.name;
      row.querySelector('.pen').textContent = r.misses ? `❌${r.misses} +${r.penalty}s` : '';
      row.querySelector('.tm').textContent = R.fmt(r.final);
      if (r.human && news[r.id]) {
        const b = document.createElement('span');
        b.className = 'rnew';
        b.textContent = 'NEW BEST!';
        row.insertBefore(b, row.querySelector('.tm'));
      }
      rows.appendChild(row);
    }
    $('rBest').innerHTML = '';
    for (const r of humans) {
      const s = document.createElement('span');
      s.textContent = `${r.name}: BEST ${R.fmt(save.best[bestKey(course.id, r.id)])} · 🏆 ${save.wins[r.id] || 0}`;
      $('rBest').appendChild(s);
    }
    for (const id of ['hud', 'pads', 'buddyBtn', 'fiveBtn', 'split']) $(id).classList.add('hidden');
    $('zoom').classList.remove('on');
    $('results').classList.remove('hidden');
    state = 'results';
    // the winner's celebration: his own move, facing the camera
    const wi = win.i;
    const wm = models[wi], wsk = race.skiers[wi];
    celebrate = { i: wi, t: 0, id: win.id, s: wsk.s, x: Math.max(-course.W / 2 + 3, Math.min(course.W / 2 - 3, wsk.x)), human: win.human, ball: false };
    models.forEach((m, i) => { if (i !== wi) { m.outer.visible = race.skiers[i].human; m.shadow.visible = m.outer.visible; } });
    wm.outer.visible = wm.shadow.visible = true;
    models.forEach((m) => { if (m.tag) m.tag.visible = false; });
    confetti(win.human ? 170 : 70);
    Kit.sound.music('over');
    [523, 659, 784, 1047].forEach((f, k) => Kit.sound.tone({ f, type: 'triangle', dur: 0.22, vol: 0.22, at: k * 0.13 }));
  }
  function tickResults(dt) {
    if (!celebrate) return;
    const c = celebrate;
    c.t += dt;
    const m = models[c.i];
    const p = K.stand(m, c.s, c.x, 0, Math.PI, course);
    let mode = 'wave';
    if (c.id === 'teddy') {
      const cyc = c.t % 3.4;
      mode = cyc < 1.8 ? 'boxing' : 'jumpshot';
      if (mode === 'jumpshot') {
        m.outer.position.y += Math.sin(Math.min(1, (cyc - 1.8) / 0.7) * Math.PI) * 0.7;
        if (!c.ball && cyc > 2.1) { c.ball = true; shootBall(p.clone().add(tv.set(0, 2.4, 0))); }
      } else c.ball = false;
    } else if (c.id === 'tommy') mode = 'peace';
    K.act(m, mode, dt);
    // the other brother cheers next to him
    models.forEach((o, i) => {
      if (i === c.i || !race.skiers[i].human) return;
      K.stand(o, c.s - 0.5, c.x + (c.x > 0 ? -2.4 : 2.4), 0, Math.PI, course);
      K.act(o, 'wave', dt);
    });
    updateProps(dt);
    const cam = cams[0];
    if (c.t === dt) camOff[0].copy(cam.position).sub(p);
    camOff[0].lerp(tv.set(2.4, 2.6, 9.5), Math.min(1, dt * 2.5));
    cam.position.copy(p).add(camOff[0]);
    cam.lookAt(tv.set(p.x, p.y + 1.1, p.z));
    sideView(cam);
  }

  // ---------------------------------------------------------------- the HUD: the slope map, the clock, gates, the place
  function buildTrack() {
    const tr = $('track');
    tr.querySelectorAll('.tick, .mark').forEach((e) => e.remove());
    const span = (s) => `calc(14px + (100% - 44px) * ${Math.max(0, Math.min(1, s / course.L)).toFixed(4)})`;
    for (const g of course.gates) {
      const t = document.createElement('i');
      t.className = 'tick';
      t.style.left = span(g.s);
      t.style.background = g.color === 'red' ? '#ff6b6b' : '#6b9bff';
      tr.appendChild(t);
    }
    for (const j of course.jumps) {
      const t = document.createElement('i');
      t.className = 'tick jump';
      t.style.left = span(j.s);
      tr.appendChild(t);
    }
    race.skiers.forEach((sk, i) => {
      const m = document.createElement('div');
      m.className = 'mark' + (sk.human ? ' me' : '');
      m.innerHTML = sk.human ? `<img alt="" src="${portraits[sk.id]}">` : sk.emoji;
      m.dataset.i = i;
      tr.appendChild(m);
    });
    tr._span = span;
  }
  let infos = [];
  function buildInfo() {
    infos.forEach((e) => e.remove());
    infos = players.map(() => {
      const d = document.createElement('div');
      d.className = 'pinfo';
      d.innerHTML = '<span class="clock"></span><span class="place"></span><span class="chips"><span class="chip gates"></span><span class="chip bad miss"></span><i class="speed"><b></b></i></span>';
      $('hud').appendChild(d);
      return d;
    });
  }
  function updateHUD() {
    const tr = $('track');
    tr.querySelectorAll('.mark').forEach((m) => {
      const sk = race.skiers[+m.dataset.i];
      m.style.left = tr._span(sk.s);
    });
    const contest = race.skiers.length > 1;
    const order = race.skiers.slice().sort((a, b) => (a.final !== null && b.final !== null ? a.final - b.final : a.final !== null ? -1 : b.final !== null ? 1 : b.s - a.s));
    players.forEach((id, i) => {
      const sk = race.skiers[i], d = infos[i];
      const t = sk.finishT !== null ? sk.final : Math.max(0, race.time) + sk.misses * sk.L.penalty;
      d.querySelector('.clock').textContent = R.fmt(t);
      d.querySelector('.place').textContent = contest && race.time > 0 ? placeWord(order.indexOf(sk) + 1) : '';
      d.querySelector('.gates').textContent = `🚩 ${sk.gates.filter((g) => g === 'pass').length}/${course.gates.length}`;
      d.querySelector('.miss').textContent = sk.misses ? `❌${sk.misses} +${sk.misses * sk.L.penalty}s` : '';
      d.querySelector('.speed b').style.transform = `scaleX(${Math.min(1, sk.v / 30).toFixed(3)})`;
    });
  }

  // ---------------------------------------------------------------- touch buttons
  let pads = [];
  function buildPads() {
    const box = $('pads');
    box.innerHTML = '';
    pads = players.map((id, pl) => {
      const two = players.length > 1;
      const kb = two ? (pl ? ['←', '→', '↓', '↑'] : ['A', 'D', 'S', 'W']) : ['←', '→', '↓', 'Space'];
      const mk = (cls, label, key, what, hint) => {
        const b = document.createElement('button');
        b.className = 'pad ' + cls;
        b.innerHTML = `${label}${hint ? `<small>${hint}</small>` : ''}<kbd>${key}</kbd>`;
        b.setAttribute('aria-label', { left: 'Steer left', right: 'Steer right', tuck: 'Tuck', jump: 'Jump' }[what]);
        const down = (e) => {
          e.preventDefault();
          Kit.sound.init();
          try { b.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
          b.classList.add('down');
          if (what === 'jump') doJump(pl); else padHeld[pl][what] = true;
        };
        const up = () => { b.classList.remove('down'); if (what !== 'jump') padHeld[pl][what] = false; };
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('lostpointercapture', up);
        box.appendChild(b);
        return b;
      };
      padHeld[pl] = {};
      return {
        left: mk('steer', '◀', kb[0], 'left'), right: mk('steer', '▶', kb[1], 'right'),
        tuck: mk('tuck', '⬇', kb[2], 'tuck', 'TUCK'), jump: mk('jump', '⬆', kb[3], 'jump', 'JUMP'),
      };
    });
  }
  function hudUI() {
    $('pauseBtn').addEventListener('click', () => setPause(true));
    $('muteBtn').addEventListener('click', () => { Kit.sound.init(); Kit.sound.toggleMute(); });
    $('pResume').addEventListener('click', () => setPause(false));
    $('pRestart').addEventListener('click', () => startRace());
    $('pHome').addEventListener('click', goHome);
    $('rAgain').addEventListener('click', () => startRace());
    $('rNext').addEventListener('click', nextCourse);
    $('rHome').addEventListener('click', goHome);
    $('buddyBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); Kit.sound.init(); callBuddy(); });
    $('fiveBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); Kit.sound.init(); if (race && state === 'race' && !paused) highFive(); });
  }

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const two = players.length > 1 && isSkiing();
    const side = w >= h;
    if (isSkiing()) {
      if (!two) views = [{ cam: cams[0], x: 0, y: 0, w: 1, h: 1 }];
      else if (side) views = [{ cam: cams[0], x: 0, y: 0, w: 0.5, h: 1 }, { cam: cams[1], x: 0.5, y: 0, w: 0.5, h: 1 }];
      else views = [{ cam: cams[0], x: 0, y: 0, w: 1, h: 0.5 }, { cam: cams[1], x: 0, y: 0.5, w: 1, h: 0.5 }];
      // in your own view, your brother never stands between you and your camera
      if (two) views.forEach((v, i) => { v.pre = () => hideBlocker(i); v.post = showAll; });
    }
    const sp = $('split');
    if (two) Object.assign(sp.style, side ? { left: `${w / 2 - 3}px`, top: '0', width: '6px', height: '100%' } : { left: '0', top: `${h / 2 - 3}px`, width: '100%', height: '6px' });
    // the pads: steering on the left of each view, tuck and jump on the right
    const pad = Math.round(Math.max(60, Math.min(96, Math.min(w, h) * 0.13)));
    const gap = 12, edge = 14;
    const safeB = 16;
    pads.forEach((p, pl) => {
      let x0 = 0, x1 = w, yb = h - safeB - pad;
      if (two) {
        if (side) { x0 = pl ? w / 2 + 6 : 0; x1 = pl ? w : w / 2 - 6; }
        else yb = pl ? h - safeB - pad : h / 2 - safeB - pad;
      }
      const set = (b, x, y) => Object.assign(b.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: `${pad}px`, height: `${pad}px` });
      set(p.left, x0 + edge, yb);
      set(p.right, x0 + edge + pad + gap, yb);
      set(p.jump, x1 - edge - pad, yb - (two ? 0 : pad * 0.55));
      set(p.tuck, x1 - edge - pad * 2 - gap, yb);
    });
    const bb = $('buddyBtn'), fb = $('fiveBtn');
    const bs = Math.round(Math.max(58, Math.min(84, Math.min(w, h) * 0.11)));
    Object.assign(bb.style, { left: `${Math.round(w / 2 - bs / 2)}px`, top: `${Math.round(h - safeB - bs)}px` });
    if (two && side) Object.assign(fb.style, { left: `${Math.round(w / 2 - bs / 2)}px`, top: `${Math.round(h - safeB - pad - bs - 18)}px` });
    else Object.assign(fb.style, { left: `${Math.round(w - bs - 12)}px`, top: `${Math.round(h / 2 - bs / 2)}px` });
    // the clock and chips under the slope map, one block per view
    infos.forEach((d, i) => {
      let left = 72, top = 62;
      if (two && side && i === 1) left = w / 2 + 16;
      if (two && !side && i === 1) top = h / 2 + 14;
      if (two && side && i === 0) left = 72;
      Object.assign(d.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
    });
    const tl = (pl) => $(`toasts${pl}`);
    for (const pl of [0, 1]) {
      const el = tl(pl);
      let x = w / 2, y = h * 0.22;
      if (two && side) x = pl ? w * 0.75 : w * 0.25;
      if (two && !side) y = pl ? h * 0.62 : h * 0.14;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${two && side ? w * 0.48 : w * 0.94}px` });
    }
  }

  function hideBlocker(i) {
    if (!race) return;
    const me = race.skiers[i];
    race.skiers.forEach((sk, j) => {
      if (j === i) return;
      const behind = me.s - sk.s;
      const block = behind > -1 && behind < 10 && Math.abs(sk.x - me.x) < 2.6;
      models[j].outer.visible = !block;
    });
  }
  function showAll() { models.forEach((m) => { m.outer.visible = true; }); }

  // ---------------------------------------------------------------- toasts and confetti (2D, on top)
  function toast(text, kind, pl) {
    const box = $(`toasts${players.length > 1 ? pl || 0 : 0}`);
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    while (box.children.length > 3) box.firstChild.remove();
  }
  const fx = $('fx').getContext('2d');
  const bits = [];
  function confetti(n) {
    const Wd = window.innerWidth;
    for (let i = 0; i < n; i++) {
      bits.push({ x: rand(0, Wd), y: rand(-200, -10), vx: rand(-60, 60), vy: rand(80, 220), r: rand(0, 6), vr: rand(-6, 6), w: rand(7, 13), h: rand(4, 8), c: Kit.gfx.pick(['#ffd400', '#e8382f', '#5fb4ff', '#7ed957', '#ff3d7f', '#ffffff']), life: rand(3, 5) });
    }
  }
  function drawFx(dt) {
    const c = $('fx');
    const Wd = window.innerWidth, Hd = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(Wd * dpr) || c.height !== Math.round(Hd * dpr)) { c.width = Math.round(Wd * dpr); c.height = Math.round(Hd * dpr); }
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.clearRect(0, 0, Wd, Hd);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      if (b.life <= 0 || b.y > Hd + 20) { bits.splice(i, 1); continue; }
      fx.save();
      fx.translate(b.x, b.y);
      fx.rotate(b.r);
      fx.fillStyle = b.c;
      fx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      fx.restore();
    }
  }

  // ---------------------------------------------------------------- window.game, for tests
  const game = {
    autoPause: true,
    start(o) { startRace(o || {}); return game.info(); },
    // quick: only draw the last frame (for long fast-forwards in tests)
    step(seconds, quick) {
      const n = Math.max(1, Math.round((seconds || 0) * 60));
      for (let i = 0; i < n; i++) frame(1 / 60, quick && i < n - 1);
      return game.info();
    },
    hold(on) { held = !!on; },
    buddy() { callBuddy(); return game.info().buddy; },
    jump(pl) { doJump(pl || 0); },
    pause(p) { setPause(p); },
    home() { goHome(); },
    next() { nextCourse(); },
    autopilot(kind) {
      if (!race) return;
      race.skiers.forEach((sk) => { if (sk.human) sk.pilotFn = kind ? R.PILOTS[kind](SKI.courses.rng(7 + sk.i)) : null; });
    },
    check(o) { return SKI.checks.run(Object.assign({ prove: true }, o || {})); },
    info() {
      return {
        state, paused, held, course: course.id, mode: save.mode, who: save.who, levels: Object.assign({}, save.level),
        time: race ? +race.time.toFixed(3) : null, done: race ? race.done : null,
        skiers: race ? race.skiers.map((sk) => ({ id: sk.id, s: +sk.s.toFixed(1), x: +sk.x.toFixed(2), v: +sk.v.toFixed(1), gates: sk.gates.length, misses: sk.misses, finishT: sk.finishT && +sk.finishT.toFixed(3), final: sk.final && +sk.final.toFixed(3), place: sk.place, tuckBoost: +sk.tuckBoostT.toFixed(2) })) : [],
        buddy: seq ? { who: seq.entry.id, t: +seq.t.toFixed(2), tossed: seq.tossed, helped: seq.helped } : null,
        results: results ? results.order.map((r) => ({ id: r.id, place: r.place, final: +r.final.toFixed(3), misses: r.misses })) : null,
      };
    },
    get race() { return race; },
    get save() { return save; },
  };
  window.game = game;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
