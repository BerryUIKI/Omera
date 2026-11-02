<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import { t } from "../i18n";

const root = ref<HTMLElement | null>(null);
const compact = ref(true);
const open = ref(false);
let observer: ResizeObserver | undefined;
function closeOutside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
}
onMounted(() => {
  const gallery = root.value?.closest(".gallery-canvas");
  if (gallery) {
    compact.value = gallery.clientWidth < 900;
    observer = new ResizeObserver(([entry]) => {
      const nextCompact = entry.contentRect.width < 900;
      if (compact.value !== nextCompact) open.value = false;
      compact.value = nextCompact;
    });
    observer.observe(gallery);
  }
  document.addEventListener("pointerdown", closeOutside);
});
onUnmounted(() => {
  observer?.disconnect();
  document.removeEventListener("pointerdown", closeOutside);
});
function closeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "Escape" || !open.value) return;
  event.stopPropagation();
  open.value = false;
  root.value?.querySelector<HTMLButtonElement>(".display-trigger")?.focus();
}
</script>

<template>
  <div ref="root" class="display-settings" :class="{ compact }" @keydown="closeWithKeyboard">
    <button v-if="compact" type="button" class="display-trigger" :aria-expanded="open"
      aria-controls="gallery-display-controls" @click="open = !open">
      <AppIcon name="sliders" /> {{ t.layout.displaySettings }}
    </button>
    <div v-show="!compact || open" id="gallery-display-controls" class="display-controls"
      role="group" :aria-label="t.layout.displaySettings">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.display-settings { position: relative; }
.display-trigger { display: flex; align-items: center; gap: 6px; min-height: 32px;
  padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--color-bg-secondary); color: var(--color-text-primary); font: inherit;
  font-size: 13px; cursor: pointer; white-space: nowrap; }
.display-trigger:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.display-controls { display: flex; align-items: center; gap: 8px; }
.compact .display-controls { position: absolute; right: 0; top: calc(100% + 6px); z-index: 100;
  flex-direction: column; align-items: stretch; gap: 12px; padding: 12px; min-width: 200px;
  max-width: min(280px, 80vw); border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--color-bg-primary); box-shadow: 0 8px 24px #0004; }
</style>
