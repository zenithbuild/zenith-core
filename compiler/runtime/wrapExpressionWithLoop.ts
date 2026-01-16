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
import { transformExpressionJSX } from '../transform/expressionTransformer'

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
  if (dependencies?.usesState || (dependencies?.stateProperties && dependencies.stateProperties.length > 0)) args.push('state')
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
  if (dependencies?.usesState || (dependencies?.stateProperties && dependencies.stateProperties.length > 0)) contextMerge.push('state')
  if (dependencies?.usesStores) contextMerge.push('stores')
  if (dependencies?.usesProps) contextMerge.push('props')
  if (dependencies?.usesLoaderData) contextMerge.push('loaderData')
  if (loopContext) contextMerge.push('loopContext')

  const contextObject = contextMerge.length > 0
    ? `const __ctx = Object.assign({}, ${contextMerge.join(', ')});`
    : `const __ctx = loopContext || {};`

  // Transform JSX
  // The fix for 'undefined' string assignment is applied within transformExpressionJSX
  // by ensuring that any remaining text is properly quoted as a string literal
  // or recognized as an existing h() call.
  const transformedCode = transformExpressionJSX(code)

  // Properly escape the transformed code for use inside a string
  const escapedTransformedCode = transformedCode
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  return `
  // Expression with loop context: ${escapedCode}
  // Loop variables: ${loopContext.variables.join(', ')}
  const ${id} = (function() {
    // Create the evaluator function once (with 'with' support in sloppy mode)
    var evalFn = new Function('__ctx',
      'with (__ctx) { return (' + '${escapedTransformedCode}' + '); }'
    );
    
    return function(${argsStr}) {
      try {
        // Merge window globals with context (for script-level variables)
        var __baseCtx = Object.assign({}, window);
        ${contextObject.replace('const __ctx', 'var __ctx').replace('= Object.assign({},', '= Object.assign(__baseCtx,')}
        return evalFn(__ctx);
      } catch (e) {
        console.warn('[Zenith] Expression evaluation error for "${escapedCode}":', e);
        return undefined;
      }
    };
  })();`
}
