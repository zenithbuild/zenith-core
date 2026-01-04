/**
 * Transform Template Nodes
 * 
 * Transforms IR nodes into HTML strings and collects bindings
 */

import type { TemplateNode, ElementNode, TextNode, ExpressionNode, ExpressionIR, LoopContext } from '../ir/types'
import type { Binding } from '../output/types'

let bindingIdCounter = 0

function generateBindingId(): string {
  return `exp_${bindingIdCounter++}`
}

/**
 * Transform a template node to HTML and collect bindings
 * Phase 7: Supports loop context propagation for map expressions
 */
export function transformNode(
  node: TemplateNode,
  expressions: ExpressionIR[],
  parentLoopContext?: LoopContext  // Phase 7: Loop context from parent map expressions
): { html: string; bindings: Binding[] } {
  const bindings: Binding[] = []
  
  function transform(node: TemplateNode, loopContext?: LoopContext): string {
    switch (node.type) {
      case 'text':
        return escapeHtml((node as TextNode).value)
      
      case 'expression': {
        const exprNode = node as ExpressionNode
        // Find the expression in the expressions array
        const expr = expressions.find(e => e.id === exprNode.expression)
        if (!expr) {
          throw new Error(`Expression ${exprNode.expression} not found`)
        }
        
        const bindingId = generateBindingId()
        // Phase 7: Use loop context from ExpressionNode if available, otherwise use passed context
        const activeLoopContext = exprNode.loopContext || loopContext
        
        bindings.push({
          id: bindingId,
          type: 'text',
          target: 'data-zen-text',
          expression: expr.code,
          location: expr.location,
          loopContext: activeLoopContext  // Phase 7: Attach loop context to binding
        })
        
        return `<span data-zen-text="${bindingId}"></span>`
      }
      
      case 'element': {
        const elNode = node as ElementNode
        const tag = elNode.tag
        
        // Build attributes
        const attrs: string[] = []
        for (const attr of elNode.attributes) {
          if (typeof attr.value === 'string') {
            // Static attribute
            const value = escapeHtml(attr.value)
            attrs.push(`${attr.name}="${value}"`)
          } else {
            // Expression attribute
            const expr = attr.value as ExpressionIR
            const bindingId = generateBindingId()
            // Phase 7: Use loop context from AttributeIR if available, otherwise use element's loop context
            const activeLoopContext = attr.loopContext || loopContext
            
            bindings.push({
              id: bindingId,
              type: 'attribute',
              target: attr.name,  // e.g., "class", "style"
              expression: expr.code,
              location: expr.location,
              loopContext: activeLoopContext  // Phase 7: Attach loop context to binding
            })
            
            // Use data-zen-attr-{name} for attribute expressions
            attrs.push(`data-zen-attr-${attr.name}="${bindingId}"`)
          }
        }
        
        const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
        
        // Phase 7: Use loop context from ElementNode if available, otherwise use passed context
        const activeLoopContext = elNode.loopContext || loopContext
        
        // Transform children
        const childrenHtml = elNode.children.map(child => transform(child, activeLoopContext)).join('')
        
        // Self-closing tags
        const voidElements = new Set([
          'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
          'link', 'meta', 'param', 'source', 'track', 'wbr'
        ])
        
        if (voidElements.has(tag.toLowerCase()) && childrenHtml === '') {
          return `<${tag}${attrStr} />`
        }
        
        return `<${tag}${attrStr}>${childrenHtml}</${tag}>`
      }
    }
  }
  
  const html = transform(node, parentLoopContext)
  return { html, bindings }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

