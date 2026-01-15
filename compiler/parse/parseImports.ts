/**
 * Import Parser Module
 * 
 * Phase 1: Deterministic import parsing using Acorn AST.
 * 
 * This module parses JavaScript/TypeScript source code and extracts
 * structured metadata for all import declarations. It does NOT:
 * - Resolve imports
 * - Bundle dependencies
 * - Emit any code
 * 
 * All import analysis happens at compile time.
 */

import * as acorn from 'acorn'
import type {
    ParsedImport,
    ImportSpecifier,
    ImportKind,
    ImportParseResult,
    ImportParseError
} from './importTypes'

// Acorn AST node types (simplified for our use case)
interface AcornNode {
    type: string
    start: number
    end: number
    loc?: {
        start: { line: number; column: number }
        end: { line: number; column: number }
    }
}

interface ImportDeclarationNode extends AcornNode {
    type: 'ImportDeclaration'
    source: { value: string; raw: string }
    specifiers: Array<{
        type: 'ImportDefaultSpecifier' | 'ImportSpecifier' | 'ImportNamespaceSpecifier'
        local: { name: string }
        imported?: { name: string }
    }>
    importKind?: 'type' | 'value'
}

interface ExportNamedDeclarationNode extends AcornNode {
    type: 'ExportNamedDeclaration'
    source?: { value: string; raw: string }
    specifiers: Array<{
        type: 'ExportSpecifier'
        local: { name: string }
        exported: { name: string }
    }>
    exportKind?: 'type' | 'value'
}

interface ExportAllDeclarationNode extends AcornNode {
    type: 'ExportAllDeclaration'
    source: { value: string; raw: string }
    exported?: { name: string }
}

interface ProgramNode extends AcornNode {
    type: 'Program'
    body: AcornNode[]
}

/**
 * Parse an ImportDeclaration AST node into structured metadata
 */
function parseImportDeclaration(
    node: ImportDeclarationNode,
    source: string
): ParsedImport {
    const specifiers: ImportSpecifier[] = []
    let kind: ImportKind = 'side-effect'

    for (const spec of node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
            kind = 'default'
            specifiers.push({ local: spec.local.name })
        } else if (spec.type === 'ImportNamespaceSpecifier') {
            kind = 'namespace'
            specifiers.push({ local: spec.local.name })
        } else if (spec.type === 'ImportSpecifier') {
            kind = 'named'
            specifiers.push({
                local: spec.local.name,
                imported: spec.imported?.name !== spec.local.name
                    ? spec.imported?.name
                    : undefined
            })
        }
    }

    // If no specifiers, it's a side-effect import
    if (node.specifiers.length === 0) {
        kind = 'side-effect'
    }

    return {
        kind,
        source: node.source.value,
        specifiers,
        isTypeOnly: node.importKind === 'type',
        location: {
            start: node.start,
            end: node.end,
            line: node.loc?.start.line ?? 1,
            column: node.loc?.start.column ?? 0
        },
        raw: source.slice(node.start, node.end)
    }
}

/**
 * Parse an ExportNamedDeclaration with source (re-export)
 */
function parseReExport(
    node: ExportNamedDeclarationNode,
    source: string
): ParsedImport {
    const specifiers: ImportSpecifier[] = node.specifiers.map(spec => ({
        local: spec.exported.name,
        imported: spec.local.name !== spec.exported.name
            ? spec.local.name
            : undefined
    }))

    return {
        kind: 're-export',
        source: node.source!.value,
        specifiers,
        isTypeOnly: node.exportKind === 'type',
        location: {
            start: node.start,
            end: node.end,
            line: node.loc?.start.line ?? 1,
            column: node.loc?.start.column ?? 0
        },
        raw: source.slice(node.start, node.end)
    }
}

/**
 * Parse an ExportAllDeclaration (export * from "mod")
 */
function parseExportAll(
    node: ExportAllDeclarationNode,
    source: string
): ParsedImport {
    return {
        kind: 're-export-all',
        source: node.source.value,
        specifiers: node.exported
            ? [{ local: node.exported.name }]
            : [],
        isTypeOnly: false,
        location: {
            start: node.start,
            end: node.end,
            line: node.loc?.start.line ?? 1,
            column: node.loc?.start.column ?? 0
        },
        raw: source.slice(node.start, node.end)
    }
}

/**
 * Parse all imports from a source file using Acorn AST parser
 * 
 * @param source - JavaScript/TypeScript source code
 * @param filePath - Path to the source file (for error context)
 * @returns ParsedImport[] - All import declarations found
 * 
 * @example
 * const result = parseImports(`
 *   import { gsap } from 'gsap';
 *   import Button from './Button.zen';
 * `, 'MyComponent.zen');
 * 
 * // result.imports[0].kind === 'named'
 * // result.imports[0].source === 'gsap'
 */
export function parseImports(
    source: string,
    filePath: string
): ImportParseResult {
    const imports: ParsedImport[] = []
    const errors: ImportParseError[] = []

    // Strip TypeScript type annotations for parsing
    // Acorn doesn't support TypeScript, so we handle type imports specially
    const strippedSource = stripTypeAnnotations(source)

    let ast: ProgramNode

    try {
        ast = acorn.parse(strippedSource, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true
        }) as unknown as ProgramNode
    } catch (error: any) {
        // Parse error - return with error info
        return {
            imports: [],
            filePath,
            success: false,
            errors: [{
                message: `Parse error: ${error.message}`,
                line: error.loc?.line,
                column: error.loc?.column
            }]
        }
    }

    // Walk the AST to find all import/export declarations
    for (const node of ast.body) {
        try {
            if (node.type === 'ImportDeclaration') {
                imports.push(parseImportDeclaration(
                    node as ImportDeclarationNode,
                    strippedSource
                ))
            } else if (node.type === 'ExportNamedDeclaration') {
                const exportNode = node as ExportNamedDeclarationNode
                // Only process re-exports (exports with a source)
                if (exportNode.source) {
                    imports.push(parseReExport(exportNode, strippedSource))
                }
            } else if (node.type === 'ExportAllDeclaration') {
                imports.push(parseExportAll(
                    node as ExportAllDeclarationNode,
                    strippedSource
                ))
            }
        } catch (error: any) {
            errors.push({
                message: `Failed to parse node: ${error.message}`,
                line: (node as any).loc?.start?.line
            })
        }
    }

    return {
        imports,
        filePath,
        success: errors.length === 0,
        errors
    }
}

/**
 * Strip TypeScript-specific syntax that Acorn can't parse
 * This is a simple preprocessing step for common patterns
 */
function stripTypeAnnotations(source: string): string {
    // Handle `import type` by converting to regular import
    // The isTypeOnly flag will be set based on the original text
    let result = source

    // Track which imports are type-only before stripping
    const typeImportPattern = /import\s+type\s+/g
    result = result.replace(typeImportPattern, 'import ')

    // Strip inline type annotations in destructuring
    // e.g., `import { type Foo, Bar }` -> `import { Foo, Bar }`
    result = result.replace(/,\s*type\s+(\w+)/g, ', $1')
    result = result.replace(/{\s*type\s+(\w+)/g, '{ $1')

    // Strip type-only exports
    result = result.replace(/export\s+type\s+{/g, 'export {')

    return result
}

/**
 * Check if the original source has a type import at the given position
 */
export function isTypeImportAtPosition(source: string, position: number): boolean {
    const before = source.slice(Math.max(0, position - 20), position)
    return /import\s+type\s*$/.test(before)
}

/**
 * Categorize imports by their module source type
 */
export function categorizeImports(imports: ParsedImport[]): {
    zenImports: ParsedImport[]      // .zen file imports (compile-time)
    npmImports: ParsedImport[]      // Package imports (npm)
    relativeImports: ParsedImport[] // Relative path imports
} {
    const zenImports: ParsedImport[] = []
    const npmImports: ParsedImport[] = []
    const relativeImports: ParsedImport[] = []

    for (const imp of imports) {
        if (imp.source.endsWith('.zen')) {
            zenImports.push(imp)
        } else if (imp.source.startsWith('./') || imp.source.startsWith('../')) {
            relativeImports.push(imp)
        } else {
            npmImports.push(imp)
        }
    }

    return { zenImports, npmImports, relativeImports }
}
