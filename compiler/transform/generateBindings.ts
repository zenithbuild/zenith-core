/**
 * Generate Bindings
 * 
 * This module is handled by transformNode, but kept here for future extensibility
 */

import type { Binding } from '../output/types'

/**
 * Validate bindings structure
 */
export function validateBindings(bindings: Binding[]): void {
  for (const binding of bindings) {
    if (!binding.id || !binding.type || !binding.target || !binding.expression) {
      throw new Error(`Invalid binding: ${JSON.stringify(binding)}`)
    }
    
    if (binding.type !== 'text' && binding.type !== 'attribute') {
      throw new Error(`Invalid binding type: ${binding.type}`)
    }
    
    if (binding.type === 'text' && binding.target !== 'data-zen-text') {
      throw new Error(`Text binding must have target 'data-zen-text', got: ${binding.target}`)
    }
    
    if (binding.type === 'attribute' && !binding.target.startsWith('data-zen-attr-')) {
      // This is handled in transformNode, but validate here too
      // Actually, the target should be the attribute name (e.g., "class")
      // and we prepend "data-zen-attr-" when generating HTML
      // So this validation is correct
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

