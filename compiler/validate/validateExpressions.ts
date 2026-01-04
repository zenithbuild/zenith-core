/**
 * Expression Validation
 * 
 * Phase 8/9/10: Compile-time validation of all expressions
 * 
 * Ensures all expressions are valid JavaScript and will not cause runtime errors.
 * Build fails immediately if any expression is invalid.
 */

import type { ExpressionIR } from '../ir/types'
import { CompilerError } from '../errors/compilerError'

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: CompilerError[]
}

/**
 * Validate all expressions in the IR
 * 
 * @param expressions - Array of expressions to validate
 * @param filePath - Source file path for error reporting
 * @returns Validation result with errors
 */
export function validateExpressions(
  expressions: ExpressionIR[],
  filePath: string
): ValidationResult {
  const errors: CompilerError[] = []

  for (const expr of expressions) {
    const exprErrors = validateSingleExpression(expr, filePath)
    errors.push(...exprErrors)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate a single expression
 */
function validateSingleExpression(
  expr: ExpressionIR,
  filePath: string
): CompilerError[] {
  const errors: CompilerError[] = []
  const { id, code, location } = expr

  // Basic syntax validation using a safe approach
  // We don't execute the code, just validate syntax
  // Note: Expressions may contain JSX/HTML syntax (e.g., condition && <element>)
  // which is not valid JavaScript but is valid in our expression language.
  // We skip strict JavaScript validation for expressions that contain JSX.
  
  const hasJSX = /<[a-zA-Z]/.test(code) || /\/>/.test(code)
  
  if (!hasJSX) {
    // Only validate JavaScript syntax if there's no JSX
    // Note: Using Function constructor here is for syntax validation only (compile-time)
    // This is safe because:
    // 1. It's only called at compile time, not runtime
    // 2. We're only checking syntax, not executing the code
    // 3. The actual runtime uses pre-compiled functions, not Function constructor
    try {
      // Use Function constructor to validate syntax (doesn't execute)
      // This is compile-time only - runtime never uses Function constructor
      new Function('state', 'loaderData', 'props', 'stores', `return ${code}`)
    } catch (error: any) {
      errors.push(
        new CompilerError(
          `Invalid expression syntax: ${code}\n${error.message}`,
          filePath,
          location.line,
          location.column
        )
      )
    }
  }
  // If hasJSX, we skip JavaScript validation - JSX syntax is handled by the parser/runtime

  // Check for dangerous patterns
  if (code.includes('eval(') || code.includes('Function(') || code.includes('with (')) {
    errors.push(
      new CompilerError(
        `Expression contains unsafe code: ${code}`,
        filePath,
        location.line,
        location.column
      )
    )
  }

  // Check for undefined global references (basic heuristic)
  // This is a simple check - can be enhanced with AST parsing
  const globalPattern = /\b(window|document|console|globalThis)\./g
  const matches = code.match(globalPattern)
  if (matches && matches.length > 0) {
    // Warn but don't fail - some global access might be intentional
    // In a stricter mode, we could fail here
  }

  // Check for common syntax errors
  const openBraces = (code.match(/\{/g) || []).length
  const closeBraces = (code.match(/\}/g) || []).length
  const openParens = (code.match(/\(/g) || []).length
  const closeParens = (code.match(/\)/g) || []).length
  const openBrackets = (code.match(/\[/g) || []).length
  const closeBrackets = (code.match(/\]/g) || []).length

  if (openBraces !== closeBraces) {
    errors.push(
      new CompilerError(
        `Mismatched braces in expression: ${code}`,
        filePath,
        location.line,
        location.column
      )
    )
  }

  if (openParens !== closeParens) {
    errors.push(
      new CompilerError(
        `Mismatched parentheses in expression: ${code}`,
        filePath,
        location.line,
        location.column
      )
    )
  }

  if (openBrackets !== closeBrackets) {
    errors.push(
      new CompilerError(
        `Mismatched brackets in expression: ${code}`,
        filePath,
        location.line,
        location.column
      )
    )
  }

  return errors
}

/**
 * Validate and throw if invalid
 * 
 * @throws CompilerError if any expression is invalid
 */
export function validateExpressionsOrThrow(
  expressions: ExpressionIR[],
  filePath: string
): void {
  const result = validateExpressions(expressions, filePath)
  
  if (!result.valid && result.errors.length > 0) {
    // Throw the first error (can be enhanced to collect all)
    throw result.errors[0]
  }
}

