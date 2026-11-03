import { shallowRef, ref, watch } from 'vue';
import type { ImageFile } from '../types';

/** Only the active pair is hydrated. Selection changes/unmount fence late IPC. */
export function useComparisonDetails(getFiles: () => readonly (ImageFile | null)[],
  request: (id: number) => Promise<ImageFile | null>) {
  const files = shallowRef<(ImageFile | null)[]>([null, null]);
  const partial = ref([false, false]), loading = ref(false);
  watch(() => getFiles().map(f => f ? [f.id, f.path, f.modified_at] : null), async (_, __, cleanup) => {
    let current = true; cleanup(() => {current = false;});
    const pair = getFiles().slice(0, 2);
    files.value = [null, null]; partial.value = [false, false]; loading.value = true;
    const results = await Promise.allSettled(pair.map(async file => {
      if (!file || file.id === null) return {file, partial: !!file};
      const full = await request(file.id);
      if (!full || full.id !== file.id || full.path !== file.path) throw new Error('Stale or missing details');
      return {file: full, partial: false};
    }));
    if (!current) return;
    files.value = results.map((result, i) => result.status === 'fulfilled' ? result.value.file : pair[i]);
    partial.value = results.map(result => result.status === 'rejected' || result.value.partial);
    loading.value = false;
  }, {immediate: true, deep: true});
  return {files, partial, loading};
}
