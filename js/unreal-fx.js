/* Unreal Engine 5 style Atmospheric Sky, Volumetric Clouds, Procedural HDRI IBL,
 * Dynamic Time-of-Day & Multi-Pass Post-Processing Pipeline for IISER Campus 3D */
(function () {
  'use strict';

  const T = window.THREE;
  if (!T) return;

  const PRESETS = {
    day: {
      label: 'Daylight',
      sunElev: 43,
      sunAzim: 128,
      sunColor: '#fff4df',
      sunIntensity: 2.35,
      hemiSky: '#a8d0f8',
      hemiGround: '#4a5a3c',
      hemiIntensity: 0.72,
      ambColor: '#cde0f5',
      ambIntensity: 0.12,
      zenith: '#174a8c',
      horizon: '#b8dcf0',
      hazeColor: '#c9e0ec',
      fogDensity: 0.00018,
      valleyMist: 0.26,
      cloudCoverage: 0.46,
      cloudLight: '#ffffff',
      cloudShadow: '#6d85a3',
      exposure: 1.02,
      bloomStrength: 0.28,
      bloomThreshold: 0.86,
      envIntensity: 0.92,
      nightFactor: 0.0
    },
    golden: {
      label: 'Golden Hour',
      sunElev: 15.5,
      sunAzim: 248,
      sunColor: '#ffb86c',
      sunIntensity: 2.65,
      hemiSky: '#8faad6',
      hemiGround: '#4e4132',
      hemiIntensity: 0.62,
      ambColor: '#ffd2a6',
      ambIntensity: 0.10,
      zenith: '#1a3566',
      horizon: '#f5b87a',
      hazeColor: '#eab88b',
      fogDensity: 0.00026,
      valleyMist: 0.42,
      cloudCoverage: 0.50,
      cloudLight: '#ffe0b5',
      cloudShadow: '#5e5875',
      exposure: 1.04,
      bloomStrength: 0.40,
      bloomThreshold: 0.78,
      envIntensity: 0.95,
      nightFactor: 0.15
    },
    mist: {
      label: 'Ghats Mist',
      sunElev: 28,
      sunAzim: 105,
      sunColor: '#ffeFD8',
      sunIntensity: 1.55,
      hemiSky: '#b8cdd9',
      hemiGround: '#3e523a',
      hemiIntensity: 0.85,
      ambColor: '#d2e2e8',
      ambIntensity: 0.18,
      zenith: '#4b7394',
      horizon: '#d8e6ea',
      hazeColor: '#d3e3e6',
      fogDensity: 0.00046,
      valleyMist: 0.72,
      cloudCoverage: 0.68,
      cloudLight: '#f4f8fa',
      cloudShadow: '#7b8d99',
      exposure: 0.98,
      bloomStrength: 0.30,
      bloomThreshold: 0.84,
      envIntensity: 0.85,
      nightFactor: 0.0
    },
    night: {
      label: 'Night Shift',
      sunElev: 22,
      sunAzim: 140,
      sunColor: '#6f93c8',
      sunIntensity: 0.36,
      hemiSky: '#1c2b47',
      hemiGround: '#0d1412',
      hemiIntensity: 0.42,
      ambColor: '#1b2840',
      ambIntensity: 0.18,
      zenith: '#050b18',
      horizon: '#162742',
      hazeColor: '#111e33',
      fogDensity: 0.00028,
      valleyMist: 0.32,
      cloudCoverage: 0.38,
      cloudLight: '#2a3c5c',
      cloudShadow: '#0b1322',
      exposure: 1.12,
      bloomStrength: 0.62,
      bloomThreshold: 0.58,
      envIntensity: 0.35,
      nightFactor: 1.0
    }
  };

  function createSkyDome(sharedUniforms) {
    const geo = new T.SphereGeometry(8800, 64, 36);
    const mat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uSunDir: sharedUniforms.uSunDir,
        uTime: sharedUniforms.uTime,
        uZenith: { value: new T.Color('#174a8c') },
        uHorizon: { value: new T.Color('#b8dcf0') },
        uSunColor: { value: new T.Color('#fff4df') },
        uCloudLight: { value: new T.Color('#ffffff') },
        uCloudShadow: { value: new T.Color('#6d85a3') },
        uCloudCoverage: { value: 0.46 },
        uNight: sharedUniforms.uNight
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = position;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vWorldDir;
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uCloudLight;
        uniform vec3 uCloudShadow;
        uniform float uCloudCoverage;
        uniform float uNight;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = rot * p * 2.04 + vec2(17.1, 31.7);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          vec3 sunD = normalize(uSunDir);
          float y = clamp(dir.y, -0.25, 1.0);

          // Rayleigh + Mie inspired sky gradient
          float zenithT = pow(max(y, 0.0), 0.52);
          vec3 sky = mix(uHorizon, uZenith, zenithT);

          // Subtle Western Ghats distant mountain silhouette & atmospheric bounce below horizon
          if (y < 0.02) {
            vec3 groundBounce = uHorizon * 0.68;
            sky = mix(groundBounce, sky, smoothstep(-0.08, 0.02, y));
          }

          float mu = max(dot(dir, sunD), 0.0);
          // Mie solar scatter & warm horizon glow
          float mie = pow(mu, 6.0) * 0.32 + pow(mu, 48.0) * 0.45;
          float sunDisc = smoothstep(0.99935, 0.99982, dot(dir, sunD));
          sky += uSunColor * mie * (1.0 - uNight * 0.78);
          sky += uSunColor * sunDisc * (2.6 - uNight * 2.1);

          // Subtle stars at night
          if (uNight > 0.25 && y > 0.04) {
            vec2 starUv = dir.xz / (dir.y + 0.35) * 190.0;
            float st = pow(hash(floor(starUv)), 26.0);
            float twinkle = 0.65 + 0.35 * sin(uTime * 2.3 + st * 90.0);
            sky += vec3(0.82, 0.90, 1.0) * st * twinkle * uNight * smoothstep(0.04, 0.28, y) * 0.9;
          }

          // Volumetric-style cumulus clouds on curved atmospheric shell
          if (y > 0.012) {
            float planeDist = 1.0 / (y + 0.11);
            vec2 wind = vec2(uTime * 0.0055, uTime * 0.0022);
            vec2 cuv = dir.xz * planeDist * 1.15 + wind;

            float base = fbm(cuv);
            float detail = fbm(cuv * 2.8 - wind * 1.6);
            float c = base * 0.76 + detail * 0.24;

            float thresh = 1.0 - uCloudCoverage;
            float density = smoothstep(thresh - 0.08, thresh + 0.28, c);
            // Directional cloud self-shadowing along sun vector
            vec2 sunStep = sunD.xz * 0.11;
            float cSun = fbm(cuv + sunStep) * 0.76 + fbm((cuv + sunStep) * 2.8 - wind * 1.6) * 0.24;
            float lit = clamp(1.0 - max(0.0, cSun - c) * 3.4, 0.18, 1.0);
            // Silver lining forward scatter
            float silver = pow(mu, 10.0) * (1.0 - density * 0.55) * 0.55;

            vec3 cloudCol = mix(uCloudShadow, uCloudLight, lit);
            cloudCol += uSunColor * silver * (1.0 - uNight * 0.75);

            // Fade clouds smoothly into distant horizon haze
            float horizonFade = smoothstep(0.015, 0.18, y);
            sky = mix(sky, cloudCol, density * horizonFade * 0.92);
          }

          // Soft filmic compression on sky dome so it blends naturally with scene
          sky = sky / (vec3(1.0) + sky * 0.22);
          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.name = 'unrealSkyDome';
    mesh.renderOrder = -25;
    mesh.frustumCulled = false;
    return mesh;
  }

  function buildProceduralEnvMap(renderer, pmrem, preset, sunDir) {
    const w = 256, h = 128;
    const data = new Uint8Array(w * h * 4);
    const zenith = new T.Color(preset.zenith);
    const horizon = new T.Color(preset.horizon);
    const sunCol = new T.Color(preset.sunColor);
    const groundDark = new T.Color('#1d2a1c').lerp(new T.Color('#090d12'), preset.nightFactor);
    const groundMid = new T.Color('#3c4d33').lerp(new T.Color('#121820'), preset.nightFactor);
    const dir = new T.Vector3();
    const tmp = new T.Color();

    for (let y = 0; y < h; y++) {
      const v = 1.0 - (y + 0.5) / h;
      const theta = (1.0 - v) * Math.PI; // 0 at top, PI at bottom
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const phi = u * Math.PI * 2.0;
        dir.set(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi)).normalize();

        if (dir.y >= 0) {
          tmp.copy(horizon).lerp(zenith, Math.pow(dir.y, 0.55));
          const mu = Math.max(0, dir.dot(sunDir));
          const glow = Math.pow(mu, 8) * 0.45 + Math.pow(mu, 96) * 1.45;
          tmp.r += sunCol.r * glow * (1 - preset.nightFactor * 0.8);
          tmp.g += sunCol.g * glow * (1 - preset.nightFactor * 0.8);
          tmp.b += sunCol.b * glow * (1 - preset.nightFactor * 0.8);
        } else {
          tmp.copy(groundMid).lerp(groundDark, Math.min(1, -dir.y * 2.2));
        }

        const idx = (y * w + x) * 4;
        data[idx] = Math.min(255, Math.round(Math.pow(Math.min(1.3, tmp.r), 1 / 2.2) * 215));
        data[idx + 1] = Math.min(255, Math.round(Math.pow(Math.min(1.3, tmp.g), 1 / 2.2) * 215));
        data[idx + 2] = Math.min(255, Math.round(Math.pow(Math.min(1.3, tmp.b), 1 / 2.2) * 215));
        data[idx + 3] = 255;
      }
    }

    const tex = new T.DataTexture(data, w, h, T.RGBAFormat, T.UnsignedByteType);
    tex.encoding = T.sRGBEncoding;
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const envRT = pmrem.fromEquirectangular(tex);
    tex.dispose();
    return envRT;
  }

  function createPostPipeline(renderer, scene, camera, sharedUniforms) {
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const canRenderHalfFloat = isWebGL2
      ? (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'))
      : renderer.extensions.has('EXT_color_buffer_half_float');
    const extDepth = isWebGL2 || renderer.extensions.has('WEBGL_depth_texture');
    if (!extDepth) {
      return null; // graceful fallback to direct rendering
    }

    const rtType = canRenderHalfFloat ? T.HalfFloatType : T.UnsignedByteType;
    const size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    const W = Math.max(2, size.x), H = Math.max(2, size.y);

    const depthTexture = new T.DepthTexture(W, H);
    depthTexture.type = isWebGL2 ? T.UnsignedIntType : T.UnsignedShortType;
    depthTexture.minFilter = T.NearestFilter;
    depthTexture.magFilter = T.NearestFilter;

    const rtScene = new T.WebGLRenderTarget(W, H, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      format: T.RGBAFormat,
      type: rtType,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: depthTexture
    });

    const bw = Math.max(2, Math.floor(W / 3)), bh = Math.max(2, Math.floor(H / 3));
    const rtBloomA = new T.WebGLRenderTarget(bw, bh, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      format: T.RGBAFormat,
      type: rtType,
      depthBuffer: false,
      stencilBuffer: false
    });
    const rtBloomB = new T.WebGLRenderTarget(bw, bh, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      format: T.RGBAFormat,
      type: rtType,
      depthBuffer: false,
      stencilBuffer: false
    });

    const quadScene = new T.Scene();
    const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new T.PlaneGeometry(2, 2);

    const commonVS = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    // Bright-pass + 9-tap downsample for Unreal Bloom
    const matBright = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: rtScene.texture },
        uTexel: { value: new T.Vector2(1 / W, 1 / H) },
        uThreshold: { value: 0.86 }
      },
      vertexShader: commonVS,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uThreshold;

        vec3 extractBright(vec3 c) {
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float knee = uThreshold * 0.45;
          float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
          soft = (soft * soft) / (4.0 * knee + 0.0001);
          float contrib = max(soft, lum - uThreshold) / max(lum, 0.0001);
          return min(c * contrib, vec3(8.0));
        }

        void main() {
          vec2 d = uTexel * 1.5;
          vec3 s = extractBright(texture2D(tDiffuse, vUv).rgb) * 0.28;
          s += extractBright(texture2D(tDiffuse, vUv + vec2( d.x,  d.y)).rgb) * 0.18;
          s += extractBright(texture2D(tDiffuse, vUv + vec2(-d.x,  d.y)).rgb) * 0.18;
          s += extractBright(texture2D(tDiffuse, vUv + vec2( d.x, -d.y)).rgb) * 0.18;
          s += extractBright(texture2D(tDiffuse, vUv + vec2(-d.x, -d.y)).rgb) * 0.18;
          gl_FragColor = vec4(s, 1.0);
        }
      `
    });

    // Separable wide Gaussian blur for Bloom
    const matBlur = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new T.Vector2(1 / bw, 0) }
      },
      vertexShader: commonVS,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uDir;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
          c += texture2D(tDiffuse, vUv + uDir * 1.384615).rgb * 0.316216;
          c += texture2D(tDiffuse, vUv - uDir * 1.384615).rgb * 0.316216;
          c += texture2D(tDiffuse, vUv + uDir * 3.230769).rgb * 0.070270;
          c += texture2D(tDiffuse, vUv - uDir * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(c, 1.0);
        }
      `
    });

    // Final Unreal Engine Composite: SSAO + Valley Mist & Sun Scatter + Bloom + ACES + CAS + FXAA-lite
    const matComposite = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tScene: { value: rtScene.texture },
        tDepth: { value: depthTexture },
        tBloom: { value: rtBloomA.texture },
        uTexel: { value: new T.Vector2(1 / W, 1 / H) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uInvProj: { value: new T.Matrix4() },
        uInvView: { value: new T.Matrix4() },
        uCamPos: { value: new T.Vector3() },
        uSunDir: sharedUniforms.uSunDir,
        uSunColor: { value: new T.Color('#fff4df') },
        uHazeColor: { value: new T.Color('#c9e0ec') },
        uValleyMist: { value: 0.26 },
        uBloomStrength: { value: 0.28 },
        uExposure: { value: 1.02 },
        uAoStrength: { value: 0.42 },
        uNight: sharedUniforms.uNight
      },
      vertexShader: commonVS,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tScene;
        uniform sampler2D tDepth;
        uniform sampler2D tBloom;
        uniform vec2 uTexel;
        uniform float uNear;
        uniform float uFar;
        uniform mat4 uInvProj;
        uniform mat4 uInvView;
        uniform vec3 uCamPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeColor;
        uniform float uValleyMist;
        uniform float uBloomStrength;
        uniform float uExposure;
        uniform float uAoStrength;
        uniform float uNight;

        float linearizeDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }

        vec3 viewPosFromDepth(vec2 uv, float rawDepth) {
          vec4 clip = vec4(uv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * clip;
          return vp.xyz / max(vp.w, 1e-6);
        }

        vec3 acesFilm(vec3 x) {
          const float a = 2.51;
          const float b = 0.03;
          const float c = 2.43;
          const float d = 0.59;
          const float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        float ign(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }

        void main() {
          // Subtle edge-aware 5-tap color sample + Contrast-Adaptive Sharpening (CAS)
          vec3 cM = texture2D(tScene, vUv).rgb;
          vec3 cN = texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb;
          vec3 cS = texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb;
          vec3 cE = texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb;
          vec3 cW = texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb;

          float rawD = texture2D(tDepth, vUv).x;
          vec3 col = cM;

          // Contrast-adaptive micro-sharpen on geometry (not sky)
          if (rawD < 0.9997) {
            vec3 mn = min(min(min(cN, cS), min(cE, cW)), cM);
            vec3 mx = max(max(max(cN, cS), max(cE, cW)), cM);
            vec3 amp = clamp(min(mn, 2.0 - mx) / max(mx, vec3(0.001)), 0.0, 1.0);
            vec3 w = -sqrt(amp) * 0.11;
            col = max(vec3(0.0), (cM + (cN + cS + cE + cW) * w) / (1.0 + 4.0 * w));
          }

          if (rawD < 0.99985) {
            vec3 vp = viewPosFromDepth(vUv, rawD);
            float linD = -vp.z;

            // Screen-Space Ambient Occlusion (normal-reconstructed 8-tap spiral)
            if (uAoStrength > 0.01 && linD < 950.0) {
              vec3 vpR = viewPosFromDepth(vUv + vec2(uTexel.x * 1.5, 0.0), texture2D(tDepth, vUv + vec2(uTexel.x * 1.5, 0.0)).x);
              vec3 vpU = viewPosFromDepth(vUv + vec2(0.0, uTexel.y * 1.5), texture2D(tDepth, vUv + vec2(0.0, uTexel.y * 1.5)).x);
              vec3 nrm = normalize(cross(vpR - vp, vpU - vp));

              float rot = ign(gl_FragCoord.xy) * 6.2831853;
              float radPx = clamp(24.0 / (1.0 + linD * 0.045), 2.5, 18.0);
              float occ = 0.0;
              float rangeLim = max(1.1, linD * 0.045);

              for (int i = 0; i < 8; i++) {
                float fi = (float(i) + 0.5) / 8.0;
                float ang = rot + fi * 15.0796;
                vec2 off = vec2(cos(ang), sin(ang)) * uTexel * radPx * (0.35 + 0.65 * fi);
                float sd = texture2D(tDepth, vUv + off).x;
                if (sd < 0.9999) {
                  vec3 svp = viewPosFromDepth(vUv + off, sd);
                  vec3 diff = svp - vp;
                  float dist = length(diff);
                  if (dist > 0.02) {
                    float ndot = max(0.0, dot(nrm, diff / dist) - 0.08);
                    float atten = smoothstep(rangeLim * 2.2, rangeLim * 0.25, dist);
                    occ += ndot * atten;
                  }
                }
              }
              float aoFade = 1.0 - smoothstep(450.0, 950.0, linD);
              float ao = clamp(1.0 - (occ / 8.0) * 2.35 * uAoStrength * aoFade, 0.36, 1.0);
              col *= mix(vec3(ao * 0.93, ao * 0.96, ao), vec3(1.0), 0.12);
            }

            // World-space Atmospheric Height Mist & Sun God-Ray Aerial Perspective
            vec3 wp = (uInvView * vec4(vp, 1.0)).xyz;
            vec3 ray = wp - uCamPos;
            float dist = length(ray);
            vec3 rayDir = ray / max(dist, 0.001);

            // Low-altitude Western Ghats valley mist (stronger in basins ~100-145m)
            float valleyFactor = exp(-max(0.0, (wp.y - 104.0)) * 0.026);
            float distFog = 1.0 - exp(-dist * 0.00022 * (0.45 + uValleyMist * 1.4));
            float mistAmt = clamp(distFog * (0.45 + 0.85 * valleyFactor * uValleyMist), 0.0, 0.78);

            float sunAlign = max(0.0, dot(rayDir, normalize(uSunDir)));
            vec3 scatterCol = mix(uHazeColor, uSunColor, pow(sunAlign, 5.0) * (0.48 - uNight * 0.38));
            col = mix(col, scatterCol * 0.88, mistAmt);
          }

          // Add Unreal Bloom
          vec3 bloom = texture2D(tBloom, vUv).rgb;
          col += bloom * uBloomStrength;

          // Exposure + ACES Filmic Tone Mapping + Rich Real-World Color Grading
          col *= uExposure;
          col = acesFilm(col);

          // Subtle natural vibrance boost so tropical foliage & terracotta roofs pop cleanly
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float sat = length(col - vec3(luma));
          col = mix(vec3(luma), col, 1.0 + 0.11 * (1.0 - sat));

          // Linear -> sRGB gamma
          col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const quadMesh = new T.Mesh(quadGeo, matComposite);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);

    return {
      rtScene,
      rtBloomA,
      rtBloomB,
      quadScene,
      quadCam,
      quadMesh,
      matBright,
      matBlur,
      matComposite,
      resize() {
        const s = new T.Vector2();
        renderer.getDrawingBufferSize(s);
        const nw = Math.max(2, s.x), nh = Math.max(2, s.y);
        rtScene.setSize(nw, nh);
        const nbw = Math.max(2, Math.floor(nw / 3)), nbh = Math.max(2, Math.floor(nh / 3));
        rtBloomA.setSize(nbw, nbh);
        rtBloomB.setSize(nbw, nbh);
        matBright.uniforms.uTexel.value.set(1 / nw, 1 / nh);
        matComposite.uniforms.uTexel.value.set(1 / nw, 1 / nh);
      },
      render() {
        // 1. Render 3D world (raw linear HDR without renderer toneMapping so composite handles ACES)
        const prevTM = renderer.toneMapping;
        const prevEnc = renderer.outputEncoding;
        renderer.toneMapping = T.NoToneMapping;
        renderer.outputEncoding = T.LinearEncoding;

        renderer.setRenderTarget(rtScene);
        renderer.clear();
        renderer.render(scene, camera);

        // 2. Bloom extract + 2-iteration separable blur
        const bwNow = rtBloomA.width, bhNow = rtBloomA.height;
        quadMesh.material = matBright;
        renderer.setRenderTarget(rtBloomA);
        renderer.render(quadScene, quadCam);

        for (let pass = 0; pass < 2; pass++) {
          quadMesh.material = matBlur;
          matBlur.uniforms.tDiffuse.value = rtBloomA.texture;
          matBlur.uniforms.uDir.value.set((1 + pass * 0.8) / bwNow, 0);
          renderer.setRenderTarget(rtBloomB);
          renderer.render(quadScene, quadCam);

          matBlur.uniforms.tDiffuse.value = rtBloomB.texture;
          matBlur.uniforms.uDir.value.set(0, (1 + pass * 0.8) / bhNow);
          renderer.setRenderTarget(rtBloomA);
          renderer.render(quadScene, quadCam);
        }

        // 3. Final composite to canvas
        matComposite.uniforms.uNear.value = camera.near;
        matComposite.uniforms.uFar.value = camera.far;
        matComposite.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
        matComposite.uniforms.uInvView.value.copy(camera.matrixWorld);
        matComposite.uniforms.uCamPos.value.copy(camera.position);

        quadMesh.material = matComposite;
        renderer.setRenderTarget(null);
        renderer.render(quadScene, quadCam);

        renderer.toneMapping = prevTM;
        renderer.outputEncoding = prevEnc;
      }
    };
  }

  window.createUnrealFX = function createUnrealFX(opts) {
    const { renderer, scene, camera, sunLight, hemi, ambLight } = opts;

    const sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new T.Vector3(0.5, 0.72, 0.48).normalize() },
      uNight: { value: 0.0 },
      uCloudShadowStrength: { value: 0.22 }
    };

    const skyDome = createSkyDome(sharedUniforms);
    scene.add(skyDome);

    const pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    let currentEnvRT = null;
    let currentPresetKey = 'day';
    let postEnabled = true;

    const post = createPostPipeline(renderer, scene, camera, sharedUniforms);
    const nightCallbacks = [];

    function applyPreset(key) {
      const p = PRESETS[key] || PRESETS.day;
      currentPresetKey = PRESETS[key] ? key : 'day';

      const elev = p.sunElev * Math.PI / 180;
      const azim = p.sunAzim * Math.PI / 180;
      const sunDir = sharedUniforms.uSunDir.value;
      sunDir.set(
        Math.cos(elev) * Math.sin(azim),
        Math.sin(elev),
        Math.cos(elev) * Math.cos(azim)
      ).normalize();

      sharedUniforms.uNight.value = p.nightFactor;
      sharedUniforms.uCloudShadowStrength.value = p.nightFactor > 0.5 ? 0.05 : 0.22;

      // Sky dome uniforms
      const su = skyDome.material.uniforms;
      su.uZenith.value.set(p.zenith);
      su.uHorizon.value.set(p.horizon);
      su.uSunColor.value.set(p.sunColor);
      su.uCloudLight.value.set(p.cloudLight);
      su.uCloudShadow.value.set(p.cloudShadow);
      su.uCloudCoverage.value = p.cloudCoverage;

      // Direct lights
      sunLight.color.set(p.sunColor);
      sunLight.intensity = p.sunIntensity;
      hemi.color.set(p.hemiSky);
      hemi.groundColor.set(p.hemiGround);
      hemi.intensity = p.hemiIntensity;
      if (ambLight) {
        ambLight.color.set(p.ambColor);
        ambLight.intensity = p.ambIntensity;
      }

      if (scene.fog) {
        scene.fog.color.set(p.hazeColor);
        scene.fog.density = p.fogDensity;
      }
      renderer.toneMappingExposure = p.exposure;

      // Update IBL reflection environment
      const nextEnv = buildProceduralEnvMap(renderer, pmrem, p, sunDir);
      scene.environment = nextEnv.texture;
      if (currentEnvRT) currentEnvRT.dispose();
      currentEnvRT = nextEnv;

      scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m.isMeshStandardMaterial && m.userData && m.userData.baseEnvIntensity != null) {
              m.envMapIntensity = m.userData.baseEnvIntensity * p.envIntensity;
            }
          }
        }
      });

      if (post) {
        const cu = post.matComposite.uniforms;
        cu.uSunColor.value.set(p.sunColor);
        cu.uHazeColor.value.set(p.hazeColor);
        cu.uValleyMist.value = p.valleyMist;
        cu.uBloomStrength.value = p.bloomStrength;
        cu.uExposure.value = p.exposure;
        post.matBright.uniforms.uThreshold.value = p.bloomThreshold;
      }

      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      for (const cb of nightCallbacks) cb(p.nightFactor, currentPresetKey, p);
    }

    let lastSx = 1e9, lastSy = 1e9, lastSz = 1e9, lastSpan = -1;
    function updateShadowCascade(focusPos, viewRadius) {
      // Dynamic shadow cascade frustum: ultra-crisp 6.5cm texels when driving at street level,
      // smoothly expanding to full campus coverage in aerial overview!
      const halfSpan = Math.round(Math.max(135, Math.min(1260, viewRadius * 0.85)) / 8) * 8;
      const mapSize = sunLight.shadow.mapSize.x || 4096;
      const worldPerTexel = (halfSpan * 2) / mapSize;
      const snapStep = Math.max(1.5, worldPerTexel * 6);

      // Snap target in world space to prevent shadow shimmer & cache shadow map across frames!
      const sx = Math.round(focusPos.x / snapStep) * snapStep;
      const sz = Math.round(focusPos.z / snapStep) * snapStep;
      const sy = Math.round(focusPos.y / 4) * 4;

      if (Math.abs(sx - lastSx) < 0.01 && Math.abs(sz - lastSz) < 0.01 && Math.abs(sy - lastSy) < 0.01 && Math.abs(halfSpan - lastSpan) < 0.5) {
        return;
      }
      lastSx = sx; lastSy = sy; lastSz = sz; lastSpan = halfSpan;

      const dist = Math.max(900, halfSpan * 1.9);
      sunLight.target.position.set(sx, sy, sz);
      sunLight.target.updateMatrixWorld();
      sunLight.position.copy(sunLight.target.position).addScaledVector(sharedUniforms.uSunDir.value, dist);

      const sc = sunLight.shadow.camera;
      sc.left = -halfSpan;
      sc.right = halfSpan;
      sc.top = halfSpan;
      sc.bottom = -halfSpan;
      sc.near = Math.max(40, dist - halfSpan * 1.8 - 260);
      sc.far = dist + halfSpan * 1.8 + 360;
      sc.updateProjectionMatrix();

      sunLight.shadow.bias = halfSpan < 300 ? -0.00018 : -0.00009;
      sunLight.shadow.normalBias = halfSpan < 300 ? 0.14 : 0.38;
      renderer.shadowMap.needsUpdate = true;
    }

    applyPreset('day');

    return {
      PRESETS,
      sharedUniforms,
      skyDome,
      applyPreset,
      getPreset: () => currentPresetKey,
      setPostEnabled(v) { postEnabled = !!v; },
      isPostEnabled: () => postEnabled && !!post,
      onTimeChange(cb) { nightCallbacks.push(cb); cb(sharedUniforms.uNight.value, currentPresetKey, PRESETS[currentPresetKey]); },
      resize() { if (post) post.resize(); },
      render(elapsedTime, focusPos, viewRadius) {
        sharedUniforms.uTime.value = elapsedTime;
        skyDome.position.set(camera.position.x, 0, camera.position.z);
        if (focusPos) updateShadowCascade(focusPos, viewRadius || 600);
        if (post && postEnabled) {
          post.render();
        } else {
          renderer.render(scene, camera);
        }
      }
    };
  };
})();
