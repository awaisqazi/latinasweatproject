// Cache utility for storing and retrieving data from localStorage
// Used to reduce Firebase reads on public pages

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// SSR-safe check: localStorage only exists in the browser
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/**
 * Get cached data for a specific key
 * @param {string} key - Cache key (e.g., "shifts_2026-02")
 * @returns {{ data: any, isStale: boolean } | null}
 */
export function getCache(key) {
    if (!isBrowser) return null;
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const isStale = age > CACHE_DURATION_MS;

        return { data, isStale, age };
    } catch (e) {
        console.warn('Cache read error:', e);
        return null;
    }
}

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
export function setCache(key, data) {
    if (!isBrowser) return;
    try {
        const cacheEntry = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

/**
 * Invalidate (remove) a specific cache key
 * @param {string} key - Cache key to invalidate
 */
export function invalidateCache(key) {
    if (!isBrowser) return;
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Cache invalidate error:', e);
    }
}

/**
 * Invalidate all caches matching a prefix
 * @param {string} prefix - Prefix to match (e.g., "shifts_" or "subs_")
 */
export function invalidateCacheByPrefix(prefix) {
    if (!isBrowser) return;
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        console.warn('Cache prefix invalidate error:', e);
    }
}

/**
 * Generate cache key for shift data
 * @param {Date} startDate - Start of the date range
 * @param {Date} endDate - End of the date range
 * @returns {string}
 */
export function getShiftCacheKey(startDate, endDate) {
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
    return `shifts_${startStr}_${endStr}`;
}

/**
 * Generate cache key for sub request data
 * @returns {string}
 */
export function getSubsCacheKey() {
    return 'subs_requests';
}

/**
 * Generate cache key for monthly availability aggregation
 * @param {string} monthKey - Month in YYYY-MM format
 * @returns {string}
 */
export function getMonthlyAvailabilityCacheKey(monthKey) {
    return `availability_${monthKey}`;
}
