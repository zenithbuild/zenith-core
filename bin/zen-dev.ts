#!/usr/bin/env bun
/**
 * Zenith Dev Server with In-Memory Compilation
 * 
 * Features:
 * - In-memory .zen compilation (no disk writes required)
 * - Shared runtime module served at /runtime.js
 * - Page-specific scripts at /__dev_pages/*.js
 * - Automatic hydration injection
 * - File watching for HMR
 * - DefaultLayout injection
 */

import path from 'path'
import fs from 'fs'
import { serve } from 'bun'
import { compileZen } from '../compiler/index'
import { parseZen } from '../compiler/legacy/parse'
import { splitZen } from '../compiler/legacy/split'
import { processComponents } from '../compiler/legacy/component-process'
import { discoverPages, generateRouteDefinition, routePathToRegex } from '../router/manifest'

const projectRoot = process.cwd()
const appDir = path.join(projectRoot, 'app')
const pagesDir = path.join(appDir, 'pages')
const port = parseInt(process.env.PORT || '3000', 10)

// File extensions that should be served as static assets
const STATIC_EXTENSIONS = new Set([
    '.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.webp', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
])

// Page compilation cache
interface CompiledPage {
    html: string
    script: string
    styles: string[]
    route: string
    lastModified: number
}
const pageCache = new Map<string, CompiledPage>()

/**
 * Generate the shared runtime JavaScript
 */
function generateRuntimeJS(): string {
    // Read and compile the client runtime
    const runtimePath = path.join(__dirname, '../runtime/client-runtime.ts')

    // For now, inline the transpiled runtime
    // In production, this would be pre-built
    return `// Zenith Runtime v0.1.0
// Auto-generated shared runtime module

${generateInlineRuntime()}

// Initialize on load
if (typeof window !== 'undefined') {
  window.__ZENITH_RUNTIME_LOADED__ = true;
}
`
}

/**
 * Generate inline runtime code (extracted from client-runtime.ts logic)
 */
function generateInlineRuntime(): string {
    return `(function() {
  'use strict';
  
  // Dependency Tracking
  let currentEffect = null;
  const effectStack = [];
  let batchDepth = 0;
  const pendingEffects = new Set();
  
  function pushContext(effect) {
    effectStack.push(currentEffect);
    currentEffect = effect;
  }
  
  function popContext() {
    currentEffect = effectStack.pop() || null;
  }
  
  function trackDependency(subscribers) {
    if (currentEffect) {
      subscribers.add(currentEffect);
      currentEffect.dependencies.add(subscribers);
    }
  }
  
  function notifySubscribers(subscribers) {
    const effects = [...subscribers];
    for (const effect of effects) {
      if (batchDepth > 0) {
        pendingEffects.add(effect);
      } else {
        effect.run();
      }
    }
  }
  
  function cleanupEffect(effect) {
    for (const deps of effect.dependencies) {
      deps.delete(effect);
    }
    effect.dependencies.clear();
  }
  
  // zenSignal
  function zenSignal(initialValue) {
    let value = initialValue;
    const subscribers = new Set();
    
    function signal(newValue) {
      if (arguments.length === 0) {
        trackDependency(subscribers);
        return value;
      }
      if (newValue !== value) {
        value = newValue;
        notifySubscribers(subscribers);
      }
      return value;
    }
    return signal;
  }
  
  // zenState
  function zenState(initialObj) {
    const subscribers = new Map();
    
    function getSubscribers(path) {
      if (!subscribers.has(path)) {
        subscribers.set(path, new Set());
      }
      return subscribers.get(path);
    }
    
    function createProxy(obj, parentPath) {
      parentPath = parentPath || '';
      if (obj === null || typeof obj !== 'object') return obj;
      
      return new Proxy(obj, {
        get(target, prop) {
          if (typeof prop === 'symbol') return target[prop];
          const path = parentPath ? parentPath + '.' + String(prop) : String(prop);
          trackDependency(getSubscribers(path));
          const value = target[prop];
          if (value !== null && typeof value === 'object') {
            return createProxy(value, path);
          }
          return value;
        },
        set(target, prop, newValue) {
          if (typeof prop === 'symbol') {
            target[prop] = newValue;
            return true;
          }
          const path = parentPath ? parentPath + '.' + String(prop) : String(prop);
          const oldValue = target[prop];
          if (oldValue !== newValue) {
            target[prop] = newValue;
            const subs = subscribers.get(path);
            if (subs) notifySubscribers(subs);
          }
          return true;
        }
      });
    }
    return createProxy(initialObj);
  }
  
  // zenEffect
  function zenEffect(fn) {
    let cleanup;
    const effect = {
      dependencies: new Set(),
      run() {
        cleanupEffect(effect);
        pushContext(effect);
        try {
          if (cleanup) cleanup();
          cleanup = fn();
        } finally {
          popContext();
        }
      }
    };
    effect.run();
    return () => {
      cleanupEffect(effect);
      if (cleanup) cleanup();
    };
  }
  
  // zenMemo
  function zenMemo(fn) {
    let value;
    let dirty = true;
    const subscribers = new Set();
    const effect = {
      dependencies: new Set(),
      run() {
        cleanupEffect(effect);
        pushContext(effect);
        try {
          value = fn();
          dirty = false;
          notifySubscribers(subscribers);
        } finally {
          popContext();
        }
      }
    };
    return () => {
      trackDependency(subscribers);
      if (dirty) effect.run();
      return value;
    };
  }
  
  // zenRef
  function zenRef(initialValue) {
    return { current: initialValue !== undefined ? initialValue : null };
  }
  
  // zenBatch
  function zenBatch(fn) {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        const effects = [...pendingEffects];
        pendingEffects.clear();
        for (const effect of effects) {
          effect.run();
        }
      }
    }
  }
  
  // zenUntrack
  function zenUntrack(fn) {
    const prevEffect = currentEffect;
    currentEffect = null;
    try {
      return fn();
    } finally {
      currentEffect = prevEffect;
    }
  }
  
  // Lifecycle Hooks
  const mountCallbacks = [];
  const unmountCallbacks = [];
  let isMounted = false;
  
  function zenOnMount(fn) {
    if (isMounted) {
      const cleanup = fn();
      if (typeof cleanup === 'function') unmountCallbacks.push(cleanup);
    } else {
      mountCallbacks.push(fn);
    }
  }
  
  function zenOnUnmount(fn) {
    unmountCallbacks.push(fn);
  }
  
  function triggerMount() {
    isMounted = true;
    for (const cb of mountCallbacks) {
      const cleanup = cb();
      if (typeof cleanup === 'function') unmountCallbacks.push(cleanup);
    }
    mountCallbacks.length = 0;
  }
  
  function triggerUnmount() {
    isMounted = false;
    for (const cb of unmountCallbacks) {
      try { cb(); } catch(e) { console.error('[Zenith] Unmount error:', e); }
    }
    unmountCallbacks.length = 0;
  }
  
  // Expression Registry
  if (!window.__ZENITH_EXPRESSIONS__) {
    window.__ZENITH_EXPRESSIONS__ = new Map();
  }
  
  // Bindings
  const __zen_bindings = [];
  
  // Update text binding
  function updateTextBinding(node, expressionId, state) {
    const expression = window.__ZENITH_EXPRESSIONS__.get(expressionId);
    if (!expression) {
      console.warn('[Zenith] Expression ' + expressionId + ' not found');
      return;
    }
    try {
      const result = expression(state);
      if (result === null || result === undefined || result === false) {
        node.textContent = '';
      } else {
        node.textContent = String(result);
      }
    } catch (error) {
      console.error('[Zenith] Expression error:', error);
    }
  }
  
  // Update attribute binding
  function updateAttributeBinding(element, attrName, expressionId, state) {
    const expression = window.__ZENITH_EXPRESSIONS__.get(expressionId);
    if (!expression) return;
    try {
      const result = expression(state);
      if (attrName === 'class' || attrName === 'className') {
        element.className = String(result != null ? result : '');
      } else if (attrName === 'disabled' || attrName === 'checked') {
        if (result) element.setAttribute(attrName, '');
        else element.removeAttribute(attrName);
      } else {
        if (result === null || result === undefined || result === false) {
          element.removeAttribute(attrName);
        } else {
          element.setAttribute(attrName, String(result));
        }
      }
    } catch (error) {
      console.error('[Zenith] Attribute error:', error);
    }
  }
  
  // Hydrate
  function hydrate(state, loaderData, props, stores, container) {
    container = container || document;
    if (!state) state = {};
    
    window.__ZENITH_STATE__ = state;
    __zen_bindings.length = 0;
    
    // Text bindings
    const textPlaceholders = container.querySelectorAll('[data-zen-text]');
    for (let i = 0; i < textPlaceholders.length; i++) {
      const node = textPlaceholders[i];
      const expressionId = node.getAttribute('data-zen-text');
      if (!expressionId) continue;
      __zen_bindings.push({ node, type: 'text', expressionId });
      updateTextBinding(node, expressionId, state);
    }
    
    // Attribute bindings
    const attrSelectors = ['class', 'style', 'src', 'href', 'disabled', 'checked'];
    for (let s = 0; s < attrSelectors.length; s++) {
      const attrName = attrSelectors[s];
      const attrPlaceholders = container.querySelectorAll('[data-zen-attr-' + attrName + ']');
      for (let i = 0; i < attrPlaceholders.length; i++) {
        const node = attrPlaceholders[i];
        const expressionId = node.getAttribute('data-zen-attr-' + attrName);
        if (!expressionId) continue;
        __zen_bindings.push({ node, type: 'attribute', expressionId, attributeName: attrName });
        updateAttributeBinding(node, attrName, expressionId, state);
      }
    }
    
    // Bind events
    bindEvents(container);
    
    // Trigger mount
    triggerMount();
  }
  
  // Bind events
  function bindEvents(container) {
    container = container || document;
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
    
    for (let e = 0; e < eventTypes.length; e++) {
      const eventType = eventTypes[e];
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const handlerName = element.getAttribute('data-zen-' + eventType);
        if (!handlerName) continue;
        
        const handlerKey = '__zen_' + eventType + '_handler';
        const existingHandler = element[handlerKey];
        if (existingHandler) {
          element.removeEventListener(eventType, existingHandler);
        }
        
        const handler = function(event) {
          try {
            const handlerFunc = window[handlerName];
            if (typeof handlerFunc === 'function') {
              handlerFunc(event, element);
            } else {
              console.warn('[Zenith] Handler "' + handlerName + '" not found');
            }
          } catch (error) {
            console.error('[Zenith] Handler error:', error);
          }
        };
        
        element[handlerKey] = handler;
        element.addEventListener(eventType, handler);
      }
    }
  }
  
  // Update all bindings
  function update(state) {
    if (!state) state = window.__ZENITH_STATE__ || {};
    window.__ZENITH_STATE__ = state;
    
    for (let i = 0; i < __zen_bindings.length; i++) {
      const binding = __zen_bindings[i];
      if (binding.type === 'text') {
        updateTextBinding(binding.node, binding.expressionId, state);
      } else if (binding.type === 'attribute' && binding.attributeName) {
        updateAttributeBinding(binding.node, binding.attributeName, binding.expressionId, state);
      }
    }
  }
  
  // Cleanup
  function cleanup(container) {
    container = container || document;
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
    for (let e = 0; e < eventTypes.length; e++) {
      const eventType = eventTypes[e];
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const handlerKey = '__zen_' + eventType + '_handler';
        const handler = element[handlerKey];
        if (handler) {
          element.removeEventListener(eventType, handler);
          delete element[handlerKey];
        }
      }
    }
    __zen_bindings.length = 0;
    triggerUnmount();
  }
  
  // Export to window
  window.__zenith = {
    signal: zenSignal,
    state: zenState,
    effect: zenEffect,
    memo: zenMemo,
    ref: zenRef,
    batch: zenBatch,
    untrack: zenUntrack,
    onMount: zenOnMount,
    onUnmount: zenOnUnmount,
    triggerMount: triggerMount,
    triggerUnmount: triggerUnmount
  };
  
  window.__zenith_hydrate = hydrate;
  window.__zenith_update = update;
  window.__zenith_bindEvents = bindEvents;
  window.__zenith_cleanup = cleanup;
  
  window.zenithHydrate = hydrate;
  window.zenithUpdate = update;
  window.zenithBindEvents = bindEvents;
  window.zenithCleanup = cleanup;
  
  window.zenSignal = zenSignal;
  window.zenState = zenState;
  window.zenEffect = zenEffect;
  window.zenMemo = zenMemo;
  window.zenRef = zenRef;
  window.zenBatch = zenBatch;
  window.zenUntrack = zenUntrack;
  window.zenOnMount = zenOnMount;
  window.zenOnUnmount = zenOnUnmount;
  
  window.signal = zenSignal;
  window.state = zenState;
  window.effect = zenEffect;
  window.memo = zenMemo;
  window.ref = zenRef;
  window.batch = zenBatch;
  window.untrack = zenUntrack;
  window.onMount = zenOnMount;
  window.onUnmount = zenOnUnmount;
  
})();`
}

/**
 * Compile a .zen page in memory
 */
function compilePageInMemory(pagePath: string): CompiledPage | null {
    try {
        const result = compileZen(pagePath)

        if (!result.finalized) {
            throw new Error('Compilation failed: No finalized output')
        }

        const routeDef = generateRouteDefinition(pagePath, pagesDir)

        return {
            html: result.finalized.html,
            script: result.finalized.js,
            styles: result.finalized.styles,
            route: routeDef.path,
            lastModified: Date.now()
        }
    } catch (error: any) {
        console.error(`[Zenith Dev] Compilation error for ${pagePath}:`, error.message)
        return null
    }
}

/**
 * Generate full HTML page with injected runtime and page script
 */
function generateDevHTML(page: CompiledPage): string {
    const styles = page.styles.map(s => `<style>${s}</style>`).join('\n')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zenith Dev</title>
  ${styles}
</head>
<body>
  <div id="app">
    ${page.html}
  </div>
  
  <!-- Zenith Runtime -->
  <script src="/runtime.js"></script>
  
  <!-- Page Script with Auto-Hydration -->
  <script>
${page.script}

// Auto-hydrate on load
(function() {
  function autoHydrate() {
    const state = window.__ZENITH_STATE__ || {};
    
    if (typeof initializeState === 'function') {
      initializeState(state);
    }
    
    window.__ZENITH_STATE__ = state;
    
    // Expose state variables on window
    for (const key in state) {
      if (state.hasOwnProperty(key) && !window.hasOwnProperty(key)) {
        Object.defineProperty(window, key, {
          get: function() { return window.__ZENITH_STATE__[key]; },
          set: function(value) { 
            window.__ZENITH_STATE__[key] = value;
            if (window.__zenith_update) {
              window.__zenith_update(window.__ZENITH_STATE__);
            }
          },
          configurable: true
        });
      }
    }
    
    if (typeof injectStyles === 'function') {
      injectStyles();
    }
    
    const container = document.querySelector('#app') || document.body;
    if (window.__zenith_hydrate) {
      window.__zenith_hydrate(state, {}, {}, {}, container);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoHydrate);
  } else {
    setTimeout(autoHydrate, 0);
  }
})();
  </script>
</body>
</html>`
}

/**
 * Find .zen page file for a given route
 */
function findPageForRoute(route: string): string | null {
    // Try exact match
    const exactPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}.zen`)
    if (fs.existsSync(exactPath)) {
        return exactPath
    }

    // Try with /index.zen suffix
    const indexPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}/index.zen`)
    if (fs.existsSync(indexPath)) {
        return indexPath
    }

    return null
}

// Cached runtime JS
let cachedRuntimeJS: string | null = null

async function main() {
    console.log('🚀 Starting Zenith Dev Server...')
    console.log(`   Project: ${projectRoot}`)

    // Pre-generate runtime
    cachedRuntimeJS = generateRuntimeJS()

    serve({
        port,
        async fetch(req) {
            const url = new URL(req.url)
            const pathname = url.pathname
            const ext = path.extname(pathname).toLowerCase()

            // Serve runtime.js
            if (pathname === '/runtime.js') {
                return new Response(cachedRuntimeJS, {
                    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
                })
            }

            // Serve static assets from app/public or app/dist
            if (STATIC_EXTENSIONS.has(ext)) {
                const publicPath = path.join(appDir, 'public', pathname)
                const distPath = path.join(appDir, 'dist', pathname)

                for (const filePath of [publicPath, distPath]) {
                    const file = Bun.file(filePath)
                    if (await file.exists()) {
                        return new Response(file)
                    }
                }
                return new Response('Not found', { status: 404 })
            }

            // Handle .zen page routes
            const pagePath = findPageForRoute(pathname)
            if (pagePath) {
                // Check cache
                let cached = pageCache.get(pagePath)
                const stat = fs.statSync(pagePath)

                if (!cached || stat.mtimeMs > cached.lastModified) {
                    // Recompile
                    const compiled = compilePageInMemory(pagePath)
                    if (compiled) {
                        pageCache.set(pagePath, compiled)
                        cached = compiled
                    }
                }

                if (cached) {
                    const html = generateDevHTML(cached)
                    return new Response(html, {
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    })
                }
            }

            // Fallback: try to find index.zen
            const indexPath = path.join(pagesDir, 'index.zen')
            if (fs.existsSync(indexPath)) {
                let cached = pageCache.get(indexPath)
                const stat = fs.statSync(indexPath)

                if (!cached || stat.mtimeMs > cached.lastModified) {
                    const compiled = compilePageInMemory(indexPath)
                    if (compiled) {
                        pageCache.set(indexPath, compiled)
                        cached = compiled
                    }
                }

                if (cached) {
                    const html = generateDevHTML(cached)
                    return new Response(html, {
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    })
                }
            }

            return new Response('Page not found. Create app/pages/index.zen to get started.', {
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
            })
        }
    })

    console.log(`✅ Zenith dev server running at http://localhost:${port}`)
    console.log('   • In-memory compilation (no build required)')
    console.log('   • Auto-recompile on file changes')
    console.log('   Press Ctrl+C to stop')
}

main()
