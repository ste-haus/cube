declare class Skycons {
  constructor(options?: { color?: string; resizeClear?: boolean });
  add(element: HTMLCanvasElement | string, draw: string): void;
  set(element: HTMLCanvasElement | string, draw: string): void;
  remove(element: HTMLCanvasElement | string): void;
  play(): void;
  pause(): void;
}

export default Skycons;
