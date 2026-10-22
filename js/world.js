/* TT Ski Downhill: the 3D world. The snowy slope with its fences, pine trees, gates, ramps, moguls and snowmen, the
   start hut and the finish arch, the sky and far mountains, falling snow, snow spray, and the cameras.
   The race lives in js/ski.js: a skier at (s, x) with height hr stands at world (x, baseY(s) + hr, -s),
   so the slope runs downhill toward -z and the cameras look down it. */
(function () {
  'use strict';
  const SKI = (window.SKI = window.SKI || {});
  const T = THREE;
  const G = Kit.gfx;
  const C = () => SKI.courses;

  let renderer, scene, far, courseGroup, flakes, spray, burstPts;
  let course = null;
  const gateViews = [];
  let finishBanner = null, startBanner = null;

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setScissorTest(true);
    scene = new T.Scene();
    scene.fog = new T.Fog('#dff1ff', 70, 330);
    scene.add(new T.HemisphereLight('#dff0ff', '#9bb4d6', 0.85));
    const sun = new T.DirectionalLight('#fff6e6', 0.75);
    sun.position.set(-30, 60, 20);
    scene.add(sun);
    far = new T.Group();
    scene.add(far);
    buildFar();
    buildFlakes();
    buildSpray();
    Kit.lang.onChange(() => { drawBanner(startBanner, 'START'); drawBanner(finishBanner, 'FINISH'); });
  }

  // ---------------------------------------------------------------- the far things: sky dome, sun, mountains (they follow the camera)
  let skyMat, sunSprite;
  const mountains = [];
  function buildFar() {
    const geo = new T.SphereGeometry(900, 24, 16);
    const col = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    skyMat = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false });
    const sky = new T.Mesh(geo, skyMat);
    sky.renderOrder = -2;
    far.add(sky);
    sunSprite = new T.Sprite(new T.SpriteMaterial({ map: G.glowTexture(), color: '#fff3c0', fog: false, depthWrite: false, transparent: true }));
    sunSprite.scale.setScalar(260);
    sunSprite.position.set(-260, 260, -620);
    far.add(sunSprite);
    const rock = new T.MeshLambertMaterial({ color: '#8a9cc4', fog: false });
    const cap = new T.MeshLambertMaterial({ color: '#ffffff', fog: false });
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.95 + (i / 15) * Math.PI * 0.9 + (Math.random() - 0.5) * 0.1;
      const r = 620 + Math.random() * 120, h = 140 + Math.random() * 160, w = 150 + Math.random() * 110;
      const m = new T.Group();
      const base = new T.Mesh(new T.ConeGeometry(w, h, 5 + (i % 3)), rock);
      base.position.y = h / 2;
      m.add(base);
      const top = new T.Mesh(new T.ConeGeometry(w * 0.42, h * 0.42, 5 + (i % 3)), cap);
      top.position.y = h - h * 0.21 + 0.5;
      m.add(top);
      m.position.set(Math.sin(a) * r, -230, Math.cos(a) * r - 120);
      m.rotation.y = Math.random() * 3;
      far.add(m);
      mountains.push(m);
    }
  }
  function setSky(top, bottom, sunCol) {
    const geo = far.children[0].geometry, pos = geo.attributes.position, col = geo.attributes.color;
    const a = new T.Color(top), b = new T.Color(bottom), c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900;
      c.copy(b).lerp(a, Math.max(0, Math.min(1, y * 1.6 + 0.1)));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    scene.fog.color.set(bottom);
    sunSprite.material.color.set(sunCol);
  }

  // ---------------------------------------------------------------- the snow under your skis
  function snowTexture() {
    const [c, g] = G.makeCanvas(256, 256);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    // groomed corduroy lines down the slope
    for (let x = 0; x < 256; x += 8) {
      g.fillStyle = x % 16 ? 'rgba(170, 195, 230, 0.10)' : 'rgba(170, 195, 230, 0.18)';
      g.fillRect(x, 0, 3, 256);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(150, 180, 225, 0.16)' : 'rgba(255, 255, 255, 0.9)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const t = G.toTexture(c, true);
    t.repeat.set(12, 1);
    t.anisotropy = 4;
    return t;
  }
  let snowMap = null;

  // the snow's height at (s, x), bumps included but not the ramps (they're their own meshes); banks rise past the fences
  function snowY(c, s, x) {
    const gr = C().ground(c, s, x);
    const edge = Math.abs(x) - (c.W / 2 + 2);
    return C().baseY(c, s) + (gr.ramp ? 0 : gr.g) + (edge > 0 ? Math.pow(edge, 1.25) * 0.32 : 0);
  }

  function buildSlope(c, group) {
    if (!snowMap) snowMap = snowTexture();
    const mat = new T.MeshLambertMaterial({ map: snowMap, vertexColors: true });
    const HALF = 60;
    const white = new T.Color('#ffffff'), blue = new T.Color('#dce8fb'), off = new T.Color('#eef4ff');
    for (let s0 = -80; s0 < c.L + 220; s0 += 100) {
      const fine = c.moguls.some((m) => m.s > s0 - 3 && m.s < s0 + 103);
      const nx = 64, ns = fine ? 125 : 25;
      const geo = new T.PlaneGeometry(HALF * 2, 100, nx, ns);
      geo.rotateX(-Math.PI / 2); // flat, with +z toward the camera; the row at z = +50 is s0
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const tmp = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), s = s0 + (50 - pos.getZ(i));
        const y = snowY(c, s, x);
        pos.setXYZ(i, x, y, -s);
        const bump = y - C().baseY(c, s);
        tmp.copy(Math.abs(x) > c.W / 2 + 1 ? off : white).lerp(blue, Math.max(0, Math.min(1, Math.abs(x) > c.W / 2 + 1 ? 0.3 : bump * 0.9)));
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new T.Mesh(geo, mat);
      group.add(m);
    }
  }

  // ---------------------------------------------------------------- fences, trees, gates, ramps, snowmen, start and finish
  function netTexture() {
    const [c, g] = G.makeCanvas(64, 32);
    g.strokeStyle = '#ff6a1a';
    g.lineWidth = 3;
    for (let x = -32; x < 96; x += 10) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 32); g.stroke();
      g.beginPath(); g.moveTo(x + 32, 0); g.lineTo(x, 32); g.stroke();
    }
    g.fillStyle = '#ff6a1a';
    g.fillRect(0, 0, 64, 4);
    const t = G.toTexture(c, true);
    return t;
  }
  function buildFences(c, group) {
    const mat = new T.MeshBasicMaterial({ map: netTexture(), transparent: true, side: T.DoubleSide, alphaTest: 0.3 });
    mat.map.repeat.set(c.L / 4, 1);
    for (const side of [-1, 1]) {
      const x = side * (c.W / 2);
      const pts = [], uv = [], idx = [];
      const n = Math.ceil((c.L + 60) / 5);
      for (let k = 0; k <= n; k++) {
        const s = -10 + k * 5, y = snowY(c, s, x);
        pts.push(x, y + 0.05, -s, x, y + 1.1, -s);
        uv.push(k / n, 0, k / n, 1);
        if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      group.add(new T.Mesh(geo, mat));
    }
    const posts = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.05, 1.3, 6), new T.MeshLambertMaterial({ color: '#3a3f55' }), Math.ceil((c.L + 60) / 10) * 2 + 2);
    const m4 = new T.Matrix4();
    let k = 0;
    for (let s = -10; s <= c.L + 50; s += 10) for (const side of [-1, 1]) {
      m4.makeTranslation(side * c.W / 2, snowY(c, s, side * c.W / 2) + 0.6, -s);
      posts.setMatrixAt(k++, m4);
    }
    posts.count = k;
    group.add(posts);
  }

  // merge plain geometries into one, each with its own vertex colour
  function merge(parts) {
    const pos = [], nor = [], col = [];
    for (const [geo, color] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const c = new T.Color(color);
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  let treeGeo = null;
  function pineGeo() {
    if (treeGeo) return treeGeo;
    const parts = [[new T.CylinderGeometry(0.22, 0.3, 1.2, 6).translate(0, 0.6, 0), '#6b4426']];
    const layers = [[2.1, 2.2, 1.0], [1.7, 2.0, 2.2], [1.25, 1.8, 3.3], [0.8, 1.5, 4.3]];
    for (const [r, h, y] of layers) {
      parts.push([new T.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), '#2f7d4f']);
      parts.push([new T.ConeGeometry(r * 0.62, h * 0.42, 7).translate(0, y + h * 0.79, 0), '#ffffff']);
    }
    treeGeo = merge(parts);
    return treeGeo;
  }
  function buildTrees(c, group, rand) {
    const n = Math.round((c.L + 300) * 0.55 * c.trees);
    const trees = new T.InstancedMesh(pineGeo(), new T.MeshLambertMaterial({ vertexColors: true }), n);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (c.W / 2 + 2.5 + Math.pow(rand(), 1.6) * 36);
      const s = -60 + rand() * (c.L + 260);
      const k = 0.8 + rand() * 0.9;
      v.set(x, snowY(c, s, x) - 0.2, -s);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * 6.28);
      sc.set(k, k * (0.9 + rand() * 0.3), k);
      m4.compose(v, q, sc);
      trees.setMatrixAt(i, m4);
    }
    group.add(trees);
  }

  function flagTexture(color) {
    const [c, g] = G.makeCanvas(64, 48);
    g.fillStyle = color === 'red' ? '#ef3a3a' : '#2f6bff';
    g.fillRect(0, 0, 64, 48);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 20, 64, 8);
    return G.toTexture(c);
  }
  const flagTex = {};
  function buildGates(c, group) {
    gateViews.length = 0;
    const poleGeo = new T.CylinderGeometry(0.05, 0.05, 1.9, 6).translate(0, 0.95, 0);
    const panelGeo = new T.PlaneGeometry(0.85, 0.6);
    for (const color of ['red', 'blue']) if (!flagTex[color]) flagTex[color] = flagTexture(color);
    for (const gt of c.gates) {
      const grp = new T.Group();
      const mats = [];
      for (const side of [-1, 1]) {
        const x = gt.x + side * gt.w / 2;
        const y = snowY(c, gt.s, x);
        const pm = new T.MeshLambertMaterial({ color: gt.color === 'red' ? '#ef3a3a' : '#2f6bff' });
        const pole = new T.Mesh(poleGeo, pm);
        pole.position.set(x, y, -gt.s);
        grp.add(pole);
        const fm = new T.MeshLambertMaterial({ map: flagTex[gt.color], side: T.DoubleSide });
        const panel = new T.Mesh(panelGeo, fm);
        panel.position.set(x - side * 0.45, y + 1.5, -gt.s);
        grp.add(panel);
        mats.push(pm, fm);
      }
      group.add(grp);
      gateViews.push({ gate: gt, grp, mats, state: null, t: 0 });
    }
  }
  // a gate goes gold and wiggles when passed, grey when missed
  function gateResult(i, ok) {
    const gv = gateViews[i];
    if (!gv || gv.state) return;
    gv.state = ok ? 'pass' : 'miss';
    gv.t = 0;
    for (const m of gv.mats) {
      if (ok) m.emissive && m.emissive.set('#5a4400');
      else { m.color.set('#9aa0ad'); if (m.map) m.map = null; m.needsUpdate = true; }
    }
    const p = gv.grp.children[0].position.clone().lerp(gv.grp.children[2].position, 0.5);
    burst(p.add(new T.Vector3(0, 1.2, 0)), ok ? '#ffd400' : '#c8ccd8', ok ? 18 : 8, 3, 3);
  }
  function resetGates() {
    for (const gv of gateViews) {
      gv.state = null;
      gv.mats.forEach((m, k) => {
        if (k % 2 === 0) m.color.set(gv.gate.color === 'red' ? '#ef3a3a' : '#2f6bff');
        else { m.color.set('#ffffff'); m.map = flagTex[gv.gate.color]; m.needsUpdate = true; }
        if (m.emissive) m.emissive.set('#000000');
      });
    }
  }

  function buildRamps(c, group) {
    const top = new T.MeshLambertMaterial({ color: '#f4f9ff' });
    const sideM = new T.MeshLambertMaterial({ color: '#cfe0f7' });
    const stripe = new T.MeshLambertMaterial({ color: '#ff5a3c' });
    for (const j of c.jumps) {
      const y0 = C().baseY(c, j.s), y1 = C().baseY(c, j.s + j.len);
      const hw = j.w / 2;
      // a wedge: flat on the slope at the start, j.h high at the lip
      const v = [
        [-hw, y0, -j.s], [hw, y0, -j.s], [-hw, y1 + j.h, -(j.s + j.len)], [hw, y1 + j.h, -(j.s + j.len)],
        [-hw, y1, -(j.s + j.len)], [hw, y1, -(j.s + j.len)],
      ].map((p) => new T.Vector3(p[0] + j.x, p[1], p[2]));
      const tri = (a, b, cc) => [v[a], v[b], v[cc]];
      const faces = [tri(0, 2, 1), tri(1, 2, 3), tri(4, 5, 2), tri(5, 3, 2), tri(0, 4, 2), tri(1, 3, 5)];
      const geoTop = new T.BufferGeometry().setFromPoints(faces.slice(0, 2).flat());
      geoTop.computeVertexNormals();
      const geoSide = new T.BufferGeometry().setFromPoints(faces.slice(2).flat());
      geoSide.computeVertexNormals();
      group.add(new T.Mesh(geoTop, top));
      group.add(new T.Mesh(geoSide, sideM));
      // the orange lip and two little flags
      const lip = new T.Mesh(new T.BoxGeometry(j.w, 0.12, 0.3), stripe);
      lip.position.set(j.x, y1 + j.h + 0.02, -(j.s + j.len) + 0.15);
      group.add(lip);
      for (const s of [-1, 1]) {
        const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.6, 6), new T.MeshLambertMaterial({ color: '#ffffff' }));
        pole.position.set(j.x + s * (hw + 0.4), y1 + 0.8, -(j.s + j.len));
        group.add(pole);
        const flag = new T.Mesh(new T.PlaneGeometry(0.6, 0.4), new T.MeshLambertMaterial({ color: '#ffd400', side: T.DoubleSide }));
        flag.position.set(j.x + s * (hw + 0.7), y1 + 1.4, -(j.s + j.len));
        group.add(flag);
      }
    }
  }

  function makeSnowman() {
    const g = new T.Group();
    const snow = new T.MeshLambertMaterial({ color: '#ffffff' }), coal = new T.MeshLambertMaterial({ color: '#1b1a22' });
    [[0.75, 0.6], [0.55, 1.6], [0.4, 2.35]].forEach(([r, y]) => G.mesh(new T.SphereGeometry(r, 14, 10), snow, 0, y, 0, g, false));
    const nose = G.mesh(new T.ConeGeometry(0.08, 0.4, 8), new T.MeshLambertMaterial({ color: '#ff8a1f' }), 0, 2.35, 0.55, g, false);
    nose.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) G.mesh(new T.SphereGeometry(0.05, 6, 4), coal, s * 0.14, 2.47, 0.35, g, false);
    G.mesh(new T.CylinderGeometry(0.3, 0.3, 0.05, 12), coal, 0, 2.7, 0, g, false);
    G.mesh(new T.CylinderGeometry(0.22, 0.22, 0.4, 12), coal, 0, 2.92, 0, g, false);
    G.mesh(new T.TorusGeometry(0.42, 0.08, 6, 14), new T.MeshLambertMaterial({ color: '#e8382f' }), 0, 2.0, 0, g, false).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const arm = G.mesh(new T.CylinderGeometry(0.03, 0.03, 0.9, 5), new T.MeshLambertMaterial({ color: '#6b4426' }), s * 0.85, 1.75, 0, g, false);
      arm.rotation.z = s * 1.0;
    }
    return g;
  }
  function buildSnowmen(c, group) {
    const tmpl = makeSnowman();
    for (const m of c.snowmen) {
      const s = tmpl.clone();
      s.position.set(m.x, snowY(c, m.s, m.x) - 0.1, -m.s);
      s.rotation.y = Math.PI + (m.x > 0 ? -0.4 : 0.4); // facing up the hill, toward the skiers
      group.add(s);
    }
  }

  function bannerCanvas() {
    const [cv] = G.makeCanvas(512, 96);
    return cv;
  }
  function drawBanner(b, text) {
    if (!b) return;
    const g = b.canvas.getContext('2d');
    g.clearRect(0, 0, 512, 96);
    // checkers at the ends
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#14121f' : '#ffffff';
      g.fillRect(i * 16, j * 48, 16, 48);
      g.fillRect(448 + i * 16, j * 48, 16, 48);
    }
    g.fillStyle = b.color;
    g.fillRect(64, 0, 384, 96);
    g.font = `52px ${G.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#14121f';
    const t = Kit.lang.t(text);
    g.strokeText(t, 256, 52);
    g.fillStyle = '#ffffff';
    g.fillText(t, 256, 52);
    b.tex.needsUpdate = true;
  }
  function buildStartFinish(c, group) {
    const wood = new T.MeshLambertMaterial({ color: '#a86a3a' }), roof = new T.MeshLambertMaterial({ color: '#e8382f' });
    // the start hut, up the hill behind the line
    const yS = C().baseY(c, -9);
    const hut = new T.Group();
    G.mesh(new T.BoxGeometry(5, 3, 4), wood, 0, 1.5, 0, hut, false);
    const r = G.mesh(new T.ConeGeometry(4.2, 2, 4), roof, 0, 4, 0, hut, false);
    r.rotation.y = Math.PI / 4;
    G.mesh(new T.BoxGeometry(1.4, 2, 0.1), new T.MeshLambertMaterial({ color: '#5a3a22' }), 0, 1, -2.02, hut, false);
    hut.position.set(c.W / 2 - 4, yS, 9);
    group.add(hut);
    const banner = (s, text, color, width) => {
      const cv = bannerCanvas();
      const tex = G.toTexture(cv);
      const b = { canvas: cv, tex, color };
      drawBanner(b, text);
      const y = C().baseY(c, s);
      const grp = new T.Group();
      for (const side of [-1, 1]) G.mesh(new T.CylinderGeometry(0.18, 0.18, 4.6, 8), new T.MeshLambertMaterial({ color: '#ffffff' }), side * width / 2, 2.3, 0, grp, false);
      const ban = new T.Mesh(new T.PlaneGeometry(width, width * 96 / 512), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide, transparent: true }));
      ban.position.y = 4.6 - width * 48 / 512;
      grp.add(ban);
      grp.position.set(0, y, -s);
      group.add(grp);
      return b;
    };
    startBanner = banner(0, 'START', '#2fae5a', 12);
    finishBanner = banner(c.L, 'FINISH', '#e8382f', c.W - 2);
    // the finish line painted across the snow
    const line = new T.Mesh(new T.PlaneGeometry(c.W, 0.6), new T.MeshBasicMaterial({ color: '#e8382f' }));
    line.rotation.x = -Math.PI / 2 + Math.atan(C().GRADE);
    line.position.set(0, C().baseY(c, c.L) + 0.03, -c.L);
    group.add(line);
    // cheering friends behind the fences near the finish
    const fans = ['🐧', '🦌', '🐻‍❄️', '🐰', '🦉', '🐿️', '🐧', '🐻'];
    fans.forEach((e, i) => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: G.emojiTexture(e), transparent: true }));
      const side = i % 2 ? 1 : -1, s = c.L - 60 + i * 14, x = side * (c.W / 2 + 2 + (i % 3));
      sp.scale.setScalar(1.6);
      sp.position.set(x, snowY(c, s, x) + 0.9, -s);
      sp.userData.hop = i * 0.7;
      sp.userData.y0 = sp.position.y;
      group.add(sp);
      fanSprites.push(sp);
    });
  }
  const fanSprites = [];

  function setCourse(c) {
    if (courseGroup) {
      scene.remove(courseGroup);
      courseGroup.traverse((o) => { if (o.geometry && o.geometry !== treeGeo) o.geometry.dispose(); });
    }
    fanSprites.length = 0;
    course = c;
    courseGroup = new T.Group();
    const rand = C().rng(c.seed * 101);
    buildSlope(c, courseGroup);
    buildFences(c, courseGroup);
    buildTrees(c, courseGroup, rand);
    buildGates(c, courseGroup);
    buildRamps(c, courseGroup);
    buildSnowmen(c, courseGroup);
    buildStartFinish(c, courseGroup);
    scene.add(courseGroup);
    setSky(c.sky[0], c.sky[1], c.sun);
  }

  // ---------------------------------------------------------------- falling snow, spray and bursts
  function buildFlakes() {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    flakes = new T.Points(geo, new T.PointsMaterial({ map: G.dotTexture(), size: 0.22, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.9 }));
    flakes.frustumCulled = false;
    scene.add(flakes);
  }
  function buildSpray() {
    const make = (n, size) => {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new T.Points(geo, new T.PointsMaterial({ map: G.dotTexture(), size, transparent: true, depthWrite: false, vertexColors: true }));
      pts.frustumCulled = false;
      pts.userData.parts = [];
      pts.userData.n = n;
      scene.add(pts);
      return pts;
    };
    spray = make(500, 0.32);
    burstPts = make(300, 0.4);
  }
  function emit(pts, p, v, life, color) {
    const parts = pts.userData.parts;
    if (parts.length >= pts.userData.n) parts.shift();
    parts.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life, max: life, c: new T.Color(color) });
  }
  const tv = new T.Vector3(), tp = new T.Vector3();
  // a puff of snow from the skis
  function puff(p, amount, dir) {
    for (let i = 0; i < amount; i++) {
      tv.set((Math.random() - 0.5) * 2 + (dir ? dir.x : 0), 1 + Math.random() * 2.2, (Math.random() - 0.5) * 2 + (dir ? dir.z : 0));
      emit(spray, p, tv, 0.5 + Math.random() * 0.5, '#ffffff');
    }
  }
  function burst(p, color, n, speed, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      tv.set(Math.cos(a) * speed * Math.random(), up * (0.5 + Math.random()), Math.sin(a) * speed * Math.random());
      emit(burstPts, p, tv, 0.6 + Math.random() * 0.5, color);
    }
  }
  function updateParts(pts, dt, grav) {
    const parts = pts.userData.parts, pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy -= grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    }
    for (let i = 0; i < pts.userData.n; i++) {
      const q = parts[i];
      if (q) {
        pos.setXYZ(i, q.x, q.y, q.z);
        const f = Math.min(1, q.life / q.max * 2);
        col.setXYZ(i, q.c.r * f + (1 - f), q.c.g * f + (1 - f), q.c.b * f + (1 - f));
      } else pos.setXYZ(i, 0, -1e5, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ---------------------------------------------------------------- each frame
  let clock = 0;
  function update(dt, cam) {
    clock += dt;
    updateParts(spray, dt, 6);
    updateParts(burstPts, dt, 8);
    // snow falls around the camera
    const pos = flakes.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 2.2;
      if (y < -8) y += 30;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(clock * 0.7 + i) * dt * 0.3);
    }
    pos.needsUpdate = true;
    if (cam) {
      flakes.position.set(Math.round(cam.position.x / 70) * 70, cam.position.y - 10, cam.position.z);
      far.position.copy(cam.position);
    }
    for (const gv of gateViews) {
      if (gv.state === 'pass' && gv.t < 0.8) {
        gv.t += dt;
        const w = Math.sin(gv.t * 30) * (0.8 - gv.t) * 0.25;
        gv.grp.children.forEach((ch, k) => { if (k % 2) ch.rotation.y = w; });
      }
    }
    for (const sp of fanSprites) sp.position.y = sp.userData.y0 + Math.max(0, Math.sin(clock * 6 + sp.userData.hop)) * 0.45; // hopping with joy
  }

  // world position of a skier at (s, x, hr)
  function at(s, x, hr, out) {
    return (out || new T.Vector3()).set(x, C().baseY(course, s) + hr, -s);
  }

  function render(views) {
    const W = renderer.domElement.clientWidth, Hh = renderer.domElement.clientHeight;
    renderer.setSize(W, Hh, false);
    for (const v of views) {
      const x = Math.round(v.x * W), y = Math.round(v.y * Hh), w = Math.round(v.w * W), h = Math.round(v.h * Hh);
      renderer.setViewport(x, Hh - y - h, w, h);
      renderer.setScissor(x, Hh - y - h, w, h);
      v.cam.aspect = w / Math.max(1, h);
      v.cam.updateProjectionMatrix();
      far.position.copy(v.cam.position);
      flakes.position.set(v.cam.position.x, v.cam.position.y - 10, v.cam.position.z);
      renderer.render(scene, v.cam);
    }
  }

  SKI.world = {
    init, setCourse, update, render, at, puff, burst, gateResult, resetGates, snowY,
    scene: () => scene, renderer: () => renderer, course: () => course,
  };
})();
