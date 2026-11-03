<script setup lang="ts">
import WorkflowGraph from "./WorkflowGraph.vue";
import { t } from "../i18n";
defineProps<{ source: string | null; title?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <div class="workflow-overlay" v-dialog="() => emit('close')" @click.self="emit('close')">
    <section class="workflow-dialog" role="dialog" aria-modal="true" :aria-label="t.comfy.graphTitle">
      <header><h3>{{ t.comfy.graphTitle }} <small>{{ title }}</small></h3>
        <button type="button" :aria-label="t.updater.close" @click="emit('close')">×</button></header>
      <WorkflowGraph :source="source" />
    </section>
  </div>
</template>
<style scoped>
.workflow-overlay { position: fixed; inset: 0; z-index: 2200; display: grid; place-items: center; background: #0009; }
.workflow-dialog { display: flex; flex-direction: column; gap: 12px; width: min(1200px, 94vw); height: 88vh; padding: 16px; background: var(--color-bg-primary); color: var(--color-text-primary); border: 1px solid var(--border-color); border-radius: 8px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }h3 { font-size: 15px; margin: 0; min-width: 0; overflow-wrap: anywhere; }small { color: var(--color-text-secondary); font-weight: 400; }
header button { background: var(--color-bg-secondary); color: inherit; border: 1px solid var(--border-color); border-radius: 6px; min-width: 32px; min-height: 32px; cursor: pointer; }
header button:focus-visible { outline: 2px solid var(--color-accent); }
</style>
