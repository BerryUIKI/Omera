<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import type { ImageFile } from "../types";
import { assetUrl, formatBytes, formatDuration, formatPlatformName, getFileName, isVideoContainer } from "../utils/image";
import { useFileCuration, type CurationChange } from "../utils/file-curation";
import InspectorPane from "./InspectorPane.vue";
import { conditionalDialog as vViewerDialog, getTopDialog, isEditableTarget } from "../utils/dialog";
import { fitImageScale, clampViewerScale, zoomTranslation } from "../utils/viewer-geometry";
import { t } from "../i18n";

const props = defineProps<{
  file: ImageFile;
  files: ImageFile[];
  embedded?: boolean;
  totalCount?: number;
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
}>();

const emit = defineEmits<{
  close: [];
  navigate: [file: ImageFile];
  updateFile: [file: ImageFile];
  curated: [change: CurationChange];
  findSimilar: [file: ImageFile];
  openTagModal: [fileId: number];
  openAlbumModal: [fileId: number];
  openAutoTagModal: [file: ImageFile];
  filterByModel: [model: string];
  filterByHash: [hash: string];
  openLoraManager: [];
  tagsChanged: [fileId: number];
}>();

const scale = ref(1);
const fitMode = ref(true);
const fullScreen = ref(!props.embedded);
const showDetails = ref(!!props.embedded);
const viewerRoot = ref<HTMLElement | null>(null);
const canvasElement = ref<HTMLElement | null>(null);
const detailPanel = ref<InstanceType<typeof InspectorPane> | null>(null);
const decodedSize = ref({ width: 0, height: 0 });
const canvasSize = ref({ width: 0, height: 0 });
const pixelRatio = ref(1);
const navigationBusy = ref(false);
let disposed = false;
let resizeObserver: ResizeObserver | null = null;
const mediaSize = computed(() => ({ width: decodedSize.value.width || props.file.metadata?.width || 0,
  height: decodedSize.value.height || props.file.metadata?.height || 0 }));
const currentScale = computed(() => fitMode.value ? fitImageScale(mediaSize.value, canvasSize.value, pixelRatio.value) : scale.value);
const renderedScale = computed(() => currentScale.value / pixelRatio.value);
defineExpose({ reloadOrganization: () => detailPanel.value?.loadTags() });
function measureCanvas() {
  const element = canvasElement.value;
  if (!element) return;
  canvasSize.value = { width: element.clientWidth, height: element.clientHeight };
  pixelRatio.value = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}
function onImageLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  decodedSize.value = { width: image.naturalWidth, height: image.naturalHeight };
}
function setZoom(value: number, point = { x: 0, y: 0 }) {
  const next = clampViewerScale(value);
  const position = zoomTranslation({ x: translateX.value, y: translateY.value }, point, currentScale.value, next);
  translateX.value = position.x; translateY.value = position.y;
  fitMode.value = false; scale.value = next;
}
function actualSize() { fitMode.value = false; scale.value = 1; translateX.value = 0; translateY.value = 0; }
function closeViewer() {
  if (fullScreen.value && props.embedded) fullScreen.value = false;
  else emit("close");
}
watch([fullScreen, showDetails], async () => { await nextTick(); measureCanvas(); });
const translateX = ref(0);
const translateY = ref(0);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const promptCopied = ref(false);
const revealedNsfw = ref(false);

const cachedIndex = ref(-1);

watch(
  () => props.file.path,
  (newPath) => {
    resetTransform();
    decodedSize.value = { width: 0, height: 0 };
    revealedNsfw.value = false;
    if (cachedIndex.value >= 0 && cachedIndex.value < props.files.length) {
      if (props.files[cachedIndex.value]?.path === newPath) return;
      if (cachedIndex.value + 1 < props.files.length && props.files[cachedIndex.value + 1]?.path === newPath) {
        cachedIndex.value++;
        return;
      }
      if (cachedIndex.value > 0 && props.files[cachedIndex.value - 1]?.path === newPath) {
        cachedIndex.value--;
        return;
      }
    }
    cachedIndex.value = props.files.findIndex((f) => f.path === newPath);
  },
  { immediate: true },
);

watch(() => props.file.is_nsfw, sensitive => { if (sensitive) revealedNsfw.value = false; });

const currentIndex = computed(() => cachedIndex.value);
const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && (currentIndex.value < props.files.length - 1 || !!props.hasMore));
watch(() => props.files, () => { cachedIndex.value = props.files.findIndex(file => file.path === props.file.path); });

// Keep at most two adjacent still-image preloads; release them when navigation changes.
let adjacentImages: HTMLImageElement[] = [];
function clearAdjacentImages() { for (const image of adjacentImages) image.src = ""; adjacentImages = []; }
watch(currentIndex, index => {
  clearAdjacentImages();
  if (typeof Image === "undefined") return;
  for (const neighbor of [props.files[index - 1], props.files[index + 1]]) {
    if (!neighbor || isVideoContainer(neighbor.container) || neighbor.container.toLowerCase() === "txt") continue;
    const image = new Image(); image.src = assetUrl(neighbor.path); adjacentImages.push(image);
  }
}, { immediate: true });

function resetTransform() {
  fitMode.value = true; isDragging.value = false;
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
}

function prev() {
  if (!navigationBusy.value && hasPrev.value) {
    emit("navigate", props.files[currentIndex.value - 1]);
  }
}

async function next() {
  if (navigationBusy.value) return;
  if (currentIndex.value >= 0 && currentIndex.value < props.files.length - 1) {
    emit("navigate", props.files[currentIndex.value + 1]); return;
  }
  if (!props.hasMore || !props.loadMore) return;
  const source = props.file.path;
  navigationBusy.value = true;
  try {
    await props.loadMore();
    await nextTick();
    if (disposed || props.file.path !== source) return;
    const index = props.files.findIndex(file => file.path === source);
    const following = props.files[index + 1];
    if (index >= 0 && following) emit("navigate", following);
  } finally { navigationBusy.value = false; }
}
function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const bounds = canvasElement.value?.getBoundingClientRect();
  const point = bounds ? { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 } : { x: 0, y: 0 };
  setZoom(currentScale.value * (event.deltaY > 0 ? 0.85 : 1.15), point);
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0 || (e.target as HTMLElement)?.closest("button,input,select,textarea")) return;
  isDragging.value = true;
  dragStartX.value = e.clientX - translateX.value;
  dragStartY.value = e.clientY - translateY.value;
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  translateX.value = e.clientX - dragStartX.value;
  translateY.value = e.clientY - dragStartY.value;
}

function onMouseUp() {
  isDragging.value = false;
}

async function copyPrompt() {
  const p = props.file.metadata?.prompt;
  if (!p) return;
  try {
    await navigator.clipboard.writeText(p);
    promptCopied.value = true;
    setTimeout(() => (promptCopied.value = false), 1500);
  } catch (err) {
    console.error("Copy failed:", err);
  }
}

const { busy: curationBusy, error: curationError, run: curate } = useFileCuration(() => props.file, change => emit("curated", change));
function setRating(rating: number) {
  return curate({ kind: "rating", value: rating === 0 || props.file.rating === rating ? null : rating });
}

// Video Player Controls & State
const videoRef = ref<HTMLVideoElement | null>(null);
const isPlaying = ref(true);
const isLooping = ref(true);
const isMuted = ref(false);
const playbackRate = ref(1.0);
const videoCurrentTime = ref(0);
const videoDuration = ref(0);

const playbackRates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function togglePlay() {
  if (!videoRef.value) return;
  if (videoRef.value.paused) {
    videoRef.value.play().catch(() => {});
    isPlaying.value = true;
  } else {
    videoRef.value.pause();
    isPlaying.value = false;
  }
}

function toggleLoop() {
  isLooping.value = !isLooping.value;
  if (videoRef.value) {
    videoRef.value.loop = isLooping.value;
  }
}

function toggleMute() {
  isMuted.value = !isMuted.value;
  if (videoRef.value) {
    videoRef.value.muted = isMuted.value;
  }
}

function setPlaybackRate(rate: number) {
  playbackRate.value = rate;
  if (videoRef.value) {
    videoRef.value.playbackRate = rate;
  }
}

function stepFrame(forward: boolean) {
  if (!videoRef.value) return;
  videoRef.value.pause();
  isPlaying.value = false;
  const fps = props.file.metadata?.fps || 30;
  const step = 1 / fps;
  if (forward) {
    videoRef.value.currentTime = Math.min(videoRef.value.duration || 0, videoRef.value.currentTime + step);
  } else {
    videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime - step);
  }
}

function onVideoTimeUpdate() {
  if (!videoRef.value) return;
  videoCurrentTime.value = videoRef.value.currentTime;
  if (!videoDuration.value && videoRef.value.duration) {
    videoDuration.value = videoRef.value.duration;
  }
}

function onVideoLoadedMetadata() {
  if (!videoRef.value) return;
  decodedSize.value = { width: videoRef.value.videoWidth, height: videoRef.value.videoHeight };
  videoDuration.value = videoRef.value.duration;
  videoRef.value.playbackRate = playbackRate.value;
  videoRef.value.loop = isLooping.value;
  videoRef.value.muted = isMuted.value;
  if (isPlaying.value) {
    videoRef.value.play().catch(() => {});
  }
}

function seekVideo(e: MouseEvent) {
  if (!videoRef.value || !videoDuration.value) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  videoRef.value.currentTime = ratio * videoDuration.value;
  videoCurrentTime.value = videoRef.value.currentTime;
}

function toggleFavorite() { return curate({ kind: "favorite", value: !props.file.is_favorite }); }

function handleKeyDown(e: KeyboardEvent) {
  const top = getTopDialog();
  if (e.defaultPrevented || isEditableTarget(e.target) || isEditableTarget(typeof document === "undefined" ? null : document.activeElement) ||
    (top && top.element !== viewerRoot.value) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") { e.preventDefault(); closeViewer(); return; }
  if (e.key === "i" || e.key === "I") { e.preventDefault(); showDetails.value = !showDetails.value; return; }
  if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(currentScale.value * 1.15); return; }
  if (e.key === "-") { e.preventDefault(); setZoom(currentScale.value * 0.85); return; }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    prev();
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    next();
    return;
  }
  if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    void toggleFavorite();
    return;
  }
  if (["0", "1", "2", "3", "4", "5"].includes(e.key)) {
    e.preventDefault();
    void setRating(parseInt(e.key, 10));
    return;
  }
  if (isVideoContainer(props.file.container)) {
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === "." || e.key === ">") {
      e.preventDefault();
      stepFrame(true);
      return;
    }
    if (e.key === "," || e.key === "<") {
      e.preventDefault();
      stepFrame(false);
      return;
    }
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      toggleLoop();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMute();
      return;
    }

  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", measureCanvas);
  window.addEventListener("mouseup", onMouseUp);
  if (window.matchMedia?.("(max-width: 900px)").matches) showDetails.value = false;
  measureCanvas();
  if (typeof ResizeObserver !== "undefined" && canvasElement.value) {
    resizeObserver = new ResizeObserver(measureCanvas); resizeObserver.observe(canvasElement.value);
  }
});

onUnmounted(() => {
  disposed = true; clearAdjacentImages(); resizeObserver?.disconnect();
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("resize", measureCanvas);
  window.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <div
    ref="viewerRoot" class="lightbox-overlay" :class="{ embedded: !fullScreen }"
    :role="fullScreen ? 'dialog' : 'region'" :aria-modal="fullScreen || undefined" :aria-label="`${t.preview.preview}: ${getFileName(file.path)}`"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    v-viewer-dialog="fullScreen ? closeViewer : false"
  >
    <!-- Top HUD Bar -->
    <header class="lightbox-header">
      <div class="file-info">
        <span class="file-name">{{ getFileName(file.path) }}</span>
        <span v-if="file.metadata?.width && file.metadata?.height" class="badge">
          {{ file.metadata.width }} × {{ file.metadata.height }}
        </span>
        <span v-if="file.metadata?.duration_seconds" class="badge">
          ⏱ {{ formatDuration(file.metadata.duration_seconds) }}
        </span>
        <span v-if="file.metadata?.fps" class="badge">
          {{ Math.round(file.metadata.fps) }} fps
        </span>
        <span v-if="file.metadata?.video_codec" class="badge">
          {{ file.metadata.video_codec }}
        </span>
        <span v-if="file.size_bytes" class="badge">
          {{ formatBytes(file.size_bytes) }}
        </span>
        <span class="badge uppercase">
          {{ formatPlatformName(file.metadata?.format) || file.container }}
        </span>
      </div>

      <div class="header-actions">
        <span class="index-indicator">
          {{ Math.max(0, currentIndex + 1) }} / {{ totalCount ?? files.length }}
        </span>
        <button class="hud-btn" :aria-label="t.workbench.fit" @click="resetTransform">{{ t.workbench.fit }}</button>
        <button class="hud-btn" :aria-label="t.workbench.actualSize" @click="actualSize">100%</button>
        <label class="zoom-control"><input type="range" min="0.001" max="8" step="0.001" :value="currentScale" :aria-label="t.workbench.zoom"
          @input="setZoom(Number(($event.target as HTMLInputElement).value))" /><span>{{ (currentScale * 100).toFixed(currentScale < 0.1 ? 1 : 0) }}%</span></label>
        <button class="hud-btn" :aria-label="showDetails ? t.workbench.hideDetails : t.workbench.showDetails" :aria-pressed="showDetails" @click="showDetails = !showDetails">{{ t.workbench.details }}</button>
        <button class="hud-btn" :aria-label="fullScreen ? t.workbench.exitFullscreen : t.workbench.fullscreen" :aria-pressed="fullScreen" @click="fullScreen = !fullScreen">{{ fullScreen ? t.workbench.exitFullscreen : t.workbench.fullscreen }}</button>
        <button
          type="button"
          class="hud-btn close-hud"
          :title="`${t.preview.close} (Esc)`"
          :aria-label="t.preview.close"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </header>

    <div class="viewer-workspace">
    <div class="viewer-media">
    <!-- Center Viewer Canvas -->
    <div
      ref="canvasElement" class="lightbox-canvas"
      :class="{ dragging: isDragging }"
      @wheel="handleWheel"
      @mousedown="onMouseDown"

    >
      <!-- Navigation Prev -->
      <button
        v-if="hasPrev"
        type="button"
        class="nav-arrow prev"
        title="‹ (←)"
        @click.stop="prev"
      >
        ‹
      </button>

      <!-- Main Scaled Media Container -->
      <div
        class="img-container"
        :style="{
          transform: `translate(${translateX}px, ${translateY}px) scale(${renderedScale})`,
          width: mediaSize.width ? `${mediaSize.width}px` : undefined,
          height: mediaSize.height ? `${mediaSize.height}px` : undefined,
        }"
      >
        <video
          v-if="isVideoContainer(file.container)"
          ref="videoRef"
          :src="assetUrl(file.path)"
          :loop="isLooping"
          :muted="isMuted"
          playsinline
          class="lightbox-video"
          :class="{ blurred: file.is_nsfw && !revealedNsfw }"
          @timeupdate="onVideoTimeUpdate"
          @loadedmetadata="onVideoLoadedMetadata"
          @click.stop="togglePlay"
        />
        <img
          v-else
          :src="assetUrl(file.path)"
          :alt="getFileName(file.path)"
          :key="`${file.path}-${file.modified_at}`"
          @load="onImageLoad"
          :class="{ blurred: file.is_nsfw && !revealedNsfw }"
          draggable="false"
        />
        <div
          v-if="file.is_nsfw && !revealedNsfw"
          class="lightbox-nsfw-overlay"
          @click.stop="revealedNsfw = true"
        >
          <span>{{ t.preview.clickToReveal }}</span>
        </div>
      </div>

      <!-- Navigation Next -->
      <button
        v-if="hasNext"
        :disabled="navigationBusy"
        type="button"
        class="nav-arrow next"
        title="› (→)"
        @click.stop="next"
      >
        ›
      </button>
    </div>

    <!-- Video Player Floating HUD -->
    <div v-if="isVideoContainer(file.container)" class="video-player-bar">
      <button
        type="button"
        class="v-ctrl-btn play-btn"
        :title="`${isPlaying ? t.preview.pause : t.preview.play} (Space)`"
        @click.stop="togglePlay"
      >
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button
        type="button"
        class="v-ctrl-btn"
        :title="`${t.preview.stepBackward} (,)`"
        @click.stop="stepFrame(false)"
      >
        ⏮
      </button>
      <button
        type="button"
        class="v-ctrl-btn"
        :title="`${t.preview.stepForward} (.)`"
        @click.stop="stepFrame(true)"
      >
        ⏭
      </button>

      <span class="video-time-display">
        {{ formatDuration(videoCurrentTime) }} / {{ formatDuration(videoDuration || file.metadata?.duration_seconds || 0) }}
      </span>

      <!-- Scrubber -->
      <div class="video-scrubber" @click.stop="seekVideo">
        <div
          class="video-scrubber-fill"
          :style="{ width: `${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}%` }"
        ></div>
      </div>

      <!-- Loop Toggle -->
      <button
        type="button"
        class="v-ctrl-btn"
        :class="{ active: isLooping }"
        :title="`${t.preview.loop} (L)`"
        @click.stop="toggleLoop"
      >
        🔁
      </button>

      <!-- Playback Speed -->
      <select
        :value="playbackRate"
        class="v-speed-select"
        :title="t.preview.playbackSpeed"
        @change="setPlaybackRate(Number(($event.target as HTMLSelectElement).value))"
        @click.stop
      >
        <option v-for="rate in playbackRates" :key="rate" :value="rate">
          {{ rate }}x
        </option>
      </select>

      <!-- Mute Toggle -->
      <button
        type="button"
        class="v-ctrl-btn"
        :title="`${isMuted ? t.preview.unmute : t.preview.mute} (M)`"
        @click.stop="toggleMute"
      >
        {{ isMuted ? '🔇' : '🔊' }}
      </button>

      <!-- Workflow Inspector Toggle Button -->
      <button
        type="button"
        class="v-ctrl-btn workflow-btn"
        :class="{ active: showDetails }"
        :title="`${t.preview.videoWorkflow} (I)`"
        @click.stop="showDetails = !showDetails"
      >
        <span>⚡ {{ t.preview.videoWorkflow }}</span>
      </button>
    </div>

    <p v-if="curationError" role="alert">{{ curationError }}</p>

    <!-- Bottom HUD Floating Bar -->
    <footer class="lightbox-footer">
      <div class="footer-center-hud">
        <!-- Quick Rating -->
        <div class="stars-row">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            class="star-hud-btn"
            :class="{ active: (file.rating ?? 0) >= star }"
            :disabled="curationBusy || file.id == null" @click="setRating(star)"
          >
            ★
          </button>
        </div>

        <div class="divider"></div>

        <!-- Favorite -->
        <button
          type="button"
          class="hud-action-btn"
          :class="{ active: file.is_favorite }"
          :title="file.is_favorite ? t.preview.removeFavorite : t.preview.addFavorite"
          :disabled="curationBusy || file.id == null" @click="toggleFavorite"
        >
          {{ file.is_favorite ? '❤️' : '🤍' }}
        </button>

        <!-- Find Similar -->
        <button
          type="button"
          class="hud-action-btn"
          :title="t.preview.findSimilar"
          @click="emit('findSimilar', file)"
        >
          <span>🔍 {{ t.preview.findSimilar }}</span>
        </button>

        <!-- Prompt Copy -->
        <button
          v-if="file.metadata?.prompt"
          type="button"
          class="hud-action-btn prompt-copy-btn"
          :title="file.metadata.prompt"
          @click="copyPrompt"
        >
          <span>📝 {{ promptCopied ? t.preview.copied : t.preview.copyPrompt }}</span>
        </button>
      </div>
    </footer>

    </div>
    <InspectorPane v-if="showDetails" ref="detailPanel" :file="file" embedded
      @close="showDetails = false" @open-lightbox="showDetails = false"
      @curated="emit('curated', $event)" @open-tag-modal="emit('openTagModal', $event)" @open-album-modal="emit('openAlbumModal', $event)"
      @open-auto-tag-modal="emit('openAutoTagModal', $event)" @find-similar="emit('findSimilar', $event)"
      @filter-by-model="emit('filterByModel', $event)" @filter-by-hash="emit('filterByHash', $event)"
      @open-lora-manager="emit('openLoraManager')" @register-lora="emit('openLoraManager')" @tags-changed="emit('tagsChanged', $event)" />
    </div>

  </div>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  user-select: none;
}

.lightbox-header {
  height: 46px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.75), transparent);
  z-index: 10;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  font-size: 0.84rem;
  font-weight: 600;
  color: #f8fafc;
}

.badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.badge.uppercase {
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.index-indicator {
  font-size: 0.76rem;
  color: #94a3b8;
}

.hud-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 0.76rem;
  cursor: pointer;
  transition: all 0.15s;
}

.hud-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.close-hud {
  font-size: 0.9rem;
  padding: 3px 10px;
}

.close-hud:hover {
  background: #ef4444;
  border-color: #ef4444;
}

.lightbox-canvas {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: grab;
}

.lightbox-canvas.dragging {
  cursor: grabbing;
}

.img-container {
  max-width: none;
  max-height: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.05s ease-out;
  transform-origin: center center;
}

.img-container img {
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
  object-fit: contain;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  border-radius: 4px;
}

.img-container img.blurred {
  filter: blur(30px);
}

.lightbox-nsfw-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: #f87171;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 68px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  backdrop-filter: blur(4px);
  transition: all 0.15s;
  z-index: 10;
}

.nav-arrow.prev {
  left: 18px;
}

.nav-arrow.next {
  right: 18px;
}

.nav-arrow:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-50%) scale(1.05);
}

.lightbox-footer {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
  z-index: 10;
}

.footer-center-hud {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(24, 24, 27, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  padding: 5px 14px;
  border-radius: 999px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.stars-row {
  display: flex;
  gap: 2px;
}

.star-hud-btn {
  background: transparent;
  border: none;
  color: #475569;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 2px;
  transition: all 0.1s;
}

.star-hud-btn:hover {
  transform: scale(1.2);
  color: #fbbf24;
}

.star-hud-btn.active {
  color: #f59e0b;
}

.divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.15);
}

.hud-action-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 0.78rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.hud-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.hud-action-btn.active {
  background: rgba(236, 72, 153, 0.25);
  border-color: rgba(236, 72, 153, 0.5);
}

.prompt-copy-btn {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.img-container video {
  max-width: none;
  max-height: none;
  object-fit: contain;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  border-radius: 4px;
}

.img-container video.blurred {
  filter: blur(30px);
}

.video-player-bar {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(18, 18, 22, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  padding: 6px 14px;
  border-radius: 999px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
  z-index: 20;
}

.v-ctrl-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.v-ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.v-ctrl-btn.active {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.6);
  color: #818cf8;
}

.v-ctrl-btn.play-btn {
  font-size: 1rem;
  padding: 4px 10px;
}

.video-time-display {
  font-size: 0.76rem;
  color: #94a3b8;
  font-family: monospace;
  white-space: nowrap;
}

.video-scrubber {
  width: 140px;
  height: 6px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.video-scrubber-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 999px;
  transition: width 0.05s linear;
}

.v-speed-select {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  font-size: 0.74rem;
  border-radius: 4px;
  padding: 2px 4px;
  outline: none;
  cursor: pointer;
}

.v-speed-select option {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.workflow-btn {
  font-size: 0.76rem;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.workflow-inspector-panel {
  position: absolute;
  top: 54px;
  right: 18px;
  bottom: 70px;
  width: 380px;
  max-width: calc(100vw - 36px);
  background: rgba(18, 18, 22, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  z-index: 30;
  overflow: hidden;
  animation: slideInRight 0.2s ease-out;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.inspector-header h4 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: #f8fafc;
}

.inspector-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
}

.info-key {
  color: #94a3b8;
}

.info-val {
  color: #e2e8f0;
  font-weight: 500;
}

.info-val.highlight {
  color: #818cf8;
  font-weight: 600;
}

.prompt-box,
.workflow-raw-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.74rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.mini-copy-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s;
}

.mini-copy-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.prompt-text {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.prompt-text.negative {
  color: #fca5a5;
}

.raw-pre {
  margin: 0;
  font-size: 0.72rem;
  font-family: monospace;
  color: #a5b4fc;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 6px;
  max-height: 200px;
  overflow: auto;
  white-space: pre;
}
.lightbox-overlay { background: var(--color-bg-app); color: var(--color-text-primary); }
.lightbox-overlay.embedded { position: relative; inset: auto; width: 100%; height: 100%; min-width: 0; z-index: auto; }
.viewer-workspace { display: flex; flex: 1; min-height: 0; position: relative; }
.viewer-media { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.lightbox-header { height: auto; min-height: 46px; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--color-bg-primary); border-bottom: 1px solid var(--border-color); }
.file-info, .header-actions { min-width: 0; flex-wrap: wrap; }
.file-name { color: var(--color-text-primary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zoom-control { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; }
.zoom-control input { width: 80px; accent-color: var(--color-accent); }
.hud-btn { color: var(--color-text-primary); background: var(--color-bg-secondary); border-color: var(--border-color); }
.img-container { flex-shrink: 0; max-width: none; max-height: none; }
.img-container img, .img-container video { max-width: none; max-height: none; width: 100%; height: 100%; }
.lightbox-footer { position: static; padding: 10px; flex-shrink: 0; height: auto; min-height: 54px; box-sizing: border-box; background: var(--color-bg-primary); }
.footer-center-hud { flex-wrap: wrap; justify-content: center; }
button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (max-width: 900px) { .viewer-workspace > :deep(.inspector-eagle) { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -12px 0 24px rgba(0,0,0,.25); } }
@media (max-width: 500px) { .file-info .badge { display: none; } .header-actions { gap: 6px; } .viewer-workspace > :deep(.inspector-eagle) { width: min(320px,100%); min-width: 0; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
