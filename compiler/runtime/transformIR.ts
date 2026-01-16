/**
 * Transform IR to Runtime Code
 * 
 * Phase 4: Transform ZenIR into runtime-ready JavaScript code with full reactivity
 */

import type { ZenIR, ScriptImport } from '../ir/types'
import { generateExpressionWrappers } from './wrapExpression'
import { generateDOMFunction } from './generateDOM'
import { generateHydrationRuntime, generateExpressionRegistry } from './generateHydrationBundle'
import { analyzeAllExpressions } from './dataExposure'
// Legacy navigation runtime removed - router now provided by @zenithbuild/router via bundle-generator.ts
import { extractStateDeclarations, extractProps, transformStateDeclarations } from '../parse/scriptAnalysis'
import { transformAllComponentScripts, emitImports } from '../transform/componentScriptTransformer'

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
export async function transformIR(ir: ZenIR): Promise<RuntimeCode> {
  // Phase 6: Analyze expression dependencies for explicit data exposure
  const expressionDependencies = analyzeAllExpressions(
    ir.template.expressions,
    ir.filePath,
    [], // declaredLoaderProps
    ir.script?.attributes['props'] ? ir.script.attributes['props'].split(',') : [], // declaredProps
    []  // declaredStores
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

  // Phase 7 navigation runtime removed - router is provided by shared runtime bundle
  const navigationRuntime = '' // No longer inlined per-page

  // Generate expression registry initialization
  const expressionRegistry = generateExpressionRegistry(ir.template.expressions)

  // Generate style injection code
  const stylesCode = generateStyleInjection(ir.styles)

  // Extract state and prop declarations
  const scriptContent = ir.script?.raw || ''
  const stateDeclarations = extractStateDeclarations(scriptContent)
  const propKeys = Object.keys(ir.script?.attributes || {}).filter(k => k !== 'setup' && k !== 'lang')
  const propDeclarations = extractProps(scriptContent)
  const stateInitCode = generateStateInitialization(stateDeclarations, [...propDeclarations, ...propKeys])

  // Transform script (remove state and prop declarations, they're handled by runtime)
  const scriptCode = transformStateDeclarations(scriptContent)

  // Transform component scripts for instance-scoped execution (synchronous - Acorn)
  const componentScriptResult = transformAllComponentScripts(ir.componentScripts || [])

  // Generate complete runtime bundle
  const bundle = generateRuntimeBundle({
    expressions,
    expressionRegistry,
    hydrationRuntime,
    navigationRuntime,
    stylesCode,
    scriptCode,
    stateInitCode,
    componentScriptCode: componentScriptResult.code,
    npmImports: componentScriptResult.imports
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
  componentScriptCode: string  // Component factories
  npmImports: ScriptImport[]   // Structured npm imports from component scripts
}): string {
  // Extract function declarations from script code to register on window
  const functionRegistrations = extractFunctionRegistrations(parts.scriptCode)

  // Extract const/let declarations from script code to register on window
  const variableRegistrations = extractVariableRegistrations(parts.scriptCode)

  // Generate npm imports header (hoisted, deduplicated, deterministic)
  const npmImportsHeader = parts.npmImports.length > 0
    ? `// NPM Imports (hoisted from component scripts)\n${emitImports(parts.npmImports)}\n\n`
    : ''

  return `// Zenith Runtime Bundle (Phase 5)
// Generated at compile time - no .zen parsing in browser

${npmImportsHeader}${parts.expressions}

${parts.expressionRegistry}

${parts.hydrationRuntime}

${parts.navigationRuntime}

${parts.stylesCode ? `// Style injection
${parts.stylesCode}` : ''}

// User script code - executed first to define variables needed by state initialization
${parts.scriptCode ? parts.scriptCode : ''}

${functionRegistrations}

${variableRegistrations}

${parts.stateInitCode ? `// State initialization
${parts.stateInitCode}` : ''}

${parts.componentScriptCode ? `// Component factories (instance-scoped)
${parts.componentScriptCode}` : ''}

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

// Auto-hydrate on page mount
(function() {
  'use strict';
  
  function autoHydrate() {
    // Initialize state object
    const state = window.__ZENITH_STATE__ || {};
    
    // Run state initialization if defined
    if (typeof initializeState === 'function') {
      initializeState(state);
    }
    
    // Store state globally
    window.__ZENITH_STATE__ = state;
    
    // Expose state variables on window with reactive getters/setters
    // This allows user functions (like increment) to access state variables directly
    for (const key in state) {
      if (state.hasOwnProperty(key) && !window.hasOwnProperty(key)) {
        Object.defineProperty(window, key, {
          get: function() { return window.__ZENITH_STATE__[key]; },
          set: function(value) { 
            window.__ZENITH_STATE__[key] = value;
            // Trigger reactive update
            if (window.__zenith_update) {
              window.__zenith_update(window.__ZENITH_STATE__);
            }
          },
          configurable: true
        });
      }
    }
    
    // Inject styles if defined
    if (typeof injectStyles === 'function') {
      injectStyles();
    }
    
    // Get the router outlet or body
    const container = document.querySelector('#app') || document.body;
    
    // Hydrate with state (expressions, bindings)
    if (window.__zenith_hydrate) {
      window.__zenith_hydrate(state, {}, {}, {}, container);
    }
    
    // Hydrate components by discovering data-zen-component markers
    // This is the ONLY place component instantiation happens - driven by DOM markers
    if (window.__zenith && window.__zenith.hydrateComponents) {
      window.__zenith.hydrateComponents(container);
    }
    
    // Trigger page-level mount lifecycle
    if (window.__zenith && window.__zenith.triggerMount) {
      window.__zenith.triggerMount();
    }
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoHydrate);
  } else {
    // DOM already loaded, hydrate immediately
    autoHydrate();
  }
})();
`
}

/**
 * Extract function declarations and generate window registration code
 */
function extractFunctionRegistrations(scriptCode: string): string {
  if (!scriptCode) return ''

  // Match function declarations: function name(...) { ... }
  const functionPattern = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g
  const functionNames: string[] = []
  let match

  while ((match = functionPattern.exec(scriptCode)) !== null) {
    if (match[1]) {
      functionNames.push(match[1])
    }
  }

  if (functionNames.length === 0) {
    return ''
  }

  // Generate window registration for each function
  const registrations = functionNames.map(name =>
    `  if (typeof ${name} === 'function') window.${name} = ${name};`
  ).join('\n')

  return `// Register functions on window for event handlers\n${registrations}`
}

/**
 * Extract const/let declarations and generate window registration code
 * This allows expressions evaluated via new Function() to access script-level variables
 */
function extractVariableRegistrations(scriptCode: string): string {
  if (!scriptCode) return ''

  // Match const/let declarations: const name = ... or let name = ...
  // Also match destructured: const { a, b } = ... but we only care about simple assignments
  const varPattern = /(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g
  const varNames: string[] = []
  let match

  while ((match = varPattern.exec(scriptCode)) !== null) {
    if (match[1]) {
      varNames.push(match[1])
    }
  }

  if (varNames.length === 0) {
    return ''
  }

  // Generate window registration for each variable
  const registrations = varNames.map(name =>
    `  if (typeof ${name} !== 'undefined') window.${name} = ${name};`
  ).join('\n')

  return `// Register script variables on window for expression access\n${registrations}`
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
 * In Phase 9: Also handles props passing
 */
function generateStateInitialization(stateDeclarations: Map<string, string>, propDeclarations: string[]): string {
  const stateInit = Array.from(stateDeclarations.entries()).map(([name, value]) => {
    return `
  // Initialize state: ${name}
  if (typeof state.${name} === 'undefined') {
    state.${name} = ${value};
  }`
  }).join('')

  const legacyPropInit = propDeclarations.includes('props') ? `
  // Initialize props object (legacy)
  if (typeof window.__ZEN_PROPS__ !== 'undefined') {
    state.props = window.__ZEN_PROPS__;
  }` : ''

  const individualPropInit = propDeclarations.filter(p => p !== 'props').map(prop => `
  // Initialize prop: ${prop}
  if (typeof state.${prop} === 'undefined' && typeof window.__ZEN_PROPS__ !== 'undefined' && typeof window.__ZEN_PROPS__.${prop} !== 'undefined') {
    state.${prop} = window.__ZEN_PROPS__.${prop};
  }`).join('')

  return `function initializeState(state) {${stateInit}${legacyPropInit}${individualPropInit}
}`
}

// Note: transformScript is now handled by transformStateDeclarations in legacy/parse.ts

