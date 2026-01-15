import { readFileSync } from 'fs'
import { parseTemplate } from './parse/parseTemplate'
import { parseScript } from './parse/parseScript'
import { transformTemplate } from './transform/transformTemplate'
import { finalizeOutputOrThrow } from './finalize/finalizeOutput'
import { validateInvariants } from './validate/invariants'
import { InvariantError } from './errors/compilerError'
import type { ZenIR, StyleIR } from './ir/types'
import type { CompiledTemplate } from './output/types'
import type { FinalizedOutput } from './finalize/finalizeOutput'

/**
 * Compile a .zen file into IR and CompiledTemplate
 */
export async function compileZen(filePath: string): Promise<{
  ir: ZenIR
  compiled: CompiledTemplate
  finalized?: FinalizedOutput
}> {
  const source = readFileSync(filePath, 'utf-8')
  return compileZenSource(source, filePath)
}

/**
 * Compile Zen source string into IR and CompiledTemplate
 */
export async function compileZenSource(
  source: string,
  filePath: string,
  options?: {
    componentsDir?: string
  }
): Promise<{
  ir: ZenIR
  compiled: CompiledTemplate
  finalized?: FinalizedOutput
}> {
  // Parse template
  const template = parseTemplate(source, filePath)

  // Parse script
  const script = parseScript(source)

  // Parse styles
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  const styles: StyleIR[] = []
  let match
  while ((match = styleRegex.exec(source)) !== null) {
    if (match[1]) styles.push({ raw: match[1].trim() })
  }

  let ir: ZenIR = {
    filePath,
    template,
    script,
    // componentScripts: [],
    styles
  }

  // Resolve components if components directory is provided
  if (options?.componentsDir) {
    const { discoverComponents } = require('./discovery/componentDiscovery')
    const { resolveComponentsInIR } = require('./transform/componentResolver')

    // Component resolution may throw InvariantError — let it propagate
    const components = discoverComponents(options.componentsDir)
    ir = resolveComponentsInIR(ir, components)
  }

  // Validate all compiler invariants after resolution
  // Throws InvariantError if any invariant is violated
  validateInvariants(ir, filePath)

  const compiled = transformTemplate(ir)

  try {
    const finalized = await finalizeOutputOrThrow(ir, compiled)
    return { ir, compiled, finalized }
  } catch (error: any) {
    throw new Error(`Failed to finalize output for ${filePath}:\\n${error.message}`)
  }
}

