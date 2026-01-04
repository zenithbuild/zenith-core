// compiler/expression.ts
// Expression parser and analyzer for dynamic HTML expressions in Zenith
// Handles: conditionals (&&, ||), ternaries (?:), map iterations, and inline expressions

/**
 * Expression types that can appear in { } blocks in HTML
 */
export type ExpressionType = 
  | 'static'           // Simple state reference: { count }
  | 'conditional'      // Boolean conditional: { isLoggedIn && <span>...</span> }
  | 'ternary'          // Ternary: { isLoading ? "Loading" : "Submit" }
  | 'map'              // Array map: { items.map(item => <li>{item}</li>) }
  | 'complex'          // Complex expression requiring runtime evaluation

/**
 * Parsed expression information
 */
export interface ParsedExpression {
  type: ExpressionType
  raw: string                      // Original expression text
  condition?: string               // For conditionals/ternaries: the condition part
  trueBranch?: string              // For conditionals/ternaries: the true branch
  falseBranch?: string             // For ternaries: the false branch
  arraySource?: string             // For map: the array being mapped
  itemName?: string                // For map: the item variable name
  indexName?: string               // For map: the index variable name (optional)
  mapBody?: string                 // For map: the body/template of the map
  keyExpression?: string           // For map: the key attribute expression
  dependencies: string[]           // State variables this expression depends on
  isStatic: boolean                // Can be evaluated at build time
  hasJSX: boolean                  // Contains JSX/HTML elements
}

/**
 * Result of analyzing an expression block in HTML
 */
export interface ExpressionBlock {
  startIndex: number               // Position in source HTML
  endIndex: number                 // End position in source HTML
  expression: ParsedExpression
  placeholderId: string            // Unique ID for DOM placeholder
}

/**
 * Decode HTML entities in a string
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Parse a single expression string (content inside { })
 */
export function parseExpression(raw: string, declaredStates: Set<string>): ParsedExpression {
  // Decode HTML entities first (parse5 encodes them during serialization)
  const decoded = decodeHtmlEntities(raw)
  const trimmed = decoded.trim()
  
  // Track dependencies
  const dependencies: string[] = []
  
  // Check if it references declared states
  for (const state of declaredStates) {
    const stateRegex = new RegExp(`\\b${state}\\b`, 'g')
    if (stateRegex.test(trimmed)) {
      dependencies.push(state)
    }
  }
  
  // Check for JSX/HTML in the expression
  const hasJSX = /<[a-zA-Z][^>]*>/.test(trimmed) || /\/>/.test(trimmed)
  
  // Determine expression type
  const type = detectExpressionType(trimmed)
  
  const result: ParsedExpression = {
    type,
    raw: trimmed,
    dependencies,
    isStatic: dependencies.length === 0 && !hasJSX,
    hasJSX
  }
  
  // Parse based on type
  switch (type) {
    case 'conditional':
      parseConditional(trimmed, result)
      break
    case 'ternary':
      parseTernary(trimmed, result)
      break
    case 'map':
      parseMap(trimmed, result)
      break
    case 'static':
      // Simple identifier, no additional parsing needed
      break
    case 'complex':
      // Complex expression, evaluate at runtime
      break
  }
  
  return result
}

/**
 * Detect the type of expression
 */
function detectExpressionType(expr: string): ExpressionType {
  const trimmed = expr.trim()
  
  // Check for .map() - most specific first
  if (/\.\s*map\s*\(/.test(trimmed)) {
    return 'map'
  }
  
  // Check for ternary operator (must handle nested parens/brackets)
  if (hasTernary(trimmed)) {
    return 'ternary'
  }
  
  // Check for && or || conditionals (with JSX)
  if (/\s*&&\s*/.test(trimmed) || /\s*\|\|\s*/.test(trimmed)) {
    return 'conditional'
  }
  
  // Simple identifier - static reference
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return 'static'
  }
  
  // Complex expression
  return 'complex'
}

/**
 * Check if expression contains a ternary at the top level (not nested)
 */
function hasTernary(expr: string): boolean {
  let depth = 0
  let inString = false
  let stringChar = ''
  let inTemplate = false
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i]
    const prevChar = i > 0 ? expr[i - 1] : ''
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
      if (char === '`') inTemplate = true
      continue
    }
    
    if (inString && char === stringChar && prevChar !== '\\') {
      inString = false
      inTemplate = false
      continue
    }
    
    if (inString) continue
    
    // Track depth for parens, brackets, braces
    if (char === '(' || char === '[' || char === '{') {
      depth++
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth--
      continue
    }
    
    // Check for ? at depth 0 (top level)
    if (char === '?' && depth === 0) {
      // Make sure it's not ?. or ??
      const nextChar = i < expr.length - 1 ? expr[i + 1] : ''
      if (nextChar !== '.' && nextChar !== '?') {
        return true
      }
    }
  }
  
  return false
}

/**
 * Parse a conditional expression (&&, ||)
 */
function parseConditional(expr: string, result: ParsedExpression): void {
  // Handle both && and ||
  // Pattern: condition && <element>
  // Pattern: !condition && <element>
  
  // Find the && or || operator at the top level
  let depth = 0
  let inString = false
  let stringChar = ''
  let operatorIndex = -1
  let operatorType = ''
  
  for (let i = 0; i < expr.length - 1; i++) {
    const char = expr[i]
    const nextChar = expr[i + 1]
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    
    if (inString && char === stringChar && (i === 0 || expr[i - 1] !== '\\')) {
      inString = false
      continue
    }
    
    if (inString) continue
    
    // Track depth
    if (char === '(' || char === '[' || char === '{' || char === '<') {
      depth++
      continue
    }
    if (char === ')' || char === ']' || char === '}' || char === '>') {
      depth--
      continue
    }
    
    // Look for && or || at depth 0
    if (depth === 0) {
      if (char === '&' && nextChar === '&') {
        operatorIndex = i
        operatorType = '&&'
        break
      }
      if (char === '|' && nextChar === '|') {
        operatorIndex = i
        operatorType = '||'
        break
      }
    }
  }
  
  if (operatorIndex > -1) {
    result.condition = expr.substring(0, operatorIndex).trim()
    result.trueBranch = expr.substring(operatorIndex + 2).trim()
    
    // For || operator, the semantics are reversed
    if (operatorType === '||') {
      // a || b means: if !a then b
      // So we invert: condition becomes !condition, trueBranch stays
      result.condition = `!(${result.condition})`
    }
  }
}

/**
 * Parse a ternary expression (condition ? true : false)
 */
function parseTernary(expr: string, result: ParsedExpression): void {
  let depth = 0
  let inString = false
  let stringChar = ''
  let questionIndex = -1
  let colonIndex = -1
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i]
    const prevChar = i > 0 ? expr[i - 1] : ''
    const nextChar = i < expr.length - 1 ? expr[i + 1] : ''
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    
    if (inString && char === stringChar && prevChar !== '\\') {
      inString = false
      continue
    }
    
    if (inString) continue
    
    // Track depth
    if (char === '(' || char === '[' || char === '{') {
      depth++
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth--
      continue
    }
    
    // Find ? at depth 0
    if (char === '?' && depth === 0 && questionIndex === -1) {
      // Make sure it's not ?. or ??
      if (nextChar !== '.' && nextChar !== '?') {
        questionIndex = i
      }
    }
    
    // Find : at depth 0 (after ?)
    if (char === ':' && depth === 0 && questionIndex > -1 && colonIndex === -1) {
      colonIndex = i
    }
  }
  
  if (questionIndex > -1 && colonIndex > -1) {
    result.condition = expr.substring(0, questionIndex).trim()
    result.trueBranch = expr.substring(questionIndex + 1, colonIndex).trim()
    result.falseBranch = expr.substring(colonIndex + 1).trim()
  }
}

/**
 * Parse a map expression (array.map(item => <element>))
 */
function parseMap(expr: string, result: ParsedExpression): void {
  // Pattern: arraySource.map((item, index?) => body)
  // Pattern: arraySource.map(item => body)
  
  const mapMatch = expr.match(/^(.+?)\s*\.\s*map\s*\(\s*\(?([^)=,]+)(?:\s*,\s*([^)=]+))?\)?\s*=>\s*(.+)\)$/s)
  
  if (mapMatch) {
    result.arraySource = mapMatch[1]?.trim()
    result.itemName = mapMatch[2]?.trim()
    result.indexName = mapMatch[3]?.trim()
    result.mapBody = mapMatch[4]?.trim()
    
    // Extract key from map body if present
    const keyMatch = result.mapBody?.match(/key\s*=\s*\{([^}]+)\}|key\s*=\s*"([^"]+)"|key\s*=\s*'([^']+)'/)
    if (keyMatch) {
      result.keyExpression = (keyMatch[1] || keyMatch[2] || keyMatch[3])?.trim()
    }
  } else {
    // Try alternate pattern without parens around params
    const altMatch = expr.match(/^(.+?)\s*\.\s*map\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*(.+)\)$/s)
    if (altMatch) {
      result.arraySource = altMatch[1]?.trim()
      result.itemName = altMatch[2]?.trim()
      result.mapBody = altMatch[3]?.trim()
      
      // Extract key
      const keyMatch = result.mapBody?.match(/key\s*=\s*\{([^}]+)\}|key\s*=\s*"([^"]+)"|key\s*=\s*'([^']+)'/)
      if (keyMatch) {
        result.keyExpression = (keyMatch[1] || keyMatch[2] || keyMatch[3])?.trim()
      }
    }
  }
}

/**
 * Extract a balanced expression starting at position i in html
 * Returns the content inside { } and the end position
 */
function extractBalancedExpression(html: string, startIndex: number): { content: string; endIndex: number } | null {
  if (html[startIndex] !== '{') return null
  
  let depth = 1
  let i = startIndex + 1
  let inString = false
  let stringChar = ''
  
  while (i < html.length && depth > 0) {
    const char = html[i]
    const prevChar = i > 0 ? html[i - 1] : ''
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
      i++
      continue
    }
    
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false
      }
      i++
      continue
    }
    
    // Track brace depth
    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
    }
    
    i++
  }
  
  if (depth !== 0) return null
  
  return {
    content: html.substring(startIndex + 1, i - 1),
    endIndex: i
  }
}

/**
 * Extract all expression blocks from HTML content
 */
export function extractExpressionBlocks(
  html: string,
  declaredStates: Set<string>
): ExpressionBlock[] {
  const blocks: ExpressionBlock[] = []
  let placeholderCounter = 0
  
  // First, mark regions to skip (script, style)
  const skipRegions: Array<{ start: number; end: number }> = []
  
  let match
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi
  while ((match = scriptRegex.exec(html)) !== null) {
    skipRegions.push({ start: match.index, end: match.index + match[0].length })
  }
  
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi
  while ((match = styleRegex.exec(html)) !== null) {
    skipRegions.push({ start: match.index, end: match.index + match[0].length })
  }
  
  // Find all opening braces and extract balanced expressions
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== '{') continue
    
    // Check if this is in a skip region
    const inSkipRegion = skipRegions.some(region => 
      i >= region.start && i < region.end
    )
    if (inSkipRegion) continue
    
    // Check if this is inside an attribute value
    // Look backwards for attribute pattern: attrName="... or attrName='...
    let j = i - 1
    let inAttrValue = false
    while (j >= 0 && html[j] !== '<' && html[j] !== '>') {
      if (html[j] === '"' || html[j] === "'") {
        // Found a quote, check if there's an = before it
        let k = j - 1
        while (k >= 0 && (html[k] === ' ' || html[k] === '\t' || html[k] === '\n')) k--
        if (k >= 0 && html[k] === '=') {
          inAttrValue = true
          break
        }
      }
      j--
    }
    if (inAttrValue) continue
    
    // Extract balanced expression
    const extracted = extractBalancedExpression(html, i)
    if (!extracted) continue
    
    const exprContent = extracted.content
    const trimmed = exprContent.trim()
    
    // Skip empty expressions
    if (!trimmed) continue
    
    // Skip simple state references - they're handled by the existing binding system
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed) && declaredStates.has(trimmed)) {
      continue
    }
    
    const expression = parseExpression(exprContent, declaredStates)
    
    // Only process non-static expressions (static ones are simple bindings)
    if (expression.type !== 'static' || expression.hasJSX) {
      blocks.push({
        startIndex: i,
        endIndex: extracted.endIndex,
        expression,
        placeholderId: `zen-expr-${placeholderCounter++}`
      })
    }
    
    // Skip to end of this expression
    i = extracted.endIndex - 1
  }
  
  return blocks
}

/**
 * Convert JSX-like syntax to DOM creation code
 */
export function jsxToCreateElement(jsx: string): string {
  // Simple JSX to createElement conversion
  // <div className="test">content</div> -> createElement('div', { className: 'test' }, 'content')
  
  // Handle self-closing tags
  jsx = jsx.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)\/>/g, (_, tag, attrs) => {
    return `<${tag} ${attrs}></${tag}>`
  })
  
  // Parse and convert
  return `__zen_jsx(${JSON.stringify(jsx)})`
}

/**
 * Generate runtime code for an expression
 */
export function generateExpressionRuntime(expr: ParsedExpression, placeholderId: string): string {
  switch (expr.type) {
    case 'conditional':
      return generateConditionalRuntime(expr, placeholderId)
    case 'ternary':
      return generateTernaryRuntime(expr, placeholderId)
    case 'map':
      return generateMapRuntime(expr, placeholderId)
    case 'complex':
      return generateComplexRuntime(expr, placeholderId)
    default:
      return ''
  }
}

function generateConditionalRuntime(expr: ParsedExpression, placeholderId: string): string {
  const condition = expr.condition || 'false'
  const trueBranch = expr.trueBranch || ''
  
  // Escape the trueBranch for JSON
  const escapedBranch = JSON.stringify(trueBranch)
  
  // Use window.__zen_eval_expr to evaluate condition in global scope
  const conditionCode = `window.__zen_eval_expr(${JSON.stringify(condition)})`
  
  return `
// Conditional expression: ${condition.replace(/\n/g, ' ')} && ...
(function() {
  const placeholder = document.querySelector('[data-zen-expr="${placeholderId}"]');
  if (!placeholder) return;
  
  let currentElement = null;
  
  function updateConditional() {
    try {
      const show = Boolean(${conditionCode});
      
      if (show && !currentElement) {
        // Create and insert the element
        currentElement = window.__zen_parse_jsx(${escapedBranch});
        if (currentElement && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(currentElement, placeholder.nextSibling);
        }
      } else if (!show && currentElement) {
        // Remove the element
        if (currentElement.parentNode) {
          currentElement.parentNode.removeChild(currentElement);
        }
        currentElement = null;
      }
    } catch (e) {
      console.warn('[Zenith] Conditional evaluation error:', e);
    }
  }
  
  // Initial render after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateConditional);
  } else {
    setTimeout(updateConditional, 0);
  }
  
  // Register for state updates
  window.__zen_register_expression_update('${placeholderId}', updateConditional, ${JSON.stringify(expr.dependencies)});
})();
`
}

function generateTernaryRuntime(expr: ParsedExpression, placeholderId: string): string {
  const condition = expr.condition || 'false'
  let trueBranch = expr.trueBranch || '""'
  let falseBranch = expr.falseBranch || '""'
  
  // Check if branches are string literals or expressions
  const trueIsString = /^["']/.test(trueBranch.trim())
  const falseIsString = /^["']/.test(falseBranch.trim())
  
  // If branches contain JSX, wrap them for parsing
  const trueHasJSX = /<[a-zA-Z]/.test(trueBranch)
  const falseHasJSX = /<[a-zA-Z]/.test(falseBranch)
  
  // Use window.__zen_eval_expr to evaluate expressions in global scope
  const conditionCode = `window.__zen_eval_expr(${JSON.stringify(condition)})`
  const trueBranchCode = trueHasJSX 
    ? `window.__zen_parse_jsx(${JSON.stringify(trueBranch)})`
    : trueIsString 
      ? trueBranch 
      : `window.__zen_eval_expr(${JSON.stringify(trueBranch)})`
  const falseBranchCode = falseHasJSX
    ? `window.__zen_parse_jsx(${JSON.stringify(falseBranch)})`
    : falseIsString
      ? falseBranch
      : `window.__zen_eval_expr(${JSON.stringify(falseBranch)})`
  
  return `
// Ternary expression: ${condition.replace(/\n/g, ' ')} ? ... : ...
(function() {
  const placeholder = document.querySelector('[data-zen-expr="${placeholderId}"]');
  if (!placeholder) return;
  
  function updateTernary() {
    try {
      const conditionResult = Boolean(${conditionCode});
      let result = conditionResult ? ${trueBranchCode} : ${falseBranchCode};
      
      // Clear placeholder content
      placeholder.innerHTML = '';
      
      if (result === null || result === undefined || result === false) {
        // Empty
      } else if (typeof result === 'string' || typeof result === 'number') {
        placeholder.textContent = String(result);
      } else if (result instanceof Node) {
        placeholder.appendChild(result);
      } else if (result && typeof result === 'object') {
        // Try to render as JSX
        const element = window.__zen_parse_jsx(String(result));
        if (element) placeholder.appendChild(element);
      }
    } catch (e) {
      console.warn('[Zenith] Ternary evaluation error:', e);
    }
  }
  
  // Initial render after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateTernary);
  } else {
    setTimeout(updateTernary, 0);
  }
  
  // Register for state updates
  window.__zen_register_expression_update('${placeholderId}', updateTernary, ${JSON.stringify(expr.dependencies)});
})();
`
}

function generateMapRuntime(expr: ParsedExpression, placeholderId: string): string {
  const arraySource = expr.arraySource || '[]'
  const itemName = expr.itemName || 'item'
  const indexName = expr.indexName || 'index'
  const mapBody = expr.mapBody || '""'
  const keyExpr = expr.keyExpression || indexName
  
  // Process the map body to replace item/index references
  const escapedMapBody = JSON.stringify(mapBody)
  
  return `
// Map expression: ${arraySource}.map(${itemName} => ...)
(function() {
  const placeholder = document.querySelector('[data-zen-expr="${placeholderId}"]');
  if (!placeholder) return;
  
  const itemCache = new Map(); // key -> element
  const mapBodyTemplate = ${escapedMapBody};
  
  function updateMap() {
    try {
      const array = window.__zen_eval_expr(${JSON.stringify(arraySource)});
      if (!Array.isArray(array)) {
        console.warn('[Zenith] Map source is not an array:', array);
        return;
      }
      
      const newKeys = new Set();
      const parent = placeholder.parentNode;
      if (!parent) return;
      
      // Create fragment for new elements
      const elementsInOrder = [];
      
      array.forEach(function(${itemName}, ${indexName}) {
        const key = String(${keyExpr.replace(/`/g, '\\`').replace(/\${/g, '\\${')});
        newKeys.add(key);
        
        // Create context for template processing
        const context = {};
        context['${itemName}'] = ${itemName};
        context['${indexName}'] = ${indexName};
        
        let element = itemCache.get(key);
        if (!element) {
          // Create new element by processing template with context
          element = window.__zen_parse_jsx(mapBodyTemplate, context);
          if (element && element.setAttribute) {
            element.setAttribute('data-zen-key', key);
            element.setAttribute('data-zen-map', '${placeholderId}');
          }
          itemCache.set(key, element);
        }
        
        if (element) {
          elementsInOrder.push(element);
        }
      });
      
      // Remove old items no longer in array
      for (const [key, element] of itemCache.entries()) {
        if (!newKeys.has(key)) {
          if (element && element.parentNode) {
            element.parentNode.removeChild(element);
          }
          itemCache.delete(key);
        }
      }
      
      // Remove all existing mapped elements for this expression
      const existingMapped = parent.querySelectorAll('[data-zen-map="${placeholderId}"]');
      existingMapped.forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      
      // Insert elements in order after placeholder
      let insertPoint = placeholder;
      for (const el of elementsInOrder) {
        if (el && insertPoint.parentNode) {
          insertPoint.parentNode.insertBefore(el, insertPoint.nextSibling);
          insertPoint = el;
        }
      }
    } catch (e) {
      console.warn('[Zenith] Map evaluation error:', e);
    }
  }
  
  // Initial render after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateMap);
  } else {
    updateMap();
  }
  
  // Register for state updates
  window.__zen_register_expression_update('${placeholderId}', updateMap, ${JSON.stringify(expr.dependencies)});
})();
`
}

function generateComplexRuntime(expr: ParsedExpression, placeholderId: string): string {
  const hasJSX = /<[a-zA-Z]/.test(expr.raw)
  
  // For complex expressions, use window.__zen_eval_expr to evaluate in global scope
  // or parse JSX if it contains HTML
  const evalCode = hasJSX 
    ? `window.__zen_parse_jsx(${JSON.stringify(expr.raw)})`
    : `window.__zen_eval_expr(${JSON.stringify(expr.raw)})`
  
  return `
// Complex expression: ${expr.raw.replace(/\n/g, ' ').substring(0, 50)}...
(function() {
  const placeholder = document.querySelector('[data-zen-expr="${placeholderId}"]');
  if (!placeholder) return;
  
  function updateExpression() {
    try {
      const result = ${evalCode};
      
      // Clear current content
      placeholder.innerHTML = '';
      
      if (result === null || result === undefined || result === false) {
        // Empty - leave placeholder empty
      } else if (typeof result === 'string' || typeof result === 'number') {
        placeholder.textContent = String(result);
      } else if (result instanceof Node) {
        placeholder.appendChild(result);
      } else if (Array.isArray(result)) {
        // Handle array of elements
        result.forEach(function(item) {
          if (item instanceof Node) {
            placeholder.appendChild(item);
          } else if (typeof item === 'string' || typeof item === 'number') {
            placeholder.appendChild(document.createTextNode(String(item)));
          }
        });
      } else if (result && typeof result === 'object') {
        // Try to render as JSX string
        const element = window.__zen_parse_jsx(String(result));
        if (element) placeholder.appendChild(element);
      }
    } catch (e) {
      console.warn('[Zenith] Expression evaluation error:', e);
    }
  }
  
  // Initial render after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateExpression);
  } else {
    setTimeout(updateExpression, 0);
  }
  
  // Register for state updates
  window.__zen_register_expression_update('${placeholderId}', updateExpression, ${JSON.stringify(expr.dependencies)});
})();
`
}

/**
 * Transform HTML to replace expression blocks with placeholders
 */
export function transformExpressionBlocks(
  html: string,
  blocks: ExpressionBlock[]
): string {
  if (blocks.length === 0) return html
  
  // Sort blocks by start index in reverse order (to avoid index shifting)
  const sortedBlocks = [...blocks].sort((a, b) => b.startIndex - a.startIndex)
  
  let result = html
  for (const block of sortedBlocks) {
    const placeholder = `<span data-zen-expr="${block.placeholderId}" style="display:contents;"></span>`
    result = result.substring(0, block.startIndex) + placeholder + result.substring(block.endIndex)
  }
  
  return result
}

/**
 * Attribute expression binding
 */
export interface AttributeExpressionBinding {
  elementSelector: string        // Selector to find the element
  attributeName: string          // Name of the attribute (class, src, href, etc.)
  expression: string             // The expression to evaluate
  dependencies: string[]         // State variables this expression depends on
  bindingId: string              // Unique binding ID
}

/**
 * Extract attribute expressions from HTML
 * Handles: attr={expression}, className={expr ? "a" : "b"}, src={user.avatarUrl}
 */
export function extractAttributeExpressions(
  html: string,
  declaredStates: Set<string>
): { transformedHtml: string; bindings: AttributeExpressionBinding[] } {
  const bindings: AttributeExpressionBinding[] = []
  let bindingCounter = 0
  
  // Skip script and style content
  const skipRegions: Array<{ start: number; end: number }> = []
  
  let match
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi
  while ((match = scriptRegex.exec(html)) !== null) {
    skipRegions.push({ start: match.index, end: match.index + match[0].length })
  }
  
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi
  while ((match = styleRegex.exec(html)) !== null) {
    skipRegions.push({ start: match.index, end: match.index + match[0].length })
  }
  
  // Match attributes with expression values: attr={...}
  // This includes: class={}, className={}, src={}, href={}, disabled={}, etc.
  const attrExprRegex = /(\s+)([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*\{([^}]+)\}/g
  
  let transformedHtml = html
  const replacements: Array<{ start: number; end: number; replacement: string; binding: AttributeExpressionBinding }> = []
  
  while ((match = attrExprRegex.exec(html)) !== null) {
    const start = match.index
    const end = start + match[0].length
    
    // Check if in skip region
    const shouldSkip = skipRegions.some(region => 
      start >= region.start && start < region.end
    )
    if (shouldSkip) continue
    
    const whitespace = match[1] || ' '
    const attrName = match[2]
    const expression = match[3]?.trim()
    
    if (!attrName || !expression) continue
    
    // Skip :class and :value (handled by existing binding system)
    if (attrName === ':class' || attrName === ':value') continue
    
    // Skip style attribute with object syntax for now
    if (attrName === 'style' && expression.startsWith('{')) continue
    
    // Find dependencies in the expression
    const dependencies: string[] = []
    for (const state of declaredStates) {
      const stateRegex = new RegExp(`\\b${state}\\b`, 'g')
      if (stateRegex.test(expression)) {
        dependencies.push(state)
      }
    }
    
    // Only create binding if there are dependencies (dynamic expression)
    if (dependencies.length > 0) {
      const bindingId = `zen-attr-${bindingCounter++}`
      
      // Map className to class
      const normalizedAttrName = attrName === 'className' ? 'class' : attrName
      
      const binding: AttributeExpressionBinding = {
        elementSelector: `[data-zen-attr-bind="${bindingId}"]`,
        attributeName: normalizedAttrName,
        expression,
        dependencies,
        bindingId
      }
      
      bindings.push(binding)
      
      // Replace with static attribute and add binding marker
      // For initial value, we'll evaluate it at runtime
      const replacement = `${whitespace}data-zen-attr-bind="${bindingId}" data-zen-attr-name="${normalizedAttrName}" data-zen-attr-expr="${escapeAttrValue(expression)}"`
      
      replacements.push({ start, end, replacement, binding })
    } else {
      // Static expression - just evaluate and inline
      // For now, leave as-is and let the browser handle it
    }
  }
  
  // Apply replacements in reverse order to preserve indices
  replacements.sort((a, b) => b.start - a.start)
  for (const r of replacements) {
    transformedHtml = transformedHtml.substring(0, r.start) + r.replacement + transformedHtml.substring(r.end)
  }
  
  return { transformedHtml, bindings }
}

/**
 * Escape attribute value for HTML
 */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Generate runtime code for attribute expression bindings
 */
export function generateAttributeExpressionRuntime(bindings: AttributeExpressionBinding[]): string {
  if (bindings.length === 0) return ''
  
  const bindingCodes = bindings.map(binding => {
    const isBoolean = ['disabled', 'checked', 'readonly', 'required', 'hidden'].includes(binding.attributeName)
    const isClass = binding.attributeName === 'class'
    
    return `
  // Attribute binding: ${binding.attributeName}={${binding.expression.substring(0, 30)}...}
  (function() {
    const el = document.querySelector('[data-zen-attr-bind="${binding.bindingId}"]');
    if (!el) return;
    
    function updateAttribute() {
      try {
        const value = window.__zen_eval_expr(${JSON.stringify(binding.expression)});
        ${isBoolean ? `
        // Boolean attribute
        if (value) {
          el.setAttribute('${binding.attributeName}', '');
        } else {
          el.removeAttribute('${binding.attributeName}');
        }` : isClass ? `
        // Class attribute - handle string, object, or array
        if (typeof value === 'string') {
          el.className = value;
        } else if (Array.isArray(value)) {
          el.className = value.filter(Boolean).join(' ');
        } else if (value && typeof value === 'object') {
          el.className = Object.entries(value)
            .filter(([_, v]) => v)
            .map(([k]) => k)
            .join(' ');
        } else if (value === null || value === undefined || value === false) {
          el.className = '';
        } else {
          el.className = String(value);
        }` : `
        // Regular attribute
        if (value === null || value === undefined || value === false) {
          el.removeAttribute('${binding.attributeName}');
        } else {
          el.setAttribute('${binding.attributeName}', String(value));
        }`}
      } catch (e) {
        console.warn('[Zenith] Attribute expression error:', e);
      }
    }
    
    // Initial update
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updateAttribute);
    } else {
      updateAttribute();
    }
    
    // Register for state updates
    window.__zen_register_expression_update('${binding.bindingId}', updateAttribute, ${JSON.stringify(binding.dependencies)});
  })();`
  })
  
  return `
// Attribute Expression Bindings
${bindingCodes.join('\n')}
`
}

/**
 * Generate the expression runtime helper code
 */
export function generateExpressionRuntimeHelpers(): string {
  return `
// Zenith Dynamic Expression Runtime
(function() {
  // Expression update registry
  const expressionUpdaters = new Map(); // placeholderId -> { update: fn, dependencies: string[] }
  
  // Register an expression updater
  window.__zen_register_expression_update = function(placeholderId, updateFn, dependencies) {
    expressionUpdaters.set(placeholderId, { update: updateFn, dependencies });
  };
  
  // Trigger updates for expressions that depend on a state
  window.__zen_trigger_expression_updates = function(stateName) {
    for (const [id, info] of expressionUpdaters.entries()) {
      // Check if this expression depends on the changed state
      const deps = info.dependencies;
      // Also check for partial matches (instance-scoped state)
      const shouldUpdate = deps.some(dep => 
        dep === stateName || 
        stateName.includes(dep) || 
        dep.includes(stateName)
      );
      if (shouldUpdate) {
        try {
          info.update();
        } catch (e) {
          console.warn('[Zenith] Expression update error:', e);
        }
      }
    }
  };
  
  // Evaluate expression in global scope (accesses window properties)
  window.__zen_eval_expr = function(expr) {
    try {
      // Use Function constructor with 'with(window)' to access window properties
      // This allows expressions like 'users.length' to access window.users
      return (new Function('with(window) { return (' + expr + '); }'))();
    } catch (e) {
      console.warn('[Zenith] Expression evaluation error:', expr, e);
      return undefined;
    }
  };
  
  // Parse JSX/HTML string into DOM element(s)
  window.__zen_parse_jsx = function(jsx, context) {
    if (jsx === null || jsx === undefined || jsx === false) return null;
    if (typeof jsx === 'number') jsx = String(jsx);
    if (typeof jsx !== 'string') return null;
    
    // Apply context (for map iterations)
    let processed = jsx;
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        // Replace {key} with value in text content
        const textRegex = new RegExp('\\\\{\\\\s*' + key + '\\\\s*\\\\}', 'g');
        const safeValue = value === null || value === undefined ? '' : String(value);
        processed = processed.replace(textRegex, safeValue);
        
        // Replace key references in attribute expressions
        const attrRegex = new RegExp('\\\\{' + key + '\\\\}', 'g');
        processed = processed.replace(attrRegex, safeValue);
      }
    }
    
    // Parse HTML string
    const template = document.createElement('template');
    template.innerHTML = processed.trim();
    
    // Return single element or document fragment for multiple
    if (template.content.childNodes.length === 1) {
      return template.content.firstChild;
    }
    return template.content;
  };
  
  // Create element from tag, attributes, and children
  window.__zen_create_element = function(tag, attrs, ...children) {
    const el = document.createElement(tag);
    
    // Set attributes
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
          el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value !== null && value !== undefined && value !== false) {
          el.setAttribute(key, String(value));
        }
      }
    }
    
    // Append children
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    
    return el;
  };
  
  // Track state property access
  window.__zen_track_state = function(stateName) {
    // Used for dependency tracking
  };
})();
`
}

