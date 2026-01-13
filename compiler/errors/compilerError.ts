/**
 * Compiler Error Handling
 * 
 * Compiler errors with source location information
 */

export class CompilerError extends Error {
  file: string
  line: number
  column: number

  constructor(message: string, file: string, line: number, column: number) {
    super(`${file}:${line}:${column} ${message}`)
    this.name = 'CompilerError'
    this.file = file
    this.line = line
    this.column = column
  }

  override toString(): string {
    return `${this.file}:${this.line}:${this.column} ${this.message}`
  }
}

/**
 * Invariant Error
 * 
 * Thrown when a Zenith compiler invariant is violated.
 * Invariants are non-negotiable rules that guarantee correct behavior.
 * 
 * If an invariant fails, the compiler is at fault — not the user.
 * The user receives a clear explanation of what is forbidden and why.
 */
export class InvariantError extends CompilerError {
  invariantId: string
  guarantee: string

  constructor(
    invariantId: string,
    message: string,
    guarantee: string,
    file: string,
    line: number,
    column: number
  ) {
    super(`[${invariantId}] ${message}\n\n  Zenith Guarantee: ${guarantee}`, file, line, column)
    this.name = 'InvariantError'
    this.invariantId = invariantId
    this.guarantee = guarantee
  }

  override toString(): string {
    return `${this.file}:${this.line}:${this.column} [${this.invariantId}] ${this.message}`
  }
}

