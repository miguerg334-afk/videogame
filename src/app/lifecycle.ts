type ElementEvents = HTMLElementEventMap & { webglcontextlost: Event };

/** Own every event subscription so hot reload never doubles keyboard input. */
export function createLifecycle() {
  const subscriptions = new AbortController();
  const cleanups: (() => void)[] = [];
  function listen<K extends keyof WindowEventMap>(
    name: K,
    handler: (event: WindowEventMap[K]) => void,
  ) {
    window.addEventListener(name, handler, { signal: subscriptions.signal });
  }
  function listenDocument<K extends keyof DocumentEventMap>(
    name: K,
    handler: (event: DocumentEventMap[K]) => void,
  ) {
    document.addEventListener(name, handler, { signal: subscriptions.signal });
  }
  function listenElement<K extends keyof ElementEvents>(
    target: HTMLElement,
    name: K,
    handler: (event: ElementEvents[K]) => void,
  ) {
    target.addEventListener(name, handler as EventListener, { signal: subscriptions.signal });
  }
  return {
    listen,
    listenDocument,
    listenElement,
    onDispose: (cleanup: () => void) => cleanups.push(cleanup),
    dispose() {
      subscriptions.abort();
      for (const cleanup of cleanups) cleanup();
    },
  };
}
