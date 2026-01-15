/**
 * Component Script Transformer
 * 
 * Transforms component scripts for instance-scoped execution.
 * Uses namespace binding pattern for cleaner output:
 *   const { signal, effect, onMount, ... } = __inst;
 * 
 * Uses Acorn AST parser for deterministic import parsing.
 * Phase 1: Analysis only - imports are parsed and categorized.
 * Phase 2 (bundling) happens in dev.ts.
 * 
 * Import handling:
 * - .zen imports: Stripped (compile-time resolved)
 * - npm imports: Stored as structured metadata for later bundling
 */

import type { ComponentScriptIR, ScriptImport } from '../ir/types'
import { parseImports, categorizeImports } from '../parse/parseImports'
import type { ParsedImport } from '../parse/importTypes'

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
 * Result of script transformation including extracted imports
 */
export interface TransformResult {
    script: string           // Transformed script (imports removed)
    imports: ScriptImport[]  // Structured npm imports to hoist
}

/**
 * Convert ParsedImport to ScriptImport for compatibility with existing IR
 */
function toScriptImport(parsed: ParsedImport): ScriptImport {
    // Build specifiers string from parsed specifiers
    let specifiers = ''

    if (parsed.kind === 'default') {
        specifiers = parsed.specifiers[0]?.local || ''
    } else if (parsed.kind === 'namespace') {
        specifiers = `* as ${parsed.specifiers[0]?.local || ''}`
    } else if (parsed.kind === 'named') {
        const parts = parsed.specifiers.map(s =>
            s.imported ? `${s.imported} as ${s.local}` : s.local
        )
        specifiers = `{ ${parts.join(', ')} }`
    } else if (parsed.kind === 'side-effect') {
        specifiers = ''
    }

    return {
        source: parsed.source,
        specifiers,
        typeOnly: parsed.isTypeOnly,
        sideEffect: parsed.kind === 'side-effect'
    }
}

/**
 * Strip imports from source code based on parsed import locations
 * 
 * @param source - Original source code
 * @param imports - Parsed imports to strip
 * @returns Source with imports removed
 */
function stripImportsFromSource(source: string, imports: ParsedImport[]): string {
    if (imports.length === 0) return source

    // Sort by start position descending for safe removal
    const sorted = [...imports].sort((a, b) => b.location.start - a.location.start)

    let result = source
    for (const imp of sorted) {
        // Remove the import statement
        const before = result.slice(0, imp.location.start)
        const after = result.slice(imp.location.end)

        // Also remove trailing newline if present
        const trimmedAfter = after.startsWith('\n') ? after.slice(1) : after
        result = before + trimmedAfter
    }

    return result
}

/**
 * Parse and extract imports from script content using Acorn AST parser
 * 
 * Phase 1: Deterministic parsing - no bundling or resolution
 * 
 * @param scriptContent - Raw script content
 * @param componentName - Name of the component (for error context)
 * @returns Object with npm imports array and script with all imports stripped
 */
export function parseAndExtractImports(
    scriptContent: string,
    componentName: string = 'unknown'
): {
    imports: ScriptImport[]
    strippedCode: string
} {
    // Parse imports using Acorn AST
    const parseResult = parseImports(scriptContent, componentName)

    if (!parseResult.success) {
        console.warn(`[Zenith] Import parse warnings for ${componentName}:`, parseResult.errors)
    }

    // Categorize imports
    const { zenImports, npmImports, relativeImports } = categorizeImports(parseResult.imports)

    // Convert npm imports to ScriptImport format
    const scriptImports = npmImports.map(toScriptImport)

    // Strip ALL imports from source (zen, npm, and relative)
    // - .zen imports: resolved at compile time
    // - npm imports: will be bundled separately
    // - relative imports: resolved at compile time
    const allImportsToStrip = [...zenImports, ...npmImports, ...relativeImports]
    const strippedCode = stripImportsFromSource(scriptContent, allImportsToStrip)

    return {
        imports: scriptImports,
        strippedCode
    }
}

/**
 * Transform a component's script content for instance-scoped execution
 * 
 * @param componentName - Name of the component
 * @param scriptContent - Raw script content from the component
 * @param props - Declared prop names
 * @returns TransformResult with transformed script and extracted imports
 */
export function transformComponentScript(
    componentName: string,
    scriptContent: string,
    props: string[]
): TransformResult {
    // Parse and extract imports using Acorn AST
    const { imports, strippedCode } = parseAndExtractImports(scriptContent, componentName)

    let transformed = strippedCode

    // Rewrite zen* prefixed calls to unprefixed (uses namespace bindings)
    for (const [zenName, unprefixedName] of Object.entries(ZEN_PREFIX_MAPPINGS)) {
        // Match the zen* name as a standalone call
        const regex = new RegExp(`(?<!\\w)${zenName}\\s*\\(`, 'g')
        transformed = transformed.replace(regex, `${unprefixedName}(`)
    }

    return {
        script: transformed.trim(),
        imports
    }
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
 * Result of transforming all component scripts
 */
export interface TransformAllResult {
    code: string             // Combined factory code
    imports: ScriptImport[]  // All collected npm imports (deduplicated)
}

/**
 * Deduplicate imports by (source + specifiers + typeOnly) tuple
 * Returns deterministically sorted imports
 */
function deduplicateImports(imports: ScriptImport[]): ScriptImport[] {
    const seen = new Map<string, ScriptImport>()

    for (const imp of imports) {
        const key = `${imp.source}|${imp.specifiers}|${imp.typeOnly}`
        if (!seen.has(key)) {
            seen.set(key, imp)
        }
    }

    // Sort by source for deterministic output
    return Array.from(seen.values()).sort((a, b) => a.source.localeCompare(b.source))
}

/**
 * Emit import statements from structured metadata
 */
export function emitImports(imports: ScriptImport[]): string {
    const deduplicated = deduplicateImports(imports)

    return deduplicated.map(imp => {
        if (imp.sideEffect) {
            return `import '${imp.source}';`
        }
        const typePrefix = imp.typeOnly ? 'type ' : ''
        return `import ${typePrefix}${imp.specifiers} from '${imp.source}';`
    }).join('\n')
}

/**
 * Transform all component scripts from collected ComponentScriptIR
 * 
 * Now synchronous since Acorn parsing is synchronous.
 * 
 * @param componentScripts - Array of component script IRs
 * @returns TransformAllResult with combined code and deduplicated imports
 */
export function transformAllComponentScripts(
    componentScripts: ComponentScriptIR[]
): TransformAllResult {
    if (!componentScripts || componentScripts.length === 0) {
        return { code: '', imports: [] }
    }

    const allImports: ScriptImport[] = []

    const factories = componentScripts
        .filter(comp => comp.script && comp.script.trim().length > 0)
        .map(comp => {
            const result = transformComponentScript(
                comp.name,
                comp.script,
                comp.props
            )

            // Collect imports
            allImports.push(...result.imports)

            return generateComponentFactory(comp.name, result.script, comp.props)
        })

    return {
        code: factories.join('\n'),
        imports: deduplicateImports(allImports)
    }
}
