// rc3d_sensors_v2.js
// Simple, always-visible sensor models + mounting/update for the 3D overlay.
//
// Changes vs rc3d_sensors.js:
// - Distance sensor is ~3x bigger and points forward.
// - Line sensor is a thin stick; LEDs + scan beam point down.
// - Both have semi-transparent red beams.
// - "Rotate sensor 360°" uses mount.userData.rayYaw (whatever your existing controls update).

function makeBeam(THREE, { length, radius, axis, opacity = 0.25 }) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  // Cylinder is along +Y by default.
  const geo = new THREE.CylinderGeometry(radius, radius, length, 14, 1, true);
  const m = new THREE.Mesh(geo, mat);

  if (axis === 'z') {
    // forward (local -Z)
    m.rotation.x = Math.PI / 2;
    m.position.z = -length / 2;
  } else if (axis === 'z+') {
    // forward (local +Z)
    m.rotation.x = Math.PI / 2;
    m.position.z = length / 2;
  } else if (axis === 'x') {
    m.rotation.z = Math.PI / 2;
    m.position.x = length / 2;
  } else if (axis === 'x-') {
    m.rotation.z = Math.PI / 2;
    m.position.x = -length / 2;
  } else if (axis === 'y-') {
    // down (local -Y)
    m.position.y = -length / 2;
  } else if (axis === 'y+') {
    m.position.y = length / 2;
  }

  m.renderOrder = 10;
  return m;
}

export function makeDistanceSensorModel(THREE) {
  const g = new THREE.Group();

  const matBoard = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.7,
    metalness: 0.05,
  });
  const matEye = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.25,
    metalness: 0.8,
  });

  // Board
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.18), matBoard);
  board.position.y = 0.06;
  g.add(board);

  // Eyes: face forward along local -Z (flip mount/group if your car forward is +Z)
  const eyeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18);
  eyeGeo.rotateX(Math.PI / 2);
  const eyeL = new THREE.Mesh(eyeGeo, matEye);
  const eyeR = new THREE.Mesh(eyeGeo, matEye);
  eyeL.position.set(-0.07, 0.07, -0.095);
  eyeR.position.set(0.07, 0.07, -0.095);
  g.add(eyeL, eyeR);

  // Semi-transparent red beam (forward)
  const beam = makeBeam(THREE, { length: 2.2, radius: 0.03, axis: 'z', opacity: 0.22 });
  beam.position.y = 0.07;
  g.add(beam);
  g.userData.beam = beam;

  // Make it ~3x bigger as requested
  g.scale.setScalar(3.0);
  return g;
}

export function makeLineSensorModel(THREE) {
  const g = new THREE.Group();

  const matBody = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.05,
  });
  const matLED = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0x332200,
    emissiveIntensity: 0.9,
  });

  // Thin stick: long in Z, thin in X/Y
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.32), matBody);
  // Place the stick so its "front" hangs over the edge a bit
  stick.position.set(0, 0, -0.10);
  g.add(stick);

  // Two LEDs on the bottom, facing DOWN
  const ledGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 14);
  const ledL = new THREE.Mesh(ledGeo, matLED);
  const ledR = new THREE.Mesh(ledGeo, matLED);
  ledL.position.set(-0.015, -0.02, -0.22);
  ledR.position.set(0.015, -0.02, -0.22);
  g.add(ledL, ledR);

  // Downward scan beam from LEFT LED
  const scan = makeBeam(THREE, { length: 0.8, radius: 0.02, axis: 'y-', opacity: 0.20 });
  scan.position.copy(ledL.position);
  g.add(scan);
  g.userData.scanBeam = scan;

  // A bit larger so it's visible, but still looks like a small module
  g.scale.setScalar(2.7);
  return g;
}

export function mountSensors({ THREE, car, sim, opts, rayGroup }) {
  const sensorMounts = car.userData.sensorMounts || [];
  const sensorObjs = [];
  const sensorPickMeshes = [];

  for (let i = 0; i < sensorMounts.length; i++) {
    // Invisible-ish pick proxy
    const pm = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.0, depthWrite: false })
    );
    pm.userData.sensorIndex = i;
    sensorMounts[i].add(pm);
    sensorPickMeshes.push(pm);

    // Typically controlled elsewhere in your overlay (Shift+RMB etc).
    sensorMounts[i].userData.rayYaw = sensorMounts[i].userData.rayYaw ?? 0;
    sensorMounts[i].userData.rayPitch = sensorMounts[i].userData.rayPitch ?? 0;

    const sg = new THREE.Group();
    const dist = makeDistanceSensorModel(THREE);
    const line = makeLineSensorModel(THREE);
    sg.add(dist);
    sg.add(line);
    sg.userData.distanceModel = dist;
    sg.userData.lineModel = line;

    sensorMounts[i].add(sg);
    sensorObjs.push(sg);
  }

  function getSensorConfig() {
    const en = sim.sensorEnabled || (sim.state && sim.state.sensorEnabled) || [true, true, true, true];
    const md = sim.sensorModes || (sim.state && sim.state.sensorModes) || ['color', 'color', 'color', 'color'];
    return { enabled: en, modes: md };
  }

  function updateSensors() {
    const cfg = getSensorConfig();

    for (let i = 0; i < sensorObjs.length; i++) {
      const sg = sensorObjs[i];
      const mount = sensorMounts[i];
      if (!sg || !mount) continue;

      const enabled = !!(cfg.enabled && cfg.enabled[i]);
      const mode = (cfg.modes && cfg.modes[i]) || 'color';
      sg.visible = enabled;

      const distM = sg.userData.distanceModel;
      const lineM = sg.userData.lineModel;
      const isDist = mode === 'distance';

      if (distM) distM.visible = isDist;
      if (lineM) lineM.visible = !isDist; // 'color'/'light' share the same visual

      // Put sensors on TOP of the cover (mount itself should be on the cover already).
      // We only add local offsets here.
      if (isDist) {
        // On top, slightly forward. Keep it close to the cover so it doesn't look like it floats.
        sg.position.set(0, 0.07, -0.06);
        // allow full 360° by using existing yaw
        sg.rotation.set(0, mount.userData.rayYaw || 0, 0);
      } else {
        // Reflective/line sensor: sit just under the chassis and near the front edge.
        // (Previous values made it look like it was hanging in mid-air.)
        sg.position.set(0, -0.28, -0.30);
        sg.rotation.set(0, mount.userData.rayYaw || 0, 0);
      }
    }

    // Existing distance ray lines (if your overlay draws them separately)
    const rays = rayGroup && rayGroup.userData && rayGroup.userData.rays;
    if (Array.isArray(rays)) {
      for (let i = 0; i < 4; i++) {
        const ln = rays[i];
        if (!ln) continue;
        const enabled = !!cfg.enabled[i];
        const mode = cfg.modes[i] || 'color';
        ln.visible = enabled && mode === 'distance';
      }
    }
  }

  return { sensorMounts, sensorObjs, sensorPickMeshes, updateSensors };
}
