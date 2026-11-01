<script setup lang="ts">
import { iconPaths, type IconName } from "../utils/icons";
defineProps<{ name: IconName }>();
</script>
<template>
  <svg class="app-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="iconPaths[name]" />
  </svg>
</template>
<style scoped>
.app-icon { display: inline-block; vertical-align: -0.125em; flex-shrink: 0; }
</style>
