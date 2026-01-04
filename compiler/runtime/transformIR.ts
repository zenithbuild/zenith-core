/**
 * Transform IR to Runtime Code
 * 
 * Phase 4: Transform ZenIR into runtime-ready JavaScript code with full reactivity
 */

import type { ZenIR } from '../ir/types'
import { generateExpressionWrappers } from './wrapExpression'
import { generateDOMFunction } from './generateDOM'
import { generateHydrationRuntime, generateExpressionRegistry } from './generateHydrationBundle'
import { analyzeAllExpressions, type ExpressionDataDependencies } from './dataExposure'
import { generateNavigationRuntime } from './navigation'
import { extractStateDeclarations } from '../legacy/parse'

export interface RuntimeCode {
  expressions: string  // Expression wrapper functions
  render: string       // renderDynamicPage function (legacy, for reference)
  hydration: string    // Phase 5 hydration runtime code
  styles: string       // Style injection code
  script: string       // Transformed script code
  stateInit: string    // State initialization code
  bundle: string       // Complete runtime bundle (expressions + hydration + helpers)
}

/**
 * Transform ZenIR into runtime JavaScript code
 */
export function transformIR(ir: ZenIR): RuntimeCode {
  // Phase 6: Analyze expression dependencies for explicit data exposure
  const expressionDependencies = analyzeAllExpressions(
    ir.template.expressions,
    ir.filePath,
    [], // declaredLoaderProps - can be enhanced with loader analysis
    [], // declaredProps - can be enhanced with component prop analysis
    []  // declaredStores - can be enhanced with store import analysis
  )
  
  // Generate expression wrappers with dependencies
  const expressions = generateExpressionWrappers(ir.template.expressions, expressionDependencies)
  
  // Generate DOM creation code
  const renderFunction = generateDOMFunction(
    ir.template.nodes,
    ir.template.expressions,
    'renderDynamicPage'
  )
  
  // Generate hydrate function (legacy, for reference)
  const hydrateFunction = generateHydrateFunction()
  
  // Generate Phase 5 hydration runtime
  const hydrationRuntime = generateHydrationRuntime()
  
  // Generate Phase 7 navigation runtime
  const navigationRuntime = generateNavigationRuntime()
  
  // Generate expression registry initialization
  const expressionRegistry = generateExpressionRegistry(ir.template.expressions)
  
  // Generate style injection code
  const stylesCode = generateStyleInjection(ir.styles)
  
  // Extract state declarations and generate initialization
  const scriptContent = ir.script?.raw || ''
  const stateDeclarations = extractStateDeclarations(scriptContent)
  const stateInitCode = generateStateInitialization(stateDeclarations)
  
  // Transform script (remove state declarations, they're handled by runtime)
  const scriptCode = transformScript(scriptContent, stateDeclarations)
  
  // Generate complete runtime bundle
  const bundle = generateRuntimeBundle({
    expressions,
    expressionRegistry,
    hydrationRuntime,
    navigationRuntime,
    stylesCode,
    scriptCode,
    stateInitCode
  })
  
  return {
    expressions,
    render: renderFunction,
    hydration: hydrationRuntime,
    styles: stylesCode,
    script: scriptCode,
    stateInit: stateInitCode,
    bundle
  }
}

/**
 * Generate complete runtime bundle
 */
function generateRuntimeBundle(parts: {
  expressions: string
  expressionRegistry: string
  hydrationRuntime: string
  navigationRuntime: string
  stylesCode: string
  scriptCode: string
  stateInitCode: string
}): string {
  return `// Zenith Runtime Bundle (Phase 5)
// Generated at compile time - no .zen parsing in browser

${parts.expressions}

${parts.expressionRegistry}

${parts.hydrationRuntime}

${parts.navigationRuntime}

${parts.stateInitCode ? `// State initialization
${parts.stateInitCode}` : ''}

${parts.stylesCode ? `// Style injection
${parts.stylesCode}` : ''}

${parts.scriptCode ? `// User script code
${parts.scriptCode}` : ''}

// Export hydration functions
if (typeof window !== 'undefined') {
  window.zenithHydrate = window.__zenith_hydrate || function(state, container) {
    console.warn('[Zenith] Hydration runtime not loaded');
  };
  window.zenithUpdate = window.__zenith_update || function(state) {
    console.warn('[Zenith] Update runtime not loaded');
  };
  window.zenithBindEvents = window.__zenith_bindEvents || function(container) {
    console.warn('[Zenith] Event binding runtime not loaded');
  };
  window.zenithCleanup = window.__zenith_cleanup || function(container) {
    console.warn('[Zenith] Cleanup runtime not loaded');
  };
}
`
}

/**
 * Generate hydrate function that mounts the DOM with reactivity
 */
function generateHydrateFunction(): string {
  return `function hydrate(root, state) {
  if (!root) {
    // SSR fallback - return initial HTML string
    console.warn('[Zenith] hydrate called without root element - SSR mode');
    return '';
  }
  
  // Clear root
  root.innerHTML = '';
  
  // Render template
  const dom = renderDynamicPage(state);
  
  // Append to root
  if (dom instanceof DocumentFragment) {
    root.appendChild(dom);
  } else if (dom instanceof Node) {
    root.appendChild(dom);
  }
  
  // Bind event handlers
  bindEventHandlers(root, state);
  
  // Set up reactive updates (if state is reactive)
  setupReactiveUpdates(root, state);
  
  return root;
}

function bindEventHandlers(root, state) {
  // Find all elements with data-zen-* event attributes
  const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur'];
  
  for (const eventType of eventTypes) {
    const elements = root.querySelectorAll(\`[data-zen-\${eventType}]\`);
    for (const el of elements) {
      const handlerName = el.getAttribute(\`data-zen-\${eventType}\`);
      if (handlerName && typeof window[handlerName] === 'function') {
        el.addEventListener(eventType, (e) => {
          window[handlerName](e, el);
        });
      }
    }
  }
}

function setupReactiveUpdates(root, state) {
  // For now, reactive updates are handled by the existing binding system
  // This is a placeholder for future reactive DOM updates
  // The existing runtime handles reactivity via state property setters
}`
}

/**
 * Generate style injection code
 */
function generateStyleInjection(styles: Array<{ raw: string }>): string {
  if (styles.length === 0) {
    return ''
  }
  
  const styleBlocks = styles.map((style, index) => {
    const escapedStyle = style.raw.replace(/`/g, '\\`').replace(/\$/g, '\\$')
    return `
  const style${index} = document.createElement('style');
  style${index}.textContent = \`${escapedStyle}\`;
  document.head.appendChild(style${index});`
  }).join('')
  
  return `function injectStyles() {${styleBlocks}
}`
}

/**
 * Generate state initialization code
 */
function generateStateInitialization(stateDeclarations: Map<string, string>): string {
  if (stateDeclarations.size === 0) {
    return ''
  }
  
  const initCode = Array.from(stateDeclarations.entries()).map(([name, value]) => {
    return `
  // Initialize state: ${name}
  if (!state.${name}) {
    state.${name} = ${value};
  }`
  }).join('')
  
  return `function initializeState(state) {${initCode}
}`
}

/**
 * Transform script content
 * Removes state declarations (they're handled by state initialization)
 */
function transformScript(scriptContent: string, stateDeclarations: Map<string, string>): string {
  // Remove state declarations - they're handled by initializeState
  let transformed = scriptContent
  
  for (const [name] of stateDeclarations.entries()) {
    // Remove "state name = value" declarations
    const stateRegex = new RegExp(`state\\s+${name}\\s*=[^;]*;?`, 'g')
    transformed = transformed.replace(stateRegex, '')
  }
  
  return transformed.trim()
}

