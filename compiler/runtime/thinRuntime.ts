/**
 * Thin Runtime
 * 
 * Phase 8/9/10: Declarative runtime for DOM updates and event binding
 * 
 * This runtime is purely declarative - it:
 * - Updates DOM nodes by ID
 * - Binds event handlers
 * - Reacts to state changes
 * - Does NOT parse templates or expressions
 * - Does NOT use eval, new Function, or with(window)
 */

/**
 * Generate thin declarative runtime code
 * 
 * This runtime is minimal and safe - it only:
 * 1. Updates DOM nodes using pre-compiled expression functions
 * 2. Binds event handlers by ID
 * 3. Provides reactive state updates
 * 
 * All expressions are pre-compiled at build time.
 */
export function generateThinRuntime(): string {
  return `
// Zenith Thin Runtime (Phase 8/9/10)
// Purely declarative - no template parsing, no eval, no with(window)

(function() {
  'use strict';
  
  /**
   * Update a single DOM node with expression result
   * Node is identified by data-zen-text or data-zen-attr-* attribute
   */
  function updateNode(node, expressionId, state, loaderData, props, stores) {
    const expression = window.__ZENITH_EXPRESSIONS__.get(expressionId);
    if (!expression) {
      console.warn('[Zenith] Expression not found:', expressionId);
      return;
    }
    
    try {
      const result = expression(state, loaderData, props, stores);
      
      // Update node based on attribute type
      if (node.hasAttribute('data-zen-text')) {
        // Text node update
        if (result === null || result === undefined || result === false) {
          node.textContent = '';
        } else {
          node.textContent = String(result);
        }
      } else {
        // Attribute update - determine attribute name from data-zen-attr-*
        const attrMatch = Array.from(node.attributes)
          .find(attr => attr.name.startsWith('data-zen-attr-'));
        
        if (attrMatch) {
          const attrName = attrMatch.name.replace('data-zen-attr-', '');
          
          if (attrName === 'class' || attrName === 'className') {
            node.className = String(result ?? '');
          } else if (attrName === 'style') {
            if (typeof result === 'string') {
              node.setAttribute('style', result);
            }
          } else if (attrName === 'disabled' || attrName === 'checked') {
            if (result) {
              node.setAttribute(attrName, '');
            } else {
              node.removeAttribute(attrName);
            }
          } else {
            if (result != null && result !== false) {
              node.setAttribute(attrName, String(result));
            } else {
              node.removeAttribute(attrName);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Zenith] Error updating node:', expressionId, error);
    }
  }
  
  /**
   * Update all hydrated nodes
   * Called when state changes
   */
  function updateAll(state, loaderData, props, stores) {
    // Find all nodes with hydration markers
    const textNodes = document.querySelectorAll('[data-zen-text]');
    const attrNodes = document.querySelectorAll('[data-zen-attr-class], [data-zen-attr-style], [data-zen-attr-src], [data-zen-attr-href]');
    
    textNodes.forEach(node => {
      const expressionId = node.getAttribute('data-zen-text');
      if (expressionId) {
        updateNode(node, expressionId, state, loaderData, props, stores);
      }
    });
    
    attrNodes.forEach(node => {
      const attrMatch = Array.from(node.attributes)
        .find(attr => attr.name.startsWith('data-zen-attr-'));
      if (attrMatch) {
        const expressionId = attrMatch.value;
        if (expressionId) {
          updateNode(node, expressionId, state, loaderData, props, stores);
        }
      }
    });
  }
  
  /**
   * Bind event handlers
   * Handlers are pre-compiled and registered on window
   */
  function bindEvents(container) {
    container = container || document;
    
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown', 'mouseenter'];
    
    eventTypes.forEach(eventType => {
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      elements.forEach(element => {
        const handlerName = element.getAttribute('data-zen-' + eventType);
        if (!handlerName) return;
        
        // Remove existing handler
        const handlerKey = '__zen_' + eventType + '_handler';
        const existingHandler = element[handlerKey];
        if (existingHandler) {
          element.removeEventListener(eventType, existingHandler);
        }
        
        // Bind new handler (pre-compiled, registered on window)
        const handler = function(event) {
          const handlerFunc = window[handlerName];
          if (typeof handlerFunc === 'function') {
            handlerFunc(event, element);
          }
        };
        
        element[handlerKey] = handler;
        element.addEventListener(eventType, handler);
      });
    });
  }
  
  // Export to window
  if (typeof window !== 'undefined') {
    window.__zenith_updateAll = updateAll;
    window.__zenith_bindEvents = bindEvents;
  }
})();
`
}

