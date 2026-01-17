/**
 * Generate Bindings
 * 
 * This module is handled by transformNode, but kept here for future extensibility
 */

import type { Binding } from '../output/types'

/**
 * Valid binding types
 */
const VALID_BINDING_TYPES = new Set(['text', 'attribute', 'loop', 'conditional', 'optional'])

/**
 * Validate bindings structure
 */
export function validateBindings(bindings: Binding[]): void {
  for (const binding of bindings) {
    if (!binding.id || !binding.type || !binding.target || !binding.expression) {
      throw new Error(`Invalid binding: ${JSON.stringify(binding)}`)
    }
    
    if (!VALID_BINDING_TYPES.has(binding.type)) {
      throw new Error(`Invalid binding type: ${binding.type}`)
    }
    
    // Validate specific binding types
    switch (binding.type) {
      case 'text':
        if (binding.target !== 'data-zen-text') {
          throw new Error(`Text binding must have target 'data-zen-text', got: ${binding.target}`)
        }
        break
      case 'loop':
        if (binding.target !== 'data-zen-loop') {
          throw new Error(`Loop binding must have target 'data-zen-loop', got: ${binding.target}`)
        }
        break
      case 'conditional':
        if (binding.target !== 'data-zen-cond') {
          throw new Error(`Conditional binding must have target 'data-zen-cond', got: ${binding.target}`)
        }
        break
      case 'optional':
        if (binding.target !== 'data-zen-opt') {
          throw new Error(`Optional binding must have target 'data-zen-opt', got: ${binding.target}`)
        }
        break
      case 'attribute':
        // Attribute bindings can have various targets
        break
    }
  }
}

/**
 * Sort bindings by location for deterministic output
 */
export function sortBindings(bindings: Binding[]): Binding[] {
  return [...bindings].sort((a, b) => {
    if (!a.location || !b.location) return 0
    if (a.location.line !== b.location.line) {
      return a.location.line - b.location.line
    }
    return a.location.column - b.location.column
  })
}

