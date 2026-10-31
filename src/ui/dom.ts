/** Fail at startup with a useful message if a required HUD element is missing. */
export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Falta el elemento #${id}`);
  return result as T;
}
export function context2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear el lienzo 2D.');
  return context;
}
