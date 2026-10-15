<script setup lang="ts">
import { useId } from "vue";
import { t } from "../i18n";
import type { AppTheme } from "../utils/theme";
defineProps<{ modelValue: AppTheme }>();
const emit = defineEmits<{ "update:modelValue": [theme: AppTheme] }>();
const name = useId();
const choices = [
  { theme: "system", label: "themeSystem", colors: ["#f1f5f9", "#18181c", "#6366f1"] },
  { theme: "midnight", label: "themeMidnight", colors: ["#0d0d10", "#222228", "#6366f1"] },
  { theme: "graphite", label: "themeGraphite", colors: ["#1b1c1f", "#383c42", "#12b5cb"] },
  { theme: "violet", label: "themeViolet", colors: ["#21172d", "#3c2b52", "#a78bfa"] },
  { theme: "light", label: "themeLight", colors: ["#f8fafc", "#e2e8f0", "#4f46e5"] },
] as const;
</script>
<template>
  <div class="theme-picker" role="radiogroup" :aria-label="t.settingsSearch.themePreview">
    <label v-for="choice in choices" :key="choice.theme" class="theme-choice" :class="{ selected: modelValue === choice.theme }">
      <input type="radio" :name="name" :value="choice.theme" :checked="modelValue === choice.theme" @change="emit('update:modelValue', choice.theme)" />
      <span class="theme-swatch" aria-hidden="true" :style="{ background: choice.colors[0] }"><span :style="{ background: choice.colors[1] }"></span><i :style="{ background: choice.colors[2] }"></i></span>
      <span>{{ t.settings[choice.label] }}</span>
    </label>
  </div>
</template>
<style scoped>
.theme-picker { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.theme-choice { position: relative; display: flex; align-items: center; flex-direction: column; gap: 7px; padding: 8px; border: 1px solid var(--border-color-strong); border-radius: 8px; cursor: pointer; font-size: .73rem; color: var(--color-text-primary); min-width: 64px; }
.theme-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.theme-choice.selected { border-color: var(--color-accent); background: var(--color-bg-active); }
.theme-choice:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.theme-swatch { width: 56px; height: 36px; border: 1px solid #94a3b855; border-radius: 4px; display: flex; overflow: hidden; }
.theme-swatch > span { width: 16px; }
.theme-swatch i { width: 20px; height: 5px; margin: 9px 0 0 8px; border-radius: 2px; }
</style>
