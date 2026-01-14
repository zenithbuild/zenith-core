/**
 * Component Script Transformer
 * 
 * Transforms component scripts for instance-scoped execution.
 * Uses namespace binding pattern for cleaner output:
 *   const { signal, effect, onMount, ... } = __inst;
 * 
 * Then rewrites zen* prefixed calls to unprefixed:
 *   zenSignal(v)  → signal(v)
 *   zenEffect(fn) → effect(fn)
 *   zenOnMount(fn) → onMount(fn)
 */

import type { ComponentScriptIR } from '../ir/types'

/**
 * Namespace bindings - destructured from the instance
 * This is added at the top of every component script
 */
const NAMESPACE_BINDINGS = `const { 
    signal, state, memo, effect, ref, 
    batch, untrack, onMount, onUnmount 
} = __inst;`

/**
 * Mapping of zen* prefixed names to unprefixed names
 * These get rewritten to use the destructured namespace
 */
const ZEN_PREFIX_MAPPINGS: Record<string, string> = {
    'zenSignal': 'signal',
    'zenState': 'state',
    'zenMemo': 'memo',
    'zenEffect': 'effect',
    'zenRef': 'ref',
    'zenBatch': 'batch',
    'zenUntrack': 'untrack',
    'zenOnMount': 'onMount',
    'zenOnUnmount': 'onUnmount',
}

/**
 * Transform a component's script content for instance-scoped execution
 * 
 * @param componentName - Name of the component
 * @param scriptContent - Raw script content from the component
 * @param props - Declared prop names
 * @returns Transformed script ready for bundling
 */
export function transformComponentScript(
    componentName: string,
    scriptContent: string,
    props: string[]
): string {
    let transformed = scriptContent

    // Strip import statements for .zen files (resolved at compile time)
    transformed = transformed.replace(
        /import\s+\w+\s+from\s+['"][^'"]*\.zen['"];?\s*/g,
        ''
    )

    // Strip any other relative imports (components are inlined)
    transformed = transformed.replace(
        /import\s+{[^}]*}\s+from\s+['"][^'"]+['"];?\s*/g,
        ''
    )

    // Rewrite zen* prefixed calls to unprefixed (uses namespace bindings)
    for (const [zenName, unprefixedName] of Object.entries(ZEN_PREFIX_MAPPINGS)) {
        // Match the zen* name as a standalone call
        const regex = new RegExp(`(?<!\\w)${zenName}\\s*\\(`, 'g')
        transformed = transformed.replace(regex, `${unprefixedName}(`)
    }

    return transformed.trim()
}

/**
 * Generate a component factory function
 * 
 * IMPORTANT: Factories are PASSIVE - they are registered but NOT invoked here.
 * Instantiation is driven by the hydrator when it discovers component markers.
 * 
 * @param componentName - Name of the component
 * @param transformedScript - Script content after hook rewriting
 * @param propNames - Declared prop names for destructuring
 * @returns Component factory registration code (NO eager instantiation)
 */
export function generateComponentFactory(
    componentName: string,
    transformedScript: string,
    propNames: string[]
): string {
    const propsDestructure = propNames.length > 0
        ? `const { ${propNames.join(', ')} } = props || {};`
        : ''

    // Register factory only - NO instantiation
    // Hydrator will call instantiate() when it finds data-zen-component markers
    return `
// Component Factory: ${componentName}
// Instantiation is driven by hydrator, not by bundle load
__zenith.defineComponent('${componentName}', function(props, rootElement) {
    const __inst = __zenith.createInstance('${componentName}', rootElement);
    
    // Namespace bindings (instance-scoped primitives)
    ${NAMESPACE_BINDINGS}
    
    ${propsDestructure}
    
    // Component script (instance-scoped)
    ${transformedScript}
    
    // Execute mount lifecycle (rootElement is already in DOM)
    __inst.mount();
    
    return __inst;
});
`
}

/**
 * Transform all component scripts from collected ComponentScriptIR
 * 
 * @param componentScripts - Array of component script IRs
 * @returns Combined JavaScript code for all component factories
 */
export function transformAllComponentScripts(
    componentScripts: ComponentScriptIR[]
): string {
    if (!componentScripts || componentScripts.length === 0) {
        return ''
    }

    const factories = componentScripts
        .filter(comp => comp.script && comp.script.trim().length > 0)
        .map(comp => {
            const transformed = transformComponentScript(
                comp.name,
                comp.script,
                comp.props
            )
            return generateComponentFactory(comp.name, transformed, comp.props)
        })

    return factories.join('\n')
}
