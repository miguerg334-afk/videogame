import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { gsap } from 'gsap';
import { rotateVector } from '../engine/math';
import type { DrivingInput, DrivingState, InputAction } from '../engine/types';
import type { createRenderer } from '../engine/renderer';
import type { createVehicleModel } from '../vehicle/model.js';
import type { createMountainWorld } from '../world/mountain.js';
import type { createDrivingPhysics } from '../vehicle/physics';
import { createMinimap } from '../ui/minimap';
import { constrainChaseCamera } from '../engine/camera';
import { element } from '../ui/dom';
import { createLifecycle } from './lifecycle';
import { createExhaustFlames } from '../vehicle/exhaust-flames';
import { createContactShadow } from '../vehicle/contact-shadow';
import { freezeWorldTransforms } from '../engine/transforms';
import { createPoliceModel } from '../police/model';
import { createPursuit } from '../police/pursuit';
import { createReinforcements } from '../police/reinforcements';
import { createAirPursuit, AIR_CAPTURE_SECONDS } from '../police/air-pursuit';
import { createAirVisual } from '../police/air-visual';
import { createPursuitNavigation } from '../police/navigation';
import { CAPTURE_SECONDS, createGameSession } from './session';
import { renderRatioLimit } from '../engine/quality';
import { DRIVING_CAMERAS, frameDrivingCamera, policeBearing } from '../engine/driving-cameras';

const PHYSICS_STEP = 1 / 60;
const MAX_PHYSICS_STEPS = 4;

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
    driveGroundHeight,
  } = mountain;
  const { body, vehicle } = sim;
  const policeModel = createPoliceModel(model, document);
  scene.add(policeModel.rig);
  const navigation = createPursuitNavigation(mountain);
  const police = createPursuit(mountain.world, driveGroundHeight, navigation);
  const backupModel = createPoliceModel(model, document);
  backupModel.rig.visible = false;
  scene.add(backupModel.rig);
  const reinforcements = createReinforcements(
    police,
    mountain.world,
    driveGroundHeight,
    navigation,
    () => {
      const player = body.translation(),
        near = nearestTrack(player);
      for (const distance of [80, 110, 140, 170, 200]) {
        const index = (near.index - Math.ceil(distance / (mountain.trackLength / N)) + N) % N;
        for (const lateral of [-2.5, 2.5]) {
          const start = offsetPoint(frames[index], lateral);
          const other = police.body.translation();
          if (Math.hypot(start.x - other.x, start.z - other.z) < 12) continue;
          const next = offsetPoint(frames[(index + 8) % N], lateral);
          return [
            { x: start.x, y: start.y + 0.7, z: start.z },
            { x: next.x, y: next.y + 0.7, z: next.z },
          ];
        }
      }
      const f = frames[(near.index + N - 200) % N];
      return [{ x: f.p.x, y: f.p.y + 0.7, z: f.p.z }, player];
    },
  );
  function closestOfficer(position: import('../engine/types').VectorLike) {
    const backup = reinforcements.officer;
    if (!backup) return police;
    const a = police.body.translation(),
      b = backup.body.translation();
    return (a.x - position.x) ** 2 + (a.z - position.z) ** 2 <=
      (b.x - position.x) ** 2 + (b.z - position.z) ** 2
      ? police
      : backup;
  }
  const air = createAirPursuit(driveGroundHeight, (origin, target) => {
    const dx = target.x - origin.x,
      dy = target.y + 0.4 - origin.y,
      dz = target.z - origin.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.001) return false;
    return !!mountain.world.castRay(
      new R.Ray(origin, { x: dx / length, y: dy / length, z: dz / length }),
      Math.max(0, length - 0.15),
      true,
      R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
    );
  });
  const airVisual = createAirVisual(scene, document, (x, z) => {
    const distance = nearestTrack({ x, z }).distance;
    if (distance < 5) return mountain.routeHeight(x, z) + 0.075;
    if (distance < 6.4) return mountain.routeHeight(x, z) + 0.04;
    return mountain.terrain.sampleSurfaceHeight(x, z);
  });
  const session = createGameSession();
  document.body.classList.add('is-menu');
  element('startMenu').hidden = false;
  const exhaustFlames = createExhaustFlames(model.car);
  const carShadow = createContactShadow(rig);
  const policeShadow = createContactShadow(policeModel.rig);
  const backupShadow = createContactShadow(backupModel.rig);
  const lifecycle = createLifecycle();
  const { listen, listenDocument, listenElement } = lifecycle;
  lifecycle.onDispose(() => {
    reinforcements.reset();
    police.dispose();
  });
  let animationFrame = 0;

  let lightsOn = true;
  const input: DrivingInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false,
  };
  let lastPoliceLevel = 1;
  let cameraMode = 1,
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
    if (session.caught || session.inMenu) return;
    session.setPaused(value);
    quality.reset();
    clearInput();
    accumulator = 0;
    lookingBack = false;
    previousTime = performance.now();
    element('pause').setAttribute('aria-pressed', String(session.paused));
    element('pauseOverlay').classList.toggle('show', session.paused);
    if (session.running) stage.focus({ preventScroll: true });
  }
  function updateCameraButtons() {
    element<HTMLSelectElement>('camera').value = String(cameraMode);
  }
  function selectCamera(mode: number) {
    cameraMode = mode;
    lookingBack = false;
    cameraSnapped = false;
    updateCameraButtons();
    if (!session.inMenu) notice(`Cámara · ${DRIVING_CAMERAS[mode]}`);
    if (!session.running) draw(0);
  }
  function switchCamera() {
    selectCamera((cameraMode + 1) % DRIVING_CAMERAS.length);
  }
  function beginPlay() {
    session.start();
    document.body.classList.remove('is-menu');
    element('startMenu').hidden = true;
    resetCar(true);
    firstDrive = false;
    element('instructions').style.opacity = '1';
    notice('Acelera para empezar · B para vigilar a la patrulla');
    stage.focus({ preventScroll: true });
  }
  function openMenu() {
    session.openMenu();
    document.body.classList.add('is-menu');
    element('startMenu').hidden = false;
    element('pauseOverlay').classList.remove('show');
    element('gameOver').hidden = true;
    clearInput();
    accumulator = 0;
    resetCar(true);
    updateCameraButtons();
    draw(0);
    element('play').focus({ preventScroll: true });
  }
  let cameraSnapped = false,
    lookingBack = false;
  function resetPursuit() {
    air.reset();
    airVisual.reset();
    reinforcements.reset();
    backupModel.rig.visible = false;
    session.resetRound();
    element('gameOver').hidden = true;
    lastPoliceLevel = 1;
    lookingBack = false;
    lastState = { speed: 0, steering: 0, throttle: 0, contacts: 4, reverse: false, braking: false };
    const p = body.translation(),
      near = nearestTrack(p);
    const lateral = THREE.MathUtils.clamp(
      (p.x - near.frame.p.x) * near.frame.normal.x + (p.z - near.frame.p.z) * near.frame.normal.z,
      -3,
      3,
    );
    const count = Math.ceil(55 / (mountain.trackLength / N));
    const seed: import('../engine/types').VectorLike[] = [];
    for (let i = count; i >= 0; i--) {
      const f = frames[(near.index - i + N) % N],
        point = offsetPoint(f, lateral);
      seed.push({ x: point.x, y: point.y + 0.7, z: point.z });
    }
    seed.push(p);
    police.reset(seed);
    lap = 1;
    setPaused(false);
  }
  function losePursuit(fromAir = false) {
    session.lose();
    clearInput();
    accumulator = 0;
    element('pauseOverlay').classList.remove('show');
    element('caught-result').textContent =
      `Sobreviviste ${Math.floor(police.elapsed)} s · Intensidad ${police.difficulty.level}/${police.difficulty.levelCount}${fromAir ? ' · Captura aérea' : ''}`;
    element('gameOver').hidden = false;
    element('restart').focus({ preventScroll: true });
  }
  function resetCar(initial = false) {
    const frame = initial ? frames[Math.round(N * 0.055)] : nearestTrack(body.translation()).frame;
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
    resetPursuit();
    if (!initial) notice('La patrulla está en camino. ¡Acelera!');
  }
  function recoverCar() {
    if (session.inMenu || session.caught) return;
    sim.recover(driveGroundHeight);
    clearInput();
    lastState = { speed: 0, steering: 0, throttle: 0, contacts: 0, reverse: false, braking: false };
    cameraSnapped = false;
    notice('De vuelta sobre las ruedas. ¡Sigue!');
    if (!session.running) draw(0);
    stage.focus({ preventScroll: true });
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
    if (session.inMenu || event.target instanceof HTMLSelectElement) return;
    if (session.caught && event.code !== 'KeyR') return;
    if (event.code === 'KeyB' && session.running && !lookingBack) {
      lookingBack = true;
      cameraSnapped = false;
      event.preventDefault();
    }
    if (keys[event.code]) {
      event.preventDefault();
      if (session.running) input[keys[event.code]] = true;
    }
    if (!event.repeat) {
      if (/^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        selectCamera(Number(event.code.slice(-1)) - 1);
      }
      if (event.code === 'KeyF') {
        event.preventDefault();
        recoverCar();
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        resetCar();
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
        setPaused(!session.paused);
      }
    }
  });
  listen('keyup', (event) => {
    if (event.code === 'KeyB' && lookingBack) {
      lookingBack = false;
      cameraSnapped = false;
    }
    if (keys[event.code]) {
      event.preventDefault();
      input[keys[event.code]] = false;
    }
  });
  listen('blur', () => {
    if (session.running) setPaused(true);
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
  listenElement(element('lights'), 'click', toggleLights);
  listenElement(element('pause'), 'click', () => setPaused(!session.paused));
  listenElement(element('resume'), 'click', () => setPaused(false));
  listenElement(element('reset'), 'click', () => resetCar());
  listenElement(element('recover'), 'click', recoverCar);
  listenElement(element('restart'), 'click', () => resetCar());
  listenElement(element('camera'), 'focus', clearInput);
  listenElement(element('camera'), 'change', () => {
    selectCamera(Number(element<HTMLSelectElement>('camera').value));
    stage.focus({ preventScroll: true });
  });
  listenElement(element('play'), 'click', beginPlay);
  for (const id of ['home', 'pause-menu', 'caught-menu'])
    listenElement(element(id), 'click', openMenu);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
    listenElement(button, 'pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      if (session.running) input[button.dataset.key as InputAction] = true;
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
  const drawMap = createMinimap(mapCanvas, frames, mountain.trailNetwork.trails);
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
  const hudPlayer = new THREE.Vector3(),
    hudPolice = new THREE.Vector3(),
    hudRotation = new THREE.Quaternion();
  function updateHUD() {
    const difficulty = police.difficulty,
      target = body.translation(),
      pursuer = closestOfficer(target).body.translation();
    const policeDistance = Math.hypot(
      target.x - pursuer.x,
      target.y - pursuer.y,
      target.z - pursuer.z,
    );
    element('pursuit-level').textContent =
      `INTENSIDAD ${difficulty.level}/${difficulty.levelCount}`;
    element('pursuit-distance').textContent = police.started
      ? `POLICÍA A ${Math.round(policeDistance)} M · ${Math.floor(police.elapsed)} S`
      : 'ACELERA PARA COMENZAR';
    element('pursuit-meter').classList.toggle('maximum-alert', difficulty.maximumAlert);
    element('pursuit-meter').style.width = `${8 + difficulty.intensity * 92}%`;
    element('capture-warning').hidden = session.captureSeconds === 0;
    element('capture-label').textContent =
      `ESCAPA · ${(CAPTURE_SECONDS - session.captureSeconds).toFixed(1)} S`;
    element('capture-meter').style.width = `${session.captureProgress * 100}%`;
    element('capture-bar').setAttribute('aria-valuenow', session.captureSeconds.toFixed(1));
    element('air-hud').hidden = !air.active;
    element('air-status').textContent = air.illuminated
      ? `SAL DEL FOCO · ${(AIR_CAPTURE_SECONDS - air.exposure).toFixed(1)} S`
      : 'HELICÓPTERO · 230 KM/H';
    element('air-hud').classList.toggle('illuminated', air.illuminated);
    element('air-meter').style.width = `${(air.exposure / AIR_CAPTURE_SECONDS) * 100}%`;
    element('air-capture').setAttribute('aria-valuenow', air.exposure.toFixed(1));
    const velocity = body.linvel(),
      speed = Math.hypot(velocity.x, velocity.z) * 3.6;
    speedEl.textContent = String(Math.round(speed));
    element('speed-limit').textContent =
      `TÚ ${Math.round(sim.speedLimitKmh)} · POLICÍA ${Math.round(police.difficulty.maxSpeed * 3.6)} KM/H`;
    gearEl.textContent = lastState.reverse
      ? 'R · REVERSA'
      : speed < 0.5 && !input.up
        ? 'N · DETENIDO'
        : 'D · AUTOMÁTICO';
    element('power').style.width = `${Math.abs(lastState.throttle) * 100}%`;
    const up = rotateVector(body.rotation(), { x: 0, y: 1, z: 0 });
    surfaceEl.textContent =
      up.y < 0.25
        ? 'VOLCADO · PULSA F'
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
      paused: session.paused,
      phase: session.phase,
      camera: DRIVING_CAMERAS[cameraMode],
      lightsOn,
      throttle: +lastState.throttle.toFixed(2),
      steer: +lastState.steering.toFixed(3),
      speedLimit: sim.speedLimitKmh,
      caught: session.caught,
      captureSeconds: +session.captureSeconds.toFixed(2),
      pursuitSeconds: +police.elapsed.toFixed(2),
      policeLevel: difficulty.level,
      policeCount: reinforcements.officer ? 2 : 1,
      helicopterActive: air.active,
      illuminated: air.illuminated,
      airCaptureSeconds: air.exposure,
      policeDistance: +policeDistance.toFixed(2),
      fps: measuredFps,
      drawCalls: renderer.info.render.calls,
      physicsHz: 1 / PHYSICS_STEP,
      activeTreeColliders: mountain.forest.activeColliderCount,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
      distance: +nearest.distance.toFixed(2),
      altitude: +p.y.toFixed(1),
      grade: +nearest.frame.grade.toFixed(3),
    });
    const q = body.rotation();
    hudPlayer.set(target.x, target.y, target.z);
    hudPolice.set(pursuer.x, pursuer.y, pursuer.z);
    hudRotation.set(q.x, q.y, q.z, q.w);
    element('police-direction').textContent = policeBearing(hudPlayer, hudRotation, hudPolice);
    drawMap(
      body.translation(),
      body.rotation(),
      police.body.translation(),
      simTime,
      reinforcements.officer ? [reinforcements.officer.body.translation()] : [],
      air.active ? air.position : undefined,
    );
  }
  function physicsTick(dt: number) {
    mountain.forest.updateColliders(
      body.translation(),
      police.body.translation(),
      reinforcements.officer?.body.translation(),
    );
    nearest = nearestTrack(body.translation());
    police.step(
      dt,
      body.translation(),
      input.up || input.down || Math.abs(lastState.speed) > 0.5,
      nearestTrack(police.body.translation()).distance > 4.2,
    );
    reinforcements.prepare(dt, body.translation(), (p) => nearestTrack(p).distance > 4.2);
    backupModel.rig.visible = !!reinforcements.officer;
    sim.setPursuitTime(police.elapsed);
    sim.prepare(input, dt, nearest.distance > 4.2);
    mountain.world.timestep = dt;
    mountain.world.step();
    lastState = sim.finish();
    police.afterStep();
    reinforcements.officer?.afterStep();
    if (reinforcements.officer) mountain.boundary.enforce(reinforcements.officer.body);
    mountain.boundary.enforce(body);
    mountain.boundary.enforce(police.body);
    simTime += dt;
    air.step(dt, police.elapsed, body.translation(), body.linvel());
    if (air.caught) {
      losePursuit(true);
      return;
    }
    if (
      session.updateCapture(police.touches(body) || !!reinforcements.officer?.touches(body), dt)
    ) {
      losePursuit();
      return;
    }
    if (police.difficulty.level !== lastPoliceLevel) {
      lastPoliceLevel = police.difficulty.level;
      notice(
        police.difficulty.level === 7
          ? 'APOYO AÉREO · Evita el foco blanco'
          : police.difficulty.level === 6
            ? 'REFUERZOS · Dos patrullas en persecución'
            : police.difficulty.maximumAlert
              ? 'ALERTA MÁXIMA · La patrulla alcanza 200 km/h'
              : `Sube la presión · Intensidad ${lastPoliceLevel}/${police.difficulty.levelCount}`,
      );
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
      recoverCar();
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
    policeCameraPosition = new THREE.Vector3(),
    lookAt = vec(0, 0, 0);
  function updateOfficer(
    officer: ReturnType<typeof createPursuit>,
    appearance: ReturnType<typeof createPoliceModel>,
    shadow: THREE.Mesh,
    dt: number,
    time: number,
  ) {
    const p = officer.body.translation(),
      q = officer.body.rotation();
    appearance.rig.position.set(p.x, p.y, p.z);
    appearance.rig.quaternion.set(q.x, q.y, q.z, q.w);
    appearance.update(time, officer.speed, dt);
    shadow.visible = officer.state.contacts > 1;
    for (let i = 0; i < 4; i++) {
      appearance.wheels[i].pivot.position.y =
        (0.66 - (officer.vehicle.wheelSuspensionLength(i) ?? 0.32)) / 0.52;
      appearance.wheels[i].pivot.rotation.y = officer.vehicle.wheelSteering(i) ?? 0;
      appearance.wheels[i].roll.rotation.z = -(officer.vehicle.wheelRotation(i) ?? 0);
    }
  }
  function draw(dt: number, previewTime = simTime) {
    const p = body.translation(),
      q = body.rotation();
    airVisual.update(air, dt, previewTime);
    rig.position.set(p.x, p.y, p.z);
    rigQuat.set(q.x, q.y, q.z, q.w);
    rig.quaternion.copy(rigQuat);
    const policePosition = closestOfficer(p).body.translation();
    updateOfficer(police, policeModel, policeShadow, dt, previewTime);
    if (reinforcements.officer)
      updateOfficer(reinforcements.officer, backupModel, backupShadow, dt, previewTime);
    for (let i = 0; i < 4; i++) {
      const length = vehicle.wheelSuspensionLength(i) ?? 0.32;
      wheelAssemblies[i].pivot.position.y = (0.48 + 0.18 - length) / 0.52;
      wheelAssemblies[i].pivot.rotation.y = vehicle.wheelSteering(i) ?? 0;
      wheelAssemblies[i].roll.rotation.z = -(vehicle.wheelRotation(i) ?? 0);
    }
    carShadow.visible = lastState.contacts > 1;
    redLED.emissiveIntensity = lastState.braking ? 4 : lightsOn ? 1.5 : 0;
    whiteLED.emissiveIntensity = lightsOn ? 4 : 0;
    tailGlow.intensity = lastState.braking ? 1.6 : lightsOn ? 0.85 : 0;
    exhaustFlames.update(
      dt,
      simTime,
      input.up && !lastState.braking && !lastState.reverse && simTime % 1.6 < 0.2,
      lastState.throttle,
      lastState.speed,
    );
    sky.position.copy(camera.position);
    policeCameraPosition.set(policePosition.x, policePosition.y, policePosition.z);
    const fov = frameDrivingCamera(
      lookingBack ? 3 : cameraMode,
      rig.position,
      rigQuat,
      policeCameraPosition,
      lastState.speed,
      cameraPosition,
      cameraTarget,
      camera.aspect,
    );
    constrainChaseCamera(cameraPosition, mountain, rig.position);
    if (!cameraSnapped) {
      camera.position.copy(cameraPosition);
      lookAt.copy(cameraTarget);
      cameraSnapped = true;
    } else {
      camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * 6));
      lookAt.lerp(cameraTarget, 1 - Math.exp(-dt * 8));
    }
    constrainChaseCamera(camera.position, mountain, rig.position);
    camera.lookAt(lookAt);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    key.position.copy(rig.position).add(sunOffset);
    key.target.position.copy(rig.position);
    updateMovingTransforms();
    renderer.render(scene, camera);
  }
  let lastMenuFrame = 0;
  function animate(now: number) {
    animationFrame = requestAnimationFrame(animate);
    const rawDt = (now - previousTime) / 1000 || 0;
    const dt = Math.min(rawDt, 0.1);
    previousTime = now;
    if (session.running) {
      frameSeconds += rawDt;
      frameCount++;
      if (frameSeconds >= 1) {
        measuredFps = Math.round(frameCount / frameSeconds);
        frameSeconds = 0;
        frameCount = 0;
        element('fps').textContent = measuredFps + ' FPS';
      }
      if (quality.sample(rawDt)) renderer.setPixelRatio(quality.ratio);
      accumulator = Math.min(accumulator + dt, MAX_PHYSICS_STEPS * PHYSICS_STEP);
      let steps = 0;
      while (accumulator >= PHYSICS_STEP && steps++ < MAX_PHYSICS_STEPS) {
        physicsTick(PHYSICS_STEP);
        if (session.caught) {
          accumulator = 0;
          break;
        }
        accumulator -= PHYSICS_STEP;
      }
      draw(dt);
    } else if (session.inMenu && now - lastMenuFrame >= 1000 / 30 && !document.hidden) {
      // A live preview without advancing physics, survival time or police intensity.
      lastMenuFrame = now;
      draw(0, now / 1000);
    }
    if (now - lastHud > 100) {
      lastHud = now;
      updateHUD();
    }
  }
  listen('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    quality.resize(renderRatioLimit(innerWidth, innerHeight, devicePixelRatio));
    renderer.setPixelRatio(quality.ratio);
    renderer.setSize(innerWidth, innerHeight);
    cameraSnapped = false;
  });
  listenElement(renderer.domElement, 'webglcontextlost', (event) => {
    event.preventDefault();
    setPaused(true);
    element('loading').style.display = 'grid';
    element('loadText').textContent =
      'La imagen se ha interrumpido. Recarga la página para volver a jugar.';
  });
  const updateMovingTransforms = freezeWorldTransforms(
    scene,
    scene.children.filter(
      (root) =>
        root === rig ||
        root === policeModel.rig ||
        root === backupModel.rig ||
        root === airVisual.group ||
        root === airVisual.effects ||
        root === sky ||
        root === key.target ||
        root instanceof THREE.Light,
    ),
  );
  resetCar(true);
  mountain.forest.updateColliders(body.translation());
  for (let i = 0; i < 90; i++) {
    police.step(
      1 / 120,
      body.translation(),
      false,
      nearestTrack(police.body.translation()).distance > 4.2,
    );
    sim.step(input, 1 / 120);
    police.afterStep();
  }
  // Warm up materials, including off-screen scenery and exhaust, while loading.
  renderer.compile(scene, camera);
  draw(0);
  updateHUD();
  element('loading').style.display = 'none';
  gsap.from(['header', '.controls', '.map-wrap', '.telemetry'], {
    opacity: 0,
    y: 7,
    duration: 0.6,
    stagger: 0.04,
  });
  updateCameraButtons();
  element('play').focus({ preventScroll: true });
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
