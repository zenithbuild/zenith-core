/**
 * Expression Classification
 * 
 * Analyzes expression code to determine output type for structural lowering.
 * 
 * JSX expressions are allowed if — and only if — the compiler can statically
 * enumerate all possible DOM shapes and lower them at compile time.
 */

/**
 * Expression output types
 * 
 * - primitive: string, number, boolean → text binding
 * - conditional: cond ? <A /> : <B /> → ConditionalFragmentNode
 * - optional: cond && <A /> → OptionalFragmentNode
 * - loop: arr.map(i => <JSX />) → LoopFragmentNode
 * - fragment: <A /> or <><A /><B /></> → inline fragment
 * - unknown: cannot be statically determined → COMPILE ERROR
 */
export type ExpressionOutputType =
    | 'primitive'
    | 'conditional'
    | 'optional'
    | 'loop'
    | 'fragment'
    | 'unknown'

/**
 * Classification result with extracted metadata
 */
export interface ExpressionClassification {
    type: ExpressionOutputType
    // For conditional expressions
    condition?: string
    consequent?: string
    alternate?: string
    // For optional expressions
    optionalCondition?: string
    optionalFragment?: string
    // For loop expressions
    loopSource?: string
    loopItemVar?: string
    loopIndexVar?: string
    loopBody?: string
    // For inline fragments
    fragmentCode?: string
}

/**
 * Check if code contains JSX-like tags
 */
function containsJSX(code: string): boolean {
    // Match opening JSX tags: <Tag or <tag
    return /<[a-zA-Z]/.test(code)
}

/**
 * Check if expression starts with a JSX element
 */
function startsWithJSX(code: string): boolean {
    const trimmed = code.trim()
    return /^<[a-zA-Z]/.test(trimmed) || /^<>/.test(trimmed)
}

/**
 * Classify expression output type
 * 
 * @param code - The expression code to classify
 * @returns Classification result with metadata
 */
export function classifyExpression(code: string): ExpressionClassification {
    const trimmed = code.trim()

    // Check for .map() expressions with JSX body
    const mapMatch = parseMapExpression(trimmed)
    if (mapMatch) {
        return {
            type: 'loop',
            loopSource: mapMatch.source,
            loopItemVar: mapMatch.itemVar,
            loopIndexVar: mapMatch.indexVar,
            loopBody: mapMatch.body
        }
    }

    // Check for ternary with JSX branches: condition ? <A /> : <B />
    const ternaryMatch = parseTernaryExpression(trimmed)
    if (ternaryMatch && (containsJSX(ternaryMatch.consequent) || containsJSX(ternaryMatch.alternate))) {
        return {
            type: 'conditional',
            condition: ternaryMatch.condition,
            consequent: ternaryMatch.consequent,
            alternate: ternaryMatch.alternate
        }
    }

    // Check for logical AND with JSX: condition && <A />
    const logicalAndMatch = parseLogicalAndExpression(trimmed)
    if (logicalAndMatch && containsJSX(logicalAndMatch.fragment)) {
        return {
            type: 'optional',
            optionalCondition: logicalAndMatch.condition,
            optionalFragment: logicalAndMatch.fragment
        }
    }

    // All other expressions (including inline JSX like {<span>text</span>})
    // are treated as primitive and handled by the existing expression transformer
    // which converts JSX to __zenith.h() calls at runtime
    return { type: 'primitive' }
}

/**
 * Parse .map() expression
 * 
 * Matches:
 * - source.map(item => body)
 * - source.map((item, index) => body)
 */
function parseMapExpression(code: string): {
    source: string
    itemVar: string
    indexVar?: string
    body: string
} | null {
    // Pattern: source.map(item => body)
    // Pattern: source.map((item) => body)
    // Pattern: source.map((item, index) => body)

    // Find .map( 
    const mapIndex = code.indexOf('.map(')
    if (mapIndex === -1) return null

    const source = code.slice(0, mapIndex).trim()
    if (!source) return null

    // Find the arrow function parameters
    let afterMap = code.slice(mapIndex + 5) // after ".map("

    // Skip whitespace
    afterMap = afterMap.trimStart()

    // Check for parenthesized params: (item) or (item, index)
    let itemVar: string
    let indexVar: string | undefined
    let bodyStart: number

    if (afterMap.startsWith('(')) {
        // Find closing paren
        const closeParenIndex = findBalancedParen(afterMap, 0)
        if (closeParenIndex === -1) return null

        const paramsStr = afterMap.slice(1, closeParenIndex)
        const params = paramsStr.split(',').map(p => p.trim())

        itemVar = params[0] || ''
        indexVar = params[1]

        // Find arrow
        const afterParams = afterMap.slice(closeParenIndex + 1).trimStart()
        if (!afterParams.startsWith('=>')) return null

        bodyStart = mapIndex + 5 + (afterMap.length - afterParams.length) + 2
    } else {
        // Simple param: item => body
        const arrowIndex = afterMap.indexOf('=>')
        if (arrowIndex === -1) return null

        itemVar = afterMap.slice(0, arrowIndex).trim()
        bodyStart = mapIndex + 5 + arrowIndex + 2
    }

    if (!itemVar) return null

    // Extract body (everything after => until the closing paren of .map())
    let body = code.slice(bodyStart).trim()

    // Remove trailing ) from .map()
    if (body.endsWith(')')) {
        body = body.slice(0, -1).trim()
    }

    // Check if body contains JSX
    if (!containsJSX(body)) return null

    return { source, itemVar, indexVar, body }
}

/**
 * Find matching closing parenthesis
 */
function findBalancedParen(code: string, startIndex: number): number {
    if (code[startIndex] !== '(') return -1

    let depth = 1
    let i = startIndex + 1

    while (i < code.length && depth > 0) {
        if (code[i] === '(') depth++
        else if (code[i] === ')') depth--
        i++
    }

    return depth === 0 ? i - 1 : -1
}

/**
 * Parse ternary expression
 * 
 * Matches: condition ? consequent : alternate
 */
function parseTernaryExpression(code: string): {
    condition: string
    consequent: string
    alternate: string
} | null {
    // Find the ? that's not inside JSX or strings
    const questionIndex = findTernaryOperator(code)
    if (questionIndex === -1) return null

    const condition = code.slice(0, questionIndex).trim()
    const afterQuestion = code.slice(questionIndex + 1)

    // Find the : that matches this ternary
    const colonIndex = findTernaryColon(afterQuestion)
    if (colonIndex === -1) return null

    const consequent = afterQuestion.slice(0, colonIndex).trim()
    const alternate = afterQuestion.slice(colonIndex + 1).trim()

    if (!condition || !consequent || !alternate) return null

    return { condition, consequent, alternate }
}

/**
 * Find ternary ? operator (not inside JSX or nested ternaries)
 */
function findTernaryOperator(code: string): number {
    let depth = 0
    let inString = false
    let stringChar = ''
    let inTemplate = false
    let jsxDepth = 0

    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        const prevChar = i > 0 ? code[i - 1] : ''

        // Handle escape
        if (prevChar === '\\') continue

        // Handle strings
        if (!inString && !inTemplate && (char === '"' || char === "'")) {
            inString = true
            stringChar = char
            continue
        }
        if (inString && char === stringChar) {
            inString = false
            continue
        }

        // Handle template literals
        if (!inString && !inTemplate && char === '`') {
            inTemplate = true
            continue
        }
        if (inTemplate && char === '`') {
            inTemplate = false
            continue
        }

        if (inString || inTemplate) continue

        // Track JSX depth
        if (char === '<' && /[a-zA-Z>]/.test(code[i + 1] || '')) {
            jsxDepth++
        }
        if (char === '>' && prevChar === '/') {
            jsxDepth = Math.max(0, jsxDepth - 1)
        }
        if (char === '/' && code[i + 1] === '>') {
            // self-closing tag, depth handled when we see >
        }
        if (char === '<' && code[i + 1] === '/') {
            // closing tag coming
        }
        if (char === '>' && jsxDepth > 0 && prevChar !== '/' && code.slice(0, i).includes('</')) {
            jsxDepth = Math.max(0, jsxDepth - 1)
        }

        // Track parens
        if (char === '(' || char === '{' || char === '[') depth++
        if (char === ')' || char === '}' || char === ']') depth--

        // Found ternary operator at top level
        if (char === '?' && depth === 0 && jsxDepth === 0) {
            return i
        }
    }

    return -1
}

/**
 * Find ternary : operator (matching the ?)
 */
function findTernaryColon(code: string): number {
    let depth = 0
    let ternaryDepth = 0
    let inString = false
    let stringChar = ''
    let inTemplate = false
    let jsxDepth = 0

    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        const prevChar = i > 0 ? code[i - 1] : ''

        // Handle escape
        if (prevChar === '\\') continue

        // Handle strings
        if (!inString && !inTemplate && (char === '"' || char === "'")) {
            inString = true
            stringChar = char
            continue
        }
        if (inString && char === stringChar) {
            inString = false
            continue
        }

        // Handle template literals
        if (!inString && !inTemplate && char === '`') {
            inTemplate = true
            continue
        }
        if (inTemplate && char === '`') {
            inTemplate = false
            continue
        }

        if (inString || inTemplate) continue

        // Track JSX depth (simplified)
        if (char === '<' && /[a-zA-Z>]/.test(code[i + 1] || '')) {
            jsxDepth++
        }
        if (char === '>' && (prevChar === '/' || jsxDepth > 0)) {
            jsxDepth = Math.max(0, jsxDepth - 1)
        }

        // Track parens
        if (char === '(' || char === '{' || char === '[') depth++
        if (char === ')' || char === '}' || char === ']') depth--

        // Track nested ternaries
        if (char === '?') ternaryDepth++
        if (char === ':' && ternaryDepth > 0) {
            ternaryDepth--
            continue
        }

        // Found matching colon at top level
        if (char === ':' && depth === 0 && ternaryDepth === 0 && jsxDepth === 0) {
            return i
        }
    }

    return -1
}

/**
 * Parse logical AND expression
 * 
 * Matches: condition && fragment
 */
function parseLogicalAndExpression(code: string): {
    condition: string
    fragment: string
} | null {
    // Find && at top level
    let depth = 0
    let inString = false
    let stringChar = ''
    let inTemplate = false

    for (let i = 0; i < code.length - 1; i++) {
        const char = code[i]
        const nextChar = code[i + 1]
        const prevChar = i > 0 ? code[i - 1] : ''

        // Handle escape
        if (prevChar === '\\') continue

        // Handle strings
        if (!inString && !inTemplate && (char === '"' || char === "'")) {
            inString = true
            stringChar = char
            continue
        }
        if (inString && char === stringChar) {
            inString = false
            continue
        }

        // Handle template literals
        if (!inString && !inTemplate && char === '`') {
            inTemplate = true
            continue
        }
        if (inTemplate && char === '`') {
            inTemplate = false
            continue
        }

        if (inString || inTemplate) continue

        // Track parens
        if (char === '(' || char === '{' || char === '[') depth++
        if (char === ')' || char === '}' || char === ']') depth--

        // Found && at top level
        if (char === '&' && nextChar === '&' && depth === 0) {
            const condition = code.slice(0, i).trim()
            const fragment = code.slice(i + 2).trim()

            if (condition && fragment) {
                return { condition, fragment }
            }
        }
    }

    return null
}

/**
 * Check if an expression type requires structural lowering
 */
export function requiresStructuralLowering(type: ExpressionOutputType): boolean {
    return type === 'conditional' || type === 'optional' || type === 'loop' || type === 'fragment'
}
