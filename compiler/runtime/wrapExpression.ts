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

import { transformExpressionJSX } from '../transform/expressionTransformer'

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
  const { id, code } = expr

  // Phase 7: If loop context is provided, use loop-aware wrapper
  if (loopContext && loopContext.variables.length > 0) {
    return wrapExpressionWithLoopContext(expr, loopContext, dependencies)
  }

  // If dependencies are provided, use explicit wrapper (Phase 6)
  if (dependencies) {
    return generateExplicitExpressionWrapper(expr, dependencies)
  }

  // Fallback to legacy wrapper (backwards compatibility)
  // Transform JSX-like tags inside expression code
  const transformedCode = transformExpressionJSX(code)
  // Escape the code for use in a single-line comment (replace newlines with spaces)
  const commentCode = code.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').substring(0, 100)
  const jsonEscapedCode = JSON.stringify(code)

  // Properly escape the transformed code for use inside a string
  const escapedTransformedCode = transformedCode
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  // Note: We cannot use `with (state)` in ES modules (strict mode)
  // Instead, we use new Function() which runs in non-strict sloppy mode by default
  // and allows 'with' statements. This is a workaround for strict mode limitations.
  return `
  // Expression: ${commentCode}${code.length > 100 ? '...' : ''}
  const ${id} = (function() {
    // Create the evaluator function once (with 'with' support in sloppy mode)
    var evalFn = new Function('__ctx',
      'with (__ctx) { return (' + '${escapedTransformedCode}' + '); }'
    );
    
    return function(state) {
      try {
        var __zenith = window.__zenith || {};
        var zenCollection = __zenith.zenCollection || function(name) { return { get: function() { return []; } }; };
        var createZenOrder = __zenith.createZenOrder || function(sections) { return { sections: [], getSectionBySlug: function() { return null; }, getDocBySlug: function() { return null; } }; };
        
        // Merge window globals (script variables) with state
        // State takes precedence over window globals
        var __ctx = Object.assign({}, window, { zenCollection: zenCollection, createZenOrder: createZenOrder }, state || {});
        
        return evalFn(__ctx);
      } catch (e) {
        console.warn('[Zenith] Expression evaluation error:', ${jsonEscapedCode}, e);
        return undefined;
      }
    };
  })();`
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

