/**
 * Transform Template Nodes
 * 
 * Transforms IR nodes into HTML strings and collects bindings
 * 
 * Phase 8: Supports fragment node types (loop-fragment, conditional-fragment, optional-fragment)
 */

import type { 
  TemplateNode, 
  ElementNode, 
  TextNode, 
  ExpressionNode, 
  ExpressionIR, 
  LoopContext,
  LoopFragmentNode,
  ConditionalFragmentNode,
  OptionalFragmentNode,
  ComponentNode
} from '../ir/types'
import type { Binding } from '../output/types'

let loopIdCounter = 0

function generateLoopId(): string {
  return `loop_${loopIdCounter++}`
}

let bindingIdCounter = 0

function generateBindingId(): string {
  return `expr_${bindingIdCounter++}`
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

        const bindingId = expr.id
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

        return `<span data-zen-text="${bindingId}" style="display: contents;"></span>`
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
            const bindingId = expr.id
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

      case 'loop-fragment': {
        // Loop fragment: {items.map(item => <li>...</li>)} or <for each="item" in="items">
        // For SSR/SSG, we render one instance of the body as a template
        // The runtime will hydrate and expand this for each actual item
        const loopNode = node as LoopFragmentNode
        const loopId = generateLoopId()
        const activeLoopContext = loopNode.loopContext || loopContext

        // Create a binding for the loop expression
        bindings.push({
          id: loopId,
          type: 'loop',
          target: 'data-zen-loop',
          expression: loopNode.source,
          location: loopNode.location,
          loopContext: activeLoopContext,
          loopMeta: {
            itemVar: loopNode.itemVar,
            indexVar: loopNode.indexVar,
            bodyTemplate: loopNode.body
          }
        })

        // Generate the loop body template HTML
        // For SSR, we render ONE visible instance of the body as a template/placeholder
        // The runtime will clone this for each item in the array
        const bodyHtml = loopNode.body.map(child => transform(child, activeLoopContext)).join('')
        
        // Render container with body visible for SSR (not in hidden <template>)
        // Runtime will clear and re-render with actual data
        return `<div data-zen-loop="${loopId}" data-zen-source="${escapeHtml(loopNode.source)}" data-zen-item="${loopNode.itemVar}"${loopNode.indexVar ? ` data-zen-index="${loopNode.indexVar}"` : ''} style="display: contents;">${bodyHtml}</div>`
      }

      case 'conditional-fragment': {
        // Conditional fragment: {cond ? <A /> : <B />}
        // Both branches are pre-rendered, runtime toggles visibility
        const condNode = node as ConditionalFragmentNode
        const condId = generateBindingId()
        const activeLoopContext = condNode.loopContext || loopContext

        bindings.push({
          id: condId,
          type: 'conditional',
          target: 'data-zen-cond',
          expression: condNode.condition,
          location: condNode.location,
          loopContext: activeLoopContext
        })

        // Render both branches
        const consequentHtml = condNode.consequent.map(child => transform(child, activeLoopContext)).join('')
        const alternateHtml = condNode.alternate.map(child => transform(child, activeLoopContext)).join('')

        return `<div data-zen-cond="${condId}" data-zen-cond-true style="display: contents;">${consequentHtml}</div><div data-zen-cond="${condId}" data-zen-cond-false style="display: none;">${alternateHtml}</div>`
      }

      case 'optional-fragment': {
        // Optional fragment: {cond && <A />}
        // Fragment is pre-rendered, runtime toggles mount/unmount
        const optNode = node as OptionalFragmentNode
        const optId = generateBindingId()
        const activeLoopContext = optNode.loopContext || loopContext

        bindings.push({
          id: optId,
          type: 'optional',
          target: 'data-zen-opt',
          expression: optNode.condition,
          location: optNode.location,
          loopContext: activeLoopContext
        })

        const fragmentHtml = optNode.fragment.map(child => transform(child, activeLoopContext)).join('')

        return `<div data-zen-opt="${optId}" style="display: contents;">${fragmentHtml}</div>`
      }

      case 'component': {
        // Component node - should have been resolved before reaching here
        // This is a fallback for unresolved components
        const compNode = node as ComponentNode
        console.warn(`[Zenith] Unresolved component in transformNode: ${compNode.name}`)
        
        // Render children as a fragment
        const childrenHtml = compNode.children.map(child => transform(child, loopContext)).join('')
        return `<!-- unresolved: ${compNode.name} -->${childrenHtml}`
      }

      default: {
        // Handle any unknown node types
        console.warn(`[Zenith] Unknown node type in transformNode: ${(node as any).type}`)
        return ''
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

