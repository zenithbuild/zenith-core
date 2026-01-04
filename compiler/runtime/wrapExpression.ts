/**
 * Expression Wrapper
 * 
 * Wraps extracted expressions into runtime functions with explicit data arguments
 * 
 * Phase 6: Expressions now accept explicit loaderData, props, stores arguments
 * instead of relying on implicit globals
 */

import type { ExpressionIR, LoopContext } from '../ir/types'
import type { ExpressionDataDependencies } from './dataExposure'
import { generateExplicitExpressionWrapper } from './dataExposure'
import { wrapExpressionWithLoopContext } from './wrapExpressionWithLoop'

/**
 * Wrap an expression into a runtime function with explicit data arguments
 * 
 * Phase 6: Supports explicit loaderData, props, stores arguments
 * Phase 7: Supports loop context for expressions inside map iterations
 */
export function wrapExpression(
  expr: ExpressionIR,
  dependencies?: ExpressionDataDependencies,
  loopContext?: LoopContext  // Phase 7: Loop context for map expressions
): string {
  // Phase 7: If loop context is provided, use loop-aware wrapper
  if (loopContext && loopContext.variables.length > 0) {
    return wrapExpressionWithLoopContext(expr, loopContext, dependencies)
  }
  
  // If dependencies are provided, use explicit wrapper (Phase 6)
  if (dependencies) {
    return generateExplicitExpressionWrapper(expr, dependencies)
  }
  
  // Fallback to legacy wrapper (backwards compatibility)
  const { id, code } = expr
  const escapedCode = code.replace(/`/g, '\\`').replace(/\$/g, '\\$')
  
  return `
  // Expression: ${escapedCode}
  const ${id} = (state) => {
    try {
      with (state) {
        return ${code};
      }
    } catch (e) {
      console.warn('[Zenith] Expression evaluation error:', ${JSON.stringify(code)}, e);
      return undefined;
    }
  };`
}

/**
 * Generate all expression wrappers for a set of expressions
 * 
 * Phase 6: Accepts dependencies array for explicit data exposure
 * Phase 7: Accepts loop contexts for expressions inside map iterations
 */
export function generateExpressionWrappers(
  expressions: ExpressionIR[],
  dependencies?: ExpressionDataDependencies[],
  loopContexts?: (LoopContext | undefined)[]  // Phase 7: Loop contexts for each expression
): string {
  if (expressions.length === 0) {
    return ''
  }
  
  if (dependencies && dependencies.length === expressions.length) {
    // Use explicit wrappers with dependencies and optional loop contexts
    return expressions
      .map((expr, index) => {
        const loopCtx = loopContexts && loopContexts[index] !== undefined 
          ? loopContexts[index] 
          : undefined
        return wrapExpression(expr, dependencies[index], loopCtx)
      })
      .join('\n')
  }
  
  // Fallback to legacy wrappers (no dependencies, no loop contexts)
  return expressions.map(expr => wrapExpression(expr)).join('\n')
}

