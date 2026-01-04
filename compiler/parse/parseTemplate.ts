/**
 * Template Parser
 * 
 * Parses HTML template and extracts expressions
 * Phase 1: Only extracts, does not execute
 */

import { parse, parseFragment } from 'parse5'
import type { TemplateIR, TemplateNode, ElementNode, TextNode, ExpressionNode, AttributeIR, ExpressionIR, SourceLocation, LoopContext } from '../ir/types'
import { CompilerError } from '../errors/compilerError'
import { parseScript } from './parseScript'
import { detectMapExpression, extractLoopVariables, referencesLoopVariable } from './detectMapExpressions'
import { shouldAttachLoopContext, mergeLoopContext, extractLoopContextFromExpression } from './trackLoopContext'

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
 * Normalize attribute expressions before parsing
 * Replaces attr={expr} with attr="__ZEN_EXPR_base64" so parse5 can parse it
 */
function normalizeAttributeExpressions(html: string): { normalized: string; expressions: Map<string, string> } {
  const exprMap = new Map<string, string>()
  let exprCounter = 0
  
  // Match attributes with expression values: attr={...}
  // Use a more sophisticated regex to handle nested braces and quotes
  const normalized = html.replace(/(\w+)=\{([^}]+)\}/g, (match, attrName, expr) => {
    const placeholder = `__ZEN_EXPR_${exprCounter++}`
    exprMap.set(placeholder, expr.trim())
    return `${attrName}="${placeholder}"`
  })
  
  return { normalized, expressions: exprMap }
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
  loopContext?: LoopContext  // Phase 7: Loop context from parent map expressions
): { processedText: string; nodes: (TextNode | ExpressionNode)[] } {
  const nodes: (TextNode | ExpressionNode)[] = []
  let processedText = ''
  let currentIndex = 0
  
  // Match { ... } expressions (non-greedy)
  const expressionRegex = /\{([^}]+)\}/g
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
    
    // Extract expression
    const exprCode = (match[1] || '').trim()
    const exprId = generateExpressionId()
    const exprLocation: SourceLocation = {
      line: baseLocation.line,
      column: baseLocation.column + match.index + 1 // +1 for opening brace
    }
    
    const exprIR: ExpressionIR = {
      id: exprId,
      code: exprCode,
      location: exprLocation
    }
    expressions.push(exprIR)
    
    // Phase 7: Detect if this is a map expression and extract loop context
    const mapLoopContext = extractLoopContextFromExpression(exprIR)
    const activeLoopContext = mergeLoopContext(loopContext, mapLoopContext)
    
    // Phase 7: Attach loop context if expression references loop variables
    const attachedLoopContext = shouldAttachLoopContext(exprIR, activeLoopContext)
    
    nodes.push({
      type: 'expression',
      expression: exprId,
      location: exprLocation,
      loopContext: attachedLoopContext
    })
    
    processedText += `{${exprCode}}` // Keep in processed text for now
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
    const { nodes } = extractExpressionsFromText(text, location, expressions, parentLoopContext)
    
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
          
          if (typeof attrValueResult === 'string') {
            // Static attribute value
            attributes.push({
              name: attrName,
              value: attrValueResult,
              location: attrLocation
            })
          } else {
            // Expression attribute value
            const exprIR = attrValueResult
            
            // Phase 7: Attach loop context if expression references loop variables
            const attachedLoopContext = shouldAttachLoopContext(exprIR, parentLoopContext)
            
            attributes.push({
              name: attrName,
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
          const { nodes: textNodes } = extractExpressionsFromText(text, location, expressions, parentLoopContext)
          
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
    
    return {
      type: 'element',
      tag,
      attributes,
      children,
      location,
      loopContext: elementLoopContext  // Phase 7: Inherited loop context for child processing
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
  
  // Normalize attribute expressions so parse5 can parse them
  const { normalized, expressions: normalizedExprs } = normalizeAttributeExpressions(templateHtml)
  templateHtml = normalized
  
  try {
    // Parse HTML using parseFragment (handles fragments without html/body wrapper)
    const fragment = parseFragment(templateHtml, {
      sourceCodeLocationInfo: true
    })
    
    const expressions: ExpressionIR[] = []
    const nodes: TemplateNode[] = []
    
    // Parse fragment children
    // Phase 7: Start with no loop context (top-level expressions)
    if (fragment.childNodes) {
      for (const node of fragment.childNodes) {
        const parsed = parseNode(node, templateHtml, expressions, normalizedExprs, undefined)
        if (parsed) {
          nodes.push(parsed)
        }
      }
    }
    
    return {
      raw: templateHtml,
      nodes,
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

