import * as THREE from 'three';
import { gsap } from 'gsap';
import { rotateVector } from '../engine/math';
import type { DrivingInput, DrivingState, InputAction } from '../engine/types';
import type { createRenderer } from '../engine/renderer';
import type { createVehicleModel } from '../vehicle/model.js';
import type { createMountainWorld } from '../world/mountain.js';
import type { createDrivingPhysics } from '../vehicle/physics';
import { BOOST_DURATION } from '../vehicle/physics';
import { createMinimap } from '../ui/minimap';
import { constrainChaseCamera } from '../engine/camera';
import { element } from '../ui/dom';
import { createLifecycle } from './lifecycle';
import { createPowerups } from '../world/powerups';

type Dependencies = {
  rendering: ReturnType<typeof createRenderer>;
  model: ReturnType<typeof createVehicleModel>;
  mountain: ReturnType<typeof createMountainWorld>;
  sim: ReturnType<typeof createDrivingPhysics>;
};

export function startDriving({ rendering, model, mountain, sim }: Dependencies) {
  const { stage, scene, renderer, camera, vec, key, quality } = rendering;
  const { paint, wheelAssemblies, whiteLED, redLED } = model;
  const {
    frames,
    N,
    nearestTrack,
    offsetPoint,
    transform,
    rig,
    sky,
    headlamps,
    tailGlow,
    sunOffset,
    updateTunnelLights,
    tunnelForIndex,
    driveGroundHeight,
  } = mountain;
  const { body, vehicle } = sim;
  const powerups = createPowerups(scene, mountain);
  const lifecycle = createLifecycle();
  const { listen, listenDocument, listenElement } = lifecycle;
  let animationFrame = 0;

  let lightsOn = true;
  const input: DrivingInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false,
  };
  let paused = false,
    cameraMode = 0,
    previousTime = 0,
    accumulator = 0,
    simTime = 0,
    lastState: DrivingState = {
      speed: 0,
      steering: 0,
      throttle: 0,
      contacts: 4,
      reverse: false,
      braking: false,
    },
    nearest = nearestTrack(frames[6].p),
    firstDrive = false,
    noticeTimer: ReturnType<typeof setTimeout> | undefined,
    lap = 1,
    lapStart: number | null = null,
    nextSector = 1,
    lastSector = 0,
    lapValid = true;
  const speedEl = element('speed'),
    gearEl = element('gear'),
    surfaceEl = element('surface'),
    timerEl = element('timer'),
    mapCanvas = element<HTMLCanvasElement>('map');
  function clearInput() {
    for (const k of Object.keys(input) as InputAction[]) input[k] = false;
  }
  function notice(message: string) {
    const el = element('notice');
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (el.style.opacity = '0'), 2700);
  }
  function setPaused(value: boolean) {
    paused = value;
    quality.reset();
    clearInput();
    accumulator = 0;
    previousTime = performance.now();
    element('pause').setAttribute('aria-pressed', String(paused));
    element('pauseOverlay').classList.toggle('show', paused);
    if (!paused) stage.focus({ preventScroll: true });
  }
  function switchCamera() {
    cameraMode = (cameraMode + 1) % 2;
    notice(cameraMode ? 'Cámara del conductor' : 'Cámara de seguimiento');
    cameraSnapped = false;
  }
  let cameraSnapped = false;
  function resetCar(initial = false, destination?: number) {
    const frame =
      destination !== undefined
        ? frames[destination]
        : initial
          ? frames[Math.round(N * 0.055)]
          : nearestTrack(body.translation()).frame;
    const p = offsetPoint(frame, initial ? 2.15 : 0);
    sim.reset(
      { x: p.x, y: p.y + 0.7, z: p.z },
      -Math.atan2(frame.tangent.z, frame.tangent.x),
      frame.grade,
    );
    nearest = nearestTrack(p);
    clearInput();
    cameraSnapped = false;
    lapStart = null;
    lastSector = Math.floor(nearest.index / (N / 4));
    nextSector = (lastSector + 1) % 4;
    lapValid = initial || lastSector === 0;
    if (!initial) notice('De vuelta en pista');
  }
  const keys: Record<string, InputAction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Space: 'handbrake',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
  };

  listen('keydown', (event) => {
    if (keys[event.code]) {
      event.preventDefault();
      if (!paused) input[keys[event.code]] = true;
    }
    if (!event.repeat) {
      if (event.code === 'KeyR') {
        event.preventDefault();
        resetCar();
      }
      if (event.code === 'KeyV') {
        event.preventDefault();
        visitTrail();
      }
      if (event.code === 'KeyM') {
        event.preventDefault();
        visitMountain();
      }
      if (event.code === 'KeyL') {
        event.preventDefault();
        toggleLights();
      }
      if (event.code === 'KeyC') {
        event.preventDefault();
        switchCamera();
      }
      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        setPaused(!paused);
      }
    }
  });
  listen('keyup', (event) => {
    if (keys[event.code]) {
      event.preventDefault();
      input[keys[event.code]] = false;
    }
  });
  listen('blur', () => {
    if (!paused) setPaused(true);
  });
  listenDocument('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });
  function toggleLights() {
    lightsOn = !lightsOn;
    element('lights').setAttribute('aria-pressed', String(lightsOn));
    for (const lamp of headlamps) lamp.visible = lightsOn;
    notice(lightsOn ? 'Luces encendidas' : 'Luces apagadas');
    stage.focus({ preventScroll: true });
  }
  function visitMountain() {
    resetCar(false, mountain.mountainStart);
    notice('Puerto del Alba · Comienza la ascensión');
    stage.focus({ preventScroll: true });
  }
  let trailDestination = 0;
  function visitTrail() {
    const trail =
      mountain.trailNetwork.trails[trailDestination++ % mountain.trailNetwork.trails.length];
    const f = trail.frames[18];
    sim.reset(
      { x: f.p.x, y: f.p.y + 0.8, z: f.p.z },
      -Math.atan2(f.tangent.z, f.tangent.x),
      f.grade,
    );
    clearInput();
    nearest = nearestTrack(f.p);
    cameraSnapped = false;
    lapStart = null;
    lapValid = false;
    notice('Atajo ' + trail.name + ' · Explora la montaña');
    stage.focus({ preventScroll: true });
  }
  listenElement(element('trails'), 'click', visitTrail);
  listenElement(element('summit'), 'click', visitMountain);
  listenElement(element('lights'), 'click', toggleLights);
  listenElement(element('pause'), 'click', () => setPaused(!paused));
  listenElement(element('resume'), 'click', () => setPaused(false));
  listenElement(element('reset'), 'click', () => resetCar());
  listenElement(element('camera'), 'click', switchCamera);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
    listenElement(button, 'pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      if (!paused) input[button.dataset.key as InputAction] = true;
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      listenElement(button, name, () => (input[button.dataset.key as InputAction] = false));
  }
  listenElement(stage, 'pointerdown', () => stage.focus({ preventScroll: true }));
  // El acabado se comparte en todos los paneles de carrocería.
  const paintButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-paint]'));
  function selectPaint(hex: string | undefined, animate = false) {
    if (!paintButtons.some((b) => b.dataset.paint === hex)) return;
    const color = new THREE.Color(hex!).convertSRGBToLinear();
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      gsap.to(paint.color, { r: color.r, g: color.g, b: color.b, duration: 0.35, overwrite: true });
    else paint.color.copy(color);
    for (const button of paintButtons)
      button.setAttribute('aria-pressed', String(button.dataset.paint === hex));
    try {
      localStorage.setItem('apex-gt-paint', hex!);
    } catch {}
  }
  for (const button of paintButtons)
    listenElement(button, 'click', () => {
      selectPaint(button.dataset.paint, true);
      stage.focus({ preventScroll: true });
    });
  let savedPaint = '#b9c99b';
  try {
    savedPaint = localStorage.getItem('apex-gt-paint') || savedPaint;
  } catch {}
  selectPaint(savedPaint);
  const drawMap = createMinimap(mapCanvas, frames, mountain.trailNetwork.trails, powerups.entries);
  const skidMat = new THREE.MeshBasicMaterial({
      color: 0x111511,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
    skids = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.004, 0.13), skidMat, 400);
  skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(skids);
  for (let i = 0; i < 400; i++) {
    transform.position.set(0, -100, 0);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    skids.setMatrixAt(i, transform.matrix);
  }
  let skidIndex = 0,
    skidAccumulator = 0;
  let lastHud = 0;
  let measuredFps = 0,
    frameSeconds = 0,
    frameCount = 0;
  function updateHUD() {
    const boost = sim.boostRemaining;
    element('boost-status').textContent =
      boost > 0 ? `IMPULSO · 300 KM/H · ${boost.toFixed(1)} s` : '200 KM/H · RECOGE UN RAYO';
    element('boost-meter').style.width = `${(boost / BOOST_DURATION) * 100}%`;
    element('boost-panel').classList.toggle('active', boost > 0);
    const velocity = body.linvel(),
      speed = Math.hypot(velocity.x, velocity.z) * 3.6;
    speedEl.textContent = String(Math.round(speed));
    gearEl.textContent = lastState.reverse
      ? 'R · REVERSA'
      : speed < 0.5 && !input.up
        ? 'N · DETENIDO'
        : 'D · AUTOMÁTICO';
    element('power').style.width = `${Math.abs(lastState.throttle) * 100}%`;
    const up = rotateVector(body.rotation(), { x: 0, y: 1, z: 0 });
    surfaceEl.textContent =
      up.y < 0.25
        ? 'VOLCADO · PULSA R'
        : lastState.contacts === 0
          ? 'EN AIRE'
          : nearest.distance > 4.2
            ? mountain.trailNetwork.sample(body.translation()).distance < 6
              ? 'ATAJO · ' +
                mountain.trailNetwork.sample(body.translation()).trail.name.toUpperCase()
              : mountain.boundary.distance(body.translation()) < 35
                ? 'LÍMITE · MURO DE PIEDRA'
                : 'CAMPO · TRACCIÓN 4×4'
            : input.handbrake
              ? 'FRENO DE MANO'
              : tunnelForIndex(nearest.index)
                ? 'TÚNEL · FAROS L'
                : Math.abs(nearest.frame.grade) > 0.035
                  ? (nearest.frame.grade > 0 ? 'SUBIDA · ' : 'BAJADA · ') +
                    Math.round(Math.abs(nearest.frame.grade) * 100) +
                    '%'
                  : 'EN PISTA';
    const seconds = lapStart === null ? 0 : simTime - lapStart;
    timerEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
    element('lap').textContent = `VUELTA ${String(lap).padStart(2, '0')}`;
    const p = body.translation();
    element('stats').textContent = JSON.stringify({
      x: +p.x.toFixed(3),
      y: +p.y.toFixed(3),
      z: +p.z.toFixed(3),
      speed: +speed.toFixed(2),
      contacts: lastState.contacts,
      paused,
      lightsOn,
      throttle: +lastState.throttle.toFixed(2),
      steer: +lastState.steering.toFixed(3),
      boostRemaining: +sim.boostRemaining.toFixed(2),
      speedLimit: sim.speedLimitKmh,
      fps: measuredFps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
      distance: +nearest.distance.toFixed(2),
      altitude: +p.y.toFixed(1),
      grade: +nearest.frame.grade.toFixed(3),
      tunnel: tunnelForIndex(nearest.index)?.name || null,
    });
    drawMap(body.translation(), body.rotation(), simTime);
  }
  function physicsTick(dt: number) {
    nearest = nearestTrack(body.translation());
    const previousPosition = body.translation();
    lastState = sim.step(input, dt, nearest.distance > 4.2);
    mountain.boundary.enforce(body);
    simTime += dt;
    if (powerups.collect(previousPosition, body.translation(), simTime)) {
      sim.activateBoost();
      notice(`¡IMPULSO! · Hasta 300 km/h durante ${BOOST_DURATION} s`);
    }
    if (input.up || input.down) {
      if (lapStart === null) lapStart = simTime;
      if (!firstDrive) {
        firstDrive = true;
        element('instructions').style.opacity = '0';
      }
    }
    const sector = Math.floor(nearest.index / (N / 4));
    if (sector !== lastSector) {
      if (sector === nextSector) {
        if (sector === 0) {
          if (lapValid && lapStart !== null) {
            notice(`Vuelta completada · ${(simTime - lapStart).toFixed(1)} s`);
            lap++;
            lapStart = simTime;
          }
          lapValid = true;
        }
        nextSector = (sector + 1) % 4;
      }
      lastSector = sector;
    }
    if (body.translation().y < driveGroundHeight(body.translation().x, body.translation().z) - 8)
      resetCar();
    skidAccumulator += dt;
    if (skidAccumulator > 0.05) {
      skidAccumulator = 0;
      const velocity = body.linvel(),
        right = rotateVector(body.rotation(), { x: 0, y: 0, z: 1 }),
        sideSpeed = Math.abs(velocity.x * right.x + velocity.z * right.z);
      if (
        (input.handbrake || sideSpeed > 2.5) &&
        Math.abs(lastState.speed) > 3 &&
        nearest.distance < 4.3
      ) {
        for (const i of [0, 1])
          if (vehicle.wheelIsInContact(i)) {
            const point = vehicle.wheelContactPoint(i);
            if (!point) continue;
            transform.position.set(point.x, point.y + 0.016, point.z);
            const f = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
            transform.rotation.set(0, -Math.atan2(f.z, f.x), 0);
            transform.scale.set(1, 1, 1);
            transform.updateMatrix();
            skids.setMatrixAt(skidIndex++ % 400, transform.matrix);
          }
        skids.instanceMatrix.needsUpdate = true;
      }
    }
  }
  const cameraTarget = vec(0, 0, 0),
    cameraPosition = vec(0, 0, 0),
    rigQuat = new THREE.Quaternion(),
    lookAt = vec(0, 0, 0);
  function draw(dt: number) {
    const p = body.translation(),
      q = body.rotation();
    rig.position.set(p.x, p.y, p.z);
    rigQuat.set(q.x, q.y, q.z, q.w);
    rig.quaternion.copy(rigQuat);
    for (let i = 0; i < 4; i++) {
      const length = vehicle.wheelSuspensionLength(i) ?? 0.32;
      wheelAssemblies[i].pivot.position.y = (0.48 + 0.18 - length) / 0.52;
      wheelAssemblies[i].pivot.rotation.y = vehicle.wheelSteering(i) ?? 0;
      wheelAssemblies[i].roll.rotation.z = -(vehicle.wheelRotation(i) ?? 0);
    }
    redLED.emissiveIntensity = lastState.braking ? 4 : lightsOn ? 1.5 : 0;
    whiteLED.emissiveIntensity = lightsOn ? 4 : 0;
    tailGlow.intensity = lastState.braking ? 1.6 : lightsOn ? 0.85 : 0;
    powerups.update(simTime);
    sky.position.copy(camera.position);
    const forward = vec(1, 0, 0).applyQuaternion(rigQuat),
      side = vec(0, 0, 1).applyQuaternion(rigQuat);
    if (cameraMode === 0) {
      cameraPosition
        .copy(rig.position)
        .addScaledVector(forward, -7.8 - Math.min(3, Math.abs(lastState.speed) * 0.06))
        .addScaledVector(side, 0.6);
      cameraPosition.y += 3.4;
      constrainChaseCamera(cameraPosition, mountain, rig.position);
      cameraTarget.copy(rig.position).addScaledVector(forward, 3.5);
      cameraTarget.y += 0.55;
    } else {
      cameraPosition.copy(rig.position).addScaledVector(forward, 0.34).addScaledVector(side, -0.34);
      cameraPosition.y += 0.49;
      cameraTarget.copy(cameraPosition).addScaledVector(forward, 25);
      cameraTarget.y -= 0.55;
    }
    if (!cameraSnapped) {
      camera.position.copy(cameraPosition);
      lookAt.copy(cameraTarget);
      cameraSnapped = true;
    } else {
      camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * (cameraMode ? 20 : 5)));
      lookAt.lerp(cameraTarget, 1 - Math.exp(-dt * 8));
    }
    if (cameraMode === 0) constrainChaseCamera(camera.position, mountain, rig.position);
    camera.lookAt(lookAt);
    camera.fov = 58 + Math.min(8, Math.abs(lastState.speed) * 0.14);
    camera.updateProjectionMatrix();
    key.position.copy(rig.position).add(sunOffset);
    key.target.position.copy(rig.position);
    updateTunnelLights(rig.position);
    renderer.render(scene, camera);
  }
  function animate(now: number) {
    animationFrame = requestAnimationFrame(animate);
    const rawDt = (now - previousTime) / 1000 || 0;
    const dt = Math.min(rawDt, 0.1);
    previousTime = now;
    if (!paused) {
      frameSeconds += rawDt;
      frameCount++;
      if (frameSeconds >= 1) {
        measuredFps = Math.round(frameCount / frameSeconds);
        frameSeconds = 0;
        frameCount = 0;
        element('fps').textContent = measuredFps + ' FPS';
      }
      if (quality.sample(rawDt)) renderer.setPixelRatio(quality.ratio);
      accumulator = Math.min(accumulator + dt, 8 / 120);
      let steps = 0;
      while (accumulator >= 1 / 120 && steps++ < 8) {
        physicsTick(1 / 120);
        accumulator -= 1 / 120;
      }
      draw(dt);
    }
    if (now - lastHud > 100) {
      lastHud = now;
      updateHUD();
    }
  }
  listen('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.ratio);
    renderer.setSize(innerWidth, innerHeight);
    cameraSnapped = false;
  });
  listenElement(renderer.domElement, 'webglcontextlost', (event) => {
    event.preventDefault();
    setPaused(true);
    element('loading').style.display = 'grid';
    element('loadText').textContent =
      'Se perdió el contexto gráfico. Recarga la página para continuar.';
  });
  // The world is static; only the car, sky and moving light targets need transforms.
  for (const root of scene.children) {
    if (
      root === rig ||
      root === sky ||
      root === key.target ||
      root.name === 'powerup-300' ||
      root instanceof THREE.Light
    )
      continue;
    root.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }
  resetCar(true);
  for (let i = 0; i < 90; i++) sim.step(input, 1 / 120);
  draw(0);
  updateHUD();
  element('loading').style.display = 'none';
  gsap.from(['header', '.controls', '.map-wrap', '.telemetry'], {
    opacity: 0,
    y: 7,
    duration: 0.6,
    stagger: 0.04,
  });
  stage.focus({ preventScroll: true });
  previousTime = performance.now();
  animationFrame = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(animationFrame);
    clearTimeout(noticeTimer);
    lifecycle.dispose();
    gsap.killTweensOf(paint.color);
    gsap.killTweensOf(['header', '.controls', '.map-wrap', '.telemetry']);
  };
}
