/**
 * Loop Context Tracking
 * 
 * Phase 7: Utilities for tracking and propagating loop context through the parse tree
 */

import type { LoopContext, ExpressionIR } from '../ir/types'
import { detectMapExpression, referencesLoopVariable } from './detectMapExpressions'

/**
 * Check if an expression should have loop context attached
 * Returns the loop context if the expression references loop variables
 */
export function shouldAttachLoopContext(
  expr: ExpressionIR,
  parentLoopContext?: LoopContext
): LoopContext | undefined {
  if (!parentLoopContext) {
    return undefined
  }
  
  // Check if this expression references any loop variables
  if (referencesLoopVariable(expr.code, parentLoopContext.variables)) {
    return parentLoopContext
  }
  
  return undefined
}

/**
 * Merge loop contexts for nested loops
 * Inner loops inherit outer loop variables
 */
export function mergeLoopContext(
  outer?: LoopContext,
  inner?: LoopContext
): LoopContext | undefined {
  if (!inner) {
    return outer
  }
  
  if (!outer) {
    return inner
  }
  
  // Merge variables: outer variables come first, then inner
  // This allows expressions to reference both outer and inner loop variables
  return {
    variables: [...outer.variables, ...inner.variables],
    mapSource: inner.mapSource || outer.mapSource
  }
}

/**
 * Detect if an expression is a map expression and extract its loop context
 */
export function extractLoopContextFromExpression(expr: ExpressionIR): LoopContext | undefined {
  const mapInfo = detectMapExpression(expr)
  
  if (!mapInfo.isMap) {
    return undefined
  }
  
  // extractLoopVariables expects a MapExpressionInfo, not a string
  const variables: string[] = []
  if (mapInfo.itemVariable) {
    variables.push(mapInfo.itemVariable)
  }
  if (mapInfo.indexVariable) {
    variables.push(mapInfo.indexVariable)
  }
  
  if (variables.length === 0) {
    return undefined
  }
  
  return {
    variables,
    mapSource: mapInfo.arraySource
  }
}

