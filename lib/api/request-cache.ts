/**
 * In-Memory Request Cache & Deduplication
 * Prevents duplicate API requests for identical queries within a short window
 */

interface CacheEntry<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface RequestCacheOptions {
  ttlMs?: number; // Time-to-live in milliseconds (default: 5s)
  maxSize?: number; // Maximum cache entries (default: 100)
}

export class RequestCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(options: RequestCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5000;
    this.maxSize = options.maxSize ?? 100;
  }

  /**
   * Generate cache key from request details
   */
  private getCacheKey(method: string, url: string, body?: unknown): string {
    const bodyStr = body ? JSON.stringify(body) : "";
    return `${method}:${url}:${bodyStr}`;
  }

  /**
   * Execute request with caching & deduplication
   * If identical request is in-flight, return same promise
   */
  async execute<T>(
    method: string,
    url: string,
    fetcher: () => Promise<T>,
    body?: unknown
  ): Promise<T> {
    const cacheKey = this.getCacheKey(method, url, body);

    // Check cache for existing promise
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.promise as Promise<T>;
    }

    // Create new promise and cache it
    const promise = fetcher().catch((error) => {
      // Remove failed requests from cache immediately
      this.cache.delete(cacheKey);
      throw error;
    });

    const entry: CacheEntry<T> = {
      promise,
      timestamp: Date.now(),
    };

    // Enforce max cache size (FIFO eviction)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, entry);

    // Auto-cleanup after TTL
    setTimeout(() => {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp >= this.ttlMs) {
        this.cache.delete(cacheKey);
      }
    }, this.ttlMs);

    return promise;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; ttlMs: number; maxSize: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Global request cache instance
 */
export const globalRequestCache = new RequestCache({
  ttlMs: 5000, // 5 second deduplication window
  maxSize: 100, // Max 100 concurrent requests
});

/**
 * Helper for deduplicating API calls
 */
export async function dedupedFetch<T>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<T> {
  return globalRequestCache.execute(
    method,
    url,
    async () => {
      const fetchOptions: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      
      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    },
    body
  );
}
