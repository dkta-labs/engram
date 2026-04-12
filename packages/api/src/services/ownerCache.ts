const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 10_000;

interface CacheEntry {
  address: string;
  expiresAt: number;
  prev: CacheEntry | null;
  next: CacheEntry | null;
  agentId: number;
}

// LRU doubly-linked list (head = most recent, tail = least recent)
let head: CacheEntry | null = null;
let tail: CacheEntry | null = null;
const map = new Map<number, CacheEntry>();

function detach(entry: CacheEntry): void {
  if (entry.prev) entry.prev.next = entry.next;
  else head = entry.next;
  if (entry.next) entry.next.prev = entry.prev;
  else tail = entry.prev;
  entry.prev = null;
  entry.next = null;
}

function pushFront(entry: CacheEntry): void {
  entry.next = head;
  entry.prev = null;
  if (head) head.prev = entry;
  head = entry;
  if (!tail) tail = entry;
}

function evictLRU(): void {
  if (!tail) return;
  map.delete(tail.agentId);
  detach(tail);
}

export function getCachedOwner(agentId: number): string | null {
  const entry = map.get(agentId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(agentId);
    detach(entry);
    return null;
  }
  // Move to front (most recently used)
  detach(entry);
  pushFront(entry);
  return entry.address;
}

export function setCachedOwner(agentId: number, address: string): void {
  const existing = map.get(agentId);
  if (existing) {
    existing.address = address;
    existing.expiresAt = Date.now() + TTL_MS;
    detach(existing);
    pushFront(existing);
    return;
  }
  if (map.size >= MAX_ENTRIES) {
    evictLRU();
  }
  const entry: CacheEntry = {
    address,
    expiresAt: Date.now() + TTL_MS,
    prev: null,
    next: null,
    agentId,
  };
  map.set(agentId, entry);
  pushFront(entry);
}

export function invalidateOwner(agentId: number): void {
  const entry = map.get(agentId);
  if (entry) {
    detach(entry);
    map.delete(agentId);
  }
}
