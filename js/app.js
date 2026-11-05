/* IISER Thiruvananthapuram — Unreal-Grade 3D World Engine & Shuttle-Ready Campus Map */
(function () {
  'use strict';

  const D = window.CAMPUS_DATA;
  const SAT_URI = window.CAMPUS_SATELLITE_URI;
  const T = window.THREE;
  if (!D || !SAT_URI || !T) { fail('The campus data could not be loaded.'); return; }
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  const M = D.meta;
  const HM = D.heightmap;
  const GW = M.ground[0], GH = M.ground[1];
  const MPP = M.mpp;
  const WORLD = Math.pow(2, M.zoom) * 256;
  const latC = M.centerLatLon[0], lonC = M.centerLatLon[1];
  const gxC = (lonC + 180) / 360 * WORLD;
  const gyC = (1 - Math.asinh(Math.tan(latC * Math.PI / 180)) / Math.PI) / 2 * WORLD;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const now = () => performance.now();

  function fail(msg) {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('done');
    const el = document.getElementById('error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  function b64ToFloatHeights(b64) {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(buf);
    const out = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 10;
    return out;
  }

  const heightValues = b64ToFloatHeights(HM.b64);

  // Piecewise-triangular interpolation matching the terrain mesh's diagonal (b-c) exactly,
  // so roads/props/bus sit ON the rendered surface instead of floating above or sinking in.
  function heightAt(x, z) {
    let fx = (x - HM.x0) / HM.dx;
    let fz = (z - HM.z0) / HM.dz;
    fx = clamp(fx, 0, HM.nx - 1.0001);
    fz = clamp(fz, 0, HM.nz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = heightValues[j * HM.nx + i];
    const b = heightValues[j * HM.nx + i + 1];
    const c = heightValues[(j + 1) * HM.nx + i];
    const d = heightValues[(j + 1) * HM.nx + i + 1];
    if (tx + tz <= 1) return a * (1 - tx - tz) + b * tx + c * tz;
    return b * (1 - tz) + c * (1 - tx) + d * (tx + tz - 1);
  }

  function lonLatToLocal(lon, lat) {
    const gx = (lon + 180) / 360 * WORLD;
    const gy = (1 - Math.asinh(Math.tan(lat * DEG)) / Math.PI) / 2 * WORLD;
    return { x: (gx - gxC) * MPP, z: (gy - gyC) * MPP };
  }

  function localToLonLat(x, z) {
    const gx = x / MPP + gxC;
    const gy = z / MPP + gyC;
    const lon = gx / WORLD * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / WORLD))) / DEG;
    return { lon, lat };
  }

  function pointInRing(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  function distToRingEdge(x, z, ring) {
    let best = 1e9;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  // --- 1. ENGINEERED ROAD WIDTHS, UNIFIED 2D CORRIDOR SMOOTHING & ZERO AIR-OVERLAP BENCHING ---
  const DRIVEABLE_TYPES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);

  // Upgrade campus spine/loops & exterior Vithura-Ponmudi SH-45 highway to realistic shuttle widths
  for (let ri = 0; ri < D.roads.length; ri++) {
    const r = D.roads[ri];
    r.isDriveable = DRIVEABLE_TYPES.has(r.type) && r.pts && r.pts.length >= 2;
    if (!r.isDriveable) continue;
    if (r.customWidth) {
      r.width = r.customWidth;
    } else if (r.type === 'service') {
      r.width = ri === 0 ? 6.6 : (ri === 3 ? 5.0 : 5.6);
    } else if (r.type === 'residential' || r.type === 'unclassified') {
      r.width = (ri === 16 || ri === 17) ? 6.5 : Math.max(r.width, 5.8);
    } else if (r.type === 'tertiary') {
      // Road 18: SH-45 Vithura - Bonacaud / Ponmudi State Highway outside Main Gate!
      r.width = Math.max(r.width, 8.2);
    }

    // Uniformly resample driveable polylines (~2.4m) & strip duplicate micro-segments that caused slope spikes
    const clean = [r.pts[0].slice()];
    for (let k = 1; k < r.pts.length; k++) {
      const prev = clean[clean.length - 1], cur = r.pts[k];
      const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      if (d < 0.85 && k < r.pts.length - 1) continue;
      const steps = Math.max(1, Math.ceil(d / 2.4));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        clean.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t, 0]);
      }
    }
    r.pts = clean;
  }

  // Snap near-junction branch endpoints (< 6.5m) cleanly onto parent road centerlines so asphalt joins seamlessly
  for (let ri = 0; ri < D.roads.length; ri++) {
    const r = D.roads[ri];
    if (!r.isDriveable) continue;
    for (const endIdx of [0, r.pts.length - 1]) {
      const ep = r.pts[endIdx];
      let bestD = 6.5, bx = ep[0], bz = ep[1], found = false;
      for (let rj = 0; rj < D.roads.length; rj++) {
        if (rj === ri || !D.roads[rj].isDriveable) continue;
        const ptsB = D.roads[rj].pts;
        for (let k = 0; k < ptsB.length - 1; k++) {
          const a = ptsB[k], b = ptsB[k + 1];
          const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-6;
          const t = clamp(((ep[0] - a[0]) * dx + (ep[1] - a[1]) * dz) / l2, 0, 1);
          const px = a[0] + dx * t, pz = a[1] + dz * t;
          const d = Math.hypot(ep[0] - px, ep[1] - pz);
          if (d < bestD) { bestD = d; bx = px; bz = pz; found = true; }
        }
      }
      if (found && bestD > 0.12) { ep[0] = bx; ep[1] = bz; }
    }
  }

  // Carve lake basins & level terraces into heightmap BEFORE building terrain & road meshes
  if (Array.isArray(D.gradingZones)) {
    for (const gz of D.gradingZones) {
      const poly = gz.polygon;
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const p of poly) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
      }
      const m = gz.margin || 8.0;
      const i0 = clamp(Math.floor((minX - m - HM.x0) / HM.dx), 0, HM.nx - 1);
      const i1 = clamp(Math.ceil((maxX + m - HM.x0) / HM.dx), 0, HM.nx - 1);
      const j0 = clamp(Math.floor((minZ - m - HM.z0) / HM.dz), 0, HM.nz - 1);
      const j1 = clamp(Math.ceil((maxZ + m - HM.z0) / HM.dz), 0, HM.nz - 1);
      for (let j = j0; j <= j1; j++) {
        const z = HM.z0 + j * HM.dz;
        for (let i = i0; i <= i1; i++) {
          const x = HM.x0 + i * HM.dx;
          const idx = j * HM.nx + i;
          const inside = pointInRing(x, z, poly);
          const edgeD = distToRingEdge(x, z, poly);
          if (gz.type === 'basin') {
            if (inside) {
              const depthT = smooth(clamp(edgeD / 11.0, 0, 1));
              heightValues[idx] = lerp(gz.shoreY - 0.55, gz.bedY, depthT);
            } else if (edgeD < m) {
              const blend = smooth(edgeD / m);
              heightValues[idx] = lerp(gz.shoreY, heightValues[idx], blend);
            }
          } else if (gz.type === 'pad') {
            if (inside) {
              heightValues[idx] = gz.targetY;
            } else if (edgeD < m) {
              heightValues[idx] = lerp(gz.targetY, heightValues[idx], smooth(edgeD / m));
            }
          }
        }
      }
    }
  }

  // Build spatial hash of driveable road segments
  const CELL = 16.0;
  const roadGrid = new Map();
  function cellKey(cx, cz) { return (cx << 16) ^ (cz & 0xffff); }

  for (let ri = 0; ri < D.roads.length; ri++) {
    const r = D.roads[ri];
    if (!r.isDriveable) continue;
    const pts = r.pts;
    for (let k = 0; k < pts.length - 1; k++) {
      const p0 = pts[k], p1 = pts[k + 1];
      const pad = r.width * 0.5 + 12.0;
      const c0x = Math.floor((Math.min(p0[0], p1[0]) - pad) / CELL);
      const c1x = Math.floor((Math.max(p0[0], p1[0]) + pad) / CELL);
      const c0z = Math.floor((Math.min(p0[1], p1[1]) - pad) / CELL);
      const c1z = Math.floor((Math.max(p0[1], p1[1]) + pad) / CELL);
      const segObj = { ri, k, x0: p0[0], z0: p0[1], y0: 0, x1: p1[0], z1: p1[1], y1: 0, hw: r.width * 0.5 };
      for (let cz = c0z; cz <= c1z; cz++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const key = cellKey(cx, cz);
          let arr = roadGrid.get(key);
          if (!arr) { arr = []; roadGrid.set(key, arr); }
          arr.push(segObj);
        }
      }
    }
  }

  // Smooth the shared 2D terrain heightfield directly along ALL road corridors (22 passes + cross-slope bench leveling!)
  // Because all roads then evaluate Y from this single continuous smoothed heightfield, every junction has 0.000m step and 0 air overlap!
  {
    const corridorWeight = new Float32Array(HM.nx * HM.nz);
    const benchRefX = new Float32Array(HM.nx * HM.nz);
    const benchRefZ = new Float32Array(HM.nx * HM.nz);
    const benchWeight = new Float32Array(HM.nx * HM.nz);

    for (let j = 1; j < HM.nz - 1; j++) {
      const z = HM.z0 + j * HM.dz;
      for (let i = 1; i < HM.nx - 1; i++) {
        const x = HM.x0 + i * HM.dx;
        const arr = roadGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
        if (!arr) continue;
        let minNorm = 1e9, bestPx = x, bestPz = z;
        for (let s = 0; s < arr.length; s++) {
          const seg = arr[s];
          const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0;
          const l2 = dx * dx + dz * dz || 1e-6;
          const t = clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / l2, 0, 1);
          const px = seg.x0 + dx * t, pz = seg.z0 + dz * t;
          const norm = Math.hypot(x - px, z - pz) - seg.hw;
          if (norm < minNorm) { minNorm = norm; bestPx = px; bestPz = pz; }
        }
        const idx = j * HM.nx + i;
        if (minNorm < 11.0) {
          corridorWeight[idx] = 1.0 - smooth(clamp((minNorm - 3.0) / 8.0, 0, 1));
        }
        if (minNorm < 3.2) {
          benchWeight[idx] = 1.0 - smooth(clamp((minNorm - 0.8) / 2.4, 0, 1));
          benchRefX[idx] = bestPx;
          benchRefZ[idx] = bestPz;
        }
      }
    }

    for (let pass = 0; pass < 22; pass++) {
      const copy = heightValues.slice();
      for (let j = 1; j < HM.nz - 1; j++) {
        for (let i = 1; i < HM.nx - 1; i++) {
          const idx = j * HM.nx + i;
          const w = corridorWeight[idx];
          if (w < 0.01) continue;
          const avg = (
            copy[idx] * 4 +
            (copy[idx - 1] + copy[idx + 1] + copy[idx - HM.nx] + copy[idx + HM.nx]) * 2 +
            (copy[idx - HM.nx - 1] + copy[idx - HM.nx + 1] + copy[idx + HM.nx - 1] + copy[idx + HM.nx + 1])
          ) / 16;
          heightValues[idx] = lerp(copy[idx], avg, w * 0.88);
        }
      }
      // Level cross-slope across road benches every 3rd pass so uphill/downhill edges sit level
      if (pass % 3 === 2) {
        for (let idx = 0; idx < heightValues.length; idx++) {
          const bw = benchWeight[idx];
          if (bw > 0.05) {
            const cY = heightAt(benchRefX[idx], benchRefZ[idx]);
            heightValues[idx] = lerp(heightValues[idx], cY, bw * 0.55);
          }
        }
      }
    }
  }

  const ROAD_SURFACE_LIFT = 0.08;
  for (let ri = 0; ri < D.roads.length; ri++) {
    const r = D.roads[ri];
    if (!r.isDriveable) continue;
    for (let k = 0; k < r.pts.length; k++) {
      r.pts[k][2] = heightAt(r.pts[k][0], r.pts[k][1]) + ROAD_SURFACE_LIFT;
    }
  }
  // Sync segment y0/y1 in roadGrid
  for (const arr of roadGrid.values()) {
    for (const seg of arr) {
      const pts = D.roads[seg.ri].pts;
      seg.y0 = pts[seg.k][2];
      seg.y1 = pts[seg.k + 1][2];
    }
  }

  function isInsideOtherDriveableRoad(x, z, excludeRi, extraPad) {
    const arr = roadGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return false;
    const pad = extraPad || 0;
    for (let s = 0; s < arr.length; s++) {
      const seg = arr[s];
      if (seg.ri === excludeRi) continue;
      const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0;
      const l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / l2, 0, 1);
      if (Math.hypot(x - (seg.x0 + dx * t), z - (seg.z0 + dz * t)) <= seg.hw + pad) return true;
    }
    return false;
  }

  function roadInfoAt(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const arr = roadGrid.get(cellKey(cx, cz));
    if (!arr) return null;
    let best = null;
    let bestScore = 1e9;
    for (let s = 0; s < arr.length; s++) {
      const seg = arr[s];
      const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0;
      const l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / l2, 0, 1);
      const px = seg.x0 + dx * t, pz = seg.z0 + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      const normDist = dist - seg.hw;
      if (normDist < bestScore) {
        bestScore = normDist;
        const len = Math.sqrt(l2);
        best = {
          dist,
          halfWidth: seg.hw,
          onRoad: dist <= seg.hw + 0.55,
          y: heightAt(x, z) + ROAD_SURFACE_LIFT,
          x: px,
          z: pz,
          tx: dx / len,
          tz: dz / len,
          roadIndex: seg.ri,
          segIndex: seg.k
        };
      }
    }
    return best;
  }

  // Re-seat non-driveable footpaths/steps onto the graded terrain
  for (const r of D.roads) {
    if (r.isDriveable || !r.pts) continue;
    const lift = r.lift != null ? r.lift : 0.08;
    for (const p of r.pts) {
      p[2] = Math.max(p[2], heightAt(p[0], p[1]) + lift);
    }
  }

  // --- 2. RENDERER, SCENE, LIGHTING & UNREAL FX ---
  const state = {
    labels: 'key',
    trees: true,
    boundary: false,
    selected: null,
    cameraExternal: false,
    reduced: window.matchMedia && window.matchMedia('(max-width: 700px)').matches
  };

  const host = document.getElementById('scene-host');
  const initialDpr = Math.min(window.devicePixelRatio || 1, 2);
  let renderer;
  try {
    // MSAA only pays off at low pixel ratios — skip it on hi-DPI / retina screens (huge fill savings)
    renderer = new T.WebGLRenderer({ antialias: initialDpr <= 1.5, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) {
    fail('WebGL is required to view this 3D campus. Please try a current version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  let isSoftwareGL = false;
  try {
    const gl = renderer.getContext();
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rStr = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(rStr)) isSoftwareGL = true;
  } catch (e) {}

  // Adaptive pixel-ratio: 'auto' drops render scale when frame rate sags, 'low/medium/high' pin it
  let unrealFXRef = null;
  const QUALITY_KEY = 'iiser.quality';
  let qualityMode = 'auto';
  try { qualityMode = localStorage.getItem(QUALITY_KEY) || 'auto'; } catch (_) {}
  if (!/^(auto|low|medium|high)$/.test(qualityMode)) qualityMode = 'auto';
  const perf = { scale: 0.72, ema: 1 / 60, lastAdjust: 0 };
  function shadowResolutionFor(mode) {
    if (mode === 'high') return 1536;
    if (mode === 'medium' && !isSoftwareGL && !state.reduced && window.innerWidth >= 900) return 1024;
    return 512;
  }
  function basePixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (qualityMode === 'low') return 0.82;
    if (qualityMode === 'medium') return Math.min(dpr, 1.5);
    if (qualityMode === 'high') return dpr;
    return Math.min(dpr, 1.25);
  }
  function effectivePixelRatio() {
    const base = isSoftwareGL ? 1 : basePixelRatio();
    return Math.max(0.62, base * (qualityMode === 'auto' ? perf.scale : 1));
  }
  function setQuality(mode) {
    if (!/^(auto|low|medium|high)$/.test(mode)) mode = 'auto';
    qualityMode = mode;
    try { localStorage.setItem(QUALITY_KEY, mode); } catch (_) {}
    perf.scale = mode === 'auto' ? 0.72 : 1;
    renderer.setPixelRatio(effectivePixelRatio());
    if (unrealFXRef) unrealFXRef.resize();
    renderer.shadowMap.enabled = mode !== 'low';
    const shadowResolution = shadowResolutionFor(mode);
    if (sunLight.shadow.mapSize.width !== shadowResolution) {
      sunLight.shadow.mapSize.set(shadowResolution, shadowResolution);
      if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    }
    renderer.shadowMap.needsUpdate = true;
    // The bloom/depth composite costs several full-screen passes. Keep Auto and
    // Medium responsive; reserve it for users who explicitly choose High.
    if (unrealFXRef) unrealFXRef.setPostEnabled(mode === 'high');
    window.dispatchEvent(new CustomEvent('iiser:quality', { detail: mode }));
  }
  renderer.setPixelRatio(effectivePixelRatio());
  const qualityTier = (isSoftwareGL || state.reduced || window.innerWidth < 900) ? 'low' : 'mid';
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = qualityMode !== 'low';
  renderer.shadowMap.type = T.PCFShadowMap; // cheaper than PCFSoft, visually comparable at campus scale
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0xc9e0ec, 0.00018);
  const camera = new T.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.65, 15000);
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  const hemi = new T.HemisphereLight(0xa8d0f8, 0x4a5a3c, 0.72);
  scene.add(hemi);
  const sunLight = new T.DirectionalLight(0xfff4df, 2.35);
  sunLight.castShadow = true;
  const shadowRes = shadowResolutionFor(qualityMode);
  sunLight.shadow.mapSize.set(shadowRes, shadowRes);
  sunLight.shadow.camera.left = -900;
  sunLight.shadow.camera.right = 900;
  sunLight.shadow.camera.top = 900;
  sunLight.shadow.camera.bottom = -900;
  sunLight.shadow.camera.near = 60;
  sunLight.shadow.camera.far = 3600;
  sunLight.shadow.bias = -0.00012;
  sunLight.shadow.normalBias = 0.25;
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight);
  scene.add(sunLight.target);
  const ambLight = new T.AmbientLight(0xcde0f5, 0.12);
  scene.add(ambLight);

  const nightMaterials = [];
  const unrealFX = window.createUnrealFX
    ? window.createUnrealFX({ renderer, scene, camera, sunLight, hemi, ambLight })
    : null;
  unrealFXRef = unrealFX;
  if (unrealFX) unrealFX.setPostEnabled(qualityMode === 'high');
  const sharedUniforms = unrealFX ? unrealFX.sharedUniforms : {
    uTime: { value: 0 },
    uSunDir: { value: new T.Vector3(0.5, 0.76, 0.41).normalize() },
    uNight: { value: 0 },
    uCloudShadowStrength: { value: 0.2 }
  };

  // --- 3. PROCEDURAL PBR TEXTURES (TERRAIN DETAIL, ROCK, WALLS, ROOFS, ROADS) ---
  function makeForestTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#24381f'; g.fillRect(0, 0, 512, 512);
    let seed = 989;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 3400; i++) {
      const x = rnd() * 512, y = rnd() * 512, r = 2 + rnd() * 11;
      const l = 18 + rnd() * 30;
      g.fillStyle = `hsla(${95 + rnd() * 34},${28 + rnd() * 30}%,${l}%,${0.20 + rnd() * 0.36})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = maxAniso;
    return tex;
  }

  const underlayY = M.heightRange[0] - 6;
  const underlay = new T.Mesh(
    new T.PlaneGeometry(14000, 14000),
    new T.MeshStandardMaterial({ map: makeForestTexture(), color: 0x9db08e, roughness: 0.98, metalness: 0 })
  );
  underlay.rotation.x = -Math.PI / 2;
  underlay.position.y = underlayY;
  scene.add(underlay);

  function makeGroundNormalTexture() {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const h = new Float32Array(size * size);
    let seed = 20261104;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < h.length; i++) h[i] = rnd();
    for (let pass = 0; pass < 3; pass++) {
      const tmp = new Float32Array(h.length);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              s += h[((y + dy + size) % size) * size + ((x + dx + size) % size)];
            }
          }
          tmp[y * size + x] = s / 9;
        }
      }
      h.set(tmp);
    }
    for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.65 + rnd() * 0.35;
    const strength = 2.9;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const ym = (y - 1 + size) % size, yp = (y + 1) % size;
        const dx = (h[y * size + xp] - h[y * size + xm]) * strength;
        const dy = (h[yp * size + x] - h[ym * size + x]) * strength;
        const len = Math.hypot(dx, dy, 1);
        const k = (y * size + x) * 4;
        img.data[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        img.data[k + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
        img.data[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(190, 175);
    tex.anisotropy = maxAniso;
    return tex;
  }

  function makeTerrainDetailTextures() {
    // High-frequency grass/clover/soil detail map for close-range street views
    const c1 = document.createElement('canvas'); c1.width = c1.height = 256;
    const g1 = c1.getContext('2d');
    g1.fillStyle = '#808080'; g1.fillRect(0, 0, 256, 256);
    let s = 419;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 9500; i++) {
      const v = Math.round(92 + (rnd() - 0.48) * 76);
      const gr = Math.round(v + (rnd() - 0.35) * 18);
      g1.fillStyle = `rgba(${v - 6},${gr},${v - 12},0.35)`;
      g1.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2.5, 2 + rnd() * 4.5);
    }
    const grassDetail = new T.CanvasTexture(c1);
    grassDetail.wrapS = grassDetail.wrapT = T.RepeatWrapping;
    grassDetail.anisotropy = maxAniso;

    // Western Ghats gneiss / laterite rock cliff texture for steep hillside cuts
    const c2 = document.createElement('canvas'); c2.width = c2.height = 256;
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#5c4b3e'; g2.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 6) {
      g2.fillStyle = `rgba(${55 + rnd() * 48},${46 + rnd() * 38},${38 + rnd() * 32},0.45)`;
      g2.fillRect(0, y, 256, 4 + rnd() * 6);
    }
    for (let i = 0; i < 2400; i++) {
      const v = 50 + rnd() * 65;
      g2.fillStyle = `rgba(${v + 12},${v},${v - 8},0.26)`;
      g2.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 8, 1 + rnd() * 4);
    }
    const rockDetail = new T.CanvasTexture(c2);
    rockDetail.wrapS = rockDetail.wrapT = T.RepeatWrapping;
    rockDetail.encoding = T.sRGBEncoding;
    rockDetail.anisotropy = maxAniso;
    return { grassDetail, rockDetail };
  }

  function makeWaterNormalTexture() {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
        h[y * size + x] = Math.sin(u * 4 + Math.sin(v * 3)) * 0.45
          + Math.sin(v * 5 + Math.cos(u * 4)) * 0.32
          + Math.sin((u + v) * 9) * 0.15
          + Math.cos((u - v) * 13) * 0.08;
      }
    }
    const strength = 2.0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const ym = (y - 1 + size) % size, yp = (y + 1) % size;
        const dx = (h[y * size + xp] - h[y * size + xm]) * strength;
        const dy = (h[yp * size + x] - h[ym * size + x]) * strength;
        const len = Math.hypot(dx, dy, 1);
        const k = (y * size + x) * 4;
        img.data[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        img.data[k + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
        img.data[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.anisotropy = maxAniso;
    return tex;
  }

  function terrainGridGeometry() {
    const nx = HM.nx, nz = HM.nz;
    const pos = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const colors = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      const z = HM.z0 + j * HM.dz;
      for (let i = 0; i < nx; i++) {
        const x = HM.x0 + i * HM.dx;
        const k = j * nx + i;
        const h = heightValues[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = (x + GW / 2) / GW;
        uv[k * 2 + 1] = (GH / 2 - z) / GH;
        const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
        const avg = (heightValues[j * nx + i0] + heightValues[j * nx + i1]
          + heightValues[j0 * nx + i] + heightValues[j1 * nx + i]) / 4;
        const curv = h - avg;
        const slope = Math.hypot(
          (heightValues[j * nx + i1] - heightValues[j * nx + i0]) / (Math.max(1, i1 - i0) * HM.dx),
          (heightValues[j1 * nx + i] - heightValues[j0 * nx + i]) / (Math.max(1, j1 - j0) * HM.dz)
        );
        let shade = 1.0 - clamp(-curv * 0.08, 0, 0.14) + clamp(curv * 0.035, 0, 0.03);
        shade *= 1.0 - clamp(slope * 0.05, 0, 0.10);
        shade = clamp(shade, 0.78, 1.04);
        colors[k * 3] = shade;
        colors[k * 3 + 1] = shade;
        colors[k * 3 + 2] = shade;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  const terrainDetails = makeTerrainDetailTextures();
  const terrainGeo = terrainGridGeometry();
  const terrainMat = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.0,
    vertexColors: true,
    normalMap: makeGroundNormalTexture(),
    normalScale: new T.Vector2(0.68, 0.68)
  });
  terrainMat.userData.baseEnvIntensity = 0.45;

  // Unreal Engine Landscape Shader Injection: close-up grass/soil micro-grain, steep cliff rock, & moving cloud shadows!
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrassDetail = { value: terrainDetails.grassDetail };
    shader.uniforms.tRockDetail = { value: terrainDetails.rockDetail };
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uCloudShadow = sharedUniforms.uCloudShadowStrength;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvObjNormal = normalize(normal);');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        uniform sampler2D tGrassDetail;
        uniform sampler2D tRockDetail;
        uniform float uTime;
        uniform float uCloudShadow;
        varying vec3 vWorldPos;
        varying vec3 vObjNormal;
      `)
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        float camDist = distance(cameraPosition, vWorldPos);
        float closeFade = 1.0 - smoothstep(35.0, 340.0, camDist);

        // Enhance washed-out satellite greens into lush Kerala tropical foliage/turf
        float greenDom = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 4.5, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 1.08, 0.80), greenDom * 0.52);

        // Multi-scale procedural micro-detail splatting (prevents blurry satellite pixels at street level!)
        vec3 detA = texture2D(tGrassDetail, vWorldPos.xz * 0.36).rgb;
        vec3 detB = texture2D(tGrassDetail, vWorldPos.xz * 0.075).rgb;
        vec3 micro = mix(detB, detA, 0.65) * 2.0;
        diffuseColor.rgb *= mix(vec3(1.0), clamp(micro, 0.68, 1.34), closeFade * 0.62);

        // Steep-slope Western Ghats laterite/granite rock face blending
        float rockMask = smoothstep(0.87, 0.66, vObjNormal.y);
        if (rockMask > 0.01) {
          vec3 rockCol = texture2D(tRockDetail, vWorldPos.xz * 0.09 + vec2(0.0, vWorldPos.y * 0.14)).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockMask * 0.78);
        }

        // Drifting cumulus cloud shadows across the mountains
        vec2 cUv = vWorldPos.xz * 0.0013 + vec2(uTime * 0.0055, uTime * 0.0022);
        float cWave = sin(cUv.x * 6.283 + sin(cUv.y * 5.1)) * 0.5 + 0.5;
        float cWave2 = cos(cUv.y * 7.4 - cUv.x * 3.7) * 0.5 + 0.5;
        float cloudOcc = smoothstep(0.42, 0.85, cWave * 0.6 + cWave2 * 0.4);
        diffuseColor.rgb *= (1.0 - cloudOcc * uCloudShadow);
      `);
  };

  const terrain = new T.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);

  function terrainSkirt() {
    const nx = HM.nx, nz = HM.nz;
    const pos = [];
    const edge = [];
    for (let i = 0; i < nx; i++) edge.push([i, 0]);
    for (let j = 1; j < nz; j++) edge.push([nx - 1, j]);
    for (let i = nx - 2; i >= 0; i--) edge.push([i, nz - 1]);
    for (let j = nz - 2; j > 0; j--) edge.push([0, j]);
    for (let e = 0; e < edge.length; e++) {
      const [i0, j0] = edge[e];
      const [i1, j1] = edge[(e + 1) % edge.length];
      const x0 = HM.x0 + i0 * HM.dx, z0 = HM.z0 + j0 * HM.dz;
      const x1 = HM.x0 + i1 * HM.dx, z1 = HM.z0 + j1 * HM.dz;
      const y0 = heightValues[j0 * nx + i0], y1 = heightValues[j1 * nx + i1];
      pos.push(x0, y0, z0, x1, y1, z1, x1, underlayY, z1, x0, y0, z0, x1, underlayY, z1, x0, underlayY, z0);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    scene.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x22321c, side: T.DoubleSide, fog: true })));
  }
  terrainSkirt();

  // --- 4. ARCHITECTURAL PBR BUILDING FACADES, SLABS, COLUMNS, OVERHANG ROOFS & SOLAR ---
  function makeFacadeMaps() {
    const W = 512, H = 512;
    const cCol = document.createElement('canvas'); cCol.width = W; cCol.height = H;
    const gC = cCol.getContext('2d');
    const cRM = document.createElement('canvas'); cRM.width = W; cRM.height = H;
    const gR = cRM.getContext('2d');
    const cEm = document.createElement('canvas'); cEm.width = W; cEm.height = H;
    const gE = cEm.getContext('2d');

    // Stucco wall base: high roughness (G=225), low metalness (B=8)
    gC.fillStyle = '#ece6d9'; gC.fillRect(0, 0, W, H);
    gR.fillStyle = 'rgb(255, 228, 8)'; gR.fillRect(0, 0, W, H);
    gE.fillStyle = '#000000'; gE.fillRect(0, 0, W, H);

    // Subtle plaster grain + tropical monsoon slab drip weathering
    let seed = 701;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * W, y = rnd() * H;
      gC.fillStyle = `rgba(82,74,58,${rnd() * 0.045})`;
      gC.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 3);
    }

    // Concrete floor slab band & subtle AO shadow under cornice
    const slabGrad = gC.createLinearGradient(0, 0, 0, 56);
    slabGrad.addColorStop(0, '#c8c1b2');
    slabGrad.addColorStop(0.45, '#dad3c5');
    slabGrad.addColorStop(1, 'rgba(236,230,217,0)');
    gC.fillStyle = slabGrad; gC.fillRect(0, 0, W, 56);
    gC.fillStyle = '#d3ccbe'; gC.fillRect(0, H - 22, W, 22);

    // Two architectural recessed twin-window bays per 512px tile (realistic proportions!)
    const bays = [[44, 108, 184, 286], [284, 108, 184, 286]];
    for (let bi = 0; bi < bays.length; bi++) {
      const [bx, by, bw, bh] = bays[bi];
      // Deep concrete window reveal frame + sunshade lintel shadow
      gC.fillStyle = '#bfb8a7'; gC.fillRect(bx - 12, by - 14, bw + 24, bh + 26);
      gC.fillStyle = 'rgba(35,32,26,0.32)'; gC.fillRect(bx - 10, by - 10, bw + 20, 14);

      // Dark anodized aluminum window frame
      gC.fillStyle = '#2d353b'; gC.fillRect(bx - 4, by - 4, bw + 8, bh + 8);

      // Reflective tinted architectural glass with subtle interior room warmth/blinds
      const glassGrad = gC.createLinearGradient(bx, by, bx + bw, by + bh);
      glassGrad.addColorStop(0, '#365263');
      glassGrad.addColorStop(0.42, '#5c7f91');
      glassGrad.addColorStop(0.58, '#2b4452');
      glassGrad.addColorStop(1, '#1b2d38');
      gC.fillStyle = glassGrad; gC.fillRect(bx, by, bw, bh);

      // Venetian blinds / upper interior ceiling hint
      gC.fillStyle = 'rgba(218,210,192,0.22)';
      gC.fillRect(bx + 4, by + 4, bw - 8, bh * 0.24);

      // Specular sky reflection diagonal highlight
      gC.fillStyle = 'rgba(220,240,255,0.16)';
      gC.beginPath();
      gC.moveTo(bx + 8, by + bh - 6);
      gC.lineTo(bx + bw * 0.48, by + 6);
      gC.lineTo(bx + bw * 0.66, by + 6);
      gC.lineTo(bx + bw * 0.24, by + bh - 6);
      gC.closePath();
      gC.fill();

      // PBR Glass: smooth glossy roughness (G=28) + high metallic/dielectric reflectivity (B=210)
      gR.fillStyle = 'rgb(255, 28, 210)';
      gR.fillRect(bx, by, bw, bh);

      // Mullions (matte aluminum)
      gC.fillStyle = '#d8d3c6';
      gC.fillRect(bx + bw / 2 - 4, by - 2, 8, bh + 4);
      gC.fillRect(bx - 2, by + bh * 0.62, bw + 4, 6);
      gR.fillStyle = 'rgb(255, 140, 90)';
      gR.fillRect(bx + bw / 2 - 4, by - 2, 8, bh + 4);
      gR.fillRect(bx - 2, by + bh * 0.62, bw + 4, 6);

      // Projected concrete sill
      gC.fillStyle = '#b7b09e';
      gC.fillRect(bx - 16, by + bh + 8, bw + 32, 11);

      // Warm interior room glow for Dusk/Night mode!
      const litCol = bi === 0 ? '#ffcf86' : '#ffe3b3';
      gE.fillStyle = litCol;
      gE.fillRect(bx + 4, by + 4, bw / 2 - 8, bh * 0.60);
      gE.fillRect(bx + bw / 2 + 4, by + bh * 0.65, bw / 2 - 8, bh * 0.31);
    }

    const colTex = new T.CanvasTexture(cCol);
    colTex.wrapS = colTex.wrapT = T.RepeatWrapping;
    colTex.encoding = T.sRGBEncoding;
    colTex.anisotropy = maxAniso;

    const rmTex = new T.CanvasTexture(cRM);
    rmTex.wrapS = rmTex.wrapT = T.RepeatWrapping;
    rmTex.anisotropy = maxAniso;

    const emTex = new T.CanvasTexture(cEm);
    emTex.wrapS = emTex.wrapT = T.RepeatWrapping;
    emTex.encoding = T.sRGBEncoding;
    emTex.anisotropy = maxAniso;

    return { colTex, rmTex, emTex };
  }

  function makePsbFacadeMaps() {
    const W = 512, H = 1024;
    const cCol = document.createElement('canvas'); cCol.width = W; cCol.height = H;
    const gC = cCol.getContext('2d');
    const cRM = document.createElement('canvas'); cRM.width = W; cRM.height = H;
    const gR = cRM.getContext('2d');
    const cEm = document.createElement('canvas'); cEm.width = W; cEm.height = H;
    const gE = cEm.getContext('2d');

    gC.fillStyle = '#ece4d3'; gC.fillRect(0, 0, W, H);
    gR.fillStyle = 'rgb(248, 232, 16)'; gR.fillRect(0, 0, W, H);
    gE.fillStyle = '#000000'; gE.fillRect(0, 0, W, H);

    const lowerY = 340;
    gC.fillStyle = '#8b4038'; gC.fillRect(0, lowerY, W, H - lowerY);
    gC.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = lowerY; y < H; y += 7) gC.fillRect(0, y, W, 1);
    gC.fillStyle = 'rgba(55,22,20,0.10)';
    for (let x = 0; x < W; x += 64) gC.fillRect(x, lowerY, 2, H - lowerY);

    let seed = 941;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2600; i++) {
      gC.fillStyle = `rgba(70,52,38,${rnd() * 0.05})`;
      gC.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
    }

    function band(y, h, color) {
      gC.fillStyle = color; gC.fillRect(0, y, W, h);
      gC.fillStyle = 'rgba(75,36,30,0.34)'; gC.fillRect(0, y + h, W, 3);
      gC.fillStyle = 'rgba(255,255,255,0.12)'; gC.fillRect(0, y, W, 2);
    }
    band(8, 16, '#d8c9ad');
    band(lowerY, 13, '#e3d4b8');
    band(682, 14, '#dfcfb2');
    band(986, 38, '#6d2f2a');
    band(1006, 5, '#b15b4e');

    function drawWindow(x, y, w, h, lit) {
      gC.fillStyle = 'rgba(56,26,23,0.24)'; gC.fillRect(x - 16, y - 18, w + 32, h + 34);
      gC.fillStyle = '#efe4cd'; gC.fillRect(x - 11, y - 12, w + 22, h + 24);
      gC.fillStyle = '#b7a68b'; gC.fillRect(x - 6, y - 7, w + 12, h + 14);
      gC.fillStyle = '#293137'; gC.fillRect(x - 4, y - 4, w + 8, h + 8);
      const glass = gC.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, '#3b5868');
      glass.addColorStop(0.43, '#6c8b98');
      glass.addColorStop(0.58, '#334c58');
      glass.addColorStop(1, '#18272f');
      gC.fillStyle = glass; gC.fillRect(x, y, w, h);
      gC.fillStyle = 'rgba(225,239,246,0.18)';
      gC.beginPath();
      gC.moveTo(x + 7, y + h - 5); gC.lineTo(x + w * 0.46, y + 5);
      gC.lineTo(x + w * 0.64, y + 5); gC.lineTo(x + w * 0.23, y + h - 5);
      gC.closePath(); gC.fill();
      gC.fillStyle = '#efe6d4';
      gC.fillRect(x + w * 0.5 - 4, y - 2, 8, h + 4);
      gC.fillRect(x - 2, y + h * 0.60, w + 4, 6);
      gC.fillStyle = '#d3c1a4'; gC.fillRect(x - 13, y + h + 6, w + 26, 9);
      gR.fillStyle = 'rgb(255, 32, 188)'; gR.fillRect(x, y, w, h);
      gR.fillStyle = 'rgb(255, 148, 82)';
      gR.fillRect(x + w * 0.5 - 4, y - 2, 8, h + 4);
      gR.fillRect(x - 2, y + h * 0.60, w + 4, 6);
      if (lit) {
        gE.fillStyle = '#ffc979';
        gE.fillRect(x + 5, y + 6, w * 0.42 - 8, h * 0.56);
        gE.fillStyle = '#ffe1ac';
        gE.fillRect(x + w * 0.54, y + h * 0.60, w * 0.36, h * 0.28);
      }
    }

    drawWindow(46, 104, 166, 150, true);
    drawWindow(300, 104, 166, 150, false);
    drawWindow(46, 410, 166, 152, false);
    drawWindow(300, 410, 166, 152, true);
    drawWindow(46, 738, 166, 178, true);
    drawWindow(300, 738, 166, 178, false);

    for (const vx of [42, 222, 402]) {
      gC.fillStyle = '#4b2c24'; gC.fillRect(vx, 38, 82, 50);
      gC.strokeStyle = 'rgba(232,216,190,0.66)'; gC.lineWidth = 3;
      for (let i = -50; i < 90; i += 13) {
        gC.beginPath();
        gC.moveTo(vx + i, 38); gC.lineTo(vx + i + 42, 88);
        gC.stroke();
        gC.beginPath();
        gC.moveTo(vx + i + 42, 38); gC.lineTo(vx + i, 88);
        gC.stroke();
      }
      gC.strokeStyle = '#d8c6a8'; gC.lineWidth = 5;
      gC.strokeRect(vx, 38, 82, 50);
    }

    gC.fillStyle = 'rgba(45,20,18,0.30)';
    gC.fillRect(0, 0, W, 8);
    gC.fillStyle = 'rgba(255,255,255,0.11)';
    gC.fillRect(0, 24, W, 2);

    gC.fillStyle = '#d9c8a8';
    gC.fillRect(8, lowerY, 10, 646);
    gC.fillRect(W - 18, lowerY, 10, 646);
    gC.fillStyle = 'rgba(88,40,32,0.24)';
    gC.fillRect(18, lowerY, 3, 646);
    gC.fillRect(W - 21, lowerY, 3, 646);

    const colTex = new T.CanvasTexture(cCol);
    colTex.wrapS = T.RepeatWrapping;
    colTex.wrapT = T.ClampToEdgeWrapping;
    colTex.encoding = T.sRGBEncoding;
    colTex.anisotropy = maxAniso;

    const rmTex = new T.CanvasTexture(cRM);
    rmTex.wrapS = T.RepeatWrapping;
    rmTex.wrapT = T.ClampToEdgeWrapping;
    rmTex.anisotropy = maxAniso;

    const emTex = new T.CanvasTexture(cEm);
    emTex.wrapS = T.RepeatWrapping;
    emTex.wrapT = T.ClampToEdgeWrapping;
    emTex.encoding = T.sRGBEncoding;
    emTex.anisotropy = maxAniso;

    return { colTex, rmTex, emTex };
  }

  function makeRoofTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#d9d2ce'; g.fillRect(0, 0, 512, 512);
    let rs = 421;
    const rr = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };

    // Mangalore corrugated clay roof tiles (authentic Kerala campus roof!)
    const rowH = 32, colW = 24;
    for (let y = 0; y < 512; y += rowH) {
      for (let x = 0; x < 512; x += colW) {
        const shade = 198 + (rr() - 0.5) * 34;
        const grad = g.createLinearGradient(x, y, x + colW, y);
        grad.addColorStop(0, `rgb(${shade - 32},${shade - 36},${shade - 38})`);
        grad.addColorStop(0.38, `rgb(${shade + 22},${shade + 18},${shade + 16})`);
        grad.addColorStop(0.75, `rgb(${shade - 10},${shade - 12},${shade - 14})`);
        grad.addColorStop(1, `rgb(${shade - 42},${shade - 44},${shade - 46})`);
        g.fillStyle = grad;
        g.fillRect(x, y, colW, rowH);
      }
      // Horizontal tile overlap shadow line
      g.fillStyle = 'rgba(28,12,8,0.42)';
      g.fillRect(0, y + rowH - 3, 512, 3);
    }
    // Tropical moss/weathering variation
    for (let i = 0; i < 650; i++) {
      g.fillStyle = `rgba(38,26,18,${0.03 + rr() * 0.08})`;
      g.beginPath();
      g.ellipse(rr() * 512, rr() * 512, 4 + rr() * 18, 3 + rr() * 12, rr() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = maxAniso;
    return tex;
  }

  function makeFlatRoofTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#dfdcd4'; g.fillRect(0, 0, 256, 256);
    let seed = 733; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * 256, y = rnd() * 256, s = 0.8 + rnd() * 2.8;
      g.fillStyle = `rgba(${65 + rnd() * 55},${62 + rnd() * 50},${54 + rnd() * 45},${0.04 + rnd() * 0.09})`;
      g.fillRect(x, y, s, s);
    }
    g.strokeStyle = 'rgba(55,52,46,0.28)'; g.lineWidth = 1.6;
    for (let k = 0; k <= 256; k += 64) {
      g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = maxAniso;
    return tex;
  }

  const facadeMaps = makeFacadeMaps();
  const wallTex = facadeMaps.colTex;
  const psbFacadeMaps = makePsbFacadeMaps();
  const psbWallMat = new T.MeshStandardMaterial({
    map: psbFacadeMaps.colTex,
    roughnessMap: psbFacadeMaps.rmTex,
    metalnessMap: psbFacadeMaps.rmTex,
    bumpMap: psbFacadeMaps.colTex,
    bumpScale: 0.035,
    emissiveMap: psbFacadeMaps.emTex,
    emissive: new T.Color(0x000000),
    emissiveIntensity: 0.0,
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.16
  });
  psbWallMat.userData.baseEnvIntensity = 1.02;
  const psbMaroonMat = new T.MeshStandardMaterial({ color: 0x6f2f2b, roughness: 0.88, metalness: 0.03 });
  const psbCreamMat = new T.MeshStandardMaterial({ color: 0xe8dcc5, roughness: 0.84, metalness: 0.02 });
  const psbPeachMat = new T.MeshStandardMaterial({ color: 0xd69763, roughness: 0.80, metalness: 0.03 });
  const psbDarkMat = new T.MeshStandardMaterial({ color: 0x222a2f, roughness: 0.25, metalness: 0.55 });
  const psbWoodMat = new T.MeshStandardMaterial({ color: 0x4c2d23, roughness: 0.86, metalness: 0.02 });
  const roofTex = makeRoofTexture();
  const psbRoofMat = new T.MeshStandardMaterial({
    map: roofTex, bumpMap: roofTex, bumpScale: 0.22,
    color: 0x9f4c38, roughness: 0.70, metalness: 0.04, side: T.DoubleSide
  });
  psbRoofMat.userData.baseEnvIntensity = 0.62;
  const flatRoofTex = makeFlatRoofTexture();
  const hvacMat = new T.MeshStandardMaterial({ color: 0xb6b4ac, roughness: 0.72, metalness: 0.18 });
  const tankMat = new T.MeshStandardMaterial({ color: 0x262d32, roughness: 0.55, metalness: 0.22 });
  const solarMat = new T.MeshStandardMaterial({ color: 0x182b49, roughness: 0.16, metalness: 0.82 });
  solarMat.userData.baseEnvIntensity = 1.3;
  const trimConcreteMat = new T.MeshStandardMaterial({ color: 0xd6cfc0, roughness: 0.86, metalness: 0.03 });
  const foundationMat = new T.MeshStandardMaterial({
    map: terrainDetails.rockDetail, color: 0x8d8576, roughness: 0.95, metalness: 0.01
  });

  function tri(pos, uv, a, b, c, ua, ub, uc) {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (uv) uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  function wallsData(ring, y0, y1, uScale, vScale, uv0, uv1) {
    const pos = [], uv = [];
    let dist = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.002) continue;
      const u0 = dist / uScale, u1 = (dist + len) / uScale;
      dist += len;
      const v0 = uv0 != null ? uv0 : 0, v1 = uv1 != null ? uv1 : (y1 - y0) / vScale;
      const pb = [p[0], y0, p[1]], pt = [p[0], y1, p[1]];
      const qb = [q[0], y0, q[1]], qt = [q[0], y1, q[1]];
      tri(pos, uv, pb, pt, qt, [u0, v0], [u0, v1], [u1, v1]);
      tri(pos, uv, pb, qt, qb, [u0, v0], [u1, v1], [u1, v0]);
    }
    return { pos, uv };
  }

  function addCap(pos, uv, ring, y, uScale, flipDown) {
    const contour = ring.map(p => new T.Vector2(p[0], p[1]));
    const faces = T.ShapeUtils.triangulateShape(contour, []);
    for (let f = 0; f < faces.length; f++) {
      let A = ring[faces[f][0]], B = ring[faces[f][1]], C = ring[faces[f][2]];
      const abx = B[0] - A[0], abz = B[1] - A[1];
      const acx = C[0] - A[0], acz = C[1] - A[1];
      const ny = abz * acx - abx * acz;
      if ((ny < 0 && !flipDown) || (ny > 0 && flipDown)) { const t = B; B = C; C = t; }
      tri(pos, uv,
        [A[0], y, A[1]], [B[0], y, B[1]], [C[0], y, C[1]],
        [A[0] / uScale, A[1] / uScale], [B[0] / uScale, B[1] / uScale], [C[0] / uScale, C[1] / uScale]);
    }
  }

  function expandRingOutward(ring, cx, cz, meters) {
    return ring.map(([x, z]) => {
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz) || 1;
      return [x + (dx / d) * meters, z + (dz / d) * meters];
    });
  }

  function addHorizontalBandInto(pos, innerRing, outerRing, yBot, yTop) {
    const n = innerRing.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const i0 = innerRing[i], i1 = innerRing[j];
      const o0 = outerRing[i], o1 = outerRing[j];
      // Outer fascia face
      tri(pos, null, [o0[0], yBot, o0[1]], [o0[0], yTop, o0[1]], [o1[0], yTop, o1[1]]);
      tri(pos, null, [o0[0], yBot, o0[1]], [o1[0], yTop, o1[1]], [o1[0], yBot, o1[1]]);
      // Top ledge
      tri(pos, null, [i0[0], yTop, i0[1]], [o1[0], yTop, o1[1]], [o0[0], yTop, o0[1]]);
      tri(pos, null, [i0[0], yTop, i0[1]], [i1[0], yTop, i1[1]], [o1[0], yTop, o1[1]]);
      // Bottom soffit (visible when driving below buildings!)
      tri(pos, null, [i0[0], yBot, i0[1]], [o0[0], yBot, o0[1]], [o1[0], yBot, o1[1]]);
      tri(pos, null, [i0[0], yBot, i0[1]], [o1[0], yBot, o1[1]], [i1[0], yBot, i1[1]]);
    }
  }

  function hipRoofData(footRing, outer, inner, yEave, yRidge) {
    const pos = [], uv = [];
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const o0 = [outer[i][0], yEave, outer[i][1]];
      const o1 = [outer[(i + 1) % n][0], yEave, outer[(i + 1) % n][1]];
      const i0 = [inner[i][0], yRidge, inner[i][1]];
      const i1 = [inner[(i + 1) % n][0], yRidge, inner[(i + 1) % n][1]];
      const uv0 = [o0[0] / 2.2, o0[2] / 2.2];
      const uv1 = [o1[0] / 2.2, o1[2] / 2.2];
      const uv2 = [i1[0] / 2.2, i1[2] / 2.2];
      const uv3 = [i0[0] / 2.2, i0[2] / 2.2];
      tri(pos, uv, o0, i1, o1, uv0, uv2, uv1);
      tri(pos, uv, o0, i0, i1, uv0, uv3, uv2);

      // Solid eave soffit underside from building wall out to roof overhang!
      if (footRing && footRing.length === n) {
        const w0 = [footRing[i][0], yEave - 0.14, footRing[i][1]];
        const w1 = [footRing[(i + 1) % n][0], yEave - 0.14, footRing[(i + 1) % n][1]];
        tri(pos, uv, w0, o0, o1, [0, 0], [0.1, 0], [0.1, 0.1]);
        tri(pos, uv, w0, o1, w1, [0, 0], [0.1, 0.1], [0, 0.1]);
      }
    }
    addCap(pos, uv, inner, yRidge, 2.2, false);
    return { pos, uv };
  }

  function makeGeometry(data) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(data.pos, 3));
    if (data.uv && data.uv.length) geo.setAttribute('uv', new T.Float32BufferAttribute(data.uv, 2));
    geo.computeVertexNormals();
    return geo;
  }

  function addRoofClutter(group, b, topY, isHip) {
    if (b.name === 'Physics Block') return;
    if (b.area < 240) return;
    let seed = 0;
    const sStr = String(b.id);
    for (let i = 0; i < sStr.length; i++) seed = (seed * 31 + sStr.charCodeAt(i)) % 2147483647;
    if (seed <= 0) seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    if (!isHip) {
      const n = Math.min(6, Math.max(1, Math.floor(b.area / 380)));
      for (let k = 0; k < n; k++) {
        const ang = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * Math.sqrt(b.area) * 0.27;
        const x = b.cx + Math.cos(ang) * rr, z = b.cz + Math.sin(ang) * rr;
        if (!pointInRing(x, z, b.footprint)) continue;
        const w = 1.4 + rnd() * 2.6, d = 1.1 + rnd() * 2.2, hh = 0.8 + rnd() * 1.4;
        const box = new T.Mesh(new T.BoxGeometry(w, hh, d), hvacMat);
        box.position.set(x, topY + hh / 2, z);
        box.rotation.y = rnd() * Math.PI;
        box.castShadow = true; box.receiveShadow = true;
        group.add(box);
      }
      if (b.area > 450) {
        const tx = b.cx + (rnd() - 0.5) * Math.sqrt(b.area) * 0.28;
        const tz = b.cz + (rnd() - 0.5) * Math.sqrt(b.area) * 0.28;
        if (pointInRing(tx, tz, b.footprint)) {
          const tank = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 1.95, 14), tankMat);
          tank.position.set(tx, topY + 0.98, tz);
          tank.castShadow = true; tank.receiveShadow = true;
          group.add(tank);
        }
      }
    }

    // Rooftop Solar PV Panel Arrays on academic, research, hostel & large flat roofs
    if (b.area > 520 && ['academic', 'research', 'hostel', 'library', 'dining'].includes(b.kind)) {
      const rows = isHip ? 1 : Math.min(4, Math.floor(Math.sqrt(b.area) / 9));
      const baseSolarY = isHip ? topY - b.roofH * 0.18 : topY + 0.38;
      for (let r = 0; r < rows; r++) {
        const sx = b.cx + (r - (rows - 1) * 0.5) * 3.2;
        const sz = b.cz;
        if (!pointInRing(sx, sz, b.footprint)) continue;
        const panel = new T.Mesh(new T.BoxGeometry(2.4, 0.08, 4.8), solarMat);
        panel.position.set(sx, baseSolarY, sz);
        panel.rotation.z = 0.24;
        panel.castShadow = true;
        group.add(panel);
      }
    }
  }


  function psbFrontEdge(b) {
    const fp = b.footprint;
    let best = null;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], c = fp[(i + 1) % fp.length];
      const mx = (a[0] + c[0]) * 0.5, mz = (a[1] + c[1]) * 0.5;
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const ri = roadInfoAt(mx, mz);
      const d = ri ? ri.dist : 999;
      let nx = mx - b.cx, nz = mz - b.cz;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      if (!best || d < best.d) best = { d, mx, mz, tx: dx / len, tz: dz / len, nx, nz, len };
    }
    return best;
  }

  function buildPsbPortico(b, group, edge) {
    const yaw = Math.atan2(edge.nx, edge.nz);
    const g = new T.Group();
    g.name = 'psbPortico';
    g.position.set(edge.mx + edge.nx * 3.25, b.base, edge.mz + edge.nz * 3.25);
    g.rotation.y = yaw;
    group.add(g);

    const floor = new T.Mesh(new T.BoxGeometry(7.8, 0.22, 7.6), psbCreamMat);
    floor.position.y = 0.06;
    floor.receiveShadow = true;
    g.add(floor);

    for (const sx of [-2.75, 2.75]) {
      for (const sz of [-2.4, 2.25]) {
        const col = new T.Mesh(new T.BoxGeometry(0.40, 4.35, 0.40), psbCreamMat);
        col.position.set(sx, 2.22, sz);
        col.castShadow = true; col.receiveShadow = true;
        g.add(col);
        const cap = new T.Mesh(new T.BoxGeometry(0.58, 0.16, 0.58), psbMaroonMat);
        cap.position.set(sx, 4.36, sz);
        g.add(cap);
      }
    }

    const eave = new T.Mesh(new T.BoxGeometry(7.6, 0.22, 6.9), psbMaroonMat);
    eave.position.set(0, 4.62, 0.0);
    eave.castShadow = true;
    g.add(eave);

    const frontSlope = new T.Mesh(new T.BoxGeometry(7.9, 0.16, 4.25), psbRoofMat);
    frontSlope.position.set(0, 5.28, 1.02);
    frontSlope.rotation.x = 0.40;
    frontSlope.castShadow = true; frontSlope.receiveShadow = true;
    const backSlope = new T.Mesh(new T.BoxGeometry(7.9, 0.16, 4.25), psbRoofMat);
    backSlope.position.set(0, 5.28, -1.02);
    backSlope.rotation.x = -0.40;
    backSlope.castShadow = true; backSlope.receiveShadow = true;
    g.add(frontSlope, backSlope);

    const ridge = new T.Mesh(new T.BoxGeometry(8.05, 0.16, 0.26), psbMaroonMat);
    ridge.position.set(0, 6.10, 0);
    ridge.castShadow = true;
    g.add(ridge);

    const doors = new T.Mesh(new T.BoxGeometry(3.4, 2.85, 0.08), psbDarkMat);
    doors.position.set(0, 1.52, -3.22);
    g.add(doors);
    for (const sx of [-0.9, 0.9]) {
      const handle = new T.Mesh(new T.BoxGeometry(0.05, 0.36, 0.05), psbCreamMat);
      handle.position.set(sx, 1.48, -3.28);
      g.add(handle);
    }

    for (let i = 0; i < 3; i++) {
      const step = new T.Mesh(new T.BoxGeometry(7.2 - i * 0.35, 0.18, 0.62), psbCreamMat);
      step.position.set(0, 0.09 - i * 0.17, 3.55 + i * 0.57);
      step.receiveShadow = true;
      g.add(step);
    }

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024; signCanvas.height = 160;
    const sg = signCanvas.getContext('2d');
    sg.fillStyle = '#203f6a'; sg.fillRect(0, 0, 1024, 160);
    sg.strokeStyle = '#e9c77c'; sg.lineWidth = 8; sg.strokeRect(7, 7, 1010, 146);
    sg.fillStyle = '#f5ecd6'; sg.textAlign = 'center';
    sg.font = 'bold 66px Georgia, serif';
    sg.fillText('PHYSICAL SCIENCES', 512, 96);
    sg.fillStyle = '#e9c77c';
    sg.font = 'bold 27px Arial, sans-serif';
    sg.fillText('IISER VITHURA', 512, 136);
    const signTex = new T.CanvasTexture(signCanvas);
    signTex.encoding = T.sRGBEncoding;
    signTex.anisotropy = maxAniso;
    const sign = new T.Mesh(new T.PlaneGeometry(4.7, 0.73), new T.MeshBasicMaterial({ map: signTex, side: T.DoubleSide }));
    sign.position.set(0, 4.95, 3.49);
    g.add(sign);

    const bed = new T.Mesh(new T.BoxGeometry(12.5, 0.32, 6.0), new T.MeshStandardMaterial({ color: 0x4b3427, roughness: 0.98 }));
    bed.position.set(0, -0.04, 7.0);
    bed.receiveShadow = true;
    g.add(bed);
    const hedge = new T.Mesh(new T.BoxGeometry(11.8, 0.45, 1.0), new T.MeshStandardMaterial({ color: 0x2f6031, roughness: 0.9 }));
    hedge.position.set(0, 0.18, 4.95);
    hedge.castShadow = true;
    g.add(hedge);

    const shrubGeo = new T.SphereGeometry(0.48, 7, 5);
    const shrubMat = new T.MeshStandardMaterial({ color: 0x356d38, roughness: 0.92 });
    const shrubs = new T.InstancedMesh(shrubGeo, shrubMat, 18);
    const dummy = new T.Object3D();
    for (let i = 0; i < 18; i++) {
      const x = -5.4 + (i % 6) * 2.15 + ((i * 7) % 5) * 0.17;
      const z = 6.1 + Math.floor(i / 6) * 1.7;
      dummy.position.set(x, 0.34, z);
      dummy.rotation.set(0, i * 1.7, 0);
      dummy.scale.set(0.8 + (i % 3) * 0.17, 0.65 + (i % 4) * 0.11, 0.8 + (i % 2) * 0.16);
      dummy.updateMatrix();
      shrubs.setMatrixAt(i, dummy.matrix);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.castShadow = true;
    g.add(shrubs);

    const flowerGeo = new T.SphereGeometry(0.095, 5, 4);
    const flowerMat = new T.MeshStandardMaterial({ color: 0xd9364b, roughness: 0.66 });
    const flowers = new T.InstancedMesh(flowerGeo, flowerMat, 34);
    for (let i = 0; i < 34; i++) {
      const x = -5.6 + (i % 9) * 1.42;
      const z = 5.95 + Math.floor(i / 9) * 1.38 + ((i * 3) % 4) * 0.13;
      dummy.position.set(x, 0.58 + (i % 3) * 0.08, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.8 + (i % 4) * 0.12);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
    }
    flowers.instanceMatrix.needsUpdate = true;
    flowers.castShadow = false;
    g.add(flowers);
  }

  function buildPsbStairTower(b, group, edge) {
    const along = clamp(edge.len * 0.27, 9, 16);
    const yaw = Math.atan2(edge.nx, edge.nz);
    const g = new T.Group();
    g.name = 'psbStairTower';
    g.position.set(edge.mx + edge.tx * along - edge.nx * 1.35, b.base, edge.mz + edge.tz * along - edge.nz * 1.35);
    g.rotation.y = yaw;
    group.add(g);

    const h = b.wallH + 2.25;
    const body = new T.Mesh(new T.BoxGeometry(6.2, h, 4.9), psbPeachMat);
    body.position.y = h * 0.5;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    for (const y of [3.35, 6.75, 10.15]) {
      const strip = new T.Mesh(new T.BoxGeometry(6.28, 0.14, 4.98), psbCreamMat);
      strip.position.y = y;
      strip.castShadow = true;
      g.add(strip);
    }
    for (const y of [2.1, 5.5, 8.9, 12.0]) {
      if (y > h - 1.2) continue;
      const win = new T.Mesh(new T.BoxGeometry(0.88, 1.85, 0.07), psbDarkMat);
      win.position.set(0, y, 2.47);
      g.add(win);
      const trim = new T.Mesh(new T.BoxGeometry(1.04, 2.02, 0.04), psbCreamMat);
      trim.position.set(0, y, 2.44);
      g.add(trim);
    }
    const cap = new T.Mesh(new T.ConeGeometry(4.65, 2.1, 4), psbRoofMat);
    cap.position.y = h + 1.05;
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(1.08, 1, 0.86);
    cap.castShadow = true; cap.receiveShadow = true;
    g.add(cap);
    const finial = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.9, 6), psbMaroonMat);
    finial.position.y = h + 2.4;
    g.add(finial);
  }

  function buildPsbRafters(b, group, eave) {
    const fp = b.footprint;
    const points = [];
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], c = fp[(i + 1) % fp.length];
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      let nx = -dz / len, nz = dx / len;
      const mx = (a[0] + c[0]) * 0.5, mz = (a[1] + c[1]) * 0.5;
      if (nx * (mx - b.cx) + nz * (mz - b.cz) < 0) { nx = -nx; nz = -nz; }
      const count = Math.max(1, Math.floor(len / 1.55));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        points.push({
          x: a[0] + dx * t + nx * 0.46,
          z: a[1] + dz * t + nz * 0.46,
          y: eave - 0.24,
          yaw: Math.atan2(nx, nz)
        });
      }
    }
    if (!points.length) return;
    const rafters = new T.InstancedMesh(new T.BoxGeometry(0.10, 0.15, 1.15), psbWoodMat, points.length);
    const dummy = new T.Object3D();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rafters.setMatrixAt(i, dummy.matrix);
    }
    rafters.instanceMatrix.needsUpdate = true;
    rafters.castShadow = false;
    group.add(rafters);
  }

  function decoratePhysicsBlock(b, group, eave) {
    const edge = psbFrontEdge(b);
    if (!edge) return;
    buildPsbPortico(b, group, edge);
    buildPsbStairTower(b, group, edge);
    buildPsbRafters(b, group, eave);

    const bandPos = [];
    const fasciaOuter = expandRingOutward(b.footprint, b.cx, b.cz, 0.55);
    addHorizontalBandInto(bandPos, b.footprint, fasciaOuter, eave - 0.28, eave + 0.16);
    const bandGeo = makeGeometry({ pos: bandPos });
    const fascia = new T.Mesh(bandGeo, psbMaroonMat);
    fascia.castShadow = true; fascia.receiveShadow = true;
    group.add(fascia);

    const baseOuter = expandRingOutward(b.footprint, b.cx, b.cz, 0.20);
    const basePos = [];
    addHorizontalBandInto(basePos, b.footprint, baseOuter, b.base - 0.10, b.base + 0.52);
    const baseBand = new T.Mesh(makeGeometry({ pos: basePos }), psbMaroonMat);
    baseBand.receiveShadow = true;
    group.add(baseBand);
  }

  const buildingMeshes = [];
  const pickMeshes = [];
  const buildingById = new Map();
  const buildingColliders = [];
  const foundPos = [], foundUv = [];
  const archTrimPos = []; // Batched 3D floor slabs / sunshade chajjas & structural corner columns!

  for (const b of D.buildings) {
    buildingById.set(b.id, b);

    // Precompute bounding radius + polygon for fast shuttle bus collision checks
    let maxR = 0;
    for (const p of b.footprint) {
      const r = Math.hypot(p[0] - b.cx, p[1] - b.cz);
      if (r > maxR) maxR = r;
    }
    buildingColliders.push({ id: b.id, name: b.name, cx: b.cx, cz: b.cz, radius: maxR + 2.5, ring: b.footprint });

    if (b.style === 'custom_stadium') continue; // Built as custom curved rib-vault stadium in buildHeroLandmarks!

    const isPsb = b.name === 'Physics Block';
    if (isPsb) b.roofH = 3.8;

    if (b.base - b.foundBottom > 0.12) {
      const f = wallsData(b.footprint, b.foundBottom - 1.2, b.base + 0.35, 4, 3);
      for (let i = 0; i < f.pos.length; i++) foundPos.push(f.pos[i]);
      for (let i = 0; i < f.uv.length; i++) foundUv.push(f.uv[i]);
    }

    const group = new T.Group();
    const eave = b.base + b.wallH;
    const wallGeo = isPsb
      ? makeGeometry(wallsData(b.footprint, b.base, eave, 6.2, 3.25, 0, 1))
      : makeGeometry(wallsData(b.footprint, b.base, eave, 6.2, 3.25));
    const wallMat = isPsb ? psbWallMat : new T.MeshStandardMaterial({
      map: wallTex,
      roughnessMap: facadeMaps.rmTex,
      metalnessMap: facadeMaps.rmTex,
      bumpMap: wallTex,
      bumpScale: 0.06,
      emissiveMap: facadeMaps.emTex,
      emissive: new T.Color(0x000000),
      emissiveIntensity: 0.0,
      color: new T.Color(b.wallColor),
      roughness: 1.0,
      metalness: 0.82
    });
    wallMat.userData.baseEnvIntensity = 1.05;
    // Register building windows to glow warmly at dusk/night!
    const nightGlowAmt = ['hostel', 'academic', 'research', 'library', 'hospital', 'dining', 'recreation'].includes(b.kind) ? 1.15 : 0.45;
    nightMaterials.push({ mat: wallMat, color: new T.Color(0xffc978), intensity: nightGlowAmt });

    const wallMesh = new T.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = qualityTier !== 'low';
    wallMesh.receiveShadow = true;
    wallMesh.userData.buildingId = b.id;
    group.add(wallMesh);
    buildingMeshes.push(wallMesh);
    pickMeshes.push(wallMesh);

    // 3D Architectural Floor Slabs / Sunshade Chajjas & Plinth Band (huge Unreal realism boost at street level!)
    if (b.area >= 55) {
      const chajjaProjection = b.kind === 'hostel' ? 0.62 : 0.42;
      const chajjaOuter = expandRingOutward(b.footprint, b.cx, b.cz, chajjaProjection);
      const plinthOuter = expandRingOutward(b.footprint, b.cx, b.cz, 0.26);
      addHorizontalBandInto(archTrimPos, b.footprint, plinthOuter, b.base - 0.1, b.base + 0.48);

      const floors = Math.max(1, b.floors || 1);
      const floorStep = (b.wallH - 0.45) / floors;
      for (let fl = 1; fl <= floors; fl++) {
        const ySlab = b.base + 0.45 + fl * floorStep - 0.12;
        addHorizontalBandInto(archTrimPos, b.footprint, chajjaOuter, ySlab, ySlab + 0.20);
      }
    }

    if (b.style === 'hip' && b.roofInner) {
      const overhangOuter = expandRingOutward(b.footprint, b.cx, b.cz, b.area > 300 ? 0.78 : 0.48);
      const roof = hipRoofData(b.footprint, overhangOuter, b.roofInner, eave, eave + b.roofH);
      const roofGeo = makeGeometry(roof);
      const roofMat = new T.MeshStandardMaterial({
        map: roofTex,
        bumpMap: roofTex,
        bumpScale: 0.28,
        color: new T.Color(b.roofColor),
        roughness: 0.78,
        metalness: 0.04,
        side: T.DoubleSide
      });
      roofMat.userData.baseEnvIntensity = 0.6;
      const roofMesh = new T.Mesh(roofGeo, roofMat);
      roofMesh.castShadow = qualityTier !== 'low';
      roofMesh.receiveShadow = true;
      roofMesh.userData.buildingId = b.id;
      group.add(roofMesh);
      buildingMeshes.push(roofMesh);
      pickMeshes.push(roofMesh);
      addRoofClutter(group, b, eave + b.roofH, true);
      if (isPsb) decoratePhysicsBlock(b, group, eave);
    } else {
      const parapetOuter = expandRingOutward(b.footprint, b.cx, b.cz, 0.22);
      const parapet = wallsData(parapetOuter, eave, eave + 0.68, 4.5, 1.2);
      const parapetGeo = makeGeometry(parapet);
      const parapetMesh = new T.Mesh(parapetGeo, trimConcreteMat);
      parapetMesh.castShadow = true;
      parapetMesh.receiveShadow = true;
      parapetMesh.userData.buildingId = b.id;
      group.add(parapetMesh);
      buildingMeshes.push(parapetMesh);
      pickMeshes.push(parapetMesh);

      const capPos = [], capUv = [];
      addCap(capPos, capUv, parapetOuter, eave + 0.52, 2.4, false);
      const capGeo = makeGeometry({ pos: capPos, uv: capUv });
      const capMat = new T.MeshStandardMaterial({
        map: flatRoofTex, bumpMap: flatRoofTex, bumpScale: 0.14,
        color: new T.Color(b.roofColor), roughness: 0.92, metalness: 0.02
      });
      const capMesh = new T.Mesh(capGeo, capMat);
      capMesh.castShadow = true;
      capMesh.receiveShadow = true;
      capMesh.userData.buildingId = b.id;
      group.add(capMesh);
      buildingMeshes.push(capMesh);
      pickMeshes.push(capMesh);
      addRoofClutter(group, b, eave + 0.52, false);
    }
    scene.add(group);
  }

  if (foundPos.length) {
    const fg = new T.BufferGeometry();
    fg.setAttribute('position', new T.Float32BufferAttribute(foundPos, 3));
    fg.setAttribute('uv', new T.Float32BufferAttribute(foundUv, 2));
    fg.computeVertexNormals();
    const fm = new T.Mesh(fg, foundationMat);
    fm.castShadow = true;
    fm.receiveShadow = true;
    scene.add(fm);
  }

  if (archTrimPos.length) {
    const tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.Float32BufferAttribute(archTrimPos, 3));
    tg.computeVertexNormals();
    const tm = new T.Mesh(tg, trimConcreteMat);
    tm.castShadow = true;
    tm.receiveShadow = true;
    scene.add(tm);
  }

  function flatPolygon(ring, y) {
    const pos = [], uv = [];
    addCap(pos, uv, ring, y, 3, false);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }

  // --- 5. ENGINEERED MULTI-LAYER PBR ROADS, EMBANKMENTS, JUNCTION-OPEN KERBS, SIDEWALKS & MARKINGS ---
  function makeAsphaltNormalTexture() {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const h = new Float32Array(size * size);
    let seed = 88412;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // High-frequency crushed basalt/granite aggregate + subtle macro undulation
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fine = rnd() * 0.72 + (rnd() > 0.86 ? 0.45 : 0);
        const macro = Math.sin(x / size * Math.PI * 6) * Math.cos(y / size * Math.PI * 4) * 0.18;
        h[y * size + x] = fine + macro;
      }
    }
    const strength = 2.4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const ym = (y - 1 + size) % size, yp = (y + 1) % size;
        const dx = (h[y * size + xp] - h[y * size + xm]) * strength;
        const dy = (h[yp * size + x] - h[ym * size + x]) * strength;
        const len = Math.hypot(dx, dy, 1);
        const k = (y * size + x) * 4;
        img.data[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        img.data[k + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
        img.data[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = maxAniso;
    return tex;
  }

  function makeRoadMaps(surface) {
    const S = surface === 'asphalt' ? 1024 : 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const cR = document.createElement('canvas'); cR.width = cR.height = S;
    const gR = cR.getContext('2d');

    const base = {
      asphalt: '#2c3035', concrete: '#939188', paving: '#8e7c68',
      gravel: '#6d5c48', earth: '#675440', grass: '#476139'
    }[surface] || '#2c3035';
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    gR.fillStyle = 'rgb(255, 224, 12)'; gR.fillRect(0, 0, S, S);

    let seed = 2026 + surface.length * 97;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    if (surface === 'asphalt') {
      // 1. Storm-drain laterite dust/moss gutter edge + 4 realistic wheel-wear tracks (2 per lane across U!)
      const wGrad = g.createLinearGradient(0, 0, S, 0);
      wGrad.addColorStop(0.00, 'rgba(92,78,60,0.34)');
      wGrad.addColorStop(0.07, 'rgba(46,49,54,0.06)');
      wGrad.addColorStop(0.16, 'rgba(18,20,24,0.28)'); // Left lane outer tire track
      wGrad.addColorStop(0.25, 'rgba(48,52,57,0.05)');
      wGrad.addColorStop(0.35, 'rgba(18,20,24,0.28)'); // Left lane inner tire track
      wGrad.addColorStop(0.50, 'rgba(66,70,76,0.14)'); // Coarse oil/aggregate crown
      wGrad.addColorStop(0.65, 'rgba(18,20,24,0.28)'); // Right lane inner tire track
      wGrad.addColorStop(0.75, 'rgba(48,52,57,0.05)');
      wGrad.addColorStop(0.84, 'rgba(18,20,24,0.28)'); // Right lane outer tire track
      wGrad.addColorStop(0.93, 'rgba(46,49,54,0.06)');
      wGrad.addColorStop(1.00, 'rgba(92,78,60,0.34)');
      g.fillStyle = wGrad; g.fillRect(0, 0, S, S);

      // Matching PBR Roughness Map: smoother specular sheen along polished wheel tracks & tar seals!
      const rGrad = gR.createLinearGradient(0, 0, S, 0);
      rGrad.addColorStop(0.00, 'rgb(255, 242, 4)');
      rGrad.addColorStop(0.16, 'rgb(255, 118, 22)');
      rGrad.addColorStop(0.25, 'rgb(255, 205, 10)');
      rGrad.addColorStop(0.35, 'rgb(255, 118, 22)');
      rGrad.addColorStop(0.50, 'rgb(255, 218, 8)');
      rGrad.addColorStop(0.65, 'rgb(255, 118, 22)');
      rGrad.addColorStop(0.75, 'rgb(255, 205, 10)');
      rGrad.addColorStop(0.84, 'rgb(255, 118, 22)');
      rGrad.addColorStop(1.00, 'rgb(255, 242, 4)');
      gR.fillStyle = rGrad; gR.fillRect(0, 0, S, S);

      // 2. Cold-mix asphalt patch repairs (authentic Indian campus/ghat road character!)
      for (let p = 0; p < 4; p++) {
        const px = 90 + rnd() * (S - 260), py = rnd() * (S - 180);
        const pw = 65 + rnd() * 115, ph = 85 + rnd() * 160;
        g.fillStyle = p % 2 === 0 ? 'rgba(28,31,36,0.36)' : 'rgba(64,68,74,0.28)';
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = 'rgba(14,16,19,0.52)';
        g.lineWidth = 2.2;
        g.strokeRect(px, py, pw, ph);
        gR.fillStyle = 'rgb(255, 150, 18)';
        gR.fillRect(px, py, pw, ph);
      }

      // 3. Multi-tone crushed granite/quartz mineral aggregate flecks (38,000 grains!)
      for (let i = 0; i < 38000; i++) {
        const v = 26 + rnd() * 78;
        const warm = (rnd() - 0.45) * 10;
        g.fillStyle = `rgba(${Math.round(v + warm)},${Math.round(v + 2)},${Math.round(v + 5)},${0.07 + rnd() * 0.22})`;
        g.fillRect(rnd() * S, rnd() * S, 0.8 + rnd() * 2.4, 0.8 + rnd() * 2.4);
      }

      // 4. Glossy bitumen crack-sealing ribbons
      for (let i = 0; i < 24; i++) {
        g.strokeStyle = `rgba(12,14,17,${0.26 + rnd() * 0.24})`;
        gR.strokeStyle = 'rgb(255, 68, 35)';
        const lw = 1.2 + rnd() * 2.2;
        g.lineWidth = lw; gR.lineWidth = lw + 1.2;
        g.beginPath(); gR.beginPath();
        let x = 60 + rnd() * (S - 120), y = rnd() * S;
        g.moveTo(x, y); gR.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (rnd() - 0.5) * 62;
          y += (rnd() - 0.25) * 85;
          g.lineTo(x, y); gR.lineTo(x, y);
        }
        g.stroke(); gR.stroke();
      }

      // 5. Cast-iron utility manhole cover & concrete collar
      const mx = S * 0.30, my = S * 0.54;
      g.fillStyle = '#5e5d58';
      g.beginPath(); g.arc(mx, my, 24, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26292d';
      g.beginPath(); g.arc(mx, my, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#43484e'; g.lineWidth = 2.0;
      g.beginPath(); g.arc(mx, my, 14, 0, Math.PI * 2); g.stroke();
      for (let gx = -10; gx <= 10; gx += 5) {
        g.beginPath(); g.moveTo(mx + gx, my - 10); g.lineTo(mx + gx, my + 10); g.stroke();
      }
      gR.fillStyle = 'rgb(255, 95, 160)';
      gR.beginPath(); gR.arc(mx, my, 18, 0, Math.PI * 2); gR.fill();

      // Side storm-drain grates along gutter
      for (const sx of [22, S - 38]) {
        for (const sy of [180, 690]) {
          g.fillStyle = '#191c1f'; g.fillRect(sx, sy, 16, 36);
          g.strokeStyle = '#525860'; g.lineWidth = 2;
          for (let gy = sy + 4; gy < sy + 34; gy += 6) {
            g.beginPath(); g.moveTo(sx + 2, gy); g.lineTo(sx + 14, gy); g.stroke();
          }
        }
      }
    } else if (surface === 'concrete') {
      for (let i = 0; i < 9000; i++) {
        const v = 116 + rnd() * 58;
        g.fillStyle = `rgba(${v},${v - 1},${v - 5},${0.06 + rnd() * 0.14})`;
        g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2.8, 1 + rnd() * 2.8);
      }
      // Brushed broom texture lines + expansion joints
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
      for (let y = 0; y < S; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
      g.strokeStyle = 'rgba(52,50,46,0.42)'; g.lineWidth = 2.4;
      for (let k = 0; k <= S; k += 128) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke();
        g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke();
      }
    } else if (surface === 'paving') {
      // Interlocking terracotta/granite brick pavers
      for (let y = 0; y < S; y += 32) {
        for (let x = ((y / 32) % 2) * 16; x < S; x += 32) {
          const v = 118 + rnd() * 42;
          const warm = (rnd() > 0.5) ? 14 : 4;
          g.fillStyle = `rgba(${Math.round(v + warm)},${Math.round(v - 6)},${Math.round(v - 18)},${0.58 + rnd() * 0.28})`;
          g.fillRect(x + 1.5, y + 1.5, 29, 29);
        }
      }
      g.strokeStyle = 'rgba(45,40,34,0.45)'; g.lineWidth = 1.6;
      for (let y = 0; y <= S; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    } else {
      for (let i = 0; i < 14000; i++) {
        const v = surface === 'grass' ? 58 + rnd() * 52 : 68 + rnd() * 58;
        g.fillStyle = `rgba(${v},${v - (surface === 'grass' ? 4 : 11)},${v - (surface === 'grass' ? 24 : 30)},${0.08 + rnd() * 0.22})`;
        g.fillRect(rnd() * S, rnd() * S, 0.9 + rnd() * 2.6, 0.9 + rnd() * 2.6);
      }
    }

    const colTex = new T.CanvasTexture(c);
    colTex.wrapS = colTex.wrapT = T.RepeatWrapping;
    colTex.encoding = T.sRGBEncoding;
    colTex.anisotropy = maxAniso;

    const rmTex = new T.CanvasTexture(cR);
    rmTex.wrapS = rmTex.wrapT = T.RepeatWrapping;
    rmTex.anisotropy = maxAniso;

    return { colTex, rmTex };
  }

  function makeKerbTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    for (let y = 0; y < 256; y += 64) {
      g.fillStyle = (y / 64) % 2 === 0 ? '#e3decb' : '#24282c';
      g.fillRect(0, y, 64, 59);
      g.fillStyle = '#5c5850';
      g.fillRect(0, y + 59, 64, 5);
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = maxAniso;
    return tex;
  }

  const sharedAsphaltNormal = makeAsphaltNormalTexture();
  const roadMats = {};
  function roadMaterial(surface) {
    if (!roadMats[surface]) {
      const { colTex, rmTex } = makeRoadMaps(surface);
      const isAsph = surface === 'asphalt';
      const m = new T.MeshStandardMaterial({
        map: colTex,
        roughnessMap: isAsph ? rmTex : null,
        metalnessMap: isAsph ? rmTex : null,
        normalMap: isAsph ? sharedAsphaltNormal : null,
        normalScale: isAsph ? new T.Vector2(0.55, 0.55) : new T.Vector2(0, 0),
        bumpMap: isAsph ? null : colTex,
        bumpScale: 0.055,
        color: 0xffffff,
        roughness: isAsph ? 0.96 : 0.90,
        metalness: isAsph ? 0.35 : 0.02,
        side: T.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      m.userData.baseEnvIntensity = isAsph ? 0.92 : 0.42;
      roadMats[surface] = m;
    }
    return roadMats[surface];
  }

  const embankmentMat = new T.MeshStandardMaterial({
    map: terrainDetails.rockDetail,
    color: 0x7a6d5d,
    roughness: 0.95,
    metalness: 0.0,
    side: T.DoubleSide
  });
  const kerbMat = new T.MeshStandardMaterial({
    map: makeKerbTexture(),
    roughness: 0.76,
    metalness: 0.03
  });
  const markingWhiteMat = new T.MeshStandardMaterial({
    color: 0xf4f0e4, roughness: 0.52, metalness: 0.05, side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  });
  const markingYellowMat = new T.MeshStandardMaterial({
    color: 0xedb634, roughness: 0.52, metalness: 0.05, side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  });

  function ribbonInto(pts, width, lift, uvScale, pos, uv, fitAcrossU, hugGroundEdges) {
    const n = pts.length;
    if (n < 2) return;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      let dx, dz;
      if (i === 0) { dx = pts[1][0] - pts[0][0]; dz = pts[1][1] - pts[0][1]; }
      else if (i === n - 1) { dx = pts[n - 1][0] - pts[n - 2][0]; dz = pts[n - 1][1] - pts[n - 2][1]; }
      else { dx = pts[i + 1][0] - pts[i - 1][0]; dz = pts[i + 1][1] - pts[i - 1][1]; }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      let miter = 1;
      if (i > 0 && i < n - 1) {
        const pdx = pts[i][0] - pts[i - 1][0], pdz = pts[i][1] - pts[i - 1][1];
        const ndx = pts[i + 1][0] - pts[i][0], ndz = pts[i + 1][1] - pts[i][1];
        const pl = Math.hypot(pdx, pdz) || 1, nl = Math.hypot(ndx, ndz) || 1;
        const dot = (pdx * ndx + pdz * ndz) / (pl * nl);
        const cosHalf = Math.sqrt(Math.max(0.28, (1 + dot) * 0.5));
        miter = Math.min(1.9, 1 / cosHalf);
      }
      const off = width * 0.5 * miter;
      const nx = -dz, nz = dx;
      const lx = pts[i][0] + nx * off, lz = pts[i][1] + nz * off;
      const rx = pts[i][0] - nx * off, rz = pts[i][1] - nz * off;
      const yC = pts[i][2] + lift;
      const yL = hugGroundEdges ? Math.max(yC, heightAt(lx, lz) + ROAD_SURFACE_LIFT + lift) : yC;
      const yR = hugGroundEdges ? Math.max(yC, heightAt(rx, rz) + ROAD_SURFACE_LIFT + lift) : yC;
      left.push([lx, yL, lz]);
      right.push([rx, yR, rz]);
    }
    if (hugGroundEdges && n >= 4) {
      // Gentle 3-point longitudinal smoothing on edge heights so road cross-fall transitions smoothly
      for (const arr of [left, right]) {
        const ys = arr.map(p => p[1]);
        for (let i = 1; i < n - 1; i++) arr[i][1] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) * 0.25;
      }
    }
    let dist = 0;
    const uL = fitAcrossU ? 0.0 : width * 0.5 / uvScale;
    const uR = fitAcrossU ? 1.0 : -width * 0.5 / uvScale;
    for (let i = 0; i < n - 1; i++) {
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const v0 = dist / uvScale, v1 = (dist + seg) / uvScale;
      const l0 = left[i], l1 = left[i + 1], r0 = right[i], r1 = right[i + 1];
      tri(pos, uv, l0, r1, r0, [uL, v0], [uR, v1], [uR, v0]);
      tri(pos, uv, l0, l1, r1, [uL, v0], [uL, v1], [uR, v1]);
      dist += seg;
    }
  }

  // Builds solid 3D sloped embankment skirts & junction-aware 3D kerbs (omits kerbs across intersections!)
  function addRoadEmbankmentAndKerbs(ri, pts, width, lift, embPos, embUv, kerbPos, kerbUv) {
    const n = pts.length;
    if (n < 2) return;
    const halfW = width * 0.5;
    const kerbW = 0.24, kerbH = 0.16;
    const skirtSpread = 2.5, skirtDrop = 3.6;
    const L_in = [], L_out = [], L_bot = [], L_open = [];
    const R_in = [], R_out = [], R_bot = [], R_open = [];

    for (let i = 0; i < n; i++) {
      let dx, dz;
      if (i === 0) { dx = pts[1][0] - pts[0][0]; dz = pts[1][1] - pts[0][1]; }
      else if (i === n - 1) { dx = pts[n - 1][0] - pts[n - 2][0]; dz = pts[n - 1][1] - pts[n - 2][1]; }
      else { dx = pts[i + 1][0] - pts[i - 1][0]; dz = pts[i + 1][1] - pts[i - 1][1]; }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const nx = -dz, nz = dx;
      const x = pts[i][0], z = pts[i][1], yBase = pts[i][2] + lift;

      const lx = x + nx * halfW, lz = z + nz * halfW;
      const ly = Math.max(yBase, heightAt(lx, lz) + ROAD_SURFACE_LIFT + lift);
      L_in.push([lx, ly, lz]);
      L_out.push([x + nx * (halfW + kerbW), ly, z + nz * (halfW + kerbW)]);
      const lyTerr = Math.min(ly - 0.32, heightAt(x + nx * (halfW + skirtSpread), z + nz * (halfW + skirtSpread)) - skirtDrop);
      L_bot.push([x + nx * (halfW + skirtSpread), lyTerr, z + nz * (halfW + skirtSpread)]);
      L_open.push(isInsideOtherDriveableRoad(lx, lz, ri, 0.55));

      const rx = x - nx * halfW, rz = z - nz * halfW;
      const ry = Math.max(yBase, heightAt(rx, rz) + ROAD_SURFACE_LIFT + lift);
      R_in.push([rx, ry, rz]);
      R_out.push([x - nx * (halfW + kerbW), ry, z - nz * (halfW + kerbW)]);
      const ryTerr = Math.min(ry - 0.32, heightAt(x - nx * (halfW + skirtSpread), z - nz * (halfW + skirtSpread)) - skirtDrop);
      R_bot.push([x - nx * (halfW + skirtSpread), ryTerr, z - nz * (halfW + skirtSpread)]);
      R_open.push(isInsideOtherDriveableRoad(rx, rz, ri, 0.55));
    }

    let dist = 0;
    for (let i = 0; i < n - 1; i++) {
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const v0 = dist / 2.4, v1 = (dist + seg) / 2.4;
      const ev0 = dist / 5.0, ev1 = (dist + seg) / 5.0;
      dist += seg;

      // Left & Right 3D Embankment Retaining Slopes (skip inside overlapping road junctions!)
      if (!L_open[i] && !L_open[i + 1]) {
        tri(embPos, embUv, L_out[i], L_out[i + 1], L_bot[i + 1], [0, ev0], [0, ev1], [1, ev1]);
        tri(embPos, embUv, L_out[i], L_bot[i + 1], L_bot[i], [0, ev0], [1, ev1], [1, ev0]);

        const li0 = L_in[i], li1 = L_in[i + 1], lo0 = L_out[i], lo1 = L_out[i + 1];
        const li0T = [li0[0], li0[1] + kerbH, li0[2]], li1T = [li1[0], li1[1] + kerbH, li1[2]];
        const lo0T = [lo0[0], lo0[1] + kerbH, lo0[2]], lo1T = [lo1[0], lo1[1] + kerbH, lo1[2]];
        tri(kerbPos, kerbUv, li0, li1T, li0T, [0, v0], [1, v1], [1, v0]);
        tri(kerbPos, kerbUv, li0, li1, li1T, [0, v0], [0, v1], [1, v1]);
        tri(kerbPos, kerbUv, li0T, lo1T, lo0T, [0, v0], [1, v1], [1, v0]);
        tri(kerbPos, kerbUv, li0T, li1T, lo1T, [0, v0], [0, v1], [1, v1]);
        tri(kerbPos, kerbUv, lo0, lo0T, lo1T, [0, v0], [1, v0], [1, v1]);
        tri(kerbPos, kerbUv, lo0, lo1T, lo1, [0, v0], [1, v1], [0, v1]);
      }

      if (!R_open[i] && !R_open[i + 1]) {
        tri(embPos, embUv, R_out[i], R_bot[i + 1], R_out[i + 1], [0, ev0], [1, ev1], [0, ev1]);
        tri(embPos, embUv, R_out[i], R_bot[i], R_bot[i + 1], [0, ev0], [1, ev0], [1, ev1]);

        const ri0 = R_in[i], ri1 = R_in[i + 1], ro0 = R_out[i], ro1 = R_out[i + 1];
        const ri0T = [ri0[0], ri0[1] + kerbH, ri0[2]], ri1T = [ri1[0], ri1[1] + kerbH, ri1[2]];
        const ro0T = [ro0[0], ro0[1] + kerbH, ro0[2]], ro1T = [ro1[0], ro1[1] + kerbH, ro1[2]];
        tri(kerbPos, kerbUv, ri0, ri0T, ri1T, [0, v0], [1, v0], [1, v1]);
        tri(kerbPos, kerbUv, ri0, ri1T, ri1, [0, v0], [1, v1], [0, v1]);
        tri(kerbPos, kerbUv, ri0T, ro0T, ro1T, [0, v0], [1, v0], [1, v1]);
        tri(kerbPos, kerbUv, ri0T, ro1T, ri1T, [0, v0], [1, v1], [0, v1]);
        tri(kerbPos, kerbUv, ro0, ro1T, ro0T, [0, v0], [1, v1], [1, v0]);
        tri(kerbPos, kerbUv, ro0, ro1, ro1T, [0, v0], [0, v1], [1, v1]);
      }
    }
  }

  function offsetPolyline(pts, offset, yAdd) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      let dx, dz;
      if (i === 0) { dx = pts[1][0] - pts[0][0]; dz = pts[1][1] - pts[0][1]; }
      else if (i === n - 1) { dx = pts[n - 1][0] - pts[n - 2][0]; dz = pts[n - 1][1] - pts[n - 2][1]; }
      else { dx = pts[i + 1][0] - pts[i - 1][0]; dz = pts[i + 1][1] - pts[i - 1][1]; }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      let miter = 1;
      if (i > 0 && i < n - 1) {
        const pdx = pts[i][0] - pts[i - 1][0], pdz = pts[i][1] - pts[i - 1][1];
        const ndx = pts[i + 1][0] - pts[i][0], ndz = pts[i + 1][1] - pts[i][1];
        const pl = Math.hypot(pdx, pdz) || 1, nl = Math.hypot(ndx, ndz) || 1;
        const dot = (pdx * ndx + pdz * ndz) / (pl * nl);
        const cosHalf = Math.sqrt(Math.max(0.28, (1 + dot) * 0.5));
        miter = Math.min(1.9, 1 / cosHalf);
      }
      const ox = pts[i][0] - dz * offset * miter;
      const oz = pts[i][1] + dx * offset * miter;
      const oy = Math.max(pts[i][2], heightAt(ox, oz) + ROAD_SURFACE_LIFT) + yAdd;
      out.push([ox, oz, oy]);
    }
    return out;
  }

  function sampleAt(pts, cum, d) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = clamp((d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-6), 0, 1);
    const a = pts[i - 1], b = pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function slicePolyline(pts, cum, d0, d1) {
    const out = [sampleAt(pts, cum, d0)];
    for (let i = 1; i < pts.length - 1; i++) {
      if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
    }
    out.push(sampleAt(pts, cum, d1));
    return out;
  }

  function addRoadMarkings(ri, r, lift, whitePos, whiteUv, yellowPos, yellowUv) {
    if (!r.isDriveable || r.surface === 'earth' || r.surface === 'gravel') return;
    if (r.width >= 4.6) {
      const off = r.width / 2 - 0.34;
      const edgeTargetPos = r.type === 'tertiary' ? whitePos : yellowPos;
      const edgeTargetUv = r.type === 'tertiary' ? whiteUv : yellowUv;
      ribbonInto(offsetPolyline(r.pts, off, lift + 0.025), 0.13, 0, 1, edgeTargetPos, edgeTargetUv, false, false);
      ribbonInto(offsetPolyline(r.pts, -off, lift + 0.025), 0.13, 0, 1, edgeTargetPos, edgeTargetUv, false, false);
    }
    if (r.width >= 4.8) {
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      const isHwy = r.type === 'tertiary';
      const centerPos = isHwy ? yellowPos : whitePos;
      const centerUv = isHwy ? yellowUv : whiteUv;

      for (let d = 4; d < total - 4; d += 9.5) {
        const sub = slicePolyline(r.pts, cum, d, Math.min(d + 4.0, total - 4));
        if (sub.length >= 2) ribbonInto(sub, isHwy ? 0.17 : 0.14, lift + 0.03, 1, centerPos, centerUv, false, false);
      }

      // Thermoplastic directional lane arrows every ~180m on major routes & State Highway
      if ((ri === 0 || ri === 18 || ri === 16 || ri === 17 || r.width >= 6.0) && total > 90) {
        for (let ad = 55; ad < total - 55; ad += 165) {
          const p0 = sampleAt(r.pts, cum, ad - 1.5);
          const p1 = sampleAt(r.pts, cum, ad + 1.5);
          const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz) || 1;
          const fx = dx / len, fz = dz / len, nx = -fz, nz = fx;
          // Left-hand traffic forward arrow in left lane (+nx)
          const cx = (p0[0] + p1[0]) * 0.5 + nx * (r.width * 0.23);
          const cz = (p0[1] + p1[1]) * 0.5 + nz * (r.width * 0.23);
          const cy = Math.max(p0[2], p1[2], heightAt(cx, cz) + ROAD_SURFACE_LIFT) + lift + 0.036;
          ribbonInto([[cx - fx * 1.4, cz - fz * 1.4, cy], [cx + fx * 0.6, cz + fz * 0.6, cy]], 0.22, 0, 1, whitePos, whiteUv, false, false);
          tri(whitePos, whiteUv,
            [cx + fx * 1.8, cy, cz + fz * 1.8],
            [cx + fx * 0.4 - nx * 0.58, cy, cz + fz * 0.4 - nz * 0.58],
            [cx + fx * 0.4 + nx * 0.58, cy, cz + fz * 0.4 + nz * 0.58],
            [0.5, 1], [0, 0], [1, 0]
          );
        }
      }

      // Yellow speed-breaker / rumble bar strips approaching Main Gate & key crossings
      if ((ri === 0 || ri === 18) && total > 200) {
        const rumbleSpots = ri === 0 ? [34, 215, 580, 980] : [455, 520];
        for (const rd of rumbleSpots) {
          if (rd > total - 25) continue;
          for (let bar = -1; bar <= 1; bar++) {
            const pM = sampleAt(r.pts, cum, rd + bar * 0.75);
            const pN = sampleAt(r.pts, cum, rd + bar * 0.75 + 0.5);
            const dx = pN[0] - pM[0], dz = pN[1] - pM[1], len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len, nz = dx / len, hw = r.width * 0.44;
            const yR = Math.max(pM[2], heightAt(pM[0], pM[1]) + ROAD_SURFACE_LIFT) + lift + 0.038;
            ribbonInto([
              [pM[0] - nx * hw, pM[1] - nz * hw, yR],
              [pM[0] + nx * hw, pM[1] + nz * hw, yR]
            ], 0.26, 0, 1, yellowPos, yellowUv, false, false);
          }
        }
      }

      // Zebra pedestrian crosswalks on main campus roads every ~230m
      if (!isHwy && total > 130) {
        for (let zd = 90; zd < total - 55; zd += 230) {
          const pA = sampleAt(r.pts, cum, zd - 1.4);
          const pB = sampleAt(r.pts, cum, zd + 1.4);
          const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
          const len = Math.hypot(dx, dz) || 1;
          const nx = -dz / len, nz = dx / len;
          const stripes = Math.floor((r.width - 1.2) / 0.85);
          for (let s = 0; s < stripes; s++) {
            const lat = (s - (stripes - 1) * 0.5) * 0.82;
            const ax = pA[0] + nx * lat, az = pA[1] + nz * lat;
            const bx = pB[0] + nx * lat, bz = pB[1] + nz * lat;
            const ay = Math.max(pA[2], heightAt(ax, az) + ROAD_SURFACE_LIFT) + lift + 0.038;
            const by = Math.max(pB[2], heightAt(bx, bz) + ROAD_SURFACE_LIFT) + lift + 0.038;
            ribbonInto([[ax, az, ay], [bx, bz, by]], 0.42, 0, 1, whitePos, whiteUv, false, false);
          }
        }
      }
    }
  }

  const roadGroup = new T.Group();
  const markWhitePos = [], markWhiteUv = [];
  const markYellowPos = [], markYellowUv = [];
  const embPos = [], embUv = [];
  const kerbPos = [], kerbUv = [];
  const sidewalkPos = [], sidewalkUv = [];

  for (let ri = 0; ri < D.roads.length; ri++) {
    const r = D.roads[ri];
    if (!r.pts || r.pts.length < 2) continue;
    const lift = r.isDriveable ? 0.04 : (r.lift != null ? r.lift : 0.08);

    if (r.isDriveable) {
      addRoadEmbankmentAndKerbs(ri, r.pts, r.width, lift, embPos, embUv, kerbPos, kerbUv);
      if (ri === 0 || ri === 1 || ri === 27 || ri === 29) {
        const swLine = offsetPolyline(r.pts, r.width * 0.5 + 0.92, lift + 0.13);
        ribbonInto(swLine, 1.35, 0, 2.5, sidewalkPos, sidewalkUv, false, false);
      }
    }

    const pos = [], uv = [];
    ribbonInto(r.pts, r.width, lift, 6.0, pos, uv, r.surface === 'asphalt', r.isDriveable);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, roadMaterial(r.surface));
    mesh.receiveShadow = true;
    mesh.userData.road = r;
    roadGroup.add(mesh);
    addRoadMarkings(ri, r, lift, markWhitePos, markWhiteUv, markYellowPos, markYellowUv);
  }

  if (embPos.length) {
    const eg = makeGeometry({ pos: embPos, uv: embUv });
    const em = new T.Mesh(eg, embankmentMat);
    em.receiveShadow = true;
    roadGroup.add(em);
  }
  if (kerbPos.length) {
    const kg = makeGeometry({ pos: kerbPos, uv: kerbUv });
    const km = new T.Mesh(kg, kerbMat);
    km.castShadow = true;
    km.receiveShadow = true;
    roadGroup.add(km);
  }
  if (sidewalkPos.length) {
    const sg = makeGeometry({ pos: sidewalkPos, uv: sidewalkUv });
    const sm = new T.Mesh(sg, roadMaterial('paving'));
    sm.receiveShadow = true;
    roadGroup.add(sm);
  }
  if (markWhitePos.length) {
    const mg = makeGeometry({ pos: markWhitePos, uv: markWhiteUv });
    const mm = new T.Mesh(mg, markingWhiteMat);
    mm.receiveShadow = true;
    roadGroup.add(mm);
  }
  if (markYellowPos.length) {
    const yg = makeGeometry({ pos: markYellowPos, uv: markYellowUv });
    const ym = new T.Mesh(yg, markingYellowMat);
    ym.receiveShadow = true;
    roadGroup.add(ym);
  }
  scene.add(roadGroup);

  for (const p of D.parking) {
    const geo = flatPolygon(p.polygon, p.level);
    const mesh = new T.Mesh(geo, roadMaterial('asphalt'));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const p of D.pitches) {
    const geo = flatPolygon(p.polygon, p.level);
    const mat = new T.MeshStandardMaterial({
      map: terrainDetails.grassDetail,
      color: new T.Color(p.color || '#487844'),
      roughness: 0.88,
      metalness: 0,
      side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const ring = p.polygon.map(q => new T.Vector3(q[0], p.level + 0.045, q[1]));
    ring.push(ring[0].clone());
    const lg = new T.BufferGeometry().setFromPoints(ring);
    scene.add(new T.Line(lg, new T.LineBasicMaterial({ color: 0xf6f2e4, transparent: true, opacity: 0.92 })));
  }

  // --- 6. REALISTIC ANIMATED WATERBODIES (INCLUDING CENTRAL CAMPUS LAKE!) ---
  const waterNormalTex = makeWaterNormalTexture();
  const waterNormalTex2 = makeWaterNormalTexture();
  waterNormalTex2.repeat.set(29, 29);
  const waterMats = [];
  for (const w of D.water) {
    const geo = flatPolygon(w.polygon, w.level);
    const isMainLake = !!w.isCampusLake;
    const mat = new T.MeshStandardMaterial({
      color: isMainLake ? 0x1c5259 : 0x2a5760,
      roughness: 0.07,
      metalness: 0.65,
      transparent: true,
      opacity: isMainLake ? 0.90 : 0.92,
      normalMap: waterNormalTex,
      normalScale: new T.Vector2(0.52, 0.52)
    });
    mat.userData.baseEnvIntensity = 1.45;
    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    waterMats.push(mat);

    // Stone shoreline trim around the Central Campus Waterbody
    if (isMainLake) {
      const bankPos = [];
      const outerShore = expandRingOutward(w.polygon, 442.0, 370.0, 2.2);
      addHorizontalBandInto(bankPos, w.polygon, outerShore, w.level - 0.65, w.level + 0.24);
      const bankGeo = makeGeometry({ pos: bankPos });
      const bankMesh = new T.Mesh(bankGeo, trimConcreteMat);
      bankMesh.receiveShadow = true;
      scene.add(bankMesh);
    }
  }

  // --- 7. LUSH WESTERN GHATS TROPICAL FOREST, KERALA PALMS & ROADSIDE FLORA ---
  function makeFoliageNormalAndAlpha() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#5f8a48'; g.fillRect(0, 0, 128, 128);
    let s = 331;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 900; i++) {
      const l = 28 + rnd() * 44;
      g.fillStyle = `hsla(${96 + rnd() * 28},${38 + rnd() * 28}%,${l}%,0.75)`;
      g.beginPath();
      g.ellipse(rnd() * 128, rnd() * 128, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3.14, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = maxAniso;
    return tex;
  }

  function buildTropicalTreeGeometries() {
    // Rich multi-lobed organic rainforest crown with smooth vertex AO gradient (dark interior -> sunlit crown tips!)
    const lobes = [
      [0.00, 0.64, 0.00, 0.33, 1],
      [0.19, 0.56, 0.10, 0.24, 1],
      [-0.18, 0.58, -0.09, 0.23, 1],
      [-0.08, 0.54, 0.17, 0.21, 1],
      [0.11, 0.55, -0.16, 0.21, 1],
      [0.02, 0.83, -0.02, 0.23, 1],
      [-0.10, 0.74, 0.08, 0.18, 0],
      [0.12, 0.73, -0.06, 0.18, 0]
    ];
    const parts = [];
    let totalVerts = 0;
    for (const [lx, ly, lz, r, det] of lobes) {
      let g = new T.IcosahedronGeometry(r, det);
      if (g.index) g = g.toNonIndexed();
      // Organic vertex perturbation so no geometric facets show
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const n = 1.0 + 0.13 * Math.sin(vx * 19.0 + vy * 15.0) * Math.cos(vz * 17.0);
        p.setXYZ(i, vx * n + lx, vy * 0.90 + ly, vz * n + lz);
      }
      g.computeVertexNormals();
      parts.push(g);
      totalVerts += p.count;
    }

    const posArr = new Float32Array(totalVerts * 3);
    const nrmArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    const colArr = new Float32Array(totalVerts * 3);
    let off = 0, uvOff = 0;
    for (const g of parts) {
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      posArr.set(pa, off);
      nrmArr.set(na, off);
      for (let i = 0; i < pa.length; i += 3) {
        const x = pa[i], y = pa[i + 1], z = pa[i + 2];
        const hShade = clamp((y - 0.34) / 0.68, 0, 1);
        const radShade = clamp(Math.hypot(x, z) / 0.38, 0, 1);
        const ao = 0.52 + 0.36 * hShade + 0.18 * radShade;
        colArr[off + i] = ao * 0.96;
        colArr[off + i + 1] = ao * 1.04;
        colArr[off + i + 2] = ao * 0.88;
        uvArr[uvOff++] = x * 2.5 + 0.5;
        uvArr[uvOff++] = y * 2.5;
      }
      off += pa.length;
      g.dispose();
    }
    const canopyGeo = new T.BufferGeometry();
    canopyGeo.setAttribute('position', new T.BufferAttribute(posArr, 3));
    canopyGeo.setAttribute('normal', new T.BufferAttribute(nrmArr, 3));
    canopyGeo.setAttribute('uv', new T.BufferAttribute(uvArr, 2));
    canopyGeo.setAttribute('color', new T.BufferAttribute(colArr, 3));

    // Fluted trunk + main Y-branches
    let tMain = new T.CylinderGeometry(0.028, 0.056, 0.52, 7);
    if (tMain.index) tMain = tMain.toNonIndexed();
    tMain.translate(0, 0.26, 0);
    let b1 = new T.CylinderGeometry(0.014, 0.024, 0.22, 5);
    if (b1.index) b1 = b1.toNonIndexed();
    b1.rotateZ(0.52); b1.translate(-0.05, 0.48, 0);
    let b2 = new T.CylinderGeometry(0.014, 0.024, 0.22, 5);
    if (b2.index) b2 = b2.toNonIndexed();
    b2.rotateZ(-0.48); b2.rotateY(1.8); b2.translate(0.04, 0.49, 0.03);

    const tParts = [tMain, b1, b2];
    let tCnt = 0;
    for (const tp of tParts) tCnt += tp.attributes.position.count;
    const tPos = new Float32Array(tCnt * 3);
    let tOff = 0;
    for (const tp of tParts) {
      tPos.set(tp.attributes.position.array, tOff);
      tOff += tp.attributes.position.array.length;
      tp.dispose();
    }
    const trunkGeo = new T.BufferGeometry();
    trunkGeo.setAttribute('position', new T.BufferAttribute(tPos, 3));
    trunkGeo.computeVertexNormals();

    return { canopyGeo, trunkGeo };
  }

  function buildKeralaPalmGeometries() {
    // Curved ringed coconut/royal palm trunk (unit height = 1.0, scaled by tree height 9-15m)
    const segs = 7;
    const tPos = [];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const y0 = t0 * 0.86, y1 = t1 * 0.86;
      const bend0 = Math.pow(t0, 1.7) * 0.09, bend1 = Math.pow(t1, 1.7) * 0.09;
      const r0 = lerp(0.036, 0.018, t0), r1 = lerp(0.036, 0.018, t1);
      for (let s = 0; s < 6; s++) {
        const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2;
        const p00 = [bend0 + Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
        const p10 = [bend0 + Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
        const p01 = [bend1 + Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
        const p11 = [bend1 + Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
        tri(tPos, null, p00, p01, p11);
        tri(tPos, null, p00, p11, p10);
      }
    }
    const palmTrunkGeo = new T.BufferGeometry();
    palmTrunkGeo.setAttribute('position', new T.Float32BufferAttribute(tPos, 3));
    palmTrunkGeo.computeVertexNormals();

    // 11 Arching 3D Pinnate Palm Fronds radiating from crown (0.09, 0.86, 0)
    const fPos = [], fCol = [];
    const cx = 0.09, cy = 0.86, cz = 0.0;
    const frondCount = 11;
    for (let f = 0; f < frondCount; f++) {
      const az = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.14;
      const pitch = (f % 3 === 0) ? 0.42 : (f % 3 === 1 ? 0.15 : -0.08);
      const len = 0.30 + (f % 2) * 0.05;
      const steps = 5;
      const dx = Math.cos(az), dz = Math.sin(az);
      const nx = -dz, nz = dx;
      for (let st = 0; st < steps; st++) {
        const s0 = st / steps, s1 = (st + 1) / steps;
        const r0 = s0 * len, r1 = s1 * len;
        const h0 = cy + Math.sin(s0 * 1.4) * 0.10 + pitch * r0 - s0 * s0 * 0.18;
        const h1 = cy + Math.sin(s1 * 1.4) * 0.10 + pitch * r1 - s1 * s1 * 0.18;
        const w0 = Math.sin(Math.max(0.08, s0) * Math.PI) * 0.068;
        const w1 = Math.sin(Math.min(0.96, s1) * Math.PI) * 0.068;
        const c0 = [cx + dx * r0, h0 + 0.012, cz + dz * r0];
        const c1 = [cx + dx * r1, h1 + 0.012, cz + dz * r1];
        const l0 = [cx + dx * r0 + nx * w0, h0 - 0.018, cz + dz * r0 + nz * w0];
        const l1 = [cx + dx * r1 + nx * w1, h1 - 0.018, cz + dz * r1 + nz * w1];
        const rr0 = [cx + dx * r0 - nx * w0, h0 - 0.018, cz + dz * r0 - nz * w0];
        const rr1 = [cx + dx * r1 - nx * w1, h1 - 0.018, cz + dz * r1 - nz * w1];
        // V-shaped pinnate frond leaflets
        tri(fPos, null, c0, c1, l1);
        tri(fPos, null, c0, l1, l0);
        tri(fPos, null, c0, rr1, c1);
        tri(fPos, null, c0, rr0, rr1);
        const shade = 0.62 + 0.38 * s1;
        for (let v = 0; v < 12; v++) fCol.push(shade * 0.92, shade * 1.06, shade * 0.78);
      }
    }
    const palmCrownGeo = new T.BufferGeometry();
    palmCrownGeo.setAttribute('position', new T.Float32BufferAttribute(fPos, 3));
    palmCrownGeo.setAttribute('color', new T.Float32BufferAttribute(fCol, 3));
    palmCrownGeo.computeVertexNormals();

    return { palmTrunkGeo, palmCrownGeo };
  }

  function addWindSway(material, amp) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sharedUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <project_vertex>', /* glsl */`
          vec4 mvPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          float swayMask = clamp(transformed.y, 0.0, 1.0);
          float phase = mvPosition.x * 0.09 + mvPosition.z * 0.07;
          mvPosition.x += sin(uTime * 1.55 + phase) * swayMask * swayMask * ${amp.toFixed(3)};
          mvPosition.z += cos(uTime * 1.25 + phase * 1.3) * swayMask * swayMask * ${(amp * 0.75).toFixed(3)};
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;
        `);
    };
  }

  const treeGroup = new T.Group();
  scene.add(treeGroup);
  const foliageTex = makeFoliageNormalAndAlpha();
  const { canopyGeo, trunkGeo } = buildTropicalTreeGeometries();
  const { palmTrunkGeo, palmCrownGeo } = buildKeralaPalmGeometries();

  const canopyMat = new T.MeshStandardMaterial({
    map: foliageTex,
    bumpMap: foliageTex,
    bumpScale: 0.12,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.0
  });
  addWindSway(canopyMat, 0.28);

  const trunkMat = new T.MeshStandardMaterial({ color: 0x4e3c2a, roughness: 0.96, metalness: 0 });
  const palmTrunkMat = new T.MeshStandardMaterial({ color: 0x6b5c49, roughness: 0.92, metalness: 0 });
  const palmCrownMat = new T.MeshStandardMaterial({
    color: 0x3b6e28,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
    side: T.DoubleSide
  });
  addWindSway(palmCrownMat, 0.42);

  function isExcludedForTrees(x, z, padRoad) {
    const ri = roadInfoAt(x, z);
    if (ri && ri.dist < ri.halfWidth + (padRoad || 3.2)) return true;
    for (let i = 0; i < buildingColliders.length; i++) {
      const bc = buildingColliders[i];
      if (Math.hypot(x - bc.cx, z - bc.cz) < bc.radius + 1.5) {
        if (pointInRing(x, z, bc.ring) || distToRingEdge(x, z, bc.ring) < 3.5) return true;
      }
    }
    for (const w of D.water) {
      if (pointInRing(x, z, w.polygon) || distToRingEdge(x, z, w.polygon) < 2.5) return true;
    }
    for (const p of D.pitches) {
      if (pointInRing(x, z, p.polygon)) return true;
    }
    for (const p of D.parking) {
      if (pointInRing(x, z, p.polygon)) return true;
    }
    if (D.gradingZones) {
      for (const gz of D.gradingZones) {
        if (pointInRing(x, z, gz.polygon)) return true;
      }
    }
    return false;
  }

  const solidObstacles = [];
  // Register ALL mapped 3D buildings & campus waterbodies as impermeable solid obstacles!
  for (const bc of buildingColliders) {
    solidObstacles.push({ type: 'poly', cx: bc.cx, cz: bc.cz, radius: bc.radius, ring: bc.ring, label: bc.name || 'Building' });
  }
  for (const w of D.water) {
    let cx = 0, cz = 0, maxR = 0;
    for (const p of w.polygon) { cx += p[0]; cz += p[1]; }
    cx /= w.polygon.length; cz /= w.polygon.length;
    for (const p of w.polygon) maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cz));
    solidObstacles.push({ type: 'poly', cx, cz, radius: maxR + 2.0, ring: w.polygon, label: w.name || 'Waterbody' });
  }

  let forestBuilt = false;
  function populateRealisticVegetation(satImg) {
    if (forestBuilt) return;
    forestBuilt = true;
    while (treeGroup.children.length) treeGroup.remove(treeGroup.children[0]);

    // Sample satellite image at low res to detect all real forest cover across the entire 2km Western Ghats basin!
    let pxData = null, sW = 0, sH = 0;
    if (satImg && satImg.width) {
      sW = 512; sH = 472;
      const sc = document.createElement('canvas'); sc.width = sW; sc.height = sH;
      const sg = sc.getContext('2d');
      try {
        sg.drawImage(satImg, 0, 0, sW, sH);
        pxData = sg.getImageData(0, 0, sW, sH).data;
      } catch (e) { pxData = null; }
    }

    const broadleafList = [];
    const palmList = [];
    const shrubList = [];
    const rockList = [];

    // 1. Keep curated campus trees that don't overlap newly added landmarks/widened roads
    for (const t of D.trees) {
      if (!isExcludedForTrees(t[0], t[1], 3.0)) {
        broadleafList.push([t[0], t[1], heightAt(t[0], t[1]) - 0.25, t[3], t[4], t[5]]);
      }
    }

    // 2. Expand lush Western Ghats forest across the ENTIRE mountain range using satellite greenness!
    let seed = 88421;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const step = state.reduced ? 25.0 : 18.5;
    for (let z = -GH / 2 + 24; z < GH / 2 - 24; z += step) {
      for (let x = -GW / 2 + 24; x < GW / 2 - 24; x += step) {
        const jx = x + (rnd() - 0.5) * step * 0.88;
        const jz = z + (rnd() - 0.5) * step * 0.88;
        if (Math.hypot(jx - 390, jz - 120) < 380 && rnd() < 0.55) continue; // already covered by D.trees
        if (isExcludedForTrees(jx, jz, 3.8)) continue;

        let isGreen = true;
        if (pxData) {
          const u = clamp(Math.floor((jx + GW / 2) / GW * sW), 0, sW - 1);
          const v = clamp(Math.floor((jz + GH / 2) / GH * sH), 0, sH - 1);
          const idx = (v * sW + u) * 4;
          const r = pxData[idx], g = pxData[idx + 1], b = pxData[idx + 2];
          const greenDiff = g - (r + b) * 0.5;
          const bright = (r + g + b) / 3;
          isGreen = (greenDiff > 7 && bright > 20 && bright < 150);
        }
        if (!isGreen) continue;

        const y = heightAt(jx, jz);
        // Mix of Kerala coconut palms in lower valleys (<155m) and towering rainforest canopy on ridges!
        if (y < 158 && rnd() < 0.16) {
          palmList.push([jx, jz, y - 0.2, 9.5 + rnd() * 5.5, rnd() * Math.PI * 2]);
        } else {
          const h = 8.5 + rnd() * 9.5;
          broadleafList.push([jx, jz, y - 0.3, h, rnd() * Math.PI * 2, Math.floor(rnd() * 6)]);
        }
      }
    }

    // 3. Plant signature Avenue Royal/Coconut Palms & Lush Roadside Shrubs/Ferns/Laterite Boulders along campus & exterior SH-45 roads!
    for (let ri = 0; ri < D.roads.length; ri++) {
      const r = D.roads[ri];
      if (!r || !r.isDriveable || ri === 15 || !r.pts) continue;
      let acc = 0;
      for (let k = 1; k < r.pts.length; k++) {
        const p0 = r.pts[k - 1], p1 = r.pts[k];
        const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        acc += seg;
        if (acc >= 14.0) {
          acc = 0;
          const dx = (p1[0] - p0[0]) / (seg || 1), dz = (p1[1] - p0[1]) / (seg || 1);
          const nx = -dz, nz = dx;

          // Roadside shrubs, tropical ferns & boulders right outside the kerb (street-level richness!)
          for (const side of [-1, 1]) {
            const offS = r.width * 0.5 + 1.9 + rnd() * 3.6;
            const sx = p1[0] + nx * side * offS, sz = p1[1] + nz * side * offS;
            if (!isExcludedForTrees(sx, sz, 1.1)) {
              const sy = heightAt(sx, sz);
              shrubList.push([sx, sz, sy - 0.15, 0.9 + rnd() * 1.4, rnd() * 6.28, Math.floor(rnd() * 6)]);
              if (rnd() < 0.28) {
                const rkx = sx + (rnd() - 0.5) * 2.0, rkz = sz + (rnd() - 0.5) * 2.0, rks = 0.35 + rnd() * 0.75;
                if (!isExcludedForTrees(rkx, rkz, 1.2)) {
                  rockList.push([rkx, rkz, sy - 0.1, rks, rnd() * 6.28]);
                  if (rks > 0.62) solidObstacles.push({ type: 'circle', cx: rkx, cz: rkz, r: rks * 0.72, label: 'Boulder' });
                }
              }
            }
          }

          // Avenue Coconut / Royal Palms every ~28m (impermeable solid trunks!)
          if (rnd() < 0.48) {
            const side = (k % 2 === 0) ? 1 : -1;
            const offP = r.width * 0.5 + 3.25;
            const px = p1[0] + nx * side * offP, pz = p1[1] + nz * side * offP;
            if (!isExcludedForTrees(px, pz, 1.9)) {
              palmList.push([px, pz, heightAt(px, pz) - 0.2, 9.8 + rnd() * 3.8, rnd() * Math.PI * 2]);
              solidObstacles.push({ type: 'circle', cx: px, cz: pz, r: 0.42, label: 'Palm Tree' });
            }
          }
        }
      }
    }

    // Register major forest tree trunks within 18m of driveable roads so buses cannot drive through trees!
    for (let i = 0; i < broadleafList.length; i++) {
      const t = broadleafList[i];
      const ri = roadInfoAt(t[0], t[1]);
      if (ri && ri.dist < ri.halfWidth + 18.0) {
        solidObstacles.push({ type: 'circle', cx: t[0], cz: t[1], r: Math.max(0.38, t[3] * 0.042), label: 'Tree Trunk' });
      }
    }
    if (window.ShuttleGame && window.ShuttleGame.rebuildObstacleGrid) {
      window.ShuttleGame.rebuildObstacleGrid();
    }

    const dummy = new T.Object3D();
    const treePalette = ['#23491e', '#2e5825', '#1d401b', '#38632b', '#274f21', '#426d31'].map(c => new T.Color(c));

    // Broadleaf InstancedMesh
    // Split vegetation into spatial batches so a street-level camera does not
    // submit the whole 2 km forest on every frame. Vegetation stays lit by the
    // sun and terrain; excluding it from the shadow pass saves a large amount
    // of work on integrated GPUs.
    const vegetationCell = 360;
    function forEachVegetationCell(list, build) {
      const cells = new Map();
      for (const item of list) {
        const cx = Math.floor((item[0] + GW / 2) / vegetationCell);
        const cz = Math.floor((item[1] + GH / 2) / vegetationCell);
        const key = cx + ',' + cz;
        let items = cells.get(key);
        if (!items) { items = []; cells.set(key, items); }
        items.push(item);
      }
      for (const items of cells.values()) build(items);
    }
    function finishVegetationMesh(mesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Three.js r149 does not provide InstancedMesh.computeBoundingSphere().
      // Give the renderer a bound around every transformed instance; otherwise
      // frustum culling falls back to the untransformed source geometry at (0,0,0).
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const instanceBounds = new T.Box3();
      const vegetationBounds = new T.Box3();
      const instanceMatrix = new T.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, instanceMatrix);
        instanceBounds.copy(mesh.geometry.boundingBox).applyMatrix4(instanceMatrix);
        vegetationBounds.union(instanceBounds);
      }
      vegetationBounds.expandByScalar(1.0); // allow for the wind sway shader
      mesh.boundingSphere = new T.Sphere();
      vegetationBounds.getBoundingSphere(mesh.boundingSphere);
      treeGroup.add(mesh);
    }
    forEachVegetationCell(broadleafList, items => {
      const canopyMesh = new T.InstancedMesh(canopyGeo, canopyMat, items.length);
      const trunkMesh = new T.InstancedMesh(trunkGeo, trunkMat, items.length);
      for (let i = 0; i < items.length; i++) {
        const t = items[i];
        dummy.position.set(t[0], t[2], t[1]);
        dummy.rotation.set(0, t[4], 0);
        dummy.scale.set(t[3] * 0.90, t[3] * 0.96, t[3] * 0.90);
        dummy.updateMatrix();
        canopyMesh.setMatrixAt(i, dummy.matrix);
        trunkMesh.setMatrixAt(i, dummy.matrix);
        canopyMesh.setColorAt(i, treePalette[t[5] % treePalette.length]);
      }
      finishVegetationMesh(trunkMesh);
      finishVegetationMesh(canopyMesh);
    });

    // Kerala palms, roadside shrubs and laterite boulders use the same
    // camera-visible chunking as the broadleaf canopy.
    forEachVegetationCell(palmList, items => {
      const trunks = new T.InstancedMesh(palmTrunkGeo, palmTrunkMat, items.length);
      const crowns = new T.InstancedMesh(palmCrownGeo, palmCrownMat, items.length);
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        dummy.position.set(p[0], p[2], p[1]);
        dummy.rotation.set(0, p[4], 0);
        dummy.scale.setScalar(p[3]);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        crowns.setMatrixAt(i, dummy.matrix);
      }
      finishVegetationMesh(trunks);
      finishVegetationMesh(crowns);
    });

    forEachVegetationCell(shrubList, items => {
      const mesh = new T.InstancedMesh(canopyGeo, canopyMat, items.length);
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        dummy.position.set(s[0], s[2] - s[3] * 0.32, s[1]);
        dummy.rotation.set(0, s[4], 0);
        dummy.scale.set(s[3] * 1.35, s[3] * 0.85, s[3] * 1.35);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, treePalette[(s[5] + 1) % treePalette.length]);
      }
      finishVegetationMesh(mesh);
    });

    if (rockList.length) {
      let rockGeo = new T.DodecahedronGeometry(0.65, 0);
      if (rockGeo.index) rockGeo = rockGeo.toNonIndexed();
      forEachVegetationCell(rockList, items => {
        const mesh = new T.InstancedMesh(rockGeo, foundationMat, items.length);
        for (let i = 0; i < items.length; i++) {
          const rk = items[i];
          dummy.position.set(rk[0], rk[2], rk[1]);
          dummy.rotation.set(rk[4] * 0.3, rk[4], rk[4] * 0.2);
          dummy.scale.set(rk[3] * 1.3, rk[3] * 0.72, rk[3]);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        finishVegetationMesh(mesh);
      });
    }
  }

  // Build bespoke 3D Hero Landmarks (Indoor Stadium, Q-Park, Lake Check-Dam/Pier/Gazebo, Health Centre, Exterior Highway, etc.)
  if (window.buildHeroLandmarks) {
    window.buildHeroLandmarks({
      scene, heightAt, pickMeshes, buildingById, wallTex, roofTex, maxAniso, nightMaterials, solidObstacles, roadInfoAt
    });
  }

  // Connect Night Window / Lamp Emissives to UnrealFX Time-of-Day controller
  if (unrealFX) {
    unrealFX.onTimeChange((nightFactor) => {
      for (const item of nightMaterials) {
        if (nightFactor > 0.05) {
          item.mat.emissive.copy(item.color);
          item.mat.emissiveIntensity = item.intensity * nightFactor;
        } else {
          item.mat.emissive.setHex(0x000000);
          item.mat.emissiveIntensity = 0.0;
        }
      }
    });
  }

  let boundaryLine = null;
  if (D.boundary && D.boundary.length > 2) {
    const pts = D.boundary.map(p => new T.Vector3(p[0], heightAt(p[0], p[1]) + 1.6, p[1]));
    pts.push(pts[0].clone());
    const geo = new T.BufferGeometry().setFromPoints(pts);
    const mat = new T.LineDashedMaterial({ color: 0xe6bd76, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.88, depthWrite: false });
    boundaryLine = new T.Line(geo, mat);
    boundaryLine.computeLineDistances();
    boundaryLine.visible = false;
    boundaryLine.renderOrder = 3;
    scene.add(boundaryLine);
  }

  const textureLoader = new T.TextureLoader();
  let satImage = null;
  const satTex = textureLoader.load(SAT_URI, onSat, undefined, () => fail('The satellite texture could not be decoded.'));
  satTex.encoding = T.sRGBEncoding;
  satTex.anisotropy = maxAniso;
  satTex.wrapS = satTex.wrapT = T.ClampToEdgeWrapping;
  satTex.minFilter = T.LinearMipmapLinearFilter;
  satTex.generateMipmaps = true;
  terrainMat.map = satTex;
  terrainMat.needsUpdate = true;

  function onSat() {
    satImage = satTex.image;
    populateRealisticVegetation(satImage);
    renderer.shadowMap.needsUpdate = true;
    buildMinimapBase();
    const loading = document.getElementById('loading');
    requestAnimationFrame(() => {
      if (loading) loading.classList.add('done');
    });
  }
  if (satTex.image && satTex.image.width) onSat();

  const selectionRing = new T.Mesh(
    new T.RingGeometry(0.955, 1.0, 64),
    new T.MeshBasicMaterial({ color: 0xffc66e, transparent: true, opacity: 0.78, side: T.DoubleSide, depthWrite: false })
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  selectionRing.renderOrder = 4;
  scene.add(selectionRing);

  // --- 8. INTERACTIVE LABELS (WITH SMART COLLISION AVOIDANCE) & INFO PANEL ---
  const labelsLayer = document.getElementById('labels');
  const labelEntries = [];
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  for (const l of D.labels) {
    const el = document.createElement('div');
    el.className = 'label ' + (l.major ? 'major' : 'minor') + ' kind-' + l.kind;
    el.innerHTML = '<span class="dot"></span><span class="txt">' + escapeHtml(l.text) + '</span>';
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      const b = l.id ? buildingById.get(l.id) : null;
      if (b) {
        selectBuilding(b, true);
      } else if (l.poiInfo) {
        selectPoi(l.poiInfo, true);
      } else {
        flyToPoint(l.x, l.z, l.kind === 'gate' ? 170 : 260, 1.08, cam.theta, 1200);
      }
    });
    labelsLayer.appendChild(el);
    const wy = Math.max(l.y || 0, heightAt(l.x, l.z) + 5.5);
    labelEntries.push({ l, el, v: new T.Vector3(l.x, wy, l.z) });
  }

  const cam = { target: new T.Vector3(0, 0, 0), radius: 980, phi: 0.96, theta: 0.56 };
  const desired = { target: new T.Vector3(0, 0, 0), radius: cam.radius, phi: cam.phi, theta: cam.theta };
  const initial = lonLatToLocal(77.1352, 8.6820);
  cam.target.set(initial.x, heightAt(initial.x, initial.z) + 18, initial.z);
  desired.target.copy(cam.target);

  const fly = { active: false, t: 0, dur: 1.3, from: {}, to: {} };

  function startFly(targetX, targetZ, targetY, radius, phi, theta, duration) {
    if (state.cameraExternal && window.ShuttleGame && window.ShuttleGame.exitDriveMode) {
      window.ShuttleGame.exitDriveMode();
    }
    fly.active = true;
    fly.t = 0;
    fly.dur = (duration || 1300) / 1000;
    fly.from = { target: cam.target.clone(), radius: cam.radius, phi: cam.phi, theta: cam.theta };
    fly.to = { target: new T.Vector3(targetX, targetY, targetZ), radius, phi, theta };
  }

  function flyToPoint(x, z, radius, phi, theta, duration) {
    const y = heightAt(x, z) + 10;
    startFly(x, z, y, radius, phi, theta, duration);
  }

  function flyToBuilding(b, duration) {
    const total = b.wallH + b.roofH;
    const rad = clamp(Math.sqrt(b.area) * 2.1, 88, 300);
    const y = b.base + Math.min(total * 0.55, 22);
    startFly(b.cx, b.cz, y, rad, 1.08, cam.theta, duration || 1200);
  }

  const VIEWS = {
    overview:  { x: 355, z: 245, radius: 1380, phi: 0.88, theta: 0.48 },
    academics: { lon: 77.1357, lat: 8.6823, radius: 460, phi: 1.06, theta: 0.50 },
    hostels:   { x: 485, z: 325, radius: 390, phi: 1.06, theta: 0.78 },
    stadium:   { x: 392, z: 420, radius: 295, phi: 1.12, theta: -0.62 },
    qpark:     { x: 425, z: 178, radius: 190, phi: 1.15, theta: 0.68 },
    health:    { x: 132, z: -48, radius: 295, phi: 1.08, theta: 0.88 },
    gate:      { x: 215, z: 505, radius: 220, phi: 1.16, theta: 0.52 },
    highway:   { x: 158, z: 582, radius: 245, phi: 1.13, theta: 0.44 },
    west:      { lon: 77.1281, lat: 8.6861, radius: 440, phi: 1.02, theta: 0.72 }
  };

  function goView(name) {
    const v = VIEWS[name];
    if (!v) return;
    const px = v.x != null ? v.x : lonLatToLocal(v.lon, v.lat).x;
    const pz = v.z != null ? v.z : lonLatToLocal(v.lon, v.lat).z;
    startFly(px, pz, heightAt(px, pz) + 12, v.radius, v.phi, v.theta, name === 'overview' ? 1600 : 1250);
  }

  function updateCameraOcclusion(dt) {
    if (qualityTier === 'low') return;
    const groups = (window.CampusWorld && CampusWorld.state) ? null : null;
  }
  function updateCamera(dt) {
    if (state.cameraExternal) return;
    if (fly.active) {
      fly.t += dt / fly.dur;
      let t = clamp(fly.t, 0, 1);
      t = smooth(t);
      cam.target.lerpVectors(fly.from.target, fly.to.target, t);
      cam.radius = lerp(fly.from.radius, fly.to.radius, t);
      cam.phi = lerp(fly.from.phi, fly.to.phi, t);
      cam.theta = lerp(fly.from.theta, fly.to.theta, t);
      if (fly.t >= 1) {
        fly.active = false;
        desired.target.copy(cam.target);
        desired.radius = cam.radius;
        desired.phi = cam.phi;
        desired.theta = cam.theta;
      }
    } else {
      const k = 1 - Math.exp(-dt * 13);
      cam.target.lerp(desired.target, k);
      cam.radius = lerp(cam.radius, desired.radius, k);
      cam.phi = lerp(cam.phi, desired.phi, k);
      cam.theta = lerp(cam.theta, desired.theta, k);
    }
    const sinPhi = Math.sin(cam.phi);
    camera.position.set(
      cam.target.x + cam.radius * sinPhi * Math.sin(cam.theta),
      cam.target.y + cam.radius * Math.cos(cam.phi),
      cam.target.z + cam.radius * sinPhi * Math.cos(cam.theta)
    );
    const ground = heightAt(camera.position.x, camera.position.z);
    if (camera.position.y < ground + 2.0) camera.position.y = ground + 2.0;
    camera.lookAt(cam.target);
  }

  const raycaster = new T.Raycaster();
  const pointerNDC = new T.Vector2(2, 2);
  const mousePixels = { x: 0, y: 0, active: false };
  let hoverCheckAt = 0, readoutAt = 0, needsReadout = false;

  function setNDC(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    mousePixels.x = e.clientX;
    mousePixels.y = e.clientY;
    mousePixels.active = true;
  }

  function buildingAtPointer() {
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    if (hits.length) return buildingById.get(hits[0].object.userData.buildingId);
    return null;
  }

  function selectPoi(info, focus) {
    state.selected = null;
    document.getElementById('info-kind').textContent = info.kind || 'Campus Landmark';
    document.getElementById('info-name').textContent = info.name;
    document.getElementById('info-height').textContent = info.height || '—';
    document.getElementById('info-floors').textContent = info.floors || '—';
    document.getElementById('info-area').textContent = info.area || '—';
    document.getElementById('info-elev').textContent = info.elev || '—';
    document.getElementById('info-note').textContent = info.note || '';
    document.getElementById('info').classList.remove('hidden');
    document.getElementById('info-fly').onclick = () => flyToPoint(info.cx, info.cz, info.radius || 160, 1.12, cam.theta, 1200);
    selectionRing.position.set(info.cx, heightAt(info.cx, info.cz) + 0.8, info.cz);
    selectionRing.scale.setScalar(26);
    selectionRing.visible = true;
    if (focus) flyToPoint(info.cx, info.cz, info.radius || 160, 1.12, cam.theta, 1200);
  }

  function selectBuilding(b, focus) {
    state.selected = b;
    const kindNames = {
      academic: 'Academic building', research: 'Research & teaching', library: 'Library',
      hostel: 'Student hostel', dining: 'Dining & cafe', admin: 'Administration',
      residential: 'Guest house / Residential', utility: 'Utility', shop: 'Shopping & amenities',
      hospital: 'Campus medical facility', sports: 'Sports & stadium',
      recreation: 'Student recreation', other: 'Campus building'
    };
    document.getElementById('info-kind').textContent = kindNames[b.kind] || 'Campus building';
    document.getElementById('info-name').textContent = b.name || 'Campus Structure';
    document.getElementById('info-height').textContent = (b.wallH + b.roofH).toFixed(1) + ' m';
    document.getElementById('info-floors').textContent = b.floors + (b.floors === 1 ? ' level' : ' levels');
    document.getElementById('info-area').textContent = Math.round(b.area).toLocaleString('en-IN') + ' m²';
    document.getElementById('info-elev').textContent = Math.round(b.base) + ' m';
    document.getElementById('info-note').textContent = b.note || (b.name
      ? '3D architectural reconstruction aligned to OpenStreetMap, terrain DEM and Esri imagery.'
      : 'Mapped campus structure inferred from satellite imagery and elevation.');
    document.getElementById('info').classList.remove('hidden');
    document.getElementById('info-fly').onclick = () => flyToBuilding(b, 1200);
    const r = Math.max(...b.footprint.map(p => Math.hypot(p[0] - b.cx, p[1] - b.cz)));
    selectionRing.position.set(b.cx, heightAt(b.cx, b.cz) + 0.8, b.cz);
    selectionRing.scale.setScalar(Math.max(8, r * 1.08));
    selectionRing.visible = true;
    if (focus) flyToBuilding(b, 1200);
  }

  function deselect() {
    state.selected = null;
    document.getElementById('info').classList.add('hidden');
    selectionRing.visible = false;
  }

  function updateSelection(t) {
    if (!selectionRing.visible) return;
    selectionRing.material.opacity = 0.45 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3.1));
    const b = state.selected;
    if (b) {
      const r = Math.max(...b.footprint.map(p => Math.hypot(p[0] - b.cx, p[1] - b.cz)));
      selectionRing.scale.setScalar(Math.max(8, r * 1.08) * (1 + 0.012 * Math.sin(t * 2.2)));
    }
  }

  const drag = { pointers: new Map(), mode: 'none', lastX: 0, lastY: 0, downX: 0, downY: 0, moved: 0, downAt: 0, pinchDist: 0, pinchMidX: 0, pinchMidY: 0 };

  function cancelFly() {
    if (!fly.active) return;
    fly.active = false;
    desired.target.copy(cam.target);
    desired.radius = cam.radius;
    desired.phi = cam.phi;
    desired.theta = cam.theta;
  }

  function panBy(dx, dy) {
    if (state.cameraExternal) return;
    cancelFly();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const fwd = new T.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const k = desired.radius * 0.00165;
    desired.target.addScaledVector(right, -dx * k);
    desired.target.addScaledVector(fwd, dy * k);
    const hx = GW / 2 - 60, hz = GH / 2 - 60;
    desired.target.x = clamp(desired.target.x, -hx, hx);
    desired.target.z = clamp(desired.target.z, -hz, hz);
    desired.target.y = heightAt(desired.target.x, desired.target.z) + 12;
  }

  function rotateBy(dx, dy) {
    if (state.cameraExternal) return;
    cancelFly();
    desired.theta -= dx * 0.0042;
    desired.phi = clamp(desired.phi - dy * 0.0042, 0.14, 1.52);
  }

  function zoomBy(delta) {
    if (state.cameraExternal) return;
    cancelFly();
    desired.radius = clamp(desired.radius * Math.exp(delta * 0.00115), 18, 2600);
  }

  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', e => {
    if (state.cameraExternal) return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    renderer.domElement.setPointerCapture(e.pointerId);
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setNDC(e);
    if (drag.pointers.size === 1) {
      drag.mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate';
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      drag.downX = e.clientX; drag.downY = e.clientY;
      drag.moved = 0; drag.downAt = now();
    } else if (drag.pointers.size === 2) {
      const pts = [...drag.pointers.values()];
      drag.mode = 'pinch';
      drag.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      drag.pinchMidX = (pts[0].x + pts[1].x) / 2;
      drag.pinchMidY = (pts[0].y + pts[1].y) / 2;
    }
    cancelFly();
  });

  renderer.domElement.addEventListener('pointermove', e => {
    if (state.cameraExternal) return;
    setNDC(e);
    needsReadout = true;
    if (!drag.pointers.has(e.pointerId)) {
      if (now() - hoverCheckAt > 90) {
        hoverCheckAt = now();
        const b = buildingAtPointer();
        renderer.domElement.style.cursor = b ? 'pointer' : 'grab';
      }
      return;
    }
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag.mode === 'pinch' && drag.pointers.size >= 2) {
      const pts = [...drag.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      if (drag.pinchDist > 0) zoomBy((drag.pinchDist - d) * 1.15);
      panBy(mx - drag.pinchMidX, my - drag.pinchMidY);
      drag.pinchDist = d; drag.pinchMidX = mx; drag.pinchMidY = my;
      return;
    }
    const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'pan') panBy(dx, dy); else rotateBy(dx, dy);
  });

  function endPointer(e) {
    if (!drag.pointers.has(e.pointerId)) return;
    drag.pointers.delete(e.pointerId);
    if (drag.pointers.size === 0) {
      const wasClick = drag.mode !== 'pinch' && drag.moved < 7 && now() - drag.downAt < 520;
      const b = wasClick ? buildingAtPointer() : null;
      if (b) selectBuilding(b, false);
      else if (wasClick && state.selected) deselect();
      drag.mode = 'none';
    } else if (drag.pointers.size === 1) {
      const p = [...drag.pointers.values()][0];
      drag.mode = 'rotate';
      drag.lastX = p.x; drag.lastY = p.y;
      drag.moved = 10;
    }
  }
  renderer.domElement.addEventListener('pointerup', endPointer);
  renderer.domElement.addEventListener('pointercancel', endPointer);
  renderer.domElement.addEventListener('wheel', e => { if (!state.cameraExternal) { e.preventDefault(); zoomBy(e.deltaY); } }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'Escape' && navOpen) { e.preventDefault(); closeNavmap(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleNavmap(); return; }
    if (state.cameraExternal) return; // Shuttle driving mode handles its own keys
    if (e.key === 'Escape') {
      closeModal();
      deselect();
    } else if (e.key === 'l' || e.key === 'L') cycleLabels();
    else if (e.key === 't' || e.key === 'T') toggleTrees();
    else if (e.key === 'b' || e.key === 'B') toggleBoundary();
    else if (e.key === 'z' || e.key === 'Z') cycleTod(-1);
    else if (e.key === 'x' || e.key === 'X') cycleTod(1);
    else if (e.key === 'r' || e.key === 'R') goView('overview');
  });

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => goView(btn.getAttribute('data-view')));
  });

  document.querySelectorAll('[data-menu-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-menu-tab');
      document.querySelectorAll('[data-menu-tab]').forEach(b => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const drive = document.getElementById('page-drive');
      const map = document.getElementById('page-map');
      if (drive) drive.classList.toggle('hidden', tab !== 'drive');
      if (map) map.classList.toggle('hidden', tab !== 'map');
    });
  });

  const labelsBtn = document.getElementById('layer-labels');
  function applyLabels() {
    document.body.classList.remove('labels-key', 'labels-all', 'labels-off');
    document.body.classList.add('labels-' + state.labels);
    if (labelsBtn) {
      labelsBtn.classList.toggle('on', state.labels !== 'off');
      labelsBtn.querySelector('em').textContent = state.labels === 'key' ? 'Key' : state.labels === 'all' ? 'All' : 'Off';
    }
  }
  function cycleLabels() {
    state.labels = state.labels === 'key' ? 'all' : state.labels === 'all' ? 'off' : 'key';
    applyLabels();
  }
  if (labelsBtn) labelsBtn.addEventListener('click', cycleLabels);

  const treesBtn = document.getElementById('layer-trees');
  function setTrees(on) {
    state.trees = on;
    treeGroup.visible = on;
    if (treesBtn) {
      treesBtn.classList.toggle('on', on);
      treesBtn.querySelector('em').textContent = on ? 'On' : 'Off';
    }
    renderer.shadowMap.needsUpdate = true;
  }
  function toggleTrees() { setTrees(!state.trees); }
  if (treesBtn) treesBtn.addEventListener('click', toggleTrees);

  const boundaryBtn = document.getElementById('layer-boundary');
  function toggleBoundary() {
    state.boundary = !state.boundary;
    if (boundaryLine) boundaryLine.visible = state.boundary;
    if (boundaryBtn) {
      boundaryBtn.classList.toggle('on', state.boundary);
      boundaryBtn.querySelector('em').textContent = state.boundary ? 'On' : 'Off';
    }
  }
  if (boundaryBtn) boundaryBtn.addEventListener('click', toggleBoundary);

  // Quality select + atmosphere (time of day) controls
  const TOD_ORDER = ['day', 'golden', 'mist', 'night'];
  const todSelect = document.getElementById('tod-select');
  function applyTod(key) {
    if (!/^(day|golden|mist|night)$/.test(key)) return;
    if (unrealFX) unrealFX.applyPreset(key);
    if (todSelect) todSelect.value = key;
  }
  function cycleTod(dir) {
    const cur = unrealFX ? unrealFX.getPreset() : (todSelect ? todSelect.value : 'day');
    let idx = TOD_ORDER.indexOf(cur);
    if (idx < 0) idx = 0;
    idx = (idx + dir + TOD_ORDER.length) % TOD_ORDER.length;
    applyTod(TOD_ORDER[idx]);
  }
  if (todSelect) todSelect.addEventListener('change', () => applyTod(todSelect.value));

  const qualitySelect = document.getElementById('quality-select');
  if (qualitySelect) {
    qualitySelect.value = qualityMode;
    qualitySelect.addEventListener('change', () => setQuality(qualitySelect.value));
  }

  const fpsBadge = document.createElement('div');
  fpsBadge.id = 'fps-badge';
  fpsBadge.textContent = 'FPS';
  document.body.appendChild(fpsBadge);
  let fpsVisible = false, fpsTimer = 0;
  const fpsBtn = document.getElementById('layer-fps');
  function setFpsVisible(v) {
    fpsVisible = v;
    fpsBadge.classList.toggle('show', v);
    if (fpsBtn) {
      fpsBtn.classList.toggle('on', v);
      const em = fpsBtn.querySelector('em');
      if (em) em.textContent = v ? 'On' : 'Off';
    }
  }
  if (fpsBtn) fpsBtn.addEventListener('click', () => setFpsVisible(!fpsVisible));

  // ================= 2D NAVIGATION MAP (fullscreen vector map) =================
  const navmap = document.getElementById('navmap');
  const navCanvas = document.getElementById('navmap-canvas');
  const navCtx = navCanvas ? navCanvas.getContext('2d') : null;
  const navClose = document.getElementById('navmap-close');
  const navChips = document.getElementById('navmap-chips');
  const navRouteName = document.getElementById('navmap-route-name');
  const navRouteCount = document.getElementById('navmap-route-count');
  const navStops = document.getElementById('navmap-stops');
  const navDrive = document.getElementById('navmap-drive');
  const minimapCard = document.getElementById('minimap-card');
  const navView = { cx: 0, cz: 0, scale: 0.3, dragging: false, dragMoved: false, lastX: 0, lastY: 0, selRoute: 'all', flashStop: -1, flashAt: 0, showTraffic: true, showNames: true };
  const navTrafficBtn = document.getElementById('nav-traffic');
  const navNamesBtn = document.getElementById('nav-names');
  const navCenterBtn = document.getElementById('nav-center-player');
  function navToggle(btn, on) {
    if (btn) btn.classList.toggle('on', on);
  }
  if (navTrafficBtn) navTrafficBtn.addEventListener('click', () => { navView.showTraffic = !navView.showTraffic; navToggle(navTrafficBtn, navView.showTraffic); });
  if (navNamesBtn) navNamesBtn.addEventListener('click', () => { navView.showNames = !navView.showNames; navToggle(navNamesBtn, navView.showNames); });
  let navOpen = false;
  let navRaf = 0, navLastDraw = 0, navFrame = 0;

  function navResize() {
    if (!navCanvas) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    navCanvas.width = Math.floor(window.innerWidth * dpr);
    navCanvas.height = Math.floor(window.innerHeight * dpr);
    navView.dpr = dpr;
  }

  function routesInfo() {
    try { return window.ShuttleGame && window.ShuttleGame.getRoutesInfo ? window.ShuttleGame.getRoutesInfo() : null; }
    catch (_) { return null; }
  }

  function navWorldToScreen(x, z) {
    const W = navCanvas.width, H = navCanvas.height;
    return {
      x: (x - navView.cx) * navView.scale + W / 2,
      y: (z - navView.cz) * navView.scale + H / 2
    };
  }
  function navScreenToWorld(sx, sy) {
    const W = navCanvas.width, H = navCanvas.height;
    return {
      x: (sx - W / 2) / navView.scale + navView.cx,
      z: (sy - H / 2) / navView.scale + navView.cz
    };
  }

  function navFitAll() {
    const pad = 1.06;
    navView.cx = 0; navView.cz = 20;
    navView.scale = Math.min(navCanvas.width / (GW * pad), navCanvas.height / (GH * pad));
  }
  function navCenterOn(x, z, scale) {
    navView.cx = x; navView.cz = z;
    if (scale) navView.scale = scale;
  }

  function navBuildChips() {
    const info = routesInfo();
    if (!info || !navChips) return;
    for (const chip of Array.from(navChips.querySelectorAll('[data-route]:not([data-route="all"])'))) chip.remove();
    for (const r of info.routes) {
      const b = document.createElement('button');
      b.className = 'nav-chip';
      b.type = 'button';
      b.dataset.route = String(r.index);
      b.innerHTML = '<i class="nav-chip-dot" style="background:' + r.color + '"></i>' + r.id;
      navChips.appendChild(b);
    }
    navChips.querySelectorAll('[data-route]').forEach(chip => {
      chip.addEventListener('click', () => navSelectRoute(chip.dataset.route));
    });
  }

  function navSelectRoute(sel) {
    navView.selRoute = sel;
    if (navChips) {
      navChips.querySelectorAll('[data-route]').forEach(chip => {
        chip.classList.toggle('on', chip.dataset.route === String(sel));
      });
    }
    const info = routesInfo();
    if (!info) return;
    if (sel === 'all') {
      navRouteName.textContent = 'All shuttle routes';
      navRouteCount.textContent = info.routes.length + ' routes · ' + info.routes.reduce((n, r) => n + r.stops.length, 0) + ' stops';
      if (navStops) {
        navStops.innerHTML = '<li class="navmap-hint-block">Pick a route chip above, or click any stop dot on the map to inspect it. The live bus is tracked with a gold arrow.</li>';
      }
      if (navDrive) navDrive.disabled = true;
      navDrive.textContent = 'Drive this route';
    } else {
      const r = info.routes[+sel];
      navRouteName.textContent = r.name;
      navRouteCount.textContent = r.stops.length + ' stops · loop';
      navRenderStopList(r);
      if (navDrive) navDrive.disabled = false;
      navDrive.textContent = 'Drive ' + r.id + ' now';
    }
  }

  function navRenderStopList(route) {
    if (!navStops) return;
    let html = '';
    route.stops.forEach((st, i) => {
      html += '<li><button class="navmap-stop" type="button" data-stop="' + i + '">' +
        '<span class="stop-idx" style="background:' + route.color + '">' + (i + 1) + '</span>' +
        '<span class="stop-name">' + st.name + '</span>' +
        '<span class="stop-dist" data-dist="' + i + '"></span>' +
        '</button></li>';
    });
    navStops.innerHTML = html;
    navStops.querySelectorAll('.navmap-stop').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.stop;
        const st = route.stops[i];
        navCenterOn(st.x, st.z, Math.max(navView.scale, 1.15));
        navView.flashStop = i;
        navView.flashAt = performance.now();
      });
    });
  }

  function navDrawRoute(r, active) {
    if (!r) return;
    navCtx.save();
    navCtx.globalAlpha = active ? 1.0 : 0.16;
    navCtx.strokeStyle = r.color;
    navCtx.lineWidth = active ? 4.5 : 3.0;
    navCtx.lineJoin = 'round';
    navCtx.lineCap = 'round';
    if (active) { navCtx.shadowColor = r.color; navCtx.shadowBlur = 10; }
    navCtx.beginPath();
    r.stops.forEach((st, i) => {
      const p = navWorldToScreen(st.x, st.z);
      if (i === 0) navCtx.moveTo(p.x, p.y); else navCtx.lineTo(p.x, p.y);
    });
    navCtx.closePath();
    navCtx.stroke();
    navCtx.restore();
  }

  function drawNavmap() {
    if (!navOpen || !navCtx) return;
    navRaf = requestAnimationFrame(drawNavmap);
    navFrame++;
    if (navFrame % 2) return; // ~30 fps is plenty for a 2D map
    const W = navCanvas.width, H = navCanvas.height;
    if (!W || !H) return;

    drawVectorMap(navCtx, {
      X: (x) => (x - navView.cx) * navView.scale + W / 2,
      Y: (z) => (z - navView.cz) * navView.scale + H / 2,
      pxPerM: navView.scale,
      w: W, h: H,
      detail: 'full'
    });

    const info = routesInfo();
    const sel = navView.selRoute;
    if (info) {
      // Inactive routes first, selected/active route on top
      for (const r of info.routes) {
        const active = sel === 'all' || +sel === r.index;
        navDrawRoute(r, active);
        if (sel === 'all') {
          navCtx.save();
          navCtx.globalAlpha = 0.9;
          for (let i = 0; i < r.stops.length; i++) {
            const p = navWorldToScreen(r.stops[i].x, r.stops[i].z);
            navCtx.beginPath();
            navCtx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
            navCtx.fillStyle = r.color;
            navCtx.fill();
            navCtx.lineWidth = 1.2;
            navCtx.strokeStyle = '#101713';
            navCtx.stroke();
          }
          navCtx.restore();
        }
      }
      if (sel !== 'all') {
        const r = info.routes[+sel];
        const tNow = performance.now();
        r.stops.forEach((st, i) => {
          const p = navWorldToScreen(st.x, st.z);
          const flash = (navView.flashStop === i && tNow - navView.flashAt < 1600);
          const rad = flash ? 9 + Math.sin(tNow * 0.012) * 3 : 7;
          navCtx.save();
          navCtx.beginPath();
          navCtx.arc(p.x, p.y, rad + 3.5, 0, Math.PI * 2);
          navCtx.fillStyle = 'rgba(0,0,0,0.45)';
          navCtx.fill();
          navCtx.beginPath();
          navCtx.arc(p.x, p.y, rad, 0, Math.PI * 2);
          navCtx.fillStyle = r.color;
          navCtx.fill();
          navCtx.lineWidth = 1.6;
          navCtx.strokeStyle = '#101713';
          navCtx.stroke();
          if (navView.scale > 0.42) {
            navCtx.fillStyle = '#0d130f';
            navCtx.font = '700 ' + Math.max(9, Math.floor(rad * 1.15)) + 'px system-ui, sans-serif';
            navCtx.textAlign = 'center';
            navCtx.textBaseline = 'middle';
            navCtx.fillText(String(i + 1), p.x, p.y + 0.5);
          }
          if (navView.scale > 0.9) {
            navCtx.fillStyle = 'rgba(244,239,227,0.92)';
            navCtx.font = '11px system-ui, sans-serif';
            navCtx.textAlign = 'left';
            navCtx.fillText(st.name, p.x + rad + 5, p.y + 1);
          }
          navCtx.restore();
        });
      }
    }

    // Live traffic + other multiplayer drivers
    const sgLive = window.ShuttleGame;
    if (navView.showTraffic && sgLive && sgLive.getTraffic) {
      for (const c of sgLive.getTraffic()) {
        const p = navWorldToScreen(c.x, c.z);
        if (p.x < -10 || p.y < -10 || p.x > W + 10 || p.y > H + 10) continue;
        navCtx.fillStyle = 'rgba(240,230,200,0.75)';
        navCtx.beginPath();
        navCtx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        navCtx.fill();
      }
    }
    if (sgLive && sgLive.getFuelStations) {
      for (const station of sgLive.getFuelStations()) {
        const p = navWorldToScreen(station.x, station.z);
        if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) continue;
        navCtx.save();
        navCtx.translate(p.x, p.y);
        navCtx.fillStyle = '#45d8e8';
        navCtx.strokeStyle = '#071417';
        navCtx.lineWidth = 1.8;
        navCtx.beginPath();
        navCtx.arc(0, 0, 7.2, 0, Math.PI * 2);
        navCtx.fill();
        navCtx.stroke();
        navCtx.fillStyle = '#062025';
        navCtx.font = '800 9px system-ui, sans-serif';
        navCtx.textAlign = 'center';
        navCtx.textBaseline = 'middle';
        navCtx.fillText('F', 0, 0.5);
        if (navView.scale > 0.55) {
          navCtx.font = '700 10px system-ui, sans-serif';
          navCtx.textAlign = 'left';
          navCtx.fillStyle = '#c6f6fa';
          navCtx.fillText(station.name, 11, 3);
        }
        navCtx.restore();
      }
    }
    if (sgLive && sgLive.getPeers) {
      const PLAYER_COLORS_JS = ['#2b7bf6', '#ff4d4d', '#2ce080', '#ffb020', '#a463ff', '#24d2ee', '#ff7442', '#ff5cb8'];
      for (const pmp of sgLive.getPeers()) {
        const p = navWorldToScreen(pmp.x, pmp.z);
        if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) continue;
        const color = PLAYER_COLORS_JS[(pmp.colorIdx | 0) % PLAYER_COLORS_JS.length];
        navCtx.save();
        navCtx.translate(p.x, p.y);
        // The marker points down for +Z; positive game yaw turns toward +X.
        navCtx.rotate(-(pmp.heading || 0));
        navCtx.beginPath();
        navCtx.moveTo(0, 8);
        navCtx.lineTo(5.6, -6);
        navCtx.lineTo(0, -3.2);
        navCtx.lineTo(-5.6, -6);
        navCtx.closePath();
        navCtx.fillStyle = color;
        navCtx.strokeStyle = 'rgba(0,0,0,0.7)';
        navCtx.lineWidth = 1.4;
        navCtx.fill();
        navCtx.stroke();
        navCtx.restore();
        if (navView.showNames) {
          navCtx.fillStyle = 'rgba(13,19,15,0.82)';
          const label = pmp.name || 'Driver';
          navCtx.font = '700 10px system-ui, sans-serif';
          const tw = navCtx.measureText(label).width;
          const lx = p.x + 10, ly = p.y - 8;
          navCtx.fillRect(lx - 3, ly - 8, tw + 6, 12);
          navCtx.fillStyle = color;
          navCtx.fillText(label, lx, ly);
        }
      }
    }

    // Live bus arrow (gold) + pulse ring
    const sg = window.ShuttleGame;
    const busState = sg && sg.getState ? sg.getState() : null;
    if (busState) {
      const p = navWorldToScreen(busState.x, busState.z);
      const tNow = performance.now() * 0.0042;
      navCtx.save();
      navCtx.translate(p.x, p.y);
      navCtx.beginPath();
      navCtx.arc(0, 0, 10 + Math.sin(tNow) * 3.4, 0, Math.PI * 2);
      navCtx.strokeStyle = 'rgba(255,198,110,0.5)';
      navCtx.lineWidth = 2.4;
      navCtx.stroke();
      navCtx.rotate(-busState.heading);
      navCtx.beginPath();
      navCtx.moveTo(0, 11);
      navCtx.lineTo(7.4, -7.6);
      navCtx.lineTo(0, -4.0);
      navCtx.lineTo(-7.4, -7.6);
      navCtx.closePath();
      navCtx.fillStyle = '#ffc66e';
      navCtx.strokeStyle = '#241503';
      navCtx.lineWidth = 1.6;
      navCtx.fill();
      navCtx.stroke();
      navCtx.restore();
    }

    // Live distance readouts in the stop list (twice a second)
    navFrame % 30 === 0 && navRefreshDistances();
  }

  function navRefreshDistances() {
    if (!navStops || !window.ShuttleGame || !window.ShuttleGame.getState) return;
    const busState = window.ShuttleGame.getState();
    const info = routesInfo();
    if (!info || navView.selRoute === 'all') return;
    const r = info.routes[+navView.selRoute];
    if (!r) return;
    navStops.querySelectorAll('[data-dist]').forEach(el => {
      const st = r.stops[+el.dataset.dist];
      if (st) el.textContent = Math.round(Math.hypot(busState.x - st.x, busState.z - st.z)) + ' m';
    });
  }

  function openNavmap() {
    if (!navmap || !navCtx) return;
    navOpen = true;
    navmap.classList.remove('hidden');
    navResize();
    navView.cx = 0; navView.cz = 30;
    if (window.ShuttleGame && window.ShuttleGame.getState && window.ShuttleGame.getState().active) {
      const bs = window.ShuttleGame.getState();
      navCenterOn(bs.x, bs.z, Math.max(navView.scale, 0.9));
    } else {
      navFitAll();
    }
    navBuildChips();
    navSelectRoute(navView.selRoute || 'all');
    cancelAnimationFrame(navRaf);
    navRaf = requestAnimationFrame(drawNavmap);
  }
  function closeNavmap() {
    navOpen = false;
    if (navmap) navmap.classList.add('hidden');
    cancelAnimationFrame(navRaf);
  }
  function toggleNavmap() { navOpen ? closeNavmap() : openNavmap(); }

  if (navClose) navClose.addEventListener('click', closeNavmap);
  if (navCenterBtn) navCenterBtn.addEventListener('click', () => {
    const game = window.ShuttleGame;
    const bus = game && game.getState ? game.getState() : null;
    if (bus) navCenterOn(bus.x, bus.z, Math.max(navView.scale, 0.9));
  });
  if (navmap) {
    navmap.addEventListener('pointerdown', (e) => {
      if (e.target !== navCanvas) return;
      navView.dragging = true;
      navView.dragMoved = false;
      navView.lastX = e.clientX; navView.lastY = e.clientY;
      navCanvas.setPointerCapture(e.pointerId);
    });
    navmap.addEventListener('pointermove', (e) => {
      if (!navView.dragging) return;
      const dpr = navView.dpr || 1;
      if (Math.abs(e.clientX - navView.lastX) + Math.abs(e.clientY - navView.lastY) > 2) navView.dragMoved = true;
      navView.cx -= (e.clientX - navView.lastX) * dpr / navView.scale;
      navView.cz -= (e.clientY - navView.lastY) * dpr / navView.scale;
      navView.lastX = e.clientX; navView.lastY = e.clientY;
    });
    const endDrag = (e) => {
      navView.dragging = false;
      try { navCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    navmap.addEventListener('pointerup', endDrag);
    navmap.addEventListener('pointercancel', endDrag);
    navCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const W = navCanvas.width, H = navCanvas.height;
      const before = navScreenToWorld(e.clientX * (navView.dpr || 1), e.clientY * (navView.dpr || 1));
      const zoom = Math.exp(-e.deltaY * 0.0016);
      navView.scale = clamp(navView.scale * zoom, 0.12, 6.5);
      const after = navScreenToWorld(e.clientX * (navView.dpr || 1), e.clientY * (navView.dpr || 1));
      navView.cx += before.x - after.x;
      navView.cz += before.z - after.z;
    }, { passive: false });
    navCanvas.addEventListener('click', (e) => {
      if (navView.dragMoved) { navView.dragMoved = false; return; }
      const info = routesInfo();
      if (!info) return;
      const dpr = navView.dpr || 1;
      const mx = e.clientX * dpr, my = e.clientY * dpr;
      const lists = navView.selRoute === 'all' ? info.routes : [info.routes[+navView.selRoute]];
      for (const r of lists) {
        for (let i = 0; i < r.stops.length; i++) {
          const p = navWorldToScreen(r.stops[i].x, r.stops[i].z);
          if (Math.hypot(p.x - mx, p.y - my) < 14) {
            navView.flashStop = i;
            navView.flashAt = performance.now();
            navSelectRoute(String(r.index));
            navCenterOn(r.stops[i].x, r.stops[i].z, Math.max(navView.scale, 1.15));
            if (navStops) {
              const btn = navStops.querySelector('[data-stop="' + i + '"]');
              if (btn) { btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 900); }
            }
            return;
          }
        }
      }
    });
  }
  if (navDrive) {
    navDrive.addEventListener('click', () => {
      const info = routesInfo();
      if (!info || navView.selRoute === 'all') return;
      const idx = +navView.selRoute;
      if (window.ShuttleGame) {
        if (window.ShuttleGame.selectRoute) window.ShuttleGame.selectRoute(idx);
        if (window.ShuttleGame.enterDriveMode) window.ShuttleGame.enterDriveMode('route');
      }
      closeNavmap();
    });
  }
  const openNavmapBtn = document.getElementById('open-navmap');
  if (openNavmapBtn) openNavmapBtn.addEventListener('click', openNavmap);

  if (minimapCard) {
    minimapCard.style.cursor = 'pointer';
    minimapCard.title = 'Double-click for 2D navigation map';
    minimapCard.addEventListener('dblclick', openNavmap);
  }
  window.addEventListener('resize', () => { if (navOpen) navResize(); });

  document.getElementById('info-close').addEventListener('click', deselect);
  document.getElementById('info-dismiss').addEventListener('click', deselect);

  const modal = document.getElementById('modal');
  function openModal() { modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); }
  document.getElementById('credits-open').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  const projTmp = new T.Vector3();
  function updateLabels() {
    if (state.labels === 'off') return;
    const w = window.innerWidth, h = window.innerHeight;
    const placedBoxes = [];
    // Sort closest/major first so key landmarks always win screen space cleanly without messy overlap!
    const ordered = labelEntries.map(e => ({ e, dist: camera.position.distanceTo(e.v) }))
      .sort((a, b) => (Number(b.e.l.major) - Number(a.e.l.major)) || (a.dist - b.dist));

    for (const { e: entry, dist } of ordered) {
      if (state.labels === 'key' && !entry.l.major) { entry.el.classList.add('occluded'); continue; }
      projTmp.copy(entry.v).project(camera);
      if (projTmp.z > 1 || projTmp.z < -1) { entry.el.classList.add('occluded'); continue; }
      const sx = (projTmp.x * 0.5 + 0.5) * w;
      const sy = (-projTmp.y * 0.5 + 0.5) * h;
      if (sx < 60 || sx > w - 60 || sy < 40 || sy > h - 50) { entry.el.classList.add('occluded'); continue; }
      if (!state.cameraExternal && ((sx < 440 && sy < 145) || (sx > w - 268 && sy < 520) || (sx < 245 && sy > h - 275))) {
        entry.el.classList.add('occluded'); continue;
      }
      const limit = entry.l.major ? 3400 : 1400;
      if (dist > limit) { entry.el.classList.add('occluded'); continue; }

      // Screen-space collision check
      const halfW = Math.min(92, entry.l.text.length * 3.5 + 14), boxH = 22;
      let collided = false;
      for (let i = 0; i < placedBoxes.length; i++) {
        const pb = placedBoxes[i];
        if (Math.abs(sx - pb.x) < (halfW + pb.hw) && Math.abs(sy - pb.y) < boxH) {
          collided = true; break;
        }
      }
      if (collided) { entry.el.classList.add('occluded'); continue; }
      placedBoxes.push({ x: sx, y: sy, hw: halfW });

      entry.el.classList.remove('occluded');
      entry.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
      entry.el.style.opacity = String(clamp(1.28 - dist / limit, 0.35, 1));
    }
  }

  const readoutEl = document.getElementById('readout-text');
  function updateReadout() {
    if (state.cameraExternal || !needsReadout || now() - readoutAt < 95) return;
    readoutAt = now();
    needsReadout = false;
    if (!mousePixels.active) return;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(terrain, false);
    if (hits.length) {
      const p = hits[0].point;
      const ll = localToLonLat(p.x, p.z);
      readoutEl.textContent = `${Math.abs(ll.lat).toFixed(5)}° N · ${Math.abs(ll.lon).toFixed(5)}° E · ${Math.round(p.y)} m`;
    }
  }

  const scaleLine = document.getElementById('scale-line');
  const scaleText = document.getElementById('scale-text');
  function updateScale() {
    if (!scaleLine || !scaleText) return;
    const height = renderer.domElement.clientHeight || window.innerHeight;
    const refDist = state.cameraExternal ? 35 : cam.radius;
    const perPx = 2 * refDist * Math.tan(camera.fov * DEG / 2) / height;
    const options = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    let choice = options[0];
    for (const o of options) {
      const px = o / perPx;
      if (px <= 128) choice = o;
      if (px >= 54 && px <= 128) { choice = o; break; }
    }
    const px = choice / perPx;
    scaleLine.style.width = clamp(px, 30, 160) + 'px';
    scaleText.textContent = choice >= 1000 ? (choice / 1000) + ' km' : choice + ' m';
  }

  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const MINI_W = mini.width, MINI_H = mini.height;
  const miniBase = document.createElement('canvas');
  miniBase.width = MINI_W; miniBase.height = MINI_H;
  const mbctx = miniBase.getContext('2d');

  function miniX(x) { return (x + GW / 2) / GW * MINI_W; }
  function miniY(z) { return (z + GH / 2) / GH * MINI_H; }

  // Shared procedural 2D vector renderer (dark nav style) used by the minimap and the fullscreen navigation map
  // xform: { X, Y, pxPerM, w, h, detail: 'full' | 'mini' }
  function drawVectorMap(ctx, xform) {
    const { X, Y, pxPerM, w, h, detail } = xform;
    const full = detail === 'full';
    const ringPath = (poly) => {
      ctx.beginPath();
      poly.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    };

    // Background: baked land tint + subtle vignette glow
    ctx.fillStyle = '#0e1a13';
    ctx.fillRect(0, 0, w, h);
    if (full) {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(46,74,56,0.35)');
      g.addColorStop(1, 'rgba(8,14,11,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Sports pitches & parking
    ctx.fillStyle = 'rgba(58,102,62,0.5)';
    for (const p of D.pitches) { ringPath(p.polygon); ctx.fill(); }
    ctx.fillStyle = 'rgba(148,156,168,0.34)';
    for (const p of D.parking) { ringPath(p.polygon); ctx.fill(); }

    // Water bodies (check-dam lake etc.)
    for (const wat of D.water) {
      ringPath(wat.polygon);
      ctx.fillStyle = '#123b44';
      ctx.fill();
      ctx.strokeStyle = '#2f7d8c';
      ctx.lineWidth = Math.max(1, 1.4 * pxPerM);
      ctx.stroke();
    }

    // Campus boundary (planned)
    if (D.boundary && D.boundary.length > 2) {
      ringPath(D.boundary);
      ctx.strokeStyle = 'rgba(238,192,112,0.6)';
      ctx.lineWidth = Math.max(1.2, 1.6 * pxPerM);
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Buildings
    ctx.fillStyle = '#33413a';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (const b of D.buildings) {
      ringPath(b.footprint);
      ctx.fill();
      if (full && pxPerM > 0.5) ctx.stroke();
    }

    // Roads: minor/service first (dark casing + faint infill), then driveable mains on top
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const traceRoad = (r) => {
      ctx.beginPath();
      r.pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    };
    for (const r of D.roads) {
      if (!r.pts || r.pts.length < 2 || r.isDriveable) continue;
      traceRoad(r);
      ctx.strokeStyle = '#22302a';
      ctx.lineWidth = Math.max(1, (r.width || 2) * pxPerM);
      ctx.stroke();
    }
    for (const r of D.roads) {
      if (!r.pts || r.pts.length < 2 || !r.isDriveable) continue;
      const wpx = Math.max(1.4, (r.width || 5) * pxPerM);
      traceRoad(r);
      ctx.strokeStyle = '#0a120d';
      ctx.lineWidth = wpx + Math.max(1.2, 2.4 * pxPerM);
      ctx.stroke();
      traceRoad(r);
      ctx.strokeStyle = (r.width || 5) >= 8.0 ? '#8fd3e8' : '#b9cdb0';
      ctx.lineWidth = wpx;
      ctx.stroke();
      // Subtle centre dashes on main campus spine & highway when zoomed in
      if (full && pxPerM > 0.9 && (r.width || 5) >= 5.0) {
        traceRoad(r);
        ctx.strokeStyle = 'rgba(20,26,21,0.75)';
        ctx.lineWidth = Math.max(1, wpx * 0.09);
        ctx.setLineDash([7 * pxPerM * 2, 9 * pxPerM * 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Main Gate marker
    const gx = X(185.47), gy = Y(548.84);
    ctx.save();
    ctx.translate(gx, gy);
    ctx.fillStyle = '#ffc66e';
    ctx.strokeStyle = '#201503';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 7 : 3.1;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function buildMinimapBase() {
    const pxPerM = MINI_W / GW;
    mbctx.clearRect(0, 0, MINI_W, MINI_H);
    drawVectorMap(mbctx, { X: miniX, Y: miniY, pxPerM, w: MINI_W, h: MINI_H, detail: 'mini' });
  }

  const minimapHooks = [];
  let miniAt = 0;
  function updateMinimap() {
    if (now() - miniAt < 80) return;
    miniAt = now();
    mctx.clearRect(0, 0, MINI_W, MINI_H);
    mctx.drawImage(miniBase, 0, 0);

    for (const fn of minimapHooks) fn(mctx, miniX, miniY);

    if (!state.cameraExternal) {
      const tx = miniX(cam.target.x), ty = miniY(cam.target.z);
      const cx = miniX(camera.position.x), cy = miniY(camera.position.z);
      mctx.strokeStyle = 'rgba(255,255,255,0.68)';
      mctx.lineWidth = 1.1;
      mctx.beginPath(); mctx.moveTo(tx, ty); mctx.lineTo(cx, cy); mctx.stroke();
      mctx.fillStyle = 'rgba(255,255,255,0.9)';
      mctx.beginPath(); mctx.arc(cx, cy, 2.2, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = 'rgba(255,205,120,0.95)';
      mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(tx, ty, 4.2, 0, Math.PI * 2); mctx.stroke();
    }
  }

  let miniDrag = false;
  function miniSet(e) {
    if (state.cameraExternal) return;
    const r = mini.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    const x = px * GW - GW / 2, z = py * GH - GH / 2;
    cancelFly();
    desired.target.set(clamp(x, -GW / 2 + 50, GW / 2 - 50), heightAt(x, z) + 12, clamp(z, -GH / 2 + 50, GH / 2 - 50));
  }
  mini.addEventListener('pointerdown', e => { miniDrag = true; mini.setPointerCapture(e.pointerId); miniSet(e); });
  mini.addEventListener('pointermove', e => { if (miniDrag) miniSet(e); });
  mini.addEventListener('pointerup', e => { miniDrag = false; try { mini.releasePointerCapture(e.pointerId); } catch (err) {} });
  mini.addEventListener('pointercancel', () => { miniDrag = false; });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(effectivePixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (unrealFX) unrealFX.resize();
    updateScale();
  });

  const frameListeners = [];
  const clock = new T.Clock();
  let arcadeOccluders = null;
  const arcadeFadeCenter = new T.Vector3(255, 150, 454);
  const shadowFocus = new T.Vector3();

  let lastFrameAt = 0;
  function animate(frameAt) {
    requestAnimationFrame(animate);
    // Cap high-refresh displays at 60 fps. A single, even frame cadence keeps
    // input and the vehicle loop predictable while reducing laptop GPU load.
    if (frameAt && frameAt - lastFrameAt < 16.5) return;
    if (frameAt) lastFrameAt = frameAt;
    const frameDt = clock.getDelta();
    const dt = Math.min(frameDt, 0.05);
    const elapsed = clock.elapsedTime;

    for (let i = 0; i < frameListeners.length; i++) frameListeners[i](dt, elapsed);

    if (!navOpen) updateCamera(dt);
    // Adaptive resolution: shed render scale when frames get expensive (auto mode only)
    perf.ema = perf.ema * 0.88 + frameDt * 0.12;
    if (fpsVisible) {
      fpsTimer += dt;
      if (fpsTimer > 0.5) {
        fpsTimer = 0;
        fpsBadge.textContent = Math.round(1 / Math.max(perf.ema, 1e-4)) + ' FPS · ' + effectivePixelRatio().toFixed(2) + 'x';
      }
    }
    if (!navOpen && qualityMode === 'auto' && elapsed - perf.lastAdjust > 1.25) {
      perf.lastAdjust = elapsed;
      const fps = 1 / Math.max(perf.ema, 1e-4);
      if (fps < 48 && perf.scale > 0.45) {
        perf.scale = Math.max(0.45, perf.scale - 0.12);
        renderer.setPixelRatio(effectivePixelRatio());
      } else if (fps > 58 && perf.scale < 1) {
        perf.scale = Math.min(1, perf.scale + 0.04);
        renderer.setPixelRatio(effectivePixelRatio());
      }
    }
    // Fade arcade (Entrance Bus Arcade / "second gate") when the camera is near it,
    // restore opacity once the camera moves away (occluder meshes cached, no per-frame scene walk)
    if (arcadeOccluders === null) {
      arcadeOccluders = [];
      const g = scene.getObjectByName('entranceBusArcade');
      if (g) g.traverse(m => {
        if (m.isMesh && m.material && m.material.userData && m.material.userData.occluder) arcadeOccluders.push(m);
      });
    }
    if (arcadeOccluders.length) {
      const d = camera.position.distanceTo(arcadeFadeCenter);
      const fade = T.MathUtils.clamp(1 - d / 180, 0, 1);
      const target = d < 180 ? 0.12 + 0.15 * fade : 1.0;
      for (let i = 0; i < arcadeOccluders.length; i++) arcadeOccluders[i].material.opacity = target;
    }
    if (!navOpen) {
      updateLabels();
      updateReadout();
      updateSelection(elapsed);
    }

    if (waterMats.length) {
      waterNormalTex.offset.x = (elapsed * 0.018) % 1;
      waterNormalTex.offset.y = (elapsed * 0.012) % 1;
    }

    if (!navOpen) {
      updateMinimap();
      updateScale();
    }

    if (navOpen) {
      // The live vector map tracks the game state; rendering the hidden 3D
      // canvas at the same time wastes fill rate and causes avoidable heat.
      return;
    } else if (state.cameraExternal && window.ShuttleGame && window.ShuttleGame.getFocusPosition) {
      shadowFocus.copy(window.ShuttleGame.getFocusPosition());
      if (unrealFX) unrealFX.render(elapsed, shadowFocus, 155);
      else renderer.render(scene, camera);
    } else {
      shadowFocus.copy(cam.target);
      if (unrealFX) unrealFX.render(elapsed, shadowFocus, cam.radius);
      else renderer.render(scene, camera);
    }
  }

  // Fallback vegetation init if satellite image decodes slightly later
  setTimeout(() => { if (!forestBuilt) populateRealisticVegetation(null); }, 1800);

  applyLabels();
  updateCamera(0);
  animate();

  // Clean public CampusWorld SDK for Shuttle Bus Game & external extensions
  const api = {
    cam, desired, fly, camera, renderer, scene, sunLight, terrain, roadGroup, waterMats,
    goView, VIEWS, D, heightAt, roadInfoAt, pointInRing, distToRingEdge,
    buildingColliders, solidObstacles, isInsideOtherDriveableRoad, nightMaterials, unrealFX, state,
    onFrame(fn) { frameListeners.push(fn); },
    onMinimapDraw(fn) { minimapHooks.push(fn); },
    setExternalCamera(active) {
      state.cameraExternal = !!active;
      if (!active) {
        camera.fov = 45;
        camera.updateProjectionMatrix();
        desired.target.y = heightAt(desired.target.x, desired.target.z) + 12;
      }
    },
    getSurfaceHeight(x, z) {
      const th = heightAt(x, z);
      const ri = roadInfoAt(x, z);
      if (ri) {
        const roadH = Math.max(ri.y, th + ROAD_SURFACE_LIFT) + 0.045;
        if (ri.dist <= ri.halfWidth) return roadH;
        if (ri.dist <= ri.halfWidth + 0.85) {
          const t = smooth((ri.dist - ri.halfWidth) / 0.85);
          return lerp(roadH, th, t);
        }
      }
      return th;
    },
    jumpTo(name) {
      const v = VIEWS[name];
      if (!v) return;
      const px = v.x != null ? v.x : lonLatToLocal(v.lon, v.lat).x;
      const pz = v.z != null ? v.z : lonLatToLocal(v.lon, v.lat).z;
      fly.active = false;
      cam.target.set(px, heightAt(px, pz) + 12, pz);
      cam.radius = v.radius; cam.phi = v.phi; cam.theta = v.theta;
      desired.target.copy(cam.target); desired.radius = cam.radius; desired.phi = cam.phi; desired.theta = cam.theta;
      updateCamera(0);
      camera.updateMatrixWorld(true);
      updateLabels();
    }
  };
  window.__dbg = api;
  window.CampusWorld = api;
})();
