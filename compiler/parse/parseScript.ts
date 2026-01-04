/**
 * Script Parser
 * 
 * Extracts <script> blocks from .zen files
 * Phase 1: Only extracts raw content, no evaluation
 */

import type { ScriptIR } from '../ir/types'

export function parseScript(html: string): ScriptIR | null {
  // Extract script content using regex (simple extraction for Phase 1)
  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  
  if (!scriptMatch || !scriptMatch[1]) {
    return null
  }

  return {
    raw: scriptMatch[1].trim()
  }
}

