import './styles/main.css';
import { element } from './ui/dom';

let dispose: (() => void) | undefined;
let cancelled = false;

async function bootstrap() {
  // Keep the loading screen responsive while the 3D and WASM bundles load.
  const [
    R,
    { createRenderer },
    { createVehicleModel },
    { createMountainWorld },
    { createDrivingPhysics },
    { startDriving },
    { disposeScene },
  ] = await Promise.all([
    import('@dimforge/rapier3d-compat/rapier.es.js').then((module) => module.default),
    import('./engine/renderer'),
    import('./vehicle/model.js'),
    import('./world/mountain.js'),
    import('./vehicle/physics'),
    import('./app/driving'),
    import('./engine/dispose'),
  ]);
  await R.init();
  if (cancelled) return;
  const rendering = createRenderer();
  let mountain: ReturnType<typeof createMountainWorld> | undefined;
  let sim: ReturnType<typeof createDrivingPhysics> | undefined;
  let stopDriving: (() => void) | undefined;
  dispose = () => {
    stopDriving?.();
    sim?.dispose();
    mountain?.world.free();
    disposeScene(rendering.scene);
    rendering.environment.dispose();
    rendering.renderer.dispose();
    rendering.renderer.domElement.remove();
  };
  try {
    const model = createVehicleModel(rendering.scene, rendering.renderer, document);
    mountain = createMountainWorld(rendering.scene, model.car, document);
    sim = createDrivingPhysics(mountain.world);
    stopDriving = startDriving({ rendering, model, mountain, sim });
  } catch (error) {
    dispose();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  if (cancelled) return;
  console.error(error);
  element('loading').style.display = 'grid';
  element('loadText').textContent =
    `No se pudo iniciar la ruta: ${error instanceof Error ? error.message : String(error)}. Recarga la página para volver a intentarlo.`;
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelled = true;
    dispose?.();
  });
}
