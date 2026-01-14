/**
 * Zenith Bundle Generator
 * 
 * Generates the shared client runtime bundle that gets served as:
 * - /assets/bundle.js in production
 * - /runtime.js in development
 * 
 * This is a cacheable, versioned file that contains:
 * - Reactivity primitives (zenSignal, zenState, zenEffect, etc.)
 * - Lifecycle hooks (zenOnMount, zenOnUnmount)
 * - Hydration functions (zenithHydrate)
 * - Event binding utilities
 */

/**
 * Generate the complete client runtime bundle
 * This is served as an external JS file, not inlined
 */
export function generateBundleJS(): string {
  return `/*!
 * Zenith Runtime v0.1.0
 * Shared client-side runtime for hydration and reactivity
 */
(function(global) {
  'use strict';
  
  // ============================================
  // Dependency Tracking System
  // ============================================
  
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
  
  // ============================================
  // zenSignal - Atomic reactive value
  // ============================================
  
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
  
  // ============================================
  // zenState - Deep reactive object with Proxy
  // ============================================
  
  function zenState(initialObj) {
    const subscribers = new Map();
    
    function getSubscribers(path) {
      if (!subscribers.has(path)) {
        subscribers.set(path, new Set());
      }
      return subscribers.get(path);
    }
    
    function createProxy(obj, path) {
      path = path || '';
      if (typeof obj !== 'object' || obj === null) return obj;
      
      return new Proxy(obj, {
        get: function(target, prop) {
          const propPath = path ? path + '.' + String(prop) : String(prop);
          trackDependency(getSubscribers(propPath));
          const value = target[prop];
          if (typeof value === 'object' && value !== null) {
            return createProxy(value, propPath);
          }
          return value;
        },
        set: function(target, prop, value) {
          const propPath = path ? path + '.' + String(prop) : String(prop);
          target[prop] = value;
          notifySubscribers(getSubscribers(propPath));
          if (path) {
            notifySubscribers(getSubscribers(path));
          }
          return true;
        }
      });
    }
    
    return createProxy(initialObj);
  }
  
  // ============================================
  // zenEffect - Auto-tracked side effect
  // ============================================
  
  function zenEffect(fn) {
    const effect = {
      fn: fn,
      dependencies: new Set(),
      run: function() {
        cleanupEffect(this);
        pushContext(this);
        try {
          this.fn();
        } finally {
          popContext();
        }
      },
      dispose: function() {
        cleanupEffect(this);
      }
    };
    
    effect.run();
    return function() { effect.dispose(); };
  }
  
  // ============================================
  // zenMemo - Cached computed value
  // ============================================
  
  function zenMemo(fn) {
    let cachedValue;
    let dirty = true;
    const subscribers = new Set();
    
    const effect = {
      dependencies: new Set(),
      run: function() {
        dirty = true;
        notifySubscribers(subscribers);
      }
    };
    
    function compute() {
      if (dirty) {
        cleanupEffect(effect);
        pushContext(effect);
        try {
          cachedValue = fn();
          dirty = false;
        } finally {
          popContext();
        }
      }
      trackDependency(subscribers);
      return cachedValue;
    }
    
    return compute;
  }
  
  // ============================================
  // zenRef - Non-reactive mutable container
  // ============================================
  
  function zenRef(initialValue) {
    return { current: initialValue !== undefined ? initialValue : null };
  }
  
  // ============================================
  // zenBatch - Batch updates
  // ============================================
  
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
  
  // ============================================
  // zenUntrack - Read without tracking
  // ============================================
  
  function zenUntrack(fn) {
    const prevEffect = currentEffect;
    currentEffect = null;
    try {
      return fn();
    } finally {
      currentEffect = prevEffect;
    }
  }
  
  // ============================================
  // Lifecycle Hooks
  // ============================================
  
  const mountCallbacks = [];
  const unmountCallbacks = [];
  let isMounted = false;
  
  function zenOnMount(fn) {
    if (isMounted) {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        unmountCallbacks.push(cleanup);
      }
    } else {
      mountCallbacks.push(fn);
    }
  }
  
  function zenOnUnmount(fn) {
    unmountCallbacks.push(fn);
  }
  
  function triggerMount() {
    isMounted = true;
    for (let i = 0; i < mountCallbacks.length; i++) {
      try {
        const cleanup = mountCallbacks[i]();
        if (typeof cleanup === 'function') {
          unmountCallbacks.push(cleanup);
        }
      } catch(e) {
        console.error('[Zenith] Mount error:', e);
      }
    }
    mountCallbacks.length = 0;
  }
  
  function triggerUnmount() {
    isMounted = false;
    for (let i = 0; i < unmountCallbacks.length; i++) {
      try { unmountCallbacks[i](); } catch(e) { console.error('[Zenith] Unmount error:', e); }
    }
    unmountCallbacks.length = 0;
  }
  
  // ============================================
  // Component Instance System
  // ============================================
  // Each component instance gets isolated state, effects, and lifecycles
  // Instances are tied to DOM elements via hydration markers
  
  const componentRegistry = {};
  
  function createComponentInstance(componentName, rootElement) {
    const instanceMountCallbacks = [];
    const instanceUnmountCallbacks = [];
    const instanceEffects = [];
    let instanceMounted = false;
    
    return {
      // DOM reference
      root: rootElement,
      
      // Lifecycle hooks (instance-scoped)
      onMount: function(fn) {
        if (instanceMounted) {
          const cleanup = fn();
          if (typeof cleanup === 'function') {
            instanceUnmountCallbacks.push(cleanup);
          }
        } else {
          instanceMountCallbacks.push(fn);
        }
      },
      onUnmount: function(fn) {
        instanceUnmountCallbacks.push(fn);
      },
      
      // Reactivity (uses global primitives but tracks for cleanup)
      signal: function(initial) {
        return zenSignal(initial);
      },
      state: function(initial) {
        return zenState(initial);
      },
      ref: function(initial) {
        return zenRef(initial);
      },
      effect: function(fn) {
        const cleanup = zenEffect(fn);
        instanceEffects.push(cleanup);
        return cleanup;
      },
      memo: function(fn) {
        return zenMemo(fn);
      },
      batch: function(fn) {
        zenBatch(fn);
      },
      untrack: function(fn) {
        return zenUntrack(fn);
      },
      
      // Lifecycle execution
      mount: function() {
        instanceMounted = true;
        for (let i = 0; i < instanceMountCallbacks.length; i++) {
          try {
            const cleanup = instanceMountCallbacks[i]();
            if (typeof cleanup === 'function') {
              instanceUnmountCallbacks.push(cleanup);
            }
          } catch(e) {
            console.error('[Zenith] Component mount error:', componentName, e);
          }
        }
        instanceMountCallbacks.length = 0;
      },
      unmount: function() {
        instanceMounted = false;
        // Cleanup effects
        for (let i = 0; i < instanceEffects.length; i++) {
          try { 
            if (typeof instanceEffects[i] === 'function') instanceEffects[i](); 
          } catch(e) { 
            console.error('[Zenith] Effect cleanup error:', e); 
          }
        }
        instanceEffects.length = 0;
        // Run unmount callbacks
        for (let i = 0; i < instanceUnmountCallbacks.length; i++) {
          try { instanceUnmountCallbacks[i](); } catch(e) { console.error('[Zenith] Unmount error:', e); }
        }
        instanceUnmountCallbacks.length = 0;
      }
    };
  }
  
  function defineComponent(name, factory) {
    componentRegistry[name] = factory;
  }
  
  function instantiateComponent(name, props, rootElement) {
    const factory = componentRegistry[name];
    if (!factory) {
      console.warn('[Zenith] Component not found:', name);
      return null;
    }
    return factory(props, rootElement);
  }
  
  /**
   * Hydrate components by discovering data-zen-component markers
   * This is the ONLY place component instantiation should happen
   */
  function hydrateComponents(container) {
    const componentElements = container.querySelectorAll('[data-zen-component]');
    
    for (let i = 0; i < componentElements.length; i++) {
      const el = componentElements[i];
      const componentName = el.getAttribute('data-zen-component');
      
      // Skip if already hydrated
      if (el.__zenith_instance) continue;
      
      // Parse props from data attribute if present
      const propsJson = el.getAttribute('data-zen-props') || '{}';
      let props = {};
      try {
        props = JSON.parse(propsJson);
      } catch(e) {
        console.warn('[Zenith] Invalid props JSON for', componentName);
      }
      
      // Instantiate component and bind to DOM element
      const instance = instantiateComponent(componentName, props, el);
      
      if (instance) {
        el.__zenith_instance = instance;
      }
    }
  }
  
  // ============================================
  // Expression Registry & Hydration
  // ============================================
  
  const expressionRegistry = new Map();
  
  function registerExpression(id, fn) {
    expressionRegistry.set(id, fn);
  }
  
  function getExpression(id) {
    return expressionRegistry.get(id);
  }
  
  function updateNode(node, exprId, pageState) {
    const expr = getExpression(exprId);
    if (!expr) return;
    
    zenEffect(function() {
      const result = expr(pageState);
      
      if (node.hasAttribute('data-zen-text')) {
        // Handle complex text/children results
        if (result === null || result === undefined || result === false) {
          node.textContent = '';
        } else if (typeof result === 'string') {
          if (result.trim().startsWith('<') && result.trim().endsWith('>')) {
            node.innerHTML = result;
          } else {
            node.textContent = result;
          }
        } else if (result instanceof Node) {
          node.innerHTML = '';
          node.appendChild(result);
        } else if (Array.isArray(result)) {
          node.innerHTML = '';
          const fragment = document.createDocumentFragment();
          result.flat(Infinity).forEach(item => {
            if (item instanceof Node) fragment.appendChild(item);
            else if (item != null && item !== false) fragment.appendChild(document.createTextNode(String(item)));
          });
          node.appendChild(fragment);
        } else {
          node.textContent = String(result);
        }
      } else {
        // Attribute update
        const attrNames = ['class', 'style', 'src', 'href', 'disabled', 'checked'];
        for (const attr of attrNames) {
          if (node.hasAttribute('data-zen-attr-' + attr)) {
            if (attr === 'class' || attr === 'className') {
              node.className = String(result || '');
            } else if (attr === 'disabled' || attr === 'checked') {
              if (result) node.setAttribute(attr, '');
              else node.removeAttribute(attr);
            } else {
              if (result != null && result !== false) node.setAttribute(attr, String(result));
              else node.removeAttribute(attr);
            }
          }
        }
      }
    });
  }

  /**
   * Hydrate a page with reactive bindings
   * Called after page HTML is in DOM
   */
  function zenithHydrate(pageState, container) {
    container = container || document;
    
    // Find all text expression placeholders
    const textNodes = container.querySelectorAll('[data-zen-text]');
    textNodes.forEach(el => updateNode(el, el.getAttribute('data-zen-text'), pageState));
    
    // Find all attribute expression placeholders
    const attrNodes = container.querySelectorAll('[data-zen-attr-class], [data-zen-attr-style], [data-zen-attr-src], [data-zen-attr-href]');
    attrNodes.forEach(el => {
      const attrMatch = Array.from(el.attributes).find(a => a.name.startsWith('data-zen-attr-'));
      if (attrMatch) updateNode(el, attrMatch.value, pageState);
    });
    
    // Wire up event handlers
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
    eventTypes.forEach(eventType => {
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      elements.forEach(el => {
        const handlerName = el.getAttribute('data-zen-' + eventType);
        if (handlerName && (global[handlerName] || getExpression(handlerName))) {
          el.addEventListener(eventType, function(e) {
            const handler = global[handlerName] || getExpression(handlerName);
            if (typeof handler === 'function') handler(e, el);
          });
        }
      });
    });
    
    // Trigger mount
    triggerMount();
  }
  
  // ============================================
  // zenith:content - Content Engine
  // ============================================

  const schemaRegistry = new Map();
  const builtInEnhancers = {
    readTime: (item) => {
      const wordsPerMinute = 200;
      const text = item.content || '';
      const wordCount = text.split(/\\s+/).length;
      const minutes = Math.ceil(wordCount / wordsPerMinute);
      return Object.assign({}, item, { readTime: minutes + ' min' });
    },
    wordCount: (item) => {
      const text = item.content || '';
      const wordCount = text.split(/\\s+/).length;
      return Object.assign({}, item, { wordCount: wordCount });
    }
  };

  async function applyEnhancers(item, enhancers) {
    let enrichedItem = Object.assign({}, item);
    for (const enhancer of enhancers) {
      if (typeof enhancer === 'string') {
        const fn = builtInEnhancers[enhancer];
        if (fn) enrichedItem = await fn(enrichedItem);
      } else if (typeof enhancer === 'function') {
        enrichedItem = await enhancer(enrichedItem);
      }
    }
    return enrichedItem;
  }

  class ZenCollection {
    constructor(items) {
      this.items = [...items];
      this.filters = [];
      this.sortField = null;
      this.sortOrder = 'desc';
      this.limitCount = null;
      this.selectedFields = null;
      this.enhancers = [];
      this._groupByFolder = false;
    }
    where(fn) { this.filters.push(fn); return this; }
    sortBy(field, order = 'desc') { this.sortField = field; this.sortOrder = order; return this; }
    limit(n) { this.limitCount = n; return this; }
    fields(f) { this.selectedFields = f; return this; }
    enhanceWith(e) { this.enhancers.push(e); return this; }
    groupByFolder() { this._groupByFolder = true; return this; }
    get() {
      let results = [...this.items];
      for (const filter of this.filters) results = results.filter(filter);
      if (this.sortField) {
        results.sort((a, b) => {
          const valA = a[this.sortField];
          const valB = b[this.sortField];
          if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      }
      if (this.limitCount !== null) results = results.slice(0, this.limitCount);
      
      // Apply enhancers synchronously if possible
      if (this.enhancers.length > 0) {
        results = results.map(item => {
          let enrichedItem = Object.assign({}, item);
          for (const enhancer of this.enhancers) {
            if (typeof enhancer === 'string') {
              const fn = builtInEnhancers[enhancer];
              if (fn) enrichedItem = fn(enrichedItem);
            } else if (typeof enhancer === 'function') {
              enrichedItem = enhancer(enrichedItem);
            }
          }
          return enrichedItem;
        });
      }
      
      if (this.selectedFields) {
        results = results.map(item => {
          const newItem = {};
          this.selectedFields.forEach(f => { newItem[f] = item[f]; });
          return newItem;
        });
      }
      
      // Group by folder if requested
      if (this._groupByFolder) {
        const groups = {};
        const groupOrder = [];
        for (const item of results) {
          // Extract folder from slug (e.g., "getting-started/installation" -> "getting-started")
          const slug = item.slug || item.id || '';
          const parts = slug.split('/');
          const folder = parts.length > 1 ? parts[0] : 'root';
          
          if (!groups[folder]) {
            groups[folder] = {
              id: folder,
              title: folder.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              items: []
            };
            groupOrder.push(folder);
          }
          groups[folder].items.push(item);
        }
        return groupOrder.map(f => groups[f]);
      }
      
      return results;
    }
  }

  function defineSchema(name, schema) { schemaRegistry.set(name, schema); }

  function zenCollection(collectionName) {
    const data = (global.__ZENITH_CONTENT__ && global.__ZENITH_CONTENT__[collectionName]) || [];
    return new ZenCollection(data);
  }

  // ============================================
  // useZenOrder - Documentation ordering & navigation
  // ============================================
  
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\\w\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  function getDocSlug(doc) {
    const slugOrId = String(doc.slug || doc.id || '');
    const parts = slugOrId.split('/');
    const filename = parts[parts.length - 1];
    return filename ? slugify(filename) : slugify(doc.title || 'untitled');
  }
  
  function processRawSections(rawSections) {
    const sections = (rawSections || []).map(function(rawSection) {
      const sectionSlug = slugify(rawSection.title || rawSection.id || 'section');
      const items = (rawSection.items || []).map(function(item) {
        return Object.assign({}, item, {
          slug: getDocSlug(item),
          sectionSlug: sectionSlug,
          isIntro: item.intro === true || (item.tags && item.tags.includes && item.tags.includes('intro'))
        });
      });
      
      // Sort items: intro first, then order, then alphabetical
      items.sort(function(a, b) {
        if (a.isIntro && !b.isIntro) return -1;
        if (!a.isIntro && b.isIntro) return 1;
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
      
      return {
        id: rawSection.id || sectionSlug,
        title: rawSection.title || 'Untitled',
        slug: sectionSlug,
        order: rawSection.order !== undefined ? rawSection.order : (rawSection.meta && rawSection.meta.order),
        hasIntro: items.some(function(i) { return i.isIntro; }),
        items: items
      };
    });
    
    // Sort sections: order → hasIntro → alphabetical
    sections.sort(function(a, b) {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      if (a.hasIntro && !b.hasIntro) return -1;
      if (!a.hasIntro && b.hasIntro) return 1;
      return a.title.localeCompare(b.title);
    });
    
    return sections;
  }
  
  function createZenOrder(rawSections) {
    const sections = processRawSections(rawSections);
    
    return {
      sections: sections,
      selectedSection: sections[0] || null,
      selectedDoc: sections[0] && sections[0].items[0] || null,
      
      getSectionBySlug: function(sectionSlug) {
        return sections.find(function(s) { return s.slug === sectionSlug; }) || null;
      },
      
      getDocBySlug: function(sectionSlug, docSlug) {
        var section = sections.find(function(s) { return s.slug === sectionSlug; });
        if (!section) return null;
        return section.items.find(function(d) { return d.slug === docSlug; }) || null;
      },
      
      getNextDoc: function(currentDoc) {
        if (!currentDoc) return null;
        var currentSection = sections.find(function(s) { return s.slug === currentDoc.sectionSlug; });
        if (!currentSection) return null;
        var idx = currentSection.items.findIndex(function(d) { return d.slug === currentDoc.slug; });
        if (idx < currentSection.items.length - 1) return currentSection.items[idx + 1];
        var secIdx = sections.findIndex(function(s) { return s.slug === currentSection.slug; });
        if (secIdx < sections.length - 1) return sections[secIdx + 1].items[0] || null;
        return null;
      },
      
      getPrevDoc: function(currentDoc) {
        if (!currentDoc) return null;
        var currentSection = sections.find(function(s) { return s.slug === currentDoc.sectionSlug; });
        if (!currentSection) return null;
        var idx = currentSection.items.findIndex(function(d) { return d.slug === currentDoc.slug; });
        if (idx > 0) return currentSection.items[idx - 1];
        var secIdx = sections.findIndex(function(s) { return s.slug === currentSection.slug; });
        if (secIdx > 0) {
          var prev = sections[secIdx - 1];
          return prev.items[prev.items.length - 1] || null;
        }
        return null;
      },
      
      buildDocUrl: function(sectionSlug, docSlug) {
        if (!docSlug || docSlug === 'index') return '/documentation/' + sectionSlug;
        return '/documentation/' + sectionSlug + '/' + docSlug;
      }
    };
  }

  // Virtual DOM Helper for JSX-style expressions
  function h(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'class' || key === 'className') {
          el.className = String(value || '');
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(el.style, value);
        } else if (value != null && value !== false) {
          el.setAttribute(key, String(value));
        }
      }
    }
    if (children != null && children !== false) {
      // Flatten nested arrays (from .map() calls)
      const childrenArray = Array.isArray(children) ? children.flat(Infinity) : [children];
      for (const child of childrenArray) {
        // Skip null, undefined, and false
        if (child == null || child === false) continue;
        
        if (typeof child === 'string') {
          // Check if string looks like HTML
          if (child.trim().startsWith('<') && child.trim().endsWith('>')) {
            // Render as HTML
            const wrapper = document.createElement('div');
            wrapper.innerHTML = child;
            while (wrapper.firstChild) {
              el.appendChild(wrapper.firstChild);
            }
          } else {
            el.appendChild(document.createTextNode(child));
          }
        } else if (typeof child === 'number') {
          el.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
          el.appendChild(child);
        } else if (Array.isArray(child)) {
          // Handle nested arrays (shouldn't happen after flat() but just in case)
          for (const c of child) {
            if (c instanceof Node) el.appendChild(c);
            else if (c != null && c !== false) el.appendChild(document.createTextNode(String(c)));
          }
        }
      }
    }
    return el;
  }

  // ============================================
  // Export to window.__zenith
  // ============================================
  
  global.__zenith = {
    // Reactivity primitives
    signal: zenSignal,
    state: zenState,
    effect: zenEffect,
    memo: zenMemo,
    ref: zenRef,
    batch: zenBatch,
    untrack: zenUntrack,
    // zenith:content
    defineSchema: defineSchema,
    zenCollection: zenCollection,
    // useZenOrder hook
    createZenOrder: createZenOrder,
    processRawSections: processRawSections,
    slugify: slugify,
    // Virtual DOM helper for JSX
    h: h,
    // Lifecycle
    onMount: zenOnMount,
    onUnmount: zenOnUnmount,
    // Internal hooks
    triggerMount: triggerMount,
    triggerUnmount: triggerUnmount,
    // Hydration
    hydrate: zenithHydrate,
    hydrateComponents: hydrateComponents,  // Marker-driven component instantiation
    registerExpression: registerExpression,
    getExpression: getExpression,
    // Component instance system
    createInstance: createComponentInstance,
    defineComponent: defineComponent,
    instantiate: instantiateComponent
  };
  
  // Expose with zen* prefix for direct usage
  global.zenSignal = zenSignal;
  global.zenState = zenState;
  global.zenEffect = zenEffect;
  global.zenMemo = zenMemo;
  global.zenRef = zenRef;
  global.zenBatch = zenBatch;
  global.zenUntrack = zenUntrack;
  global.zenOnMount = zenOnMount;
  global.zenOnUnmount = zenOnUnmount;
  global.zenithHydrate = zenithHydrate;
  
  // Clean aliases
  global.signal = zenSignal;
  global.state = zenState;
  global.effect = zenEffect;
  global.memo = zenMemo;
  global.ref = zenRef;
  global.batch = zenBatch;
  global.untrack = zenUntrack;
  global.onMount = zenOnMount;
  global.onUnmount = zenOnUnmount;
  
  // useZenOrder hook exports
  global.createZenOrder = createZenOrder;
  global.processRawSections = processRawSections;
  global.slugify = slugify;
  
  // ============================================
  // HMR Client (Development Only)
  // ============================================
  
  if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    let socket;
    function connectHMR() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/hmr');
      
      socket.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'reload') {
            console.log('[Zenith] HMR: Reloading page...');
            location.reload();
          } else if (data.type === 'style-update') {
            console.log('[Zenith] HMR: Updating style ' + data.url);
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            for (let i = 0; i < links.length; i++) {
              const link = links[i];
              const url = new URL(link.href);
              if (url.pathname === data.url) {
                link.href = data.url + '?t=' + Date.now();
                break;
              }
            }
          }
        } catch (e) {
          console.error('[Zenith] HMR Error:', e);
        }
      };
      
      socket.onclose = function() {
        console.log('[Zenith] HMR: Connection closed. Retrying in 2s...');
        setTimeout(connectHMR, 2000);
      };
    }
    
    // Connect unless explicitly disabled
    if (!window.__ZENITH_NO_HMR__) {
      connectHMR();
    }
  }
  
})(typeof window !== 'undefined' ? window : this);
`
}

/**
 * Generate a minified version of the bundle
 * For production builds
 */
export function generateMinifiedBundleJS(): string {
  // For now, return non-minified
  // TODO: Add minification via terser or similar
  return generateBundleJS()
}

/**
 * Get bundle version for cache busting
 */
export function getBundleVersion(): string {
  return '0.1.0'
}
