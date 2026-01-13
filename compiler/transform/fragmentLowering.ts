/**
 * Fragment Lowering
 * 
 * Transforms JSX-returning expressions into structural fragment nodes.
 * 
 * This phase runs AFTER parsing, BEFORE component resolution.
 * Transforms ExpressionNode → ConditionalFragmentNode | OptionalFragmentNode | LoopFragmentNode
 * 
 * IMPORTANT: JSX in Zenith is compile-time sugar only.
 * The compiler enumerates all possible DOM shapes and lowers them at compile time.
 * Runtime never creates DOM — it only toggles visibility and binds values.
 */

import type {
    TemplateNode,
    ExpressionNode,
    ConditionalFragmentNode,
    OptionalFragmentNode,
    LoopFragmentNode,
    LoopContext,
    SourceLocation,
    ExpressionIR
} from '../ir/types'
import { classifyExpression, requiresStructuralLowering } from './classifyExpression'
import { InvariantError } from '../errors/compilerError'
import { INVARIANT } from '../validate/invariants'

/**
 * Lower JSX-returning expressions into structural fragments
 * 
 * Walks the node tree and transforms ExpressionNode instances
 * that return JSX into the appropriate fragment node types.
 * 
 * @param nodes - Template nodes to process
 * @param filePath - Source file path for error reporting
 * @param expressions - Expression registry (mutated to add new expressions)
 * @returns Lowered nodes with fragment bindings
 */
export function lowerFragments(
    nodes: TemplateNode[],
    filePath: string,
    expressions: ExpressionIR[]
): TemplateNode[] {
    return nodes.map(node => lowerNode(node, filePath, expressions))
}

/**
 * Lower a single node
 */
function lowerNode(
    node: TemplateNode,
    filePath: string,
    expressions: ExpressionIR[]
): TemplateNode {
    switch (node.type) {
        case 'expression':
            return lowerExpressionNode(node, filePath, expressions)

        case 'element':
            return {
                ...node,
                children: lowerFragments(node.children, filePath, expressions)
            }

        case 'component':
            return {
                ...node,
                children: lowerFragments(node.children, filePath, expressions)
            }

        case 'conditional-fragment':
            return {
                ...node,
                consequent: lowerFragments(node.consequent, filePath, expressions),
                alternate: lowerFragments(node.alternate, filePath, expressions)
            }

        case 'optional-fragment':
            return {
                ...node,
                fragment: lowerFragments(node.fragment, filePath, expressions)
            }

        case 'loop-fragment':
            return {
                ...node,
                body: lowerFragments(node.body, filePath, expressions)
            }

        case 'text':
        default:
            return node
    }
}

/**
 * Lower an expression node to a fragment if it returns JSX
 */
function lowerExpressionNode(
    node: ExpressionNode,
    filePath: string,
    expressions: ExpressionIR[]
): TemplateNode {
    const classification = classifyExpression(node.expression)

    // Primitive expressions pass through unchanged
    if (classification.type === 'primitive') {
        return node
    }

    // Unknown expressions with JSX are compile errors
    if (classification.type === 'unknown') {
        throw new InvariantError(
            INVARIANT.NON_ENUMERABLE_JSX,
            `JSX expression output cannot be statically determined: ${node.expression.slice(0, 50)}...`,
            'JSX expressions must have statically enumerable output. The compiler must know all possible DOM shapes at compile time.',
            filePath,
            node.location.line,
            node.location.column
        )
    }

    // Lower based on classification type
    switch (classification.type) {
        case 'conditional':
            return lowerConditionalExpression(
                node,
                classification.condition!,
                classification.consequent!,
                classification.alternate!,
                filePath,
                expressions
            )

        case 'optional':
            return lowerOptionalExpression(
                node,
                classification.optionalCondition!,
                classification.optionalFragment!,
                filePath,
                expressions
            )

        case 'loop':
            return lowerLoopExpression(
                node,
                classification.loopSource!,
                classification.loopItemVar!,
                classification.loopIndexVar,
                classification.loopBody!,
                filePath,
                expressions
            )

        case 'fragment':
            return lowerInlineFragment(
                node,
                classification.fragmentCode!,
                filePath,
                expressions
            )

        default:
            // Should not reach here
            return node
    }
}

/**
 * Lower conditional expression: condition ? <A /> : <B />
 * 
 * Both branches are parsed and compiled at compile time.
 */
function lowerConditionalExpression(
    node: ExpressionNode,
    condition: string,
    consequentCode: string,
    alternateCode: string,
    filePath: string,
    expressions: ExpressionIR[]
): ConditionalFragmentNode {
    // Parse both branches as JSX fragments
    const consequent = parseJSXToNodes(consequentCode, node.location, filePath, expressions, node.loopContext)
    const alternate = parseJSXToNodes(alternateCode, node.location, filePath, expressions, node.loopContext)

    return {
        type: 'conditional-fragment',
        condition,
        consequent,
        alternate,
        location: node.location,
        loopContext: node.loopContext
    }
}

/**
 * Lower optional expression: condition && <A />
 * 
 * Fragment is parsed and compiled at compile time.
 */
function lowerOptionalExpression(
    node: ExpressionNode,
    condition: string,
    fragmentCode: string,
    filePath: string,
    expressions: ExpressionIR[]
): OptionalFragmentNode {
    const fragment = parseJSXToNodes(fragmentCode, node.location, filePath, expressions, node.loopContext)

    return {
        type: 'optional-fragment',
        condition,
        fragment,
        location: node.location,
        loopContext: node.loopContext
    }
}

/**
 * Lower loop expression: items.map(item => <li>...</li>)
 * 
 * Body is parsed and compiled once, instantiated per item at runtime.
 */
function lowerLoopExpression(
    node: ExpressionNode,
    source: string,
    itemVar: string,
    indexVar: string | undefined,
    bodyCode: string,
    filePath: string,
    expressions: ExpressionIR[]
): LoopFragmentNode {
    // Create loop context for the body
    const loopVariables = [itemVar]
    if (indexVar) {
        loopVariables.push(indexVar)
    }

    const bodyLoopContext: LoopContext = {
        variables: node.loopContext
            ? [...node.loopContext.variables, ...loopVariables]
            : loopVariables,
        mapSource: source
    }

    // Parse body with loop context
    const body = parseJSXToNodes(bodyCode, node.location, filePath, expressions, bodyLoopContext)

    return {
        type: 'loop-fragment',
        source,
        itemVar,
        indexVar,
        body,
        location: node.location,
        loopContext: bodyLoopContext
    }
}

/**
 * Lower inline fragment: <A /> or <><A /><B /></>
 * 
 * JSX is parsed and inlined directly into the node tree.
 * Returns the original expression node since inline JSX
 * is already handled by the expression transformer.
 */
function lowerInlineFragment(
    node: ExpressionNode,
    fragmentCode: string,
    filePath: string,
    expressions: ExpressionIR[]
): TemplateNode {
    // For now, inline fragments are handled by the existing expression transformer
    // which converts JSX to __zenith.h() calls
    // In a future iteration, we could parse them to static nodes here
    return node
}

/**
 * Parse JSX code string into TemplateNode[]
 * 
 * This is a simplified parser for JSX fragments within expressions.
 * It handles basic JSX structure for lowering purposes.
 */
function parseJSXToNodes(
    code: string,
    baseLocation: SourceLocation,
    filePath: string,
    expressions: ExpressionIR[],
    loopContext?: LoopContext
): TemplateNode[] {
    const trimmed = code.trim()

    // Handle fragment syntax <>...</>
    if (trimmed.startsWith('<>')) {
        const content = extractFragmentContent(trimmed)
        return parseJSXChildren(content, baseLocation, filePath, expressions, loopContext)
    }

    // Handle single element
    if (trimmed.startsWith('<')) {
        const element = parseJSXElement(trimmed, baseLocation, filePath, expressions, loopContext)
        return element ? [element] : []
    }

    // Handle parenthesized expression
    if (trimmed.startsWith('(')) {
        const inner = trimmed.slice(1, -1).trim()
        return parseJSXToNodes(inner, baseLocation, filePath, expressions, loopContext)
    }

    // Not JSX - return as expression node
    return [{
        type: 'expression',
        expression: trimmed,
        location: baseLocation,
        loopContext
    }]
}

/**
 * Extract content from fragment syntax <>content</>
 */
function extractFragmentContent(code: string): string {
    // Remove <> prefix and </> suffix
    const withoutOpen = code.slice(2)
    const closeIndex = withoutOpen.lastIndexOf('</>')
    if (closeIndex === -1) {
        return withoutOpen
    }
    return withoutOpen.slice(0, closeIndex)
}

/**
 * Parse JSX children content
 */
function parseJSXChildren(
    content: string,
    baseLocation: SourceLocation,
    filePath: string,
    expressions: ExpressionIR[],
    loopContext?: LoopContext
): TemplateNode[] {
    const nodes: TemplateNode[] = []
    let i = 0
    let currentText = ''

    while (i < content.length) {
        const char = content[i]

        // Check for JSX element
        if (char === '<' && /[a-zA-Z]/.test(content[i + 1] || '')) {
            // Save accumulated text
            if (currentText.trim()) {
                nodes.push({
                    type: 'text',
                    value: currentText.trim(),
                    location: baseLocation
                })
                currentText = ''
            }

            // Parse element
            const result = parseJSXElementWithEnd(content, i, baseLocation, filePath, expressions, loopContext)
            if (result) {
                nodes.push(result.node)
                i = result.endIndex
                continue
            }
        }

        // Check for expression {expr}
        if (char === '{') {
            const endBrace = findBalancedBraceEnd(content, i)
            if (endBrace !== -1) {
                // Save accumulated text
                if (currentText.trim()) {
                    nodes.push({
                        type: 'text',
                        value: currentText.trim(),
                        location: baseLocation
                    })
                    currentText = ''
                }

                const exprCode = content.slice(i + 1, endBrace - 1).trim()
                if (exprCode) {
                    nodes.push({
                        type: 'expression',
                        expression: exprCode,
                        location: baseLocation,
                        loopContext
                    })
                }
                i = endBrace
                continue
            }
        }

        currentText += char
        i++
    }

    // Add remaining text
    if (currentText.trim()) {
        nodes.push({
            type: 'text',
            value: currentText.trim(),
            location: baseLocation
        })
    }

    return nodes
}

/**
 * Parse a single JSX element
 */
function parseJSXElement(
    code: string,
    baseLocation: SourceLocation,
    filePath: string,
    expressions: ExpressionIR[],
    loopContext?: LoopContext
): TemplateNode | null {
    const result = parseJSXElementWithEnd(code, 0, baseLocation, filePath, expressions, loopContext)
    return result ? result.node : null
}

/**
 * Parse JSX element and return end index
 */
function parseJSXElementWithEnd(
    code: string,
    startIndex: number,
    baseLocation: SourceLocation,
    filePath: string,
    expressions: ExpressionIR[],
    loopContext?: LoopContext
): { node: TemplateNode; endIndex: number } | null {
    // Extract tag name
    const tagMatch = code.slice(startIndex).match(/^<([a-zA-Z][a-zA-Z0-9.]*)/)
    if (!tagMatch) return null

    const tagName = tagMatch[1]!
    let i = startIndex + tagMatch[0].length

    // Parse attributes (simplified)
    const attributes: Array<{ name: string; value: string; location: SourceLocation }> = []

    // Skip whitespace and parse attributes until > or />
    while (i < code.length) {
        // Skip whitespace
        while (i < code.length && /\s/.test(code[i]!)) i++

        // Check for end of opening tag
        if (code[i] === '>') {
            i++
            break
        }
        if (code[i] === '/' && code[i + 1] === '>') {
            // Self-closing tag
            const isComponent = tagName[0] === tagName[0]!.toUpperCase()
            const node: TemplateNode = isComponent ? {
                type: 'component',
                name: tagName,
                attributes: attributes.map(a => ({ ...a, value: a.value })),
                children: [],
                location: baseLocation,
                loopContext
            } : {
                type: 'element',
                tag: tagName.toLowerCase(),
                attributes: attributes.map(a => ({ ...a, value: a.value })),
                children: [],
                location: baseLocation,
                loopContext
            }
            return { node, endIndex: i + 2 }
        }

        // Parse attribute name
        const attrMatch = code.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_-]*)/)
        if (!attrMatch) {
            i++
            continue
        }

        const attrName = attrMatch[1]!
        i += attrName.length

        // Skip whitespace
        while (i < code.length && /\s/.test(code[i]!)) i++

        // Check for value
        if (code[i] !== '=') {
            attributes.push({ name: attrName, value: 'true', location: baseLocation })
            continue
        }
        i++ // Skip =

        // Skip whitespace
        while (i < code.length && /\s/.test(code[i]!)) i++

        // Parse value
        if (code[i] === '"' || code[i] === "'") {
            const quote = code[i]
            let endQuote = i + 1
            while (endQuote < code.length && code[endQuote] !== quote) {
                if (code[endQuote] === '\\') endQuote++
                endQuote++
            }
            attributes.push({ name: attrName, value: code.slice(i + 1, endQuote), location: baseLocation })
            i = endQuote + 1
        } else if (code[i] === '{') {
            const endBrace = findBalancedBraceEnd(code, i)
            if (endBrace !== -1) {
                attributes.push({ name: attrName, value: code.slice(i, endBrace), location: baseLocation })
                i = endBrace
            }
        }
    }

    // Parse children until closing tag
    const closeTag = `</${tagName}>`
    const closeIndex = findClosingTag(code, i, tagName)

    let children: TemplateNode[] = []
    if (closeIndex !== -1 && closeIndex > i) {
        const childContent = code.slice(i, closeIndex)
        children = parseJSXChildren(childContent, baseLocation, filePath, expressions, loopContext)
        i = closeIndex + closeTag.length
    }

    const isComponent = tagName[0] === tagName[0]!.toUpperCase()
    const node: TemplateNode = isComponent ? {
        type: 'component',
        name: tagName,
        attributes: attributes.map(a => ({ ...a, value: a.value })),
        children,
        location: baseLocation,
        loopContext
    } : {
        type: 'element',
        tag: tagName.toLowerCase(),
        attributes: attributes.map(a => ({ ...a, value: a.value })),
        children,
        location: baseLocation,
        loopContext
    }

    return { node, endIndex: i }
}

/**
 * Find closing tag for an element
 */
function findClosingTag(code: string, startIndex: number, tagName: string): number {
    const closeTag = `</${tagName}>`
    let depth = 1
    let i = startIndex

    while (i < code.length && depth > 0) {
        // Check for closing tag
        if (code.slice(i, i + closeTag.length) === closeTag) {
            depth--
            if (depth === 0) return i
            i += closeTag.length
            continue
        }

        // Check for opening tag (same name, nested)
        const openPattern = new RegExp(`^<${tagName}(?:\\s|>|/>)`)
        const match = code.slice(i).match(openPattern)
        if (match) {
            // Check if self-closing
            const selfClosing = code.slice(i).match(new RegExp(`^<${tagName}[^>]*/>`))
            if (!selfClosing) {
                depth++
            }
            i += match[0].length
            continue
        }

        i++
    }

    return -1
}

/**
 * Find balanced brace end
 */
function findBalancedBraceEnd(code: string, startIndex: number): number {
    if (code[startIndex] !== '{') return -1

    let depth = 1
    let i = startIndex + 1
    let inString = false
    let stringChar = ''

    while (i < code.length && depth > 0) {
        const char = code[i]
        const prevChar = code[i - 1]

        // Handle escape
        if (prevChar === '\\') {
            i++
            continue
        }

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true
            stringChar = char
            i++
            continue
        }
        if (inString && char === stringChar) {
            inString = false
            i++
            continue
        }

        if (!inString) {
            if (char === '{') depth++
            else if (char === '}') depth--
        }

        i++
    }

    return depth === 0 ? i : -1
}
