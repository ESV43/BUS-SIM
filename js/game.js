/* Game layer for IISER campus — photorealistic assets, HDR env, first-person */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T || !window.__dbg) return;

  const dbg = window.__dbg;
  const scene = dbg.scene;
  const renderer = dbg.renderer;
  const camera = dbg.camera;
  const heightAt = dbg.heightAt;

  // UI hint
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:16px;top:16px;background:rgba(0,0,0,.6);color:#fff;padding:8px 12px;border-radius:8px;font:13px/1.4 system-ui;z-index:1000';
  hint.innerHTML = 'Press <b>G</b> for first-person game mode · <b>Esc</b> to exit · WASD to move · mouse to look<br>Collect flamingos/parrots for points';
  document.body.appendChild(hint);

  // HDR environment for photorealistic PBR
  let pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rgbeLoader = new T.RGBELoader();
  rgbeLoader.load('assets/env/studio_small_03_1k.hdr', (hdr) => {
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    scene.background = new T.Color(0x8fb4c9);
    hdr.dispose();
    pmrem.dispose();
    // upgrade materials a bit
    scene.traverse(o => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
        o.material.envMapIntensity = 0.8;
      }
    });
  });

  // GLTF loader
  const gltfLoader = new T.GLTFLoader();
  const assetGroup = new T.Group();
  assetGroup.name = 'gameAssets';
  scene.add(assetGroup);

  const spawnAt = (url, x, z, scale = 1, rotY = 0) => {
    gltfLoader.load(url, (gltf) => {
      const obj = gltf.scene;
      obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const y = heightAt(x, z) + 0.1;
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      obj.scale.setScalar(scale);
      assetGroup.add(obj);
    }, undefined, (e) => console.warn('GLTF load error', e));
  };

  // Place a few photorealistic props around campus
  // Coordinates are in local scene units (metres)
  const props = [
    {url: 'assets/models/Flamingo.glb', x: 540, z: 250, s: 2.5},
    {url: 'assets/models/Parrot.glb', x: 560, z: 270, s: 1.2},
    {url: 'assets/models/Flamingo.glb', x: -120, z:  -80, s: 2.2},
    {url: 'assets/models/Parrot.glb', x:  200, z:  400, s: 1.4},
  ];
  props.forEach(p => spawnAt(p.url, p.x, p.z, p.s, Math.random()*Math.PI*2));

  // Add 3D sports equipment on pitches for realism
  const sportsGroup = new T.Group();
  sportsGroup.name = 'sportsEquipment';
  scene.add(sportsGroup);
  const makePole = (h=2.5, r=0.04) => {
    const geo = new T.CylinderGeometry(r, r*1.2, h, 8);
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
    const m = new T.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  const makeNet = () => {
    const geo = new T.BoxGeometry(1.0, 1.2, 0.02);
    const mat = new T.MeshStandardMaterial({ color: 0x88ccee, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.6 });
    const m = new T.Mesh(geo, mat);
    m.castShadow = false;
    return m;
  };
  const centroid = poly => {
    let x=0,z=0; poly.forEach(p=>{x+=p[0];z+=p[1];}); return [x/poly.length, z/poly.length];
  };
  (dbg.D.pitches||[]).forEach(p => {
    const poly = p.polygon;
    const [cx, cz] = centroid(poly);
    const y0 = p.level;
    const name = (p.name||'').toLowerCase();
    // fence posts around perimeter
    for (let i=0;i<poly.length;i++){
      const [x,z] = poly[i];
      const pole = makePole(1.2);
      pole.position.set(x, y0+0.6, z);
      sportsGroup.add(pole);
    }
    // court specific equipment
    if (name.includes('volleyball')) {
      const net = makeNet();
      net.position.set(cx, y0+0.6, cz);
      sportsGroup.add(net);
      // posts
      [[-2.0,0],[2.0,0]].forEach(([dx,dz])=>{
        const p2 = makePole(1.1);
        p2.position.set(cx+dx, y0+0.55, cz+dz);
        sportsGroup.add(p2);
      });
    } else if (name.includes('basketball')) {
      const hoop = new T.Mesh(new T.CylinderGeometry(0.3,0.3,0.1,12), new T.MeshStandardMaterial({color:0xff6600,metalness:0.3,roughness:0.5}));
      hoop.position.set(cx, y0+3.0, cz);
      hoop.rotation.z = Math.PI/2;
      sportsGroup.add(hoop);
      const backboard = new T.Mesh(new T.BoxGeometry(1.2,0.9,0.05), new T.MeshStandardMaterial({color:0xdddddd,metalness:0.2,roughness:0.4}));
      backboard.position.set(cx, y0+3.6, cz+0.3);
      sportsGroup.add(backboard);
    } else if (name.includes('football') || name.includes('futsal')) {
      // simple goal frames
      [[-4, -3.5],[4,3.5]].forEach(([dx,dz])=>{
        const left = makePole(2.0);
        left.position.set(cx+dx, y0+1.0, cz+dz);
        sportsGroup.add(left);
        const right = makePole(2.0);
        right.position.set(cx+dx+2.5, y0+1.0, cz+dz);
        sportsGroup.add(right);
        const bar = new T.Mesh(new T.BoxGeometry(2.5,0.08,0.08), new T.MeshStandardMaterial({color:0xffffff,roughness:0.4}));
        bar.position.set(cx+dx+1.25, y0+2.0, cz+dz);
        sportsGroup.add(bar);
      });
    } else if (name.includes('tennis')) {
      const net = makeNet();
      net.scale.set(6,1,1);
      net.position.set(cx, y0+0.5, cz);
      sportsGroup.add(net);
    } else if (name.includes('cricket')) {
      // stumps
      for(let i=-1;i<=1;i++){
        const stump = new T.Mesh(new T.CylinderGeometry(0.05,0.05,0.5,6), new T.MeshStandardMaterial({color:0x8b5a2b}));
        stump.position.set(cx + i*0.12, y0+0.25, cz);
        sportsGroup.add(stump);
      }
    }
  });

  // First-person game controller
  let controls = null;
  let gameActive = false;
  let moveVec = new T.Vector3();
  let vel = new T.Vector3();
  let onGround = false;
  const clock = new T.Clock();

  const createControls = () => {
    controls = new T.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());
    renderer.domElement.addEventListener('click', () => {
      if (!gameActive) { controls.lock(); }
    });
    controls.addEventListener('lock', () => { gameActive = true; hint.style.display = 'none'; });
    controls.addEventListener('unlock', () => { gameActive = false; hint.style.display = ''; });
  };
  createControls();

  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyG') {
      if (!controls.isLocked) controls.lock();
    }
    if (e.code === 'Escape') controls.unlock();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Collectibles tracking
  scene.userData.score = 0;
  const scoreEl = document.createElement('div');
  scoreEl.style.cssText = 'position:fixed;right:16px;top:16px;background:rgba(0,0,0,.6);color:#fff;padding:8px 12px;border-radius:8px;font:14px system-ui;z-index:1000';
  scoreEl.textContent = 'Score: 0';
  document.body.appendChild(scoreEl);

  // Simple game loop hook
  const originalAnimate = () => {};
  let last = performance.now();
  function gameTick() {
    requestAnimationFrame(gameTick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last)/1000);
    last = now;
    if (!gameActive || !controls) return;

    const speed = 6.0;
    moveVec.set(0,0,0);
    if (keys['KeyW'] || keys['ArrowUp']) moveVec.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveVec.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveVec.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveVec.x += 1;
    moveVec.normalize();

    const dir = new T.Vector3();
    controls.getDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new T.Vector3().crossVectors(dir, new T.Vector3(0,1,0)).normalize();
    const move = new T.Vector3()
      .addScaledVector(dir, -moveVec.z * speed * dt)
      .addScaledVector(right, moveVec.x * speed * dt);

    const pos = controls.getObject().position;
    pos.x += move.x;
    pos.z += move.z;

    // ground snap
    const groundY = heightAt(pos.x, pos.z) + 1.7;
    if (pos.y > groundY) {
      vel.y -= 25 * dt;
      pos.y += vel.y * dt;
      if (pos.y < groundY) { pos.y = groundY; vel.y = 0; onGround = true; }
    } else {
      pos.y = groundY;
      vel.y = 0;
      onGround = true;
    }

    // simple collect
    assetGroup.children.forEach(child => {
      if (!child.userData.collected && child.position.distanceTo(pos) < 3) {
        child.userData.collected = true;
        scene.userData.score += 10;
        scoreEl.textContent = 'Score: ' + scene.userData.score;
        child.visible = false;
      }
    });
  }
  requestAnimationFrame(gameTick);

  // Terrain material upgrade: add subtle roughness variation for realism
  scene.traverse(o => {
    if (o.name === 'terrain' && o.material && o.material.isMeshStandardMaterial) {
      o.material.roughness = 0.85;
      o.material.metalness = 0.0;
      o.material.envMapIntensity = 0.5;
    }
  });

  console.log('[IISER Game] photorealistic assets loaded, HDR env applied, game mode ready - press G');
})();
