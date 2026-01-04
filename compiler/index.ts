/**
 * Zenith Compiler
 * 
 * Phase 1: Parse & Extract
 * Phase 2: Transform IR → Static HTML + Runtime Bindings
 * Phase 8/9/10: Finalize Output with Validation
 * 
 * This compiler observes .zen files, extracts their structure,
 * transforms them into static HTML with explicit bindings,
 * and validates/finalizes output for browser execution.
 */

import { parseZenFile } from './parse/parseZenFile'
import { transformTemplate } from './transform/transformTemplate'
import { finalizeOutputOrThrow } from './finalize/finalizeOutput'
import type { ZenIR } from './ir/types'
import type { CompiledTemplate } from './output/types'
import type { FinalizedOutput } from './finalize/finalizeOutput'

/**
 * Compile a .zen file into IR and CompiledTemplate
 * 
 * Phase 1: Parses and extracts structure
 * Phase 2: Transforms IR into static HTML with bindings
 * Phase 8/9/10: Validates and finalizes output
 */
export function compileZen(filePath: string): { 
  ir: ZenIR
  compiled: CompiledTemplate
  finalized?: FinalizedOutput
} {
  const ir = parseZenFile(filePath)
  const compiled = transformTemplate(ir)
  
  // Phase 8/9/10: Finalize output with validation
  // This ensures build fails on invalid expressions
  try {
    const finalized = finalizeOutputOrThrow(ir, compiled)
    return { ir, compiled, finalized }
  } catch (error: any) {
    // Re-throw with context
    throw new Error(`Failed to finalize output for ${filePath}:\n${error.message}`)
  }
}
