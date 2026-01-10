/**
 * @zenith/cli - Logger Utility
 * 
 * Colored console output for CLI feedback
 */

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
}

export function log(message: string): void {
    console.log(`${colors.cyan}[zenith]${colors.reset} ${message}`)
}

export function success(message: string): void {
    console.log(`${colors.green}✓${colors.reset} ${message}`)
}

export function warn(message: string): void {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`)
}

export function error(message: string): void {
    console.error(`${colors.red}✗${colors.reset} ${message}`)
}

export function info(message: string): void {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`)
}

export function header(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${title}${colors.reset}\n`)
}
