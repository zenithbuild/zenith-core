/**
 * @zenith/cli - Build Command
 * 
 * Builds the application for production
 */

import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'

export interface BuildOptions {
    outDir?: string
}

export async function build(options: BuildOptions = {}): Promise<void> {
    const project = requireProject()
    const outDir = options.outDir || project.distDir

    logger.header('Zenith Build')
    logger.log(`Source: ${project.pagesDir}`)
    logger.log(`Output: ${outDir}`)

    try {
        const { ZenithBundler } = await import('@zenith/bundler')

        const bundler = new ZenithBundler({
            pagesDir: project.pagesDir,
            outDir
        })

        await bundler.bundle()
        logger.success('Build complete!')

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`Build failed: ${message}`)
        process.exit(1)
    }
}
