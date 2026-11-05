/* IISER Thiruvananthapuram — 3D GLB Campus & SH-45 Highway Bus Simulator
 * Real .GLB Transit/Coach/College Fleet, 7-Mode Multi-Camera System,
 * Impermeable Spatial-Hashed Multi-Disc Solid Collisions, Exterior SH-45 Highway,
 * 6 Playable Game Modes & Up-to-8-Player Multiplayer (BroadcastChannel + WebSocket + AI Fill). */
(function () {
  'use strict';

  const T = window.THREE;
  const W = window.CampusWorld || window.__dbg;
  if (!T || !W) return;

  const {
    scene, camera, renderer, D, heightAt, roadInfoAt, getSurfaceHeight,
    nightMaterials, unrealFX
  } = W;
  const solidObstacles = W.solidObstacles || [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const normAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  const MAX_PLAYERS = 8;
  const PLAYER_COLORS = [
    { name: 'Royal Blue',   hex: 0x1656b0, css: '#2b7bf6' },
    { name: 'Crimson Red',  hex: 0xc92a2a, css: '#ff4d4d' },
    { name: 'Emerald',      hex: 0x18864b, css: '#2ce080' },
    { name: 'Amber Gold',   hex: 0xd9820f, css: '#ffb020' },
    { name: 'Royal Violet', hex: 0x6f32be, css: '#a463ff' },
    { name: 'Lagoon Cyan',  hex: 0x0d8599, css: '#24d2ee' },
    { name: 'Sunset Coral', hex: 0xd44b1e, css: '#ff7442' },
    { name: 'Magenta Rose', hex: 0xb02876, css: '#ff5cb8' }
  ];

  const worldProps = new T.Group();
  worldProps.name = 'campusStreetInfrastructure';
  scene.add(worldProps);

  // Shared PBR Materials for street infrastructure
  const steelMat = new T.MeshStandardMaterial({ color: 0x566068, roughness: 0.36, metalness: 0.78 });
  steelMat.userData.baseEnvIntensity = 1.1;
  const darkMetalMat = new T.MeshStandardMaterial({ color: 0x22282e, roughness: 0.44, metalness: 0.72 });
  const concreteCleanMat = new T.MeshStandardMaterial({ color: 0xebe5d8, roughness: 0.82, metalness: 0.04 });
  const iiserBlueMat = new T.MeshStandardMaterial({ color: 0x164a8a, roughness: 0.28, metalness: 0.45 });
  iiserBlueMat.userData.baseEnvIntensity = 1.2;
  const iiserGoldMat = new T.MeshStandardMaterial({ color: 0xe3a25b, roughness: 0.34, metalness: 0.58 });
  const shelterGlassMat = new T.MeshStandardMaterial({
    color: 0x8cb8d0, roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.58
  });
  shelterGlassMat.userData.baseEnvIntensity = 1.35;

  const lampBulbMat = new T.MeshStandardMaterial({
    color: 0xfff3d6, roughness: 0.2, emissive: new T.Color(0x000000), emissiveIntensity: 0
  });
  nightMaterials.push({ mat: lampBulbMat, color: new T.Color(0xffcf82), intensity: 3.2 });

  function localToWorldXZ(ox, oz, yaw, lx, lz) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return {
      x: ox + lx * c + lz * s,
      z: oz - lx * s + lz * c
    };
  }

  // --- 1. IISER TVM MAIN GATE ARCHWAY, SECURITY CABIN & AUTOMATIC BOOM BARRIER ---
  let boomArmPivot = null;
  let gateYaw = 0;
  let gateBoomObstacle = null;
  let gateLampMat = null;
  const gatePos = { x: 189.11, z: 551.92 };
  {
    const r0 = D.roads[0].pts;
    const pA = r0[Math.min(6, r0.length - 2)], pB = r0[Math.min(10, r0.length - 1)];
    const gateHeading = Math.atan2(pB[0] - pA[0], pB[1] - pA[1]);
    gateYaw = gateHeading;
    const gy = getSurfaceHeight(gatePos.x, gatePos.z);

    const gate = new T.Group();
    gate.position.set(gatePos.x, gy, gatePos.z);
    gate.rotation.y = gateHeading;

    const spanHalf = 4.95; // Clear 8.4m central dual-lane passage!
    for (const sx of [-1, 1]) {
      const pier = new T.Mesh(new T.BoxGeometry(1.45, 6.8, 1.85), concreteCleanMat);
      pier.position.set(sx * spanHalf, 3.3, 0);
      pier.castShadow = true; pier.receiveShadow = true;
      gate.add(pier);

      const pWorld = localToWorldXZ(gatePos.x, gatePos.z, gateHeading, sx * spanHalf, 0);
      solidObstacles.push({ kind: 'obb', cx: pWorld.x, cz: pWorld.z, hx: 0.78, hz: 0.98, yaw: gateHeading });

      const accent = new T.Mesh(new T.BoxGeometry(1.52, 5.4, 0.45), iiserBlueMat);
      accent.position.set(sx * spanHalf, 3.0, 0);
      gate.add(accent);

      const wall = new T.Mesh(new T.BoxGeometry(11.0, 2.1, 0.42), concreteCleanMat);
      wall.position.set(sx * (spanHalf + 6.1), 1.0, 0);
      wall.castShadow = true; wall.receiveShadow = true;
      gate.add(wall);

      const wWorld = localToWorldXZ(gatePos.x, gatePos.z, gateHeading, sx * (spanHalf + 6.1), 0);
      solidObstacles.push({ kind: 'obb', cx: wWorld.x, cz: wWorld.z, hx: 5.5, hz: 0.35, yaw: gateHeading });
    }

    const header = new T.Mesh(new T.BoxGeometry(spanHalf * 2 + 3.4, 1.35, 2.1), concreteCleanMat);
    header.position.set(0, 7.15, 0);
    header.castShadow = true; header.receiveShadow = true;
    gate.add(header);

    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 160;
    const sg = sc.getContext('2d');
    sg.fillStyle = '#10294a'; sg.fillRect(0, 0, 1024, 160);
    sg.strokeStyle = '#e3a25b'; sg.lineWidth = 6; sg.strokeRect(8, 8, 1008, 144);
    sg.fillStyle = '#f8f3e6';
    sg.font = 'bold 46px system-ui, sans-serif';
    sg.textAlign = 'center';
    sg.fillText('IISER THIRUVANANTHAPURAM', 512, 76);
    sg.fillStyle = '#e3a25b';
    sg.font = '600 24px system-ui, sans-serif';
    sg.fillText('INDIAN INSTITUTE OF SCIENCE EDUCATION AND RESEARCH · VITHURA', 512, 122);
    const signTex = new T.CanvasTexture(sc);
    signTex.encoding = T.sRGBEncoding;
    const signMat = new T.MeshStandardMaterial({
      map: signTex, roughness: 0.35, metalness: 0.15,
      emissiveMap: signTex, emissive: new T.Color(0x000000), emissiveIntensity: 0
    });
    nightMaterials.push({ mat: signMat, color: new T.Color(0xffffff), intensity: 0.75 });

    for (const sz of [-1.07, 1.07]) {
      const board = new T.Mesh(new T.PlaneGeometry(spanHalf * 2 + 1.8, 1.08), signMat);
      board.position.set(0, 7.15, sz);
      if (sz < 0) board.rotation.y = Math.PI;
      gate.add(board);
    }

    const cabin = new T.Mesh(new T.BoxGeometry(2.8, 2.9, 3.2), concreteCleanMat);
    cabin.position.set(-spanHalf - 2.4, 1.45, 2.8);
    cabin.castShadow = true; cabin.receiveShadow = true;
    gate.add(cabin);
    const cabinWorld = localToWorldXZ(gatePos.x, gatePos.z, gateHeading, -spanHalf - 2.4, 2.8);
    solidObstacles.push({ kind: 'obb', cx: cabinWorld.x, cz: cabinWorld.z, hx: 1.45, hz: 1.65, yaw: gateHeading });

    const cabinWin = new T.Mesh(new T.BoxGeometry(2.86, 1.1, 2.4), shelterGlassMat);
    cabinWin.position.set(-spanHalf - 2.4, 1.75, 2.8);
    gate.add(cabinWin);

    const ped = new T.Mesh(new T.BoxGeometry(0.42, 1.12, 0.42), iiserGoldMat);
    ped.position.set(-4.05, 0.56, 2.1);
    ped.castShadow = true;
    gate.add(ped);

    gateLampMat = new T.MeshStandardMaterial({
      color: 0xff3b30, roughness: 0.3, emissive: new T.Color(0xff3b30), emissiveIntensity: 1.8
    });
    const gateLamp = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), gateLampMat);
    gateLamp.position.set(-4.05, 1.2, 2.1);
    gate.add(gateLamp);

    // Full-width boom barrier: spans the complete dual-lane archway (-4.35 .. +4.90 m)
    boomArmPivot = new T.Group();
    boomArmPivot.position.set(-4.35, 1.05, 2.1);
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 32;
    const bg = bc.getContext('2d');
    for (let x = 0; x < 512; x += 32) {
      bg.fillStyle = (x / 32) % 2 === 0 ? '#d93228' : '#f8f8f8';
      bg.fillRect(x, 0, 32, 32);
    }
    const boomTex = new T.CanvasTexture(bc);
    boomTex.encoding = T.sRGBEncoding;
    const arm = new T.Mesh(
      new T.CylinderGeometry(0.055, 0.055, 9.25, 8),
      new T.MeshStandardMaterial({ map: boomTex, roughness: 0.4, metalness: 0.25 })
    );
    arm.rotation.z = -Math.PI / 2;
    arm.position.set(4.62, 0, 0);
    arm.castShadow = true;
    boomArmPivot.add(arm);

    const counterweight = new T.Mesh(new T.BoxGeometry(0.34, 0.26, 0.24), darkMetalMat);
    counterweight.position.set(-0.16, -0.02, 0);
    boomArmPivot.add(counterweight);

    const restPost = new T.Mesh(new T.BoxGeometry(0.12, 1.05, 0.12), darkMetalMat);
    restPost.position.set(4.86, 0.52, 2.1);
    restPost.castShadow = true;
    gate.add(restPost);

    gate.add(boomArmPivot);

    const boomCenter = localToWorldXZ(gatePos.x, gatePos.z, gateYaw, 0.27, 2.1);
    gateBoomObstacle = {
      kind: 'obb', cx: boomCenter.x, cz: boomCenter.z,
      hx: 4.66, hz: 0.14, yaw: gateYaw, label: 'Main Gate boom barrier'
    };

    worldProps.add(gate);
  }

  // --- 2. INSTANCED CAMPUS + SH-45 LED STREETLIGHTS & IMPERMEABLE HILLSIDE GUARDRAILS ---
  {
    const lampCoords = [];
    const railSegs = [];

    for (let ri = 0; ri < D.roads.length; ri++) {
      const r = D.roads[ri];
      if (!r || !r.isDriveable || ri === 15 || !r.pts || r.pts.length < 4) continue;
      let distLamp = 16;
      let distRail = 0;
      const lampStep = (ri === 18 || ri === 16 || ri === 17) ? 46.0 : 38.0;
      for (let i = 1; i < r.pts.length; i++) {
        const p0 = r.pts[i - 1], p1 = r.pts[i];
        const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (seg < 0.2) continue;
        const dx = (p1[0] - p0[0]) / seg, dz = (p1[1] - p0[1]) / seg;
        const nx = -dz, nz = dx;
        const ang = Math.atan2(dx, dz);

        distLamp += seg;
        if (distLamp >= lampStep) {
          distLamp = 0;
          const side = (lampCoords.length % 2 === 0) ? 1 : -1;
          const off = r.width * 0.5 + 0.88;
          const lx = p1[0] + nx * side * off, lz = p1[1] + nz * side * off;
          if (!W.isInsideOtherDriveableRoad || !W.isInsideOtherDriveableRoad(lx, lz, ri, 0.65)) {
            lampCoords.push({ x: lx, y: heightAt(lx, lz), z: lz, rot: ang + (side > 0 ? -Math.PI / 2 : Math.PI / 2) });
            solidObstacles.push({ kind: 'circle', x: lx, z: lz, r: 0.16 });
          }
        }

        distRail += seg;
        if (distRail >= 3.2) {
          distRail = 0;
          for (const side of [-1, 1]) {
            const checkX = p1[0] + nx * side * (r.width * 0.5 + 5.2);
            const checkZ = p1[1] + nz * side * (r.width * 0.5 + 5.2);
            if (p1[2] - heightAt(checkX, checkZ) > 1.85) {
              const gx = p1[0] + nx * side * (r.width * 0.5 + 0.55);
              const gz = p1[1] + nz * side * (r.width * 0.5 + 0.55);
              if (!W.isInsideOtherDriveableRoad || !W.isInsideOtherDriveableRoad(gx, gz, ri, 0.6)) {
                railSegs.push({ x: gx, y: heightAt(gx, gz) + 0.08, z: gz, rot: ang });
                solidObstacles.push({ kind: 'circle', x: gx, z: gz, r: 0.22 });
              }
            }
          }
        }
      }
    }

    const dummy = new T.Object3D();
    if (lampCoords.length) {
      const poleGeo = new T.CylinderGeometry(0.065, 0.105, 6.8, 7);
      poleGeo.translate(0, 3.4, 0);
      const armGeo = new T.BoxGeometry(1.45, 0.08, 0.12);
      armGeo.translate(0.65, 6.75, 0);
      const bulbGeo = new T.BoxGeometry(0.55, 0.07, 0.24);
      bulbGeo.translate(1.22, 6.69, 0);

      const poles = new T.InstancedMesh(poleGeo, steelMat, lampCoords.length);
      const arms = new T.InstancedMesh(armGeo, steelMat, lampCoords.length);
      const bulbs = new T.InstancedMesh(bulbGeo, lampBulbMat, lampCoords.length);
      poles.castShadow = true;
      poles.frustumCulled = false; arms.frustumCulled = false; bulbs.frustumCulled = false;

      for (let i = 0; i < lampCoords.length; i++) {
        const l = lampCoords[i];
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(0, l.rot, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        arms.setMatrixAt(i, dummy.matrix);
        bulbs.setMatrixAt(i, dummy.matrix);
      }
      poles.instanceMatrix.needsUpdate = true;
      arms.instanceMatrix.needsUpdate = true;
      bulbs.instanceMatrix.needsUpdate = true;
      worldProps.add(poles, arms, bulbs);
    }

    if (railSegs.length) {
      const beamGeo = new T.BoxGeometry(0.09, 0.30, 3.35);
      beamGeo.translate(0, 0.62, 0);
      const postGeo = new T.BoxGeometry(0.10, 0.78, 0.10);
      postGeo.translate(0, 0.39, 0);
      const beams = new T.InstancedMesh(beamGeo, steelMat, railSegs.length);
      const posts = new T.InstancedMesh(postGeo, darkMetalMat, railSegs.length);
      beams.castShadow = true; beams.receiveShadow = true;
      beams.frustumCulled = false; posts.frustumCulled = false;
      for (let i = 0; i < railSegs.length; i++) {
        const rs = railSegs[i];
        dummy.position.set(rs.x, rs.y, rs.z);
        dummy.rotation.set(0, rs.rot, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        beams.setMatrixAt(i, dummy.matrix);
        posts.setMatrixAt(i, dummy.matrix);
      }
      beams.instanceMatrix.needsUpdate = true;
      posts.instanceMatrix.needsUpdate = true;
      worldProps.add(beams, posts);
    }
  }

  // --- 3. SPORTS EQUIPMENT ON OUTDOOR COURTS & IMPERMEABLE PARKED CARS ---
  function makeTrafficCar(hexColor) {
    const car = new T.Group();
    const bodyMat = new T.MeshStandardMaterial({ color: hexColor, roughness: 0.20, metalness: 0.65 });
    bodyMat.userData.baseEnvIntensity = 1.25;
    const lower = new T.Mesh(new T.BoxGeometry(1.82, 0.62, 4.30), bodyMat);
    lower.position.y = 0.56; lower.castShadow = true; lower.receiveShadow = true;
    const cabin = new T.Mesh(new T.BoxGeometry(1.58, 0.54, 2.15), bodyMat);
    cabin.position.set(0, 1.12, -0.15); cabin.castShadow = true;
    const glass = new T.Mesh(new T.BoxGeometry(1.62, 0.42, 2.20), shelterGlassMat);
    glass.position.set(0, 1.11, -0.15);
    car.add(lower, cabin, glass);
    for (const [wx, wz] of [[-0.86, 1.32], [0.86, 1.32], [-0.86, -1.32], [0.86, -1.32]]) {
      const wh = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.22, 14), darkMetalMat);
      wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.32, wz);
      car.add(wh);
    }
    return car;
  }

  {
    const whitePaint = new T.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.2 });
    const netMat = new T.MeshStandardMaterial({ color: 0xd8eef8, roughness: 0.7, transparent: true, opacity: 0.58, side: T.DoubleSide });
    for (const p of (D.pitches || [])) {
      const poly = p.polygon;
      let cx = 0, cz = 0;
      for (const q of poly) { cx += q[0]; cz += q[1]; }
      cx /= poly.length; cz /= poly.length;
      const y0 = p.level;
      const name = (p.name || '').toLowerCase();
      if (name.includes('volleyball') || name.includes('tennis')) {
        const span = name.includes('tennis') ? 10.5 : 8.5;
        const h = name.includes('tennis') ? 1.05 : 2.35;
        const net = new T.Mesh(new T.PlaneGeometry(span, 0.95), netMat);
        net.position.set(cx, y0 + h - 0.45, cz);
        worldProps.add(net);
        for (const sx of [-span / 2, span / 2]) {
          const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, h, 8), whitePaint);
          post.position.set(cx + sx, y0 + h / 2, cz);
          post.castShadow = true;
          worldProps.add(post);
          solidObstacles.push({ kind: 'circle', x: cx + sx, z: cz, r: 0.16 });
        }
      } else if (name.includes('basketball')) {
        for (const sz of [-12.5, 12.5]) {
          const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.10, 3.3, 8), steelMat);
          pole.position.set(cx, y0 + 1.65, cz + sz);
          pole.castShadow = true;
          const board = new T.Mesh(new T.BoxGeometry(1.8, 1.05, 0.06), whitePaint);
          board.position.set(cx, y0 + 3.1, cz + sz - Math.sign(sz) * 0.4);
          const rim = new T.Mesh(new T.TorusGeometry(0.24, 0.025, 6, 16), new T.MeshStandardMaterial({ color: 0xff5500 }));
          rim.rotation.x = Math.PI / 2;
          rim.position.set(cx, y0 + 2.85, cz + sz - Math.sign(sz) * 0.72);
          worldProps.add(pole, board, rim);
          solidObstacles.push({ kind: 'circle', x: cx, z: cz + sz, r: 0.22 });
        }
      } else if (name.includes('football') || name.includes('futsal')) {
        const dist = name.includes('futsal') ? 14 : 38;
        const gw = name.includes('futsal') ? 3.2 : 7.3;
        for (const sz of [-dist, dist]) {
          const goal = new T.Group();
          goal.position.set(cx, y0, cz + sz);
          const lPost = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2.4, 8), whitePaint);
          lPost.position.set(-gw / 2, 1.2, 0);
          const rPost = lPost.clone(); rPost.position.x = gw / 2;
          const bar = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, gw, 8), whitePaint);
          bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.4, 0);
          goal.add(lPost, rPost, bar);
          worldProps.add(goal);
          solidObstacles.push({ kind: 'circle', x: cx - gw / 2, z: cz + sz, r: 0.18 });
          solidObstacles.push({ kind: 'circle', x: cx + gw / 2, z: cz + sz, r: 0.18 });
        }
      }
    }

    const carColors = [0xd8dde2, 0x2b4c7e, 0x8c2d2d, 0x3b4248, 0xe8e2d5, 0x2d6b52];
    for (let pi = 0; pi < (D.parking || []).length; pi++) {
      const pk = D.parking[pi];
      let cx = 0, cz = 0;
      for (const q of pk.polygon) { cx += q[0]; cz += q[1]; }
      cx /= pk.polygon.length; cz /= pk.polygon.length;
      for (let c = 0; c < 4; c++) {
        const px = cx + (c - 1.5) * 3.2;
        const pz = cz;
        const ri = roadInfoAt(px, pz);
        if (ri && ri.dist < ri.halfWidth + 2.2) continue; // Keep driveable lanes clear!
        const car = makeTrafficCar(carColors[(pi * 4 + c) % carColors.length]);
        car.position.set(px, getSurfaceHeight(px, pz), pz);
        worldProps.add(car);
        solidObstacles.push({ kind: 'obb', cx: px, cz: pz, hx: 0.92, hz: 2.15, yaw: 0 });
      }
    }
  }

  // --- 4. 16 BUS STOPS (12 CAMPUS + 4 EXTERIOR SH-45 HIGHWAY) & 4 SHUTTLE ROUTES ---
  const FLEET_MASS = { transit: 7800, coach: 11500, college: 6200 };
  const AI_CAR_MASS = 1050;
  const SPEED_LIMIT_CAMPUS = 30 / 3.6; // 30 km/h campus limit
  const SPEED_LIMIT_HWY = 60 / 3.6;    // 60 km/h SH-45 limit
  const FINE_AMOUNT = 150;
  const HIT_FINE = 50;
  const BUS_STOPS = [
    { id: 'gate',         name: 'Main Gate Terminal',              x: 197.5,  z: 534.0,  heading:  0.48 },
    { id: 'arcade',       name: 'Entrance Reception Arcade',       x: 251.5,  z: 461.0,  heading:  0.18 },
    { id: 'stadium',      name: 'Indoor Stadium & Sports Complex', x: 332.9,  z: 459.1,  heading: -0.72 },
    { id: 'anamudi',      name: 'Anamudi BS-MS Hostel',            x: 510.2,  z: 486.7,  heading:  1.31 },
    { id: 'hostels',      name: 'Hostels, CDH-I & Recreation',     x: 521.8,  z: 276.9,  heading: -2.20 },
    { id: 'qpark',        name: 'Q-Park & Cake World',             x: 434.2,  z: 138.0,  heading: -2.42 },
    { id: 'library',      name: 'IISER Central Library',           x: 269.2,  z:  99.2,  heading:  1.09 },
    { id: 'academic',     name: 'Academic Block, LHC & Science',   x: 342.9,  z: -54.4,  heading: -2.34 },
    { id: 'vfr',          name: 'Visitors Forest Retreat',         x: 201.0,  z:  42.0,  heading:  3.10 },
    { id: 'health',       name: 'Health Centre & Shopping Plaza',  x: 116.4,  z: -86.1,  heading: -2.05 },
    { id: 'kathipara',    name: 'Kathipara Football Ground',       x: -82.9,  z: -359.0, heading: -1.62 },
    { id: 'quarters',     name: 'Faculty & Staff Quarters',        x: -466.1, z: -398.8, heading:  2.78 },
    // Exterior SH-45 Vithura–Ponmudi Highway Stops (Outside Main Gate!)
    { id: 'sh45_gate',    name: 'SH-45 Main Gate Highway Jn',      x: 145.0,  z: 556.0,  heading: -1.96 },
    { id: 'vithura_fuel', name: 'Vithura Fuel & KSRTC Stand',      x: -125.0, z: 604.5,  heading: -1.45 },
    { id: 'golden_valley',name: 'Golden Valley Ghat Viewpoint',    x: 416.0,  z: 777.0,  heading:  1.15 },
    { id: 'vithura_west', name: 'Vithura Town West Highway',       x: -485.0, z: 668.0,  heading: -1.72 }
  ];

  const ROUTES = [
    { id: '101', name: 'Route 101 · Main Campus Express',        stops: [0, 1, 2, 3, 4, 5, 6, 7] },
    { id: '202', name: 'Route 202 · Medical, VFR & Shops',       stops: [0, 6, 8, 9, 7, 5, 4] },
    { id: '303', name: 'Route 303 · Western Hilltop Climb',      stops: [7, 9, 10, 11, 10, 8, 6] },
    { id: '404', name: 'Route 404 · SH-45 Vithura–Ponmudi Hwy',  stops: [0, 12, 13, 15, 13, 12, 14, 12, 1, 2] }
  ];

  // --- 4B. SPEED CAMERAS ON CAMPUS SPINE & SH-45 (auto-fine when over the limit) ---
  const SPEED_CAMERAS = [
    { road: 18, at: 0.22, limit: SPEED_LIMIT_HWY },
    { road: 18, at: 0.58, limit: SPEED_LIMIT_HWY },
    { road: 0,  at: 0.33, limit: SPEED_LIMIT_CAMPUS },
    { road: 0,  at: 0.74, limit: SPEED_LIMIT_CAMPUS },
    { road: 16, at: 0.46, limit: SPEED_LIMIT_CAMPUS }
  ];

  function samplePolylineAt(pts, fraction) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let target = total * fraction, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seg >= target && seg > 0.01) {
        const u = (target - acc) / seg;
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
          z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
          heading: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        };
      }
      acc += seg;
    }
    const last = pts[pts.length - 1];
    return { x: last[0], z: last[1], heading: 0 };
  }

  const speedCameraRigs = [];
  function buildSpeedCameras() {
    const poleMat = new T.MeshStandardMaterial({ color: 0x39424a, roughness: 0.42, metalness: 0.68 });
    const boxMat = new T.MeshStandardMaterial({ color: 0xf7b731, roughness: 0.35, metalness: 0.25, emissive: new T.Color(0x3a2704), emissiveIntensity: 0.5 });
    const lensMat = new T.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.9, emissive: new T.Color(0xff3b30), emissiveIntensity: 0.0 });
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256; signCanvas.height = 128;
    const sg = signCanvas.getContext('2d');
    sg.fillStyle = '#f7b731'; sg.fillRect(0, 0, 256, 128);
    sg.fillStyle = '#161616'; sg.fillRect(10, 10, 236, 108);
    sg.fillStyle = '#f7b731'; sg.font = 'bold 44px system-ui, sans-serif'; sg.textAlign = 'center';
    sg.fillText('SPEED', 128, 60);
    sg.fillText('CAMERA', 128, 106);
    const signTex = new T.CanvasTexture(signCanvas);
    signTex.encoding = T.sRGBEncoding;
    const signMat = new T.MeshStandardMaterial({ map: signTex, roughness: 0.5, metalness: 0.05 });

    for (const cam of SPEED_CAMERAS) {
      const road = D.roads[cam.road];
      if (!road || !road.pts || road.pts.length < 4) continue;
      const p = samplePolylineAt(road.pts, cam.at);
      const gy = getSurfaceHeight(p.x, p.z);
      const side = 1;
      const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
      const off = (road.width || 5) * 0.5 + 1.15;
      const rig = new T.Group();
      rig.position.set(p.x + nx * side * off, gy, p.z + nz * side * off);
      rig.rotation.y = p.heading + (side > 0 ? 0 : Math.PI);

      const pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.12, 4.5, 8), poleMat);
      pole.position.y = 2.25; pole.castShadow = true;
      rig.add(pole);

      const arm = new T.Mesh(new T.BoxGeometry(0.18, 0.18, 1.6), poleMat);
      arm.position.set(0, 4.35, -0.7);
      rig.add(arm);

      const head = new T.Mesh(new T.BoxGeometry(0.44, 0.32, 0.72), boxMat);
      head.position.set(0, 4.28, -1.35);
      head.castShadow = true;
      rig.add(head);

      const lens = new T.Mesh(new T.CylinderGeometry(0.095, 0.095, 0.07, 12), lensMat.clone());
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 4.28, -1.73);
      rig.add(lens);

      const sign = new T.Mesh(new T.PlaneGeometry(1.15, 0.58), signMat);
      sign.position.set(0, 2.05, 0.14);
      rig.add(sign);

      worldProps.add(rig);
      cam.wx = p.x; cam.wz = p.z; cam.flash = 0; cam.lastFine = -999; cam.lens = lens;
      speedCameraRigs.push(cam);
    }
  }
  buildSpeedCameras();

  function checkSpeedCameras(t) {
    if (!busState.active) return;
    let anyNear = false;
    for (const cam of speedCameraRigs) {
      if (cam.flash > 0) {
        cam.flash = Math.max(0, cam.flash - 0.03);
        if (cam.lens) cam.lens.material.emissiveIntensity = cam.flash * 2.6;
      }
      const d = Math.hypot(busState.x - cam.wx, busState.z - cam.wz);
      const over = Math.abs(busState.speed) > cam.limit;
      if (d < 130 && over) anyNear = true;
      if (d < 3.6 && over && t - cam.lastFine > 6 && t - busState.lastFineAt > 6) {
        cam.lastFine = t;
        busState.lastFineAt = t;
        cam.flash = 1;
        game.score = Math.max(0, game.score - FINE_AMOUNT);
        busState.fines += 1;
        busState.fineAmount += FINE_AMOUNT;
        flashNotice('Speed camera − fine ₹' + FINE_AMOUNT + ' (' + Math.round(Math.abs(busState.speed) * 3.6) + ' km/h)', 'bad');
      }
    }
    game.nearSpeedCamera = anyNear;
  }

  const stopRingMeshes = [];
  const waitingStudents = [];

  function buildBusStopShelters() {
    const shirtColors = [0xd9534f, 0x337ab7, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xe67e22];
    for (let si = 0; si < BUS_STOPS.length; si++) {
      const st = BUS_STOPS[si];
      const ri = roadInfoAt(st.x, st.z);
      if (ri) {
        st.x = ri.x;
        st.z = ri.z;
        st.y = getSurfaceHeight(st.x, st.z);
        const hA = Math.atan2(ri.tx, ri.tz);
        const hB = Math.atan2(-ri.tx, -ri.tz);
        const diffA = Math.abs(normAng(hA - st.heading));
        st.heading = diffA <= Math.PI * 0.5 ? hA : hB;
      } else {
        st.y = getSurfaceHeight(st.x, st.z);
      }

      const leftX = Math.cos(st.heading), leftZ = -Math.sin(st.heading);
      let offDist = (ri ? ri.halfWidth : 3.2) + 2.25;
      let sx = st.x + leftX * offDist, sz = st.z + leftZ * offDist;
      // Ensure shelter never sits on an intersecting branch road
      const sRi = roadInfoAt(sx, sz);
      if (sRi && sRi.dist < sRi.halfWidth + 1.4) {
        offDist += 2.6;
        sx = st.x + leftX * offDist;
        sz = st.z + leftZ * offDist;
      }
      const sy = Math.max(heightAt(sx, sz), st.y - 0.15);
      const shelterYaw = st.heading - Math.PI / 2;

      const shelter = new T.Group();
      shelter.position.set(sx, sy, sz);
      shelter.rotation.y = shelterYaw;

      const pad = new T.Mesh(new T.BoxGeometry(5.2, 0.24, 2.3), concreteCleanMat);
      pad.position.y = 0.12; pad.receiveShadow = true; pad.castShadow = true;
      shelter.add(pad);

      for (const px of [-2.2, 2.2]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 2.65, 8), darkMetalMat);
        post.position.set(px, 1.45, -0.75);
        post.castShadow = true;
        shelter.add(post);
      }
      const glassBack = new T.Mesh(new T.BoxGeometry(4.3, 2.1, 0.06), shelterGlassMat);
      glassBack.position.set(0, 1.35, -0.75);
      shelter.add(glassBack);

      const roof = new T.Mesh(new T.BoxGeometry(5.4, 0.14, 2.45), iiserBlueMat);
      roof.position.set(0, 2.78, -0.05);
      roof.rotation.x = 0.07;
      roof.castShadow = true;
      shelter.add(roof);

      const ceilingStrip = new T.Mesh(new T.BoxGeometry(3.8, 0.05, 0.18), lampBulbMat);
      ceilingStrip.position.set(0, 2.69, 0.1);
      shelter.add(ceilingStrip);

      const bench = new T.Mesh(new T.BoxGeometry(3.2, 0.10, 0.48), iiserGoldMat);
      bench.position.set(0, 0.62, -0.45);
      bench.castShadow = true;
      shelter.add(bench);

      const totemPole = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 2.8, 8), steelMat);
      totemPole.position.set(2.85, 1.4, 0.65);
      const totemBoard = new T.Mesh(new T.BoxGeometry(0.62, 0.78, 0.08), iiserBlueMat);
      totemBoard.position.set(2.85, 2.45, 0.65);
      shelter.add(totemPole, totemBoard);

      // Register solid OBB for the shelter structure
      solidObstacles.push({ kind: 'obb', cx: sx, cz: sz, hx: 2.65, hz: 1.15, yaw: shelterYaw });

      for (let p = 0; p < 2; p++) {
        const stu = new T.Group();
        const home = new T.Vector3(-0.95 + p * 1.9, 0.24, 0.30);
        stu.position.copy(home);
        const scale = 0.94 + ((si + p) % 3) * 0.035;
        stu.scale.setScalar(scale);

        const pantsMat = new T.MeshStandardMaterial({
          color: [0x263447, 0x3d3d3d, 0x4b3a2c, 0x2d3d34][(si + p) % 4], roughness: 0.92
        });
        const skinMat = new T.MeshStandardMaterial({
          color: [0xc68b63, 0x9b6544, 0xe0b18d, 0x7e4f35][(si * 2 + p) % 4], roughness: 0.72
        });
        const hairMat = new T.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.95 });
        const shirtMat = new T.MeshStandardMaterial({
          color: shirtColors[(si * 2 + p) % shirtColors.length], roughness: 0.78
        });
        const bagMat = new T.MeshStandardMaterial({
          color: [0x1d2a3a, 0x63352f, 0x274b3a, 0x4b3e6b][(si + p) % 4], roughness: 0.8
        });

        const legL = new T.Group();
        legL.position.set(-0.105, 0.74, 0);
        const legLMesh = new T.Mesh(new T.BoxGeometry(0.14, 0.72, 0.16), pantsMat);
        legLMesh.position.y = -0.36; legLMesh.castShadow = true;
        legL.add(legLMesh);
        const legR = new T.Group();
        legR.position.set(0.105, 0.74, 0);
        const legRMesh = new T.Mesh(new T.BoxGeometry(0.14, 0.72, 0.16), pantsMat);
        legRMesh.position.y = -0.36; legRMesh.castShadow = true;
        legR.add(legRMesh);

        const torso = new T.Mesh(new T.BoxGeometry(0.40, 0.56, 0.25), shirtMat);
        torso.position.y = 1.02; torso.castShadow = true;
        const head = new T.Mesh(new T.SphereGeometry(0.135, 12, 10), skinMat);
        head.position.y = 1.50; head.castShadow = true;
        const hair = new T.Mesh(new T.SphereGeometry(0.145, 12, 8), hairMat);
        hair.position.set(0, 1.55, -0.025); hair.scale.set(1.02, 0.62, 1.0);
        const bag = new T.Mesh(new T.BoxGeometry(0.30, 0.36, 0.16), bagMat);
        bag.position.set(0, 1.06, -0.19); bag.castShadow = true;

        const armL = new T.Group();
        armL.position.set(-0.255, 1.22, 0);
        const armLMesh = new T.Mesh(new T.BoxGeometry(0.09, 0.50, 0.10), shirtMat);
        armLMesh.position.y = -0.24;
        armL.add(armLMesh);
        const armR = new T.Group();
        armR.position.set(0.255, 1.22, 0);
        const armRMesh = new T.Mesh(new T.BoxGeometry(0.09, 0.50, 0.10), skinMat);
        armRMesh.position.y = -0.24;
        armR.add(armRMesh);

        stu.add(legL, legR, torso, head, hair, bag, armL, armR);
        shelter.add(stu);
        waitingStudents.push({
          mesh: stu, home, homeRot: Math.sin(si * 1.3 + p) * 0.45,
          stopIndex: si, phase: si * 1.7 + p,
          legL, legR, armL, armR,
          state: 'waiting', walkT: 0, respawnAt: 0
        });
      }

      worldProps.add(shelter);

      const bayRing = new T.Mesh(
        new T.RingGeometry(2.8, 3.35, 40),
        new T.MeshBasicMaterial({ color: 0x3be8b0, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false })
      );
      bayRing.rotation.x = -Math.PI / 2;
      bayRing.position.set(st.x, st.y + 0.12, st.z);
      scene.add(bayRing);
      stopRingMeshes.push(bayRing);
    }
  }
  buildBusStopShelters();

  // --- 4B. SPATIAL-HASHED IMPERMEABLE SOLID-BODY COLLISION ENGINE ---
  const HASH_CELL = 16.0;
  const staticGrid = new Map();
  const dynamicCones = []; // Populated in Precision Parking mode

  function normalizeObstacle(ob) {
    if (!ob) return null;
    if (!ob.kind && ob.type) ob.kind = ob.type;
    if (ob.kind === 'circle') {
      if (ob.x == null) ob.x = ob.cx;
      if (ob.z == null) ob.z = ob.cz;
      if (ob.r == null) ob.r = ob.radius || 0.5;
    } else if (ob.kind === 'obb') {
      if (ob.cx == null) { ob.cx = ob.x; ob.cz = ob.z; }
      if (ob.hx == null) ob.hx = ob.hw != null ? ob.hw : 1;
      if (ob.hz == null) ob.hz = ob.hd != null ? ob.hd : 1;
      if (ob.yaw == null) ob.yaw = ob.cos != null ? Math.atan2(ob.sin || 0, ob.cos) : 0;
    }
    return ob;
  }

  function addObstacleToGrid(ob) {
    ob = normalizeObstacle(ob);
    if (!ob) return;
    let minX, maxX, minZ, maxZ;
    if (ob.kind === 'circle') {
      minX = ob.x - ob.r; maxX = ob.x + ob.r;
      minZ = ob.z - ob.r; maxZ = ob.z + ob.r;
    } else if (ob.kind === 'obb') {
      const ext = Math.hypot(ob.hx, ob.hz);
      ob._cos = Math.cos(ob.yaw || 0);
      ob._sin = Math.sin(ob.yaw || 0);
      minX = ob.cx - ext; maxX = ob.cx + ext;
      minZ = ob.cz - ext; maxZ = ob.cz + ext;
    } else if (ob.kind === 'poly' && ob.ring && ob.ring.length >= 3) {
      minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
      for (const pt of ob.ring) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minZ) minZ = pt[1];
        if (pt[1] > maxZ) maxZ = pt[1];
      }
      ob.minX = minX; ob.maxX = maxX; ob.minZ = minZ; ob.maxZ = maxZ;
    } else {
      return;
    }
    const ix0 = Math.floor(minX / HASH_CELL), ix1 = Math.floor(maxX / HASH_CELL);
    const iz0 = Math.floor(minZ / HASH_CELL), iz1 = Math.floor(maxZ / HASH_CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const key = ix + ',' + iz;
        let bucket = staticGrid.get(key);
        if (!bucket) { bucket = []; staticGrid.set(key, bucket); }
        bucket.push(ob);
      }
    }
  }

  let indexedObstacleCount = 0;
  function syncStaticObstacleGrid() {
    while (indexedObstacleCount < solidObstacles.length) {
      addObstacleToGrid(solidObstacles[indexedObstacleCount++]);
    }
  }
  syncStaticObstacleGrid();
  // Re-sync after vegetation/rocks finish populating asynchronously
  setTimeout(syncStaticObstacleGrid, 2200);
  setTimeout(syncStaticObstacleGrid, 4500);

  function testDiscVsObstacle(px, pz, rad, ob) {
    if (!ob.kind) ob = normalizeObstacle(ob);
    if (!ob) return null;
    if (ob.kind === 'circle') {
      const dx = px - ob.x, dz = pz - ob.z;
      const rr = rad + ob.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return null;
      const d = Math.sqrt(d2);
      if (d < 1e-4) return { nx: 1, nz: 0, pen: rr };
      return { nx: dx / d, nz: dz / d, pen: rr - d };
    }
    if (ob.kind === 'obb') {
      const dx = px - ob.cx, dz = pz - ob.cz;
      const c = ob._cos != null ? ob._cos : Math.cos(ob.yaw || 0);
      const s = ob._sin != null ? ob._sin : Math.sin(ob.yaw || 0);
      // Inverse of localToWorldXZ: lx = dx*c - dz*s, lz = dx*s + dz*c
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const qx = clamp(lx, -ob.hx, ob.hx);
      const qz = clamp(lz, -ob.hz, ob.hz);
      const rx = lx - qx, rz = lz - qz;
      const d2 = rx * rx + rz * rz;
      if (d2 >= rad * rad) return null;
      let lnx, lnz, pen;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        lnx = rx / d; lnz = rz / d; pen = rad - d;
      } else {
        const ox = ob.hx - Math.abs(lx), oz = ob.hz - Math.abs(lz);
        if (ox < oz) {
          lnx = lx >= 0 ? 1 : -1; lnz = 0; pen = ox + rad;
        } else {
          lnx = 0; lnz = lz >= 0 ? 1 : -1; pen = oz + rad;
        }
      }
      return {
        nx: lnx * c + lnz * s,
        nz: -lnx * s + lnz * c,
        pen
      };
    }
    if (ob.kind === 'poly') {
      if (px + rad < ob.minX || px - rad > ob.maxX || pz + rad < ob.minZ || pz - rad > ob.maxZ) return null;
      const ring = ob.ring;
      const inside = W.pointInRing(px, pz, ring);
      let bestD2 = Infinity, nearX = px, nearZ = pz;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], az = ring[j][1];
        const bx = ring[i][0], bz = ring[i][1];
        const abx = bx - ax, abz = bz - az;
        const len2 = abx * abx + abz * abz;
        const t = len2 > 1e-6 ? clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1) : 0;
        const qx = ax + abx * t, qz = az + abz * t;
        const d2 = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
        if (d2 < bestD2) { bestD2 = d2; nearX = qx; nearZ = qz; }
      }
      const d = Math.sqrt(bestD2);
      if (!inside && d >= rad) return null;
      if (inside) {
        const nx = d > 1e-4 ? (nearX - px) / d : 1;
        const nz = d > 1e-4 ? (nearZ - pz) / d : 0;
        return { nx, nz, pen: d + rad };
      }
      const nx = d > 1e-4 ? (px - nearX) / d : 1;
      const nz = d > 1e-4 ? (pz - nearZ) / d : 0;
      return { nx, nz, pen: rad - d };
    }
    return null;
  }

  const BUS_DISC_OFFSETS = [-3.75, -1.88, 0.0, 1.88, 3.75];
  const BUS_DISC_RADIUS = 1.18;
  const BUGGY_DISC_OFFSETS = [-1.45, -0.48, 0.48, 1.45];
  const BUGGY_DISC_RADIUS = 0.72;
  let queryStamp = 1;

  function resolveBusSolidCollisions(stateObj, dynamicObbList) {
    syncStaticObstacleGrid();
    let hitAny = false;
    let strongestPen = 0;
    let wallNx = 0, wallNz = 0;
    let torqueSum = 0;

    for (let iter = 0; iter < 2; iter++) {
      const sinH = Math.sin(stateObj.heading), cosH = Math.cos(stateObj.heading);
      let iterPushX = 0, iterPushZ = 0, iterMaxPen = 0;

      // Gather unique static candidates in 3x3 neighborhood around bus bounding box
      queryStamp = (queryStamp + 1) | 0;
      const cix0 = Math.floor((stateObj.x - 6.0) / HASH_CELL), cix1 = Math.floor((stateObj.x + 6.0) / HASH_CELL);
      const ciz0 = Math.floor((stateObj.z - 6.0) / HASH_CELL), ciz1 = Math.floor((stateObj.z + 6.0) / HASH_CELL);
      const candidates = [];
      for (let ix = cix0; ix <= cix1; ix++) {
        for (let iz = ciz0; iz <= ciz1; iz++) {
          const b = staticGrid.get(ix + ',' + iz);
          if (!b) continue;
          for (let k = 0; k < b.length; k++) {
            const ob = b[k];
            if (ob._q !== queryStamp) {
              ob._q = queryStamp;
              candidates.push(ob);
            }
          }
        }
      }
      for (let k = 0; k < dynamicCones.length; k++) candidates.push(dynamicCones[k]);
      if (dynamicObbList) {
        for (let k = 0; k < dynamicObbList.length; k++) candidates.push(dynamicObbList[k]);
      }

      const discOffsets = stateObj.vehicle === 'buggy' ? BUGGY_DISC_OFFSETS : BUS_DISC_OFFSETS;
      const discRadius = stateObj.vehicle === 'buggy' ? BUGGY_DISC_RADIUS : BUS_DISC_RADIUS;
      for (let di = 0; di < discOffsets.length; di++) {
        const off = discOffsets[di];
        const dx = stateObj.x + sinH * off;
        const dz = stateObj.z + cosH * off;
        for (let ci = 0; ci < candidates.length; ci++) {
          const res = testDiscVsObstacle(dx, dz, discRadius, candidates[ci]);
          if (res && res.pen > iterMaxPen) {
            iterMaxPen = res.pen;
            iterPushX = res.nx * (res.pen + 0.015);
            iterPushZ = res.nz * (res.pen + 0.015);
            wallNx = res.nx;
            wallNz = res.nz;
            // Cross product of lever arm (sinH*off, cosH*off) and normal gives steering deflection
            torqueSum = off * (res.nx * cosH - res.nz * sinH);
          }
        }
      }

      if (iterMaxPen > 0) {
        stateObj.x += iterPushX;
        stateObj.z += iterPushZ;
        hitAny = true;
        if (iterMaxPen > strongestPen) strongestPen = iterMaxPen;
      } else {
        break;
      }
    }

    if (hitAny) {
      const sinH = Math.sin(stateObj.heading), cosH = Math.cos(stateObj.heading);
      const vx = sinH * stateObj.speed, vz = cosH * stateObj.speed;
      const vn = vx * wallNx + vz * wallNz; // negative when moving INTO the obstacle
      if (vn < 0) {
        const headOn = Math.abs(vn) / Math.max(0.001, Math.abs(stateObj.speed));
        if (headOn > 0.80) {
          // Crisp solid stop with tiny elastic rebound on head-on barrier collision
          stateObj.speed = -stateObj.speed * 0.16;
          if (Math.abs(stateObj.speed) < 0.35) stateObj.speed = 0;
        } else {
          // Smooth tangential wall-sliding along guardrails, buildings & other buses!
          const tx = vx - vn * wallNx;
          const tz = vz - vn * wallNz;
          const slideSpd = Math.hypot(tx, tz) * 0.88;
          stateObj.speed = stateObj.speed >= 0 ? slideSpd : -slideSpd;
          stateObj.heading = normAng(stateObj.heading + clamp(torqueSum * 0.018, -0.06, 0.06));
        }
      }
    }
    return { hit: hitAny, pen: strongestPen, impactSpeed: hitAny ? Math.abs(stateObj.speed) : 0 };
  }

  // Mass-respecting push vs AI traffic: an 8 t bus ploughs through, a 1.1 t car gets shoved aside.
  // The player's static-collision solver ignores AI cars; they are resolved here instead.
  function resolveBusVsAiCars() {
    const mPlayer = busState.vehicle === 'buggy' ? 1150 : (FLEET_MASS[busState.fleetKey] || 7800);
    const mCar = AI_CAR_MASS;
    const sinH = Math.sin(busState.heading), cosH = Math.cos(busState.heading);
    const discOffsets = busState.vehicle === 'buggy' ? BUGGY_DISC_OFFSETS : BUS_DISC_OFFSETS;
    const discRadius = busState.vehicle === 'buggy' ? BUGGY_DISC_RADIUS : BUS_DISC_RADIUS;
    let hit = false, strongestImpact = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < aiCars.length; i++) {
        const c = aiCars[i];
        if (Math.hypot(c.x - busState.x, c.z - busState.z) > 16) continue;
        const carOBB = { kind: 'obb', cx: c.x, cz: c.z, hx: 0.95, hz: 2.15, yaw: c.heading };
        for (let di = 0; di < discOffsets.length; di++) {
          const off = discOffsets[di];
          const dx = busState.x + sinH * off;
          const dz = busState.z + cosH * off;
          const res = testDiscVsObstacle(dx, dz, discRadius, carOBB);
          if (!res) continue;
          const sharePlayer = mCar / (mPlayer + mCar);
          const shareCar = mPlayer / (mPlayer + mCar);
          busState.x += res.nx * res.pen * sharePlayer;
          busState.z += res.nz * res.pen * sharePlayer;
          c.knockX -= res.nx * res.pen * shareCar;
          c.knockZ -= res.nz * res.pen * shareCar;
          const pvx = Math.sin(busState.heading) * busState.speed, pvz = Math.cos(busState.heading) * busState.speed;
          const cvx = Math.sin(c.heading) * c.speed, cvz = Math.cos(c.heading) * c.speed;
          const vn = (pvx - cvx) * res.nx + (pvz - cvz) * res.nz;
          if (vn < 0) {
            const e = 0.14;
            const j = -(1 + e) * vn * (mPlayer * mCar) / (mPlayer + mCar);
            const nvx = pvx + (j / mPlayer) * res.nx, nvz = pvz + (j / mPlayer) * res.nz;
            busState.speed = nvx * Math.sin(busState.heading) + nvz * Math.cos(busState.heading);
            const knock = clamp(j / mCar, 0, 14);
            c.knockVX -= res.nx * knock * 0.42;
            c.knockVZ -= res.nz * knock * 0.42;
            c.speed *= clamp(1 - j * 0.0006, 0.5, 1);
            strongestImpact = Math.max(strongestImpact, -vn);
            hit = true;
          }
        }
      }
    }
    return { hit, impact: strongestImpact };
  }

  // --- 5. REAL .GLB BUS LOADER, FIXED WHEEL RIGGING, 8-PLAYER LIVERIES & 3D COCKPIT ---
  const FLEET_CONFIGS = {
    transit: {
      label: 'City Transit Bus (.GLB)',
      url: 'assets/transit-bus.glb',
      fallbackKey: 'transit',
      rotY: Math.PI / 4,
      targetW: 2.52,
      targetH: 3.04,
      targetL: 10.1,
      driverEye: { x: 0.62, y: 2.08, z: 3.62 },
      cockpitEye: { x: 0.62, y: 2.04, z: 3.04 },
      hoodCam:   { x: 0.0,  y: 1.72, z: 5.12 },
      doorCam:   { x: 1.56, y: 2.22, z: 4.15 },
      paxCam:    { x: -0.78, y: 2.04, z: -0.45 }
    },
    coach: {
      label: 'Executive Coach (.GLB)',
      url: 'assets/coach-bus.glb',
      fallbackKey: 'coach',
      rotY: 0,
      targetW: 2.56,
      targetH: 3.16,
      targetL: 10.3,
      driverEye: { x: 0.64, y: 2.22, z: 3.85 },
      cockpitEye: { x: 0.64, y: 2.16, z: 3.30 },
      hoodCam:   { x: 0.0,  y: 1.82, z: 5.22 },
      doorCam:   { x: 1.58, y: 2.35, z: 4.35 },
      paxCam:    { x: -0.80, y: 2.18, z: -0.35 }
    },
    college: {
      label: 'Yellow College Bus (.GLB)',
      url: 'assets/college-bus.glb',
      fallbackKey: 'college',
      rotY: -155 * Math.PI / 180,
      targetW: 2.54,
      targetH: 3.12,
      targetL: 9.5,
      driverEye: { x: 0.62, y: 2.18, z: 3.45 },
      cockpitEye: { x: 0.62, y: 2.12, z: 3.02 },
      hoodCam:   { x: 0.0,  y: 1.78, z: 4.82 },
      doorCam:   { x: 1.56, y: 2.28, z: 3.85 },
      paxCam:    { x: -0.78, y: 2.12, z: -0.35 }
    }
  };

  function computeExactVertexBox(obj) {
    obj.updateMatrixWorld(true);
    const box = new T.Box3();
    const v = new T.Vector3();
    obj.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 600));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        box.expandByPoint(v);
      }
    });
    return box;
  }

  function createBusVehicleRig(includeCockpitLights) {
    const root = new T.Group();
    root.name = includeCockpitLights ? 'iiserGlbShuttleBus' : 'mpRivalGlbBus';

    const body = new T.Group();
    root.add(body);

    const modelMount = new T.Group();
    modelMount.name = 'glbModelMount';
    body.add(modelMount);

    const placeholder = new T.Mesh(
      new T.BoxGeometry(2.48, 2.6, 9.6),
      new T.MeshStandardMaterial({ color: 0x164a8a, roughness: 0.3, metalness: 0.4 })
    );
    placeholder.position.y = 1.65;
    modelMount.add(placeholder);

    let cockpit = null, steeringWheel = null, dashCanvas = null, dashCtx = null, dashTex = null;
    let beamLightL = null, beamLightR = null;

    if (includeCockpitLights) {
      cockpit = new T.Group();
      cockpit.name = 'driverCockpitRig';
      body.add(cockpit);

      const dashDarkMat = new T.MeshStandardMaterial({ color: 0x181d22, roughness: 0.65, metalness: 0.18 });
      const dashTrimMat = new T.MeshStandardMaterial({ color: 0x2c343d, roughness: 0.42, metalness: 0.45 });

      const dashConsole = new T.Mesh(new T.BoxGeometry(2.26, 0.56, 0.68), dashDarkMat);
      dashConsole.position.set(0, 1.28, 4.38);
      cockpit.add(dashConsole);

      const binnacle = new T.Mesh(new T.BoxGeometry(0.68, 0.24, 0.34), dashTrimMat);
      binnacle.position.set(0.62, 1.62, 4.32);
      binnacle.rotation.x = -0.26;
      cockpit.add(binnacle);

      dashCanvas = document.createElement('canvas');
      dashCanvas.width = 256; dashCanvas.height = 96;
      dashCtx = dashCanvas.getContext('2d');
      dashTex = new T.CanvasTexture(dashCanvas);
      dashTex.encoding = T.sRGBEncoding;
      const dashScreen = new T.Mesh(
        new T.PlaneGeometry(0.56, 0.19),
        new T.MeshBasicMaterial({ map: dashTex })
      );
      dashScreen.position.set(0.62, 1.63, 4.145);
      dashScreen.rotation.x = -0.26;
      dashScreen.rotation.y = Math.PI;
      cockpit.add(dashScreen);

      const steerCol = new T.Mesh(new T.CylinderGeometry(0.045, 0.055, 0.52, 10), dashTrimMat);
      steerCol.position.set(0.62, 1.46, 4.02);
      steerCol.rotation.x = 0.68;
      cockpit.add(steerCol);

      steeringWheel = new T.Group();
      steeringWheel.position.set(0.62, 1.65, 3.84);
      steeringWheel.rotation.x = 0.68;
      const wheelRim = new T.Mesh(new T.TorusGeometry(0.225, 0.024, 10, 28), dashDarkMat);
      const wheelHub = new T.Mesh(new T.CylinderGeometry(0.068, 0.068, 0.04, 14), iiserBlueMat);
      wheelHub.rotation.x = Math.PI / 2;
      const spokeH = new T.Mesh(new T.BoxGeometry(0.42, 0.032, 0.022), dashTrimMat);
      const spokeV = new T.Mesh(new T.BoxGeometry(0.035, 0.21, 0.022), dashTrimMat);
      spokeV.position.y = -0.10;
      steeringWheel.add(wheelRim, wheelHub, spokeH, spokeV);
      cockpit.add(steeringWheel);

      const mirrorBar = new T.Mesh(new T.BoxGeometry(0.52, 0.11, 0.04), dashTrimMat);
      mirrorBar.position.set(0.18, 2.52, 4.28);
      cockpit.add(mirrorBar);

      beamLightL = new T.SpotLight(0xfff1d0, 0.0, 82, Math.PI * 0.25, 0.52, 1.15);
      beamLightL.position.set(0.85, 0.92, 5.05);
      beamLightL.target.position.set(0.65, 0.1, 36.0);
      body.add(beamLightL, beamLightL.target);

      beamLightR = new T.SpotLight(0xfff1d0, 0.0, 82, Math.PI * 0.25, 0.52, 1.15);
      beamLightR.position.set(-0.85, 0.92, 5.05);
      beamLightR.target.position.set(-0.65, 0.1, 36.0);
      body.add(beamLightR, beamLightR.target);
    }

    const headLightMat = new T.MeshStandardMaterial({
      color: 0xffffff, emissive: new T.Color(0xfff4d8), emissiveIntensity: 1.8, roughness: 0.1
    });
    const brakeLightMat = new T.MeshStandardMaterial({
      color: 0xcc1818, emissive: new T.Color(0xff1e1e), emissiveIntensity: 0.65, roughness: 0.2
    });
    const revLightMat = new T.MeshStandardMaterial({
      color: 0xf4f7ff, emissive: new T.Color(0xffffff), emissiveIntensity: 0.0, roughness: 0.2
    });
    const blinkerLeftMat = new T.MeshStandardMaterial({
      color: 0xff9d00, emissive: new T.Color(0xffa000), emissiveIntensity: 0.0, roughness: 0.2
    });
    const blinkerRightMat = new T.MeshStandardMaterial({
      color: 0xff9d00, emissive: new T.Color(0xffa000), emissiveIntensity: 0.0, roughness: 0.2
    });

    const lightMarkers = new T.Group();
    body.add(lightMarkers);
    for (const sx of [-0.94, 0.94]) {
      const hl = new T.Mesh(new T.SphereGeometry(0.11, 10, 10), headLightMat);
      hl.scale.set(1.3, 0.85, 0.45);
      hl.position.set(sx, 0.86, 5.04);
      lightMarkers.add(hl);

      const tl = new T.Mesh(new T.BoxGeometry(0.32, 0.18, 0.06), brakeLightMat);
      tl.position.set(sx, 0.98, -5.04);
      lightMarkers.add(tl);

      const rl = new T.Mesh(new T.BoxGeometry(0.16, 0.10, 0.06), revLightMat);
      rl.position.set(sx * 0.72, 0.82, -5.04);
      lightMarkers.add(rl);

      const bMat = sx > 0 ? blinkerLeftMat : blinkerRightMat;
      const sigF = new T.Mesh(new T.BoxGeometry(0.15, 0.10, 0.07), bMat);
      sigF.position.set(sx * 1.12, 0.86, 5.02);
      const sigR = new T.Mesh(new T.BoxGeometry(0.15, 0.12, 0.07), bMat);
      sigR.position.set(sx * 1.12, 1.18, -5.03);
      lightMarkers.add(sigF, sigR);
    }

    const destCanvas = document.createElement('canvas');
    destCanvas.width = 512; destCanvas.height = 80;
    const destCtx = destCanvas.getContext('2d');
    const destTex = new T.CanvasTexture(destCanvas);
    destTex.encoding = T.sRGBEncoding;
    const destSign = new T.Mesh(
      new T.PlaneGeometry(1.52, 0.23),
      new T.MeshBasicMaterial({ map: destTex })
    );
    destSign.position.set(0, 2.74, 4.86);
    destSign.rotation.x = -0.14;
    body.add(destSign);

    function setDestText(text, accentColor) {
      destCtx.fillStyle = '#0c1016';
      destCtx.fillRect(0, 0, 512, 80);
      destCtx.fillStyle = accentColor || '#ffb32b';
      destCtx.font = 'bold 38px monospace';
      destCtx.textAlign = 'center';
      destCtx.fillText(String(text).slice(0, 22), 256, 54);
      destTex.needsUpdate = true;
    }
    setDestText('101 IISER SHUTTLE');

    scene.add(root);

    return {
      root, body, modelMount, cockpit, steeringWheel,
      dashCanvas, dashCtx, dashTex, setDestText,
      headLightMat, brakeLightMat, revLightMat,
      blinkerLeftMat, blinkerRightMat,
      beamLightL, beamLightR, lightMarkers,
      glbWheels: [], glbDoors: [],
      wheelRadius: 0.48,
      activeFleetKey: 'transit',
      liveryHex: PLAYER_COLORS[0].hex
    };
  }

  const bus = createBusVehicleRig(true);
  const gltfLoader = T.GLTFLoader ? new T.GLTFLoader() : null;
  const parsedGlbCache = new Map();

  function loadGlbModel(fleetKey, liveryHex, onReady) {
    const cfg = FLEET_CONFIGS[fleetKey] || FLEET_CONFIGS.transit;
    if (!gltfLoader) return;

    const handleGltf = (gltfScene) => {
      const cloned = gltfScene.clone(true);
      const rotWrap = new T.Group();
      cloned.rotation.y = cfg.rotY;
      rotWrap.add(cloned);

      const rawBox = computeExactVertexBox(rotWrap);
      const rawSz = new T.Vector3();
      rawBox.getSize(rawSz);

      const scaleZ = cfg.targetL / Math.max(rawSz.z, 0.01);
      const scaleX = cfg.targetW / Math.max(rawSz.x, 0.01);
      const scaleY = scaleZ * (fleetKey === 'transit' ? 1.09 : 1.0);

      const normalized = new T.Group();
      normalized.add(rotWrap);
      normalized.scale.set(scaleX, scaleY, scaleZ);

      const finalBox = computeExactVertexBox(normalized);
      const finalCtr = new T.Vector3(), finalSz = new T.Vector3();
      finalBox.getCenter(finalCtr);
      finalBox.getSize(finalSz);
      normalized.position.set(-finalCtr.x, -finalBox.min.y, -finalCtr.z);

      // Wrap normalized inside rigWrap BEFORE attaching wheels so matrixWorld is 100% accurate!
      const rigWrap = new T.Group();
      rigWrap.add(normalized);
      rigWrap.updateMatrixWorld(true);

      const glbWheels = [];
      const glbDoors = [];
      const wheelGroupMap = new Map();
      const tintColor = liveryHex != null ? new T.Color(liveryHex) : null;

      normalized.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;

        if (o.material) {
          const oldM = o.material;
          const hex = oldM.color ? oldM.color.getHex() : 0xffffff;
          const mName = (oldM.name || '').toLowerCase();
          const isWheelPart = o.name.startsWith('mesh765') || o.name.startsWith('mesh739')
            || o.name.startsWith('mesh310') || o.name.startsWith('mesh107');
          const isGlass = (hex === 0x0f1921 || hex === 0xd0f2f8 || hex === 0x3b4248 || hex === 0x404040 || mName.includes('glass') || mName.includes('window'))
            && !isWheelPart;

          if (isGlass) {
            const gm = new T.MeshStandardMaterial({
              color: 0x1b3344, roughness: 0.06, metalness: 0.86,
              transparent: true, opacity: 0.44, depthWrite: false, side: T.DoubleSide
            });
            gm.userData.baseEnvIntensity = 1.55;
            if (scene.environment) gm.envMapIntensity = 1.4;
            o.material = gm;
            o.castShadow = false;
          } else {
            const pm = new T.MeshStandardMaterial({
              map: oldM.map || null,
              color: oldM.color ? oldM.color.clone() : new T.Color(0xffffff),
              roughness: hex === 0x020202 ? 0.82 : 0.22,
              metalness: hex === 0x595959 ? 0.78 : (hex === 0x020202 ? 0.08 : 0.32)
            });
            // Apply custom 8-player team livery to primary bus paint accents!
            if (tintColor && !isWheelPart && hex !== 0x020202 && hex !== 0x1a1a1a && hex !== 0x595959) {
              if ((fleetKey === 'transit' && hex === 0x0056c9)
                || (fleetKey === 'coach' && (hex > 0x222222 && !oldM.map))
                || (fleetKey === 'college' && hex > 0x604000)) {
                pm.color.copy(tintColor);
              }
            } else if (fleetKey === 'transit' && hex === 0x0056c9) {
              pm.color.setHex(0x124d96);
            }
            pm.userData.baseEnvIntensity = 1.32;
            if (scene.environment) pm.envMapIntensity = 1.22;
            o.material = pm;
          }
        }

        for (const wPrefix of ['mesh310442833', 'mesh1074544435', 'mesh739186642', 'mesh765134991']) {
          if (o.name === wPrefix || o.name === wPrefix + '_1') {
            if (!wheelGroupMap.has(wPrefix)) wheelGroupMap.set(wPrefix, []);
            wheelGroupMap.get(wPrefix).push(o);
          }
        }

        if (o.name.startsWith('mesh747704577') || o.name.startsWith('mesh388658908')) {
          glbDoors.push({ mesh: o, basePos: o.position.clone() });
        }
      });

      for (const [, meshes] of wheelGroupMap.entries()) {
        const wb = new T.Box3();
        const v = new T.Vector3();
        for (const m of meshes) {
          m.updateMatrixWorld(true);
          const p = m.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
            wb.expandByPoint(v);
          }
        }
        const wCenter = new T.Vector3();
        wb.getCenter(wCenter);
        const steerPivot = new T.Group();
        steerPivot.position.copy(wCenter);
        const spinPivot = new T.Group();
        steerPivot.add(spinPivot);
        rigWrap.add(steerPivot);
        rigWrap.updateMatrixWorld(true);
        for (const m of meshes) {
          spinPivot.attach(m);
        }
        glbWheels.push({
          steerPivot,
          spinPivot,
          isFront: wCenter.z > 0.5
        });
      }

      onReady({ rigWrap, normalized, glbWheels, glbDoors, halfLen: finalSz.z * 0.5, cfg });
    };

    if (parsedGlbCache.has(fleetKey)) {
      handleGltf(parsedGlbCache.get(fleetKey));
      return;
    }

    const fallbackUri = window.BUS_GLB_FALLBACKS && window.BUS_GLB_FALLBACKS[cfg.fallbackKey];
    gltfLoader.load(
      cfg.url,
      (gltf) => {
        parsedGlbCache.set(fleetKey, gltf.scene);
        handleGltf(gltf.scene);
      },
      undefined,
      () => {
        if (fallbackUri) {
          gltfLoader.load(fallbackUri, (gltf) => {
            parsedGlbCache.set(fleetKey, gltf.scene);
            handleGltf(gltf.scene);
          });
        }
      }
    );
  }

  function equipRigWithGlb(targetRig, fleetKey, liveryHex) {
    const cfg = FLEET_CONFIGS[fleetKey] || FLEET_CONFIGS.transit;
    targetRig.activeFleetKey = fleetKey;
    targetRig.liveryHex = liveryHex;
    loadGlbModel(fleetKey, liveryHex, ({ rigWrap, glbWheels, glbDoors, halfLen }) => {
      while (targetRig.modelMount.children.length) {
        targetRig.modelMount.remove(targetRig.modelMount.children[0]);
      }
      targetRig.modelMount.add(rigWrap);
      targetRig.glbWheels = glbWheels;
      targetRig.glbDoors = glbDoors;

      const fZ = halfLen - 0.04;
      targetRig.lightMarkers.scale.z = fZ / 5.04;
      if (targetRig.cockpit) {
        targetRig.cockpit.position.set(
          cfg.driverEye.x - 0.62,
          cfg.driverEye.y - 2.08,
          cfg.driverEye.z - 3.62
        );
      }
      renderer.shadowMap.needsUpdate = true;
    });
  }

  function equipFleetBus(fleetKey, optionalColorIdx) {
    const cIdx = typeof optionalColorIdx === 'number' ? optionalColorIdx : localPlayer.colorIdx;
    const hex = PLAYER_COLORS[cIdx % PLAYER_COLORS.length].hex;
    equipRigWithGlb(bus, fleetKey, hex);
  }

  // --- Synthesized WebAudio Bus Sound Engine ---
  let audioCtx = null;
  let engOsc1 = null, engOsc2 = null, engGain = null, engFilter = null;
  let lastImpactSoundAt = 0;

  function ensureAudio() {
    if (busState.audioMuted) return null;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        engOsc1 = audioCtx.createOscillator();
        engOsc2 = audioCtx.createOscillator();
        engFilter = audioCtx.createBiquadFilter();
        engGain = audioCtx.createGain();

        engOsc1.type = 'sawtooth';
        engOsc2.type = 'triangle';
        engOsc1.frequency.value = 44;
        engOsc2.frequency.value = 88;
        engFilter.type = 'lowpass';
        engFilter.frequency.value = 180;
        engGain.gain.value = 0.0;

        engOsc1.connect(engFilter);
        engOsc2.connect(engFilter);
        engFilter.connect(engGain);
        engGain.connect(audioCtx.destination);
        engOsc1.start();
        engOsc2.start();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function updateEngineAudio(throttleActive) {
    if (!audioCtx || !engGain) return;
    const t0 = audioCtx.currentTime;
    if (!busState.driving || busState.audioMuted) {
      engGain.gain.setTargetAtTime(0.0, t0, 0.08);
      return;
    }
    const rpmNorm = clamp((busState.rpm - 720) / 1850, 0, 1);
    const baseHz = 36 + rpmNorm * 68;
    engOsc1.frequency.setTargetAtTime(baseHz, t0, 0.05);
    engOsc2.frequency.setTargetAtTime(baseHz * 2.01, t0, 0.05);
    engFilter.frequency.setTargetAtTime(145 + rpmNorm * 280 + (throttleActive ? 90 : 0), t0, 0.06);
    const vol = (busState.camMode === 1 || busState.camMode === 4) ? 0.022 : 0.032;
    engGain.gain.setTargetAtTime(vol * (0.65 + rpmNorm * 0.65), t0, 0.08);
  }

  function playPneumaticHiss() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * 0.28);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.32));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = 0.045;
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start();
    } catch (_) {}
  }

  function playImpactThud(strength) {
    const now = performance.now();
    if (now - lastImpactSoundAt < 240) return;
    lastImpactSoundAt = now;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(115, t0);
      osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.16);
      g.gain.setValueAtTime(clamp(strength * 0.015, 0.02, 0.09), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.19);
    } catch (_) {}
  }

  function playBlinkerClick(high) {
    if (!audioCtx || !busState.driving || busState.audioMuted) return;
    try {
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(high ? 980 : 720, t0);
      g.gain.setValueAtTime(0.018, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.03);
    } catch (_) {}
  }

  function playStopChime() {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      [587.3, 880.0].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + idx * 0.14);
        g.gain.setValueAtTime(0.0001, t0 + idx * 0.14);
        g.gain.exponentialRampToValueAtTime(0.055, t0 + idx * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + idx * 0.14 + 0.42);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0 + idx * 0.14);
        osc.stop(t0 + idx * 0.14 + 0.45);
      });
    } catch (_) {}
  }

  function honkHorn(broadcastIt) {
    const ctx = ensureAudio();
    if (ctx) {
      try {
        const t0 = ctx.currentTime;
        for (const freq of [311, 392]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.exponentialRampToValueAtTime(0.065, t0 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t0); osc.stop(t0 + 0.44);
        }
      } catch (_) {}
    }
    if (broadcastIt !== false) sendMultiplayerPacket({ type: 'horn', id: localPlayer.id, name: localPlayer.name });
  }

  // =====================================================================
  //  GAME LAYER — fleet, modes, physics, AI traffic, HUD & multiplayer
  // =====================================================================
  const LOW_END = (navigator.hardwareConcurrency || 4) <= 4
    || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);

  const localPlayer = {
    id: 'd_' + Math.random().toString(36).slice(2, 10),
    name: (function () {
      try { return localStorage.getItem('iiser.drive.name') || ('Driver ' + (1 + Math.floor(Math.random() * 98))); }
      catch (_) { return 'Driver'; }
    })(),
    colorIdx: (function () {
      try { return parseInt(localStorage.getItem('iiser.drive.color') || '0', 10) || 0; }
      catch (_) { return 0; }
    })(),
    room: ''
  };

  const busState = {
    active: false,
    initialized: false,
    driving: false,
    x: 182.1, z: 563.8, heading: 2.62,
    speed: 0, steer: 0, rpm: 760, gear: 'N',
    camMode: 0, vehicle: 'bus', fleetKey: 'transit',
    lights: false, handbrake: false, audioMuted: false,
    odo: 0, fuel: 100, temp: 72, score: 0,
    mode: 'free', gateOpen: 0, gateBlocked: true,
    health: 100, fines: 0, fineAmount: 0, lastFineAt: -999, lastHitFineAt: -999,
    highBeam: false, hazards: false,
    inParking: false, started: false,
    lastHornAt: 0, lastBlinkerAt: 0, blinker: 0
  };

  const gateState = { open: 0, target: 0 };
  const VEHICLE_DEFS = {
    bus: {
      label: 'Shuttle Bus', halfW: 1.26, halfL: 5.05, wheelbase: 6.2, wheelRadius: 0.48,
      maxSpeed: 18.6, reverseMax: 5.2, accel: 4.6, brake: 9.0,
      steerMax: 0.46, eye: { x: 0.62, y: 2.08, z: 3.62 }, hood: { x: 0, y: 1.72, z: 5.08 }
    },
    buggy: {
      label: 'Campus Buggy', halfW: 0.82, halfL: 1.72, wheelbase: 2.35, wheelRadius: 0.34,
      maxSpeed: 13.8, reverseMax: 4.6, accel: 7.0, brake: 12.5,
      steerMax: 0.64, eye: { x: 0.34, y: 1.50, z: 0.02 }, hood: { x: 0, y: 1.28, z: 1.65 }
    }
  };

  const CAM_MODES = [
    { id: 'cockpit', label: 'Cockpit', key: '1' },
    { id: 'hood', label: 'Hood', key: '2' },
    { id: 'chase', label: 'Chase', key: '3' },
    { id: 'orbit', label: 'Orbit', key: '4' },
    { id: 'pax', label: 'Passenger', key: '5' },
    { id: 'side', label: 'Door', key: '6' },
    { id: 'drone', label: 'Drone', key: '7' }
  ];

  // ---------- Procedural open-frame campus buggy ----------
  function createBuggyRig() {
    const root = new T.Group();
    root.name = 'iiserCampusBuggy';
    const body = new T.Group();
    root.add(body);

    const paint = new T.MeshStandardMaterial({ color: 0xe3a25b, roughness: 0.34, metalness: 0.4 });
    const accent = new T.MeshStandardMaterial({ color: 0x164a8a, roughness: 0.3, metalness: 0.5 });
    const seatMat = new T.MeshStandardMaterial({ color: 0x3a2b20, roughness: 0.9 });
    const tyreMat = new T.MeshStandardMaterial({ color: 0x15181b, roughness: 0.95 });
    const rimMat = new T.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.3, metalness: 0.8 });

    const add = (geo, mat, x, y, z, rx, ry, rz) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      m.castShadow = true; m.receiveShadow = true;
      body.add(m);
      return m;
    };

    add(new T.BoxGeometry(1.3, 0.16, 2.7), paint, 0, 0.54, 0);
    add(new T.BoxGeometry(1.15, 0.30, 1.9), accent, 0, 0.72, -0.15);
    add(new T.BoxGeometry(1.38, 0.12, 0.34), darkMetalMat, 0, 0.62, 1.42);
    add(new T.BoxGeometry(1.38, 0.12, 0.34), darkMetalMat, 0, 0.62, -1.42);
    add(new T.BoxGeometry(1.05, 0.10, 1.5), darkMetalMat, 0, 0.90, -0.05);

    for (const sx of [-0.62, 0.62]) {
      for (const sz of [-0.98, 0.86]) {
        add(new T.CylinderGeometry(0.035, 0.035, 1.42, 8), steelMat, sx, 1.58, sz);
      }
    }
    for (const sx of [-0.62, 0.62]) {
      add(new T.CylinderGeometry(0.035, 0.035, 1.95, 8), steelMat, sx, 2.28, -0.06, Math.PI / 2, 0, 0);
    }
    for (const sz of [-0.98, 0.86]) {
      add(new T.CylinderGeometry(0.035, 0.035, 1.30, 8), steelMat, 0, 2.28, sz, 0, 0, Math.PI / 2);
    }

    const canopy = add(new T.BoxGeometry(1.48, 0.07, 2.05), accent, 0, 2.34, -0.06);
    canopy.castShadow = true;
    add(new T.BoxGeometry(1.3, 0.05, 0.05), lampBulbMat, 0, 2.29, 0.9);

    add(new T.BoxGeometry(0.55, 0.14, 0.50), seatMat, 0.34, 1.02, 0.12);
    add(new T.BoxGeometry(0.55, 0.62, 0.12), seatMat, 0.34, 1.32, -0.17);
    add(new T.BoxGeometry(0.55, 0.14, 0.50), seatMat, -0.34, 1.02, 0.12);
    add(new T.BoxGeometry(0.55, 0.62, 0.12), seatMat, -0.34, 1.32, -0.17);

    add(new T.BoxGeometry(1.18, 0.14, 0.30), darkMetalMat, 0, 1.17, 0.78);
    const steeringWheel = new T.Group();
    steeringWheel.position.set(0.34, 1.42, 0.63);
    steeringWheel.rotation.x = -0.58;
    const rim = new T.Mesh(new T.TorusGeometry(0.185, 0.022, 8, 22), darkMetalMat);
    const hub = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.035, 12), iiserGoldMat);
    hub.rotation.x = Math.PI / 2;
    const spoke = new T.Mesh(new T.BoxGeometry(0.33, 0.03, 0.02), steelMat);
    steeringWheel.add(rim, hub, spoke);
    body.add(steeringWheel);

    const frameGlass = new T.Mesh(new T.PlaneGeometry(1.24, 0.68), new T.MeshStandardMaterial({
      color: 0xbfe6ee, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.22,
      side: T.DoubleSide, depthWrite: false
    }));
    frameGlass.position.set(0, 1.73, 0.92);
    frameGlass.rotation.x = -0.20;
    body.add(frameGlass);

    const headLightMat = new T.MeshStandardMaterial({
      color: 0xfff6da, emissive: new T.Color(0xfff0c0), emissiveIntensity: 1.5, roughness: 0.15
    });
    const brakeLightMat = new T.MeshStandardMaterial({
      color: 0xab1414, emissive: new T.Color(0xff2020), emissiveIntensity: 0.5, roughness: 0.25
    });
    const revLightMat = new T.MeshStandardMaterial({
      color: 0xf4f7ff, emissive: new T.Color(0xffffff), emissiveIntensity: 0.0, roughness: 0.2
    });
    for (const sx of [-0.46, 0.46]) {
      const hl = new T.Mesh(new T.SphereGeometry(0.085, 8, 8), headLightMat);
      hl.scale.set(1.2, 0.9, 0.5);
      hl.position.set(sx, 0.83, 1.60);
      body.add(hl);
      const tl = new T.Mesh(new T.BoxGeometry(0.18, 0.12, 0.05), brakeLightMat);
      tl.position.set(sx, 0.86, -1.57);
      body.add(tl);
      const rl = new T.Mesh(new T.BoxGeometry(0.10, 0.07, 0.05), revLightMat);
      rl.position.set(sx * 0.55, 0.74, -1.57);
      body.add(rl);
    }

    const wheels = [];
    for (const [wx, wz, front] of [[-0.78, 1.18, true], [0.78, 1.18, true], [-0.78, -1.18, false], [0.78, -1.18, false]]) {
      const steerPivot = new T.Group();
      steerPivot.position.set(wx, 0.36, wz);
      body.add(steerPivot);
      const spinPivot = new T.Group();
      steerPivot.add(spinPivot);
      const tyre = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.22, 14), tyreMat);
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      const rim = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.24, 10), rimMat);
      rim.rotation.z = Math.PI / 2;
      spinPivot.add(tyre, rim);
      wheels.push({ steerPivot, spinPivot, front });
    }

    root.position.set(busState.x, getSurfaceHeight(busState.x, busState.z), busState.z);
    root.rotation.y = busState.heading;
    scene.add(root);
    root.visible = false;

    return {
      root, body, modelMount: null, cockpit: null, steeringWheel, wheels,
      dashCanvas: null, dashCtx: null, dashTex: null, setDestText: null,
      headLightMat, brakeLightMat, revLightMat, glbWheels: [], glbDoors: [],
      wheelRadius: 0.34, activeFleetKey: 'buggy', liveryHex: 0xe3a25b, isBuggy: true
    };
  }

  const buggy = createBuggyRig();
  let activeRig = bus;

  // ---------- Detailed GLB cockpit cabin so the driver really sits inside ----------
  function buildCockpitCabin() {
    const cab = bus.cockpit;
    if (!cab) return;
    const shell = new T.MeshStandardMaterial({ color: 0x171b20, roughness: 0.88, metalness: 0.04, side: T.DoubleSide });
    const trim = new T.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.32 });
    const seat = new T.MeshStandardMaterial({ color: 0x2c2319, roughness: 0.92 });
    const glass = new T.MeshStandardMaterial({
      color: 0x9fd6e8, roughness: 0.04, metalness: 0.5, transparent: true,
      opacity: 0.075, side: T.DoubleSide, depthWrite: false
    });
    const addPart = (geo, mat, x, y, z, rx, ry, rz) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      m.receiveShadow = true;
      cab.add(m);
      return m;
    };

    addPart(new T.BoxGeometry(2.24, 0.07, 2.95), shell, 0, 1.0, 3.28);
    addPart(new T.BoxGeometry(0.06, 0.78, 2.9), shell, -1.15, 1.39, 3.28);
    addPart(new T.BoxGeometry(0.06, 0.78, 2.9), shell, 1.15, 1.39, 3.28);
    addPart(new T.BoxGeometry(0.07, 0.40, 2.9), glass, -1.14, 2.0, 3.28);
    addPart(new T.BoxGeometry(0.07, 0.40, 2.9), glass, 1.14, 2.0, 3.28);
    addPart(new T.BoxGeometry(2.32, 0.07, 2.95), shell, 0, 2.55, 3.28);
    addPart(new T.BoxGeometry(2.28, 1.6, 0.06), shell, 0, 1.56, 1.78);
    const windshield = addPart(new T.PlaneGeometry(2.06, 0.92), glass, 0, 2.16, 5.02, -0.10, 0, 0);
    windshield.material = glass.clone();
    windshield.material.opacity = 0.075;
    addPart(new T.BoxGeometry(0.085, 1.2, 0.085), trim, -1.21, 1.85, 4.88, 0, 0, 0.16);
    addPart(new T.BoxGeometry(0.085, 1.2, 0.085), trim, 1.21, 1.85, 4.88, 0, 0, -0.16);
    addPart(new T.BoxGeometry(2.15, 0.16, 0.5), shell, 0, 2.5, 4.62);
    addPart(new T.BoxGeometry(2.05, 0.25, 0.7), trim, 0, 1.09, 4.20);
    addPart(new T.BoxGeometry(2.2, 0.12, 0.42), trim, 0, 1.53, 4.92, -0.08, 0, 0);

    addPart(new T.BoxGeometry(0.62, 0.16, 0.58), seat, 0.62, 1.33, 2.95);
    addPart(new T.BoxGeometry(0.62, 0.78, 0.16), seat, 0.62, 1.68, 2.62, -0.12, 0, 0);
    addPart(new T.BoxGeometry(0.56, 0.16, 0.54), seat, -0.62, 1.32, 2.93);
    addPart(new T.BoxGeometry(0.56, 0.74, 0.15), seat, -0.62, 1.66, 2.62, -0.12, 0, 0);
    addPart(new T.BoxGeometry(0.55, 0.13, 0.42), trim, 0, 1.72, 4.10);
    addPart(new T.BoxGeometry(0.22, 0.05, 0.05), new T.MeshStandardMaterial({
      color: 0xfff2cc, emissive: new T.Color(0xffe6b0), emissiveIntensity: 1.3
    }), 0, 2.49, 3.4);
  }
  buildCockpitCabin();

  function switchVehicle(kind) {
    if (kind === 'buggy') {
      busState.vehicle = 'buggy';
      busState.fleetKey = 'buggy';
      bus.root.visible = false;
      buggy.root.visible = true;
      activeRig = buggy;
    } else {
      busState.vehicle = 'bus';
      busState.fleetKey = kind;
      bus.root.visible = true;
      buggy.root.visible = false;
      activeRig = bus;
      equipFleetBus(kind);
    }
    if (ui && ui.fleetSelect) ui.fleetSelect.value = kind;
    syncRigPose(0, true);
  }

  function getSpawnPoint() {
    const r = D.roads[0];
    if (!r || !r.pts || r.pts.length < 8) return { x: 182.1, z: 563.8, heading: 2.62 };
    const p = r.pts[3], q = r.pts[8];
    const heading = Math.atan2(q[0] - p[0], q[1] - p[1]);
    const lane = 1.35;
    return {
      x: p[0] + Math.cos(heading) * lane,
      z: p[1] - Math.sin(heading) * lane,
      heading
    };
  }

  function findNearestRoadPoint(x, z) {
    let best = null, bestD = Infinity;
    for (const r of D.roads) {
      if (!r.isDriveable || !r.pts || r.pts.length < 2) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1e-6;
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < bestD) {
          bestD = d;
          const heading = Math.atan2(dx, dz);
          best = {
            x: px + Math.cos(heading) * 1.35,
            z: pz - Math.sin(heading) * 1.35,
            heading
          };
        }
      }
    }
    return best || getSpawnPoint();
  }

  function resetVehicle() {
    const sp = findNearestRoadPoint(busState.x, busState.z);
    busState.x = sp.x; busState.z = sp.z; busState.heading = sp.heading;
    busState.speed = 0; busState.steer = 0; busState.handbrake = false;
    busState.health = 100;
    syncRigPose(0, true);
    if (ui && ui.status) ui.status.textContent = busState.health >= 100 ? 'Vehicle reset to the nearest lane.' : 'Vehicle reset.';
  }

  // ---------- Main gate barrier: auto-open on approach, solid when closed ----------
  function updateGate(dt) {
    let near = false;
    if (busState.active) {
      const dPlayer = Math.hypot(busState.x - gatePos.x, busState.z - gatePos.z);
      if (dPlayer < 22) near = true;
    }
    for (let i = 0; i < aiCars.length; i++) {
      const c = aiCars[i];
      if (Math.hypot(c.x - gatePos.x, c.z - gatePos.z) < 18) { near = true; break; }
    }
    gateState.target = near ? 1 : 0;
    gateState.open += (gateState.target - gateState.open) * Math.min(1, dt * (near ? 3.2 : 1.6));
    if (gateState.open < 0.002) gateState.open = 0;
    if (gateState.open > 0.998) gateState.open = 1;
    if (boomArmPivot) boomArmPivot.rotation.z = gateState.open * 1.34;
    if (gateLampMat) {
      const open = gateState.open > 0.55;
      gateLampMat.color.setHex(open ? 0x2ee87c : 0xff3b30);
      gateLampMat.emissive.setHex(open ? 0x2ee87c : 0xff3b30);
    }
    busState.gateOpen = gateState.open;
    busState.gateBlocked = gateState.open < 0.55;
  }

  // ---------- Input ----------
  const held = { up: false, down: false, left: false, right: false, hand: false };

  function isTypingTarget(t) {
    return t && /input|textarea|select/i.test(t.tagName || '');
  }

  function onDriveKeyDown(e) {
    if (!busState.active) return;
    if (isTypingTarget(e.target)) return;
    const k = e.key;
    const kk = k.length === 1 ? k.toLowerCase() : k;
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'h', 'c', 'f', 'g', 'b', 'r', 'm', 'Escape', '1', '2', '3', '4', '5', '6', '7'].indexOf(kk) < 0) return;
    e.preventDefault();
    if (kk === 'w' || kk === 'ArrowUp') held.up = true;
    else if (kk === 's' || kk === 'ArrowDown') held.down = true;
    else if (kk === 'a' || kk === 'ArrowLeft') held.left = true;
    else if (kk === 'd' || kk === 'ArrowRight') held.right = true;
    else if (kk === ' ') held.hand = true;
    else if (kk === 'h') {
      const now = performance.now();
      if (now - busState.lastHornAt > 260) { busState.lastHornAt = now; honkHorn(true); }
    } else if (kk === 'c') cycleCamMode();
    else if (kk === 'f') toggleLights();
    else if (kk === 'g') toggleHighBeam();
    else if (kk === 'b') toggleHazards();
    else if (kk === 'r') resetVehicle();
    else if (kk === 'm') openModePicker();
    else if (kk === 'Escape') exitDriveMode();
    else if (kk >= '1' && kk <= '7') setCamMode(parseInt(kk, 10) - 1);
  }

  function onDriveKeyUp(e) {
    const k = e.key;
    const kk = k.length === 1 ? k.toLowerCase() : k;
    if (kk === 'w' || kk === 'ArrowUp') held.up = false;
    else if (kk === 's' || kk === 'ArrowDown') held.down = false;
    else if (kk === 'a' || kk === 'ArrowLeft') held.left = false;
    else if (kk === 'd' || kk === 'ArrowRight') held.right = false;
    else if (kk === ' ') held.hand = false;
  }
  window.addEventListener('keydown', onDriveKeyDown);
  window.addEventListener('keyup', onDriveKeyUp);
  window.addEventListener('blur', () => { held.up = held.down = held.left = held.right = held.hand = false; });

  function toggleLights() {
    busState.lights = !busState.lights;
    if (ui && ui.lightsBtn) ui.lightsBtn.classList.toggle('on', busState.lights);
  }

  function toggleHighBeam() {
    busState.highBeam = !busState.highBeam;
    flashNotice(busState.highBeam ? 'High beam on' : 'High beam off');
  }

  function toggleHazards() {
    busState.hazards = !busState.hazards;
    flashNotice(busState.hazards ? 'Hazard lights on' : 'Hazard lights off');
  }

  // ---------- Lightweight intelligent AI traffic (lane-following, no signals) ----------
  const AI_ROAD_LIST = [];
  {
    for (let ri = 0; ri < D.roads.length; ri++) {
      const r = D.roads[ri];
      if (!r.isDriveable || !r.pts || r.pts.length < 5 || ri === 15) continue;
      let len = 0;
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) {
        len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        cum.push(len);
      }
      if (len < 55) continue;
      AI_ROAD_LIST.push({ ri, r, cum, length: len });
    }
    AI_ROAD_LIST.sort((a, b) => b.length - a.length);
  }

  const AI_COUNT = Math.min(AI_ROAD_LIST.length, LOW_END ? 10 : 22);
  const AI_COLORS = [0xd8dde2, 0x2b4c7e, 0x8c2d2d, 0x3b4248, 0xe8e2d5, 0x2d6b52, 0xc9a227, 0x6b5b95, 0x9c4a1a];
  const aiCars = [];

  function sampleRoad(road, s) {
    const pts = road.r.pts, cum = road.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const segLen = Math.max(0.001, cum[hi] - cum[lo]);
    const t = clamp((s - cum[lo]) / segLen, 0, 1);
    const a = pts[lo], b = pts[hi];
    return {
      x: a[0] + (b[0] - a[0]) * t,
      z: a[1] + (b[1] - a[1]) * t,
      dx: (b[0] - a[0]) / segLen,
      dz: (b[1] - a[1]) / segLen
    };
  }

  function spawnAiTraffic() {
    for (let i = 0; i < AI_COUNT; i++) {
      const road = AI_ROAD_LIST[(i * 3 + 1) % AI_ROAD_LIST.length];
      const car = makeTrafficCar(AI_COLORS[i % AI_COLORS.length]);
      car.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
      scene.add(car);
      const c = {
        mesh: car, road, s: (i / AI_COUNT) * road.length + Math.random() * 20,
        dir: (i % 3 === 0) ? -1 : 1, speed: 6 + Math.random() * 4.5,
        targetSpeed: 7 + Math.random() * 4, lane: 1.25 + Math.random() * 0.25,
        x: 0, z: 0, heading: 0, hover: Math.random() * Math.PI * 2,
        knockX: 0, knockZ: 0, knockVX: 0, knockVZ: 0
      };
      const sp = getSpawnPoint();
      let guard = 0;
      while (guard++ < 8) {
        const sm = sampleRoad(road, c.s);
        if (Math.hypot(sm.x - sp.x, sm.z - sp.z) > 38) break;
        c.s = (c.s + road.length * 0.18) % road.length;
      }
      aiCars.push(c);
    }
  }
  spawnAiTraffic();

  function updateAiTraffic(dt, t) {
    for (let i = 0; i < aiCars.length; i++) {
      const c = aiCars[i];
      c.targetSpeed = 7.5 + 3.5 * (0.5 + 0.5 * Math.sin(c.hover + t * 0.13));
      let limit = c.targetSpeed;

      const sample = sampleRoad(c.road, c.s);
      const fwdX = sample.dx * c.dir, fwdZ = sample.dz * c.dir;

      // Keep a safe gap from the player when the player is ahead
      if (busState.active) {
        const dx = busState.x - sample.x, dz = busState.z - sample.z;
        const ahead = dx * fwdX + dz * fwdZ;
        if (ahead > 0 && ahead < 15) {
          const lateral = Math.abs(dx * fwdZ - dz * fwdX);
          if (lateral < 3.4) {
            if (ahead < 7) limit = 0;
            else limit = Math.min(limit, Math.max(0, busState.speed) * 0.7);
          }
        }
      }

      // Keep a safe gap from other AI traffic ahead
      for (let j = 0; j < aiCars.length; j++) {
        if (j === i) continue;
        const o = aiCars[j];
        if (o.road !== c.road) continue;
        const dx = o.x - sample.x, dz = o.z - sample.z;
        const ahead = dx * fwdX + dz * fwdZ;
        if (ahead > 0 && ahead < 10) {
          if (ahead < 5) limit = Math.min(limit, 0);
          else limit = Math.min(limit, o.speed * 0.8);
        }
      }

      c.speed += clamp(limit - c.speed, -8.5 * dt, 3.2 * dt);
      c.s += c.speed * c.dir * dt;

      if (c.s <= 0.5) { c.s = 0.5; c.dir = 1; }
      else if (c.s >= c.road.length - 0.5) { c.s = c.road.length - 0.5; c.dir = -1; }

      const sm = sampleRoad(c.road, c.s);
      const fx = sm.dx * c.dir, fz = sm.dz * c.dir;
      const h = Math.atan2(fx, fz);
      const rx = Math.cos(h), rz = -Math.sin(h);
      // Cars knocked by the player integrate a decaying lateral offset, then steer back to their lane
      c.knockX += c.knockVX * dt;
      c.knockZ += c.knockVZ * dt;
      const knockDecay = Math.exp(-2.6 * dt);
      c.knockVX *= knockDecay;
      c.knockVZ *= knockDecay;
      c.knockX -= c.knockX * Math.min(1, dt * 0.45);
      c.knockZ -= c.knockZ * Math.min(1, dt * 0.45);
      c.x = sm.x + rx * c.lane + c.knockX;
      c.z = sm.z + rz * c.lane + c.knockZ;
      c.heading = h;
      c.mesh.position.set(c.x, getSurfaceHeight(c.x, c.z), c.z);
      c.mesh.rotation.y = h;
    }

  }

  // ---------- Game mode definitions & objective state ----------
  const GAME_MODES = [
    { id: 'free',   label: 'Free Drive',     kicker: 'FREE DRIVE' },
    { id: 'route',  label: 'Shuttle 101',    kicker: 'ROUTE 101' },
    { id: 'trial',  label: 'Time Trial',     kicker: 'TIME TRIAL' },
    { id: 'park',   label: 'Precision Park', kicker: 'PARKING TEST' },
    { id: 'safari', label: 'Buggy Safari',   kicker: 'BUGGY SAFARI' },
    { id: 'multi',  label: 'Multiplayer',    kicker: 'MULTIPLAYER' }
  ];

  const game = {
    mode: 'free', routeIdx: 0, stopPtr: 0, laps: 0, passengers: 0, score: 0,
    checkpoints: [], cpIndex: 0, trialStart: 0, trialTime: 0, trialReady: false,
    trialDone: false, trialBest: 0, parkTarget: null, parkDone: false,
    parkProps: [], parkObstacles: [], targetRing: -1, nearSpeedCamera: false,
    objectiveText: '', detailText: '', statusText: '', stopName: '', stopDist: 0
  };
  try { game.trialBest = parseFloat(localStorage.getItem('iiser.drive.trialBest') || '0') || 0; } catch (_) {}

  let ui = null;

  function makeEl(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // Transient center-screen toast (fines, camera triggers, damage)
  let noticeEl = null, noticeTimer = null;
  function flashNotice(text, kind) {
    if (!noticeEl) {
      noticeEl = makeEl('div', 'sh-flash');
      document.body.appendChild(noticeEl);
    }
    noticeEl.textContent = text;
    noticeEl.className = 'sh-flash show' + (kind ? ' ' + kind : '');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { if (noticeEl) noticeEl.className = 'sh-flash'; }, 2600);
  }

  function createDriveUI() {
    if (ui) return;

    const modeStrip = makeEl('div', 'mode-strip panel hidden');
    modeStrip.appendChild(makeEl('span', 'cam-strip-label', 'Play'));
    for (const m of GAME_MODES) {
      const b = makeEl('button', 'mode-pill', m.label);
      b.type = 'button';
      b.dataset.mode = m.id;
      b.addEventListener('click', () => setGameMode(m.id));
      modeStrip.appendChild(b);
    }
    const mpPill = makeEl('button', 'mp-open-pill', '8P');
    mpPill.type = 'button';
    mpPill.title = 'Open multiplayer lobby';
    mpPill.addEventListener('click', openMpModal);
    modeStrip.appendChild(mpPill);
    document.body.appendChild(modeStrip);

    const camStrip = makeEl('div', 'cam-strip panel hidden');
    camStrip.appendChild(makeEl('span', 'cam-strip-label', 'Camera'));
    CAM_MODES.forEach((c, i) => {
      const b = makeEl('button', 'cam-pill', '<kbd>' + c.key + '</kbd>' + c.label);
      b.type = 'button';
      b.dataset.cam = String(i);
      b.addEventListener('click', () => setCamMode(i));
      camStrip.appendChild(b);
    });
    document.body.appendChild(camStrip);

    const hud = makeEl('div', 'shuttle-hud hidden');
    hud.innerHTML =
      '<div class="sh-left panel">' +
        '<div class="sh-speed-row">' +
          '<div class="sh-speed-wrap"><span class="sh-speed" id="sh-speed">0</span><span class="sh-unit">km/h</span></div>' +
          '<span class="sh-gear-badge" id="sh-gear">P</span>' +
        '</div>' +
        '<div class="sh-rpm-track"><div class="sh-rpm-fill" id="sh-rpm"></div></div>' +
        '<div class="sh-ind-row">' +
          '<span class="sh-ind" id="sh-ind-left">&#9664;</span>' +
          '<span class="sh-ind" id="sh-ind-right">&#9654;</span>' +
          '<span class="sh-ind" id="sh-ind-lights">LIGHTS</span>' +
          '<span class="sh-ind" id="sh-ind-beam">BEAM</span>' +
          '<span class="sh-ind" id="sh-ind-brake">BRAKE</span>' +
          '<span class="sh-ind" id="sh-ind-cam">CAM</span>' +
          '<span class="sh-ind" id="sh-ind-gate">GATE</span>' +
        '</div>' +
        '<div class="sh-bars">' +
          '<div><span>Fuel</span><strong id="sh-fuel">100%</strong></div>' +
          '<div><span>Health</span><strong id="sh-health">100%</strong></div>' +
          '<div><span>Fines</span><strong id="sh-fines">&#8377;0</strong></div>' +
          '<div><span>Temp</span><strong id="sh-temp">72&deg;</strong></div>' +
          '<div><span>Odo</span><strong id="sh-odo">0.0</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="sh-center panel">' +
        '<div class="sh-route-top"><span class="sh-route-kicker" id="sh-mode-name">FREE DRIVE</span>' +
          '<span class="sh-grade-pill" id="sh-objective">Explore</span></div>' +
        '<div class="sh-stop-row"><span class="sh-stop-name" id="sh-stop-name">IISER Vithura Campus</span>' +
          '<span class="sh-stop-dist" id="sh-dist"></span></div>' +
        '<div class="sh-status" id="sh-status">W / S throttle &middot; A / D steer &middot; C camera &middot; H horn</div>' +
        '<div class="sh-actions">' +
          '<button class="btn" type="button" id="sh-horn">Horn</button>' +
          '<button class="btn" type="button" id="sh-lights">Lights</button>' +
          '<button class="btn" type="button" id="sh-hand">Brake</button>' +
          '<button class="btn" type="button" id="sh-reset">Reset</button>' +
        '</div>' +
        '<div class="sh-selects">' +
          '<select class="sh-select" id="sh-fleet">' +
            '<option value="transit">City Transit GLB</option>' +
            '<option value="coach">Executive Coach GLB</option>' +
            '<option value="college">College Bus GLB</option>' +
            '<option value="buggy">Open Buggy</option>' +
          '</select>' +
          '<select class="sh-select" id="sh-mode">' +
            GAME_MODES.map(m => '<option value="' + m.id + '">' + m.label + '</option>').join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="sh-right panel">' +
        '<div class="sh-route-top"><span class="sh-kicker">SESSION</span>' +
          '<button class="btn" type="button" id="sh-exit">Exit</button></div>' +
        '<div class="sh-status" id="sh-objective-detail">Explore the campus at your own pace.</div>' +
        '<div class="mp-status-box" id="sh-mp-status">Solo session &middot; 8-player rooms available</div>' +
        '<div class="mp-btn-row">' +
          '<button class="btn" type="button" id="sh-mp-open">Multiplayer</button>' +
          '<button class="btn" type="button" id="sh-audio">Sound on</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(hud);

    const mpBoard = makeEl('div', 'mp-board panel hidden');
    mpBoard.innerHTML =
      '<div class="mp-board-head"><span class="mp-board-title">Drivers</span>' +
      '<span class="mp-room-tag" id="mp-room-tag">SOLO</span></div>' +
      '<div class="mp-rows" id="mp-rows"></div>';
    document.body.appendChild(mpBoard);

    const tagLayer = makeEl('div', 'mp-nametag-layer');
    document.body.appendChild(tagLayer);

    const touch = makeEl('div', 'touch-controls');
    touch.innerHTML =
      '<div class="touch-group">' +
        '<button class="touch-btn" type="button" data-touch="left">&#9664;</button>' +
        '<button class="touch-btn" type="button" data-touch="right">&#9654;</button>' +
      '</div>' +
      '<div class="touch-group">' +
        '<button class="touch-btn" type="button" data-touch="down">&#9660;</button>' +
        '<button class="touch-btn touch-go" type="button" data-touch="up">&#9650;</button>' +
      '</div>';
    document.body.appendChild(touch);

    ui = {
      modeStrip, camStrip, hud, mpBoard, tagLayer, touch,
      speed: hud.querySelector('#sh-speed'),
      gear: hud.querySelector('#sh-gear'),
      rpm: hud.querySelector('#sh-rpm'),
      indLeft: hud.querySelector('#sh-ind-left'),
      indRight: hud.querySelector('#sh-ind-right'),
      indLights: hud.querySelector('#sh-ind-lights'),
      indBeam: hud.querySelector('#sh-ind-beam'),
      indBrake: hud.querySelector('#sh-ind-brake'),
      indCam: hud.querySelector('#sh-ind-cam'),
      indGate: hud.querySelector('#sh-ind-gate'),
      fuel: hud.querySelector('#sh-fuel'),
      health: hud.querySelector('#sh-health'),
      fines: hud.querySelector('#sh-fines'),
      temp: hud.querySelector('#sh-temp'),
      odo: hud.querySelector('#sh-odo'),
      modeName: hud.querySelector('#sh-mode-name'),
      objective: hud.querySelector('#sh-objective'),
      stopName: hud.querySelector('#sh-stop-name'),
      dist: hud.querySelector('#sh-dist'),
      status: hud.querySelector('#sh-status'),
      objectiveDetail: hud.querySelector('#sh-objective-detail'),
      mpStatus: hud.querySelector('#sh-mp-status'),
      mpRows: mpBoard.querySelector('#mp-rows'),
      mpRoomTag: mpBoard.querySelector('#mp-room-tag'),
      hornBtn: hud.querySelector('#sh-horn'),
      lightsBtn: hud.querySelector('#sh-lights'),
      handBtn: hud.querySelector('#sh-hand'),
      resetBtn: hud.querySelector('#sh-reset'),
      fleetSelect: hud.querySelector('#sh-fleet'),
      modeSelect: hud.querySelector('#sh-mode'),
      exitBtn: hud.querySelector('#sh-exit'),
      mpBtn: hud.querySelector('#sh-mp-open'),
      audioBtn: hud.querySelector('#sh-audio')
    };

    ui.hornBtn.addEventListener('click', () => honkHorn(true));
    ui.lightsBtn.addEventListener('click', toggleLights);
    ui.resetBtn.addEventListener('click', resetVehicle);
    ui.exitBtn.addEventListener('click', exitDriveMode);
    ui.mpBtn.addEventListener('click', openMpModal);
    ui.audioBtn.addEventListener('click', () => {
      busState.audioMuted = !busState.audioMuted;
      ui.audioBtn.textContent = busState.audioMuted ? 'Sound off' : 'Sound on';
      if (!busState.audioMuted) ensureAudio();
      updateEngineAudio(false);
    });
    ui.fleetSelect.addEventListener('change', () => switchVehicle(ui.fleetSelect.value));
    ui.modeSelect.addEventListener('change', () => setGameMode(ui.modeSelect.value));

    const bindHold = (btn, prop) => {
      const on = (e) => { e.preventDefault(); held[prop] = true; };
      const off = (e) => { e.preventDefault(); held[prop] = false; };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    };
    bindHold(ui.handBtn, 'hand');
    ui.touch.querySelectorAll('[data-touch]').forEach(btn => bindHold(btn, btn.dataset.touch));

    const startBtn = document.getElementById('drive-start');
    if (startBtn) startBtn.addEventListener('click', () => enterDriveMode('free'));
    document.querySelectorAll('[data-game-mode]').forEach(btn => {
      btn.addEventListener('click', () => enterDriveMode(btn.getAttribute('data-game-mode')));
    });
  }

  function modeLabel(id) {
    for (const m of GAME_MODES) if (m.id === id) return m.label;
    return 'Free Drive';
  }

  function clearParkingProps() {
    for (const m of game.parkProps) scene.remove(m);
    for (const ob of game.parkObstacles) {
      const idx = dynamicCones.indexOf(ob);
      if (idx >= 0) dynamicCones.splice(idx, 1);
    }
    game.parkProps.length = 0;
    game.parkObstacles.length = 0;
  }

  function polyCenter(poly) {
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p[0]; cz += p[1]; }
    return { x: cx / poly.length, z: cz / poly.length };
  }

  function spawnParkingBay() {
    const lot = D.parking[0];
    if (!lot) return;
    const c = polyCenter(lot.polygon);
    const y = getSurfaceHeight(c.x, c.z);
    game.parkTarget = { x: c.x, z: c.z, y };
    const coneGeo = new T.ConeGeometry(0.26, 0.68, 10);
    const coneMat = new T.MeshStandardMaterial({ color: 0xff6b2c, roughness: 0.6 });
    const baseMat = new T.MeshStandardMaterial({ color: 0xf3f0e6, roughness: 0.7 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 5.4;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const gy = getSurfaceHeight(x, z);
      const g = new T.Group();
      const cone = new T.Mesh(coneGeo, coneMat);
      cone.position.y = 0.34; cone.castShadow = true;
      const base = new T.Mesh(new T.BoxGeometry(0.5, 0.06, 0.5), baseMat);
      base.position.y = 0.03;
      g.add(cone, base);
      g.position.set(x, gy, z);
      scene.add(g);
      game.parkProps.push(g);
      const ob = { kind: 'circle', x, z, r: 0.30 };
      game.parkObstacles.push(ob);
      dynamicCones.push(ob);
    }
  }

  function updateDestSign() {
    if (busState.vehicle !== 'bus') return;
    let text = 'FREE CAMPUS DRIVE';
    if (busState.mode === 'route') {
      const rt = ROUTES[game.routeIdx % ROUTES.length];
      text = 'R' + rt.id + ' ' + rt.name.replace(/^Route [0-9]+ . /, '');
    } else if (busState.mode === 'trial') text = 'TIME TRIAL';
    else if (busState.mode === 'park') text = 'PARKING BAY';
    else if (busState.mode === 'multi') text = '8P CAMPUS CRUISE';
    bus.setDestText(text.slice(0, 22), '#ffb32b');
  }

  function setGameMode(id, silent) {
    if (!GAME_MODES.some(m => m.id === id)) id = 'free';
    clearParkingProps();
    game.targetRing = -1;
    busState.mode = id;
    game.mode = id;
    game.stopName = '';
    game.stopDist = 0;
    game.score = busState.mode === 'route' ? game.score : 0;

    if (id === 'route') {
      game.routeIdx = 0;
      game.stopPtr = 0;
      game.laps = 0;
      game.passengers = 0;
      game.score = 0;
      game.objectiveText = ROUTES[0].name;
      game.detailText = 'Pick up students and complete all 8 stops on Route 101.';
      game.statusText = 'Route 101 · next stop loading…';
      switchVehicle('transit');
    } else if (id === 'trial') {
      game.checkpoints = [0, 1, 2, 3, 4, 5, 6, 7];
      game.cpIndex = 0;
      game.trialReady = true;
      game.trialDone = false;
      game.trialStart = 0;
      game.trialTime = 0;
      game.objectiveText = 'Beat the clock';
      game.detailText = 'Hit all 8 shuttle stops as quickly as possible. Best: ' +
        (game.trialBest > 0 ? game.trialBest.toFixed(1) + 's' : '—');
      game.statusText = 'Time trial ready — move to start the clock.';
      switchVehicle('transit');
    } else if (id === 'park') {
      game.parkDone = false;
      spawnParkingBay();
      game.objectiveText = 'Precision parking';
      game.detailText = 'Stop fully inside the cone-marked bay without touching a cone.';
      game.statusText = 'Drive to the marked parking bay.';
      switchVehicle('transit');
    } else if (id === 'safari') {
      game.checkpoints = [10, 11, 6, 5, 4, 2];
      game.cpIndex = 0;
      game.objectiveText = 'Buggy safari';
      game.detailText = 'Follow the buggy trail through the hilltop campus checkpoints.';
      game.statusText = 'Buggy trail · checkpoint 1 / 6';
      switchVehicle('buggy');
    } else if (id === 'multi') {
      game.objectiveText = '8-player cruise';
      game.detailText = 'Share a room code with friends and cruise the campus together.';
      game.statusText = mp.enabled ? ('Room ' + mp.room + ' · ' + (mp.peers.size + 1) + ' drivers') : 'Open Multiplayer to join a room.';
    } else {
      game.objectiveText = 'Explore';
      game.detailText = 'No objective — drive the campus at your own pace.';
      game.statusText = 'W / S throttle · A / D steer · C camera · H horn';
      if (busState.vehicle === 'buggy') switchVehicle('transit');
    }

    updateDestSign();
    if (ui) {
      ui.modeName.textContent = (GAME_MODES.find(m => m.id === id) || GAME_MODES[0]).kicker;
      ui.objective.textContent = game.objectiveText;
      ui.objectiveDetail.textContent = game.detailText;
      ui.status.textContent = game.statusText;
      ui.modeSelect.value = id;
      ui.modeStrip.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === id));
      ui.mpBoard.classList.toggle('hidden', !(mp.enabled || id === 'multi'));
    }
    if (!silent && ui) ui.status.textContent = game.statusText;
    updateHUD(performance.now() / 1000);
  }

  function cycleGameMode() {
    const ids = GAME_MODES.map(m => m.id);
    const idx = ids.indexOf(busState.mode);
    setGameMode(ids[(idx + 1) % ids.length]);
  }

  function openModePicker() {
    if (!ui) return;
    ui.modeStrip.classList.remove('hidden');
    ui.status.textContent = 'Choose a game mode from the bar above, or press M to cycle.';
  }

  // ---------- Objective progression ----------
  function ringPulse(idx, t) {
    if (game.targetRing >= 0 && game.targetRing < stopRingMeshes.length) {
      stopRingMeshes[game.targetRing].material.opacity = 0;
    }
    game.targetRing = idx;
    if (idx >= 0 && idx < stopRingMeshes.length) {
      stopRingMeshes[idx].material.opacity = 0.20 + 0.18 * (0.5 + 0.5 * Math.sin(t * 3.4));
    }
  }

  function updateObjective(dt, t) {
    game.stopName = '';
    game.stopDist = 0;
    if (!busState.active) {
      ringPulse(-1, t);
      return;
    }

    if (busState.mode === 'route') {
      const rt = ROUTES[game.routeIdx % ROUTES.length];
      const stopIdx = rt.stops[game.stopPtr % rt.stops.length];
      const st = BUS_STOPS[stopIdx];
      const d = Math.hypot(busState.x - st.x, busState.z - st.z);
      game.stopName = st.name;
      game.stopDist = d;
      ringPulse(stopIdx, t);
      game.objectiveText = rt.name;
      game.statusText = 'Passengers ' + game.passengers + ' · Score ' + game.score;
      if (d < 11 && Math.abs(busState.speed) < 1.5) {
        game.stopPtr++;
        game.passengers += 1 + Math.floor(Math.random() * 3);
        game.score += 120;
        playStopChime();
        if (game.stopPtr >= rt.stops.length) {
          game.stopPtr = 0;
          game.laps++;
          game.score += 500;
          busState.fuel = Math.max(20, busState.fuel - 4);
        }
        if (ui) ui.status.textContent = 'Stop served: ' + st.name;
        updateDestSign();
      }
    } else if (busState.mode === 'trial') {
      if (game.trialDone) {
        game.objectiveText = 'Finished!';
        game.statusText = 'Time ' + game.trialTime.toFixed(1) + 's · Best ' + game.trialBest.toFixed(1) + 's';
        game.stopName = 'Time trial complete';
        ringPulse(-1, t);
      } else {
        if (game.trialReady && Math.abs(busState.speed) > 1.0) {
          game.trialReady = false;
          game.trialStart = t;
        }
        if (!game.trialReady) game.trialTime = t - game.trialStart;
        const stopIdx = game.checkpoints[game.cpIndex];
        const st = BUS_STOPS[stopIdx];
        const d = Math.hypot(busState.x - st.x, busState.z - st.z);
        game.stopName = st.name;
        game.stopDist = d;
        ringPulse(stopIdx, t);
        game.objectiveText = 'Checkpoint ' + (game.cpIndex + 1) + ' / ' + game.checkpoints.length;
        game.statusText = 'Time ' + game.trialTime.toFixed(1) + 's · Best ' +
          (game.trialBest > 0 ? game.trialBest.toFixed(1) + 's' : '—');
        if (d < 10 && Math.abs(busState.speed) < 3.0) {
          game.cpIndex++;
          playStopChime();
          if (game.cpIndex >= game.checkpoints.length) {
            game.trialDone = true;
            if (game.trialTime > 0 && (game.trialBest <= 0 || game.trialTime < game.trialBest)) {
              game.trialBest = game.trialTime;
              try { localStorage.setItem('iiser.drive.trialBest', String(game.trialBest)); } catch (_) {}
            }
            playStopChime();
          }
        }
      }
    } else if (busState.mode === 'park') {
      const p = game.parkTarget;
      if (p) {
        const d = Math.hypot(busState.x - p.x, busState.z - p.z);
        game.stopName = game.parkDone ? 'Parked!' : 'Green parking bay';
        game.stopDist = d;
        game.objectiveText = 'Precision parking';
        if (!game.parkDone) {
          game.statusText = 'Distance to bay ' + Math.round(d) + ' m · approach slowly';
          if (d < 5.4 && Math.abs(busState.speed) < 0.35) {
            game.parkDone = true;
            const pts = Math.max(120, 1000 - Math.round(d * 120));
            game.score = pts;
            playStopChime();
            if (ui) ui.status.textContent = 'Parked cleanly — score ' + pts + '!';
          }
        } else {
          game.statusText = 'Parked inside the bay · score ' + game.score;
        }
        ringPulse(-1, t);
      }
    } else if (busState.mode === 'safari') {
      const st = BUS_STOPS[game.checkpoints[game.cpIndex % game.checkpoints.length]];
      const d = Math.hypot(busState.x - st.x, busState.z - st.z);
      game.stopName = st.name;
      game.stopDist = d;
      ringPulse(game.checkpoints[game.cpIndex % game.checkpoints.length], t);
      game.objectiveText = 'Checkpoint ' + (game.cpIndex + 1) + ' / ' + game.checkpoints.length;
      game.statusText = 'Buggy trail · stay off the kerbs';
      if (d < 12 && Math.abs(busState.speed) < 3.2) {
        game.cpIndex++;
        playStopChime();
        if (game.cpIndex >= game.checkpoints.length) {
          game.cpIndex = 0;
          game.score += 400;
          playStopChime();
        }
      }
    } else if (busState.mode === 'multi') {
      game.objectiveText = '8-player cruise';
      game.statusText = mp.enabled
        ? ('Room ' + mp.room + ' · ' + (mp.peers.size + 1) + ' drivers connected')
        : 'Open Multiplayer to join a room.';
      game.stopName = mp.enabled ? ('Room ' + mp.room) : 'Solo cruise';
      ringPulse(-1, t);
    } else {
      game.objectiveText = 'Explore';
      game.statusText = 'W / S throttle · A / D steer · C camera · H horn';
      game.stopName = busState.vehicle === 'buggy' ? 'Campus Buggy' : 'IISER Shuttle';
      ringPulse(-1, t);
    }
  }

  // ---------- Vehicle pose, suspension and light rig ----------
  function syncRigPose(dt, snap) {
    const def = VEHICLE_DEFS[busState.vehicle];
    const rig = activeRig;
    if (!rig || !rig.root) return;
    const h = busState.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const L = def.halfL, Wd = def.halfW;
    const hF = getSurfaceHeight(busState.x + fx * L, busState.z + fz * L);
    const hB = getSurfaceHeight(busState.x - fx * L, busState.z - fz * L);
    const hR = getSurfaceHeight(busState.x + rx * Wd, busState.z + rz * Wd);
    const hL = getSurfaceHeight(busState.x - rx * Wd, busState.z - rz * Wd);
    const y = (hF + hB + hR + hL) * 0.25 + 0.035;
    const pitch = Math.atan2(hB - hF, L * 1.55);
    const roll = Math.atan2(hR - hL, Wd * 1.55);
    const k = snap ? 1 : Math.min(1, dt * 9);

    rig.root.rotation.order = 'YXZ';
    rig.root.position.x = busState.x;
    rig.root.position.z = busState.z;
    rig.root.position.y += (y - rig.root.position.y) * k;
    rig.root.rotation.x += (pitch - rig.root.rotation.x) * k;
    rig.root.rotation.y = h;
    rig.root.rotation.z += (roll - rig.root.rotation.z) * k;

    const lean = -clamp(busState.steer * (busState.speed / def.maxSpeed) * 0.55, -0.075, 0.075);
    if (rig.body) {
      rig.body.rotation.z += (lean - rig.body.rotation.z) * Math.min(1, dt * 7);
      const bob = Math.sin(performance.now() * 0.012) * 0.0035 * clamp(Math.abs(busState.speed) / 5, 0, 1);
      rig.body.position.y += ((snap ? 0 : bob) - rig.body.position.y) * Math.min(1, dt * 8);
    }

    const spin = (busState.speed / def.wheelRadius) * dt;
    if (rig.glbWheels && rig.glbWheels.length) {
      for (const w of rig.glbWheels) {
        if (w.spinPivot) w.spinPivot.rotation.x += spin;
        if (w.steerPivot) w.steerPivot.rotation.y += ((w.isFront ? busState.steer : 0) - w.steerPivot.rotation.y) * Math.min(1, dt * 10);
      }
    }
    if (rig.wheels && rig.wheels.length) {
      for (const w of rig.wheels) {
        w.spinPivot.rotation.x += spin;
        w.steerPivot.rotation.y += ((w.front ? busState.steer : 0) - w.steerPivot.rotation.y) * Math.min(1, dt * 10);
      }
    }
    if (rig.steeringWheel) {
      rig.steeringWheel.rotation.z += ((-busState.steer * 1.9) - rig.steeringWheel.rotation.z) * Math.min(1, dt * 10);
    }

    const braking = (held.down && busState.speed > 0.1) || held.hand || (busState.speed < -0.1 && held.down);
    const beamPower = busState.lights ? (busState.highBeam ? 4.6 : 2.6) : 0.0;
    if (rig.headLightMat) rig.headLightMat.emissiveIntensity = busState.lights ? (busState.highBeam ? 3.6 : 2.8) : 0.55;
    if (rig.brakeLightMat) rig.brakeLightMat.emissiveIntensity = braking ? 3.0 : 0.5;
    if (rig.revLightMat) rig.revLightMat.emissiveIntensity = busState.speed < -0.1 ? 2.4 : 0.0;
    if (rig.beamLightL) {
      rig.beamLightL.intensity = beamPower;
      rig.beamLightR.intensity = beamPower;
      rig.beamLightL.angle = busState.highBeam ? Math.PI * 0.34 : Math.PI * 0.25;
      rig.beamLightR.angle = busState.highBeam ? Math.PI * 0.34 : Math.PI * 0.25;
    }
  }

  // ---------- Arcade vehicle physics ----------
  function updatePlayer(dt, t) {
    const def = VEHICLE_DEFS[busState.vehicle];
    const fwdIntent = held.up;
    const backIntent = held.down;
    let engine = 0;
    let braking = false;

    if (fwdIntent && !backIntent) {
      if (busState.speed < -0.25) braking = true;
      else engine = busState.health > 0 ? def.accel : 0;
    } else if (backIntent && !fwdIntent) {
      if (busState.speed > 0.25) braking = true;
      else engine = -def.accel * 0.78;
    }
    if (held.hand) braking = true;

    if (engine !== 0) busState.speed += engine * dt;
    if (braking) {
      const dec = def.brake * dt;
      if (Math.abs(busState.speed) <= dec) busState.speed = 0;
      else busState.speed -= Math.sign(busState.speed) * dec;
    }

    const h0 = busState.heading;
    const fx0 = Math.sin(h0), fz0 = Math.cos(h0);
    const hF = getSurfaceHeight(busState.x + fx0 * def.halfL * 1.5, busState.z + fz0 * def.halfL * 1.5);
    const hB = getSurfaceHeight(busState.x - fx0 * def.halfL * 1.5, busState.z - fz0 * def.halfL * 1.5);
    const grade = (hF - hB) / (def.halfL * 3.0);
    busState.speed -= Math.sin(Math.atan(grade)) * 9.81 * 0.32 * dt;

    const drag = 0.32 + 0.010 * busState.speed * busState.speed;
    busState.speed -= Math.sign(busState.speed) * Math.min(Math.abs(busState.speed), drag * dt);
    if (!fwdIntent && !backIntent && Math.abs(busState.speed) < 0.10) busState.speed = 0;
    busState.speed = clamp(busState.speed, -def.reverseMax, def.maxSpeed);

    const steerIn = (held.left ? 1 : 0) - (held.right ? 1 : 0);
    const speedNorm = clamp(Math.abs(busState.speed) / def.maxSpeed, 0, 1);
    const steerTarget = steerIn * def.steerMax * (1 - 0.45 * speedNorm);
    busState.steer += (steerTarget - busState.steer) * Math.min(1, dt * 7.5);
    if (Math.abs(busState.speed) > 0.06) {
      busState.heading = normAng(busState.heading +
        Math.tan(busState.steer) * busState.speed / def.wheelbase * dt);
    }

    busState.x += Math.sin(busState.heading) * busState.speed * dt;
    busState.z += Math.cos(busState.heading) * busState.speed * dt;

    const dynObs = [];
    if (gateState.open < 0.55 && gateBoomObstacle) dynObs.push(gateBoomObstacle);
    const preImpact = Math.abs(busState.speed);
    const res = resolveBusSolidCollisions(busState, dynObs);
    const carHit = resolveBusVsAiCars();
    const impactNow = Math.max(res.hit ? res.impactSpeed : 0, carHit.hit ? carHit.impact : 0);
    if (impactNow > 2.2) playImpactThud(impactNow);
    // Health damage + nominal collision fine for cracking into things
    if (impactNow > 2.6) {
      const damage = Math.min(45, Math.round((impactNow - 1.6) * 7));
      if (damage > 0) {
        busState.health = Math.max(0, busState.health - damage);
        if (t - busState.lastHitFineAt > 4.0) {
          busState.lastHitFineAt = t;
          game.score = Math.max(0, game.score - HIT_FINE);
          busState.fines += 1;
          busState.fineAmount += HIT_FINE;
          flashNotice('Collision −' + damage + ' health · fine ₹' + HIT_FINE, 'bad');
        } else {
          flashNotice('Ouch! −' + damage + ' health', 'bad');
        }
      }
    }

    syncRigPose(dt, false);

    busState.odo += Math.abs(busState.speed) * dt / 1000;
    if (busState.fuel > 5) busState.fuel = Math.max(5, busState.fuel - Math.abs(busState.speed) * dt * 0.0022);
    busState.temp = 72 + speedNorm * 18 + (fwdIntent ? 1.5 : 0);

    if (busState.speed < -0.2) busState.gear = 'R';
    else if (Math.abs(busState.speed) < 0.2) busState.gear = 'N';
    else if (busState.speed < 3.4) busState.gear = '1';
    else if (busState.speed < 7.0) busState.gear = '2';
    else if (busState.speed < 11.0) busState.gear = '3';
    else if (busState.speed < 15.0) busState.gear = '4';
    else busState.gear = '5';
    busState.rpm = 720 + speedNorm * 1750 + (engine > 0 ? 220 : 0) + (braking ? -120 : 0);

    const now = performance.now();
    if (steerIn !== 0 && Math.abs(busState.speed) > 0.7 && now - busState.lastBlinkerAt > 420) {
      busState.blinker = -steerIn;
      busState.lastBlinkerAt = now;
      playBlinkerClick(!!(Math.floor(now / 420) % 2));
    } else if (steerIn === 0) {
      busState.blinker = 0;
    }

    updateEngineAudio(fwdIntent || backIntent);
  }

  // ---------- Cameras ----------
  const driveCamPos = new T.Vector3();
  const driveLookAt = new T.Vector3();
  let camSnap = true;
  const _camV = new T.Vector3();
  const _lookV = new T.Vector3();

  function setCamMode(mode) {
    busState.camMode = clamp(mode | 0, 0, CAM_MODES.length - 1);
    camSnap = true;
    if (ui) {
      ui.camStrip.querySelectorAll('[data-cam]').forEach(b => {
        b.classList.toggle('on', parseInt(b.dataset.cam, 10) === busState.camMode);
      });
    }
  }

  function cycleCamMode() {
    setCamMode((busState.camMode + 1) % CAM_MODES.length);
  }

  function updateDriveCamera(dt, t) {
    const def = VEHICLE_DEFS[busState.vehicle];
    const rig = activeRig;
    if (!rig || !rig.root) return;
    if (bus.modelMount && busState.vehicle === 'bus' && busState.camMode !== 0) bus.modelMount.visible = true;
    rig.root.updateMatrixWorld(true);
    const h = busState.heading;
    const fx = Math.sin(h), fz = Math.cos(h);

    let fov = 62;
    const cfg = FLEET_CONFIGS[busState.fleetKey] || FLEET_CONFIGS.transit;

    if (busState.camMode === 0) {
      const e = (busState.vehicle === 'bus' && cfg) ? (cfg.cockpitEye || cfg.driverEye) : def.eye;
      _camV.set(e.x, e.y, e.z);
      rig.root.localToWorld(_camV);
      _lookV.set(e.x, e.y - 1.15, e.z + 16);
      rig.root.localToWorld(_lookV);
      const shake = clamp(Math.abs(busState.speed) / def.maxSpeed, 0, 1);
      _camV.x += Math.sin(t * 23.1) * 0.010 * shake;
      _camV.y += Math.sin(t * 31.7) * 0.007 * shake;
      fov = 68;
      if (busState.vehicle === 'bus' && bus.modelMount) bus.modelMount.visible = false;
    } else if (busState.camMode === 1) {
      const e = (busState.vehicle === 'bus' && cfg) ? cfg.hoodCam : def.hood;
      _camV.set(e.x, e.y, e.z);
      rig.root.localToWorld(_camV);
      _lookV.set(e.x, e.y - 1.1, e.z + 25);
      rig.root.localToWorld(_lookV);
      fov = 64;
    } else if (busState.camMode === 2) {
      const back = 10.5 + def.halfL * 0.4;
      const gy = getSurfaceHeight(busState.x, busState.z);
      _camV.set(busState.x - fx * back, gy + 3.4, busState.z - fz * back);
      _lookV.set(busState.x + fx * 4.0, gy + 1.5, busState.z + fz * 4.0);
      fov = 56;
    } else if (busState.camMode === 3) {
      const a = t * 0.24;
      const gy = getSurfaceHeight(busState.x, busState.z);
      _camV.set(busState.x + Math.sin(a) * 15.0, gy + 6.2, busState.z + Math.cos(a) * 15.0);
      _lookV.set(busState.x, gy + 1.6, busState.z);
      fov = 50;
    } else if (busState.camMode === 4) {
      const e = (busState.vehicle === 'bus' && cfg) ? cfg.paxCam : { x: -0.36, y: 1.5, z: 0.55 };
      _camV.set(e.x, e.y, e.z);
      rig.root.localToWorld(_camV);
      _lookV.set(e.x, e.y - 0.02, e.z + 25);
      rig.root.localToWorld(_lookV);
      fov = 62;
    } else if (busState.camMode === 5) {
      _camV.set(1.95, 1.95, 3.1);
      rig.root.localToWorld(_camV);
      _lookV.set(0.1, 1.45, 9.0);
      rig.root.localToWorld(_lookV);
      fov = 58;
    } else {
      const gy = getSurfaceHeight(busState.x, busState.z);
      _camV.set(busState.x - fx * 22.0, gy + 18.0, busState.z - fz * 22.0);
      _lookV.set(busState.x + fx * 4.0, gy + 1.0, busState.z + fz * 4.0);
      fov = 46;
    }

    if (busState.camMode !== 0) {
      const gc = getSurfaceHeight(_camV.x, _camV.z) + 1.1;
      if (_camV.y < gc) _camV.y = gc;
    }
    if (camSnap) {
      driveCamPos.copy(_camV);
      driveLookAt.copy(_lookV);
      camSnap = false;
    } else {
      const k = busState.camMode === 0 ? 1 : Math.min(1, dt * 7.5);
      driveCamPos.lerp(_camV, k);
      driveLookAt.lerp(_lookV, Math.min(1, dt * 10));
    }
    camera.position.copy(driveCamPos);
    camera.lookAt(driveLookAt);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4.5);
    camera.updateProjectionMatrix();
  }

  // ---------- Cockpit dash canvas ----------
  let dashAt = 0;
  function updateDash(t) {
    if (!bus.dashCtx || !bus.dashCanvas) return;
    const ctx = bus.dashCtx;
    const w = bus.dashCanvas.width, h = bus.dashCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b0c';
    ctx.fillRect(0, 0, w, h);
    const speed = Math.round(Math.abs(busState.speed) * 3.6);
    const rpmN = clamp((busState.rpm - 700) / 1800, 0, 1);
    ctx.strokeStyle = 'rgba(59,232,176,0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 62, 38, Math.PI * 0.78, Math.PI * 2.22);
    ctx.stroke();
    ctx.strokeStyle = rpmN > 0.82 ? '#ff5b4d' : '#3be8b0';
    ctx.beginPath();
    ctx.arc(64, 62, 38, Math.PI * 0.78, Math.PI * (0.78 + 1.44 * rpmN));
    ctx.stroke();
    ctx.fillStyle = '#f5f0e4';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(speed), 64, 66);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#8fe8ca';
    ctx.fillText('km/h', 64, 84);
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffb32b';
    ctx.fillText(busState.gear, 122, 44);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#9aa8a3';
    ctx.fillText('GEAR', 122, 58);
    ctx.fillStyle = '#3be8b0';
    ctx.fillRect(122, 70, 70 * clamp(busState.fuel / 100, 0, 1), 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(122, 70, 70, 8);
    ctx.fillStyle = '#9aa8a3';
    ctx.font = '10px monospace';
    ctx.fillText('FUEL ' + Math.round(busState.fuel) + '%', 122, 92);
    bus.dashTex.needsUpdate = true;
  }

  // ---------- HUD ----------
  let hudAt = 0;
  function updateHUD(t) {
    if (!ui) return;
    const kmh = Math.round(Math.abs(busState.speed) * 3.6);
    ui.speed.textContent = String(kmh);
    ui.gear.textContent = busState.gear;
    ui.gear.classList.toggle('lit-amber', busState.gear === 'R');
    ui.rpm.style.width = clamp((busState.rpm - 700) / 1800, 0, 1) * 100 + '%';
    ui.fuel.textContent = Math.round(busState.fuel) + '%';
    ui.temp.textContent = Math.round(busState.temp) + '°';
    ui.odo.textContent = busState.odo.toFixed(1);

    ui.indLeft.classList.toggle('lit-amber', (busState.hazards || busState.blinker < 0) && Math.floor(t * 4) % 2 === 0);
    ui.indRight.classList.toggle('lit-amber', (busState.hazards || busState.blinker > 0) && Math.floor(t * 4) % 2 === 0);
    ui.indLights.classList.toggle('lit-blue', busState.lights);
    ui.indBeam.classList.toggle('lit-white', busState.highBeam && busState.lights);
    ui.indBrake.classList.toggle('lit-red', held.down || held.hand);
    ui.indCam.classList.toggle('lit-orange', !!game.nearSpeedCamera);
    ui.indGate.classList.toggle('lit-green', !busState.gateBlocked);
    ui.indGate.classList.toggle('lit-red', busState.gateBlocked);
    ui.health.textContent = Math.round(busState.health) + '%';
    ui.health.classList.toggle('lit-red-text', busState.health <= 30);
    ui.fines.textContent = '₹' + Math.round(busState.fineAmount);

    ui.modeName.textContent = (GAME_MODES.find(m => m.id === busState.mode) || GAME_MODES[0]).kicker;
    ui.objective.textContent = game.objectiveText || 'Explore';
    ui.stopName.textContent = game.stopName || 'IISER Vithura Campus';
    ui.dist.textContent = game.stopDist > 0 ? Math.round(game.stopDist) + ' m' : '';
    ui.status.textContent = game.statusText || 'Drive carefully — campus speed limit 30 km/h.';
    ui.objectiveDetail.textContent = game.detailText || '';
    ui.mpStatus.textContent = mp && mp.status ? mp.status : 'Solo session · 8-player rooms available';
    ui.mpRoomTag.textContent = mp && mp.enabled ? mp.room : 'SOLO';

    ui.camStrip.querySelectorAll('[data-cam]').forEach(b => {
      b.classList.toggle('on', parseInt(b.dataset.cam, 10) === busState.camMode);
    });
    ui.modeStrip.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === busState.mode);
    });
  }

  // ---------- Player enter/exit ----------
  function savedFleet() {
    try { return localStorage.getItem('iiser.drive.fleet') || 'transit'; } catch (_) { return 'transit'; }
  }
  function initVehiclePicker() {
    const cards = document.querySelectorAll('#vehicle-cards [data-vehicle]');
    if (!cards.length) return;
    const apply = (key) => {
      cards.forEach(c => {
        const on = c.getAttribute('data-vehicle') === key;
        c.classList.toggle('on', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    apply(savedFleet());
    cards.forEach(c => c.addEventListener('click', () => {
      const key = c.getAttribute('data-vehicle') || 'transit';
      try { localStorage.setItem('iiser.drive.fleet', key); } catch (_) {}
      apply(key);
      if (busState.active) switchVehicle(key);
    }));
  }
  function enterDriveMode(modeId) {
    createDriveUI();
    if (!busState.initialized) {
      const sp = getSpawnPoint();
      busState.x = sp.x; busState.z = sp.z; busState.heading = sp.heading;
      busState.initialized = true;
      switchVehicle(savedFleet());
      syncRigPose(0, true);
    }
    busState.active = true;
    busState.driving = true;
    busState.started = true;
    document.body.classList.add('shuttle-active');
    W.setExternalCamera(true);
    ui.hud.classList.remove('hidden');
    ui.modeStrip.classList.remove('hidden');
    ui.camStrip.classList.remove('hidden');
    ui.mpBoard.classList.toggle('hidden', !(mp.enabled || busState.mode === 'multi'));
    const info = document.getElementById('info');
    if (info) info.classList.add('hidden');
    setCamMode(busState.camMode);
    setGameMode(modeId || busState.mode || 'free', true);
    if (activeRig && activeRig.root) activeRig.root.visible = true;
    ensureAudio();
    camSnap = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    updateHUD(performance.now() / 1000);
    if (busState.mode === 'multi' && !mp.enabled) setTimeout(openMpModal, 180);
  }

  function exitDriveMode() {
    if (!busState.active) return;
    busState.active = false;
    busState.driving = false;
    held.up = held.down = held.left = held.right = held.hand = false;
    if (audioCtx) updateEngineAudio(false);
    leaveMultiplayer();
    document.body.classList.remove('shuttle-active');
    if (ui) {
      ui.hud.classList.add('hidden');
      ui.modeStrip.classList.add('hidden');
      ui.camStrip.classList.add('hidden');
      ui.mpBoard.classList.add('hidden');
      ui.tagLayer.querySelectorAll('.mp-nametag').forEach(tag => tag.remove());
    }
    W.setExternalCamera(false);
    W.goView('gate');
  }

  // ---------- Multiplayer: BroadcastChannel local co-op + optional WebSocket room ----------
  const mp = {
    enabled: false, room: '', channel: null, ws: null, wsOpen: false,
    transport: 'pending',
    serverId: '', peers: new Map(), lastSend: 0, lastBoard: 0,
    status: 'Solo session · 8-player rooms available'
  };
  const _mpV = new T.Vector3();

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function saveProfile() {
    try {
      localStorage.setItem('iiser.drive.name', localPlayer.name);
      localStorage.setItem('iiser.drive.color', String(localPlayer.colorIdx));
    } catch (_) {}
  }

  function mpStatusUpdate() {
    if (!mp.enabled) {
      mp.status = 'Solo session · 8-player rooms available';
    } else {
      const n = mp.peers.size + 1;
      mp.status = 'Room ' + mp.room + ' · ' + n + ' driver' + (n === 1 ? '' : 's') +
        (mp.wsOpen ? ' · WebSocket' : ' · local co-op');
    }
    if (ui) {
      ui.mpStatus.textContent = mp.status;
      ui.mpRoomTag.textContent = mp.enabled ? mp.room : 'SOLO';
    }
  }

  function sendMultiplayerPacket(obj) {
    if (!mp.enabled) return;
    const packet = Object.assign({
      id: localPlayer.id, name: localPlayer.name,
      colorIdx: localPlayer.colorIdx, ts: Date.now()
    }, obj || {});
    if (mp.channel && mp.transport === 'bc') {
      try { mp.channel.postMessage(packet); } catch (_) {}
    }
    if (mp.ws && mp.ws.readyState === 1) {
      try { mp.ws.send(JSON.stringify(packet)); } catch (_) {}
    }
  }

  function sendMpState() {
    if (!mp.enabled) return;
    sendMultiplayerPacket({
      type: 'state',
      x: busState.x, y: getSurfaceHeight(busState.x, busState.z), z: busState.z,
      heading: busState.heading, speed: busState.speed, steer: busState.steer,
      fleet: busState.fleetKey, vehicle: busState.vehicle,
      mode: busState.mode, score: game.score,
      braking: held.down || held.hand, ts: Date.now()
    });
  }

  function ensurePeer(p) {
    if (!p || !p.id) return null;
    if (p.id === localPlayer.id || p.id === mp.serverId) return null;
    let peer = mp.peers.get(p.id);
    if (peer) return peer;
    const rig = createBusVehicleRig(false);
    rig.root.name = 'remoteDriver_' + p.id;
    const cIdx = clamp((p.colorIdx | 0) % PLAYER_COLORS.length, 0, PLAYER_COLORS.length - 1);
    const peerFleet = ['transit', 'coach', 'college'].indexOf(p.fleet) >= 0 ? p.fleet : 'transit';
    equipRigWithGlb(rig, peerFleet, PLAYER_COLORS[cIdx].hex);
    rig.root.position.set(+p.x || 0, getSurfaceHeight(+p.x || 0, +p.z || 0), +p.z || 0);
    rig.root.rotation.y = +p.heading || 0;
    rig.root.visible = true;
    const tag = makeEl('div', 'mp-nametag');
    tag.innerHTML = '<i style="background:' + PLAYER_COLORS[cIdx].css + '"></i>' + escapeHtml(p.name || 'Driver');
    if (ui) ui.tagLayer.appendChild(tag);
    peer = {
      id: p.id, name: String(p.name || 'Driver').slice(0, 18), colorIdx: cIdx,
      rig, tag, x: +p.x || 0, z: +p.z || 0, y: +p.y || getSurfaceHeight(+p.x || 0, +p.z || 0),
      tx: +p.x || 0, tz: +p.z || 0, ty: +p.y || 0,
      heading: +p.heading || 0, targetHeading: +p.heading || 0,
      speed: +p.speed || 0, mode: p.mode || 'free', score: +p.score || 0, fleet: peerFleet
    };
    mp.peers.set(p.id, peer);
    updateMpBoard();
    mpStatusUpdate();
    return peer;
  }

  function removePeer(id) {
    const peer = mp.peers.get(id);
    if (!peer) return;
    if (peer.tag) peer.tag.remove();
    if (peer.rig && peer.rig.root && peer.rig.root.parent) peer.rig.root.parent.remove(peer.rig.root);
    mp.peers.delete(id);
    updateMpBoard();
    mpStatusUpdate();
  }

  function handleMpPacket(msg) {
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    if (msg.type === 'state' || msg.type === 'hello') {
      if (msg.id === localPlayer.id) return;
      const peer = ensurePeer(msg);
      if (peer) {
        peer.tx = +msg.x || 0;
        peer.tz = +msg.z || 0;
        peer.ty = +msg.y || getSurfaceHeight(peer.tx, peer.tz);
        peer.targetHeading = +msg.heading || 0;
        peer.speed = +msg.speed || 0;
        peer.mode = msg.mode || peer.mode;
        peer.score = +msg.score || 0;
        if (msg.name) peer.name = String(msg.name).slice(0, 18);
        const fleetKey = ['transit', 'coach', 'college'].indexOf(msg.fleet) >= 0 ? msg.fleet : 'transit';
        if (fleetKey !== peer.fleet) {
          peer.fleet = fleetKey;
          equipRigWithGlb(peer.rig, fleetKey, PLAYER_COLORS[peer.colorIdx].hex);
        }
      }
    } else if (msg.type === 'roster') {
      const list = Array.isArray(msg.players) ? msg.players : [];
      for (const p of list) ensurePeer(p);
      updateMpBoard();
      mpStatusUpdate();
    } else if (msg.type === 'welcome') {
      mp.serverId = msg.id || '';
      mp.status = 'Room ' + (msg.room || mp.room) + ' · connected · max ' + (msg.maxPlayers || 8);
      if (ui) ui.mpStatus.textContent = mp.status;
      updateMpBoard();
    } else if (msg.type === 'leave') {
      removePeer(msg.id);
    } else if (msg.type === 'roomFull') {
      mp.status = 'Room full (' + (msg.maxPlayers || 8) + '/8) · try another code';
      if (ui) ui.mpStatus.textContent = mp.status;
    } else if (msg.type === 'horn') {
      if (msg.id !== localPlayer.id && mp.peers.has(msg.id)) {
        try { honkHorn(false); } catch (_) {}
      }
    }
  }

  function teardownMp() {
    if (mp.channel) { try { mp.channel.close(); } catch (_) {} }
    mp.channel = null;
    if (mp.ws) { try { mp.ws.close(); } catch (_) {} }
    mp.ws = null;
    mp.wsOpen = false;
    mp.enabled = false;
    mp.room = '';
    mp.serverId = '';
    mp.transport = 'pending';
    for (const id of Array.from(mp.peers.keys())) removePeer(id);
  }

  function leaveMultiplayer() {
    teardownMp();
    mp.status = 'Solo session · 8-player rooms available';
    mpStatusUpdate();
    updateMpBoard();
  }

  function connectRoomSocket(room) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.hostname || 'localhost';
    const sameOrigin = proto + '//' + location.host + '/ws';
    const legacy = proto + '//' + host + ':8765/ws';
    const fallback = sameOrigin === legacy ? null : legacy;
    let triedFallback = false;
    let settled = false;
    const failsafe = setTimeout(() => {
      if (settled || !mp.enabled) return;
      mp.transport = 'bc';
      mp.status = 'Room ' + mp.room + ' · local co-op (run multiplayer-server.js for internet play)';
      if (ui) ui.mpStatus.textContent = mp.status;
    }, 2600);

    function attach(socket) {
      mp.ws = socket;
      socket.onopen = () => {
        if (mp.ws !== socket) return;
        settled = true;
        clearTimeout(failsafe);
        mp.wsOpen = true;
        mp.transport = 'ws';
        try {
          socket.send(JSON.stringify({
            type: 'join', room: mp.room, name: localPlayer.name,
            fleet: busState.fleetKey, colorIdx: localPlayer.colorIdx, mode: busState.mode
          }));
        } catch (_) {}
        mpStatusUpdate();
      };
      socket.onmessage = (ev) => {
        if (mp.ws !== socket) return;
        try { handleMpPacket(JSON.parse(ev.data)); } catch (_) {}
      };
      socket.onclose = () => {
        if (mp.ws !== socket) return;
        clearTimeout(failsafe);
        mp.wsOpen = false;
        if (mp.enabled) {
          mp.status = 'Room ' + mp.room + ' · local co-op (server offline)';
          if (ui) ui.mpStatus.textContent = mp.status;
        }
      };
      socket.onerror = () => {
        if (mp.ws === socket && !settled && fallback && !triedFallback) {
          triedFallback = true;
          try { attach(new WebSocket(fallback)); } catch (_) {}
        }
      };
    }
    try {
      attach(new WebSocket(sameOrigin));
    } catch (_) {
      if (fallback) {
        try { attach(new WebSocket(fallback)); return; } catch (_e) {}
      }
      mp.status = 'Local co-op only · WebSocket unavailable';
      if (ui) ui.mpStatus.textContent = mp.status;
      return;
    }
  }

  function startMultiplayer(room, name, colorIdx, mode) {
    room = String(room || 'IISER-1').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 18) || 'IISER-1';
    name = String(name || 'Driver').trim().slice(0, 18) || 'Driver';
    localPlayer.name = name;
    localPlayer.colorIdx = clamp(colorIdx | 0, 0, PLAYER_COLORS.length - 1);
    localPlayer.room = room;
    saveProfile();
    teardownMp();
    mp.enabled = true;
    mp.room = room;
    mp.status = 'Joining room ' + room + '…';
    if ('BroadcastChannel' in window) {
      try {
        mp.channel = new BroadcastChannel('iiser-drive-' + room);
        mp.transport = 'pending';
        mp.channel.onmessage = (ev) => { if (mp.transport !== 'bc') return; handleMpPacket(ev.data); };
      } catch (_) { mp.channel = null; mp.transport = 'ws'; }
    } else {
      mp.transport = 'ws';
    }
    if (busState.vehicle === 'buggy') {
      // keep the buggy; remote players still see a shuttle proxy
    } else {
      equipFleetBus(busState.fleetKey === 'buggy' ? 'transit' : busState.fleetKey);
    }
    connectRoomSocket(room);
    sendMultiplayerPacket({ type: 'hello', x: busState.x, y: getSurfaceHeight(busState.x, busState.z), z: busState.z, heading: busState.heading, fleet: busState.fleetKey, mode: busState.mode });
    mpStatusUpdate();
    updateMpBoard();
    const modal = document.getElementById('mp-modal');
    if (modal) modal.classList.add('hidden');
    if (ui) {
      ui.mpBoard.classList.remove('hidden');
      ui.modeStrip.classList.remove('hidden');
      ui.status.textContent = 'Multiplayer room ' + room + ' · share the code with friends.';
    }
    // Any single-player mode can be played in the room; the strip above stays live.
    setGameMode(mode || 'route', true);
  }

  function updateMpBoard() {
    if (!ui) return;
    const show = busState.active && (mp.enabled || busState.mode === 'multi');
    ui.mpBoard.classList.toggle('hidden', !show);
    const rows = [];
    rows.push({
      me: true, name: localPlayer.name, colorIdx: localPlayer.colorIdx,
      score: game.score, mode: busState.mode
    });
    for (const p of mp.peers.values()) {
      rows.push({ me: false, name: p.name, colorIdx: p.colorIdx, score: p.score, mode: p.mode });
    }
    // Group drivers by the mode they're playing; rank by score inside each group
    const groups = new Map();
    for (const r of rows) {
      const k = r.mode || 'free';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const order = ['route', 'trial', 'park', 'safari', 'free', 'multi'];
    for (const k of groups.keys()) if (order.indexOf(k) < 0) order.push(k);
    let html = '';
    for (const modeId of order) {
      const list = groups.get(modeId);
      if (!list || !list.length) continue;
      list.sort((a, b) => (b.score | 0) - (a.score | 0));
      html += '<div class="mp-mode-head">' + escapeHtml(modeLabel(modeId)) + '</div>';
      list.forEach((r, i) => {
        const c = PLAYER_COLORS[r.colorIdx % PLAYER_COLORS.length];
        html += '<div class="mp-row' + (r.me ? ' me' : '') + '">' +
          '<span class="mp-rank">' + (i + 1) + '</span>' +
          '<span class="mp-dot" style="background:' + c.css + '"></span>' +
          '<span class="mp-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="mp-val">' + (r.score | 0) + '</span>' +
          '</div>';
      });
    }
    if (!mp.enabled) {
      html += '<div class="mp-row" style="opacity:.62;display:block;">Open Multiplayer to invite up to 7 more drivers.</div>';
    }
    ui.mpRows.innerHTML = html;
  }

  function openMpModal() {
    createDriveUI();
    let modal = document.getElementById('mp-modal');
    if (!modal) {
      modal = makeEl('div', 'modal hidden');
      modal.id = 'mp-modal';
      modal.innerHTML =
        '<div class="modal-card panel">' +
          '<button class="close" type="button" id="mp-close">&times;</button>' +
          '<div class="kicker">8-player campus cruise</div>' +
          '<h2>Multiplayer</h2>' +
          '<p>Friends join through the <strong>same link you opened</strong>. Run <code>node multiplayer-server.js</code> to serve the game + WebSocket rooms on one port; for internet play share a tunnel (e.g. <code>cloudflared tunnel --url http://localhost:8765</code>) or forward port 8765 — same-browser tabs sync locally without it.</p>' +
          '<div class="mp-modal-grid">' +
            '<div class="mp-field"><label for="mp-name">Callsign</label>' +
              '<input id="mp-name" class="mp-input" maxlength="18" autocomplete="off"></div>' +
            '<div class="mp-field"><label for="mp-room">Room code</label>' +
              '<input id="mp-room" class="mp-input" maxlength="18" autocomplete="off" value="IISER-1"></div>' +
          '</div>' +
          '<div class="mp-modal-grid">' +
            '<div class="mp-field"><label for="mp-fleet">Vehicle</label>' +
              '<select id="mp-fleet" class="mp-input">' +
                '<option value="transit">City Transit Bus</option>' +
                '<option value="coach">Executive Coach</option>' +
                '<option value="college">College Bus</option>' +
                '<option value="buggy">Open Buggy</option>' +
              '</select></div>' +
            '<div class="mp-field"><label for="mp-mode">Game mode</label>' +
              '<select id="mp-mode" class="mp-input">' +
                '<option value="route">Shuttle 101 (score attack)</option>' +
                '<option value="trial">Time Trial (best lap)</option>' +
                '<option value="park">Precision Park</option>' +
                '<option value="safari">Buggy Safari</option>' +
                '<option value="free">Free Drive</option>' +
                '<option value="multi">8P Cruise (freeroam)</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="mp-field"><label>Bus colour</label><div class="mp-swatches" id="mp-colors"></div></div>' +
          '<div class="mp-status-box" id="mp-modal-status">Rooms hold up to 8 drivers. No traffic lights, just campus traffic rules.</div>' +
          '<div class="mp-btn-row">' +
            '<button class="btn primary" type="button" id="mp-connect">Connect</button>' +
            '<button class="btn" type="button" id="mp-disconnect">Leave room</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      const colors = modal.querySelector('#mp-colors');
      PLAYER_COLORS.forEach((c, i) => {
        const b = makeEl('button', 'mp-swatch');
        b.type = 'button';
        b.style.background = c.css;
        b.dataset.color = String(i);
        b.title = c.name;
        b.addEventListener('click', () => {
          localPlayer.colorIdx = i;
          colors.querySelectorAll('.mp-swatch').forEach(s => s.classList.toggle('on', +s.dataset.color === i));
        });
        colors.appendChild(b);
      });
      modal.querySelector('#mp-close').addEventListener('click', () => modal.classList.add('hidden'));
      modal.querySelector('#mp-disconnect').addEventListener('click', () => {
        leaveMultiplayer();
        const st = modal.querySelector('#mp-modal-status');
        if (st) st.textContent = 'Left the room. You are driving solo.';
      });
      modal.querySelector('#mp-connect').addEventListener('click', () => {
        const name = modal.querySelector('#mp-name').value || localPlayer.name;
        const room = modal.querySelector('#mp-room').value || 'IISER-1';
        const fleetSel = modal.querySelector('#mp-fleet');
        const modeSel = modal.querySelector('#mp-mode');
        const fleet = fleetSel ? fleetSel.value : 'transit';
        const mode = modeSel ? modeSel.value : 'route';
        localPlayer.colorIdx = modal.querySelector('.mp-swatch.on') ? +modal.querySelector('.mp-swatch.on').dataset.color : localPlayer.colorIdx;
        switchVehicle(fleet === 'buggy' ? 'buggy' : fleet);
        startMultiplayer(room, name, localPlayer.colorIdx, mode);
        const st = modal.querySelector('#mp-modal-status');
        if (st) st.textContent = 'Connecting to ' + room + '…';
      });
    }
    const nameInput = modal.querySelector('#mp-name');
    const roomInput = modal.querySelector('#mp-room');
    if (nameInput && !nameInput.value) nameInput.value = localPlayer.name;
    if (roomInput && !roomInput.value) roomInput.value = localPlayer.room || 'IISER-1';
    modal.querySelectorAll('.mp-swatch').forEach(s => s.classList.toggle('on', +s.dataset.color === localPlayer.colorIdx));
    modal.classList.remove('hidden');
  }

  function updateMultiplayer(dt, t) {
    if (mp.enabled && busState.active && t - mp.lastSend > 0.11) {
      mp.lastSend = t;
      sendMpState();
    }
    for (const peer of mp.peers.values()) {
      const k = Math.min(1, dt * 8);
      peer.x += (peer.tx - peer.x) * k;
      peer.z += (peer.tz - peer.z) * k;
      peer.y += (peer.ty - peer.y) * k;
      peer.heading = normAng(peer.heading + normAng(peer.targetHeading - peer.heading) * k);
      if (peer.rig && peer.rig.root) {
        peer.rig.root.position.set(peer.x, peer.y + 0.03, peer.z);
        peer.rig.root.rotation.order = 'YXZ';
        peer.rig.root.rotation.y = peer.heading;
        const spin = (peer.speed / 0.48) * dt;
        if (peer.rig.glbWheels) {
          for (const w of peer.rig.glbWheels) if (w.spinPivot) w.spinPivot.rotation.x += spin;
        }
      }
      if (peer.tag) {
        if (!busState.active || !mp.enabled) {
          peer.tag.style.display = 'none';
        } else {
          _mpV.set(peer.x, peer.y + 3.6, peer.z).project(camera);
          if (_mpV.z > 1 || _mpV.z < -1) {
            peer.tag.style.display = 'none';
          } else {
            peer.tag.style.display = 'flex';
            peer.tag.style.left = '0px';
            peer.tag.style.top = '0px';
            peer.tag.style.transform = 'translate(' + ((_mpV.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px,' + ((-_mpV.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px) translate(-50%,-100%)';
          }
        }
      }
    }
    if (t - mp.lastBoard > 0.55) {
      mp.lastBoard = t;
      updateMpBoard();
      mpStatusUpdate();
    }
  }

  // ---------- Frame loop hooks ----------
  function updateWaitingStudents(dt, t) {
    for (let i = 0; i < waitingStudents.length; i++) {
      const s = waitingStudents[i];
      s.mesh.position.y = 0.24 + Math.abs(Math.sin(t * 1.7 + s.phase)) * 0.018;
      s.mesh.rotation.y = Math.sin(t * 0.55 + s.phase) * 0.22;
    }
  }

  function gameLoop(dt, t) {
    updateAiTraffic(dt, t);
    updateGate(dt);
    updateWaitingStudents(dt, t);
    if (busState.active) {
      updatePlayer(dt, t);
      checkSpeedCameras(t);
      updateDriveCamera(dt, t);
      updateObjective(dt, t);
      if (t - hudAt > 0.10) { hudAt = t; updateHUD(t); }
      if (t - dashAt > 0.15) { dashAt = t; updateDash(t); }
    }
    updateMultiplayer(dt, t);
  }

  W.onFrame(gameLoop);

  if (W.onMinimapDraw) {
    W.onMinimapDraw((ctx, mx, my) => {
      for (let i = 0; i < aiCars.length; i++) {
        const c = aiCars[i];
        ctx.fillStyle = 'rgba(240,230,200,0.72)';
        ctx.beginPath();
        ctx.arc(mx(c.x), my(c.z), 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mp.enabled) {
        for (const p of mp.peers.values()) {
          ctx.fillStyle = PLAYER_COLORS[p.colorIdx % PLAYER_COLORS.length].css;
          ctx.beginPath();
          ctx.arc(mx(p.x), my(p.z), 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (busState.initialized) {
        ctx.save();
        ctx.translate(mx(busState.x), my(busState.z));
        ctx.rotate(-busState.heading);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(0, -5.5);
        ctx.lineTo(3.4, 4.2);
        ctx.lineTo(-3.4, 4.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
  }

  // ---------- Public SDK used by app.js ----------
  window.ShuttleGame = {
    version: '2.0',
    enterDriveMode: enterDriveMode,
    exitDriveMode: exitDriveMode,
    setGameMode: setGameMode,
    setCamMode: setCamMode,
    cycleCamMode: cycleCamMode,
    openMultiplayer: openMpModal,
    isActive: function () { return busState.active; },
    getState: function () { return busState; },
    getFocusPosition: function () { return activeRig.root.position; },
    getTraffic: function () {
      return aiCars.map(c => ({ x: c.x, z: c.z, heading: c.heading, speed: c.speed, road: c.road.ri }));
    },
    rebuildObstacleGrid: function () {
      staticGrid.clear();
      indexedObstacleCount = 0;
      syncStaticObstacleGrid();
    }
  };

  // ---------- Boot ----------
  createDriveUI();
  initVehiclePicker();
  const bootSpawn = getSpawnPoint();
  busState.x = bootSpawn.x;
  busState.z = bootSpawn.z;
  busState.heading = bootSpawn.heading;
  bus.root.visible = false;
  syncRigPose(0, true);
  updateDestSign();
  updateMpBoard();
  mpStatusUpdate();
})();
