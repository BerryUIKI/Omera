<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { parseWorkflowGraph, type WorkflowNode } from "../utils/workflow-graph";
import { t } from "../i18n";
const props = defineProps<{ source: string | null; activeNodeId?: string | null }>();
const graph = computed(() => parseWorkflowGraph(props.source));
const viewport = ref<HTMLElement | null>(null);
const selectedId = ref<string | null>(null);
const query = ref("");
const zoom = ref(1);
const selected = computed(() => graph.value.nodes.find(node => node.id === selectedId.value));
const nodeMap = computed(() => new Map(graph.value.nodes.map(node => [node.id, node])));
const width = computed(() => Math.max(400, ...graph.value.nodes.map(node => node.x + 250)));
const height = computed(() => Math.max(300, ...graph.value.nodes.map(node => node.y + 100)));
const matches = (node: WorkflowNode) => !query.value.trim() ||
  `${node.id} ${node.title} ${node.type}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase());
const matchCount = computed(() => graph.value.nodes.filter(matches).length);
const edges = computed(() => graph.value.edges.map((edge, index) => {
  const from = nodeMap.value.get(edge.from)!, to = nodeMap.value.get(edge.to)!;
  const x = from.x + 220, y = from.y + 36;
  return { ...edge, index, path: `M ${x} ${y} C ${x + 35} ${y}, ${to.x - 35} ${to.y + 36}, ${to.x} ${to.y + 36}` };
}));
function fit() {
  const area = viewport.value;
  if (!area) return;
  zoom.value = Math.max(0.001, Math.min(1, (area.clientWidth - 24) / width.value, (area.clientHeight - 24) / height.value));
  area.scrollLeft = 0; area.scrollTop = 0;
}
function setZoom(value: number) { zoom.value = Math.max(0.001, Math.min(2.5, value)); }
function select(id: string) { selectedId.value = id; }
function jumpMatch() {
  const node = graph.value.nodes.find(matches);
  if (node) { setZoom(1); void focusNode(node.id); }
}
async function focusNode(id: string) {
  select(id);
  await nextTick();
  const button = Array.from(viewport.value?.querySelectorAll<HTMLButtonElement>("button[data-node-id]") ?? [])
    .find(button => button.dataset.nodeId === id);
  button?.focus(); button?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function keyNode(event: KeyboardEvent, index: number) {
  const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 :
    ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const nodes = graph.value.nodes;
  void focusNode(nodes[(index + delta + nodes.length) % nodes.length].id);
}
let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
function startPan(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest("button")) return;
  const area = viewport.value!;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop };
  area.setPointerCapture(event.pointerId);
}
function pan(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId || !viewport.value) return;
  viewport.value.scrollLeft = drag.left - event.clientX + drag.x;
  viewport.value.scrollTop = drag.top - event.clientY + drag.y;
}
function endPan() { drag = null; }
function wheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(zoom.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}
watch(() => props.source, async () => { selectedId.value = null; query.value = ""; await nextTick(); fit(); });
let observer: ResizeObserver | undefined;
onMounted(() => { fit(); if (viewport.value) { observer = new ResizeObserver(() => endPan()); observer.observe(viewport.value); } });
onUnmounted(() => { observer?.disconnect(); endPan(); });
</script>

<template>
  <section class="workflow-graph" :aria-label="t.comfy.graphTitle">
    <div class="graph-tools">
      <input v-model="query" type="search" maxlength="128" :placeholder="t.comfy.searchNodes" :aria-label="t.comfy.searchNodes" @keydown.enter="jumpMatch" />
      <span>{{ matchCount }} / {{ graph.nodes.length }}</span>
      <button type="button" :aria-label="t.comfy.zoomOut" @click="setZoom(zoom / 1.2)">−</button>
      <output>{{ Math.round(zoom * 1000) / 10 }}%</output>
      <button type="button" :aria-label="t.comfy.zoomIn" @click="setZoom(zoom * 1.2)">+</button>
      <button type="button" @click="fit">{{ t.comfy.fit }}</button>
      <button type="button" @click="setZoom(1)">100%</button>
    </div>
    <p v-if="graph.error" class="graph-message" role="status">{{ t.comfy[graph.error] }}</p>
    <template v-else>
      <p class="graph-hint">{{ t.comfy.graphHint }} <span v-if="graph.dropped">{{ t.comfy.skipped }}: {{ graph.dropped }}</span></p>
      <div class="graph-layout">
        <div ref="viewport" class="graph-viewport" tabindex="0" :aria-label="t.comfy.graphTitle"
          @pointerdown="startPan" @pointermove="pan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @wheel="wheel">
          <div :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }">
            <div class="graph-scene" :style="{ width: `${width}px`, height: `${height}px`, transform: `scale(${zoom})` }">
              <svg class="graph-edges" :width="width" :height="height" aria-hidden="true">
                <path v-for="edge in edges" :key="edge.index" :d="edge.path"
                  :class="{ connected: edge.from === selectedId || edge.to === selectedId }" />
              </svg>
              <button v-for="(node, index) in graph.nodes" :key="node.id" type="button" class="graph-node"
                :class="[node.category, { selected: node.id === selectedId, executing: node.id === activeNodeId, dim: !matches(node) }]"
                :data-node-id="node.id" :style="{ left: `${node.x}px`, top: `${node.y}px` }"
                :aria-pressed="node.id === selectedId" :title="`${node.id}: ${node.title} (${node.type})`"
                @click="select(node.id)" @keydown="keyNode($event, index)">
                <strong>{{ node.title }}</strong><span>#{{ node.id }} · {{ t.comfy[node.category] }}</span>
              </button>
            </div>
          </div>
        </div>
        <aside class="node-details" :aria-label="t.comfy.nodeDetails">
          <template v-if="selected">
            <h4>{{ selected.title }}</h4><p>{{ selected.type }} · #{{ selected.id }}</p>
            <dl><template v-for="(value, key) in selected.details" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></template></dl>
          </template>
          <p v-else>{{ t.comfy.selectNode }}</p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.workflow-graph { display: flex; flex-direction: column; min-height: 0; height: 100%; gap: 8px; color: var(--color-text-primary); }
.graph-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.graph-tools input { flex: 1; min-width: 130px; }
.graph-tools button,.graph-tools input { min-height: 32px; border: 1px solid var(--border-color); border-radius: 6px; color: inherit; background: var(--color-bg-secondary); padding: 4px 10px; font: inherit; }
button { cursor: pointer; }
button:focus-visible,input:focus-visible,.graph-viewport:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.graph-message,.graph-hint { font-size: 13px; margin: 0; color: var(--color-text-secondary); }
.graph-layout { display: flex; flex: 1; min-height: 0; gap: 12px; }
.graph-viewport { flex: 1; min-width: 0; overflow: auto; cursor: grab; background: var(--color-bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; touch-action: none; }
.graph-scene { position: relative; transform-origin: 0 0; }
.graph-edges { position: absolute; left: 0; top: 0; pointer-events: none; }
.graph-edges path { fill: none; stroke: var(--color-text-muted); stroke-width: 2; }
.graph-edges .connected { stroke: var(--color-accent); stroke-width: 4; }
.graph-node { position: absolute; display: flex; flex-direction: column; text-align: left; justify-content: center; gap: 8px; width: 220px; height: 72px; padding: 8px 12px; border: 1px solid var(--border-color-strong); border-left: 4px solid var(--color-text-muted); border-radius: 6px; background: var(--color-bg-primary); color: inherit; font: inherit; font-size: 13px; }
.graph-node strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.graph-node span { color: var(--color-text-secondary); }
.graph-node.prompt { border-left-color: #10b981; }.graph-node.sampler { border-left-color: #a855f7; }
.graph-node.controlnet { border-left-color: #0ea5e9; }.graph-node.lora { border-left-color: #eab308; }
.graph-node.selected { outline: 2px solid var(--color-accent); }.graph-node.executing { box-shadow: 0 0 0 3px #10b981; }
.graph-node.dim { opacity: .35; }
.node-details { width: 260px; overflow: auto; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; }
.node-details h4 { margin: 0; }.node-details p { color: var(--color-text-secondary); }
.node-details dt { font-weight: 600; margin-top: 12px; }.node-details dd { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
@media(max-width: 800px) { .graph-layout { flex-direction: column; }.graph-viewport { min-height: 200px; }.node-details { width: auto; max-height: 170px; } }
</style>
