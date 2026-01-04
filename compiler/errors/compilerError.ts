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

