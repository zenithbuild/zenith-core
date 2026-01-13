/**
 * Finalize Output
 * 
 * Phase 8/9/10: Generate final compiled HTML + JS output with hydration markers
 * 
 * Ensures:
 * - All expressions are replaced with hydration markers
 * - HTML contains no raw {expression} syntax
 * - JS runtime is ready for browser execution
 * - Hydration markers are correctly placed
 */

import type { CompiledTemplate } from '../output/types'
import type { ZenIR } from '../ir/types'
import { transformIR, type RuntimeCode } from '../runtime/transformIR'
import { validateExpressionsOrThrow } from '../validate/validateExpressions'

/**
 * Finalized output ready for browser
 */
export interface FinalizedOutput {
  html: string
  js: string
  styles: string[]
  hasErrors: boolean
  errors: string[]
}

/**
 * Finalize compiler output
 * 
 * This is the final step that ensures:
 * 1. All expressions are validated
 * 2. HTML contains no raw expressions
 * 3. JS runtime is generated
 * 4. Output is ready for browser
 * 
 * @param ir - Intermediate representation
 * @param compiled - Compiled template from Phase 2
 * @returns Finalized output
 */
export function finalizeOutput(
  ir: ZenIR,
  compiled: CompiledTemplate
): FinalizedOutput {
  const errors: string[] = []

  // 1. Validate all expressions (Phase 8/9/10 requirement)
  try {
    validateExpressionsOrThrow(ir.template.expressions, ir.filePath)
  } catch (error: any) {
    if (error instanceof Error) {
      errors.push(error.message)
      return {
        html: '',
        js: '',
        styles: [],
        hasErrors: true,
        errors
      }
    }
  }

  // 2. Verify HTML contains no raw expressions
  const htmlErrors = verifyNoRawExpressions(compiled.html, ir.filePath)
  if (htmlErrors.length > 0) {
    errors.push(...htmlErrors)
    return {
      html: '',
      js: '',
      styles: [],
      hasErrors: true,
      errors
    }
  }

  // 3. Generate runtime code
  let runtimeCode: RuntimeCode
  try {
    runtimeCode = transformIR(ir)
  } catch (error: any) {
    errors.push(`Runtime generation failed: ${error.message}`)
    return {
      html: '',
      js: '',
      styles: [],
      hasErrors: true,
      errors
    }
  }

  // 4. Combine HTML and JS
  const finalHTML = compiled.html
  const finalJS = runtimeCode.bundle

  return {
    html: finalHTML,
    js: finalJS,
    styles: compiled.styles,
    hasErrors: false,
    errors: []
  }
}

/**
 * Verify HTML contains no raw {expression} syntax
 * 
 * This is a critical check - browser must never see raw expressions
 * 
 * Excludes:
 * - Content inside <pre>, <code> tags (display code samples)
 * - Content that looks like HTML tags (from entity decoding)
 * - Comments
 * - Data attributes
 */
function verifyNoRawExpressions(html: string, filePath: string): string[] {
  const errors: string[] = []

  // Remove content inside <pre> and <code> tags before checking
  // These are code samples that may contain { } legitimately
  let htmlToCheck = html
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, '')

  // Check for raw {expression} patterns (not data-zen-* attributes)
  // Allow data-zen-text, data-zen-attr-* but not raw { }
  const rawExpressionPattern = /\{[^}]*\}/g
  const matches = htmlToCheck.match(rawExpressionPattern)

  if (matches && matches.length > 0) {
    // Filter out false positives
    const actualExpressions = matches.filter(match => {
      // Exclude if it's in a comment
      if (html.includes(`<!--${match}`) || html.includes(`${match}-->`)) {
        return false
      }
      // Exclude if it's in a data attribute value (already processed)
      if (match.includes('data-zen-')) {
        return false
      }
      // Exclude if it contains HTML tags (likely from entity decoding in display content)
      // Real expressions don't start with < inside braces
      if (match.match(/^\{[\s]*</)) {
        return false
      }
      // Exclude if it looks like display content containing HTML (spans, divs, etc)
      if (/<[a-zA-Z]/.test(match)) {
        return false
      }
      // Exclude CSS-like content (common in style attributes)
      if (match.includes(';') && match.includes(':')) {
        return false
      }
      // Exclude if it's a single closing tag pattern (from multiline display)
      if (/^\{[\s]*<\//.test(match)) {
        return false
      }
      // This looks like a raw expression
      return true
    })

    if (actualExpressions.length > 0) {
      errors.push(
        `HTML contains raw expressions that were not compiled: ${actualExpressions.join(', ')}\n` +
        `File: ${filePath}\n` +
        `All expressions must be replaced with hydration markers (data-zen-text, data-zen-attr-*)`
      )
    }
  }

  return errors
}

/**
 * Generate final output with error handling
 * 
 * Throws if validation fails (build must fail on errors)
 */
export function finalizeOutputOrThrow(
  ir: ZenIR,
  compiled: CompiledTemplate
): FinalizedOutput {
  const output = finalizeOutput(ir, compiled)

  if (output.hasErrors) {
    const errorMessage = output.errors.join('\n\n')
    throw new Error(`Compilation failed:\n\n${errorMessage}`)
  }

  return output
}

