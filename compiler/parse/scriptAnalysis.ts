/**
 * Script Analysis Utilities
 * 
 * Extracts state and prop declarations from <script> blocks
 */

export interface StateInfo {
    name: string
    value: string
}

/**
 * Extract state declarations: state name = value
 */
export function extractStateDeclarations(script: string): Map<string, string> {
    const states = new Map<string, string>()
    const statePattern = /state\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+?)(?:\s*;|\s*$)/gm
    let match

    while ((match = statePattern.exec(script)) !== null) {
        if (match[1] && match[2]) {
            states.set(match[1], match[2].trim())
        }
    }

    return states
}

/**
 * Extract prop declarations: export let props: Props;
 */
export function extractProps(script: string): string[] {
    const props: string[] = []
    const propPattern = /export\s+let\s+props(?:\s*:\s*([^;]+))?[ \t]*;?/g
    let match

    while ((match = propPattern.exec(script)) !== null) {
        if (!props.includes('props')) {
            props.push('props')
        }
    }

    return props
}

/**
 * Transform script by removing state and prop declarations
 * Also strips .zen imports (resolved at compile time) and other compile-time-only imports
 */
export function transformStateDeclarations(script: string): string {
    let transformed = script

    // Remove state declarations (state count = 0)
    transformed = transformed.replace(/state\s+([a-zA-Z_$][a-zA-Z0-9_$]*)[ \t]*=[ \t]*([^;]+?)(?:[ \t]*;|\s*$)/gm, '')

    // Remove export let props (legacy)
    transformed = transformed.replace(/export\s+let\s+props(?:\s*:\s*([^;]+))?\s*;?[ \t]*/g, '')

    // Remove type/interface Props (carefully handling comments)
    // We search for the start of the word 'type' or 'interface' and match until the closing brace
    transformed = transformed.replace(/(?:type|interface)\s+Props\s*=?\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}[ \t]*;?/gs, '')

    // Remove zenith/runtime imports
    transformed = transformed.replace(/import\s+{[^}]+}\s+from\s+['"]zenith\/runtime['"]\s*;?[ \t]*/g, '')

    // Remove .zen file imports (resolved at compile time)
    // Matches: import Name from '.../file.zen'; or import Name from '.../file.zen'
    transformed = transformed.replace(/import\s+\w+\s+from\s+['"][^'"]*\.zen['"];?\s*/g, '')

    // Remove relative imports with destructuring (components are inlined)
    transformed = transformed.replace(/import\s+{[^}]*}\s+from\s+['"][^'"]+\.zen['"];?\s*/g, '')

    // Transform zenith:content imports to global lookups
    transformed = transformed.replace(
        /import\s*{\s*([^}]+)\s*}\s*from\s*['"]zenith:content['"]\s*;?/g,
        (_, imports) => `const { ${imports.trim()} } = window.__zenith;`
    )

    return transformed.trim()
}

/**
 * Inject props into a setup script as top-level variables
 */
export function injectPropsIntoSetup(script: string, props: Record<string, any>): string {
    const propDeclarations = Object.entries(props)
        .map(([key, value]) => `const ${key} = ${typeof value === 'string' ? `'${value}'` : JSON.stringify(value)};`)
        .join('\n')

    return `${propDeclarations}\n\n${script}`
}
