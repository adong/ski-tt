/* TT Ski Downhill: the skiers. Teddy and Tommy are the kit's blocky boys (Kit.people) on skis with poles and
   goggles; Foxy and Froggy are the same bodies with a fox's and a frog's head. SKI.skier.make(id) builds one,
   SKI.skier.place(m, sk, dt) puts it where the race says, and SKI.skier.act(m, mode, ph, dt) does the celebrations. */
(function () {
  'use strict';
  const SKI = (window.SKI = window.SKI || {});
  const T = THREE;
  const G = Kit.gfx;

  const LOOKS = {
    foxy: { head: 'human', skin: '#ff8a3c', top: '#2f6bff', bottom: '#1d2a55', shoes: '#14121f', shirt: 'jacket', print: 'star', hair: null },
    froggy: { head: 'human', skin: '#69c94e', top: '#ffd400', bottom: '#2f7d4f', shoes: '#14121f', shirt: 'jacket', print: 'bolt', hair: null },
  };
  const SKIS = { teddy: '#e8382f', tommy: '#ff8a1f', foxy: '#ffffff', froggy: '#2fd0ff' };
  const TAGS = { teddy: '#8cc2ff', tommy: '#ffb02e', foxy: '#ffb27a', froggy: '#a6f08a' };
  const NAMES = { teddy: 'TEDDY', tommy: 'TOMMY', foxy: 'FOXY', froggy: 'FROGGY' };

  // a fox's or a frog's head in place of the boy's (same size, facing -z like the body)
  function animalHead(kind, head) {
    head.children.forEach((c) => { c.visible = false; });
    const fur = G.std(kind === 'foxy' ? '#ff8a3c' : '#69c94e'), dark = G.std('#1b1a22'), white = G.std('#ffffff');
    const box = (w, h, d, m, x, y, z) => G.mesh(new T.BoxGeometry(w, h, d), m, x, y, z, head);
    box(0.54, 0.48, 0.48, fur, 0, 0, 0);
    for (const s of [-1, 1]) {
      box(0.08, 0.1, 0.03, dark, s * 0.12, 0.06, -0.25);
      box(0.03, 0.03, 0.02, white, s * 0.1, 0.09, -0.27);
      if (kind === 'foxy') {
        const e = box(0.17, 0.17, 0.07, fur, s * 0.19, 0.27, 0);
        e.rotation.z = Math.PI / 4;
        box(0.09, 0.09, 0.02, dark, s * 0.19, 0.27, -0.04).rotation.z = Math.PI / 4;
      } else {
        box(0.17, 0.13, 0.17, fur, s * 0.15, 0.27, -0.06);
        box(0.08, 0.08, 0.03, dark, s * 0.15, 0.29, -0.15);
        box(0.035, 0.035, 0.02, white, s * 0.14, 0.31, -0.17);
      }
    }
    if (kind === 'foxy') {
      box(0.24, 0.16, 0.14, G.std('#fff1e0'), 0, -0.1, -0.29);
      box(0.08, 0.06, 0.04, dark, 0, -0.05, -0.37);
      box(0.56, 0.12, 0.5, G.std('#fff1e0'), 0, -0.2, 0);
    } else {
      box(0.36, 0.04, 0.02, G.std('#2a6a1f'), 0, -0.12, -0.245);
      box(0.56, 0.14, 0.5, G.std('#d8f5b0'), 0, -0.19, 0);
    }
  }

  function make(id, o) {
    o = o || {};
    const entry = Kit.roster.get(id);
    const look = LOOKS[id] || entry.look;
    const p = Kit.people.build(Object.assign({}, look, { peace: true }));
    if (LOOKS[id]) animalHead(id, p.head);
    else {
      // ski goggles pushed up on the forehead
      const strap = G.mesh(new T.BoxGeometry(0.54, 0.07, 0.5), G.std('#14121f'), 0, 0.15, 0.01, p.head, false);
      strap.scale.z = 1.02;
      G.mesh(new T.BoxGeometry(0.4, 0.13, 0.06), G.std('#ff9a2e', { metalness: 0.4, roughness: 0.2, emissive: '#5a2a00' }), 0, 0.15, -0.26, p.head, false);
    }
    const outer = new T.Group(), yawG = new T.Group(), bankG = new T.Group();
    outer.add(yawG);
    yawG.add(bankG);
    bankG.add(p.root);
    // skis, curled up at the front
    const skiM = G.std(SKIS[id] || '#ffffff'), edge = G.std('#14121f');
    const skis = [];
    for (const s of [-1, 1]) {
      const ski = new T.Group();
      G.mesh(new T.BoxGeometry(0.15, 0.045, 1.75), skiM, 0, 0.022, -0.12, ski, false);
      G.mesh(new T.BoxGeometry(0.155, 0.02, 1.75), edge, 0, 0.002, -0.12, ski, false);
      const tip = G.mesh(new T.BoxGeometry(0.15, 0.045, 0.3), skiM, 0, 0.07, -1.1, ski, false);
      tip.rotation.x = 0.5;
      ski.position.x = s * 0.17;
      bankG.add(ski);
      skis.push(ski);
    }
    // poles, one in each hand
    const poles = [];
    for (const arm of [p.armL, p.armR]) {
      const pole = new T.Group();
      pole.position.y = -0.66;
      G.mesh(new T.CylinderGeometry(0.025, 0.025, 1.25, 5), G.std('#c9d3e6', { metalness: 0.6, roughness: 0.3 }), 0, -0.55, 0, pole, false);
      G.mesh(new T.CylinderGeometry(0.1, 0.1, 0.02, 10), edge, 0, -1.05, 0, pole, false);
      arm.add(pole);
      poles.push(pole);
    }
    const shadow = new T.Mesh(new T.CircleGeometry(0.9, 20), new T.MeshBasicMaterial({ map: G.radialTexture(64, [[0, 'rgba(40,60,110,0.42)'], [1, 'rgba(40,60,110,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2 + Math.atan(SKI.courses.GRADE);
    shadow.renderOrder = 1;
    let tag = null;
    if (o.tag) {
      tag = G.nameTag(NAMES[id] || id.toUpperCase(), TAGS[id] || '#ffffff');
      tag.position.y = 2.75;
      tag.material.depthTest = false;
      tag.renderOrder = 5;
      outer.add(tag);
    }
    const scale = o.scale || 1;
    outer.scale.setScalar(scale);
    shadow.scale.setScalar(scale);
    return { id, outer, yawG, bankG, p, skis, poles, shadow, tag, scale, bank: 0, spin: 0, ph: Math.random() * 6, lastYaw: 0, spray: 0 };
  }

  function add(m, scene) { scene.add(m.outer); scene.add(m.shadow); }
  function remove(m, scene) { scene.remove(m.outer); scene.remove(m.shadow); }

  // the skiing stance: knees soft, leaning forward, poles back; tucked = low and small with the hands in front
  function skiPose(m, tuck, k) {
    const p = m.p;
    const to = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    const lean = tuck ? -0.82 : -0.32;
    to(p.hips.rotation, 'x', lean);
    to(p.hips.rotation, 'y', 0);
    const leg = -lean + (tuck ? 0.22 : 0.1);
    to(p.legL.rotation, 'x', leg);
    to(p.legR.rotation, 'x', leg);
    const arm = tuck ? 1.3 : 0.55 + Math.sin(m.ph * 2) * 0.05;
    to(p.armL.rotation, 'x', arm);
    to(p.armR.rotation, 'x', arm);
    to(p.armL.rotation, 'z', tuck ? 0.12 : -0.25);
    to(p.armR.rotation, 'z', tuck ? -0.12 : 0.25);
    to(p.head.rotation, 'x', -lean * 0.8); // chin up, eyes down the hill
    p.hips.position.y += (p.hipY - (tuck ? 0.13 : 0.04) - p.hips.position.y) * k;
    for (const f of p.fingers) f.visible = false;
    p.rig.scale.setScalar(1);
  }
  function polesBack(m) {
    const p = m.p;
    m.poles.forEach((pole, i) => {
      const arm = i ? p.armR : p.armL;
      pole.rotation.x = -0.5 - arm.rotation.x - p.hips.rotation.x;
      pole.visible = true;
    });
  }

  const tmp = new T.Vector3();
  // put a skier where the race has him; returns the world position
  function place(m, sk, dt, course) {
    m.ph += dt * (2 + sk.v * 0.2);
    const pos = SKI.world.at(sk.s, sk.x, sk.hr, tmp);
    m.outer.position.copy(pos);
    // pitch with the slope (and the ramps), nose up while flying up
    const slope = Math.atan(SKI.courses.GRADE);
    let pitch = -slope;
    if (sk.onRamp) pitch += Math.atan(sk.onRamp.h / sk.onRamp.len);
    if (sk.air) pitch += Math.max(-0.35, Math.min(0.35, sk.vh * 0.04));
    m.outer.rotation.x += (pitch - m.outer.rotation.x) * Math.min(1, dt * 12);
    // heading and lean into the turn
    m.yawG.rotation.y = -sk.yaw;
    const turnRate = (sk.yaw - m.lastYaw) / Math.max(dt, 1e-3);
    m.lastYaw = sk.yaw;
    m.bank += (Math.max(-0.45, Math.min(0.45, -turnRate * 0.18 - sk.yaw * 0.25)) - m.bank) * Math.min(1, dt * 8);
    m.bankG.rotation.z = m.bank;
    // tricks: a spin, and the boys' own move up in the air
    const k = 1 - Math.exp(-14 * dt);
    if (sk.trick) {
      m.spin = Math.min(1, sk.trick.t / SKI.race.PHYS.trickTime) * Math.PI * 2;
      m.p.root.rotation.y = m.spin;
      const mode = m.id === 'tommy' ? 'peace' : m.id === 'teddy' ? 'jumpshot' : 'jump';
      Kit.people.pose(m.p, m.ph, mode, k);
      m.poles.forEach((pl) => { pl.visible = mode === 'jump'; });
    } else {
      m.p.root.rotation.y *= 1 - Math.min(1, dt * 10);
      if (sk.bonkT > 0.3) Kit.people.pose(m.p, m.ph, 'fall', k);
      else if (sk.air) { skiPose(m, false, k); m.p.armL.rotation.z += (-1.0 - m.p.armL.rotation.z) * k; m.p.armR.rotation.z += (1.0 - m.p.armR.rotation.z) * k; }
      else skiPose(m, sk.tucking, k);
      polesBack(m);
    }
    // shadow on the snow
    const gy = SKI.world.snowY(course, sk.s, sk.x);
    const lift = Math.max(0, pos.y - gy);
    m.shadow.position.set(pos.x, gy + 0.04, pos.z);
    m.shadow.scale.setScalar(m.scale * Math.max(0.35, 1 - lift * 0.12));
    m.shadow.material.opacity = Math.max(0.25, 1 - lift * 0.15);
    // snow spray: carving hard, tucking fast, bonks
    m.spray += dt * (Math.abs(turnRate) * 14 + (sk.v > 17 ? 6 : 0));
    if (!sk.air && sk.v > 2 && m.spray > 1) {
      const n = Math.min(4, Math.floor(m.spray));
      m.spray -= n;
      const dir = new T.Vector3(Math.cos(sk.yaw) * -Math.sign(turnRate || 1) * 1.5, 0, 1);
      SKI.world.puff(tmp.set(pos.x, pos.y + 0.1, pos.z + 0.6), n, dir);
    }
    return pos;
  }

  // standing still: the count-in, the finish, celebrations, the brother's visit
  function act(m, mode, dt, k) {
    m.ph += dt * 3;
    const kk = k === undefined ? 1 - Math.exp(-12 * dt) : k;
    m.p.root.rotation.y *= 1 - Math.min(1, dt * 10);
    if (mode === 'stand' || mode === 'ready') {
      skiPose(m, mode === 'ready', kk);
      polesBack(m);
      return;
    }
    if (mode === 'tuck') { skiPose(m, true, kk); polesBack(m); return; }
    Kit.people.pose(m.p, m.ph * (mode === 'boxing' ? 1.6 : 1.4), mode, kk);
    // the legs straight down onto the skis (the kit's walking legs would lift the skis)
    m.p.legL.rotation.x += (0.12 - m.p.legL.rotation.x) * kk;
    m.p.legR.rotation.x += (0.12 - m.p.legR.rotation.x) * kk;
    m.poles.forEach((pl) => { pl.visible = false; });
  }

  // a standing skier at (s, x) facing a direction (for the brother's visit and the finish)
  function stand(m, s, x, hr, yaw, course) {
    const pos = SKI.world.at(s, x, hr, tmp);
    m.outer.position.copy(pos);
    m.outer.rotation.x = -Math.atan(SKI.courses.GRADE);
    m.yawG.rotation.y = -yaw;
    m.bankG.rotation.z *= 0.9;
    const gy = SKI.world.snowY(course, s, x);
    m.shadow.position.set(pos.x, gy + 0.04, pos.z);
    m.shadow.scale.setScalar(m.scale);
    return pos;
  }

  SKI.skier = { make, add, remove, place, act, stand, NAMES, TAGS };
})();
