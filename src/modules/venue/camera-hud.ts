import { MAX_ZOOM, MIN_ZOOM, overview, type Navigation, type WorldLayout } from "./world";

type Nodes = { element: HTMLDivElement | null; scale: HTMLOutputElement | null; compass: SVGSVGElement | null; minus: HTMLButtonElement | null; plus: HTMLButtonElement | null };

// DOM follows the rendered camera without re-rendering the scene through React.
export class CameraHud {
  private nodes: Nodes = { element: null, scale: null, compass: null, minus: null, plus: null };
  constructor(private surface: { current: HTMLDivElement | null }) {}
  bind<K extends keyof Nodes>(key: K, node: Nodes[K]) { this.nodes[key] = node; }
  update(nav: Navigation, layout: WorldLayout, editor: boolean) {
    const { element, scale, compass, minus, plus } = this.nodes, home = overview(layout);
    const distant = String(nav.zoom < 0.75);
    if (this.surface.current && this.surface.current.dataset.distant !== distant) this.surface.current.dataset.distant = distant;
    if (element) element.hidden = editor || Math.abs(nav.zoom - home.zoom) < 0.01 && Math.abs(nav.yaw - home.yaw) < 0.015 && Math.abs(nav.pitch - home.pitch) < 0.015 && nav.center.every((n, i) => Math.abs(n - home.center[i]) < 0.1);
    if (scale && scale.textContent !== nav.zoom.toFixed(1) + "×") scale.textContent = nav.zoom.toFixed(1) + "×";
    if (compass) compass.style.transform = `rotate(${(nav.yaw - home.yaw) * -180 / Math.PI}deg)`;
    if (minus) minus.disabled = nav.zoom <= MIN_ZOOM;
    if (plus) plus.disabled = nav.zoom >= MAX_ZOOM;
  }
}
