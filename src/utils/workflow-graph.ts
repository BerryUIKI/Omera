/** Read-only, bounded adapters for ComfyUI API prompts and UI workflow JSON. */
export type NodeCategory = "prompt" | "sampler" | "controlnet" | "lora" | "other";
export interface WorkflowNode {
  id: string; type: string; title: string; category: NodeCategory;
  x: number; y: number; details: Record<string, unknown>;
}
export interface WorkflowEdge { from: string; to: string; slot: string }
export interface WorkflowGraph {
  nodes: WorkflowNode[]; edges: WorkflowEdge[]; dropped: number;
  error: "invalid" | "limit" | "empty" | null;
}
export const graphLimits = { bytes: 2 * 1024 * 1024, nodes: 500, edges: 2500 };
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const label = (value: unknown, fallback = "") => typeof value === "string" ? value.slice(0, 200) : fallback;
const nodeId = (value: unknown): string | null =>
  (typeof value === "string" && value.length > 0 && value.length <= 128) ||
  (typeof value === "number" && Number.isSafeInteger(value)) ? String(value) : null;
function category(type: string): NodeCategory {
  if (/controlnet/i.test(type)) return "controlnet";
  if (/lora/i.test(type)) return "lora";
  if (/sampler/i.test(type)) return "sampler";
  if (/textencode|prompt|conditioning/i.test(type)) return "prompt";
  return "other";
}
function details(value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object(value) ?? {}).slice(0, 64).map(([key, value]) =>
    [key.slice(0, 128), typeof value === "string" ? value.slice(0, 4096) : JSON.stringify(value)?.slice(0, 4096)]));
}

export function parseWorkflowGraph(source: string | null | undefined): WorkflowGraph {
  const graph: WorkflowGraph = { nodes: [], edges: [], dropped: 0, error: null };
  if (!source?.trim()) return { ...graph, error: "empty" };
  if (source.length > graphLimits.bytes || new TextEncoder().encode(source).length > graphLimits.bytes)
    return { ...graph, error: "limit" };
  let root: Record<string, unknown> | null;
  try { root = object(JSON.parse(source)); } catch { return { ...graph, error: "invalid" }; }
  if (!root) return { ...graph, error: "invalid" };
  // Combined metadata may contain both API prompt and a UI document. Prefer the
  // UI graph for positions; a bare API graph remains independently supported.
  const ui = object(root.workflow);
  if (ui && Array.isArray(ui.nodes)) root = ui;
  else if (!Array.isArray(root.nodes) && object(root.prompt)) root = object(root.prompt)!;
  const uiFormat = Array.isArray(root.nodes);
  const entries: [unknown, unknown][] = uiFormat
    ? (root.nodes as unknown[]).map(value => [object(value)?.id, value])
    : Object.entries(root);
  if (entries.length > graphLimits.nodes) return { ...graph, error: "limit" };
  const ids = new Set<string>();
  const positions = new Set<string>();
  for (const [rawId, rawNode] of entries) {
    const value = object(rawNode), id = nodeId(rawId);
    const type = label(value?.[uiFormat ? "type" : "class_type"]);
    if (!id || !value || !type || ids.has(id)) { graph.dropped++; continue; }
    ids.add(id);
    const pos = value.pos;
    const x = Array.isArray(pos) ? pos[0] : object(pos)?.["0"];
    const y = Array.isArray(pos) ? pos[1] : object(pos)?.["1"];
    const validPosition = typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 100000 &&
      typeof y === "number" && Number.isFinite(y) && Math.abs(y) < 100000;
    if (validPosition) positions.add(id);
    graph.nodes.push({ id, type, title: label(value.title ?? object(value._meta)?.title, type),
      category: category(type), x: validPosition ? x : 0, y: validPosition ? y : 0,
      details: details(uiFormat ? { inputs: value.inputs, widgets_values: value.widgets_values } : value.inputs) });
  }
  const addEdge = (fromValue: unknown, toValue: unknown, slot: unknown) => {
    const from = nodeId(fromValue), to = nodeId(toValue);
    if (!from || !to || !ids.has(from) || !ids.has(to)) { graph.dropped++; return; }
    graph.edges.push({ from, to, slot: String(slot ?? "").slice(0, 128) });
  };
  if (uiFormat) {
    const links = Array.isArray(root.links) ? root.links : [];
    if (links.length > graphLimits.edges) return { ...graph, nodes: [], error: "limit" };
    for (const link of links) {
      if (Array.isArray(link)) addEdge(link[1], link[3], link[4]);
      else { const value = object(link); addEdge(value?.origin_id, value?.target_id, value?.target_slot); }
    }
  } else {
    for (const [rawId, value] of entries) {
      for (const [slot, input] of Object.entries(object(object(value)?.inputs) ?? {})) {
        if (Array.isArray(input) && input.length === 2 && Number.isSafeInteger(input[1]) && input[1] >= 0 && ids.has(String(input[0])))
          addEdge(input[0], rawId, slot);
        if (graph.edges.length > graphLimits.edges) return { ...graph, nodes: [], edges: [], error: "limit" };
      }
    }
  }
  // Kahn traversal is bounded even with cycles. Remaining cyclic components
  // occupy a separate column; no recursive walk over untrusted graph input.
  const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    indegree.set(edge.to, indegree.get(edge.to)! + 1);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }
  const queue = graph.nodes.filter(node => !indegree.get(node.id)).map(node => node.id);
  const depth = new Map(queue.map(id => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i]) ?? []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, (depth.get(queue[i]) ?? 0) + 1));
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const cyclicDepth = Math.min(20, Math.max(0, ...depth.values()) + 1);
  const rows = new Map<number, number>();
  for (const node of graph.nodes) {
    const column = Math.min(20, indegree.get(node.id) ? cyclicDepth : depth.get(node.id) ?? 0);
    const row = rows.get(column) ?? 0; rows.set(column, row + 1);
    if (!positions.has(node.id)) { node.x = column * 260; node.y = row * 100; }
  }
  // Normalize large/negative UI coordinates without changing relative positions.
  const minX = Math.min(0, ...graph.nodes.map(node => node.x));
  const minY = Math.min(0, ...graph.nodes.map(node => node.y));
  for (const node of graph.nodes) { node.x = node.x - minX + 24; node.y = node.y - minY + 24; }
  if (!graph.nodes.length) graph.error = "empty";
  return graph;
}
