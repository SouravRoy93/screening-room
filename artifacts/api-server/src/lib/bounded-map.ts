// Tiny LRU-ish bounded map: insertion-ordered eviction with recency refresh
// on get. Keeps the free-tier instance's memory flat no matter how many
// distinct queries hit the cache endpoints.
export class BoundedMap<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize = 500) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key) as V;
    this.map.delete(key);       // refresh recency
    this.map.set(key, val);
    return val;
  }

  set(key: K, val: V): this {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, val);
    return this;
  }

  has(key: K): boolean { return this.map.has(key); }
  delete(key: K): boolean { return this.map.delete(key); }
  get size(): number { return this.map.size; }
}
