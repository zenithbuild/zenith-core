/**
 * Import Metadata Types
 * 
 * Structured types for deterministic import parsing.
 * These types represent the parsed AST data for all ES module import forms.
 * 
 * Phase 1: Analysis only - no bundling, no resolution, no emission.
 */

/**
 * Import kind classification covering all static import forms
 */
export type ImportKind =
    | 'default'        // import x from "mod"
    | 'named'          // import { a, b } from "mod"
    | 'namespace'      // import * as x from "mod"
    | 'side-effect'    // import "mod"
    | 're-export'      // export { x } from "mod"
    | 're-export-all'  // export * from "mod"

/**
 * Individual specifier within an import declaration
 */
export interface ImportSpecifier {
    /** Local binding name used in this module */
    local: string
    /** Original exported name (differs from local when aliased: `import { x as y }`) */
    imported?: string
}

/**
 * Structured import metadata - parsed from AST
 * 
 * This is the canonical representation of an import declaration.
 * All imports in source MUST appear as ParsedImport entries.
 */
export interface ParsedImport {
    /** Classification of import type */
    kind: ImportKind
    /** Module specifier (e.g., 'gsap', './Button.zen', '../utils') */
    source: string
    /** Bound names and their aliases */
    specifiers: ImportSpecifier[]
    /** TypeScript type-only import (import type { ... }) */
    isTypeOnly: boolean
    /** Source location for error reporting */
    location: {
        start: number
        end: number
        line: number
        column: number
    }
    /** Original source text of the import statement */
    raw: string
}

/**
 * Result of parsing all imports from a source file
 */
export interface ImportParseResult {
    /** All parsed imports */
    imports: ParsedImport[]
    /** Source file path for error context */
    filePath: string
    /** Whether parsing completed successfully */
    success: boolean
    /** Any errors encountered during parsing */
    errors: ImportParseError[]
}

/**
 * Error encountered during import parsing
 */
export interface ImportParseError {
    message: string
    line?: number
    column?: number
}
