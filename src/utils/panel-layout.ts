export interface PanelWidths { sidebar: number; inspector: number }
export const panelBounds = {
  sidebar: { min: 220, max: 380, initial: 220 },
  inspector: { min: 260, max: 480, initial: 280 },
};

export function boundPanelWidth(value: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(min, max), Math.max(min, Number.isFinite(value) ? value : min)));
}

export function readPanelWidths(read: (key: string) => string | null): PanelWidths {
  function width(key: keyof PanelWidths) {
    const raw = read(`layout_${key}_width`);
    const bounds = panelBounds[key];
    const parsed = raw === null || !raw.trim() ? bounds.initial : Number(raw);
    return boundPanelWidth(Number.isFinite(parsed) ? parsed : bounds.initial, bounds.min, bounds.max);
  }
  return { sidebar: width("sidebar"), inspector: width("inspector") };
}

/** Reserve the gallery's usable center at the supported 960px minimum window. */
export function fitPanelWidths(requested: PanelWidths, viewport: number, left = true, right = true, centerMin = 320): PanelWidths {
  const sidebar = boundPanelWidth(requested.sidebar, panelBounds.sidebar.min, panelBounds.sidebar.max);
  const inspector = boundPanelWidth(requested.inspector, panelBounds.inspector.min, panelBounds.inspector.max);
  const budget = Math.max(0, viewport - Math.max(320, centerMin) - (Number(left) + Number(right)) * 6);
  const minimum = (left ? panelBounds.sidebar.min : 0) + (right ? panelBounds.inspector.min : 0);
  const extra = Math.max(0, budget - minimum);
  const wanted = (left ? sidebar - panelBounds.sidebar.min : 0) + (right ? inspector - panelBounds.inspector.min : 0);
  const ratio = wanted > 0 ? Math.min(1, extra / wanted) : 1;
  return {
    sidebar: left ? panelBounds.sidebar.min + Math.floor((sidebar - panelBounds.sidebar.min) * ratio) : sidebar,
    inspector: right ? panelBounds.inspector.min + Math.floor((inspector - panelBounds.inspector.min) * ratio) : inspector,
  };
}
