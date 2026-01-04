/**
 * Expression Wrapper with Loop Context Support
 * 
 * Phase 7: Wraps expressions that reference loop variables from map iterations
 * 
 * Generates runtime functions that accept (state, loaderData, props, stores, loopContext)
 * and evaluate expressions with both global state and loop-scoped variables available
 */

import type { ExpressionIR, LoopContext } from '../ir/types'
import type { ExpressionDataDependencies } from './dataExposure'

/**
 * Generate an expression wrapper that accepts loop context
 * 
 * Phase 7: Expressions inside map loops need access to loop variables (e.g., todo, index)
 * in addition to global state (state, loaderData, props, stores)
 */
export function wrapExpressionWithLoopContext(
  expr: ExpressionIR,
  loopContext?: LoopContext,
  dependencies?: ExpressionDataDependencies
): string {
  const { id, code } = expr
  const escapedCode = code.replace(/`/g, '\\`').replace(/\$/g, '\\$')
  
  if (!loopContext || loopContext.variables.length === 0) {
    // No loop context - use standard wrapper (will be handled by wrapExpression)
    return ''
  }
  
  // Determine arguments based on dependencies
  const args: string[] = []
  if (dependencies?.usesState || dependencies?.stateProperties.length > 0) args.push('state')
  if (dependencies?.usesLoaderData) args.push('loaderData')
  if (dependencies?.usesProps) args.push('props')
  if (dependencies?.usesStores) args.push('stores')
  
  // Phase 7: Always add loopContext as the last argument
  args.push('loopContext')
  
  const argsStr = args.join(', ')
  
  // Generate function that merges state and loop context
  // Loop context variables take precedence over state properties with the same name
  const loopVarsDecl = loopContext.variables.map(v => `    const ${v} = loopContext?.${v};`).join('\n')
  const loopVarsObject = `{ ${loopContext.variables.join(', ')} }`
  
  // Create merged context for expression evaluation
  // Order: loopContext > stores > props > loaderData > state
  const contextMerge: string[] = []
  if (dependencies?.usesState || dependencies?.stateProperties.length > 0) contextMerge.push('state')
  if (dependencies?.usesStores) contextMerge.push('stores')
  if (dependencies?.usesProps) contextMerge.push('props')
  if (dependencies?.usesLoaderData) contextMerge.push('loaderData')
  if (loopContext) contextMerge.push('loopContext')
  
  const contextObject = contextMerge.length > 0 
    ? `const __ctx = Object.assign({}, ${contextMerge.join(', ')});`
    : `const __ctx = loopContext || {};`
  
  return `
  // Expression with loop context: ${escapedCode}
  // Loop variables: ${loopContext.variables.join(', ')}
  const ${id} = (${argsStr}) => {
    try {
      ${contextObject}
      with (__ctx) {
        return ${code};
      }
    } catch (e) {
      console.warn('[Zenith] Expression evaluation error for "${escapedCode}":', e);
      return undefined;
    }
  };`
}

