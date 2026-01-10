/**
 * @zenith/cli - Dev Command
 * 
 * Starts the development server with hot reload
 */

import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'

export interface DevOptions {
    port?: number
}

export async function dev(options: DevOptions = {}): Promise<void> {
    const project = requireProject()
    const port = options.port || 3000

    logger.header('Zenith Dev Server')
    logger.log(`Project: ${project.root}`)
    logger.log(`Pages: ${project.pagesDir}`)

    try {
        // Dynamic import to avoid bundling @zenith/bundler
        const { ZenithBundler } = await import('@zenith/bundler')

        const bundler = new ZenithBundler({
            pagesDir: project.pagesDir,
            outDir: project.distDir
        })

        // Initial build
        logger.log('Building...')
        await bundler.bundle()
        logger.success('Build complete')

        // Start server
        const server = Bun.serve({
            port,
            async fetch(req) {
                const url = new URL(req.url)
                let pathname = url.pathname

                if (pathname === '/') pathname = '/index.html'

                const fs = await import('fs')
                const path = await import('path')

                let filePath = path.join(project.distDir, pathname)

                if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                    filePath = path.join(filePath, 'index.html')
                }

                if (!path.extname(pathname) && !fs.existsSync(filePath)) {
                    filePath = path.join(project.distDir, pathname, 'index.html')
                }

                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const file = Bun.file(filePath)
                    return new Response(file)
                }

                return new Response('Not Found', { status: 404 })
            }
        })

        logger.success(`Server running at http://localhost:${server.port}`)
        logger.info('Press Ctrl+C to stop')

        // Keep process alive
        await new Promise(() => { })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`Dev server failed: ${message}`)
        process.exit(1)
    }
}
