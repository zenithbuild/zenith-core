/**
 * Explicit Data Exposure Analysis
 * 
 * Phase 6: Analyzes expressions to detect data dependencies and ensure
 * all data references are explicit (loader, props, stores) rather than implicit globals
 */

import type { ExpressionIR } from '../ir/types'
import { CompilerError } from '../errors/compilerError'
import { transformExpressionJSX } from '../transform/expressionTransformer'

/**
 * Data dependency information for an expression
 */
export interface ExpressionDataDependencies {
  expressionId: string
  usesLoaderData: boolean
  usesProps: boolean
  usesStores: boolean
  usesState: boolean
  loaderProperties: string[]  // e.g., ['user', 'user.name']
  propNames: string[]         // e.g., ['title', 'showWelcome']
  storeNames: string[]        // e.g., ['cart', 'notifications']
  stateProperties: string[]   // e.g., ['count', 'isLoading']
}

/**
 * Analyze an expression to detect its data dependencies
 * 
 * This is a simple heuristic-based analyzer that looks for patterns like:
 * - user.name, user.email → loader data
 * - props.title, props.showWelcome → props
 * - stores.cart, stores.notifications → stores
 * - count, isLoading → state (top-level properties)
 */
export function analyzeExpressionDependencies(
  expr: ExpressionIR,
  declaredLoaderProps: string[] = [],
  declaredProps: string[] = [],
  declaredStores: string[] = []
): ExpressionDataDependencies {
  const { id, code } = expr

  const dependencies: ExpressionDataDependencies = {
    expressionId: id,
    usesLoaderData: false,
    usesProps: false,
    usesStores: false,
    usesState: false,
    loaderProperties: [],
    propNames: [],
    storeNames: [],
    stateProperties: []
  }

  // Simple pattern matching (for Phase 6 - can be enhanced with proper AST parsing later)

  // Check for loader data references (loaderData.property or direct property access)
  // We assume properties not starting with props/stores/state are loader data
  const loaderPattern = /\b(loaderData\.(\w+(?:\.\w+)*)|(?<!props\.|stores\.|state\.)(\w+)\.(\w+))/g
  let match

  // Check for explicit loaderData references
  if (/loaderData\./.test(code)) {
    dependencies.usesLoaderData = true
    while ((match = loaderPattern.exec(code)) !== null) {
      if (match[1]?.startsWith('loaderData.')) {
        const propPath = match[1].replace('loaderData.', '')
        if (!dependencies.loaderProperties.includes(propPath)) {
          dependencies.loaderProperties.push(propPath)
        }
      }
    }
  }

  // Check for props references
  const propsPattern = /\bprops\.(\w+)(?:\.(\w+))*/g
  if (/props\./.test(code)) {
    dependencies.usesProps = true
    while ((match = propsPattern.exec(code)) !== null) {
      const propName = match[1]
      if (propName && !dependencies.propNames.includes(propName)) {
        dependencies.propNames.push(propName)
      }
    }
  }

  // Check for stores references
  const storesPattern = /\bstores\.(\w+)(?:\.(\w+))*/g
  if (/stores\./.test(code)) {
    dependencies.usesStores = true
    while ((match = storesPattern.exec(code)) !== null) {
      const storeName = match[1]
      if (storeName && !dependencies.storeNames.includes(storeName)) {
        dependencies.storeNames.push(storeName)
      }
    }
  }

  // Check for state references (top-level properties)
  // Simple identifiers that aren't part of props/stores/loaderData paths
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  const reserved = ['props', 'stores', 'loaderData', 'state', 'true', 'false', 'null', 'undefined', 'this', 'window']

  const identifiers = new Set<string>()
  while ((match = identifierPattern.exec(code)) !== null) {
    const ident = match[1]
    if (ident && !reserved.includes(ident) && !ident.includes('.')) {
      identifiers.add(ident)
    }
  }

  // If we have identifiers, check if they are props or state
  if (identifiers.size > 0) {
    const propIdents: string[] = []
    const stateIdents: string[] = []

    for (const ident of identifiers) {
      if (declaredProps.includes(ident)) {
        propIdents.push(ident)
      } else {
        stateIdents.push(ident)
      }
    }

    if (propIdents.length > 0) {
      dependencies.usesProps = true
      dependencies.propNames = [...new Set([...dependencies.propNames, ...propIdents])]
    }

    if (stateIdents.length > 0) {
      dependencies.usesState = true
      dependencies.stateProperties = Array.from(new Set([...dependencies.stateProperties, ...stateIdents]))
    }
  }

  return dependencies
}

/**
 * Validate that all referenced data exists
 */
export function validateDataDependencies(
  dependencies: ExpressionDataDependencies,
  filePath: string,
  declaredLoaderProps: string[] = [],
  declaredProps: string[] = [],
  declaredStores: string[] = []
): void {
  const errors: CompilerError[] = []

  // Validate loader data properties
  if (dependencies.usesLoaderData && dependencies.loaderProperties.length > 0) {
    // For Phase 6, we'll allow any loader property (can be enhanced with type checking later)
    // Just warn if property path is suspicious
    for (const prop of dependencies.loaderProperties) {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(prop)) {
        errors.push(new CompilerError(
          `Invalid loader data property reference: ${prop}`,
          filePath,
          0,
          0
        ))
      }
    }
  }

  // Validate props
  if (dependencies.usesProps && dependencies.propNames.length > 0) {
    for (const propName of dependencies.propNames) {
      if (declaredProps.length > 0 && !declaredProps.includes(propName)) {
        // This is a warning, not an error - props might be passed at runtime
        console.warn(`[Zenith] Prop "${propName}" referenced but not declared in component`)
      }
    }
  }

  // Validate stores
  if (dependencies.usesStores && dependencies.storeNames.length > 0) {
    for (const storeName of dependencies.storeNames) {
      if (declaredStores.length > 0 && !declaredStores.includes(storeName)) {
        errors.push(new CompilerError(
          `Store "${storeName}" referenced but not imported or declared`,
          filePath,
          0,
          0
        ))
      }
    }
  }

  if (errors.length > 0) {
    throw errors[0] // Throw first error (can be enhanced to collect all)
  }
}

/**
 * Transform expression code to use explicit data arguments
 * 
 * Converts patterns like:
 * - user.name → loaderData.user.name
 * - title → props.title (if declared as prop)
 * - cart.items → stores.cart.items
 */
export function transformExpressionCode(
  code: string,
  dependencies: ExpressionDataDependencies,
  declaredProps: string[] = []
): string {
  let transformed = code

  // For Phase 6, we keep the code as-is but ensure expressions
  // receive the right arguments. The actual transformation happens
  // in the expression wrapper function signature.

  // However, if the code references properties directly (without loaderData/props/stores prefix),
  // we need to assume they're state properties (backwards compatibility)

  return transformed
}

/**
 * Generate expression wrapper with explicit data arguments
 */
export function generateExplicitExpressionWrapper(
  expr: ExpressionIR,
  dependencies: ExpressionDataDependencies
): string {
  const { id, code } = expr

  // Build function signature based on dependencies
  const params: string[] = ['state']

  if (dependencies.usesLoaderData) {
    params.push('loaderData')
  }
  if (dependencies.usesProps) {
    params.push('props')
  }
  if (dependencies.usesStores) {
    params.push('stores')
  }

  const paramList = params.join(', ')

  // Build evaluation context
  const contextParts: string[] = []

  if (dependencies.usesLoaderData) {
    contextParts.push('loaderData')
  }
  if (dependencies.usesProps) {
    contextParts.push('props')
  }
  if (dependencies.usesStores) {
    contextParts.push('stores')
  }
  if (dependencies.usesState) {
    contextParts.push('state')
  }

  // Create merged context code
  const contextCode = contextParts.length > 0
    ? `var __ctx = Object.assign({}, ${contextParts.join(', ')});`
    : 'var __ctx = state || {};'

  // Escape the code for use in a single-line comment (replace newlines with spaces)
  const commentCode = code.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').substring(0, 100)

  // JSON.stringify the code for error messages (properly escapes quotes, newlines, etc.)
  const jsonEscapedCode = JSON.stringify(code)

  // Transform JSX
  const transformedCode = transformExpressionJSX(code)

  // Properly escape the transformed code for use inside a string
  const escapedTransformedCode = transformedCode
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  return `
  // Expression: ${commentCode}${code.length > 100 ? '...' : ''}
  // Dependencies: ${JSON.stringify({
    loaderData: dependencies.usesLoaderData,
    props: dependencies.usesProps,
    stores: dependencies.usesStores,
    state: dependencies.usesState
  })}
  const ${id} = (function() {
    // Create the evaluator function once (with 'with' support in sloppy mode)
    var evalFn = new Function('__ctx',
      'with (__ctx) { return (' + '${escapedTransformedCode}' + '); }'
    );
    
    return function(${paramList}) {
      try {
        // Merge window globals with context (for script-level variables)
        var __baseCtx = Object.assign({}, window);
        ${contextCode.replace('var __ctx', 'var __ctx').replace('= Object.assign({},', '= Object.assign(__baseCtx,')}
        return evalFn(__ctx);
      } catch (e) {
        console.warn('[Zenith] Expression evaluation error:', ${jsonEscapedCode}, e);
        return undefined;
      }
    };
  })();`
}

/**
 * Analyze all expressions in a template
 */
export function analyzeAllExpressions(
  expressions: ExpressionIR[],
  filePath: string,
  declaredLoaderProps: string[] = [],
  declaredProps: string[] = [],
  declaredStores: string[] = []
): ExpressionDataDependencies[] {
  const dependencies = expressions.map(expr =>
    analyzeExpressionDependencies(expr, declaredLoaderProps, declaredProps, declaredStores)
  )

  // Validate all dependencies
  for (const dep of dependencies) {
    validateDataDependencies(dep, filePath, declaredLoaderProps, declaredProps, declaredStores)
  }

  return dependencies
}

