/**
 * Compiled Template Output Types
 * 
 * Phase 2: Transform IR → Static HTML + Runtime Bindings
 * Phase 8: Extended with fragment binding types (loop, conditional, optional)
 */

import type { TemplateNode } from '../ir/types'

export type CompiledTemplate = {
  html: string
  bindings: Binding[]
  scripts: string | null
  styles: string[]
}

export type Binding = {
  id: string
  type: 'text' | 'attribute' | 'loop' | 'conditional' | 'optional'
  target: string  // e.g., "data-zen-text" or "class" for attribute bindings
  expression: string  // The original expression code
  location?: {
    line: number
    column: number
  }
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
  loopMeta?: LoopMeta  // Phase 8: Metadata for loop bindings
}

/**
 * Loop binding metadata
 * Phase 8: Contains loop variable names and body template for runtime instantiation
 */
export type LoopMeta = {
  itemVar: string
  indexVar?: string
  bodyTemplate: TemplateNode[]
}

/**
 * Loop context for expressions inside map iterations
 * Phase 7: Tracks loop variables for runtime setter generation
 */
export type LoopContext = {
  variables: string[]  // e.g., ['todo', 'index']
  mapSource?: string   // The array being mapped, e.g., 'todoItems'
}

