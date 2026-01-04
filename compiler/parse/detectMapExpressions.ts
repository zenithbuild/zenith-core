/**
 * Map Expression Detection
 * 
 * Phase 7: Detects .map() expressions and extracts loop context information
 * 
 * This module analyzes expression code to detect map expressions like:
 * - todoItems.map(todo => ...)
 * - notifications.map((n, index) => ...)
 * 
 * It extracts:
 * - The array source (todoItems, notifications)
 * - Loop variable names (todo, n, index)
 * - The map body/template
 */

import type { ExpressionIR } from '../ir/types'

/**
 * Detected map expression information
 */
export interface MapExpressionInfo {
  isMap: boolean
  arraySource?: string      // e.g., 'todoItems'
  itemVariable?: string     // e.g., 'todo'
  indexVariable?: string    // e.g., 'index'
  mapBody?: string          // The template/body inside the map
  fullExpression?: string   // The full expression code
}

/**
 * Detect if an expression is a map expression and extract loop context
 * 
 * Patterns detected:
 * - arraySource.map(item => body)
 * - arraySource.map((item, index) => body)
 * - arraySource.map(item => (body))
 */
export function detectMapExpression(expr: ExpressionIR): MapExpressionInfo {
  const { code } = expr
  
  // Pattern: arraySource.map(item => body)
  // Pattern: arraySource.map((item, index) => body)
  // Pattern: arraySource.map(item => (body))
  const mapPattern = /^(.+?)\.\s*map\s*\(\s*\(?([^)=,\s]+)(?:\s*,\s*([^)=,\s]+))?\s*\)?\s*=>\s*(.+?)\)?$/s
  
  const match = code.match(mapPattern)
  if (!match) {
    return { isMap: false }
  }
  
  const arraySource = match[1]?.trim()
  const itemVariable = match[2]?.trim()
  const indexVariable = match[3]?.trim()
  const mapBody = match[4]?.trim()
  
  if (!arraySource || !itemVariable || !mapBody) {
    return { isMap: false }
  }
  
  return {
    isMap: true,
    arraySource,
    itemVariable,
    indexVariable,
    mapBody,
    fullExpression: code
  }
}

/**
 * Extract loop variables from a map expression
 * Returns array of variable names in order: [itemVariable, indexVariable?]
 */
export function extractLoopVariables(mapInfo: MapExpressionInfo): string[] {
  if (!mapInfo.isMap || !mapInfo.itemVariable) {
    return []
  }
  
  const vars = [mapInfo.itemVariable]
  if (mapInfo.indexVariable) {
    vars.push(mapInfo.indexVariable)
  }
  
  return vars
}

/**
 * Check if an expression references a loop variable
 * Used to determine if an expression needs loop context
 */
export function referencesLoopVariable(exprCode: string, loopVars: string[]): boolean {
  for (const loopVar of loopVars) {
    // Match variable references: loopVar.property, loopVar, etc.
    // Use word boundaries to avoid partial matches
    const pattern = new RegExp(`\\b${loopVar}\\b`)
    if (pattern.test(exprCode)) {
      return true
    }
  }
  return false
}

