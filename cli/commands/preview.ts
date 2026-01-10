/**
 * @zenith/cli - Preview Command
 * 
 * Serves the built dist/ folder for production preview
 */

import fs from 'fs'
import path from 'path'
import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'

export interface PreviewOptions {
    port?: number
}

export async function preview(options: PreviewOptions = {}): Promise<void> {
    const project = requireProject()
    const port = options.port || 4000

    logger.header('Zenith Preview Server')
    logger.log(`Serving: ${project.distDir}`)

    if (!fs.existsSync(project.distDir)) {
        logger.error('No dist/ folder found. Run `zenith build` first.')
        process.exit(1)
    }

    const server = Bun.serve({
        port,
        async fetch(req) {
            const url = new URL(req.url)
            let pathname = url.pathname

            if (pathname === '/') pathname = '/index.html'

            let filePath = path.join(project.distDir, pathname)

            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html')
            }

            if (!path.extname(pathname) && !fs.existsSync(filePath)) {
                filePath = path.join(project.distDir, pathname, 'index.html')
            }

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const file = Bun.file(filePath)
                const ext = path.extname(filePath).toLowerCase()
                const contentTypes: Record<string, string> = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.svg': 'image/svg+xml'
                }
                return new Response(file, {
                    headers: { 'Content-Type': contentTypes[ext] || 'application/octet-stream' }
                })
            }

            return new Response('Not Found', { status: 404 })
        }
    })

    logger.success(`Preview server running at http://localhost:${server.port}`)
    logger.info('Press Ctrl+C to stop')

    await new Promise(() => { })
}
