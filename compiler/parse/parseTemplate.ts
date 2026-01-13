/**
 * Template Parser
 * 
 * Parses HTML template and extracts expressions
 * Phase 1: Only extracts, does not execute
 */

import { parse, parseFragment } from 'parse5'
import type { TemplateIR, TemplateNode, ElementNode, TextNode, ExpressionNode, AttributeIR, ExpressionIR, SourceLocation, LoopContext } from '../ir/types'
import { CompilerError, InvariantError } from '../errors/compilerError'
import { parseScript } from './parseScript'
import { detectMapExpression, extractLoopVariables, referencesLoopVariable } from './detectMapExpressions'
import { shouldAttachLoopContext, mergeLoopContext, extractLoopContextFromExpression } from './trackLoopContext'
import { INVARIANT } from '../validate/invariants'
import { lowerFragments } from '../transform/fragmentLowering'

// Generate stable IDs for expressions
let expressionIdCounter = 0
function generateExpressionId(): string {
  return `expr_${expressionIdCounter++}`
}

/**
 * Strip script and style blocks from HTML before parsing
 */
function stripBlocks(html: string): string {
  // Remove script blocks
  let stripped = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  // Remove style blocks
  stripped = stripped.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  return stripped
}

/**
 * Find the end of a balanced brace expression, handling strings and template literals
 * Returns the index after the closing brace, or -1 if unbalanced
 */
function findBalancedBraceEnd(html: string, startIndex: number): number {
  let braceCount = 1
  let i = startIndex + 1
  let inString = false
  let stringChar = ''
  let inTemplate = false

  while (i < html.length && braceCount > 0) {
    const char = html[i]
    const prevChar = i > 0 ? html[i - 1] : ''

    // Handle escape sequences
    if (prevChar === '\\') {
      i++
      continue
    }

    // Handle string literals (not inside template)
    if (!inString && !inTemplate && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
      i++
      continue
    }

    if (inString && char === stringChar) {
      inString = false
      stringChar = ''
      i++
      continue
    }

    // Handle template literals
    if (!inString && !inTemplate && char === '`') {
      inTemplate = true
      i++
      continue
    }

    if (inTemplate && char === '`') {
      inTemplate = false
      i++
      continue
    }

    // Handle ${} inside template literals - need to track nested braces
    if (inTemplate && char === '$' && html[i + 1] === '{') {
      // Skip the ${ and count as opening brace
      i += 2
      let templateBraceCount = 1
      while (i < html.length && templateBraceCount > 0) {
        if (html[i] === '{') templateBraceCount++
        else if (html[i] === '}') templateBraceCount--
        i++
      }
      continue
    }

    // Count braces only when not in strings or templates
    if (!inString && !inTemplate) {
      if (char === '{') braceCount++
      else if (char === '}') braceCount--
    }

    i++
  }

  return braceCount === 0 ? i : -1
}

/**
 * Normalize expressions before parsing
 * Replaces both attr={expr} and {textExpr} with placeholders so parse5 can parse the HTML correctly
 * without being confused by tags or braces inside expressions.
 * 
 * Uses balanced brace parsing to correctly handle:
 * - String literals with braces inside
 * - Template literals with ${} interpolations
 * - Arrow functions with object returns
 * - Multi-line JSX expressions
 */
function normalizeAllExpressions(html: string): { normalized: string; expressions: Map<string, string> } {
  const exprMap = new Map<string, string>()
  let exprCounter = 0
  let result = ''
  let lastPos = 0

  for (let i = 0; i < html.length; i++) {
    // Look for { and check if it's an expression
    // We handle both text expressions and attribute expressions: attr={...}
    if (html[i] === '{') {
      const j = findBalancedBraceEnd(html, i)

      if (j !== -1 && j > i + 1) {
        const expr = html.substring(i + 1, j - 1).trim()

        // Skip empty expressions
        if (expr.length === 0) {
          i++
          continue
        }

        const placeholder = `__ZEN_EXPR_${exprCounter++}`
        exprMap.set(placeholder, expr)

        result += html.substring(lastPos, i)
        result += placeholder
        lastPos = j
        i = j - 1
      }
    }
  }
  result += html.substring(lastPos)

  return { normalized: result, expressions: exprMap }
}


/**
 * Calculate source location from parse5 node
 */
function getLocation(node: any, originalHtml: string): SourceLocation {
  // parse5 provides sourceCodeLocation if available
  if (node.sourceCodeLocation) {
    return {
      line: node.sourceCodeLocation.startLine || 1,
      column: node.sourceCodeLocation.startCol || 1
    }
  }
  // Fallback if location info not available
  return { line: 1, column: 1 }
}

/**
 * Extract expressions from text content
 * Returns array of { expression, location } and the text with expressions replaced
 * Phase 7: Supports loop context for expressions inside map iterations
 */
function extractExpressionsFromText(
  text: string,
  baseLocation: SourceLocation,
  expressions: ExpressionIR[],
  normalizedExprs: Map<string, string>,
  loopContext?: LoopContext
): { processedText: string; nodes: (TextNode | ExpressionNode)[] } {
  const nodes: (TextNode | ExpressionNode)[] = []
  let processedText = ''
  let currentIndex = 0

  // Match __ZEN_EXPR_N placeholders
  const expressionRegex = /__ZEN_EXPR_\d+/g
  let match

  while ((match = expressionRegex.exec(text)) !== null) {
    const beforeExpr = text.substring(currentIndex, match.index)
    if (beforeExpr) {
      nodes.push({
        type: 'text',
        value: beforeExpr,
        location: {
          line: baseLocation.line,
          column: baseLocation.column + currentIndex
        }
      })
      processedText += beforeExpr
    }

    // Resolve placeholder to original expression code
    const placeholder = match[0]
    const exprCode = (normalizedExprs.get(placeholder) || '').trim()
    const exprId = generateExpressionId()
    const exprLocation: SourceLocation = {
      line: baseLocation.line,
      column: baseLocation.column + match.index
    }

    const exprIR: ExpressionIR = {
      id: exprId,
      code: exprCode,
      location: exprLocation
    }
    expressions.push(exprIR)

    // Phase 7: Loop context detection and attachment
    const mapLoopContext = extractLoopContextFromExpression(exprIR)
    const activeLoopContext = mergeLoopContext(loopContext, mapLoopContext)
    const attachedLoopContext = shouldAttachLoopContext(exprIR, activeLoopContext)

    nodes.push({
      type: 'expression',
      expression: exprId,
      location: exprLocation,
      loopContext: attachedLoopContext
    })

    processedText += `{${exprCode}}`
    currentIndex = match.index + match[0].length
  }

  // Add remaining text
  const remaining = text.substring(currentIndex)
  if (remaining) {
    nodes.push({
      type: 'text',
      value: remaining,
      location: {
        line: baseLocation.line,
        column: baseLocation.column + currentIndex
      }
    })
    processedText += remaining
  }

  // If no expressions found, return single text node
  if (nodes.length === 0) {
    nodes.push({
      type: 'text',
      value: text,
      location: baseLocation
    })
    processedText = text
  }

  return { processedText, nodes }
}

/**
 * Parse attribute value - may contain expressions
 * Phase 7: Supports loop context for expressions inside map iterations
 */
function parseAttributeValue(
  value: string,
  baseLocation: SourceLocation,
  expressions: ExpressionIR[],
  normalizedExprs: Map<string, string>,
  loopContext?: LoopContext  // Phase 7: Loop context from parent map expressions
): string | ExpressionIR {
  // Check if this is a normalized expression placeholder
  if (value.startsWith('__ZEN_EXPR_')) {
    const exprCode = normalizedExprs.get(value)
    if (!exprCode) {
      throw new Error(`Normalized expression placeholder not found: ${value}`)
    }

    const exprId = generateExpressionId()

    expressions.push({
      id: exprId,
      code: exprCode,
      location: baseLocation
    })

    return {
      id: exprId,
      code: exprCode,
      location: baseLocation
    }
  }

  // Check if attribute value is an expression { ... } (shouldn't happen after normalization)
  const exprMatch = value.match(/^\{([^}]+)\}$/)
  if (exprMatch && exprMatch[1]) {
    const exprCode = exprMatch[1].trim()
    const exprId = generateExpressionId()

    expressions.push({
      id: exprId,
      code: exprCode,
      location: baseLocation
    })

    return {
      id: exprId,
      code: exprCode,
      location: baseLocation
    }
  }

  // Regular string value
  return value
}

/**
 * Convert parse5 node to TemplateNode
 * Phase 7: Supports loop context propagation for map expressions
 */
function parseNode(
  node: any,
  originalHtml: string,
  expressions: ExpressionIR[],
  normalizedExprs: Map<string, string>,
  parentLoopContext?: LoopContext  // Phase 7: Loop context from parent map expressions
): TemplateNode | null {
  if (node.nodeName === '#text') {
    const text = node.value || ''
    const location = getLocation(node, originalHtml)

    // Extract expressions from text
    // Phase 7: Pass loop context to detect map expressions and attach context
    const { nodes } = extractExpressionsFromText(node.value, location, expressions, normalizedExprs, parentLoopContext)

    // If single text node with no expressions, return it
    if (nodes.length === 1 && nodes[0] && nodes[0].type === 'text') {
      return nodes[0]
    }

    // Otherwise, we need to handle multiple nodes
    // For Phase 1, we'll flatten to text for now (will be handled in future phases)
    // This is a limitation we accept for Phase 1
    const firstNode = nodes[0]
    if (firstNode) {
      return firstNode
    }
    return {
      type: 'text',
      value: text,
      location
    }
  }

  if (node.nodeName === '#comment') {
    // Skip comments for Phase 1
    return null
  }

  if (node.nodeName && node.nodeName !== '#text' && node.nodeName !== '#comment') {
    const location = getLocation(node, originalHtml)
    const tag = node.tagName?.toLowerCase() || node.nodeName

    // Extract original tag name from source HTML to preserve casing (parse5 lowercases everything)
    let originalTag = node.tagName || node.nodeName
    if (node.sourceCodeLocation && node.sourceCodeLocation.startOffset !== undefined) {
      const startOffset = node.sourceCodeLocation.startOffset
      // Find the tag name in original HTML (after '<')
      const tagMatch = originalHtml.slice(startOffset).match(/^<([a-zA-Z][a-zA-Z0-9._-]*)/)
      if (tagMatch && tagMatch[1]) {
        originalTag = tagMatch[1]
      }
    }

    // INV005: <template> tags are forbidden — use compound components instead
    if (tag === 'template') {
      throw new InvariantError(
        INVARIANT.TEMPLATE_TAG,
        `<template> tags are forbidden in Zenith. Use compound components (e.g., Card.Header) for named slots.`,
        'Named slots use compound component pattern (Card.Header), not <template> tags.',
        'unknown', // filePath passed to parseTemplate
        location.line,
        location.column
      )
    }

    // Parse attributes
    const attributes: AttributeIR[] = []
    if (node.attrs) {
      for (const attr of node.attrs) {
        const attrLocation = node.sourceCodeLocation?.attrs?.[attr.name]
          ? {
            line: node.sourceCodeLocation.attrs[attr.name].startLine || location.line,
            column: node.sourceCodeLocation.attrs[attr.name].startCol || location.column
          }
          : location

        // INV006: slot="" attributes are forbidden — use compound components instead
        if (attr.name === 'slot') {
          throw new InvariantError(
            INVARIANT.SLOT_ATTRIBUTE,
            `slot="${attr.value || ''}" attribute is forbidden. Use compound components (e.g., Card.Header) for named slots.`,
            'Named slots use compound component pattern (Card.Header), not slot="" attributes.',
            'unknown',
            attrLocation.line,
            attrLocation.column
          )
        }

        // Handle :attr="expr" syntax (colon-prefixed reactive attributes)
        let attrName = attr.name
        let attrValue = attr.value || ''
        let isReactive = false

        if (attrName.startsWith(':')) {
          // This is a reactive attribute like :class="expr"
          attrName = attrName.slice(1) // Remove the colon
          isReactive = true
          // The value is already a string expression (not in braces)
          // Treat it as an expression
          const exprId = generateExpressionId()
          const exprCode = attrValue.trim()

          const exprIR: ExpressionIR = {
            id: exprId,
            code: exprCode,
            location: attrLocation
          }
          expressions.push(exprIR)

          // Phase 7: Attach loop context if expression references loop variables
          const attachedLoopContext = shouldAttachLoopContext(exprIR, parentLoopContext)

          attributes.push({
            name: attrName, // Store without colon (e.g., "class" not ":class")
            value: exprIR,
            location: attrLocation,
            loopContext: attachedLoopContext
          })
        } else {
          // Regular attribute or attr={expr} syntax
          const attrValueResult = parseAttributeValue(attrValue, attrLocation, expressions, normalizedExprs, parentLoopContext)

          // Transform event attributes: onclick -> data-zen-click, onchange -> data-zen-change, etc.
          let finalAttrName = attrName
          if (attrName.startsWith('on') && attrName.length > 2) {
            const eventType = attrName.slice(2) // Remove "on" prefix
            finalAttrName = `data-zen-${eventType}`
          }

          if (typeof attrValueResult === 'string') {
            // Static attribute value
            attributes.push({
              name: finalAttrName,
              value: attrValueResult,
              location: attrLocation
            })
          } else {
            // Expression attribute value
            const exprIR = attrValueResult

            // Phase 7: Attach loop context if expression references loop variables
            const attachedLoopContext = shouldAttachLoopContext(exprIR, parentLoopContext)

            attributes.push({
              name: finalAttrName,
              value: exprIR,
              location: attrLocation,
              loopContext: attachedLoopContext
            })
          }
        }
      }
    }

    // Parse children
    const children: TemplateNode[] = []
    if (node.childNodes) {
      for (const child of node.childNodes) {
        if (child.nodeName === '#text') {
          // Handle text nodes that may contain expressions
          const text = child.value || ''
          const location = getLocation(child, originalHtml)
          const { nodes: textNodes } = extractExpressionsFromText(text, location, expressions, normalizedExprs, parentLoopContext)

          // Add all nodes from text (can be multiple: text + expression + text)
          for (const textNode of textNodes) {
            children.push(textNode)
          }
        } else {
          const childNode = parseNode(child, originalHtml, expressions, normalizedExprs, parentLoopContext)
          if (childNode) {
            children.push(childNode)
          }
        }
      }
    }

    // Phase 7: Check if any child expression is a map expression and extract its loop context
    // This allows nested loops to work correctly
    let elementLoopContext = parentLoopContext

    // Check children for map expressions (they create new loop contexts)
    for (const child of children) {
      if (child.type === 'expression' && child.loopContext) {
        // If we find a map expression child, merge its context
        elementLoopContext = mergeLoopContext(elementLoopContext, child.loopContext)
      }
    }

    // Check if this is a custom component (starts with uppercase)
    const isComponent = originalTag.length > 0 && originalTag[0] === originalTag[0].toUpperCase()

    if (isComponent) {
      // This is a component node
      return {
        type: 'component',
        name: originalTag,
        attributes,
        children,
        location,
        loopContext: elementLoopContext
      }
    } else {
      // This is a regular HTML element
      return {
        type: 'element',
        tag,
        attributes,
        children,
        location,
        loopContext: elementLoopContext
      }
    }
  }

  return null
}

/**
 * Parse template from HTML string
 */
export function parseTemplate(html: string, filePath: string): TemplateIR {
  // Strip script and style blocks
  let templateHtml = stripBlocks(html)

  // Normalize all expressions so parse5 can parse them safely
  const { normalized, expressions: normalizedExprs } = normalizeAllExpressions(templateHtml)
  templateHtml = normalized

  try {
    // Parse HTML using parseFragment
    const fragment = parseFragment(templateHtml, {
      sourceCodeLocationInfo: true
    })

    const expressions: ExpressionIR[] = []
    const nodes: TemplateNode[] = []

    // Parse fragment children
    if (fragment.childNodes) {
      for (const node of fragment.childNodes) {
        const parsed = parseNode(node, templateHtml, expressions, normalizedExprs, undefined)
        if (parsed) {
          nodes.push(parsed)
        }
      }
    }

    // Phase 8: Lower JSX expressions to structural fragments
    // This transforms expressions like {cond ? <A /> : <B />} into ConditionalFragmentNode
    const loweredNodes = lowerFragments(nodes, filePath, expressions)

    return {
      raw: templateHtml,
      nodes: loweredNodes,
      expressions
    }
  } catch (error: any) {
    throw new CompilerError(
      `Template parsing failed: ${error.message}`,
      filePath,
      1,
      1
    )
  }
}

