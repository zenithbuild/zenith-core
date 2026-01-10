/**
 * @zenith/cli - Entry Point
 * 
 * Main executable for the Zenith CLI.
 * Handles both "zenith <command>" and direct alias calls (zenith-dev, etc.)
 */

import process from 'node:process'
import path from 'node:path'
import { getCommand, showHelp, placeholderCommands } from '../cli/commands/index'
import * as logger from '../cli/utils/logger'

async function main() {
    const args = process.argv.slice(2)
    const invokedAs = path.basename(process.argv[1] || '')

    let commandName: string | undefined = args[0]
    let commandArgs = args.slice(1)

    // Handle aliases (e.g. zenith-dev, zen-dev)
    if (invokedAs.includes('dev')) {
        commandName = 'dev'
        commandArgs = args
    } else if (invokedAs.includes('build')) {
        commandName = 'build'
        commandArgs = args
    } else if (invokedAs.includes('preview')) {
        commandName = 'preview'
        commandArgs = args
    }

    if (!commandName || commandName === '--help' || commandName === '-h') {
        showHelp()
        process.exit(0)
    }

    // Filter out options from commandArgs for simple command parsing if needed
    // However, most commands parse their own options
    const filteredArgs = commandArgs.filter((a: string) => !a.startsWith('--'))

    // Parse options (--key value format)
    const options: Record<string, string> = {}
    for (let i = 0; i < commandArgs.length; i++) {
        const arg = commandArgs[i]!
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const value = commandArgs[i + 1]
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
