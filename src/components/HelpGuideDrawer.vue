<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { currentLocale } from "../i18n";
import { HELP_TOPICS, HELP_UI } from "../i18n/help-content";


const props = withDefaults(
  defineProps<{
    show: boolean;
    context?: string;
  }>(),
  {
    show: false,
    context: "home",
  }
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const searchQuery = ref("");
const selectedTopicId = ref("workspace-layout");
const articleContainer = ref<HTMLElement | null>(null);

const ui = computed(() => HELP_UI[currentLocale.value] ?? HELP_UI.en);
const topics = computed(() => HELP_TOPICS[currentLocale.value] ?? HELP_TOPICS.en);



const categories = computed(() => {
  const cats = new Set<string>();
  topics.value.forEach((t) => cats.add(t.category));
  return Array.from(cats);
});

const filteredTopics = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return topics.value;
  return topics.value.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.content.some((c) => c.toLowerCase().includes(q))
  );
});

const activeTopic = computed(() => {
  return topics.value.find((t) => t.id === selectedTopicId.value) || topics.value[0];
});

function selectTopic(id: string) {
  selectedTopicId.value = id;
  nextTick(() => {
    if (articleContainer.value) {
      articleContainer.value.scrollTop = 0;
    }
  });
}

// Context-aware deep linking
watch(
  () => props.show,
  (isOpen) => {
    if (isOpen) {
      const ctx = (props.context || "").toLowerCase();
      if (ctx.includes("stack")) selectTopic("stacks-and-bursts");
      else if (ctx.includes("video")) selectTopic("video-support");
      else if (ctx.includes("setting")) selectTopic("settings-reference");
      else if (ctx.includes("model") || ctx.includes("lora")) selectTopic("models-and-loras");
      else if (ctx.includes("clip") || ctx.includes("semantic") || ctx.includes("tag")) selectTopic("ai-semantic-and-tagger");
      else if (ctx.includes("export")) selectTopic("export-and-showcase");
      else if (ctx.includes("database") || ctx.includes("backup")) selectTopic("database-maintenance");
      else if (ctx.includes("search")) selectTopic("search-and-filtering");
    }
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="show" class="help-drawer-backdrop" @click.self="emit('close')" v-dialog="() => emit('close')">
    <div class="help-drawer" role="dialog" aria-labelledby="help-drawer-title" aria-modal="true">
      <!-- Drawer Header -->
      <div class="drawer-header">
        <div class="header-branding">
          <span class="header-icon">📖</span>
          <div>
            <h2 id="help-drawer-title" class="drawer-title">{{ ui.title }}</h2>
            <p class="drawer-subtitle">{{ ui.subtitle }}</p>
          </div>
        </div>
        <button
          type="button"
          class="btn-close"
          :aria-label="ui.closeLabel"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Search Input -->
      <div class="drawer-search-bar">
        <span class="search-icon">🔎</span>
        <input
          v-model="searchQuery"
          type="search"
          class="drawer-search-input"
          :placeholder="ui.searchPlaceholder"
        />
        <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
      </div>

      <!-- Drawer Body: Split Navigation and Reader -->
      <div class="drawer-body">
        <!-- Sidebar Navigation -->
        <nav class="drawer-nav" :aria-label="ui.title">
          <div v-for="cat in categories" :key="cat" class="nav-category-group">
            <h3 class="category-header">{{ cat }}</h3>
            <ul class="topic-list">
              <li
                v-for="item in filteredTopics.filter((t) => t.category === cat)"
                :key="item.id"
              >
                <button
                  type="button"
                  class="topic-button"
                  :class="{ active: selectedTopicId === item.id }"
                  @click="selectTopic(item.id)"
                >
                  <span class="topic-icon">{{ item.icon }}</span>
                  <span class="topic-label">{{ item.title }}</span>
                  <span v-if="item.badge" class="topic-badge">{{ item.badge }}</span>
                </button>
              </li>
            </ul>
          </div>

          <div v-if="filteredTopics.length === 0" class="empty-search">
            <p>{{ ui.noResults.replace("{query}", searchQuery) }}</p>
          </div>
        </nav>

        <!-- Article Content Viewer -->
        <main ref="articleContainer" class="drawer-content" tabindex="0">
          <div class="article-header">
            <div class="article-category">{{ activeTopic.category }}</div>
            <h1 class="article-title">{{ activeTopic.icon }} {{ activeTopic.title }}</h1>
            <p class="article-summary">{{ activeTopic.summary }}</p>
          </div>

          <div class="article-body">
            <p v-for="(paragraph, idx) in activeTopic.content" :key="idx" class="article-paragraph">
              {{ paragraph }}
            </p>

            <!-- Shortcuts Table if provided -->
            <div v-if="activeTopic.shortcuts && activeTopic.shortcuts.length" class="shortcuts-section">
              <h4 class="section-heading">{{ ui.shortcutsHeading }}</h4>
              <div class="shortcut-matrix">
                <div v-for="(sc, sidx) in activeTopic.shortcuts" :key="sidx" class="shortcut-row">
                  <kbd class="key-pill">{{ sc.key }}</kbd>
                  <span class="shortcut-desc">{{ sc.desc }}</span>
                </div>
              </div>
            </div>

            <!-- Pro Tips Callout if provided -->
            <div v-if="activeTopic.tips && activeTopic.tips.length" class="pro-tips-card">
              <div class="tip-badge">{{ ui.tipBadge }}</div>
              <ul class="tip-list">
                <li v-for="(tip, tidx) in activeTopic.tips" :key="tidx">{{ tip }}</li>
              </ul>
            </div>
          </div>
        </main>
      </div>

      <!-- Drawer Footer -->
      <div class="drawer-footer">
        <span class="footer-hint">{{ ui.footerHint }}</span>
        <button type="button" class="btn btn-secondary" @click="emit('close')">{{ ui.done }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.help-drawer {
  width: 780px;
  max-width: 90vw;
  height: 100%;
  background: var(--bg-surface, #1e1e24);
  color: var(--text-main, #e0e0e0);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
  border-left: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .help-drawer-backdrop,
  .help-drawer {
    animation: none;
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  background: var(--bg-header, rgba(255, 255, 255, 0.02));
}

.header-branding {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 26px;
}

.drawer-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.drawer-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.12s;
}

.btn-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.drawer-search-bar {
  position: relative;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
}

.search-icon {
  position: absolute;
  left: 30px;
  font-size: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.drawer-search-input {
  width: 100%;
  padding: 8px 32px 8px 34px;
  background: var(--color-bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.12s;
}

.drawer-search-input:focus {
  border-color: var(--accent-color, #4f80ff);
}

.clear-search-btn {
  position: absolute;
  right: 28px;
  background: none;
  border: none;
  color: var(--text-muted, #8e8e93);
  cursor: pointer;
}

.drawer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.drawer-nav {
  width: 260px;
  border-right: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  overflow-y: auto;
  padding: 12px 8px;
  background: var(--bg-sidebar, rgba(0, 0, 0, 0.1));
}

.category-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #8e8e93);
  margin: 12px 10px 6px;
}

.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.topic-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.1s;
}

.topic-button:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.topic-button.active {
  background: var(--accent-subtle, rgba(79, 128, 255, 0.2));
  color: var(--accent-color, #4f80ff);
  font-weight: 500;
}

.topic-icon {
  font-size: 14px;
}

.topic-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(79, 128, 255, 0.15);
  color: var(--accent-color, #4f80ff);
  font-weight: 600;
}

.empty-search {
  padding: 20px 10px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.drawer-content {
  flex: 1;
  padding: 24px 30px;
  overflow-y: auto;
  outline: none;
}

.article-category {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-color, #4f80ff);
  margin-bottom: 6px;
}

.article-title {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.article-summary {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0 0 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.article-paragraph {
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text-secondary);
  margin-bottom: 14px;
}

.shortcuts-section {
  margin-top: 24px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.section-heading {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.shortcut-matrix {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.key-pill {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-color);
  border-bottom: 2px solid var(--border-color-strong);
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--color-text-primary);
  min-width: 48px;
  text-align: center;
}

.shortcut-desc {
  color: var(--color-text-secondary);
}

.pro-tips-card {
  margin-top: 20px;
  background: rgba(79, 128, 255, 0.08);
  border-left: 3px solid var(--accent-color, #4f80ff);
  padding: 14px 16px;
  border-radius: 0 8px 8px 0;
}

.tip-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-color, #4f80ff);
  margin-bottom: 6px;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--color-bg-secondary);
}

.footer-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.kbd-hint {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  padding: 1px 4px;
  border-radius: 3px;
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  border: 1px solid var(--border-color);
  transition: all 0.12s;
}

.btn-secondary {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background: var(--color-bg-active);
}
</style>
