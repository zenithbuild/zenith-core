/**
 * Generate Static HTML from Transformed Nodes
 * 
 * This generates pure HTML with no expressions or runtime code
 */

import type { TemplateNode } from '../ir/types'
import { transformNode } from './transformNode'

/**
 * Generate HTML string from template nodes
 */
export function generateHTML(
  nodes: TemplateNode[],
  expressions: any[]
): { html: string; bindings: any[] } {
  let html = ''
  const allBindings: any[] = []
  
  for (const node of nodes) {
    const { html: nodeHtml, bindings } = transformNode(node, expressions)
    html += nodeHtml
    allBindings.push(...bindings)
  }
  
  return { html, bindings: allBindings }
}

