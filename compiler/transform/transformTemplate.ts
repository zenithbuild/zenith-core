/**
 * Transform Template IR to Compiled Template
 * 
 * Phase 2: Transform IR → Static HTML + Runtime Bindings
 */

import type { ZenIR } from '../ir/types'
import type { CompiledTemplate } from '../output/types'
import { generateHTML } from './generateHTML'
import { validateBindings, sortBindings } from './generateBindings'

/**
 * Transform a ZenIR into CompiledTemplate
 */
export function transformTemplate(ir: ZenIR): CompiledTemplate {
  // Generate HTML and collect bindings
  const { html, bindings } = generateHTML(ir.template.nodes, ir.template.expressions)
  
  // Validate bindings
  validateBindings(bindings)
  
  // Sort bindings by location for deterministic output
  const sortedBindings = sortBindings(bindings)
  
  // Extract scripts (raw content, pass through)
  const scripts = ir.script ? ir.script.raw : null
  
  // Extract styles (raw content, pass through)
  const styles = ir.styles.map(s => s.raw)
  
  return {
    html,
    bindings: sortedBindings,
    scripts,
    styles
  }
}

