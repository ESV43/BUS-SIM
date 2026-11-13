/* IISER TVM Campus Landmarks & Missing Real-World 3D Structures
 * Reconstructs & labels: Q-Park, Indoor Stadium, Campus Waterbody (Lake + Check-Dam + Pier + Gazebo),
 * Students Recreation Rooms, Visitors Forest Retreat (multi-wing), Health Centre (+ Ambulance),
 * Shopping Complex Plaza, Bus Terminal Arcade, Covered LHC Stairway, and Faculty Quarters. */
(function () {
  'use strict';

  const D = window.CAMPUS_DATA;
  if (!D) return;

  function orderCCW(ring) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s > 0 ? ring : ring.slice().reverse();
  }

  function rectPoly(cx, cz, w, d, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const hw = w / 2, hd = d / 2;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    return orderCCW(corners.map(([lx, lz]) => [
      +(cx + lx * c - lz * s).toFixed(2),
      +(cz + lx * s + lz * c).toFixed(2)
    ]));
  }

  function scaleRing(ring, cx, cz, k) {
    return ring.map(([x, z]) => [+(cx + (x - cx) * k).toFixed(2), +(cz + (z - cz) * k).toFixed(2)]);
  }

  // 1. Upgrade existing mapped buildings & labels
  // Match OSM building IDs to their real IISER TVM names.
  // These are the buildings that OSM has mapped at the Vithura campus.
  const renameMap = {
    '1445926321': { name: 'Health Centre', kind: 'hospital', major: true },
    '1445926323': { name: 'Shopping Complex & CDH - III', kind: 'shop', major: true },
    '1445926324': { name: 'Visitors Forest Retreat', kind: 'residential', major: true },
    '1445926322': { name: 'The Crucible (Activity Centre)', kind: 'academic', major: true },
    '1462849221': { name: 'Cake World', kind: 'shop', major: true },
    '695769589':  { name: 'Central Instrumentation Facility', kind: 'research', major: true },
    '695769593':  { name: 'Ponmudi Hostel', kind: 'hostel', major: true },
    '695769594':  { name: 'Agasthya Hostel', kind: 'hostel', major: false },
    '695769598':  { name: 'Sispara Hostel', kind: 'hostel', major: true },
    '1445926318': { name: 'CDH - II', kind: 'dining', major: false },
    '1216391472': { name: 'Faculty & Staff Quarters', kind: 'residential', major: true },
    '695769595':  { name: 'PhD Hostel Block 3', kind: 'hostel', major: false },
    '695769596':  { name: 'PhD Hostel Block 4', kind: 'hostel', major: false },
    '695769597':  { name: 'PhD Hostel Block 5', kind: 'hostel', major: false },
    '798237094':  { name: 'IISER Central Library', kind: 'library', major: true },
    '1462849225': { name: 'Lecture Hall Complex', kind: 'academic', major: true },
    '1445926320': { name: 'Academic Block & Mathematics Block', kind: 'academic', major: true },
    '695769587':  { name: 'Biology Block', kind: 'research', major: true },
    '695769586':  { name: 'Chemistry Block', kind: 'research', major: true },
    '695769585':  { name: 'Physics Block', kind: 'research', major: true },
    '695769588':  { name: 'Animal House', kind: 'utility', major: false },
    '1445926319': { name: 'J-Cafe', kind: 'dining', major: false },
    '1462849222': { name: 'i Cafe', kind: 'dining', major: false },
    '798246042':  { name: 'Ankita North Indian Restaurant', kind: 'dining', major: false }
  };

  // Refine Visitors Forest Retreat from single solid bounding box into real 3 courtyard wings
  const vfrIdx = D.buildings.findIndex(b => b.id === '1445926324');
  if (vfrIdx >= 0) {
    const vfrOrig = D.buildings[vfrIdx];
    const baseVfr = 122.2;
    const westWing = rectPoly(154.0, 21.0, 20.0, 35.0, 4);
    const eastWing = rectPoly(182.0, 26.5, 19.5, 32.0, 4);
    const southAtrium = rectPoly(158.5, 59.5, 34.0, 27.0, 4);

    // Replace bounding-box polygon with main West Wing, and append East Wing + Reception Atrium
    vfrOrig.name = 'Visitors Forest Retreat';
    vfrOrig.kind = 'residential';
    vfrOrig.floors = 3;
    vfrOrig.base = baseVfr;
    vfrOrig.foundBottom = baseVfr - 4.5;
    vfrOrig.wallH = 10.2;
    vfrOrig.roofH = 3.8;
    vfrOrig.style = 'hip';
    vfrOrig.roofColor = '#8c3a2b';
    vfrOrig.wallColor = '#efe8d8';
    vfrOrig.footprint = westWing;
    vfrOrig.roofOuter = scaleRing(westWing, 154.0, 21.0, 1.03);
    vfrOrig.roofInner = scaleRing(westWing, 154.0, 21.0, 0.16);
    vfrOrig.cx = 154.0;
    vfrOrig.cz = 21.0;
    vfrOrig.area = 1980;

    D.buildings.push(
      {
        id: '1445926324_e', name: 'Visitors Forest Retreat (East Wing)', kind: 'residential',
        floors: 3, area: 624, base: 125.8, foundBottom: 120.5, wallH: 10.2, roofH: 3.6,
        style: 'hip', roofColor: '#8a392a', wallColor: '#ede5d5',
        footprint: eastWing, roofOuter: scaleRing(eastWing, 182.0, 26.5, 1.03),
        roofInner: scaleRing(eastWing, 182.0, 26.5, 0.16), cx: 182.0, cz: 26.5, labelY: 142
      },
      {
        id: '1445926324_s', name: 'Visitors Forest Retreat (Reception & Dining)', kind: 'residential',
        floors: 2, area: 918, base: 121.8, foundBottom: 117.5, wallH: 7.4, roofH: 0.6,
        style: 'flat', roofColor: '#c9c4b8', wallColor: '#f2ece0',
        footprint: southAtrium, roofOuter: scaleRing(southAtrium, 158.5, 59.5, 1.015),
        roofInner: null, cx: 158.5, cz: 59.5, labelY: 133
      }
    );
  }

  for (const b of D.buildings) {
    const r = renameMap[b.id];
    if (r) {
      b.name = r.name;
      b.kind = r.kind;
    }
  }

  // 2. Add missing real-world 3D buildings from satellite imagery
  const stdFoot = rectPoly(368.0, 463.0, 43.0, 64.0, -43);
  const gymFoot = rectPoly(392.5, 427.5, 19.0, 20.0, -43);
  const recSportsFoot = rectPoly(278.5, 504.0, 44.0, 16.5, 23);
  const recHostelFoot = rectPoly(495.5, 303.0, 21.0, 19.0, -34);
  const recCdhFoot = rectPoly(576.5, 271.5, 20.0, 15.5, -42);
  const recLibFoot = rectPoly(303.5, 186.5, 26.0, 14.5, -36);
  const footPavFoot = rectPoly(-101.0, -482.0, 28.0, 11.5, -32);

  const extraBuildings = [
    {
      id: 'lm_indoor_stadium',
      name: 'Indoor Stadium',
      kind: 'sports',
      floors: 2,
      area: 2752.0,
      base: 115.2,
      foundBottom: 111.0,
      wallH: 10.6,
      roofH: 6.2,
      style: 'custom_stadium',
      roofColor: '#944a38',
      wallColor: '#ece6d8',
      footprint: stdFoot,
      roofOuter: scaleRing(stdFoot, 368.0, 463.0, 1.02),
      roofInner: null,
      cx: 368.0,
      cz: 463.0,
      labelY: 136.5,
      note: 'Multi-sport Indoor Stadium & Gymnasium (badminton, basketball, volleyball courts & upper-level fitness gym).'
    },
    {
      id: 'lm_stadium_gym',
      name: 'Indoor Stadium — Gymnasium Wing',
      kind: 'sports',
      floors: 2,
      area: 380.0,
      base: 115.4,
      foundBottom: 111.5,
      wallH: 7.8,
      roofH: 2.8,
      style: 'hip',
      roofColor: '#8d3f2f',
      wallColor: '#ebe4d6',
      footprint: gymFoot,
      roofOuter: scaleRing(gymFoot, 392.5, 427.5, 1.03),
      roofInner: scaleRing(gymFoot, 392.5, 427.5, 0.16),
      cx: 392.5,
      cz: 427.5,
      labelY: 129.0
    },
    {
      id: 'lm_rec_hostel',
      name: 'Students Recreation Rooms',
      kind: 'recreation',
      floors: 2,
      area: 399.0,
      base: 127.8,
      foundBottom: 123.5,
      wallH: 6.9,
      roofH: 2.6,
      style: 'hip',
      roofColor: '#8e3b2b',
      wallColor: '#efe7d6',
      footprint: recHostelFoot,
      roofOuter: scaleRing(recHostelFoot, 495.5, 303.0, 1.03),
      roofInner: scaleRing(recHostelFoot, 495.5, 303.0, 0.16),
      cx: 495.5,
      cz: 303.0,
      labelY: 141.0,
      note: 'Central Hostel Students Recreation Lounge & Common Rooms (table tennis, carrom, chess, TV & music jam rooms).'
    },
    {
      id: 'lm_rec_sports',
      name: 'Students Recreation & Indoor Games Hall',
      kind: 'recreation',
      floors: 1,
      area: 726.0,
      base: 108.4,
      foundBottom: 105.0,
      wallH: 5.4,
      roofH: 2.1,
      style: 'hip',
      roofColor: '#3a5d87',
      wallColor: '#eae6dc',
      footprint: recSportsFoot,
      roofOuter: scaleRing(recSportsFoot, 278.5, 504.0, 1.03),
      roofInner: scaleRing(recSportsFoot, 278.5, 504.0, 0.14),
      cx: 278.5,
      cz: 504.0,
      labelY: 119.5,
      note: 'Sports & Student Recreation Rooms adjacent to the outdoor courts and Indoor Stadium.'
    },
    {
      id: 'lm_rec_cdh',
      name: 'Student Lounge & SCoM Annex',
      kind: 'recreation',
      floors: 2,
      area: 310.0,
      base: 143.0,
      foundBottom: 139.0,
      wallH: 6.8,
      roofH: 2.4,
      style: 'hip',
      roofColor: '#8d3b2c',
      wallColor: '#ede4d3',
      footprint: recCdhFoot,
      roofOuter: scaleRing(recCdhFoot, 576.5, 271.5, 1.03),
      roofInner: scaleRing(recCdhFoot, 576.5, 271.5, 0.15),
      cx: 576.5,
      cz: 271.5,
      labelY: 155.5
    },
    {
      id: 'lm_rec_lib',
      name: 'Student Wellness & Recreation Center',
      kind: 'recreation',
      floors: 1,
      area: 377.0,
      base: 120.2,
      foundBottom: 116.5,
      wallH: 4.8,
      roofH: 2.2,
      style: 'hip',
      roofColor: '#913c2c',
      wallColor: '#eee6d8',
      footprint: recLibFoot,
      roofOuter: scaleRing(recLibFoot, 303.5, 186.5, 1.03),
      roofInner: scaleRing(recLibFoot, 303.5, 186.5, 0.15),
      cx: 303.5,
      cz: 186.5,
      labelY: 130.5
    },
    {
      id: 'lm_football_pav',
      name: 'Kathipara Sports Pavilion',
      kind: 'sports',
      floors: 1,
      area: 322.0,
      base: 130.2,
      foundBottom: 127.0,
      wallH: 4.4,
      roofH: 1.9,
      style: 'hip',
      roofColor: '#8f3d2d',
      wallColor: '#ebe4d6',
      footprint: footPavFoot,
      roofOuter: scaleRing(footPavFoot, -101.0, -482.0, 1.03),
      roofInner: scaleRing(footPavFoot, -101.0, -482.0, 0.14),
      cx: -101.0,
      cz: -482.0,
      labelY: 140.0
    }
  ];

  D.buildings.push(...extraBuildings);

  // 3. Add the iconic central Campus Waterbody (Lake / Check-Dam Reservoir)
  const campusLakePoly = orderCCW([
    [384.0, 311.5],
    [372.0, 355.0],
    [382.5, 372.0],
    [399.0, 379.0],
    [413.0, 386.0],
    [425.0, 406.0],
    [454.0, 422.5],
    [496.0, 427.0],
    [522.0, 417.0],
    [517.0, 398.0],
    [484.0, 377.0],
    [458.0, 358.0],
    [438.0, 344.0],
    [416.0, 330.0],
    [396.0, 316.0]
  ]);

  D.water.push({
    id: 'lm_campus_lake',
    name: 'Campus Waterbody',
    level: 110.15,
    isCampusLake: true,
    polygon: campusLakePoly
  });

  // Add reconstructed hostel buildings for missing real hostels (Pushpagiri, Mukurthy, Eravimala)
  // OSM only has Ponmudi, Agasthya, Sispara, and PhD blocks 3-5. Real IISER has:
  // Pushpagiri, Mukurthy, Eravimala hostels + Aanamudi A/B/C blocks that are missing
  const pushpagiriFoot = rectPoly(628.0, 445.0, 22.0, 45.0, -5);
  const mukurthyFoot = rectPoly(655.0, 415.0, 20.0, 38.0, 8);
  const eravimalaFoot = rectPoly(678.0, 462.0, 18.0, 32.0, -12);

  D.buildings.push(
    {
      id: 'lm_pushpagiri',
      name: 'Pushpagiri Hostel',
      kind: 'hostel',
      floors: 4,
      area: 990.0,
      base: 124.5,
      foundBottom: 120.0,
      wallH: 9.2,
      roofH: 3.2,
      style: 'hip',
      roofColor: '#7a3c2e',
      wallColor: '#e8e0d0',
      footprint: pushpagiriFoot,
      roofOuter: scaleRing(pushpagiriFoot, 628.0, 445.0, 1.03),
      roofInner: scaleRing(pushpagiriFoot, 628.0, 445.0, 0.18),
      cx: 628.0,
      cz: 445.0,
      labelY: 140.0,
      note: 'Female students hostel (Pushpagiri).'
    },
    {
      id: 'lm_mukurthy',
      name: 'Mukurthy Hostel',
      kind: 'hostel',
      floors: 4,
      area: 760.0,
      base: 126.2,
      foundBottom: 121.8,
      wallH: 8.8,
      roofH: 3.0,
      style: 'hip',
      roofColor: '#7b3d2f',
      wallColor: '#eae2d2',
      footprint: mukurthyFoot,
      roofOuter: scaleRing(mukurthyFoot, 655.0, 415.0, 1.03),
      roofInner: scaleRing(mukurthyFoot, 655.0, 415.0, 0.17),
      cx: 655.0,
      cz: 415.0,
      labelY: 139.0,
      note: 'Students hostel (Mukurthy).'
    },
    {
      id: 'lm_eravimala',
      name: 'Eravimala Hostel',
      kind: 'hostel',
      floors: 3,
      area: 720.0,
      base: 123.8,
      foundBottom: 119.5,
      wallH: 8.5,
      roofH: 2.8,
      style: 'hip',
      roofColor: '#844030',
      wallColor: '#ece5d4',
      footprint: eravimalaFoot,
      roofOuter: scaleRing(eravimalaFoot, 678.0, 462.0, 1.03),
      roofInner: scaleRing(eravimalaFoot, 678.0, 462.0, 0.16),
      cx: 678.0,
      cz: 462.0,
      labelY: 137.0,
      note: 'Students hostel (Eravimala).'
    }
  );

  // Add labels for reconstructed hostels
  D.labels.push(
    { text: 'Pushpagiri Hostel', x: 628.0, y: 140.0, z: 445.0, kind: 'hostel', major: true, id: 'lm_pushpagiri' },
    { text: 'Mukurthy Hostel', x: 655.0, y: 139.0, z: 415.0, kind: 'hostel', major: true, id: 'lm_mukurthy' },
    { text: 'Eravimala Hostel', x: 678.0, y: 137.0, z: 462.0, kind: 'hostel', major: true, id: 'lm_eravimala' }
  );

  // 4. Define terrain grading / basin carving zones for app.js
  D.gradingZones = [
    // Carve lake bed to 107.4m so water at 110.15m has rich depth across entire 155m basin
    { type: 'basin', polygon: campusLakePoly, bedY: 107.4, shoreY: 110.35, margin: 8.5 },
    // Level terrace for Indoor Stadium
    { type: 'pad', polygon: scaleRing(stdFoot, 368.0, 463.0, 1.15), targetY: 115.2, margin: 10.0 },
    // Level terrace for Oval Walking Park below Cake World
    { type: 'pad', polygon: rectPoly(398.5, 195.0, 72.0, 28.0, 18), targetY: 131.0, margin: 5.0 },
    // Level terrace for Q-Park, aligned with the service road and kept off its lane
    { type: 'pad', polygon: rectPoly(441.2, 171.2, 38.0, 16.0, 18), targetY: 145.2, margin: 2.5 },
    // Level terrace for Bus Terminal Semi-Circular Arcade
    { type: 'pad', polygon: rectPoly(256.0, 452.0, 62.0, 56.0, 0), targetY: 109.2, margin: 9.0 },
    // Level terrace for Students Recreation & Indoor Games Hall
    { type: 'pad', polygon: scaleRing(recSportsFoot, 278.5, 504.0, 1.16), targetY: 108.4, margin: 6.0 },
    // Level pad outside Main Gate for SH-45 Bellmouth Junction & Highway Tea Stall / Bus Bay
    // Main gate is at OSM (77.133262, 8.677921) -> scene (185.47, 548.84)
    { type: 'pad', polygon: rectPoly(185.5, 549.0, 60.0, 40.0, -22), targetY: 114.6, margin: 12.0 },
    // Level pad on Vithura SH-45 West Junction for Highway Fuel Station & KSRTC Bus Stand
    { type: 'pad', polygon: rectPoly(-126.0, 604.0, 58.0, 38.0, 18), targetY: 116.4, margin: 10.0 },
    // Level pad on Ponmudi SH-45 East for Golden Valley Ghat Viewpoint & Checkpost
    { type: 'pad', polygon: rectPoly(426.0, 792.0, 48.0, 34.0, -38), targetY: 121.2, margin: 10.0 },
    // Level pads for reconstructed hostels (Pushpagiri, Mukurthy, Eravimala)
    { type: 'pad', polygon: rectPoly(628.0, 445.0, 50.0, 55.0, 0), targetY: 122.0, margin: 15.0 },
    { type: 'pad', polygon: rectPoly(655.0, 415.0, 50.0, 55.0, 0), targetY: 122.0, margin: 15.0 },
    { type: 'pad', polygon: rectPoly(678.0, 462.0, 50.0, 55.0, 0), targetY: 122.0, margin: 15.0 }
  ];

  // Ground every playing field, court and parking lot into the hillside.
  // Without these pads the flat pitch meshes sit metres above the coarse DEM
  // (the Kathipara football ground was floating up to ~18 m in mid-air).
  for (const p of (D.pitches || [])) {
    const nm = (p.name || '').toLowerCase();
    const isBig = nm.includes('football') || nm.includes('kathipara');
    D.gradingZones.push({
      type: 'pad',
      polygon: p.polygon,
      targetY: p.level - 0.10,
      margin: isBig ? 22.0 : 8.0
    });
  }
  for (const p of (D.parking || [])) {
    D.gradingZones.push({
      type: 'pad',
      polygon: p.polygon,
      targetY: p.level - 0.05,
      margin: 7.0
    });
  }

  // 5. Update & enrich labels so all requested landmarks are visible and clickable!
  // Label positions are taken from the OSM-projected building centroids in CAMPUS_DATA.buildings.
  // We override a few that were hand-tuned from satellite imagery where the OSM centroid is off.
  const existingById = new Map();
  for (const l of D.labels) {
    if (l.id) existingById.set(l.id, l);
    if (l.id && renameMap[l.id]) {
      l.text = renameMap[l.id].name;
      l.kind = renameMap[l.id].kind;
      l.major = renameMap[l.id].major;
    }
    if (l.text === 'Football Field') {
      l.text = 'Kathipara Football Ground';
      l.major = true;
    }
    // Fix Central Library label position (OSM centroid at 257.65, 124.04 is slightly off from building)
    if (l.id === '798237094') {
      l.x = 257.65; l.z = 124.04;
    }
    // Fix Academic Block label
    if (l.id === '1445926320') {
      l.x = 308.04; l.z = -10.13;
    }
    // Fix Lecture Hall Complex label
    if (l.id === '1462849225') {
      l.x = 362.56; l.z = -76.70;
    }
    // Fix Biology Block label
    if (l.id === '695769587') {
      l.x = 595.41; l.z = 120.38;
    }
    // Fix Chemistry Block label
    if (l.id === '695769586') {
      l.x = 498.70; l.z = 61.50;
    }
    // Fix Physics Block label
    if (l.id === '695769585') {
      l.x = 389.51; l.z = 33.08;
    }
  }

  // Add missing labels for buildings that OSM has but have no label entry
  const missingLabels = [
    { id: '695769595', text: 'PhD Hostel Block 3' },
    { id: '695769596', text: 'PhD Hostel Block 4' },
    { id: '695769597', text: 'PhD Hostel Block 5' },
    { id: '1445926320', text: 'Academic Block & Mathematics Block' },
    { id: '1462849225', text: 'Lecture Hall Complex' },
    { id: '798246042', text: 'Ankita North Indian Restaurant' },
    { id: '695769587', text: 'Biology Block' },
    { id: '695769586', text: 'Chemistry Block' },
    { id: '695769585', text: 'Physics Block' },
    { id: '695769588', text: 'Animal House' },
    { id: '695769589', text: 'Central Instrumentation Facility' }
  ];
  for (const ml of missingLabels) {
    if (!existingById.has(ml.id)) {
      const b = D.buildings.find(b => b.id === ml.id);
      if (b) {
        D.labels.push({
          text: ml.text,
          x: b.cx, y: b.labelY || (b.base + b.wallH + b.roofH + 4), z: b.cz,
          kind: b.kind, major: false, id: ml.id
        });
      }
    }
  }

  // Add labels for all new landmarks
  const newLabels = [
    {
      text: 'Q-Park',
      x: 437.2, y: 151.5, z: 172.2,
      kind: 'park', major: true,
      poiInfo: {
        kind: 'Student Park & Stargazing Lawn',
        name: 'Q-Park (Quantum Park)',
        height: 'Open Lawn',
        floors: '2 Terraces',
        area: '3,150 m²',
        elev: '145 m',
        cx: 425.2, cz: 180.2, radius: 145,
        note: 'Popular quiet green park, walking oval & stargazing lawn situated right in front of Cake World.'
      }
    },
    {
      text: 'Indoor Stadium',
      x: 368.0, y: 136.5, z: 463.0,
      kind: 'sports', major: true, id: 'lm_indoor_stadium'
    },
    {
      text: 'Campus Waterbody',
      x: 436.0, y: 115.5, z: 368.0,
      kind: 'water', major: true,
      poiInfo: {
        kind: 'Reservoir & Check-Dam Lake',
        name: 'Campus Waterbody',
        height: '2.8 m depth',
        floors: 'Check-Dam & Pier',
        area: '6,850 m²',
        elev: '110 m',
        cx: 430.0, cz: 368.0, radius: 195,
        note: 'Scenic central campus waterbody with concrete check-dam weir, circular observation pier, and lakeside pavilion.'
      }
    },
    {
      text: 'Students Recreation Rooms',
      x: 495.5, y: 141.5, z: 303.0,
      kind: 'recreation', major: true, id: 'lm_rec_hostel'
    },
    {
      text: 'Indoor Games & Recreation',
      x: 278.5, y: 120.5, z: 504.0,
      kind: 'recreation', major: false, id: 'lm_rec_sports'
    },
    {
      text: 'Entrance Bus Arcade',
      x: 258.0, y: 118.5, z: 442.0,
      kind: 'gate', major: false,
      poiInfo: {
        kind: 'Campus Transit Hub',
        name: 'Entrance Reception & Shuttle Arcade',
        height: '6.2 m',
        floors: '1 Colonnade',
        area: '1,420 m²',
        elev: '109 m',
        cx: 256.0, cz: 452.0, radius: 140,
        note: 'Semi-circular terracotta-roofed reception arcade and campus shuttle bus turnaround plaza near Main Gate.'
      }
    },
    {
      text: 'SH-45 Vithura–Ponmudi Hwy',
      x: 168.0, y: 124.0, z: 576.0,
      kind: 'gate', major: true,
      poiInfo: {
        kind: 'Kerala State Highway (SH-45)',
        name: 'Vithura – Bonacaud / Ponmudi Ghat Highway',
        height: '2-Lane Highway',
        floors: 'Exterior Network',
        area: '2.1 km Stretch',
        elev: '115 m',
        cx: 168.0, cz: 576.0, radius: 185,
        note: 'Exterior mountain highway outside IISER Main Gate connecting West to Vithura Town & Thiruvananthapuram and East to Golden Valley & Ponmudi Hill Station.'
      }
    },
    {
      text: 'Vithura Highway Fuel & Bus Stand',
      x: -126.0, y: 126.0, z: 604.0,
      kind: 'shop', major: true,
      poiInfo: {
        kind: 'Exterior Transit & Fuel Hub',
        name: 'Vithura Highway Fuel Station & KSRTC Stand',
        height: '6.8 m Canopy',
        floors: '1 Forecourt',
        area: '1,850 m²',
        elev: '116 m',
        cx: -126.0, cz: 604.0, radius: 175,
        note: 'Highway fuel station, roadside tea & bakery plaza, and KSRTC bus bay at the Vithura–Maruthamala SH-45 crossroads outside campus.'
      }
    },
    {
      text: 'Golden Valley Ghat Viewpoint',
      x: 426.0, y: 131.0, z: 792.0,
      kind: 'park', major: true,
      poiInfo: {
        kind: 'Western Ghats Scenic Overlook',
        name: 'Golden Valley & Ponmudi Road Viewpoint',
        height: '5.5 m Pavilion',
        floors: '1 Deck + Loop',
        area: '1,400 m²',
        elev: '121 m',
        cx: 426.0, cz: 792.0, radius: 175,
        note: 'Forest checkpost, turnaround loop, and scenic mountain viewpoint along the eastern Vithura–Ponmudi highway outside Main Gate.'
      }
    }
  ];

  D.labels.push(...newLabels);  // Fix: add grading zone to flatten Kathipara football ground area
  // The football field at (-131.67, -435.11) was floating in air
  D.gradingZones.push({
    type: 'pad',
    polygon: rectPoly(-131.7, -435.1, 120, 80, 0),
    targetY: 128.0,
    margin: 25.0
  });

  // 9. Assign descriptive names to unnamed buildings based on their spatial
  // location relative to the known IISER TVM Vithura campus layout.
  // OSM IDs are keys; names are deterministic so reapplying is idempotent.
  const posNameMap = [
    { id: '798246033', name: 'Vithura Highway Kiosk 1', kind: 'shop' },
    { id: '798246034', name: 'Vithura Highway Kiosk 2', kind: 'shop' },
    { id: '798246035', name: 'Vithura Highway Kiosk 3', kind: 'shop' },
    { id: '798246036', name: 'Vithura Highway Kiosk 4', kind: 'shop' },
    { id: '798246037', name: 'Highway Tea & Snack Stall', kind: 'shop' },
    { id: '798246038', name: 'Highway Mini Market', kind: 'shop' },
    { id: '798246039', name: 'Highway MTR Mess & Tiffin', kind: 'dining' },
    { id: '798246040', name: 'Highway Auditobar', kind: 'dining' },
    { id: '798246041', name: 'Highway Cycle Rental & Repair', kind: 'shop' },
    { id: '798246043', name: 'Ponmudi Ghat Bakery', kind: 'shop' },
    { id: '798247555', name: 'Anamudi Hostel Gate Kiosk', kind: 'shop' },
    { id: '798247556', name: 'Anamudi Hostel Grounds Store', kind: 'utility' },
    { id: '798247557', name: 'Hostel Laundry & Utilities', kind: 'utility' },
    { id: '798247558', name: 'Sports Ground Pavilion', kind: 'sports' },
    { id: '798247559', name: 'Football Ground Dugout', kind: 'sports' },
    { id: '798247560', name: 'Cricket Pavilion', kind: 'sports' },
    { id: '798247561', name: 'Sports Equipment Store', kind: 'utility' },
    { id: '798247562', name: 'Groundsman Shed', kind: 'utility' },
    { id: '798249081', name: 'Central Library Annex A', kind: 'library' },
    { id: '798249082', name: 'Central Library Annex B', kind: 'library' },
    { id: '798249083', name: 'Library Reprography Room', kind: 'library' },
    { id: '798249084', name: 'Library Stacks Basement', kind: 'library' },
    { id: '798249085', name: 'Library Seminar Room', kind: 'library' },
    { id: '798249086', name: 'Library Cafeteria', kind: 'dining' },
    { id: '798249087', name: 'Academic Staff Lounge', kind: 'academic' },
    { id: '798253200', name: 'Faculty Quarters Bungalow 1', kind: 'residential' },
    { id: '798253201', name: 'Faculty Quarters Bungalow 2', kind: 'residential' },
    { id: '798253206', name: 'Guests Forest Retreat Cabin', kind: 'residential' },
    { id: '798253209', name: 'FSL Camping Shed', kind: 'utility' },
    { id: '798253210', name: 'Maintenance Workshop', kind: 'utility' },
    { id: '798253211', name: 'Generator Shed', kind: 'utility' },
    { id: '798253212', name: 'Water Tank House', kind: 'utility' },
    { id: '1216391476', name: "Director's Residence Annexe", kind: 'admin' },
    { id: '1216391477', name: 'Guest Faculty Quarter', kind: 'residential' },
    { id: '1216391479', name: 'Estate Office & Store', kind: 'utility' }
  ];

  for (const entry of posNameMap) {
    if (!entry.name) continue;
    const b = D.buildings.find(b => b.id === entry.id);
    if (b && (!b.name || b.name === '')) {
      b.name = entry.name;
      if (entry.kind) b.kind = entry.kind;
    }
  }

  // Fix: ensure Central Library has grading pad (it was missing and floating)
  D.gradingZones.push({
    type: 'pad',
    polygon: rectPoly(257.65, 124.04, 50, 40, 0),
    targetY: 112.5,
    margin: 12.0
  });

  // 6. Custom 3D Hero Landmark Builder (invoked by app.js once materials/scene exist)
  window.buildHeroLandmarks = function buildHeroLandmarks(ctx) {
    const T = window.THREE;
    const { scene, heightAt, pickMeshes, buildingById, wallTex, roofTex, maxAniso, nightMaterials } = ctx;
    const group = new T.Group();
    group.name = 'heroLandmarks';

    const concreteMat = new T.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.85, metalness: 0.04 });
    const darkSteelMat = new T.MeshStandardMaterial({ color: 0x2f3840, roughness: 0.42, metalness: 0.72 });
    const glassMat = new T.MeshStandardMaterial({
      color: 0x6c92ad, roughness: 0.10, metalness: 0.86, transparent: true, opacity: 0.84,
      emissive: new T.Color(0x000000), emissiveIntensity: 0
    });
    glassMat.userData.baseEnvIntensity = 1.35;
    if (nightMaterials) nightMaterials.push({ mat: glassMat, color: new T.Color(0xffcf87), intensity: 0.85 });

    const terraRibMat = new T.MeshStandardMaterial({
      map: roofTex, bumpMap: roofTex, bumpScale: 0.18,
      color: 0xa14e3a, roughness: 0.62, metalness: 0.18, side: T.DoubleSide
    });
    const ribArchMat = new T.MeshStandardMaterial({ color: 0xd8d2c5, roughness: 0.55, metalness: 0.25 });
    const woodMat = new T.MeshStandardMaterial({ color: 0x7b5233, roughness: 0.82, metalness: 0.04 });
    const trackMat = new T.MeshStandardMaterial({ color: 0xa85542, roughness: 0.88, metalness: 0.02 });
    const lawnMat = new T.MeshStandardMaterial({ color: 0x2e6e36, roughness: 0.92, metalness: 0.0 });
    const stoneMat = new T.MeshStandardMaterial({ color: 0xbcb6a6, roughness: 0.90, metalness: 0.03 });
    const redBrickMat = new T.MeshStandardMaterial({ color: 0x8f4638, roughness: 0.90, metalness: 0.02 });

    // --- A. BARREL-VAULTED INDOOR STADIUM (368, 463) ---
    {
      const st = new T.Group();
      const yBase = 115.2;
      st.position.set(368.0, yBase, 463.0);
      st.rotation.y = 43 * Math.PI / 180; // aligns local Z with NW-SE 64m length

      const W = 42.0, L = 63.0, wallH = 9.4, archRise = 6.6;
      const stadiumData = buildingById.get('lm_indoor_stadium');
      const tagPick = (mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (stadiumData) {
          mesh.userData.buildingId = 'lm_indoor_stadium';
          pickMeshes.push(mesh);
        }
        return mesh;
      };

      // Stepped concrete plinth
      const plinth = tagPick(new T.Mesh(new T.BoxGeometry(W + 3.2, 1.4, L + 3.2), stoneMat));
      plinth.position.y = 0.2;
      st.add(plinth);

      // Lower masonry facade walls
      const lowerBody = tagPick(new T.Mesh(new T.BoxGeometry(W, wallH * 0.62, L),
        new T.MeshStandardMaterial({ map: wallTex, color: 0xede6d7, roughness: 0.84, metalness: 0.03 })));
      lowerBody.position.y = wallH * 0.31 + 0.5;
      st.add(lowerBody);

      // Upper clerestory glass band for natural court daylighting + warm night glow
      const upperGlass = tagPick(new T.Mesh(new T.BoxGeometry(W - 0.3, wallH * 0.38, L - 0.3), glassMat));
      upperGlass.position.y = wallH * 0.81 + 0.5;
      st.add(upperGlass);

      // Side concrete structural buttress columns (8 per side)
      for (let i = 0; i < 8; i++) {
        const z = -L / 2 + 2.5 + (i / 7) * (L - 5.0);
        for (const sx of [-1, 1]) {
          const col = new T.Mesh(new T.BoxGeometry(0.95, wallH + 0.6, 1.1), concreteMat);
          col.position.set(sx * (W / 2 + 0.2), (wallH + 0.6) / 2 + 0.4, z);
          col.castShadow = true; col.receiveShadow = true;
          st.add(col);
        }
      }

      // Curved barrel-vaulted roof shell + gable end tympanums
      const segsX = 28;
      const roofPos = [], roofUv = [];
      const halfSpan = W * 0.5 + 1.8;
      const halfLen = L * 0.5 + 2.0;
      for (let i = 0; i < segsX; i++) {
        const t0 = i / segsX, t1 = (i + 1) / segsX;
        const a0 = (t0 - 0.5) * Math.PI * 0.92;
        const a1 = (t1 - 0.5) * Math.PI * 0.92;
        const x0 = Math.sin(a0) * (halfSpan / Math.sin(Math.PI * 0.46));
        const x1 = Math.sin(a1) * (halfSpan / Math.sin(Math.PI * 0.46));
        const y0 = wallH + 0.6 + (Math.cos(a0) - Math.cos(Math.PI * 0.46)) / (1 - Math.cos(Math.PI * 0.46)) * archRise;
        const y1 = wallH + 0.6 + (Math.cos(a1) - Math.cos(Math.PI * 0.46)) / (1 - Math.cos(Math.PI * 0.46)) * archRise;

        roofPos.push(
          x0, y0, -halfLen, x0, y0, halfLen, x1, y1, halfLen,
          x0, y0, -halfLen, x1, y1, halfLen, x1, y1, -halfLen
        );
        roofUv.push(
          t0 * 14, 0, t0 * 14, L / 3.2, t1 * 14, L / 3.2,
          t0 * 14, 0, t1 * 14, L / 3.2, t1 * 14, 0
        );

        // Gable end filler triangles at -L/2 and +L/2
        for (const sz of [-L / 2, L / 2]) {
          if (sz > 0) {
            roofPos.push(0, wallH + 0.6, sz, x0, y0, sz, x1, y1, sz);
          } else {
            roofPos.push(0, wallH + 0.6, sz, x1, y1, sz, x0, y0, sz);
          }
          roofUv.push(0.5, 0, t0, 1, t1, 1);
        }
      }
      const vaultGeo = new T.BufferGeometry();
      vaultGeo.setAttribute('position', new T.Float32BufferAttribute(roofPos, 3));
      vaultGeo.setAttribute('uv', new T.Float32BufferAttribute(roofUv, 2));
      vaultGeo.computeVertexNormals();
      const vaultMesh = tagPick(new T.Mesh(vaultGeo, terraRibMat));
      st.add(vaultMesh);

      // 7 Exposed Exterior Structural Arch Ribs (exact match to satellite ribs!)
      for (let r = 0; r < 7; r++) {
        const rz = -halfLen + 3.0 + (r / 6) * (halfLen * 2 - 6.0);
        const ribPts = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const a = (t - 0.5) * Math.PI * 0.92;
          const rx = Math.sin(a) * (halfSpan / Math.sin(Math.PI * 0.46));
          const ry = wallH + 0.78 + (Math.cos(a) - Math.cos(Math.PI * 0.46)) / (1 - Math.cos(Math.PI * 0.46)) * archRise;
          ribPts.push(new T.Vector3(rx, ry, rz));
        }
        const curve = new T.CatmullRomCurve3(ribPts);
        const tubeGeo = new T.TubeGeometry(curve, 24, 0.34, 6, false);
        const ribMesh = new T.Mesh(tubeGeo, ribArchMat);
        ribMesh.castShadow = true;
        st.add(ribMesh);
      }

      // SW Grand Entrance Lobby & Colonnade facing the outdoor courts (-X side)
      const lobby = tagPick(new T.Mesh(new T.BoxGeometry(6.5, 5.2, 34.0), concreteMat));
      lobby.position.set(-W / 2 - 2.8, 3.1, 0);
      st.add(lobby);
      const lobbyGlass = new T.Mesh(new T.BoxGeometry(0.4, 3.8, 28.0), glassMat);
      lobbyGlass.position.set(-W / 2 - 6.0, 2.8, 0);
      st.add(lobbyGlass);
      const canopy = new T.Mesh(new T.BoxGeometry(3.8, 0.42, 18.0), darkSteelMat);
      canopy.position.set(-W / 2 - 7.4, 4.9, 0);
      canopy.castShadow = true;
      st.add(canopy);

      group.add(st);
    }

    // --- B. CAMPUS WATERBODY: CHECK-DAM WEIR, CIRCULAR OBSERVATION PIER & LAKESIDE GAZEBO ---
    {
      const waterLevel = 110.15;

      // 1. West Check-Dam Concrete Wall & Footbridge ((384, 311.5) -> (372, 355))
      const damDx = 372.0 - 384.0, damDz = 355.0 - 311.5;
      const damLen = Math.hypot(damDx, damDz);
      const damAng = Math.atan2(damDx, damDz);
      const damGroup = new T.Group();
      damGroup.position.set(378.0, waterLevel, 333.25);
      damGroup.rotation.y = damAng;

      const damWall = new T.Mesh(new T.BoxGeometry(2.8, 4.4, damLen + 4.0), stoneMat);
      damWall.position.y = -0.9;
      damWall.castShadow = true; damWall.receiveShadow = true;
      damGroup.add(damWall);

      const bridgeDeck = new T.Mesh(new T.BoxGeometry(3.6, 0.35, damLen + 5.0), concreteMat);
      bridgeDeck.position.y = 1.35;
      bridgeDeck.castShadow = true; bridgeDeck.receiveShadow = true;
      damGroup.add(bridgeDeck);

      // Railings along check-dam bridge
      for (const sx of [-1.6, 1.6]) {
        const rail = new T.Mesh(new T.BoxGeometry(0.1, 0.95, damLen + 4.0), darkSteelMat);
        rail.position.set(sx, 1.95, 0);
        damGroup.add(rail);
      }
      group.add(damGroup);

      // 2. Over-Water Observation Pier & Circular Viewing Deck ((381.5, 372.5) -> (392.0, 357.0))
      const pDx = 392.0 - 381.5, pDz = 357.0 - 372.5;
      const pLen = Math.hypot(pDx, pDz);
      const pAng = Math.atan2(pDx, pDz);
      const pier = new T.Group();
      pier.position.set(381.5, waterLevel + 0.85, 372.5);

      const walk = new T.Mesh(new T.BoxGeometry(2.4, 0.28, pLen), woodMat);
      walk.position.set(pDx * 0.5, 0, pDz * 0.5);
      walk.rotation.y = pAng;
      walk.castShadow = true; walk.receiveShadow = true;
      pier.add(walk);

      // Pier support pilings in water
      for (let t = 0.2; t <= 0.95; t += 0.25) {
        const pil = new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 3.8, 8), concreteMat);
        pil.position.set(pDx * t, -1.8, pDz * t);
        pier.add(pil);
      }

      // Circular observation deck at end of pier
      const deck = new T.Mesh(new T.CylinderGeometry(4.2, 4.2, 0.32, 24), concreteMat);
      deck.position.set(pDx, 0.02, pDz);
      deck.castShadow = true; deck.receiveShadow = true;
      pier.add(deck);

      const deckRail = new T.Mesh(new T.CylinderGeometry(4.05, 4.05, 0.95, 24, 1, true),
        new T.MeshStandardMaterial({ color: 0x38424a, roughness: 0.4, metalness: 0.7, side: T.DoubleSide, wireframe: true }));
      deckRail.position.set(pDx, 0.55, pDz);
      pier.add(deckRail);
      group.add(pier);

      // 3. Octagonal Terracotta Lakeside Gazebo on North Shore (463, 356)
      const gzY = Math.max(waterLevel + 0.9, heightAt(463.0, 356.0));
      const gazebo = new T.Group();
      gazebo.position.set(463.0, gzY, 356.0);
      const gzBase = new T.Mesh(new T.CylinderGeometry(4.6, 4.9, 0.65, 8), stoneMat);
      gzBase.position.y = 0.2;
      gzBase.castShadow = true; gzBase.receiveShadow = true;
      gazebo.add(gzBase);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = new T.Mesh(new T.CylinderGeometry(0.16, 0.18, 3.0, 8), concreteMat);
        p.position.set(Math.cos(a) * 3.8, 1.9, Math.sin(a) * 3.8);
        p.castShadow = true;
        gazebo.add(p);
      }
      const gzRoof = new T.Mesh(new T.ConeGeometry(5.3, 2.5, 8), terraRibMat);
      gzRoof.position.y = 4.55;
      gzRoof.castShadow = true;
      gazebo.add(gzRoof);
      group.add(gazebo);
    }

    // --- C. Q-PARK (QUANTUM PARK) & OVAL WALKING TRACK (445, 170 & 398, 195) ---
    {
      // 1. Upper Q-Park Stargazing & Hangout Lawn, pulled back off the service-road edge
      const qy = heightAt(441.2, 171.2);
      const qpark = new T.Group();
      qpark.position.set(441.2, qy + 0.08, 171.2);
      // Angled with the service road instead of across it, so the lawn never
      // reaches out over the lane and traps the bus.
      qpark.rotation.y = -18 * Math.PI / 180;

      // Manicured lush green Q-Park lawn pad with stone curb
      const qCurb = new T.Mesh(new T.BoxGeometry(36.0, 0.36, 14.0), stoneMat);
      qCurb.position.y = 0.05;
      qCurb.receiveShadow = true;
      qpark.add(qCurb);
      const qLawn = new T.Mesh(new T.BoxGeometry(34.8, 0.40, 13.0), lawnMat);
      qLawn.position.y = 0.08;
      qLawn.receiveShadow = true;
      qpark.add(qLawn);

      // Two circular stone stargazing seating amphitheatre rings (visible in satellite!)
      for (const ox of [-9.5, 9.5]) {
        const paver = new T.Mesh(new T.CylinderGeometry(5.6, 5.6, 0.44, 28), stoneMat);
        paver.position.set(ox, 0.09, 0);
        paver.receiveShadow = true;
        qpark.add(paver);

        const seatRing = new T.Mesh(new T.TorusGeometry(4.4, 0.42, 8, 28), concreteMat);
        seatRing.rotation.x = Math.PI / 2;
        seatRing.position.set(ox, 0.52, 0);
        seatRing.castShadow = true; seatRing.receiveShadow = true;
        qpark.add(seatRing);
      }

      // Central Q-Park Timber & Steel Garden Pergola + Signpost
      const perg = new T.Group();
      for (const [px, pz] of [[-2.4, -2.0], [2.4, -2.0], [-2.4, 2.0], [2.4, 2.0]]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.11, 0.12, 2.9, 8), darkSteelMat);
        post.position.set(px, 1.65, pz);
        post.castShadow = true;
        perg.add(post);
      }
      for (let r = -2.2; r <= 2.21; r += 0.55) {
        const slat = new T.Mesh(new T.BoxGeometry(5.6, 0.12, 0.16), woodMat);
        slat.position.set(0, 3.12, r);
        slat.castShadow = true;
        perg.add(slat);
      }
      qpark.add(perg);

      // Warm Q-Park garden bollard lights (glow softly at dusk/night!)
      const bollardGlow = new T.MeshStandardMaterial({
        color: 0xffe4b5, roughness: 0.3, emissive: new T.Color(0x000000), emissiveIntensity: 0
      });
      if (nightMaterials) nightMaterials.push({ mat: bollardGlow, color: new T.Color(0xffb85c), intensity: 2.2 });
      for (let bx = -16; bx <= 16; bx += 8) {
        for (const bz of [-5.6, 5.6]) {
          const bol = new T.Mesh(new T.CylinderGeometry(0.10, 0.12, 0.85, 8), darkSteelMat);
          bol.position.set(bx, 0.65, bz);
          qpark.add(bol);
          const cap = new T.Mesh(new T.SphereGeometry(0.14, 8, 8), bollardGlow);
          cap.position.set(bx, 1.12, bz);
          qpark.add(cap);
        }
      }
      group.add(qpark);

      // 2. Lower Oval Walking Track & Green Park ((398.5, 195.0))
      const oy = heightAt(398.5, 195.0);
      const oval = new T.Group();
      oval.position.set(398.5, oy + 0.10, 195.0);
      // Lined up with the lane so the track rim stays clear of the road.
      oval.rotation.y = -18 * Math.PI / 180;

      const trackOuter = new T.Mesh(new T.CylinderGeometry(13.5, 13.8, 0.26, 36), trackMat);
      trackOuter.scale.set(2.55, 1, 1);
      trackOuter.receiveShadow = true;
      oval.add(trackOuter);

      const innerTurf = new T.Mesh(new T.CylinderGeometry(10.2, 10.2, 0.30, 36), lawnMat);
      innerTurf.scale.set(2.45, 1, 1);
      innerTurf.receiveShadow = true;
      oval.add(innerTurf);

      // Park benches along oval track
      for (const bx of [-16, 0, 16]) {
        for (const bz of [-11.5, 11.5]) {
          const bench = new T.Mesh(new T.BoxGeometry(2.2, 0.48, 0.65), woodMat);
          bench.position.set(bx, 0.38, bz);
          bench.castShadow = true;
          oval.add(bench);
        }
      }
      group.add(oval);
    }

    // --- D. SEMI-CIRCULAR ENTRANCE BUS TERMINAL & RECEPTION ARCADE (255, 452) ---
    {
      const cx = 255.0, cz = 454.0;
      const ay = heightAt(cx, cz);
      const arcGroup = new T.Group();
      arcGroup.name = 'entranceBusArcade';
      arcGroup.position.set(cx, ay, cz);
      if (ctx.occlusionGroups) ctx.occlusionGroups.push(arcGroup);

      // Dedicated materials so the camera fade can target the arcade only
      const arcRoomMat = concreteMat.clone();
      arcRoomMat.transparent = true;
      arcRoomMat.depthWrite = false;
      arcRoomMat.userData.occluder = true;
      const arcRoofMat = terraRibMat.clone();
      arcRoofMat.transparent = true;
      arcRoofMat.depthWrite = false;
      arcRoofMat.userData.occluder = true;

      // Curved colonnade spanning from angle -125 deg to +65 deg (radius 27m, exact match to satellite!)
      const R = 27.5, segs = 14;
      const aStart = -2.25, aEnd = 1.05;
      for (let i = 0; i < segs; i++) {
        const a = aStart + (i + 0.5) / segs * (aEnd - aStart);
        const segLen = (R * (aEnd - aStart)) / segs + 0.35;
        const px = Math.cos(a) * R, pz = Math.sin(a) * R;
        const isArch = (i === 4 || i === 5); // Driveable "gateway" arch on the arcade turnaround road
        const bay = new T.Group();
        bay.position.set(px, 0, pz);
        bay.rotation.y = -a + Math.PI / 2;

        // Raised platform (flush in the driveable arch bays)
        if (!isArch) {
          const base = new T.Mesh(new T.BoxGeometry(segLen, 0.9, 7.6), stoneMat);
          base.position.y = 0.1;
          base.receiveShadow = true;
          bay.add(base);
        }

        // Rear office/reception room on alternate/central bays + open colonnade pillars
        if (i >= 3 && i <= 10 && !isArch) {
          const room = new T.Mesh(new T.BoxGeometry(segLen - 0.2, 4.0, 4.4), arcRoomMat);
          room.position.set(0, 2.45, -1.2);
          room.castShadow = true; room.receiveShadow = true;
          bay.add(room);
        }
        const pilL = new T.Mesh(new T.CylinderGeometry(0.24, 0.26, 4.2, 10), concreteMat);
        pilL.position.set(-segLen * 0.42, 2.5, 2.8);
        pilL.castShadow = true;
        bay.add(pilL);

        // Pitched terracotta arcade roof segment
        const roof = new T.Mesh(new T.ConeGeometry(5.6, 2.2, 4), arcRoofMat);
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(segLen / 7.4, 1, 8.6 / 7.4);
        roof.position.set(0, 5.55, 0);
        roof.castShadow = true; roof.receiveShadow = true;
        bay.add(roof);

        arcGroup.add(bay);
      }
      group.add(arcGroup);
    }

    // --- E. COVERED TERRACOTTA STAIRWAY ARCADE ("Stairway to LHC", road index 9) ---
    {
      const stairRoad = D.roads.find(r => r.name && r.name.includes('Stairway to LHC'));
      if (stairRoad && stairRoad.pts.length > 4) {
        const pts = stairRoad.pts;
        for (let i = 0; i < pts.length - 3; i += 4) {
          const p0 = pts[i], p1 = pts[Math.min(pts.length - 1, i + 4)];
          const mx = (p0[0] + p1[0]) * 0.5, mz = (p0[1] + p1[1]) * 0.5;
          const my = (p0[2] + p1[2]) * 0.5;
          const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (len < 1.5) continue;
          const ang = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);

          const seg = new T.Group();
          seg.position.set(mx, my, mz);
          seg.rotation.y = ang;

          const roof = new T.Mesh(new T.BoxGeometry(3.4, 0.35, len + 0.6), terraRibMat);
          roof.position.y = 3.2;
          roof.castShadow = true; roof.receiveShadow = true;
          seg.add(roof);

          for (const sx of [-1.35, 1.35]) {
            const post = new T.Mesh(new T.CylinderGeometry(0.10, 0.11, 3.2, 6), concreteMat);
            post.position.set(sx, 1.6, 0);
            seg.add(post);
          }
          group.add(seg);
        }
      }
    }

    // --- F. HEALTH CENTRE EMERGENCY PORTICO, RED CROSS & AMBULANCE (106.5, -70.5) ---
    {
      const hc = D.buildings.find(b => b.id === '1445926321');
      if (hc) {
        const hy = heightAt(114.0, -80.5);
        const hGroup = new T.Group();
        hGroup.position.set(113.5, hy, -80.0);
        hGroup.rotation.y = -28 * Math.PI / 180;

        // Emergency Ambulance Canopy
        const can = new T.Mesh(new T.BoxGeometry(7.2, 0.42, 5.4), concreteMat);
        can.position.y = 4.1;
        can.castShadow = true;
        hGroup.add(can);
        for (const sx of [-3.1, 3.1]) {
          const p = new T.Mesh(new T.CylinderGeometry(0.18, 0.2, 4.1, 8), concreteMat);
          p.position.set(sx, 2.05, 2.1);
          hGroup.add(p);
        }
        // Glowing Red Cross Medical Emblem
        const redCrossMat = new T.MeshStandardMaterial({
          color: 0xd92b2b, roughness: 0.35, emissive: new T.Color(0xd92b2b), emissiveIntensity: 0.55
        });
        const crossH = new T.Mesh(new T.BoxGeometry(1.5, 0.45, 0.18), redCrossMat);
        crossH.position.set(0, 4.75, 2.72);
        const crossV = new T.Mesh(new T.BoxGeometry(0.45, 1.5, 0.18), redCrossMat);
        crossV.position.set(0, 4.75, 2.72);
        hGroup.add(crossH, crossV);

        // Parked 3D Campus Emergency Ambulance
        const amb = new T.Group();
        amb.position.set(0.5, 0.08, 1.6);
        amb.rotation.y = Math.PI / 2;
        const body = new T.Mesh(new T.BoxGeometry(2.15, 2.1, 5.2),
          new T.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.25, metalness: 0.15 }));
        body.position.y = 1.35;
        body.castShadow = true;
        amb.add(body);
        const stripe = new T.Mesh(new T.BoxGeometry(2.19, 0.28, 5.22), redCrossMat);
        stripe.position.y = 1.25;
        amb.add(stripe);
        const lightBar = new T.Mesh(new T.BoxGeometry(1.2, 0.22, 0.45),
          new T.MeshStandardMaterial({ color: 0x2266ff, emissive: new T.Color(0x2266ff), emissiveIntensity: 0.8 }));
        lightBar.position.set(0, 2.5, 1.6);
        amb.add(lightBar);
        for (const [wx, wz] of [[-0.98, 1.6], [0.98, 1.6], [-0.98, -1.55], [0.98, -1.55]]) {
          const wh = new T.Mesh(new T.CylinderGeometry(0.40, 0.40, 0.28, 12), darkSteelMat);
          wh.rotation.z = Math.PI / 2;
          wh.position.set(wx, 0.40, wz);
          amb.add(wh);
        }
        hGroup.add(amb);
        group.add(hGroup);
      }
    }

    // --- G. SHOPPING COMPLEX SEMI-CIRCULAR RED-BRICK PLAZA & CANOPY (105, -126) ---
    {
      const sy = heightAt(106.0, -126.0);
      const shopGroup = new T.Group();
      shopGroup.position.set(106.0, sy + 0.08, -126.0);

      // Semi-circular terracotta red brick forecourt visible in satellite photo!
      const forecourt = new T.Mesh(new T.CylinderGeometry(23.5, 24.0, 0.26, 32, 1, false, Math.PI * 0.92, Math.PI * 1.08), redBrickMat);
      forecourt.position.set(14.0, 0.0, 0.0);
      forecourt.receiveShadow = true;
      shopGroup.add(forecourt);

      // Diagonal white tensile/concrete entrance canopy visible at (114, -127)
      const diagCanopy = new T.Mesh(new T.BoxGeometry(11.5, 0.45, 7.5),
        new T.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55, metalness: 0.1 }));
      diagCanopy.position.set(8.5, 4.6, -1.5);
      diagCanopy.rotation.y = -32 * Math.PI / 180;
      diagCanopy.castShadow = true;
      shopGroup.add(diagCanopy);

      // Outdoor cafe umbrellas & tables on plaza
      const umbColors = [0xd95b43, 0xe3a25b, 0x3b7a57, 0xd95b43];
      for (let i = 0; i < 4; i++) {
        const ux = 1.5 + (i % 2) * 5.5, uz = -8.0 + Math.floor(i / 2) * 11.0;
        const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2.5, 6), darkSteelMat);
        pole.position.set(ux, 1.35, uz);
        const umb = new T.Mesh(new T.ConeGeometry(1.85, 0.65, 8),
          new T.MeshStandardMaterial({ color: umbColors[i], roughness: 0.75 }));
        umb.position.set(ux, 2.65, uz);
        umb.castShadow = true;
        const tbl = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.08, 12), concreteMat);
        tbl.position.set(ux, 0.85, uz);
        shopGroup.add(pole, umb, tbl);
      }
      group.add(shopGroup);
    }

    // --- H. EXTERIOR SH-45 VITHURA–PONMUDI HIGHWAY GANTRY, TEA STALL, FUEL STATION & VIEWPOINT ---
    const solidObstacles = ctx.solidObstacles || [];
    const addOBB = (cx, cz, hw, hd, rotY, label) => {
      solidObstacles.push({ type: 'obb', cx, cz, hw, hd, cos: Math.cos(rotY || 0), sin: Math.sin(rotY || 0), label });
    };
    const addCircle = (cx, cz, r, label) => {
      solidObstacles.push({ type: 'circle', cx, cz, r, label });
    };

    // Register solid colliders for earlier custom 3D Hero Landmarks so nothing is permeable!
    addOBB(378.0, 333.25, 2.0, 24.5, Math.atan2(-12.0, 43.5), 'Check-Dam Wall');
    addCircle(392.0, 357.0, 4.4, 'Observation Pier');
    addCircle(463.0, 356.0, 4.9, 'Lakeside Gazebo');
    // Collider must match the visible lawn exactly (36x14 at -18deg). The previous
    // box was 39.6x19.6 at +32deg, which reached 3.3m into the service road and
    // stopped the bus on empty grass.
    addOBB(441.2, 171.2, 17.0, 6.4, -18 * Math.PI / 180, 'Q-Park Terrace');
    addOBB(114.2, -79.2, 2.9, 1.5, (-28 + 90) * Math.PI / 180, 'Parked Ambulance');
    addCircle(114.5, -127.5, 1.2, 'Shopping Canopy Pillar');
    {
      // Entrance Bus Arcade semi-circular colonnade bays (solid pillars & reception rooms, leaving central road open!)
      const R = 27.5, segs = 14, aStart = -2.25, aEnd = 1.05;
      for (let i = 0; i < segs; i++) {
        if (i === 4 || i === 5) continue; // Driveable arch bays must stay physically open
        const a = aStart + (i + 0.5) / segs * (aEnd - aStart);
        const bx = 255.0 + Math.cos(a) * R, bz = 454.0 + Math.sin(a) * R;
        const nearRoad = ctx.roadInfoAt ? ctx.roadInfoAt(bx, bz) : null;
        if (nearRoad && nearRoad.dist < nearRoad.halfWidth + 1.7) continue;
        addCircle(bx, bz, 2.25, 'Entrance Bus Arcade');
      }
    }

    {
      // 1. Green Indian State Highway (SH-45) Overhead Direction Gantry outside Main Gate (161, 564)
      const gx = 160.5, gz = 564.0;
      const gy = heightAt(gx, gz);
      const gantry = new T.Group();
      gantry.position.set(gx, gy, gz);
      const hwyAng = Math.atan2(181.3 - 151.5, 575.0 - 560.6);
      gantry.rotation.y = hwyAng;
      for (const sx of [-5.8, 5.8]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.18, 0.22, 6.6, 10), darkSteelMat);
        post.position.set(sx, 3.3, 0);
        post.castShadow = true;
        gantry.add(post);
        const c = Math.cos(hwyAng), s = Math.sin(hwyAng);
        addCircle(gx + sx * c, gz - sx * s, 0.45, 'Highway Gantry Pole');
      }
      const truss = new T.Mesh(new T.BoxGeometry(12.2, 0.35, 0.35), darkSteelMat);
      truss.position.set(0, 6.2, 0);
      gantry.add(truss);

      const gc = document.createElement('canvas'); gc.width = 1024; gc.height = 192;
      const gg = gc.getContext('2d');
      gg.fillStyle = '#0f5c34'; gg.fillRect(0, 0, 1024, 192);
      gg.strokeStyle = '#ffffff'; gg.lineWidth = 8; gg.strokeRect(10, 10, 1004, 172);
      gg.fillStyle = '#ffffff'; gg.font = 'bold 34px system-ui, sans-serif'; gg.textAlign = 'center';
      gg.fillText('◀ VITHURA 3 KM / TVM    ▲ IISER CAMPUS    PONMUDI 19 KM ▶', 512, 82);
      gg.fillStyle = '#ffd54f'; gg.font = 'bold 26px monospace';
      gg.fillText('SH-45 KERALA STATE HIGHWAY · WESTERN GHATS CORRIDOR', 512, 142);
      const gTex = new T.CanvasTexture(gc);
      gTex.encoding = T.sRGBEncoding;
      const gSignMat = new T.MeshStandardMaterial({ map: gTex, roughness: 0.35, metalness: 0.1 });
      for (const sz of [-0.24, 0.24]) {
        const board = new T.Mesh(new T.PlaneGeometry(10.4, 1.75), gSignMat);
        board.position.set(0, 6.15, sz);
        if (sz < 0) board.rotation.y = Math.PI;
        gantry.add(board);
      }
      group.add(gantry);

      // Roadside Kerala Tea Shop & Bakery right outside Main Gate (163, 578)
      const tx = 163.0, tz = 580.5, ty = heightAt(tx, tz);
      const teaShop = new T.Group();
      teaShop.position.set(tx, ty, tz);
      teaShop.rotation.y = hwyAng + Math.PI;
      const shopBody = new T.Mesh(new T.BoxGeometry(9.2, 3.4, 5.4),
        new T.MeshStandardMaterial({ map: wallTex, color: 0xf4ebd9, roughness: 0.85 }));
      shopBody.position.y = 1.7; shopBody.castShadow = true; shopBody.receiveShadow = true;
      const shopRoof = new T.Mesh(new T.ConeGeometry(6.8, 2.0, 4), terraRibMat);
      shopRoof.rotation.y = Math.PI / 4; shopRoof.scale.set(1.15, 1, 0.72);
      shopRoof.position.y = 4.35; shopRoof.castShadow = true;
      const awning = new T.Mesh(new T.BoxGeometry(9.4, 0.16, 2.2),
        new T.MeshStandardMaterial({ color: 0x1e6b9e, roughness: 0.6 }));
      awning.position.set(0, 2.65, 3.4); awning.rotation.x = 0.18;
      teaShop.add(shopBody, shopRoof, awning);
      group.add(teaShop);
      addOBB(tx, tz, 4.8, 3.0, hwyAng + Math.PI, 'Main Gate Roadside Bakery');

      // 2. Vithura Highway Fuel Station & KSRTC Bus Stand (-119, 619)
      // Set back from the carriageway and turned to sit ALONG the SH-45 shoulder.
      // At 0.22rad its 24m pad lay across the highway and one pump island stood
      // 4.1m inside the lane.
      const FROT = 1.36;
      const fx = -119.3, fz = 619.4, fy = heightAt(fx, fz);
      const fuel = new T.Group();
      fuel.position.set(fx, fy, fz);
      fuel.rotation.y = FROT;
      const fPad = new T.Mesh(new T.BoxGeometry(24.0, 0.24, 14.0), concreteMat);
      fPad.position.y = 0.08; fPad.receiveShadow = true;
      fuel.add(fPad);
      const fCanopy = new T.Mesh(new T.BoxGeometry(18.0, 0.85, 9.5),
        new T.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.35 }));
      fCanopy.position.y = 5.6; fCanopy.castShadow = true;
      const fBand = new T.Mesh(new T.BoxGeometry(18.2, 0.42, 9.7),
        new T.MeshStandardMaterial({ color: 0xe65c19, roughness: 0.3, emissive: new T.Color(0xe65c19), emissiveIntensity: 0.25 }));
      fBand.position.y = 5.65;
      fuel.add(fCanopy, fBand);
      for (const px of [-5.5, 5.5]) {
        const col = new T.Mesh(new T.CylinderGeometry(0.32, 0.35, 5.6, 12), concreteMat);
        col.position.set(px, 2.8, 0); col.castShadow = true;
        const pump = new T.Mesh(new T.BoxGeometry(1.1, 1.85, 0.75),
          new T.MeshStandardMaterial({ color: 0x185296, roughness: 0.35 }));
        pump.position.set(px, 1.0, 1.45); pump.castShadow = true;
        fuel.add(col, pump);
        const c = Math.cos(FROT), s = Math.sin(FROT);
        addCircle(fx + px * c, fz - px * s, 1.15, 'Fuel Pump Island');
      }
      const fOffice = new T.Mesh(new T.BoxGeometry(12.0, 3.8, 5.6), concreteMat);
      fOffice.position.set(0, 1.9, 9.2); fOffice.castShadow = true; fOffice.receiveShadow = true;
      fuel.add(fOffice);
      addOBB(fx + Math.sin(FROT) * 9.2, fz + Math.cos(FROT) * 9.2, 6.2, 3.0, FROT, 'Fuel Station Office');
      group.add(fuel);

      // 3. Golden Valley / Ponmudi Ghat Viewpoint Pavilion & Forest Checkpost (437, 796)
      // Nudged off the carriageway: the 6.4m pavilion circle previously reached
      // 2.3m into the highway.
      const vx = 437.4, vz = 796.4, vy = heightAt(vx, vz);
      const vp = new T.Group();
      vp.position.set(vx, vy, vz);
      const vpBase = new T.Mesh(new T.CylinderGeometry(6.2, 6.6, 0.75, 8), stoneMat);
      vpBase.position.y = 0.25; vpBase.receiveShadow = true; vpBase.castShadow = true;
      vp.add(vpBase);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = new T.Mesh(new T.CylinderGeometry(0.18, 0.2, 3.4, 8), concreteMat);
        p.position.set(Math.cos(a) * 5.0, 2.0, Math.sin(a) * 5.0); p.castShadow = true;
        vp.add(p);
      }
      const vpRoof = new T.Mesh(new T.ConeGeometry(6.8, 2.8, 8), terraRibMat);
      vpRoof.position.y = 5.1; vpRoof.castShadow = true;
      vp.add(vpRoof);
      group.add(vp);
      addCircle(vx, vz, 6.4, 'Golden Valley Viewpoint Pavilion');
    }

    scene.add(group);
    return group;
  };
})();
