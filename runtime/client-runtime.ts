/**
 * Zenith Client Runtime
 * 
 * Shared runtime module served as /runtime.js in dev mode.
 * Includes:
 * - Reactivity primitives (signal, state, effect, memo)
 * - Lifecycle hooks (zenOnMount, zenOnUnmount)
 * - Event wiring
 * - Hydration functions
 * 
 * This is a standalone module that can be imported/served separately
 * from page-specific code.
 */

// ============================================
// Dependency Tracking System
// ============================================

let currentEffect: any = null;
const effectStack: any[] = [];
let batchDepth = 0;
const pendingEffects = new Set<any>();

function pushContext(effect: any) {
    effectStack.push(currentEffect);
    currentEffect = effect;
}

function popContext() {
    currentEffect = effectStack.pop() || null;
}

function trackDependency(subscribers: Set<any>) {
    if (currentEffect) {
        subscribers.add(currentEffect);
        currentEffect.dependencies.add(subscribers);
    }
}

function notifySubscribers(subscribers: Set<any>) {
    const effects = [...subscribers];
    for (const effect of effects) {
        if (batchDepth > 0) {
            pendingEffects.add(effect);
        } else {
            effect.run();
        }
    }
}

function cleanupEffect(effect: any) {
    for (const deps of effect.dependencies) {
        deps.delete(effect);
    }
    effect.dependencies.clear();
}

// ============================================
// zenSignal - Atomic reactive value
// ============================================

export function zenSignal<T>(initialValue: T): (newValue?: T) => T {
    let value = initialValue;
    const subscribers = new Set<any>();

    function signal(newValue?: T): T {
        if (arguments.length === 0) {
            trackDependency(subscribers);
            return value;
        }
        if (newValue !== value) {
            value = newValue as T;
            notifySubscribers(subscribers);
        }
        return value;
    }

    return signal;
}

// ============================================
// zenState - Deep reactive object with Proxy
// ============================================

export function zenState<T extends object>(initialObj: T): T {
    const subscribers = new Map<string, Set<any>>();

    function getSubscribers(path: string): Set<any> {
        if (!subscribers.has(path)) {
            subscribers.set(path, new Set());
        }
        return subscribers.get(path)!;
    }

    function createProxy(obj: any, parentPath: string = ''): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        return new Proxy(obj, {
            get(target, prop) {
                if (typeof prop === 'symbol') return target[prop];

                const path = parentPath ? `${parentPath}.${String(prop)}` : String(prop);
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

                const path = parentPath ? `${parentPath}.${String(prop)}` : String(prop);
                const oldValue = target[prop];

                if (oldValue !== newValue) {
                    target[prop] = newValue;

                    // Notify this path
                    const subs = subscribers.get(path);
                    if (subs) notifySubscribers(subs);

                    // Notify parent paths
                    const parts = path.split('.');
                    for (let i = parts.length - 1; i >= 0; i--) {
                        const parentPath = parts.slice(0, i).join('.');
                        if (parentPath) {
                            const parentSubs = subscribers.get(parentPath);
                            if (parentSubs) notifySubscribers(parentSubs);
                        }
                    }
                }
                return true;
            }
        });
    }

    return createProxy(initialObj);
}

// ============================================
// zenEffect - Reactive effect
// ============================================

export function zenEffect(fn: () => void | (() => void)): () => void {
    let cleanup: (() => void) | void;

    const effect = {
        dependencies: new Set<Set<any>>(),
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

// ============================================
// zenMemo - Computed/derived value
// ============================================

export function zenMemo<T>(fn: () => T): () => T {
    let value: T;
    let dirty = true;
    const subscribers = new Set<any>();

    const effect = {
        dependencies: new Set<Set<any>>(),
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
        if (dirty) {
            effect.run();
        }
        return value;
    };
}

// ============================================
// zenRef - Non-reactive mutable container
// ============================================

export function zenRef<T>(initialValue?: T): { current: T | null } {
    return { current: initialValue !== undefined ? initialValue : null };
}

// ============================================
// zenBatch - Batch updates
// ============================================

export function zenBatch(fn: () => void): void {
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

export function zenUntrack<T>(fn: () => T): T {
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

const mountCallbacks: Array<() => void | (() => void)> = [];
const unmountCallbacks: Array<() => void> = [];
let isMounted = false;

export function zenOnMount(fn: () => void | (() => void)): void {
    if (isMounted) {
        const cleanup = fn();
        if (typeof cleanup === 'function') {
            unmountCallbacks.push(cleanup);
        }
    } else {
        mountCallbacks.push(fn);
    }
}

export function zenOnUnmount(fn: () => void): void {
    unmountCallbacks.push(fn);
}

export function triggerMount(): void {
    isMounted = true;
    for (const cb of mountCallbacks) {
        const cleanup = cb();
        if (typeof cleanup === 'function') {
            unmountCallbacks.push(cleanup);
        }
    }
    mountCallbacks.length = 0;
}

export function triggerUnmount(): void {
    isMounted = false;
    for (const cb of unmountCallbacks) {
        try { cb(); } catch (e) { console.error('[Zenith] Unmount error:', e); }
    }
    unmountCallbacks.length = 0;
}

// ============================================
// Expression Registry
// ============================================

const expressionRegistry = new Map<string, (state: any) => any>();

export function registerExpression(id: string, fn: (state: any) => any): void {
    expressionRegistry.set(id, fn);
}

export function getExpression(id: string): ((state: any) => any) | undefined {
    return expressionRegistry.get(id);
}

// ============================================
// Hydration Functions
// ============================================

const bindings: Array<{ node: Element; type: string; expressionId: string; attributeName?: string }> = [];

export function hydrate(state: any, container?: Element | Document): void {
    const root = container || document;

    // Clear existing bindings
    bindings.length = 0;

    // Find all text expression placeholders
    const textPlaceholders = root.querySelectorAll('[data-zen-text]');
    textPlaceholders.forEach((node) => {
        const expressionId = node.getAttribute('data-zen-text');
        if (!expressionId) return;

        bindings.push({ node: node as Element, type: 'text', expressionId });
        updateTextBinding(node as Element, expressionId, state);
    });

    // Find attribute bindings
    const attrSelectors = ['class', 'style', 'src', 'href', 'disabled', 'checked'];
    for (const attr of attrSelectors) {
        const attrPlaceholders = root.querySelectorAll(`[data-zen-attr-${attr}]`);
        attrPlaceholders.forEach((node) => {
            const expressionId = node.getAttribute(`data-zen-attr-${attr}`);
            if (!expressionId) return;

            bindings.push({ node: node as Element, type: 'attribute', expressionId, attributeName: attr });
            updateAttributeBinding(node as Element, attr, expressionId, state);
        });
    }

    // Bind event handlers
    bindEvents(root);

    // Trigger mount
    triggerMount();
}

function updateTextBinding(node: Element, expressionId: string, state: any): void {
    const expression = expressionRegistry.get(expressionId);
    if (!expression) {
        console.warn(`[Zenith] Expression ${expressionId} not found`);
        return;
    }

    try {
        const result = expression(state);
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
    } catch (error) {
        console.error(`[Zenith] Error evaluating expression ${expressionId}:`, error);
    }
}

function updateAttributeBinding(element: Element, attrName: string, expressionId: string, state: any): void {
    const expression = expressionRegistry.get(expressionId);
    if (!expression) return;

    try {
        const result = expression(state);

        if (attrName === 'class' || attrName === 'className') {
            (element as HTMLElement).className = String(result ?? '');
        } else if (attrName === 'style' && typeof result === 'object') {
            const styleStr = Object.entries(result).map(([k, v]) => `${k}: ${v}`).join('; ');
            element.setAttribute('style', styleStr);
        } else if (['disabled', 'checked', 'readonly'].includes(attrName)) {
            if (result) {
                element.setAttribute(attrName, '');
            } else {
                element.removeAttribute(attrName);
            }
        } else {
            if (result === null || result === undefined || result === false) {
                element.removeAttribute(attrName);
            } else {
                element.setAttribute(attrName, String(result));
            }
        }
    } catch (error) {
        console.error(`[Zenith] Error updating attribute ${attrName}:`, error);
    }
}

export function update(state: any): void {
    for (const binding of bindings) {
        if (binding.type === 'text') {
            updateTextBinding(binding.node, binding.expressionId, state);
        } else if (binding.type === 'attribute' && binding.attributeName) {
            updateAttributeBinding(binding.node, binding.attributeName, binding.expressionId, state);
        }
    }
}

export function bindEvents(container: Element | Document): void {
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];

    for (const eventType of eventTypes) {
        const elements = container.querySelectorAll(`[data-zen-${eventType}]`);

        elements.forEach((element) => {
            const handlerName = element.getAttribute(`data-zen-${eventType}`);
            if (!handlerName) return;

            // Remove existing handler if any
            const handlerKey = `__zen_${eventType}_handler`;
            const existingHandler = (element as any)[handlerKey];
            if (existingHandler) {
                element.removeEventListener(eventType, existingHandler);
            }

            // Create new handler
            const handler = (event: Event) => {
                try {
                    // Try window first, then expression registry
                    let handlerFunc = (window as any)[handlerName];
                    if (typeof handlerFunc !== 'function') {
                        handlerFunc = (window as any).__ZENITH_EXPRESSIONS__?.get(handlerName);
                    }

                    if (typeof handlerFunc === 'function') {
                        handlerFunc(event, element);
                    } else {
                        console.warn(`[Zenith] Event handler "${handlerName}" not found`);
                    }
                } catch (error) {
                    console.error(`[Zenith] Error executing handler "${handlerName}":`, error);
                }
            };

            (element as any)[handlerKey] = handler;
            element.addEventListener(eventType, handler);
        });
    }
}

export function cleanup(container?: Element | Document): void {
    const root = container || document;
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];

    for (const eventType of eventTypes) {
        const elements = root.querySelectorAll(`[data-zen-${eventType}]`);
        elements.forEach((element) => {
            const handlerKey = `__zen_${eventType}_handler`;
            const handler = (element as any)[handlerKey];
            if (handler) {
                element.removeEventListener(eventType, handler);
                delete (element as any)[handlerKey];
            }
        });
    }

    bindings.length = 0;
    triggerUnmount();
}

// ============================================
// Plugin Runtime Data Access
// ============================================

/**
 * Access plugin data from the neutral envelope
 * 
 * Plugins use this to retrieve their data at runtime.
 * The CLI injected this data via window.__ZENITH_PLUGIN_DATA__
 * 
 * @param namespace - Plugin namespace (e.g., 'content', 'router')
 * @returns The plugin's data, or undefined if not present
 */
export function getPluginRuntimeData(namespace: string): unknown {
    if (typeof window === 'undefined') return undefined;
    const envelope = (window as any).__ZENITH_PLUGIN_DATA__;
    return envelope?.[namespace];
}

// ============================================
// Browser Globals Setup
// ============================================

export function setupGlobals(): void {
    if (typeof window === 'undefined') return;

    const w = window as any;

    // Zenith namespace
    w.__zenith = {
        signal: zenSignal,
        state: zenState,
        effect: zenEffect,
        memo: zenMemo,
        ref: zenRef,
        batch: zenBatch,
        untrack: zenUntrack,
        onMount: zenOnMount,
        onUnmount: zenOnUnmount,
        triggerMount,
        triggerUnmount,
        getPluginData: getPluginRuntimeData  // Access plugin data from envelope
    };

    // Expression registry
    w.__ZENITH_EXPRESSIONS__ = expressionRegistry;

    // Hydration functions
    w.__zenith_hydrate = hydrate;
    w.__zenith_update = update;
    w.__zenith_bindEvents = bindEvents;
    w.__zenith_cleanup = cleanup;
    w.zenithHydrate = hydrate;
    w.zenithUpdate = update;
    w.zenithBindEvents = bindEvents;
    w.zenithCleanup = cleanup;

    // Direct primitives
    w.zenSignal = zenSignal;
    w.zenState = zenState;
    w.zenEffect = zenEffect;
    w.zenMemo = zenMemo;
    w.zenRef = zenRef;
    w.zenBatch = zenBatch;
    w.zenUntrack = zenUntrack;
    w.zenOnMount = zenOnMount;
    w.zenOnUnmount = zenOnUnmount;

    // Short aliases
    w.signal = zenSignal;
    w.state = zenState;
    w.effect = zenEffect;
    w.memo = zenMemo;
    w.ref = zenRef;
    w.batch = zenBatch;
    w.untrack = zenUntrack;
    w.onMount = zenOnMount;
    w.onUnmount = zenOnUnmount;
}

// Auto-setup globals on import
setupGlobals();
