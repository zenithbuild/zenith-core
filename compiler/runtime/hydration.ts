/**
 * Runtime Hydration Layer
 * 
 * Phase 5: Browser-side runtime that hydrates static HTML with dynamic expressions
 * 
 * This runtime:
 * - Locates DOM placeholders (data-zen-text, data-zen-attr-*)
 * - Evaluates precompiled expressions against state
 * - Updates DOM textContent, attributes, and properties
 * - Binds event handlers
 * - Handles reactive state updates
 */

/**
 * Expression registry - maps expression IDs to their evaluation functions
 * Populated at runtime with compiled expressions
 */
declare global {
  interface Window {
    __ZENITH_EXPRESSIONS__?: Map<string, (state: any) => any>
    __ZENITH_STATE__?: any
  }
}

/**
 * Binding registry - tracks which DOM nodes are bound to which expressions
 */
interface Binding {
  node: Node
  type: 'text' | 'attribute'
  attributeName?: string
  expressionId: string
}

const bindings: Binding[] = []

/**
 * Hydrate static HTML with dynamic expressions
 * 
 * @param state - The state object to evaluate expressions against
 * @param container - The container element to hydrate (defaults to document)
 */
export function hydrate(state: any, container: Document | Element = document): void {
  if (!state) {
    console.warn('[Zenith] hydrate called without state object')
    return
  }
  
  // Store state globally for event handlers
  if (typeof window !== 'undefined') {
    window.__ZENITH_STATE__ = state
  }
  
  // Clear existing bindings
  bindings.length = 0
  
    // Find all text expression placeholders
    const textPlaceholders = container.querySelectorAll('[data-zen-text]')
    for (let i = 0; i < textPlaceholders.length; i++) {
      const node = textPlaceholders[i]
      if (!node) continue
      const expressionId = node.getAttribute('data-zen-text')
      if (!expressionId) continue
      
      bindings.push({
        node,
        type: 'text',
        expressionId
      })
      
      updateTextBinding(node, expressionId, state)
    }
  
  // Find all attribute expression placeholders
  const attrPlaceholders = container.querySelectorAll('[data-zen-attr-class], [data-zen-attr-style], [data-zen-attr-src], [data-zen-attr-href], [data-zen-attr-disabled], [data-zen-attr-checked]')
  
  for (let i = 0; i < attrPlaceholders.length; i++) {
    const node = attrPlaceholders[i]
    if (!(node instanceof Element)) continue
    
    // Check each possible attribute
    const attrNames = ['class', 'style', 'src', 'href', 'disabled', 'checked']
    for (const attrName of attrNames) {
      const expressionId = node.getAttribute(`data-zen-attr-${attrName}`)
      if (!expressionId) continue
      
      bindings.push({
        node,
        type: 'attribute',
        attributeName: attrName,
        expressionId
      })
      
      updateAttributeBinding(node, attrName, expressionId, state)
    }
  }
  
  // Bind event handlers
  bindEvents(container)
}

/**
 * Update a text binding
 */
function updateTextBinding(node: Node, expressionId: string, state: any): void {
  try {
    const expression = window.__ZENITH_EXPRESSIONS__?.get(expressionId)
    if (!expression) {
      console.warn(`[Zenith] Expression ${expressionId} not found in registry`)
      return
    }
    
    const result = expression(state)
    
    // Handle different result types
    if (result === null || result === undefined || result === false) {
      node.textContent = ''
    } else if (typeof result === 'string' || typeof result === 'number') {
      node.textContent = String(result)
    } else if (result instanceof Node) {
      // Replace node with result node
      if (node.parentNode) {
        node.parentNode.replaceChild(result, node)
      }
    } else if (Array.isArray(result)) {
      // Handle array results (for map expressions)
      if (node.parentNode) {
        const fragment = document.createDocumentFragment()
        for (const item of result) {
          if (item instanceof Node) {
            fragment.appendChild(item)
          } else {
            fragment.appendChild(document.createTextNode(String(item)))
          }
        }
        node.parentNode.replaceChild(fragment, node)
      }
    } else {
      node.textContent = String(result)
    }
  } catch (error: any) {
    console.error(`[Zenith] Error evaluating expression ${expressionId}:`, error)
    console.error('Expression ID:', expressionId, 'State:', state)
  }
}

/**
 * Update an attribute binding
 */
function updateAttributeBinding(
  element: Element,
  attributeName: string,
  expressionId: string,
  state: any
): void {
  try {
    const expression = window.__ZENITH_EXPRESSIONS__?.get(expressionId)
    if (!expression) {
      console.warn(`[Zenith] Expression ${expressionId} not found in registry`)
      return
    }
    
    const result = expression(state)
    
    // Handle different attribute types
    if (attributeName === 'class' || attributeName === 'className') {
      element.className = String(result ?? '')
    } else if (attributeName === 'style') {
      if (typeof result === 'string') {
        element.setAttribute('style', result)
      } else if (result && typeof result === 'object') {
        // Handle style object
        const styleStr = Object.entries(result)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')
        element.setAttribute('style', styleStr)
      }
    } else if (attributeName === 'disabled' || attributeName === 'checked' || attributeName === 'readonly') {
      // Boolean attributes
      if (result) {
        element.setAttribute(attributeName, '')
      } else {
        element.removeAttribute(attributeName)
      }
    } else {
      // Regular attributes
      if (result === null || result === undefined || result === false) {
        element.removeAttribute(attributeName)
      } else {
        element.setAttribute(attributeName, String(result))
      }
    }
  } catch (error: any) {
    console.error(`[Zenith] Error updating attribute ${attributeName} with expression ${expressionId}:`, error)
    console.error('Expression ID:', expressionId, 'State:', state)
  }
}

/**
 * Bind event handlers to DOM elements
 * 
 * @param container - The container element to bind events in (defaults to document)
 */
export function bindEvents(container: Document | Element = document): void {
  const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown']
  
  for (const eventType of eventTypes) {
    const elements = container.querySelectorAll(`[data-zen-${eventType}]`)
    
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      if (!(element instanceof Element)) continue
      
      const handlerName = element.getAttribute(`data-zen-${eventType}`)
      if (!handlerName) continue
      
      // Remove existing listener if any (to avoid duplicates)
      const existingHandler = (element as any)[`__zen_${eventType}_handler`]
      if (existingHandler) {
        element.removeEventListener(eventType, existingHandler)
      }
      
      // Create new handler
      const handler = (event: Event) => {
        try {
          // Get handler function from window (functions are registered on window)
          const handlerFunc = (window as any)[handlerName]
          if (typeof handlerFunc === 'function') {
            handlerFunc(event, element)
          } else {
            console.warn(`[Zenith] Event handler "${handlerName}" not found for ${eventType} event`)
          }
        } catch (error: any) {
          console.error(`[Zenith] Error executing event handler "${handlerName}":`, error)
        }
      }
      
      // Store handler reference to allow cleanup
      ;(element as any)[`__zen_${eventType}_handler`] = handler
      
      element.addEventListener(eventType, handler)
    }
  }
}

/**
 * Update all bindings when state changes
 * 
 * @param state - The new state object
 */
export function update(state: any): void {
  if (!state) {
    console.warn('[Zenith] update called without state object')
    return
  }
  
  // Update global state
  if (typeof window !== 'undefined') {
    window.__ZENITH_STATE__ = state
  }
  
  // Update all tracked bindings
  for (const binding of bindings) {
    if (binding.type === 'text') {
      updateTextBinding(binding.node, binding.expressionId, state)
    } else if (binding.type === 'attribute' && binding.attributeName) {
      if (binding.node instanceof Element) {
        updateAttributeBinding(binding.node, binding.attributeName, binding.expressionId, state)
      }
    }
  }
}

/**
 * Initialize the expression registry
 * Called once when the runtime loads
 * 
 * @param expressions - Map of expression IDs to evaluation functions
 */
export function initExpressions(expressions: Map<string, (state: any) => any>): void {
  if (typeof window !== 'undefined') {
    window.__ZENITH_EXPRESSIONS__ = expressions
  }
}

/**
 * Clear all bindings and event listeners
 * Useful for cleanup when navigating away
 */
export function cleanup(container: Document | Element = document): void {
    // Remove event listeners
    const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown']
    for (const eventType of eventTypes) {
      const elements = container.querySelectorAll(`[data-zen-${eventType}]`)
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        if (!(element instanceof Element)) continue
      const handler = (element as any)[`__zen_${eventType}_handler`]
      if (handler) {
        element.removeEventListener(eventType, handler)
        delete (element as any)[`__zen_${eventType}_handler`]
      }
    }
  }
  
  // Clear bindings
  bindings.length = 0
}

