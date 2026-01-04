/**
 * Generate Hydration Bundle
 * 
 * Phase 5: Generates the complete runtime bundle including expressions and hydration code
 */

import type { ExpressionIR } from '../ir/types'
import { wrapExpression } from './wrapExpression'

/**
 * Generate the hydration runtime code as a string
 * This is the browser-side runtime that hydrates DOM placeholders
 */
export function generateHydrationRuntime(): string {
  return `
// Zenith Runtime Hydration Layer (Phase 5)
(function() {
  'use strict';
  
  // Expression registry - maps expression IDs to their evaluation functions
  if (typeof window !== 'undefined' && !window.__ZENITH_EXPRESSIONS__) {
    window.__ZENITH_EXPRESSIONS__ = new Map();
  }
  
  // Binding registry - tracks which DOM nodes are bound to which expressions
  const __zen_bindings = [];
  
  /**
   * Update a text binding
   * Phase 6: Accepts explicit data arguments
   */
  function updateTextBinding(node, expressionId, state, loaderData, props, stores) {
    try {
      const expression = window.__ZENITH_EXPRESSIONS__.get(expressionId);
      if (!expression) {
        console.warn('[Zenith] Expression ' + expressionId + ' not found in registry');
        return;
      }
      
      // Call expression with appropriate arguments based on function length
      const result = expression.length === 1
        ? expression(state)  // Legacy: state only
        : expression(state, loaderData, props, stores);  // Phase 6: explicit arguments
      
      // Handle different result types
      if (result === null || result === undefined || result === false) {
        node.textContent = '';
      } else if (typeof result === 'string' || typeof result === 'number') {
        node.textContent = String(result);
      } else if (result instanceof Node) {
        // Replace node with result node
        if (node.parentNode) {
          node.parentNode.replaceChild(result, node);
        }
      } else if (Array.isArray(result)) {
        // Handle array results (for map expressions)
        if (node.parentNode) {
          const fragment = document.createDocumentFragment();
          for (let i = 0; i < result.length; i++) {
            const item = result[i];
            if (item instanceof Node) {
              fragment.appendChild(item);
            } else {
              fragment.appendChild(document.createTextNode(String(item)));
            }
          }
          node.parentNode.replaceChild(fragment, node);
        }
      } else {
        node.textContent = String(result);
      }
    } catch (error) {
      console.error('[Zenith] Error evaluating expression ' + expressionId + ':', error);
      console.error('Expression ID:', expressionId, 'State:', state);
    }
  }
  
  /**
   * Update an attribute binding
   * Phase 6: Accepts explicit data arguments
   */
  function updateAttributeBinding(element, attributeName, expressionId, state, loaderData, props, stores) {
    try {
      const expression = window.__ZENITH_EXPRESSIONS__.get(expressionId);
      if (!expression) {
        console.warn('[Zenith] Expression ' + expressionId + ' not found in registry');
        return;
      }
      
      // Call expression with appropriate arguments based on function length
      const result = expression.length === 1
        ? expression(state)  // Legacy: state only
        : expression(state, loaderData, props, stores);  // Phase 6: explicit arguments
      
      // Handle different attribute types
      if (attributeName === 'class' || attributeName === 'className') {
        element.className = String(result != null ? result : '');
      } else if (attributeName === 'style') {
        if (typeof result === 'string') {
          element.setAttribute('style', result);
        } else if (result && typeof result === 'object') {
          // Handle style object
          const styleStr = Object.keys(result).map(function(key) {
            return key + ': ' + result[key];
          }).join('; ');
          element.setAttribute('style', styleStr);
        }
      } else if (attributeName === 'disabled' || attributeName === 'checked' || attributeName === 'readonly') {
        // Boolean attributes
        if (result) {
          element.setAttribute(attributeName, '');
        } else {
          element.removeAttribute(attributeName);
        }
      } else {
        // Regular attributes
        if (result === null || result === undefined || result === false) {
          element.removeAttribute(attributeName);
        } else {
          element.setAttribute(attributeName, String(result));
        }
      }
    } catch (error) {
      console.error('[Zenith] Error updating attribute ' + attributeName + ' with expression ' + expressionId + ':', error);
      console.error('Expression ID:', expressionId, 'State:', state);
    }
  }
  
  /**
   * Hydrate static HTML with dynamic expressions
   * Phase 6: Accepts explicit loaderData, props, stores arguments
   */
  function hydrate(state, loaderData, props, stores, container) {
    if (!state) {
      console.warn('[Zenith] hydrate called without state object');
      return;
    }
    
    // Handle optional arguments (backwards compatibility)
    if (typeof container === 'undefined' && typeof stores === 'object' && stores && !stores.nodeType) {
      // Called as hydrate(state, loaderData, props, stores, container)
      container = document;
    } else if (typeof props === 'object' && props && !props.nodeType && typeof stores === 'undefined') {
      // Called as hydrate(state, loaderData, props) - container is props
      container = props;
      props = loaderData;
      loaderData = undefined;
      stores = undefined;
    } else if (typeof loaderData === 'object' && loaderData && loaderData.nodeType) {
      // Called as hydrate(state, container) - legacy signature
      container = loaderData;
      loaderData = undefined;
      props = undefined;
      stores = undefined;
    } else {
      container = container || document;
    }
    
    // Default empty objects for missing arguments
    loaderData = loaderData || {};
    props = props || {};
    stores = stores || {};
    
    // Store state and data globally for event handlers
    if (typeof window !== 'undefined') {
      window.__ZENITH_STATE__ = state;
      window.__ZENITH_LOADER_DATA__ = loaderData;
      window.__ZENITH_PROPS__ = props;
      window.__ZENITH_STORES__ = stores;
    }
    
    // Clear existing bindings
    __zen_bindings.length = 0;
    
    // Find all text expression placeholders
    const textPlaceholders = container.querySelectorAll('[data-zen-text]');
    for (let i = 0; i < textPlaceholders.length; i++) {
      const node = textPlaceholders[i];
      const expressionId = node.getAttribute('data-zen-text');
      if (!expressionId) continue;
      
      __zen_bindings.push({
        node: node,
        type: 'text',
        expressionId: expressionId
      });
      
      updateTextBinding(node, expressionId, state, loaderData, props, stores);
    }
    
    // Find all attribute expression placeholders
    const attrSelectors = [
      '[data-zen-attr-class]',
      '[data-zen-attr-style]',
      '[data-zen-attr-src]',
      '[data-zen-attr-href]',
      '[data-zen-attr-disabled]',
      '[data-zen-attr-checked]'
    ];
    
    for (let s = 0; s < attrSelectors.length; s++) {
      const attrPlaceholders = container.querySelectorAll(attrSelectors[s]);
      for (let i = 0; i < attrPlaceholders.length; i++) {
        const node = attrPlaceholders[i];
        if (!(node instanceof Element)) continue;
        
        // Extract attribute name from selector
        const attrMatch = attrSelectors[s].match(/data-zen-attr-(\\w+)/);
        if (!attrMatch) continue;
        const attrName = attrMatch[1];
        
        const expressionId = node.getAttribute('data-zen-attr-' + attrName);
        if (!expressionId) continue;
        
        __zen_bindings.push({
          node: node,
          type: 'attribute',
          attributeName: attrName,
          expressionId: expressionId
        });
        
        updateAttributeBinding(node, attrName, expressionId, state, loaderData, props, stores);
      }
    }
    
    // Bind event handlers
    bindEvents(container);
  }
  
  /**
   * Bind event handlers to DOM elements
   */
  function bindEvents(container) {
    container = container || document;
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
    
    for (let e = 0; e < eventTypes.length; e++) {
      const eventType = eventTypes[e];
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (!(element instanceof Element)) continue;
        
        const handlerName = element.getAttribute('data-zen-' + eventType);
        if (!handlerName) continue;
        
        // Remove existing listener if any (to avoid duplicates)
        const handlerKey = '__zen_' + eventType + '_handler';
        const existingHandler = element[handlerKey];
        if (existingHandler) {
          element.removeEventListener(eventType, existingHandler);
        }
        
        // Create new handler
        const handler = function(event) {
          try {
            // Get handler function from window (functions are registered on window)
            const handlerFunc = window[handlerName];
            if (typeof handlerFunc === 'function') {
              handlerFunc(event, element);
            } else {
              console.warn('[Zenith] Event handler "' + handlerName + '" not found for ' + eventType + ' event');
            }
          } catch (error) {
            console.error('[Zenith] Error executing event handler "' + handlerName + '":', error);
          }
        };
        
        // Store handler reference to allow cleanup
        element[handlerKey] = handler;
        
        element.addEventListener(eventType, handler);
      }
    }
  }
  
  /**
   * Update all bindings when state changes
   * Phase 6: Accepts explicit data arguments
   */
  function update(state, loaderData, props, stores) {
    if (!state) {
      console.warn('[Zenith] update called without state object');
      return;
    }
    
    // Handle optional arguments (backwards compatibility)
    if (typeof loaderData === 'undefined') {
      loaderData = window.__ZENITH_LOADER_DATA__ || {};
      props = window.__ZENITH_PROPS__ || {};
      stores = window.__ZENITH_STORES__ || {};
    } else {
      loaderData = loaderData || {};
      props = props || {};
      stores = stores || {};
    }
    
    // Update global state and data
    if (typeof window !== 'undefined') {
      window.__ZENITH_STATE__ = state;
      window.__ZENITH_LOADER_DATA__ = loaderData;
      window.__ZENITH_PROPS__ = props;
      window.__ZENITH_STORES__ = stores;
    }
    
    // Update all tracked bindings
    for (let i = 0; i < __zen_bindings.length; i++) {
      const binding = __zen_bindings[i];
      if (binding.type === 'text') {
        updateTextBinding(binding.node, binding.expressionId, state, loaderData, props, stores);
      } else if (binding.type === 'attribute' && binding.attributeName) {
        if (binding.node instanceof Element) {
          updateAttributeBinding(binding.node, binding.attributeName, binding.expressionId, state, loaderData, props, stores);
        }
      }
    }
  }
  
  /**
   * Clear all bindings and event listeners
   */
  function cleanup(container) {
    container = container || document;
    
    // Remove event listeners
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
    for (let e = 0; e < eventTypes.length; e++) {
      const eventType = eventTypes[e];
      const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (!(element instanceof Element)) continue;
        const handlerKey = '__zen_' + eventType + '_handler';
        const handler = element[handlerKey];
        if (handler) {
          element.removeEventListener(eventType, handler);
          delete element[handlerKey];
        }
      }
    }
    
    // Clear bindings
    __zen_bindings.length = 0;
  }
  
  // Export functions to window
  if (typeof window !== 'undefined') {
    window.__zenith_hydrate = hydrate;
    window.__zenith_bindEvents = bindEvents;
    window.__zenith_update = update;
    window.__zenith_cleanup = cleanup;
  }
})();
`
}

/**
 * Generate expression registry initialization code
 */
export function generateExpressionRegistry(expressions: ExpressionIR[]): string {
  if (expressions.length === 0) {
    return `
  // No expressions to register
  if (typeof window !== 'undefined' && window.__ZENITH_EXPRESSIONS__) {
    // Registry already initialized
  }`
  }
  
  const registryCode = expressions.map(expr => {
    return `  window.__ZENITH_EXPRESSIONS__.set('${expr.id}', ${expr.id});`
  }).join('\n')
  
  return `
  // Initialize expression registry
  if (typeof window !== 'undefined') {
    if (!window.__ZENITH_EXPRESSIONS__) {
      window.__ZENITH_EXPRESSIONS__ = new Map();
    }
${registryCode}
  }`
}

