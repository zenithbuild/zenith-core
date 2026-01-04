/**
 * Navigation & Prefetch Runtime
 * 
 * Phase 7: Prefetch compiled output, safe SPA navigation, route caching
 * 
 * This runtime handles:
 * - Prefetching compiled HTML + JS for routes
 * - Caching prefetched routes
 * - Safe DOM mounting and hydration
 * - Browser history management
 * - Explicit data exposure for navigation
 */

/**
 * Route cache entry containing compiled output
 */
export interface RouteCacheEntry {
  html: string
  js: string
  styles: string[]
  routePath: string
  compiledAt: number
}

/**
 * Navigation options with explicit data
 */
export interface NavigateOptions {
  loaderData?: any
  props?: any
  stores?: any
  replace?: boolean
  prefetch?: boolean
}

/**
 * Route cache - stores prefetched compiled output
 */
const routeCache = new Map<string, RouteCacheEntry>()

/**
 * Current navigation state
 */
let currentRoute: string = ''
let navigationInProgress: boolean = false

/**
 * Prefetch a route's compiled output
 * 
 * @param routePath - The route path to prefetch (e.g., "/dashboard")
 * @returns Promise that resolves when prefetch is complete
 */
export async function prefetchRoute(routePath: string): Promise<void> {
  // Normalize route path
  const normalizedPath = routePath === '' ? '/' : routePath
  
  // Check if already cached
  if (routeCache.has(normalizedPath)) {
    return Promise.resolve()
  }
  
  // In a real implementation, this would fetch from the build output
  // For Phase 7, we'll generate a placeholder that indicates the route needs to be built
  try {
    // Fetch compiled HTML + JS
    // In production, this would be:
    // const htmlResponse = await fetch(`${normalizedPath}.html`)
    // const jsResponse = await fetch(`${normalizedPath}.js`)
    
    // For now, return a placeholder that indicates prefetch structure
    const cacheEntry: RouteCacheEntry = {
      html: `<!-- Prefetched route: ${normalizedPath} -->`,
      js: `// Prefetched route runtime: ${normalizedPath}`,
      styles: [],
      routePath: normalizedPath,
      compiledAt: Date.now()
    }
    
    routeCache.set(normalizedPath, cacheEntry)
  } catch (error) {
    console.warn(`[Zenith] Failed to prefetch route ${normalizedPath}:`, error)
    throw error
  }
}

/**
 * Get cached route entry
 */
export function getCachedRoute(routePath: string): RouteCacheEntry | null {
  const normalizedPath = routePath === '' ? '/' : routePath
  return routeCache.get(normalizedPath) || null
}

/**
 * Navigate to a route with explicit data
 * 
 * @param routePath - The route path to navigate to
 * @param options - Navigation options with loaderData, props, stores
 */
export async function navigate(
  routePath: string,
  options: NavigateOptions = {}
): Promise<void> {
  if (navigationInProgress) {
    console.warn('[Zenith] Navigation already in progress, skipping')
    return
  }
  
  navigationInProgress = true
  
  try {
    const normalizedPath = routePath === '' ? '/' : routePath
    
    // Check if route is cached, otherwise prefetch
    let cacheEntry = getCachedRoute(normalizedPath)
    if (!cacheEntry && options.prefetch !== false) {
      await prefetchRoute(normalizedPath)
      cacheEntry = getCachedRoute(normalizedPath)
    }
    
    if (!cacheEntry) {
      throw new Error(`Route ${normalizedPath} not found. Ensure the route is compiled.`)
    }
    
    // Cleanup previous route
    cleanupPreviousRoute()
    
    // Get router outlet
    const outlet = getRouterOutlet()
    if (!outlet) {
      throw new Error('Router outlet not found. Ensure <div id="zenith-outlet"></div> exists.')
    }
    
    // Mount compiled HTML
    outlet.innerHTML = cacheEntry.html
    
    // Inject styles
    injectStyles(cacheEntry.styles)
    
    // Execute JS runtime (compiled expressions + hydration)
    await executeRouteRuntime(cacheEntry.js, {
      loaderData: options.loaderData || {},
      props: options.props || {},
      stores: options.stores || {}
    })
    
    // Update browser history
    if (typeof window !== 'undefined') {
      const url = normalizedPath + (window.location.search || '')
      if (options.replace) {
        window.history.replaceState({ route: normalizedPath }, '', url)
      } else {
        window.history.pushState({ route: normalizedPath }, '', url)
      }
    }
    
    currentRoute = normalizedPath
    
    // Dispatch navigation event
    dispatchNavigationEvent(normalizedPath, options)
  } catch (error) {
    console.error('[Zenith] Navigation error:', error)
    throw error
  } finally {
    navigationInProgress = false
  }
}

/**
 * Cleanup previous route
 */
function cleanupPreviousRoute(): void {
  if (typeof window === 'undefined') return
  
  // Cleanup hydration runtime
  if ((window as any).zenithCleanup) {
    ;(window as any).zenithCleanup()
  }
  
  // Remove previous page styles
  document.querySelectorAll('style[data-zen-route-style]').forEach(style => {
    style.remove()
  })
  
  // Clear window state (if needed)
  // State is managed per-route, so we don't clear it here
}

/**
 * Get router outlet element
 */
function getRouterOutlet(): HTMLElement | null {
  if (typeof window === 'undefined') return null
  return document.querySelector('#zenith-outlet') || document.querySelector('[data-zen-outlet]')
}

/**
 * Inject route styles
 */
function injectStyles(styles: string[]): void {
  if (typeof window === 'undefined') return
  
  styles.forEach((styleContent, index) => {
    const style = document.createElement('style')
    style.setAttribute('data-zen-route-style', String(index))
    style.textContent = styleContent
    document.head.appendChild(style)
  })
}

/**
 * Execute route runtime JS
 * 
 * This executes the compiled JS bundle for the route, which includes:
 * - Expression wrappers
 * - Hydration runtime
 * - Event bindings
 */
async function executeRouteRuntime(
  jsCode: string,
  data: { loaderData: any; props: any; stores: any }
): Promise<void> {
  if (typeof window === 'undefined') return
  
  try {
    // Execute the compiled JS (which registers expressions and hydration functions)
    // In a real implementation, this would use a script tag or eval (secure context)
    const script = document.createElement('script')
    script.textContent = jsCode
    document.head.appendChild(script)
    document.head.removeChild(script)
    
    // After JS executes, call hydrate with explicit data
    if ((window as any).zenithHydrate) {
      const state = (window as any).__ZENITH_STATE__ || {}
      ;(window as any).zenithHydrate(
        state,
        data.loaderData,
        data.props,
        data.stores,
        getRouterOutlet()
      )
    }
  } catch (error) {
    console.error('[Zenith] Error executing route runtime:', error)
    throw error
  }
}

/**
 * Dispatch navigation event
 */
function dispatchNavigationEvent(routePath: string, options: NavigateOptions): void {
  if (typeof window === 'undefined') return
  
  const event = new CustomEvent('zenith:navigate', {
    detail: {
      route: routePath,
      loaderData: options.loaderData,
      props: options.props,
      stores: options.stores
    }
  })
  window.dispatchEvent(event)
}

/**
 * Handle browser back/forward navigation
 */
export function setupHistoryHandling(): void {
  if (typeof window === 'undefined') return
  
  window.addEventListener('popstate', (event) => {
    const state = event.state
    const routePath = state?.route || window.location.pathname
    
    // Navigate without pushing to history (browser already changed it)
    navigate(routePath, { replace: true, prefetch: false }).catch((error) => {
      console.error('[Zenith] History navigation error:', error)
    })
  })
}

/**
 * Generate navigation runtime code (to be included in bundle)
 */
export function generateNavigationRuntime(): string {
  return `
// Zenith Navigation Runtime (Phase 7)
(function() {
  'use strict';
  
  // Route cache
  const __zen_routeCache = new Map();
  
  // Current route state
  let __zen_currentRoute = '';
  let __zen_navigationInProgress = false;
  
  /**
   * Prefetch a route
   */
  async function prefetchRoute(routePath) {
    const normalizedPath = routePath === '' ? '/' : routePath;
    
    if (__zen_routeCache.has(normalizedPath)) {
      return Promise.resolve();
    }
    
    try {
      // Fetch compiled HTML + JS
      // This is a placeholder - in production, fetch from build output
      const cacheEntry = {
        html: '<!-- Prefetched: ' + normalizedPath + ' -->',
        js: '// Prefetched runtime: ' + normalizedPath,
        styles: [],
        routePath: normalizedPath,
        compiledAt: Date.now()
      };
      
      __zen_routeCache.set(normalizedPath, cacheEntry);
    } catch (error) {
      console.warn('[Zenith] Prefetch failed:', routePath, error);
      throw error;
    }
  }
  
  /**
   * Navigate to route with explicit data
   */
  async function navigate(routePath, options) {
    options = options || {};
    
    if (__zen_navigationInProgress) {
      console.warn('[Zenith] Navigation in progress');
      return;
    }
    
    __zen_navigationInProgress = true;
    
    try {
      const normalizedPath = routePath === '' ? '/' : routePath;
      
      // Get cached route or prefetch
      let cacheEntry = __zen_routeCache.get(normalizedPath);
      if (!cacheEntry && options.prefetch !== false) {
        await prefetchRoute(normalizedPath);
        cacheEntry = __zen_routeCache.get(normalizedPath);
      }
      
      if (!cacheEntry) {
        throw new Error('Route not found: ' + normalizedPath);
      }
      
      // Get outlet
      const outlet = document.querySelector('#zenith-outlet') || document.querySelector('[data-zen-outlet]');
      if (!outlet) {
        throw new Error('Router outlet not found');
      }
      
      // Mount HTML
      outlet.innerHTML = cacheEntry.html;
      
      // Execute runtime JS
      if (cacheEntry.js) {
        const script = document.createElement('script');
        script.textContent = cacheEntry.js;
        document.head.appendChild(script);
        document.head.removeChild(script);
      }
      
      // Hydrate with explicit data
      if (window.zenithHydrate) {
        const state = window.__ZENITH_STATE__ || {};
        window.zenithHydrate(
          state,
          options.loaderData || {},
          options.props || {},
          options.stores || {},
          outlet
        );
      }
      
      // Update history
      const url = normalizedPath + (window.location.search || '');
      if (options.replace) {
        window.history.replaceState({ route: normalizedPath }, '', url);
      } else {
        window.history.pushState({ route: normalizedPath }, '', url);
      }
      
      __zen_currentRoute = normalizedPath;
      
      // Dispatch event
      window.dispatchEvent(new CustomEvent('zenith:navigate', {
        detail: { route: normalizedPath, options: options }
      }));
    } catch (error) {
      console.error('[Zenith] Navigation error:', error);
      throw error;
    } finally {
      __zen_navigationInProgress = false;
    }
  }
  
  /**
   * Handle browser history
   */
  function setupHistoryHandling() {
    window.addEventListener('popstate', function(event) {
      const state = event.state;
      const routePath = state && state.route ? state.route : window.location.pathname;
      
      navigate(routePath, { replace: true, prefetch: false }).catch(function(error) {
        console.error('[Zenith] History navigation error:', error);
      });
    });
  }
  
  // Initialize history handling
  setupHistoryHandling();
  
  // Expose API
  if (typeof window !== 'undefined') {
    window.__zenith_navigate = navigate;
    window.__zenith_prefetch = prefetchRoute;
    window.navigate = navigate; // Global convenience
  }
})();
`
}

