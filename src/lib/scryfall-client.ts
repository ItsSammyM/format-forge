export const CACHE_TTL = 24 * 60 * 60 * 1000;
const INTERVAL = 500;
const WINDOW = 60000;
const WINDOW_LIMIT = 60;
const STATE_KEY = 'format-forge.scryfall.requests.v1';
const CACHE_NAME = 'format-forge.scryfall.responses.v1';
interface State { last: number; until: number; strikes: number; throttledAt: number; recent: number[] }
export interface CachedResponse { at: number; status: number; data: unknown }
interface Runtime {
  now: () => number;
  fetch: typeof fetch;
  wait: (ms: number, signal?: AbortSignal) => Promise<void>;
  readState: () => Partial<State>;
  writeState: (state: State) => void;
  readCache: (url: string) => Promise<CachedResponse | undefined>;
  writeCache: (url: string, entry: CachedResponse) => Promise<void>;
  lock: <T>(work: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
}
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export class ScryfallClient {
  private tail: Promise<unknown> = Promise.resolve();
  private state: State = { last: 0, until: 0, strikes: 0, throttledAt: 0, recent: [] };
  private cache = new Map<string, CachedResponse>();
  private pending = new Map<string, Promise<unknown>>();
  private runtime: Runtime;
  constructor(runtime: Runtime) { this.runtime = runtime; }
  private sync() {
    const saved = this.runtime.readState();
    for (const key of ['last', 'until', 'strikes', 'throttledAt'] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) this.state[key] = Math.max(this.state[key], saved[key]!);
    }
    this.state.recent = [...new Set([...this.state.recent, ...Array.isArray(saved.recent) ? saved.recent : []])]
      .filter(at => Number.isFinite(at) && at > this.runtime.now() - WINDOW).sort((a, b) => a - b);
  }
  get cooldownUntil() { this.sync(); return this.state.until > this.runtime.now() ? this.state.until : 0; }
  private blocked() {
    if (this.cooldownUntil) throw new ApiError(`Scryfall requests are paused until ${new Date(this.state.until).toLocaleTimeString()}. Cached cards remain available. Retry after the pause.`, 429);
  }
  private unpack<T>(entry: CachedResponse): T {
    if (entry.status !== 200) throw new ApiError((entry.data as { details?: string })?.details || 'Scryfall request failed.', entry.status);
    return entry.data as T;
  }
  private async cached(url: string) {
    let entry = this.cache.get(url);
    if (!entry) { try { entry = await this.runtime.readCache(url); } catch { /* Storage may be unavailable. */ } }
    if (!entry || !Number.isFinite(entry.at) || ![200, 404].includes(entry.status) || entry.at > this.runtime.now() || this.runtime.now() - entry.at >= CACHE_TTL) { this.cache.delete(url); return undefined; }
    this.remember(url, entry); return entry;
  }
  private remember(url: string, entry: CachedResponse) {
    this.cache.delete(url); this.cache.set(url, entry);
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
  }
  private async save(url: string, entry: CachedResponse) {
    this.remember(url, entry);
    try { await this.runtime.writeCache(url, entry); } catch { /* Keep the memory cache when storage is full. */ }
  }
  request<T>(raw: string, signal?: AbortSignal): Promise<T> {
    const endpoint = new URL(raw);
    if (endpoint.origin !== 'https://api.scryfall.com') return Promise.reject(new Error('Invalid Scryfall endpoint.'));
    const url = endpoint.href;
    // Metadata calls share work. Abortable searches recheck the cache in the queue.
    if (!signal && this.pending.has(url)) return this.pending.get(url) as Promise<T>;
    const run = this.run<T>(url, signal);
    if (!signal) { this.pending.set(url, run); void run.finally(() => { if (this.pending.get(url) === run) this.pending.delete(url); }).catch(() => {}); }
    return run;
  }
  private async run<T>(url: string, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const cached = await this.cached(url); signal?.throwIfAborted();
    if (cached) return this.unpack<T>(cached);
    this.blocked();
    const job = this.tail.catch(() => {}).then(() => this.runtime.lock(async () => {
      signal?.throwIfAborted();
      const cached = await this.cached(url); signal?.throwIfAborted();
      if (cached) return this.unpack<T>(cached);
      this.blocked();
      this.sync();
      const budgetWait = this.state.recent.length >= WINDOW_LIMIT ? this.state.recent[this.state.recent.length - WINDOW_LIMIT] + WINDOW - this.runtime.now() : 0;
      await this.runtime.wait(Math.max(0, INTERVAL - (this.runtime.now() - this.state.last), budgetWait), signal);
      signal?.throwIfAborted(); this.blocked();
      this.state.last = this.runtime.now(); this.state.recent.push(this.state.last); this.runtime.writeState(this.state);
      const controller = new AbortController();
      const cancel = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('Scryfall timed out. Try again.')), 15000);
      try {
        const response = await this.runtime.fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        // Act on the status before reading the body, including non-JSON 429s.
        if (response.status === 429) {
          const now = this.runtime.now(), header = response.headers.get('Retry-After');
          const retryAfter = header === null ? 0 : /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - now) || 0;
          const strikes = now - this.state.throttledAt < CACHE_TTL ? this.state.strikes + 1 : 1;
          this.state = { ...this.state, strikes, throttledAt: now, until: now + Math.max(60000, retryAfter, Math.min(900000, 60000 * 2 ** Math.min(strikes - 1, 4))) };
          this.runtime.writeState(this.state); this.blocked();
        }
        const data = await response.json();
        if (response.ok || response.status === 404) {
          await this.save(url, { at: this.runtime.now(), status: response.ok ? 200 : 404, data });
          // Resolve cards added from search without another ID lookup.
          const cards = Array.isArray(data?.data) ? data.data : data?.object === 'card' ? [data] : [];
          for (const card of cards) if (typeof card?.id === 'string' && typeof card?.name === 'string' && typeof card?.collector_number === 'string') {
            await this.save(`https://api.scryfall.com/cards/${encodeURIComponent(card.id)}`, { at: this.runtime.now(), status: 200, data: card });
          }
        }
        if (!response.ok) throw new ApiError(data.details || 'Scryfall request failed.', response.status);
        return data as T;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) throw controller.signal.reason;
        throw new Error('Could not reach Scryfall. Check your connection and try again.');
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    }, signal));
    this.tail = job; return job;
  }
}
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
let writes = 0;
export const scryfallClient = new ScryfallClient({
  now: () => Date.now(), fetch: (...args) => globalThis.fetch(...args), wait,
  readState: () => { try { const state = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}'); return state && typeof state === 'object' ? state : {}; } catch { return {}; } },
  writeState: state => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* Memory state still applies. */ } },
  readCache: async url => {
    if (typeof caches === 'undefined') return undefined;
    const response = await (await caches.open(CACHE_NAME)).match(url);
    return response ? await response.json() : undefined;
  },
  writeCache: async (url, entry) => {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, new Response(JSON.stringify(entry), { headers: { 'Content-Type': 'application/json' } }));
    if (++writes % 25 === 0) { const keys = await cache.keys(); for (const key of keys.slice(0, Math.max(0, keys.length - 500))) await cache.delete(key); }
  },
  lock: async (work, signal) => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('format-forge.scryfall.network', { ...(signal ? { signal } : {}) }, work)
    : work(),
});
