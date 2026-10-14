import { createLibrary, parseLibrary, STORAGE_KEY } from './model';
import { addDefaultFormats } from './default-formats';
import type { Library } from './model';

export function loadLibrary(): { library: Library; error: string; writable: boolean; recovery: string } {
  let raw = '';
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? '';
    return { library: raw ? addDefaultFormats(parseLibrary(raw)) : createLibrary(), error: '', writable: true, recovery: '' };
  } catch {
    return {
      library: createLibrary(), writable: false, recovery: raw,
      error: raw ? 'Saved data could not be read. Download the stored data before replacing it with a backup or a fresh library.'
        : 'Browser storage is unavailable. Changes will stay in this tab only. Export a backup to keep them.',
    };
  }
}

export function saveLibrary(library: Library): string {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); return ''; }
  catch { return 'Changes could not be saved to this browser. Export a backup before closing this tab.'; }
}

export function download(contents: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
