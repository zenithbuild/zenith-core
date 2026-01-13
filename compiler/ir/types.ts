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
  | ComponentNode
  | ConditionalFragmentNode  // JSX ternary: {cond ? <A /> : <B />}
  | OptionalFragmentNode     // JSX logical AND: {cond && <A />}
  | LoopFragmentNode         // JSX map: {items.map(i => <li>...</li>)}

export type ElementNode = {
  type: 'element'
  tag: string
  attributes: AttributeIR[]
  children: TemplateNode[]
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Inherited loop context from parent map expressions
}

export type ComponentNode = {
  type: 'component'
  name: string
  attributes: AttributeIR[]
  children: TemplateNode[]
  location: SourceLocation
  loopContext?: LoopContext
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

/**
 * Conditional Fragment Node
 * 
 * Represents ternary expressions with JSX branches: {cond ? <A /> : <B />}
 * 
 * BOTH branches are compiled at compile time.
 * Runtime toggles visibility — never creates DOM.
 */
export type ConditionalFragmentNode = {
  type: 'conditional-fragment'
  condition: string           // The condition expression code
  consequent: TemplateNode[]  // Precompiled "true" branch
  alternate: TemplateNode[]   // Precompiled "false" branch
  location: SourceLocation
  loopContext?: LoopContext
}

/**
 * Optional Fragment Node
 * 
 * Represents logical AND expressions with JSX: {cond && <A />}
 * 
 * Fragment is compiled at compile time.
 * Runtime toggles mount/unmount based on condition.
 */
export type OptionalFragmentNode = {
  type: 'optional-fragment'
  condition: string           // The condition expression code
  fragment: TemplateNode[]    // Precompiled fragment
  location: SourceLocation
  loopContext?: LoopContext
}

/**
 * Loop Fragment Node
 * 
 * Represents .map() expressions with JSX body: {items.map(i => <li>...</li>)}
 * 
 * Desugars to @for loop semantics at compile time.
 * Body is compiled once, instantiated per item at runtime.
 * Node identity is compiler-owned via stable keys.
 */
export type LoopFragmentNode = {
  type: 'loop-fragment'
  source: string              // Array expression (e.g., 'items')
  itemVar: string             // Loop variable (e.g., 'item')
  indexVar?: string           // Optional index variable
  body: TemplateNode[]        // Precompiled loop body template
  location: SourceLocation
  loopContext: LoopContext    // Extended with this loop's variables
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
  attributes: Record<string, string>
}

export type StyleIR = {
  raw: string
}

export type SourceLocation = {
  line: number
  column: number
}


