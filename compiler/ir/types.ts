/**
 * Zenith Intermediate Representation (IR)
 * 
 * Phase 1: Parse & Extract
 * This IR represents the parsed structure of a .zen file
 * without any runtime execution or transformation.
 */

export type ZenIR = {
  filePath: string
  template: TemplateIR
  script: ScriptIR | null
  styles: StyleIR[]
}

export type TemplateIR = {
  raw: string
  nodes: TemplateNode[]
  expressions: ExpressionIR[]
}

export type TemplateNode =
  | ElementNode
  | TextNode
  | ExpressionNode

export type ElementNode = {
  type: 'element'
  tag: string
  attributes: AttributeIR[]
  children: TemplateNode[]
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Inherited loop context from parent map expressions
}

export type TextNode = {
  type: 'text'
  value: string
  location: SourceLocation
}

export type ExpressionNode = {
  type: 'expression'
  expression: string
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
}

export type AttributeIR = {
  name: string
  value: string | ExpressionIR
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
}

/**
 * Loop context for expressions inside map iterations
 * Phase 7: Tracks loop variables (e.g., todo, index) for expressions inside .map() calls
 */
export type LoopContext = {
  variables: string[]  // e.g., ['todo', 'index'] for todoItems.map((todo, index) => ...)
  mapSource?: string   // The array being mapped, e.g., 'todoItems'
}

export type ExpressionIR = {
  id: string
  code: string
  location: SourceLocation
}

export type ScriptIR = {
  raw: string
}

export type StyleIR = {
  raw: string
}

export type SourceLocation = {
  line: number
  column: number
}

