#!/usr/bin/env bun
/**
 * @zenith/cli - Entry Point
 * 
 * Main executable for the Zenith CLI
 */

import process from 'node:process'
import { getCommand, showHelp, placeholderCommands } from '../cli/commands/index'
import * as logger from '../cli/utils/logger'

async function main() {
    const args = process.argv.slice(2)

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showHelp()
        process.exit(0)
    }

    const commandName = args[0]!
    const commandArgs = args.slice(1).filter((a: string) => !a.startsWith('--'))

    // Parse options (--key value format)
    const options: Record<string, string> = {}
    for (let i = 1; i < args.length; i++) {
        const arg = args[i]!
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const value = args[i + 1]
            if (value && !value.startsWith('--')) {
                options[key] = value
                i++
            } else {
                options[key] = 'true'
            }
        }
    }

    // Check for placeholder commands
    if (placeholderCommands.includes(commandName)) {
        logger.warn(`Command "${commandName}" is not yet implemented.`)
        logger.info('This feature is planned for a future release.')
        process.exit(0)
    }

    const command = getCommand(commandName)

    if (!command) {
        logger.error(`Unknown command: ${commandName}`)
        showHelp()
        process.exit(1)
    }

    try {
        await command!.run(commandArgs, options)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(message)
        process.exit(1)
    }
}

main()
