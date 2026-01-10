/**
 * @zenith/cli - Dev Command
 * 
 * Starts the development server with in-memory compilation and hot reload
 */

import path from 'path'
import fs from 'fs'
import { serve } from 'bun'
import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'
import { compileZenSource } from '../../compiler/index'
import { discoverLayouts } from '../../compiler/discovery/layouts'
import { processLayout } from '../../compiler/transform/layoutProcessor'
import { generateRouteDefinition } from '../../router/manifest'
import { generateBundleJS } from '../../runtime/bundle-generator'

export interface DevOptions {
    port?: number
}

interface CompiledPage {
    html: string
    script: string
    styles: string[]
    route: string
    lastModified: number
}

const pageCache = new Map<string, CompiledPage>()

export async function dev(options: DevOptions = {}): Promise<void> {
    const project = requireProject()
    const port = options.port || parseInt(process.env.PORT || '3000', 10)

    // Support both app/ and src/ directory structures
    const appDir = project.root
    const pagesDir = project.pagesDir

    logger.header('Zenith Dev Server')
    logger.log(`Project: ${project.root}`)
    logger.log(`Pages: ${project.pagesDir}`)

    // File extensions that should be served as static assets
    const STATIC_EXTENSIONS = new Set([
        '.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.webp', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
    ])

    /**
     * Generate the shared runtime JavaScript
     */
    function generateRuntimeJS(): string {
        return generateBundleJS()
    }

    /**
     * Compile a .zen page in memory
     */
    function compilePageInMemory(pagePath: string): CompiledPage | null {
        try {
            const layoutsDir = path.join(pagesDir, '../layouts')
            const layouts = discoverLayouts(layoutsDir)

            const source = fs.readFileSync(pagePath, 'utf-8')

            // Find suitable layout
            let processedSource = source
            let layoutToUse = layouts.get('DefaultLayout')

            if (layoutToUse) {
                processedSource = processLayout(source, layoutToUse)
            }

            const result = compileZenSource(processedSource, pagePath)

            if (!result.finalized) {
                throw new Error('Compilation failed: No finalized output')
            }

            const routeDef = generateRouteDefinition(pagePath, pagesDir)

            return {
                html: result.finalized.html,
                script: result.finalized.js,
                styles: result.finalized.styles,
                route: routeDef.path,
                lastModified: Date.now()
            }
        } catch (error: any) {
            logger.error(`Compilation error for ${pagePath}: ${error.message}`)
            return null
        }
    }

    /**
     * Generate full HTML page from compiled output
     */
    function generateDevHTML(page: CompiledPage): string {
        const runtimeTag = `<script src="/runtime.js"></script>`
        const scriptTag = `<script>\n${page.script}\n</script>`
        const allScripts = `${runtimeTag}\n${scriptTag}`

        if (page.html.includes('</body>')) {
            return page.html.replace('</body>', `${allScripts}\n</body>`)
        }

        return `${page.html}\n${allScripts}`
    }

    /**
     * Find .zen page file for a given route
     */
    function findPageForRoute(route: string): string | null {
        const exactPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}.zen`)
        if (fs.existsSync(exactPath)) return exactPath

        const indexPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}/index.zen`)
        if (fs.existsSync(indexPath)) return indexPath

        return null
    }

    const cachedRuntimeJS = generateRuntimeJS()

    const server = serve({
        port,
        async fetch(req) {
            const url = new URL(req.url)
            const pathname = url.pathname
            const ext = path.extname(pathname).toLowerCase()

            if (pathname === '/runtime.js' || pathname === '/assets/bundle.js') {
                return new Response(cachedRuntimeJS, {
                    headers: {
                        'Content-Type': 'application/javascript; charset=utf-8',
                        'Cache-Control': 'no-cache'
                    }
                })
            }

            if (pathname === '/assets/styles.css' || pathname === '/styles/global.css' || pathname === '/app/styles/global.css') {
                const globalCssPath = path.join(pagesDir, '../styles/global.css')
                if (fs.existsSync(globalCssPath)) {
                    const css = fs.readFileSync(globalCssPath, 'utf-8')
                    return new Response(css, {
                        headers: { 'Content-Type': 'text/css; charset=utf-8' }
                    })
                }
            }

            if (STATIC_EXTENSIONS.has(ext)) {
                const publicPath = path.join(pagesDir, '../public', pathname)
                const distPath = path.join(pagesDir, '../dist', pathname)
                const appRelativePath = path.join(pagesDir, '..', pathname)

                for (const filePath of [publicPath, distPath, appRelativePath]) {
                    const file = Bun.file(filePath)
                    if (await file.exists()) {
                        return new Response(file)
                    }
                }
                return new Response('Not found', { status: 404 })
            }

            const pagePath = findPageForRoute(pathname)
            if (pagePath) {
                let cached = pageCache.get(pagePath)
                const stat = fs.statSync(pagePath)

                if (!cached || stat.mtimeMs > cached.lastModified) {
                    const compiled = compilePageInMemory(pagePath)
                    if (compiled) {
                        pageCache.set(pagePath, compiled)
                        cached = compiled
                    }
                }

                if (cached) {
                    const html = generateDevHTML(cached)
                    return new Response(html, {
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    })
                }
            }

            return new Response('Not Found', { status: 404 })
        }
    })

    logger.success(`Server running at http://localhost:${server.port}`)
    logger.info('• In-memory compilation active')
    logger.info('• Auto-recompile on file changes')
    logger.info('Press Ctrl+C to stop')

    await new Promise(() => { })
}
