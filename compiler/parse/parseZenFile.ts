/**
 * Zenith File Parser
 * 
 * Main entry point for parsing .zen files
 * Phase 1: Parse & Extract only
 */

import { readFileSync } from 'fs'
import type { ZenIR, StyleIR } from '../ir/types'
import { parseTemplate } from './parseTemplate'
import { parseScript } from './parseScript'
import { CompilerError } from '../errors/compilerError'

/**
 * Extract style blocks from HTML
 */
function parseStyles(html: string): StyleIR[] {
  const styles: StyleIR[] = []
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let match
  
  while ((match = styleRegex.exec(html)) !== null) {
    if (match[1]) {
      styles.push({
        raw: match[1].trim()
      })
    }
  }
  
  return styles
}

/**
 * Parse a .zen file into IR
 */
export function parseZenFile(filePath: string): ZenIR {
  let source: string
  
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch (error: any) {
    throw new CompilerError(
      `Failed to read file: ${error.message}`,
      filePath,
      1,
      1
    )
  }
  
  // Parse template
  const template = parseTemplate(source, filePath)
  
  // Parse script
  const script = parseScript(source)
  
  // Parse styles
  const styles = parseStyles(source)
  
  return {
    filePath,
    template,
    script,
    styles
  }
}

