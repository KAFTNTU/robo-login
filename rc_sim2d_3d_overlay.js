(function(){
  'use strict';

  const DEFAULTS = {
    assetBase: './rc3d_assets',
    sensorModel: 'sensor.glb',
    texTop: 'top.jpg',
    texSideLong: 'side_long.jpg',
    texSideShort: 'side_short.jpg',
    texChassis: 'chassis.png',

    // Mapping between 2D pixels and 3D units
    pxPerUnit: 50,
    carScale: 0.6,

    // Car tuning
    // Slightly higher so wheels don't clip below the ground plane
    carHeight: 0.22,
    coverY: 0.65,
    wheelRadius: 0.50,

    // Sensor mounts (relative to car origin)
    // Sensors sit on the cover (near the top surface).
    // Slightly lower so sensors sit on the board (the mount code will keep them on the surface).
    // Put sensors on the TOP surface of the cover (not inside it).
    // coverY = center of the cover box; cover height is 0.625, so top surface is coverY + 0.3125.
    sensorY: 0.65 + 0.3125 + 0.01,
    sensorScale: 0.06,

    // Ray rendering
    rayOpacity: 0.45,
  };

  function waitFor(cond, timeoutMs=10000){
    const t0 = performance.now();
    return new Promise((resolve, reject)=>{
      const loop = ()=>{
        if (cond()) return resolve();
        if (performance.now() - t0 > timeoutMs) return reject(new Error('timeout'));
        requestAnimationFrame(loop);
      };
      loop();
    });
  }

  function ensureStyle(){
    if (document.getElementById('rc3d-style')) return;
    const s = document.createElement('style');
    s.id = 'rc3d-style';
    s.textContent = `
      .rc3d-wrap{ position:absolute; inset:0; pointer-events:none; }
      .rc3d-wrap canvas{ pointer-events:auto; }
      .rc3d-canvas{
        border-radius: 18px;
        border: 1px solid rgba(148,163,184,0.22);
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
      }
      /* (hint removed) */
    
      .rc3d-menu{
        position:absolute;
        z-index: 50;
        pointer-events: auto; /* wrap has pointer-events:none; menu must still be clickable */
        min-width: 180px;
        background: rgba(17,24,39,0.98);
        border: 1px solid rgba(148,163,184,0.25);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.55);
        backdrop-filter: blur(10px);
        user-select:none;
      }
      .rc3d-menu-title{
        font-weight: 800;
        font-size: 13px;
        padding: 6px 8px 8px 8px;
        color: #e2e8f0;
        border-bottom: 1px solid rgba(148,163,184,0.18);
        margin-bottom: 6px;
      }
      .rc3d-menu-item{
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 13px;
        cursor: pointer;
      }
      .rc3d-menu-item:hover{ background: rgba(59,130,246,0.18); }
      .rc3d-menu-item-muted{ opacity: 0.75; }

      .rc3d-tooltip{
        position:absolute;
        z-index: 60;
        pointer-events:none;
        background: rgba(15,23,42,0.95);
        border: 1px solid rgba(148,163,184,0.25);
        color: #e5e7eb;
        padding: 6px 8px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
        box-shadow: 0 10px 20px rgba(0,0,0,0.45);
        transform: translateZ(0);
      }
`;
    document.head.appendChild(s);
  }

  function makeOverlayCanvas(host){
    const c = document.createElement('canvas');
    c.className = 'rc3d-canvas';
    Object.assign(c.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      background: 'transparent', touchAction: 'none'
    });
    host.appendChild(c);
    return c;
  }

  function getLoader(THREE){
    return THREE.GLTFLoader || window.GLTFLoader || null;
  }

  async function loadTexture(THREE, url){
    const tl = new THREE.TextureLoader();
    return new Promise((resolve)=>{
      tl.load(url, (t)=>{
        // support r150+ colorSpace
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        resolve(t);
      }, undefined, ()=>resolve(null));
    });
  }

  async function loadSensorGLB(THREE, url){
    // Match bibipN behaviour: load GLB, apply a known-good scale/orientation,
    // then center X/Z and put the bottom on Y=0.
    const L = getLoader(THREE);
    if (!L) return null;
    const loader = new L();

    return new Promise((resolve)=>{
      loader.load(url, (gltf)=>{
        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
        if (!scene) return resolve(null);

        try{
          // Scale/orientation like bibipN
          const s = 0.025;
          scene.scale.set(s, s, s);
          scene.rotation.set(-Math.PI/2, 0, Math.PI);

          // Center & ground
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const center = box.getCenter(new THREE.Vector3());
          scene.position.x += (0 - center.x);
          scene.position.z += (0 - center.z);
          scene.position.y -= box.min.y;

          scene.traverse((child)=>{
            if (child && child.isMesh){
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Tag so we don't override its rotation later.
          scene.userData = scene.userData || {};
          scene.userData.__rc3dIsSensorGLB = true;
        }catch(e){}

        resolve(scene);
      }, undefined, ()=>resolve(null));
    });
  }

  // Simple gear mesh (extruded)
  function createGearMesh(THREE, {teeth=16, outerR=0.48, innerR=0.40, thickness=0.06, holeR=0.09, color=null}={}){
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / teeth;
    for (let i=0;i<teeth;i++){
      const a1=i*step;
      const a2=a1+step*0.25;
      const a3=a1+step*0.50;
      if (i===0) shape.moveTo(Math.cos(a1)*innerR, Math.sin(a1)*innerR);
      else shape.lineTo(Math.cos(a1)*innerR, Math.sin(a1)*innerR);
      shape.lineTo(Math.cos(a1)*outerR, Math.sin(a1)*outerR);
      shape.lineTo(Math.cos(a2)*outerR, Math.sin(a2)*outerR);
      shape.lineTo(Math.cos(a3)*innerR, Math.sin(a3)*innerR);
    }
    const hole = new THREE.Path();
    hole.absarc(0,0,holeR,0,Math.PI*2,true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    geo.translate(0,0,-thickness/2);
    const mat = new THREE.MeshStandardMaterial({color: (color!=null)? color : 0x222222, roughness: 0.65, metalness: 0.1});
    const mesh = new THREE.Mesh(geo, mat);
    // IMPORTANT: keep the gear face in the XY plane (normal +Z).
    // We rotate individual gears later to make them stand vertically on the car sides.
    return mesh;
  }

  function buildCar(THREE, opts, textures){
    const root = new THREE.Group();

    // IMPORTANT: Lights must NOT be parented to the car.
    // Otherwise the world gets darker/brighter as the car moves/rotates.
    // Scene lights are created in start().

    // frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.75, metalness: 0.15 });
    const sideGeo = new THREE.BoxGeometry(0.15, 0.30, 4.0);
    const leftBeam = new THREE.Mesh(sideGeo, frameMat); leftBeam.position.set(-0.85, opts.carHeight, 0);
    const rightBeam= new THREE.Mesh(sideGeo, frameMat); rightBeam.position.set( 0.85, opts.carHeight, 0);
    root.add(leftBeam, rightBeam);

    const crossGeo = new THREE.BoxGeometry(1.55, 0.30, 0.15);
    const frontCross = new THREE.Mesh(crossGeo, frameMat); frontCross.position.set(0, opts.carHeight, -0.8);
    const backCross  = new THREE.Mesh(crossGeo, frameMat); backCross.position.set(0, opts.carHeight,  0.8);
    root.add(frontCross, backCross);

    const centerBeamGeo = new THREE.BoxGeometry(0.30, 0.30, 1.6);
    const centerBeam = new THREE.Mesh(centerBeamGeo, frameMat); centerBeam.position.set(0, opts.carHeight, 0);
    root.add(centerBeam);

    // pegs/shafts for wheels + gears
    const pegMat = new THREE.MeshStandardMaterial({color:0xaaaaaa, roughness:0.35, metalness:0.8});
    // Wheel shafts (slimmer, and long enough to reach the frame)
    // Frame beams are at x=±0.85.
    const pegR = 0.045;
    const wheelPegPos = [
      // Keep bibipN Z spacing, but bring wheels a bit closer to the body so they sit near the gear train.
      [-1.22, opts.carHeight, -1.2],
      [ 1.22, opts.carHeight, -1.2],
      [-1.22, opts.carHeight,  1.2],
      [ 1.22, opts.carHeight,  1.2],
    ];
    wheelPegPos.forEach((p)=>{
      const sign = (p[0] < 0) ? -1 : 1;
      // Wheel outer face: wheel thickness is 0.25 (see tireGeo), so half thickness = 0.125
      const outerX = Math.abs(p[0]) + 0.125;
      const innerX = 0.85; // frame beam x
      // Shorten axles so they don't overhang too much.
      const axleLen = Math.max(0.10, (outerX - innerX) + 0.01);
      const pegGeo = new THREE.CylinderGeometry(pegR, pegR, axleLen, 18);
      const peg = new THREE.Mesh(pegGeo, pegMat);
      // Cylinder axis along X (wheel axle)
      peg.rotation.z = Math.PI/2;
      // Center the axle between the frame and the wheel outer face so it touches the chassis.
      const cx = (innerX + outerX) / 2;
      peg.position.set(sign * cx, opts.carHeight, p[2]);
      root.add(peg);
    });

    // cover (textured)
    const fallback = new THREE.MeshStandardMaterial({ color: (opts && opts.playerColor!=null) ? opts.playerColor : 0x2dd4bf, roughness: 0.5, metalness: 0.05 });
    const matTop   = textures.top   ? new THREE.MeshStandardMaterial({ map:textures.top, roughness:0.7, metalness:0.05 }) : fallback;
    const matLong  = textures.long  ? new THREE.MeshStandardMaterial({ map:textures.long, roughness:0.7, metalness:0.05 }) : fallback;
    const matShort = textures.short ? new THREE.MeshStandardMaterial({ map:textures.short, roughness:0.7, metalness:0.05 }) : fallback;
    const coverGeo = new THREE.BoxGeometry(1.9, 0.625, 4.0);
    // material order: +x,-x,+y,-y,+z,-z
    const mats=[matShort, matShort, matTop, fallback, matLong, matLong];
    const cover = new THREE.Mesh(coverGeo, mats);
    // Make the green cover a bit larger (+15%) so the robot looks more volumetric.
    cover.scale.set(1.15, 1.0, 1.15);
    cover.position.set(0, opts.coverY, 0);
    root.add(cover);
    root.userData.cover = cover;

    // direction marker (yellow dot) at "front"
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({color:0xfbbf24, roughness:0.3}));
    dot.position.set(0, opts.coverY+0.15, -1.9 * 1.15);
    root.add(dot);

    // wheels
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness:0.92, metalness:0.05 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness:0.25, metalness:0.8 });
    const tireGeo = new THREE.CylinderGeometry(opts.wheelRadius, opts.wheelRadius, 0.25, 24);
    tireGeo.rotateZ(Math.PI/2);
    const rimGeo = new THREE.CylinderGeometry(opts.wheelRadius*0.60, opts.wheelRadius*0.60, 0.26, 16);
    rimGeo.rotateZ(Math.PI/2);

    function makeWheel(){
      const g = new THREE.Group();
      g.add(new THREE.Mesh(tireGeo, tireMat));
      g.add(new THREE.Mesh(rimGeo, rimMat));
      return g;
    }

    const wheels=[];
    for (let i=0;i<4;i++){
      const w = makeWheel();
      w.position.set(wheelPegPos[i][0], opts.carHeight, wheelPegPos[i][2]);
      wheels.push(w);
      root.add(w);
    }
    root.userData.wheels = wheels;

    // simple gears on top of the center beam
    const shaftGeo = new THREE.CylinderGeometry(0.05,0.05,0.9,12);
    const shaft = new THREE.Mesh(shaftGeo, pegMat);
    shaft.rotation.x = Math.PI/2;
    shaft.position.set(0, opts.carHeight+0.25, 0);
    root.add(shaft);

    // gears: match bibipN placement/size
    // Each gear is a group: fixed "standing" orientation + an inner mesh that spins.
    const gears = [];
    // User feedback: gears are too large. Reduce overall size by ~25%.
    const gearScale = 0.75;
    // Keep the tooth profile the same, but scale the whole mesh.
    const gearOuterR = 0.55;
    const gearInnerR = 0.46;
    // Snap positions:
    //  - make both sides 4 gears so the train is symmetric and meshes better.
    const leftZ  = [-1.2, -0.4, 0.4, 1.2];
    const rightZ = [-1.2, -0.4, 0.4, 1.2];

    function addGear(x, y, z, idxInSide, sideSign){
      // Smaller bore (user feedback: hole was too large)
      const mesh = createGearMesh(THREE, {teeth: 16, outerR: gearOuterR, innerR: gearInnerR, thickness: 0.05, holeR: 0.06, color: (opts && opts.gearColor!=null) ? opts.gearColor : null});
      mesh.scale.setScalar(gearScale);

      const g = new THREE.Group();

      // Gear shaft/pin so the gear doesn't look like it floats.
      // Shorter pins so they don't stick out too much.
      const gearPegLen = 0.18;
      // Slimmer pin so it fits the smaller bore.
      const gearPegGeo = new THREE.CylinderGeometry(0.04, 0.04, gearPegLen, 16);
      const gearPeg = new THREE.Mesh(gearPegGeo, pegMat);
      // IMPORTANT: the gear group is rotated around Y to "stand" on the side.
      // So we align the peg with local Z first (rotation.x), then group rotation makes it point along world ±X.
      gearPeg.rotation.x = Math.PI/2; // axis along Z
      // Place mostly outside, but still touching the body side.
      gearPeg.position.z = sideSign*(0.005 + gearPegLen/2);
      g.add(gearPeg);

      g.add(mesh);

      // Stand on the side: gear face points outward along ±X.
      g.rotation.y = Math.PI/2;
      g.position.set(x, y, z);

      g.userData.spinMesh = mesh;
      g.userData.sideSign = sideSign;      // -1 left, +1 right
      g.userData.idxInSide = idxInSide;    // 0..N-1
      root.add(g);
      gears.push(g);
    }

    // Put gears on the *outside* of the cover (otherwise they get hidden inside the body)
    // Cover half-width is 0.95, so push a bit further out.
    const gearY = opts.carHeight; // align with wheel axle height
    // Bring gears closer to the body so they "touch" the cover instead of floating near the wheels.
    // cover half-width ~0.95, gear thickness ~0.05 => center around ~0.995 touches the side.
    // Move gears a bit closer to the wheels (user feedback: wheels too far from gears).
    const gearX = 1.08;

    leftZ.forEach((z, idx)=> addGear(-gearX, gearY, z, idx, -1));
    rightZ.forEach((z, idx)=> addGear( gearX, gearY, z, idx, +1));

    root.userData.gears = gears;


    // sensor mounts
    const mounts = [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()];
    // Default: 4 corners of the top cover (a "square" layout).
    // This prevents the "all sensors are in one point" look.
    const sx = 0.72;
    const sz = 0.92;
    mounts[0].position.set(-sx, opts.sensorY, -sz); // front-left
    mounts[1].position.set( sx, opts.sensorY, -sz); // front-right
    mounts[2].position.set(-sx, opts.sensorY,  sz); // back-left
    mounts[3].position.set( sx, opts.sensorY,  sz); // back-right
    mounts.forEach(m=>root.add(m));
    root.userData.sensorMounts = mounts;

    return root;
  }

  function buildRays(THREE, opacity){
    const group = new THREE.Group();
    const rays=[];
    for (let i=0;i<4;i++){
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
      const mat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent:true, opacity: opacity });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      group.add(line);
      rays.push(line);
    }
    group.userData.rays = rays;
    return group;
  }

  // Simple built-in sensor models (no GLB dependency)
  // - distance: HC-SR04-like (blue board + two "eyes")
  // - line: 2-LED reflective sensor-like (small board + two diodes looking down)
  function makeDistanceSensorModel(THREE){
    const g = new THREE.Group();

    const matBoard = new THREE.MeshStandardMaterial({ color:0x1d4ed8, roughness:0.7, metalness:0.05 });
    const matEye   = new THREE.MeshStandardMaterial({ color:0x9ca3af, roughness:0.25, metalness:0.8 });

    // Board
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.18), matBoard);
    board.position.y = 0.06;
    g.add(board);

    // Small connector block (adds depth/detail)
    const connMat = new THREE.MeshStandardMaterial({ color:0x0f172a, roughness:0.65, metalness:0.15 });
    const conn = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), connMat);
    conn.position.set(0, 0.12, 0.05);
    g.add(conn);

    // Pin heads
    const pinMat = new THREE.MeshStandardMaterial({ color:0xd1d5db, roughness:0.3, metalness:0.9 });
    const pinGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.03, 10);
    for (let i=-2;i<=2;i++){
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.rotation.x = Math.PI/2;
      pin.position.set(i*0.035, 0.12, 0.085);
      g.add(pin);
    }

    // "Eyes" facing forward (local -Z)
    const eyeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18);
    eyeGeo.rotateX(Math.PI/2);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    const eyeR = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-0.07, 0.07, -0.095);
    eyeR.position.set( 0.07, 0.07, -0.095);
    g.add(eyeL, eyeR);

    // Semi-transparent red beam forward (local -Z)
    const beamMat = new THREE.MeshBasicMaterial({ color:0xff0000, transparent:true, opacity:0.22, depthWrite:false });
    const beamLen = 2.2;
    const beamR = 0.03;
    const beamGeo = new THREE.CylinderGeometry(beamR, beamR, beamLen, 14, 1, true);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = Math.PI/2;
    beam.position.set(0, 0.07, -beamLen/2);
    beam.renderOrder = 10;
    g.add(beam);
    g.userData.__beam = beam;

    // Keep distance sensor readable, but not so large that it visually "floats" above the cover.
    g.scale.setScalar(2.4);
    return g;
  }

  function makeLineSensorModel(THREE){
    const g = new THREE.Group();

    const matBody = new THREE.MeshStandardMaterial({ color:0x111827, roughness:0.85, metalness:0.05 });
    const matLED  = new THREE.MeshStandardMaterial({
      color:0xfbbf24,
      roughness:0.4,
      metalness:0.1,
      emissive:0x332200,
      emissiveIntensity:0.9
    });

    // PCB base
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.34), new THREE.MeshStandardMaterial({ color:0x0b3b2e, roughness:0.7, metalness:0.05 }));
    pcb.position.set(0, 0.0, -0.10);
    g.add(pcb);

    // Protective cap / body
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.32), matBody);
    stick.position.set(0, 0.02, -0.10);
    g.add(stick);

    // Tiny lens window
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.05), new THREE.MeshStandardMaterial({ color:0x111827, roughness:0.15, metalness:0.5 }));
    lens.position.set(0, 0.02, -0.27);
    g.add(lens);

    // LEDs on the bottom, facing DOWN
    const ledGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 14);
    const ledL = new THREE.Mesh(ledGeo, matLED);
    const ledR = new THREE.Mesh(ledGeo, matLED);
    ledL.position.set(-0.015, -0.02, -0.22);
    ledR.position.set( 0.015, -0.02, -0.22);
    g.add(ledL, ledR);

    // Semi-transparent red scan beam DOWN from the left LED
    const beamMat = new THREE.MeshBasicMaterial({ color:0xff0000, transparent:true, opacity:0.20, depthWrite:false });
    const downLen = 0.8;
    const downGeo = new THREE.CylinderGeometry(0.02, 0.02, downLen, 12, 1, true);
    const down = new THREE.Mesh(downGeo, beamMat);
    down.position.set(ledL.position.x, ledL.position.y - downLen/2, ledL.position.z);
    down.renderOrder = 10;
    g.add(down);
    g.userData.__scan = down;

    // Save LEDs for mode-based styling
    g.userData.__ledL = ledL;
    g.userData.__ledR = ledR;

    // Slightly bigger so it's visible
    g.scale.setScalar(2.7);
    return g;
  }

  function createBuiltInOrbitControls(canvas, camera, target){
    // minimal orbit controls (no dependency)
    let isDown=false;
    let button=0;
    let lastX=0, lastY=0;

    let enabled = true;

    // spherical
    const state = {
      yaw: Math.PI/4,
      // No inversion toggles – keep controls consistent.
      pitch: 0.55,
      dist: 8,
      distTarget: 8,
      panX: 0,
      panY: 0,
    };

    function updateCamera(){
      // Smooth zoom for nicer feel.
      state.dist += (state.distTarget - state.dist) * 0.18;
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      const x = (state.dist * cp) * sy;
      const y = (state.dist * sp);
      const z = (state.dist * cp) * cy;
      camera.position.set(target.x + state.panX + x, target.y + state.panY + y, target.z + z);
      camera.lookAt(target.x + state.panX, target.y + state.panY, target.z);
    }

    updateCamera();

    function onDown(e){
      if (!enabled) return;
      isDown=true;
      button = e.button;
      lastX=e.clientX; lastY=e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    }
    function onUp(e){
      isDown=false;
      canvas.releasePointerCapture?.(e.pointerId);
    }
    function onMove(e){
      if (!enabled) return;
      if (!isDown) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX=e.clientX; lastY=e.clientY;
      if (button===2){
        // pan (inverted)
        state.panX += ( dx) * 0.005;
        state.panY += (-dy) * 0.005;
      } else {
        // orbit (inverted)
        state.yaw += (-dx) * 0.005;
        state.pitch += ( dy) * 0.005;
        state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch));
      }
      updateCamera();
    }
    function onWheel(e){
      if (!enabled) return;
      e.preventDefault();
      const k = Math.sign(e.deltaY);
      state.distTarget *= (k>0 ? 1.10 : 0.90);
      state.distTarget = Math.max(1.5, Math.min(40, state.distTarget));
      updateCamera();
    }

    // Disable browser menu (we use our own)
    canvas.addEventListener('contextmenu', (e)=>e.preventDefault());
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, {passive:false});

    return {
      updateCamera,
      tick(){ updateCamera(); },
      setEnabled(v){ enabled = !!v; },
      get enabled(){ return enabled; },
      _state: state,
    };
  }

  async function start(userOpts){
    if (!window.THREE) throw new Error('THREE not found');
    const THREE = window.THREE;
    const opts = Object.assign({}, DEFAULTS, userOpts||{});

    // Let the 2D renderer know we're in 3D-only mode (prevents the 2D car from flashing for 1 frame).
    window.RC3D_MODE = true;
    ensureStyle();

    // Wait until simulator creates its canvas and root
    await waitFor(()=> window.RCSim2D && window.RCSim2D._sim && window.RCSim2D._sim.canvas && window.RCSim2D._sim.canvas.parentElement, 12000);

    const sim = window.RCSim2D._sim;
    const canvas2d = sim.canvas;
    const host = canvas2d.parentElement;

    // Hide the 2D canvas visuals entirely (keep it running for physics & data).
    // This also removes the "old car" one-frame flash on first open.
    canvas2d.style.opacity = '0';
    canvas2d.style.pointerEvents = 'none';
    host.style.background = '#0b1220';

    // overlay wrapper
    const wrap = document.createElement('div');
    wrap.className = 'rc3d-wrap';
    host.appendChild(wrap);

    const canvas3d = makeOverlayCanvas(wrap);

    // Let the 2D editor (obstacles/sensors) work: disable 3D pointer events while editing.
    function syncPointerEvents(){
      // 3D overlay handles editing directly; keep pointer events always enabled.
      canvas3d.style.pointerEvents = 'auto';
    }
    syncPointerEvents();

    // (UI hint removed)
    // --- 3D obstacle tool (replaces sidebar obstacle UI) ---
    const obsUI = document.createElement('div');
    obsUI.className = 'rc3d-menu';
    obsUI.style.display = 'none';
    wrap.appendChild(obsUI);

    // Hover tooltip for sensors (e.g., S1..S4)
    const hoverTip = document.createElement('div');
    hoverTip.className = 'rc3d-tooltip';
    hoverTip.style.display = 'none';
    wrap.appendChild(hoverTip);

    const obstacleTool = {
      active: false,
      type: 'rect', // rect | square | circle
    };

    // --- Custom line track drawing tool ---
    const lineTool = {
      active: false,
      drawing: false,
      pts: [],
    };

    // Move robot with Space + LMB drag.
    // This is handy when the user drew a line but the robot starts off the line.
    const robotDrag = {
      active: false,
      lastX: 0,
      lastY: 0,
    };

    // Rotate robot in place: hold R + LMB drag (must start on robot).
    const robotRotate = {
      active: false,
      lastX: 0,
    };

    // In online sumo mode, disable any gestures that can reposition/rotate the robot (anti-cheat).
    function isOnlineSumo(sim){
      try{
        return !!(sim && sim.track && sim.track.kind==='sumo' && sim.online && sim.online.ws && sim.online.ws.readyState===1);
      }catch(e){ return false; }
    }


    // Space key state (used for robot dragging).
    let spaceDown = false;
    // R key state (used for in-place robot rotation).
    let rDown = false;
    window.addEventListener('keydown', (e)=>{
      if (e.code === 'Space'){
        spaceDown = true;
        // prevent page scroll
        e.preventDefault();
      }
      if (e.code === 'KeyR'){
        rDown = true;
      }
    }, {capture:true});
    window.addEventListener('keyup', (e)=>{
      if (e.code === 'Space'){
        spaceDown = false;
        e.preventDefault();
      }
      if (e.code === 'KeyR'){
        rDown = false;
      }
    }, {capture:true});

    function ensureCustomLineTrack(){
      // rc_sim2d.js exposes tracks as window.RCSim2D_TRACKS
      const T = window.RCSim2D_TRACKS;
      if (!T) return null;
      if (!T.CustomLine){
        T.CustomLine = {
          kind: 'line',
          lineWidth: 12,
          line: [],
          start: {x:0,y:0,a:0},
          theme: {
            bg: '#f7f7f8',
            grid: 'rgba(0,0,0,0.05)',
            roadOuter: 'rgba(0,0,0,0.08)',
            roadMain: 'rgba(0,0,0,0.96)',
          }
        };
      }
      return T.CustomLine;
    }

    function enableLineTool(){
      lineTool.active = true;
      lineTool.drawing = false;
      // disable obstacle placement while drawing
      obstacleTool.active = false;
      const tr = ensureCustomLineTrack();
      if (tr){
        // keep current points if any
        tr.line = Array.isArray(tr.line) ? tr.line : [];
        if (typeof sim.setTrack === 'function') sim.setTrack('CustomLine');
      }
      setOrbitEnabled(false);
    }

    function disableLineTool(){
      lineTool.active = false;
      lineTool.drawing = false;
      setOrbitEnabled(true);
    }

    function clearCustomLine(){
      const tr = ensureCustomLineTrack();
      if (tr){
        tr.line = [];
        if (sim.track && sim.track.kind==='line') sim.track.line = tr.line;
      }
      lineTool.pts = [];
      _trackKey = '';
      try{ syncTrack3D(); }catch(e){}
    }

    // Orbit controls are created later. We still want to be able to enable/disable them from here.
    function setOrbitEnabled(v){
      try{
        if (orbit) orbit.enabled = !!v;
        if (builtin) builtin.setEnabled(!!v);
      }catch(e){}
    }

    function closeObsMenu(){
      obsUI.style.display = 'none';
    }

    function openObsMenu(x, y){
      obsUI.style.left = x + 'px';
      obsUI.style.top = y + 'px';
      obsUI.style.display = 'block';
    }

    function setObstacleType(t){
      obstacleTool.type = t;
      obstacleTool.active = true;
      sim.obstacleType = t;
      if (typeof sim._syncObsInputs === 'function') sim._syncObsInputs();
      try{ if (typeof makeGhostForType === 'function') makeGhostForType(t); }catch(e){}
      // keep menu open; user closes it with RMB
      setOrbitEnabled(false);
    }

    function disableObstacleTool(){
      obstacleTool.active = false;
      setOrbitEnabled(true);
    }

    // Right click toggles the obstacle menu (unless RMB is used to move a sensor)
    let suppressMenuUntil = 0;
    let obstacleMenuOpen = false;

    function buildObsMenu(){
      obsUI.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'rc3d-menu-title';
      title.textContent = 'Перешкоди';
      obsUI.appendChild(title);

      const items = [
        {t:'rect',  label:'Прямокутник'},
        {t:'square',label:'Квадрат'},
        {t:'circle',label:'Коло'},
      ];
      items.forEach(it=>{
        const b = document.createElement('div');
        b.className = 'rc3d-menu-item';
        const isSel = (obstacleTool.type === it.t);
        b.textContent = (isSel ? '✓ ' : '') + it.label;
        b.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); setObstacleType(it.t); });
        obsUI.appendChild(b);
      });

      // Line drawing is only available in "line-follow" mode, specifically on the "CustomLine" track.
      const allowLineEdit = (sim.trackName === 'CustomLine');
      if (allowLineEdit){
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px; background: rgba(148,163,184,0.18); margin: 8px 0;';
        obsUI.appendChild(sep);

        const t2 = document.createElement('div');
        t2.className = 'rc3d-menu-title';
        t2.textContent = 'Лінія';
        obsUI.appendChild(t2);

        const draw = document.createElement('div');
        draw.className = 'rc3d-menu-item';
        draw.textContent = (lineTool.active ? '✓ ' : '') + 'Малювати трасу';
        draw.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation();
          if (lineTool.active){ disableLineTool(); }
          else { enableLineTool(); }
          buildObsMenu();
        });
        obsUI.appendChild(draw);

        const clear = document.createElement('div');
        clear.className = 'rc3d-menu-item rc3d-menu-item-muted';
        clear.textContent = 'Очистити лінію';
        clear.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); clearCustomLine(); buildObsMenu(); });
        obsUI.appendChild(clear);
      } else {
        // If we switched away from CustomLine, disable line tool.
        if (lineTool.active) disableLineTool();
      }

      // (removed) hint text — user asked to hide it
    }

    function toggleObsMenu(clientX, clientY){
      if (obstacleMenuOpen){
        closeObsMenu();
        obstacleMenuOpen = false;
        // Turn off obstacle placement when menu is closed.
        if (!lineTool.active) disableObstacleTool();
        return;
      }
      buildObsMenu();
      const rect = canvas3d.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      openObsMenu(cx, cy);
      obstacleMenuOpen = true;
      // Enable placement immediately with the current type (default: square),
      // unless we are in line-drawing mode.
      if (!lineTool.active){
        if (!obstacleTool.type) obstacleTool.type = 'square';
        obstacleTool.active = true;
      } else {
        obstacleTool.active = false;
      }
      setOrbitEnabled(false);
    }

    // No obstacle menu on RMB (user request). Keep contextmenu disabled.
    canvas3d.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      return;
    });

    // Obstacle menu is no longer used (tools are in the top bar). Ensure it's closed.
    obstacleMenuOpen = false;


    const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(host.clientWidth, host.clientHeight, false);

    const scene = new THREE.Scene();
    // Default: dark workshop background. For line-follow tracks we'll switch to light gray.
    const bgDark  = new THREE.Color(0x0b1020);
    const bgLight = new THREE.Color(0xe5e7eb);
    scene.background = bgDark;

    // --- Scene lights (static; NOT attached to the car) ---
    // This fixes the "world darkens when the car moves" bug.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 0.85);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.28);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(8, 16, 6);
    dir.target.position.set(0, 0, 0);
    scene.add(dir);
    scene.add(dir.target);

    // Bigger "world" so the track canvas feels much larger.
    // GridHelper disabled (was causing z-fighting/black stripes)
    const grid = null;


    // subtle ground plane so the car doesn't feel "below" the world
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1.0, metalness: 0.0, transparent: false, opacity: 1.0 });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 2200),
      groundMat
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.001;
    scene.add(ground);

    // Sumo arena visuals (dark outside + white inside + black ring). Toggled by track.kind==='sumo'.
    const sumoGroup = new THREE.Group();
    // Simulator coordinates are expressed in "pixels".
    // In 3D we convert positions via k = 1 / pxPerUnit (see car.position below).
    // Author geometry in pixels and scale the whole group so it matches 2D physics.
    sumoGroup.scale.setScalar(1 / opts.pxPerUnit);

    // Dark "floor" disc under everything (outside area).
    const sumoBg = new THREE.Mesh(
      new THREE.CircleGeometry(2000, 192),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 1.0, metalness: 0.0 })
    );
    sumoBg.rotation.x = -Math.PI/2;
    sumoBg.position.y = -4;
    sumoBg.renderOrder = 0; // below (pixels) to avoid z-fight after scaling
    sumoBg.material.polygonOffset = true;
    sumoBg.material.polygonOffsetFactor = 1;
    sumoBg.material.polygonOffsetUnits = 1;
    sumoGroup.add(sumoBg);

    // White fighting area
    const sumoFloor = new THREE.Mesh(
      new THREE.CircleGeometry(400, 192),
      new THREE.MeshBasicMaterial({ color: 0xf5f5f5 })
    );
    sumoFloor.rotation.x = -Math.PI/2;
    // Keep the sumo floor slightly above the hidden ground to avoid z-fighting / moiré
    sumoFloor.position.y = 0;
    sumoFloor.renderOrder = 1;
    sumoFloor.material.polygonOffset = true;
    sumoFloor.material.polygonOffsetFactor = -2;
    sumoFloor.material.polygonOffsetUnits = -2;
    sumoGroup.add(sumoFloor);

    // Black border ring (no flicker)
    const sumoRing = new THREE.Mesh(
      new THREE.RingGeometry(392, 400, 192),
      new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })
    );
    sumoRing.rotation.x = -Math.PI/2;
    // Slightly above the floor so the border never flickers
    sumoRing.position.y = 2;
    sumoRing.renderOrder = 2;
    sumoRing.material.polygonOffset = true;
    sumoRing.material.polygonOffsetFactor = -4;
    sumoRing.material.polygonOffsetUnits = -4;
    // ensure the border never fights with the floor
    sumoRing.material.depthWrite = false;
    sumoGroup.add(sumoRing);
  let _sumoRCache = 0;
  let _sumoWCache = 0;

    sumoGroup.visible = false;
    scene.add(sumoGroup);

// Checker texture for "Sandbox" so movement is visible.
    function makeCheckerTexture(){
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      const a = '#9ca3af';
      const b = '#6b7280';
      const s = 32;
      for (let y=0; y<256; y+=s){
        for (let x=0; x<256; x+=s){
          ctx.fillStyle = (((x/s)+(y/s))%2===0) ? a : b;
          ctx.fillRect(x, y, s, s);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(60, 60);
      tex.anisotropy = 4;
      return tex;
    }
    const sandboxTex = makeCheckerTexture();

    // --- 3D track visualization (so the line is visible in 3D mode) ---
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);
    let _trackKey = '';

	    // Build a flat "ribbon" mesh along a polyline.
	    // IMPORTANT: must be stable at sharp turns (avoid "spikes"/star artifacts).
	    function makeRibbonMesh(points, width, y, material){
	      try{
	        if (!points || points.length < 2) return null;
	        const n = points.length;
	        const half = Math.max(0.0005, (width || 0.01) * 0.5);

	        // Precompute segment normals in XZ plane.
	        const segNx = new Float32Array((n - 1));
	        const segNz = new Float32Array((n - 1));
	        for (let i=0;i<n-1;i++){
	          const a = points[i];
	          const b = points[i+1];
	          let dx = b.x - a.x;
	          let dz = b.z - a.z;
	          let l = Math.hypot(dx, dz);
	          if (!Number.isFinite(l) || l < 1e-6){ dx = 1; dz = 0; l = 1; }
	          dx /= l; dz /= l;
	          // Perp in XZ
	          segNx[i] = -dz;
	          segNz[i] = dx;
	        }

	        const pos = new Float32Array(n * 2 * 3); // 2 vertices per point
	        const idx = new (n * 2 > 65535 ? Uint32Array : Uint16Array)((n - 1) * 6);

	        // Vertex join: miter-ish but clamped to avoid huge spikes.
	        const MITER_CLAMP = 4.0; // max miter length in multiples of half-width
	        for (let i=0;i<n;i++){
	          const p = points[i];
	          let n0x, n0z, n1x, n1z;
	          if (i === 0){
	            n0x = segNx[0]; n0z = segNz[0];
	            n1x = n0x; n1z = n0z;
	          } else if (i === n-1){
	            n0x = segNx[n-2]; n0z = segNz[n-2];
	            n1x = n0x; n1z = n0z;
	          } else {
	            n0x = segNx[i-1]; n0z = segNz[i-1];
	            n1x = segNx[i];   n1z = segNz[i];
	          }

	          // Miter direction
	          let mx = n0x + n1x;
	          let mz = n0z + n1z;
	          let ml = Math.hypot(mx, mz);
	          if (!Number.isFinite(ml) || ml < 1e-6){
	            // Straight or 180°: fall back to current segment normal.
	            mx = n1x; mz = n1z; ml = Math.hypot(mx, mz) || 1;
	          }
	          mx /= ml; mz /= ml;

	          // Scale miter length based on angle.
	          let denom = (mx * n1x + mz * n1z);
	          if (!Number.isFinite(denom) || Math.abs(denom) < 1e-3) denom = 1e-3;
	          let mLen = half / denom;
	          // Clamp to avoid giant spikes.
	          const maxLen = half * MITER_CLAMP;
	          if (mLen > maxLen) mLen = maxLen;
	          if (mLen < -maxLen) mLen = -maxLen;

	          const ox = mx * mLen;
	          const oz = mz * mLen;

	          const base = i * 6;
	          pos[base + 0] = p.x + ox;
	          pos[base + 1] = y;
	          pos[base + 2] = p.z + oz;
	          pos[base + 3] = p.x - ox;
	          pos[base + 4] = y;
	          pos[base + 5] = p.z - oz;
	        }

	        // Build indices (two triangles per segment)
	        let t = 0;
	        for (let i = 0; i < n - 1; i++){
	          const aL = i * 2;
	          const aR = i * 2 + 1;
	          const bL = (i + 1) * 2;
	          const bR = (i + 1) * 2 + 1;
	          idx[t++] = aL; idx[t++] = aR; idx[t++] = bL;
	          idx[t++] = aR; idx[t++] = bR; idx[t++] = bL;
	        }

	        const geo = new THREE.BufferGeometry();
	        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	        geo.setIndex(new THREE.BufferAttribute(idx, 1));
	        geo.computeVertexNormals();
	        geo.computeBoundingSphere();
	        const mesh = new THREE.Mesh(geo, material);
	        mesh.frustumCulled = true;
	        return mesh;
	      }catch(e){
	        return null;
	      }
	    }

    function syncTrack3D(){
      const tr = sim.track;
      if (!tr) return;

      // Keep line drawing tool strictly limited to the custom line track.
      // Prevents "stuck drawing" state when the user switches tracks/modes.
      const tn = (sim.trackName || '');
      if (tn !== 'CustomLine'){
        lineTool.active = false;
        lineTool.drawing = false;
      }
      let key = (sim.trackName||'') + '|' + (tr.kind||'') + '|';
      if (tr.kind==='arena'){
        key += (tr.walls?tr.walls.length:0) + '|' + (tr.lineWidth||0);
      } else {
        key += (tr.line?tr.line.length:0) + '|' + (tr.lineWidth||0);
      }
      if (key === _trackKey) return;
      _trackKey = key;

      // World look:
      // Users expect the "квадратик" (checker/grid) floor on ALL non-sumo tracks.
      // (A plain flat color makes it feel like the map is "broken".)
      scene.background = bgDark;
      if (groundMat){
        groundMat.color.setHex(0xffffff);
        groundMat.map = sandboxTex || null;
        groundMat.needsUpdate = true;
      }

      while (trackGroup.children.length) trackGroup.remove(trackGroup.children[0]);

      const k = 1/opts.pxPerUnit;
      // 3D line styling: keep it flat on the floor and avoid z-fighting.
      // Use MeshBasicMaterial so it looks like "paint" (not lit), and polygonOffset to prevent flicker.
      const lw = (tr.lineWidth||16) * k * 1.0;
      const lineOuterW = Math.max(0.01, lw * 1.35);
      const lineInnerW = Math.max(0.01, lw * 1.00);
      const wallThick = Math.max(0.02, lw);

      const matOuter = new THREE.MeshBasicMaterial({ color: 0x000000, transparent:true, opacity:0.25, side: THREE.DoubleSide, depthWrite:false });
      const matMain  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent:true, opacity:0.85, side: THREE.DoubleSide, depthWrite:false });
      matOuter.polygonOffset = true; matOuter.polygonOffsetFactor = -1; matOuter.polygonOffsetUnits = -1;
      matMain.polygonOffset  = true; matMain.polygonOffsetFactor  = -1; matMain.polygonOffsetUnits  = -1;

      if (tr.kind==='arena'){
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.0, transparent:true, opacity:0.95 });
        const wallH = 0.02;
        (tr.walls||[]).forEach((seg)=>{
          const a = seg[0], b = seg[1];
          const ax = (a[0]||0)*k, az = (a[1]||0)*k;
          const bx = (b[0]||0)*k, bz = (b[1]||0)*k;
          const dx = bx-ax, dz = bz-az;
          const len = Math.hypot(dx,dz);
          const geo = new THREE.BoxGeometry(len, wallH, wallThick);
          const m = new THREE.Mesh(geo, wallMat);
          m.position.set((ax+bx)*0.5, 0.01, (az+bz)*0.5);
          m.rotation.y = Math.atan2(dx, dz);
          trackGroup.add(m);
        });
      } else {
        const pts = tr.line || [];
        if (pts.length >= 2){
          // Limit for performance (very long strokes can freeze the browser).
          const maxPts = 4000;
          const src = (pts.length > maxPts) ? pts.slice(pts.length-maxPts) : pts;
          // Flat ribbon track (no 3D tube).
          // IMPORTANT: filter out near-duplicate points, otherwise normals can explode and you get "black spikes".
          const v0 = src.map(p=> new THREE.Vector3((p[0]||0)*k, 0.01, (p[1]||0)*k));
          const ptsV = [];
          for (let i=0;i<v0.length;i++){
            const p = v0[i];
            const prev = ptsV.length ? ptsV[ptsV.length-1] : null;
            if (!prev || prev.distanceToSquared(p) > 1e-6) ptsV.push(p);
          }
          const outerW = lineOuterW;
          const innerW = lineInnerW;
          const yTrack = 0.003;
          const outer = makeRibbonMesh(ptsV, outerW, yTrack, matOuter);
          const inner = makeRibbonMesh(ptsV, innerW, yTrack+0.001, matMain);
          if (outer) trackGroup.add(outer);
          if (inner) trackGroup.add(inner);
        }
      }
    }
    // Raycaster helper for placing obstacles on the ground plane (Y=0)
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

    // Ghost obstacle preview (follows cursor while tool is active)
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.6,
      metalness: 0.05,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    let ghost = null;
    function makeGhostForType(t){
      if (ghost) scene.remove(ghost);
      // Make obstacles larger by default (+50%) so they are easier to see/grab.
      const w = Number(sim.obstacleW || 120) * 1.5;
      const h = Number(sim.obstacleH || 80) * 1.5;
      const r = Number(sim.obstacleR || 60) * 1.5;
      const k = opts.pxPerUnit;
      let geo;
      if (t === 'circle') geo = new THREE.CylinderGeometry((r/k), (r/k), 0.08, 24);
      else if (t === 'square') geo = new THREE.BoxGeometry((w/k), 0.08, (w/k));
      else geo = new THREE.BoxGeometry((w/k), 0.08, (h/k));
      ghost = new THREE.Mesh(geo, ghostMat);
      ghost.position.y = 0.04;
      ghost.visible = false;
      scene.add(ghost);
    }
    makeGhostForType(obstacleTool.type || 'square');

    function pickGround(clientX, clientY){
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(groundPlane, p);
      return hit ? p : null;
    }

    function pointerHitsRobot(clientX, clientY){
      if (!robotPickMeshes || !robotPickMeshes.length) return false;
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(robotPickMeshes, true);
      return !!(hits && hits.length);
    }

    canvas3d.addEventListener('pointermove', (e)=>{
      // While rotating the robot (R+LMB), update its heading.
      if (robotRotate.active && !isOnlineSumo(sim)){
        e.preventDefault();
        e.stopPropagation();
        const dx = e.clientX - robotRotate.lastX;
        robotRotate.lastX = e.clientX;
        const b = sim.bot || (sim.state && sim.state.bot) || sim._bot;
        if (b){
          // Drag right -> rotate counter-clockwise (matches user drag direction).
          const sens = 0.012;
          b.a = (Number(b.a)||0) - dx * sens;
        }
        return;
      }
      // While dragging the robot (Space+LMB), move it on the ground.
      if (robotDrag.active && !isOnlineSumo(sim)){
        e.preventDefault();
        e.stopPropagation();
        const p = pickGround(e.clientX, e.clientY);
        if (p && (sim.bot || (sim.state && sim.state.bot) || sim._bot)){
          const b = sim.bot || (sim.state && sim.state.bot) || sim._bot;
          const k = opts.pxPerUnit;
          // Slow move: 20% towards the cursor per frame (≈ 80% slower than direct teleport).
          const tx = p.x * k;
          const ty = p.z * k;
          const ax = 0.20;
          const bx = Number(b.x) || 0;
          const by = Number(b.y) || 0;
          b.x = bx + (tx - bx) * ax;
          b.y = by + (ty - by) * ax;
        }
        return;
      }
      // Drawing / erasing custom line track
      if (lineTool.active && lineTool.drawing){
        const p = pickGround(e.clientX, e.clientY);
        if (p){
          const tr = ensureCustomLineTrack();
          if (tr){
            const k = opts.pxPerUnit;
            if (lineTool.mode === 'eraser'){
              // Remove points near the cursor (simple radius erase)
              const rx = p.x*k;
              const ry = p.z*k;
              const r2 = 60*60; // px^2
              tr.line = (tr.line||[]).filter(pt=>{
                const dx = pt[0]-rx, dy = pt[1]-ry;
                return (dx*dx + dy*dy) > r2;
              });
              if (sim.track && sim.track.kind==='line') sim.track.line = tr.line;
              _trackKey = '';
            } else {
              const last = lineTool.pts.length ? lineTool.pts[lineTool.pts.length-1] : null;
              const minStep = 0.06; // world units
              if (!last || p.distanceTo(last) > minStep){
                lineTool.pts.push(p.clone());
                tr.line.push([p.x*k, p.z*k]);
                if (sim.track && sim.track.kind==='line') sim.track.line = tr.line;
                _trackKey = '';
              }
            }
          }
        }
        return;
      }

      // Obstacle ghost preview
      if (!ghost) return;
      if (!obstacleTool.active) { ghost.visible = false; return; }
      const p = pickGround(e.clientX, e.clientY);
      if (!p) { ghost.visible = false; return; }
      ghost.visible = true;
      ghost.position.x = p.x;
      ghost.position.z = p.z;
    }, {capture:true});

    canvas3d.addEventListener('pointerdown', (e)=>{
      // R + LMB drag: rotate the robot in place (must start on the robot).
      // This should NOT rotate the camera/world.
      if (e.button === 0 && rDown && pointerHitsRobot(e.clientX, e.clientY) && !isOnlineSumo(sim)){
        e.preventDefault();
        e.stopPropagation();
        robotRotate.active = true;
        robotRotate.lastX = e.clientX;
        canvas3d.setPointerCapture?.(e.pointerId);
        setOrbitEnabled(false);
        return;
      }
      // Space + LMB drag: reposition the robot on the ground plane.
      // Only starts if the pointer is on the robot; otherwise LMB rotates the scene as usual.
      if (e.button === 0 && spaceDown && pointerHitsRobot(e.clientX, e.clientY) && !isOnlineSumo(sim)){
        e.preventDefault();
        e.stopPropagation();
        robotDrag.active = true;
        robotDrag.lastX = e.clientX;
        robotDrag.lastY = e.clientY;
        const p = pickGround(e.clientX, e.clientY);
        if (p && (sim.bot || (sim.state && sim.state.bot) || sim._bot)){
          const b = sim.bot || (sim.state && sim.state.bot) || sim._bot;
          const k = opts.pxPerUnit;
          // Slow move: 20% towards the cursor per frame (≈ 80% slower than direct teleport).
          const tx = p.x * k;
          const ty = p.z * k;
          const ax = 0.20;
          const bx = Number(b.x) || 0;
          const by = Number(b.y) || 0;
          b.x = bx + (tx - bx) * ax;
          b.y = by + (ty - by) * ax;
        }
        return;
      }
      // If line tool is active:
      //  - brush: LMB drag draws a custom line-follow track.
      //  - eraser: LMB drag erases nearby points.
      if (lineTool.active && e.button === 0){
        e.preventDefault();
        e.stopPropagation();
        const tr = ensureCustomLineTrack();
        if (tr){
          // Brush: start a new line unless user holds Shift to append.
          // Eraser: never clears the whole line.
          if (lineTool.mode !== 'eraser' && !e.shiftKey){
            tr.line = [];
            lineTool.pts = [];
            if (sim.track && sim.track.kind==='line') sim.track.line = tr.line;
          }
          // If user starts drawing, ensure track is selected
          if (typeof sim.setTrack === 'function') sim.setTrack('CustomLine');
        }
        lineTool.drawing = true;
        const p = pickGround(e.clientX, e.clientY);
        if (p && tr && lineTool.mode !== 'eraser'){
          const k = opts.pxPerUnit;
          tr.line.push([p.x*k, p.z*k]);
          if (sim.track && sim.track.kind==='line') sim.track.line = tr.line;
          lineTool.pts.push(p.clone());
          _trackKey = '';
        }
        return;
      }

      // If obstacle tool is active, LMB places a new obstacle at cursor.
      if (!obstacleTool.active) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const p = pickGround(e.clientX, e.clientY);
      if (!p) return;

      const k = opts.pxPerUnit;
      const ox = p.x * k;
      const oy = p.z * k;

      const t = obstacleTool.type || 'rect';
      sim.obstacleType = t;

      // sizes from sim defaults (editable later if needed) +50% (user request)
      const w = Number(sim.obstacleW || 120) * 1.5;
      const h = Number(sim.obstacleH || 80) * 1.5;
      const r = Number(sim.obstacleR || 60) * 1.5;

      if (!Array.isArray(sim.obstacles)) sim.obstacles = [];
      if (t === 'circle'){
        sim.obstacles.push({ type: 'circle', x: ox, y: oy, r });
      } else if (t === 'square'){
        sim.obstacles.push({ type: 'square', x: ox, y: oy, s: w });
      } else {
        sim.obstacles.push({ type: 'rect', x: ox, y: oy, w, h });
      }

      // force refresh
      _obsKey = '';
      syncObstacles();
    }, {capture:true});

    canvas3d.addEventListener('pointerup', (e)=>{
      if (lineTool.active && e.button === 0){
        lineTool.drawing = false;
      }
      if (e.button === 0){
        robotDrag.active = false;
        robotRotate.active = false;
        setOrbitEnabled(true);
        try{ canvas3d.releasePointerCapture?.(e.pointerId); }catch(_e){}
      }
    }, {capture:true});


    const camera = new THREE.PerspectiveCamera(55, host.clientWidth/host.clientHeight, 0.05, 200);

    const target = new THREE.Vector3(0, 0.6, 0);

    // Controls: try OrbitControls, else built-in
    let orbit = null;
    const Controls = THREE.OrbitControls || window.OrbitControls || null;
    if (Controls){
      orbit = new Controls(camera, canvas3d);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      orbit.target.copy(target);
      orbit.minDistance = 1.5;
      orbit.maxDistance = 40;
      // Invert mouse drag directions to match user's expected feel.
      orbit.rotateSpeed = -0.9;
      if (typeof orbit.panSpeed === 'number') orbit.panSpeed = -0.3;
    }
    const builtin = orbit ? null : createBuiltInOrbitControls(canvas3d, camera, target);

    // Load textures
    const base = opts.assetBase.replace(/\/$/, '');
    const [texTop, texLong, texShort] = await Promise.all([
      loadTexture(THREE, base + '/' + opts.texTop),
      loadTexture(THREE, base + '/' + opts.texSideLong),
      loadTexture(THREE, base + '/' + opts.texSideShort)
    ]);
    const textures = { top: texTop, long: texLong, short: texShort };

    // We intentionally do NOT rely on a GLB for sensors: built-in simple models are more reliable
    // and can be positioned to hang over edges (needed for line-follow sensors).
    const sensorScene = null;

    const car = buildCar(THREE, opts, textures);
    scene.add(car);
try{ car.scale.setScalar(opts.carScale||1); }catch(e){}


// Opponent car (bot2) for Online Sumo. Not pickable.
const car2 = buildCar(THREE, opts, textures);
try{ car2.scale.setScalar(opts.carScale||1); }catch(e){}
car2.visible = false;
// Slight tint so it's visually different (blue-ish)
try{
  car2.traverse((o)=>{
    if (o && o.material && o.material.color){
      // shift towards blue a little
      o.material = o.material.clone ? o.material.clone() : o.material;
      const c = o.material.color;
      c.r = Math.max(0, c.r * 0.75);
      c.g = Math.max(0, c.g * 0.85);
      c.b = Math.min(1, c.b * 1.10 + 0.10);
      o.material.needsUpdate = true;
    }
  });
}catch(e){}
scene.add(car2);

    // Robot pick targets (for Space+LMB dragging)
    const robotPickMeshes = [];
    if (car.userData && car.userData.cover) robotPickMeshes.push(car.userData.cover);
    if (car.userData && Array.isArray(car.userData.wheels)) robotPickMeshes.push(...car.userData.wheels);

    // Robot hitbox helper (cover only; enough to see where the robot can be grabbed).
    let robotCoverHitbox = null;
    try{
      const cover = car.userData && car.userData.cover;
      if (cover && cover.geometry){
        if (!cover.geometry.boundingBox) cover.geometry.computeBoundingBox?.();
        const bb = cover.geometry.boundingBox;
        if (bb){
          const sx = Math.max(0.01, bb.max.x - bb.min.x);
          const sy = Math.max(0.01, bb.max.y - bb.min.y);
          const sz = Math.max(0.01, bb.max.z - bb.min.z);
          const g = new THREE.BoxGeometry(sx, sy, sz);
          const robotHbMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.75, depthWrite: false });
          const m = new THREE.Mesh(g, robotHbMat);
          m.visible = false;
          m.position.set((bb.min.x+bb.max.x)/2, (bb.min.y+bb.max.y)/2, (bb.min.z+bb.max.z)/2);
          m.renderOrder = 11;
          cover.add(m);
          robotCoverHitbox = m;
        }
      }
    }catch(e){}

    // Ground OBB hitbox (top-down rectangle) for robot + opponent
    const obbMat1 = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent:true, opacity:0.9, depthWrite:false });
    const obbMat2 = new THREE.LineBasicMaterial({ color: 0xef4444, transparent:true, opacity:0.9, depthWrite:false });

    function makeObbLine(mat){
      const g = new THREE.BufferGeometry();
      // 5 points (closed)
      const arr = new Float32Array(5*3);
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(g, mat);
      line.visible = false;
      line.renderOrder = 12;
      scene.add(line);
      return line;
    }
    const robotObbLine = makeObbLine(obbMat1);
    const robot2ObbLine = makeObbLine(obbMat2);


    function isPointerOnRobot(clientX, clientY){
      if (!robotPickMeshes.length) return false;
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(robotPickMeshes, true);
      return !!(hits && hits.length);
    }

    // --- Sensor drag + ray direction editing (RMB) ---
    const coverMesh = car.userData.cover;

    // Compute clamp bounds from the actual cover mesh, in CAR LOCAL space.
    // This fixes the "one side reaches the edge, the other doesn't" problem when
    // the cover mesh origin isn't perfectly centered.
    // User request: allow the sensor to stick out just a tiny bit ("впритик"),
    // but not fly far away.
    const EDGE_OVERHANG = 0.02; // meters-ish in model units
    let coverClamp = null;

    function computeCoverClamp(){
      if (!coverMesh) return null;
      // Find a bounding box for the cover's geometry.
      const geom = coverMesh.geometry;
      if (!geom) return null;
      if (!geom.boundingBox){
        try { geom.computeBoundingBox(); } catch(e){}
      }
      const bb = geom.boundingBox;
      if (!bb) return null;

      // 8 corners in cover local space
      const cs = [
        new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z),
      ];

      // Make sure matrices are fresh
      coverMesh.updateWorldMatrix(true, false);
      car.updateWorldMatrix(true, false);

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const c of cs){
        const wp = c.clone().applyMatrix4(coverMesh.matrixWorld);
        const lp = car.worldToLocal(wp.clone());
        if (lp.x < minX) minX = lp.x;
        if (lp.x > maxX) maxX = lp.x;
        if (lp.z < minZ) minZ = lp.z;
        if (lp.z > maxZ) maxZ = lp.z;
      }
      if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minZ) || !isFinite(maxZ)) return null;
      return { minX, maxX, minZ, maxZ };
    }

    // Initial clamp values
    coverClamp = computeCoverClamp();
    const sensorPickMeshes = [];
    // Pick proxy (make it easier to grab from any camera angle).
    // Use a box so the helper looks like a square hit-area on the sensor plane (not a round sphere).
    // Two variants: distance (bigger + lifted) and line/light (longer stick).
    // Distance: +33% size (requested). We'll also lift the proxy in update() so it sits on the sensor.
    const pickGeoDist = new THREE.BoxGeometry(0.56, 0.24, 0.56);
    const pickGeoLine = new THREE.BoxGeometry(0.42, 0.18, 0.84); // +100% length (Z)
    const pickMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 });

    // Optional hitbox visualization (toggled from the top bar ▣ button).
    const hitboxMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.75, depthWrite: false });

    // mount sensor models

    // mount sensor models
    const sensorMounts = car.userData.sensorMounts || [];
    const sensorObjs = [];
    for (let i=0;i<sensorMounts.length;i++){
      // Invisible pick target
      const pm = new THREE.Mesh(pickGeoDist, pickMat);
      pm.renderOrder = 10;
      pm.userData.sensorIndex = i;
      pm.userData.__pickKind = 'distance';

      // Hitbox helper (wireframe), hidden by default.
      const hb = new THREE.Mesh(pickGeoDist.clone(), hitboxMat);
      hb.visible = false;
      hb.renderOrder = 11;
      pm.add(hb);
      pm.userData.hitboxHelper = hb;
      // pm is attached to the sensor group (sg) so it follows per-mode offsets
      sensorPickMeshes.push(pm);

      // default ray angles
      sensorMounts[i].userData.rayYaw = 0;
      sensorMounts[i].userData.rayPitch = 0;

      // Per-sensor group that contains both models; we toggle visibility by sensor mode.
      const sg = new THREE.Group();
      const distM = makeDistanceSensorModel(THREE);
      const lineM = makeLineSensorModel(THREE);
      distM.userData.__rc3dSensorKind = 'distance';
      lineM.userData.__rc3dSensorKind = 'line';
      sg.add(distM);
      sg.add(lineM);
      sg.userData.distanceModel = distM;
      sg.userData.lineModel = lineM;
      // Default: show distance model; update() will set the right one.
      lineM.visible = false;
      sensorMounts[i].add(sg);
      sg.add(pm);
      sg.userData.pickMesh = pm;
      sensorObjs.push(sg);
    }

    let sensorEdit = { active:false, idx:-1, mode:'move', lastX:0, lastY:0 };

    function pickSensor(clientX, clientY){
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(sensorPickMeshes, true);
      if (!hits || !hits.length) return -1;
      const h = hits[0].object;
      return (h.userData && Number.isFinite(h.userData.sensorIndex)) ? h.userData.sensorIndex : -1;
    }

    function hideHoverTip(){
      hoverTip.style.display = 'none';
    }

    function showHoverTip(text, clientX, clientY){
      hoverTip.textContent = text;
      hoverTip.style.left = (clientX + 12) + 'px';
      hoverTip.style.top = (clientY + 12) + 'px';
      hoverTip.style.display = 'block';
    }

    // Show sensor port label on hover (S1..S4)
    canvas3d.addEventListener('pointermove', (e)=>{
      if (sensorEdit.active) return hideHoverTip();
      // don't flicker while dragging camera/robot
      if (e.buttons) return hideHoverTip();
      const idx = pickSensor(e.clientX, e.clientY);
      if (idx < 0) return hideHoverTip();
      showHoverTip('S' + (idx + 1), e.clientX, e.clientY);
    }, {passive:true});

    canvas3d.addEventListener('pointerleave', hideHoverTip, {passive:true});

    function placeMountOnCover(idx, clientX, clientY){
      if (!coverMesh) return;
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(coverMesh, true);
      if (!hits || !hits.length) return;
      const wp = hits[0].point;
      const lp = car.worldToLocal(wp.clone());

      // Clamp to cover top surface area.
      // Prefer real cover bounds so it's symmetric even if the mesh is offset.
      // Recompute lazily if needed.
      if (!coverClamp) coverClamp = computeCoverClamp();
      if (coverClamp){
        lp.x = Math.max(coverClamp.minX - EDGE_OVERHANG, Math.min(coverClamp.maxX + EDGE_OVERHANG, lp.x));
        lp.z = Math.max(coverClamp.minZ - EDGE_OVERHANG, Math.min(coverClamp.maxZ + EDGE_OVERHANG, lp.z));
      } else {
        // Fallback (old constants)
        lp.x = Math.max(-1.10, Math.min(1.10, lp.x));
        lp.z = Math.max(-2.25, Math.min(2.25, lp.z));
      }
      lp.y = opts.sensorY;
      sensorMounts[idx].position.copy(lp);
    }

    canvas3d.addEventListener('pointerdown', (e)=>{
      if (sim && sim.isOnlineSumo && sim.isOnlineSumo()) return; // anti-cheat in online sumo
      if (e.button !== 2) return; // RMB
      if (obstacleTool.active) return;
      const idx = pickSensor(e.clientX, e.clientY);
      if (idx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      canvas3d.setPointerCapture?.(e.pointerId);
      sensorEdit.active = true;
      sensorEdit.idx = idx;
      sensorEdit.lastX = e.clientX;
      sensorEdit.lastY = e.clientY;
      sensorEdit.mode = e.shiftKey ? 'rotate' : 'move';
      // After interacting with a sensor, block the obstacle menu for a while.
      // This prevents accidental menu popups when right-dragging or rotating the ray.
      suppressMenuUntil = performance.now() + 3000;
    }, {capture:true});

    canvas3d.addEventListener('pointermove', (e)=>{
      if (!sensorEdit.active) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = sensorEdit.idx;
      if (idx < 0) return;
      if (sensorEdit.mode === 'move'){
        placeMountOnCover(idx, e.clientX, e.clientY);
      } else {
        const dx = e.clientX - sensorEdit.lastX;
        const dy = e.clientY - sensorEdit.lastY;
        sensorEdit.lastX = e.clientX;
        sensorEdit.lastY = e.clientY;
        const m = sensorMounts[idx];
        m.userData.rayYaw = (m.userData.rayYaw||0) + dx * 0.01;
        m.userData.rayPitch = (m.userData.rayPitch||0) + dy * 0.01;
        m.userData.rayPitch = Math.max(-1.2, Math.min(1.2, m.userData.rayPitch));
      }
    }, {capture:true});

    canvas3d.addEventListener('pointerup', (e)=>{
      if (!sensorEdit.active) return;
      e.preventDefault();
      e.stopPropagation();
      sensorEdit.active = false;
      sensorEdit.idx = -1;
      suppressMenuUntil = performance.now() + 3000;
      try{ canvas3d.releasePointerCapture?.(e.pointerId); }catch(_e){}
    }, {capture:true});

    // Rays
    const rayGroup = buildRays(THREE, opts.rayOpacity);
    scene.add(rayGroup);

    // 3D obstacles (mirrors 2D obstacle list)
    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);
    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.75, metalness: 0.05, transparent: true, opacity: 0.85 });
    let _obsKey = '';
    function syncObstacles(){
      const obs = (sim && sim.obstacles) ? sim.obstacles : [];
      // Build a cheap key to detect changes
      let key = '';
      for (let i=0;i<obs.length;i++){
        const o = obs[i] || {};
        const ow = (o.type==='square') ? (o.s||o.w||0) : (o.w||0);
        key += `${o.type||''}|${(o.x||0).toFixed(1)},${(o.y||0).toFixed(1)}|${ow},${o.h||0},${o.r||0},${Number(o.h3d||o.height3d||0).toFixed(2)};`;
      }
      if (key === _obsKey) return;
      _obsKey = key;
      // Rebuild meshes
      while (obstacleGroup.children.length) obstacleGroup.remove(obstacleGroup.children[0]);
      const k = 1/opts.pxPerUnit;
      // Default obstacle height: higher than the car so it is visible as a "real" 3D obstacle.
      const defaultHeight = 1.6;
      for (let i=0;i<obs.length;i++){
        const o = obs[i];
        if (!o) continue;
        const t = o.type || 'rect';
        const height = Math.max(0.06, Number(o.h3d || o.height3d || defaultHeight));
        let mesh = null;
        if (t==='circle'){
          const r = Math.max(1, Number(o.r)||40) * k;
          const geo = new THREE.CylinderGeometry(r, r, height, 24);
          mesh = new THREE.Mesh(geo, obstacleMat);
        } else {
          const ow = (t==='square') ? (Number(o.s)||Number(o.w)||120) : (Number(o.w)||120);
          const w = Math.max(1, ow) * k;
          const h = (t==='rect') ? (Math.max(1, Number(o.h)||80) * k) : w;
          const geo = new THREE.BoxGeometry(w, height, h);
          mesh = new THREE.Mesh(geo, obstacleMat);
        }
        if (!mesh) continue;
        mesh.position.set((Number(o.x)||0)*k, height/2, (Number(o.y)||0)*k);
        mesh.userData.obsIndex = i;
        obstacleGroup.add(mesh);
      }
    }

    // --- Obstacle height editing (LMB drag on obstacle) ---
    let obsEdit = { active:false, idx:-1, startY:0, startH:0 };

    function pickObstacle(clientX, clientY){
      const rect = canvas3d.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(obstacleGroup.children, true);
      if (!hits || !hits.length) return -1;
      const m = hits[0].object;
      return (m.userData && Number.isFinite(m.userData.obsIndex)) ? m.userData.obsIndex : -1;
    }

    // RMB delete: if the cursor is on an obstacle, delete it immediately (any mode/tool).
    canvas3d.addEventListener('pointerdown', (e)=>{
      if (e.button !== 2) return; // RMB
      if (isOnlineSumo(sim)) return; // anti-cheat
      let idx = pickObstacle(e.clientX, e.clientY);
      if (idx < 0){
        // Fallback: pick by ground point -> 2D obstacle hit test.
        const p = pickGround(e.clientX, e.clientY);
        if (p && sim && typeof sim.pickObstacle === 'function'){
          const k = opts.pxPerUnit;
          idx = sim.pickObstacle(p.x * k, p.z * k);
        }
      }
      if (idx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!sim || !Array.isArray(sim.obstacles)) return;
      sim.obstacles.splice(idx, 1);
      _obsKey = '';
      try{ syncObstacles(); }catch(_e){}
    }, {capture:true});

    canvas3d.addEventListener('pointerdown', (e)=>{
      if (e.button !== 0) return; // LMB
      if (obstacleTool.active) return; // placement mode uses LMB
      let idx = pickObstacle(e.clientX, e.clientY);
      if (idx < 0){
        // Fallback: pick by ground point -> 2D obstacle hit test.
        const p = pickGround(e.clientX, e.clientY);
        if (p && sim && typeof sim.pickObstacle === 'function'){
          const k = opts.pxPerUnit;
          idx = sim.pickObstacle(p.x * k, p.z * k);
        }
      }
      if (idx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      obsEdit.active = true;
      obsEdit.idx = idx;
      obsEdit.startY = e.clientY;
      const o = (sim && sim.obstacles) ? sim.obstacles[idx] : null;
      obsEdit.startH = Math.max(0.06, Number((o && (o.h3d||o.height3d)) || 1.6));
      canvas3d.setPointerCapture?.(e.pointerId);
      setOrbitEnabled(false);
    }, {capture:true});

    canvas3d.addEventListener('pointermove', (e)=>{
      if (!obsEdit.active) return;
      e.preventDefault();
      e.stopPropagation();
      const o = (sim && sim.obstacles) ? sim.obstacles[obsEdit.idx] : null;
      if (!o) return;
      const dy = (obsEdit.startY - e.clientY);
      let h = obsEdit.startH + dy * 0.01;
      h = Math.max(0.06, Math.min(6, h));
      o.h3d = h;
      _obsKey = '';
      syncObstacles();
    }, {capture:true});

    canvas3d.addEventListener('pointerup', (e)=>{
      if (!obsEdit.active) return;
      e.preventDefault();
      e.stopPropagation();
      obsEdit.active = false;
      obsEdit.idx = -1;
      setOrbitEnabled(true);
      try{ canvas3d.releasePointerCapture?.(e.pointerId); }catch(_e){}
    }, {capture:true});

    // Resize
    const onResize = ()=>{
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w/h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    function getPose(){
      const b = sim.bot || (sim.state && sim.state.bot) || sim._bot || null;
      if (!b) return {x:0,y:0,a:0};
      return { x: b.x||0, y: b.y||0, a: b.a||0 };
    }

    function getSensorConfig(){
      // from sim: sensorEnabled & sensorModes
      const en = sim.sensorEnabled || (sim.state && sim.state.sensorEnabled) || [true,true,true,true];
      const md = sim.sensorModes || (sim.state && sim.state.sensorModes) || ['color','color','color','color'];
      return { enabled: en, modes: md };
    }

    let _lastCarPos = new THREE.Vector3(0,0,0);

    function update(){
      syncPointerEvents();
      syncTrack3D();
      syncObstacles();

      // Toggle sumo visuals
      const isSumo = !!(sim && sim.track && sim.track.kind==='sumo');
      sumoGroup.visible = isSumo;
    // Keep sumo arena visuals in sync with 2D physics (arenaRadius / ringWidth)
    if (isSumo){
      try{
        const tr = sim && sim.track ? sim.track : null;
        const R = tr ? (Number(tr.arenaRadius)||400) : 400;
        const W = tr ? (Number(tr.ringWidth)||8) : 8;
        if (R !== _sumoRCache || W !== _sumoWCache){
          _sumoRCache = R; _sumoWCache = W;
          try{ sumoFloor.geometry.dispose(); }catch(e){}
          try{ sumoRing.geometry.dispose(); }catch(e){}
          sumoFloor.geometry = new THREE.CircleGeometry(R, 192);
          sumoRing.geometry = new THREE.RingGeometry(Math.max(0.01, R - W), R, 192);
        }
      }catch(e){}
    }
      if (grid) grid.visible = !isSumo;
      ground.visible = !isSumo;


      // --- tool selection from top bar ---
      const uiTool = (sim && sim.uiTool) ? String(sim.uiTool) : '';
      // Obstacles: active when any obs_* tool is selected.
      obstacleTool.active = uiTool.startsWith('obs_');
      if (obstacleTool.active){
        obstacleTool.type = (uiTool === 'obs_circle') ? 'circle' : (uiTool === 'obs_square' ? 'square' : 'rect');
      }
      // Line tools: only available on CustomLine track.
      const onCustomLine = (sim.trackName === 'CustomLine');
      lineTool.active = onCustomLine && uiTool.startsWith('line_');
      lineTool.mode = (uiTool === 'line_eraser') ? 'eraser' : 'brush';
      if (!lineTool.active) lineTool.drawing = false;
      // update pose
      const {x,y,a} = getPose();
      const k = 1/opts.pxPerUnit;
      car.position.set(x*k, 0.26, y*k);
      // 2D physics: heading vector is (cos(a), sin(a)) in XZ.
      // Car model is authored facing -Z, so add +90° offset.
      car.rotation.y = a + Math.PI/2;

      // Sync sensor yaw from 3D mounts -> 2D math core.
      // This makes rotated distance sensors affect the real raycasts (not just the visuals).
      try{
        const s2d = sim && sim.sensors;
        const mounts = car.userData.sensorMounts || [];
        if (Array.isArray(s2d) && mounts && mounts.length){
          for (let i=0;i<4;i++){
            if (!s2d[i]) continue;
            const m = mounts[i];
            const yaw = (m && m.userData) ? (m.userData.rayYaw || 0) : 0;
            const pitch = (m && m.userData) ? (m.userData.rayPitch || 0) : 0;
            s2d[i].yaw = yaw;

            // ALSO sync the *exact* world-space origin of the sensor mount (in px),
            // so 2D math samples from the same point where the visible red beam starts.
            // 2D uses (x,y) in px, while 3D uses (x,z) in world units.
            try{
              const p0 = new THREE.Vector3();
              if (m && m.getWorldPosition){
                m.getWorldPosition(p0);
                s2d[i].wx = p0.x * opts.pxPerUnit;
                s2d[i].wy = p0.z * opts.pxPerUnit;

                // Compute absolute (world) ray angle on the floor plane to match the red beam direction.
                // Start from local forward (-Z), apply per-sensor yaw/pitch, then car quaternion.
                const dir = new THREE.Vector3(0,0,-1);
                dir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
                dir.applyQuaternion(car.quaternion);
                // Project to floor (XZ)
                const dx = dir.x;
                const dz = dir.z;
                const l = Math.hypot(dx, dz);
                if (l > 1e-6){
                  s2d[i].rayAngAbs = Math.atan2(dz, dx);
                } else {
                  // Fallback: use bot heading
                  s2d[i].rayAngAbs = (sim && sim.bot) ? (Number(sim.bot.a)||0) : 0;
                }
              }
            }catch(e2){}
          }
        }
      }catch(e){}
       // opponent pose (if provided by sim.state.bot2 or sim.bot2)
       const b2 = sim.bot2 || (sim.state && sim.state.bot2) || null;
       if (b2){
         car2.visible = true;
         car2.position.set((Number(b2.x)||0)*k, 0.29, (Number(b2.y)||0)*k);
         car2.rotation.y = (Number(b2.a)||0) + Math.PI/2;
       } else {
         car2.visible = false;
       }


      // Camera follow (uses existing sidebar checkbox)
      const follow = !(sim.ui && sim.ui.chkCam) ? true : !!sim.ui.chkCam.checked;
      if (follow){
        // Move camera with the car so it actually "follows" (keep relative offset).
        const dx = car.position.x - _lastCarPos.x;
        const dy = car.position.y - _lastCarPos.y;
        const dz = car.position.z - _lastCarPos.z;
        if (Number.isFinite(dx) && Number.isFinite(dz)){
          camera.position.x += dx;
          camera.position.y += dy;
          camera.position.z += dz;
          target.x += dx;
          target.y += dy;
          target.z += dz;
          if (orbit) orbit.target.copy(target);
        }
        if (builtin) builtin.updateCamera();
      }
      _lastCarPos.copy(car.position);

      // wheels spin (approx)
      const wheels = car.userData.wheels || [];
      if (wheels.length>=4){
        // derive wheel angular velocity from sim if present
        const b = sim.bot || {};
        const wl = b.wheelRotL || 0;
        const wr = b.wheelRotR || 0;
        wheels[0].rotation.x = wl; wheels[2].rotation.x = wl;
        wheels[1].rotation.x = wr; wheels[3].rotation.x = wr;
      }

      // gears spin (use wheel rotation as proxy)
      const gears = car.userData.gears || [];
      if (gears.length){
        const b = sim.bot || {};
        const wl = b.wheelRotL || 0;
        const wr = b.wheelRotR || 0;

        for (let gi=0; gi<gears.length; gi++){
          const g = gears[gi];
          const spin = g.userData && g.userData.spinMesh;
          if (!spin) continue;

          const isLeft = (g.userData.sideSign === -1);
          const base = isLeft ? wl : wr;

          // Alternate direction per adjacent gear to mimic real meshing.
          const dir = ((g.userData.idxInSide||0) % 2 === 0) ? 1 : -1;

          spin.rotation.z = base * dir;
        }
      }

      // rays from sensors
      // --- Hitbox debug visual ---
      const showHB = !!(sim && sim.showHitboxes);
      if (robotCoverHitbox) robotCoverHitbox.visible = showHB;
      if (robotObbLine) robotObbLine.visible = showHB;
      if (robot2ObbLine) robot2ObbLine.visible = showHB && !!(sim && (sim.bot2 || (sim.state && sim.state.bot2)));
      if (showHB && sim){
        const kInv = 1/6.4; // sim->3D scale inverse of k (k=6.4)
        const updObb = (line, b)=>{
          if (!line || !b) return;
          const hw = (b.halfWidth!=null)? b.halfWidth : 34;
          const hl = (b.halfLength!=null)? b.halfLength : 44;
          const a = Number(b.a)||0;
          const ca = Math.cos(a), sa = Math.sin(a);
          const fx = ca, fz = sa;
          const lx = -sa, lz = ca;
          const cx = (Number(b.x)||0) * k;
          const cz = (Number(b.y)||0) * k;
          const y = 0.305;
          const pts = [
            [cx + (fx*hl + lx*hw)*k, y, cz + (fz*hl + lz*hw)*k],
            [cx + (fx*hl - lx*hw)*k, y, cz + (fz*hl - lz*hw)*k],
            [cx + (-fx*hl - lx*hw)*k, y, cz + (-fz*hl - lz*hw)*k],
            [cx + (-fx*hl + lx*hw)*k, y, cz + (-fz*hl + lz*hw)*k],
            [cx + (fx*hl + lx*hw)*k, y, cz + (fz*hl + lz*hw)*k],
          ];
          const arr = line.geometry.attributes.position.array;
          for (let i=0;i<5;i++){
            arr[i*3+0]=pts[i][0];
            arr[i*3+1]=pts[i][1];
            arr[i*3+2]=pts[i][2];
          }
          line.geometry.attributes.position.needsUpdate = true;
        };
        updObb(robotObbLine, sim.bot);
        const b2 = sim.bot2 || (sim.state && sim.state.bot2) || null;
        updObb(robot2ObbLine, b2);
      }

      for (let i=0;i<sensorPickMeshes.length;i++){
        const pm = sensorPickMeshes[i];
        const hb = pm && pm.userData ? pm.userData.hitboxHelper : null;
        if (hb) hb.visible = showHB;
      }
      const cfg = getSensorConfig();
      const showRays = !(sim && sim.ui && sim.ui.chkRay) ? true : !!sim.ui.chkRay.checked;

      const rays = rayGroup.userData.rays || [];
      // show/hide sensor models and orient/offset for mode
      for (let i=0;i<sensorObjs.length;i++){
        const enabled = !!(cfg.enabled && cfg.enabled[i]);
        const mode = (cfg.modes && cfg.modes[i]) || 'color';
        const sg = sensorObjs[i];
        if (!sg) continue;
        sg.visible = enabled;

        const distM = sg.userData && sg.userData.distanceModel;
        const lineM = sg.userData && sg.userData.lineModel;
        const pm = sg.userData && sg.userData.pickMesh;
        const hb = (pm && pm.userData) ? pm.userData.hitboxHelper : null;

        const isDist = (mode === 'distance');

        // Adjust pick proxy + helper per sensor type so it matches the visible model.
        // Requests:
        // - Distance hitbox was too low -> lift by +50% (of its own height).
        // - Distance hitbox should be +33% bigger (geometry is already larger).
        // - Line/Light hitbox should be +100% longer.
        if (pm){
          if (isDist){
            if (pm.userData.__pickKind !== 'distance'){
              pm.geometry = pickGeoDist;
              if (hb) hb.geometry = pickGeoDist.clone();
              pm.userData.__pickKind = 'distance';
            }
            // Lift half of pickGeoDist height (0.24 / 2 = 0.12)
            pm.position.set(0, 0.12, 0);
          } else {
            if (pm.userData.__pickKind !== 'line'){
              pm.geometry = pickGeoLine;
              if (hb) hb.geometry = pickGeoLine.clone();
              pm.userData.__pickKind = 'line';
            }
            // Center the proxy on the stick body (the stick is placed at z=-0.10 then scaled ~2.7 => ~-0.27)
            pm.position.set(0, 0.0, -0.27);
          }
        }

        // Show/hide debug beams/rays using the "Промінь" checkbox from the sim UI.
        const distBeam = (distM && distM.userData) ? distM.userData.__beam : null;
        const lineBeam = (lineM && lineM.userData) ? lineM.userData.__scan : null;
        if (distBeam) distBeam.visible = !!showRays;
        if (lineBeam) lineBeam.visible = !!showRays;

        if (distM) distM.visible = isDist;
        if (lineM) lineM.visible = !isDist; // 'color' and 'light' use line sensor visuals

        // Style line-sensor LEDs depending on mode (color vs light), so the user can see the type.
        if (lineM && !isDist){
          const ledL = lineM.userData && lineM.userData.__ledL;
          const ledR = lineM.userData && lineM.userData.__ledR;
          const mat = (ledL && ledL.material) ? ledL.material : null;
          const mat2 = (ledR && ledR.material) ? ledR.material : null;
          if (mat && mat.color){
            if (mode === 'light'){ mat.color.setHex(0x22c55e); }
            else { mat.color.setHex(0xfbbf24); }
          }
          if (mat2 && mat2.color){
            if (mode === 'light'){ mat2.color.setHex(0x22c55e); }
            else { mat2.color.setHex(0xfbbf24); }
          }
        }

        // Placement:
        // - distance sensor sits on the cover and points forward.
        // - line sensor sits near the front edge and emits its scan beam downward.
        const yaw = (sensorMounts[i] && sensorMounts[i].userData) ? (sensorMounts[i].userData.rayYaw||0) : 0;
        const pitch = (sensorMounts[i] && sensorMounts[i].userData) ? (sensorMounts[i].userData.rayPitch||0) : 0;
        if (isDist){
          // On top cover, sit flush (no floating). The model itself is scaled, so keep local Y ~ 0.
          sg.position.set(0, 0.0, -0.06);
          sg.rotation.set(pitch, yaw, 0, 'YXZ');
        } else {
          // Under the front lip.
          sg.position.set(0, 0.02, -0.60);
          sg.rotation.set(0, yaw, 0);
        }
      }
      for (let i=0;i<4;i++){
        const line = rays[i];
        if (!line) continue;
        const enabled = !!cfg.enabled[i];
        const mode = (cfg.modes[i] || 'color');
        line.visible = enabled && (mode==='distance') && showRays;
        if (!line.visible) continue;

        // distance value: from sim.sensorValues[i]
        const sv = (sim.sensorValues && sim.sensorValues[i]) || 0;
        const dist = Math.max(0, Math.min(100, Number(sv)||0));
        const len = (dist/opts.pxPerUnit); // 100px -> 2 units if pxPerUnit=50

        // origin: sensor mount world pos
        const mount = sensorMounts[i];
        const p0 = new THREE.Vector3();
        mount.getWorldPosition(p0);

        // direction: per-sensor yaw/pitch in car local space (default forward)
        const m = sensorMounts[i];
        const yaw = (m && m.userData) ? (m.userData.rayYaw||0) : 0;
        const pitch = (m && m.userData) ? (m.userData.rayPitch||0) : 0;
        const dir = new THREE.Vector3(0,0,-1);
        dir.applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        dir.applyQuaternion(car.quaternion);

        const p1 = p0.clone().add(dir.multiplyScalar(len));

        line.geometry.setFromPoints([p0, p1]);
        line.geometry.attributes.position.needsUpdate = true;
      }

      if (orbit) orbit.update();
      if (builtin) builtin.tick();
      renderer.render(scene, camera);
      requestAnimationFrame(update);
    }

    update();
  }

  // Expose API
  window.RCSim2D3D = {
    start,
  };

  // Auto-start once (keeps simulator in 3D even if rc_sim2d.js does not call start()).
  (function autoStart(){
    if (window.__rc3d_autostarted) return;
    window.__rc3d_autostarted = true;
    let tries = 0;
    const tick = ()=>{
      tries++;
      start().catch(()=>{
        if (tries < 60) setTimeout(tick, 120);
      });
    };
    tick();
  })();
})();
