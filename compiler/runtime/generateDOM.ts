/**
 * DOM Generation
 * 
 * Generates JavaScript code that creates DOM elements from template nodes
 */

import type { TemplateNode, ElementNode, TextNode, ExpressionNode, ExpressionIR } from '../ir/types'

/**
 * Generate DOM creation code from a template node
 * Returns JavaScript code that creates and returns a DOM element or text node
 */
export function generateDOMCode(
  node: TemplateNode,
  expressions: ExpressionIR[],
  indent: string = '  ',
  varCounter: { count: number } = { count: 0 }
): { code: string; varName: string } {
  const varName = `node_${varCounter.count++}`
  
  switch (node.type) {
    case 'text': {
      const textNode = node as TextNode
      const escapedValue = JSON.stringify(textNode.value)
      return {
        code: `${indent}const ${varName} = document.createTextNode(${escapedValue});`,
        varName
      }
    }
    
    case 'expression': {
      const exprNode = node as ExpressionNode
      const expr = expressions.find(e => e.id === exprNode.expression)
      if (!expr) {
        throw new Error(`Expression ${exprNode.expression} not found`)
      }
      
      // Create a span element to hold the expression result
      return {
        code: `${indent}const ${varName} = document.createElement('span');
${indent}${varName}.textContent = String(${expr.id}(state) ?? '');
${indent}${varName}.setAttribute('data-zen-expr', '${exprNode.expression}');`,
        varName
      }
    }
    
    case 'element': {
      const elNode = node as ElementNode
      const tag = elNode.tag
      
      let code = `${indent}const ${varName} = document.createElement('${tag}');\n`
      
      // Handle attributes
      for (const attr of elNode.attributes) {
        if (typeof attr.value === 'string') {
          // Static attribute
          const escapedValue = JSON.stringify(attr.value)
          code += `${indent}${varName}.setAttribute('${attr.name}', ${escapedValue});\n`
        } else {
          // Expression attribute
          const expr = attr.value as ExpressionIR
          const attrName = attr.name === 'className' ? 'class' : attr.name
          
          // Handle special attributes
          if (attrName === 'class' || attrName === 'className') {
            code += `${indent}${varName}.className = String(${expr.id}(state) ?? '');\n`
          } else if (attrName === 'style') {
            code += `${indent}const styleValue_${varCounter.count} = ${expr.id}(state);
${indent}if (typeof styleValue_${varCounter.count} === 'string') {
${indent}  ${varName}.style.cssText = styleValue_${varCounter.count};
${indent}}\n`
          } else if (attrName.startsWith('on')) {
            // Event handler - store handler name, will be bound later
            const eventType = attrName.slice(2).toLowerCase() // Remove 'on' prefix
            code += `${indent}${varName}.setAttribute('data-zen-${eventType}', ${JSON.stringify(attr.value as any)});\n`
          } else {
            const tempVar = `attr_${varCounter.count++}`
            code += `${indent}const ${tempVar} = ${expr.id}(state);
${indent}if (${tempVar} != null && ${tempVar} !== false) {
${indent}  ${varName}.setAttribute('${attrName}', String(${tempVar}));
${indent}}\n`
          }
        }
      }
      
      // Handle children
      if (elNode.children.length > 0) {
        for (const child of elNode.children) {
          const childResult = generateDOMCode(child, expressions, indent, varCounter)
          code += `${childResult.code}\n`
          code += `${indent}${varName}.appendChild(${childResult.varName});\n`
        }
      }
      
      return { code, varName }
    }
  }
}

/**
 * Generate DOM creation code for multiple nodes
 * Returns a function that creates DOM elements
 */
export function generateDOMFunction(
  nodes: TemplateNode[],
  expressions: ExpressionIR[],
  functionName: string = 'renderTemplate'
): string {
  if (nodes.length === 0) {
    return `function ${functionName}(state) {
  const fragment = document.createDocumentFragment();
  return fragment;
}`
  }
  
  const varCounter = { count: 0 }
  let code = `function ${functionName}(state) {
`
  
  if (nodes.length === 1) {
    const node = nodes[0]
    if (!node) {
      throw new Error('Empty nodes array passed to generateDOMFunction')
    }
    const result = generateDOMCode(node, expressions, '  ', varCounter)
    code += result.code
    code += `\n  return ${result.varName};\n}`
    return code
  }
  
  // Multiple nodes - create a fragment
  code += `  const fragment = document.createDocumentFragment();\n`
  
  for (const node of nodes) {
    const result = generateDOMCode(node, expressions, '  ', varCounter)
    code += `${result.code}\n`
    code += `  fragment.appendChild(${result.varName});\n`
  }
  
  code += `  return fragment;
}`
  
  return code
}
