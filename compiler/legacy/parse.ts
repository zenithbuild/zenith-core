import fs from "fs"
import * as parse5 from "parse5"
import type { ZenFile, ScriptBlock, StyleBlock } from "./types"

export function parseZen(path: string): ZenFile {
  const source = fs.readFileSync(path, "utf-8");
  const document = parse5.parse(source);

  const scripts: ScriptBlock[] = [];
  const styles: StyleBlock[] = [];
  let scriptIndex = 0;
  let stylesIndex = 0;

  function extractTextContent(node: any): string {
    if (!node.childNodes?.length) return '';
    return node.childNodes
      .filter((n: any) => n.nodeName === '#text')
      .map((n: any) => n.value || '')
      .join('');
  }

  function walk(node: any) {
    if (node.nodeName === "script" && node.childNodes?.length) {
      const content = extractTextContent(node);
      scripts.push({ content, index: scriptIndex++ })
    }
    if (node.nodeName === "style" && node.childNodes?.length) {
      const content = extractTextContent(node);
      styles.push({
        content,
        index: stylesIndex++
      })
    }


    node.childNodes?.forEach(walk)
  }
  walk(document)

  return {
    html: source,
    scripts,
    styles
  }
}

/**
 * State declaration with location information for error reporting
 */
export interface StateDeclarationInfo {
  name: string;
  value: string;
  line: number;
  column: number;
  scriptIndex: number;
}

/**
 * Extract state declarations from script content with location information
 * Returns an array of StateDeclarationInfo for redeclaration detection
 */
export function extractStateDeclarationsWithLocation(
  scriptContent: string,
  scriptIndex: number
): StateDeclarationInfo[] {
  const declarations: StateDeclarationInfo[] = [];
  const lines = scriptContent.split('\n');
  
  // Find "state identifier = ..." pattern and extract the value
  // Handle multi-line expressions by tracking bracket depth
  const statePattern = /state\s+(\w+)\s*=/g;
  let match;
  
  while ((match = statePattern.exec(scriptContent)) !== null) {
    const name = match[1];
    if (!name) continue;
    
    const startIndex = match.index;
    const valueStartIndex = match.index + match[0].length;
    
    // Extract the value by tracking bracket/brace/paren depth
    let value = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let i = valueStartIndex;
    
    // Skip whitespace at start
    while (i < scriptContent.length && /\s/.test(scriptContent[i])) {
      i++;
    }
    
    const valueStart = i;
    
    while (i < scriptContent.length) {
      const char = scriptContent[i];
      const prevChar = i > 0 ? scriptContent[i - 1] : '';
      
      // Handle string literals
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
        value += char;
        i++;
        continue;
      }
      
      if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        value += char;
        i++;
        continue;
      }
      
      if (inString) {
        value += char;
        i++;
        continue;
      }
      
      // Track bracket depth
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        value += char;
        i++;
        continue;
      }
      
      if (char === ')' || char === ']' || char === '}') {
        depth--;
        value += char;
        i++;
        if (depth < 0) {
          // Unmatched closing bracket - should not happen in valid code
          break;
        }
        // If depth is 0 and we're not in a nested structure, check if we should stop
        if (depth === 0) {
          // Check if next non-whitespace is semicolon or newline (end of statement)
          let nextIdx = i;
          while (nextIdx < scriptContent.length && /\s/.test(scriptContent[nextIdx])) {
            nextIdx++;
          }
          if (nextIdx >= scriptContent.length || scriptContent[nextIdx] === ';' || scriptContent[nextIdx] === '\n') {
            break;
          }
        }
      continue;
    }
    
      // If depth is 0 and we hit a semicolon or newline, we're done
      if (depth === 0 && (char === ';' || char === '\n')) {
        break;
      }
      
      value += char;
      i++;
    }
    
    const trimmedValue = value.trim();
    if (!trimmedValue) continue;
    
    // Calculate line and column from start index
    let line = 1;
    let column = 1;
    let currentIndex = 0;
    
    for (let j = 0; j < lines.length; j++) {
      const currentLine = lines[j];
      if (!currentLine) continue;
      const lineLength = currentLine.length + 1; // +1 for newline
      if (currentIndex + lineLength > startIndex) {
        line = j + 1;
        column = startIndex - currentIndex + 1;
        break;
      }
      currentIndex += lineLength;
    }
    
    declarations.push({
      name,
      value: trimmedValue,
      line,
      column,
      scriptIndex
    });
  }
  
  return declarations;
}

/**
 * Extract state declarations from script content
 * Returns a Map of state name -> initial value expression
 * @deprecated Use extractStateDeclarationsWithLocation for redeclaration detection
 */
export function extractStateDeclarations(scriptContent: string): Map<string, string> {
  const states = new Map<string, string>();
  const declarations = extractStateDeclarationsWithLocation(scriptContent, 0);
  for (const decl of declarations) {
    states.set(decl.name, decl.value);
  }
  return states;
}

/**
 * Transform script content to remove state declarations (they'll be handled by runtime)
 */
export function transformStateDeclarations(scriptContent: string): string {
  // Remove state declarations by finding them and removing the entire declaration
  // Use the same logic as extractStateDeclarationsWithLocation to find declarations
  const statePattern = /state\s+(\w+)\s*=/g;
  const matches: Array<{ start: number; end: number }> = [];
  let match;
  
  while ((match = statePattern.exec(scriptContent)) !== null) {
    const name = match[1];
    if (!name) continue;
    
    const valueStartIndex = match.index + match[0].length;
    
    // Extract the value by tracking bracket/brace/paren depth (same as extraction)
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let i = valueStartIndex;
    
    // Skip whitespace at start
    while (i < scriptContent.length && /\s/.test(scriptContent[i])) {
      i++;
    }
    
    while (i < scriptContent.length) {
      const char = scriptContent[i];
      const prevChar = i > 0 ? scriptContent[i - 1] : '';
      
      // Handle string literals
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
        i++;
        continue;
      }
      
      if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        i++;
        continue;
      }
      
      if (inString) {
        i++;
        continue;
      }
      
      // Track bracket depth
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        i++;
        continue;
      }
      
      if (char === ')' || char === ']' || char === '}') {
        depth--;
        i++;
        if (depth < 0) break;
        if (depth === 0) {
          let nextIdx = i;
          while (nextIdx < scriptContent.length && /\s/.test(scriptContent[nextIdx])) {
            nextIdx++;
          }
          if (nextIdx >= scriptContent.length || scriptContent[nextIdx] === ';' || scriptContent[nextIdx] === '\n') {
            if (scriptContent[nextIdx] === ';') nextIdx++;
            matches.push({ start: match.index, end: nextIdx });
            break;
          }
        }
        continue;
      }
      
      if (depth === 0 && (char === ';' || char === '\n')) {
        if (char === ';') i++;
        matches.push({ start: match.index, end: i });
        break;
      }
      
      i++;
    }
  }
  
  // Remove matches in reverse order to preserve indices
  let result = scriptContent;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    result = result.slice(0, m.start) + result.slice(m.end);
  }
  
  return result;
}
