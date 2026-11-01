<script setup lang="ts">
import { ref } from "vue";
import { boundPanelWidth } from "../utils/panel-layout";

const props = defineProps<{ modelValue: number; min: number; max: number; initial: number; side: "left" | "right"; label: string; hint: string; controls?: string }>();
const emit = defineEmits<{ "update:modelValue": [width: number]; change: []; }>();
const dragging = ref(false);
let startX = 0;
let startWidth = 0;
let pointer: number | null = null;
const direction = () => props.side === "left" ? 1 : -1;
function update(width: number) { emit("update:modelValue", boundPanelWidth(width, props.min, props.max)); }
function begin(event: PointerEvent) {
  if (event.button !== 0 || pointer !== null) return;
  startX = event.clientX;
  startWidth = props.modelValue;
  pointer = event.pointerId;
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(pointer);
  event.preventDefault();
}
function move(event: PointerEvent) {
  if (event.pointerId === pointer) update(startWidth + (event.clientX - startX) * direction());
}
function finish(event: PointerEvent) {
  if (event.pointerId !== pointer) return;
  pointer = null;
  dragging.value = false;
  emit("change");
}
function cancel() {
  if (pointer === null) return;
  update(startWidth);
  pointer = null;
  dragging.value = false;
}
function reset() { update(props.initial); emit("change"); }
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape" && dragging.value) { cancel(); event.preventDefault(); return; }
  if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Enter") { reset(); return; }
  update(event.key === "Home" ? props.min : event.key === "End" ? props.max : props.modelValue + (event.key === "ArrowRight" ? 1 : -1) * direction() * (event.shiftKey ? 40 : 10));
  emit("change");
}
</script>

<template>
  <div class="panel-resize-handle" :class="{ dragging }" role="separator" tabindex="0"
    aria-orientation="vertical" :aria-label="label" :aria-controls="controls"
    :aria-valuenow="modelValue" :aria-valuemin="min" :aria-valuemax="max" :title="hint"
    @pointerdown="begin" @pointermove="move" @pointerup="finish" @lostpointercapture="finish"
    @pointercancel="cancel" @keydown="keydown" @dblclick="reset"></div>
</template>

<style scoped>
.panel-resize-handle { width: 6px; flex: 0 0 6px; cursor: col-resize; touch-action: none; position: relative; z-index: 5; outline: none; }
.panel-resize-handle::after { content: ""; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; border-radius: 2px; background: transparent; }
.panel-resize-handle:hover::after, .panel-resize-handle:focus-visible::after, .dragging::after { background: var(--color-accent); }
.panel-resize-handle:focus-visible { box-shadow: inset 0 0 0 1px var(--color-accent); }
</style>
