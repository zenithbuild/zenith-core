/**
 * Test Cases for Expression Validation
 * 
 * Phase 8/9/10: Tests that invalid expressions fail the build
 */

import { validateExpressions, validateExpressionsOrThrow } from '../validate/validateExpressions'
import type { ExpressionIR } from '../ir/types'

/**
 * Test valid expressions
 */
function testValidExpressions() {
  const validExpressions: ExpressionIR[] = [
    {
      id: 'expr_0',
      code: 'user.name',
      location: { line: 10, column: 5 }
    },
    {
      id: 'expr_1',
      code: 'count + 1',
      location: { line: 11, column: 8 }
    },
    {
      id: 'expr_2',
      code: 'isActive ? "on" : "off"',
      location: { line: 12, column: 12 }
    }
  ]
  
  const result = validateExpressions(validExpressions, 'test.zen')
  console.assert(result.valid === true, 'Valid expressions should pass validation')
  console.assert(result.errors.length === 0, 'Valid expressions should have no errors')
  console.log('✅ Valid expressions test passed')
}

/**
 * Test invalid expressions
 */
function testInvalidExpressions() {
  const invalidExpressions: ExpressionIR[] = [
    {
      id: 'expr_0',
      code: 'user.name}', // Mismatched brace
      location: { line: 10, column: 5 }
    }
  ]
  
  const result = validateExpressions(invalidExpressions, 'test.zen')
  console.assert(result.valid === false, 'Invalid expressions should fail validation')
  console.assert(result.errors.length > 0, 'Invalid expressions should have errors')
  console.log('✅ Invalid expressions test passed')
}

/**
 * Test unsafe code detection
 */
function testUnsafeCode() {
  const unsafeExpressions: ExpressionIR[] = [
    {
      id: 'expr_0',
      code: 'eval("alert(1)")',
      location: { line: 10, column: 5 }
    }
  ]
  
  const result = validateExpressions(unsafeExpressions, 'test.zen')
  console.assert(result.valid === false, 'Unsafe code should fail validation')
  console.assert(result.errors.length > 0, 'Unsafe code should have errors')
  console.log('✅ Unsafe code detection test passed')
}

/**
 * Test validateExpressionsOrThrow
 */
function testThrowOnInvalid() {
  const invalidExpressions: ExpressionIR[] = [
    {
      id: 'expr_0',
      code: 'user.name}', // Mismatched brace
      location: { line: 10, column: 5 }
    }
  ]
  
  try {
    validateExpressionsOrThrow(invalidExpressions, 'test.zen')
    console.assert(false, 'Should have thrown on invalid expressions')
  } catch (error) {
    console.assert(error instanceof Error, 'Should throw Error')
    console.log('✅ Throw on invalid expressions test passed')
  }
}

// Run tests
if (require.main === module) {
  console.log('Running validation tests...')
  testValidExpressions()
  testInvalidExpressions()
  testUnsafeCode()
  testThrowOnInvalid()
  console.log('✅ All validation tests passed!')
}

