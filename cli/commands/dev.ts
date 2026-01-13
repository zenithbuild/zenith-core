import path from 'path'
import fs from 'fs'
import { serve, type ServerWebSocket } from 'bun'
import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'
import * as brand from '../utils/branding'
import { compileZenSource } from '../../compiler/index'
import { discoverLayouts } from '../../compiler/discovery/layouts'
import { processLayout } from '../../compiler/transform/layoutProcessor'
import { generateRouteDefinition } from '../../router/manifest'
import { generateBundleJS } from '../../runtime/bundle-generator'
import { loadContent } from '../utils/content'
import { loadZenithConfig } from '../../core/config/loader'
import { PluginRegistry, createPluginContext } from '../../core/plugins/registry'
import type { ContentItem } from '../../core/config/types'

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
    const pagesDir = project.pagesDir
    const rootDir = project.root
    const contentDir = path.join(rootDir, 'content')

    // Load zenith.config.ts if present
    const config = await loadZenithConfig(rootDir)
    const registry = new PluginRegistry()

    console.log('[Zenith] Config plugins:', config.plugins?.length ?? 0)

    // Register plugins from config
    for (const plugin of config.plugins || []) {
        console.log('[Zenith] Registering plugin:', plugin.name)
        registry.register(plugin)
    }

    // Initialize content data
    let contentData: Record<string, ContentItem[]> = {}

    // Initialize plugins with context
    const hasContentPlugin = registry.has('zenith-content')
    console.log('[Zenith] Has zenith-content plugin:', hasContentPlugin)

    if (hasContentPlugin) {
        await registry.initAll(createPluginContext(rootDir, (data) => {
            console.log('[Zenith] Content plugin set data, collections:', Object.keys(data))
            contentData = data
        }))
    } else {
        // Fallback to legacy content loading if no content plugin configured
        console.log('[Zenith] Using legacy content loading from:', contentDir)
        contentData = loadContent(contentDir)
    }

    console.log('[Zenith] Content collections loaded:', Object.keys(contentData))

    const clients = new Set<ServerWebSocket<unknown>>()

    // Branded Startup Panel
    brand.showServerPanel({
        project: project.root,
        pages: project.pagesDir,
        url: `http://localhost:${port}`,
        hmr: true,
        mode: 'In-memory compilation'
    })

    // File extensions that should be served as static assets
    const STATIC_EXTENSIONS = new Set([
        '.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.webp', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
    ])

    /**
     * Compile a .zen page in memory
     */
    function compilePageInMemory(pagePath: string): CompiledPage | null {
        try {
            const layoutsDir = path.join(pagesDir, '../layouts')
            const componentsDir = path.join(pagesDir, '../components')
            const layouts = discoverLayouts(layoutsDir)
            const source = fs.readFileSync(pagePath, 'utf-8')

            let processedSource = source
            let layoutToUse = layouts.get('DefaultLayout')

            if (layoutToUse) processedSource = processLayout(source, layoutToUse)

            const result = compileZenSource(processedSource, pagePath, {
                componentsDir: fs.existsSync(componentsDir) ? componentsDir : undefined
            })
            if (!result.finalized) throw new Error('Compilation failed')

            const routeDef = generateRouteDefinition(pagePath, pagesDir)

            return {
                html: result.finalized.html,
                script: result.finalized.js,
                styles: result.finalized.styles,
                route: routeDef.path,
                lastModified: Date.now()
            }
        } catch (error: any) {
            logger.error(`Compilation error: ${error.message}`)
            return null
        }
    }

    // Set up file watching for HMR
    const watcher = fs.watch(path.join(pagesDir, '..'), { recursive: true }, (event, filename) => {
        if (!filename) return

        if (filename.endsWith('.zen')) {
            logger.hmr('Page', filename)
            // Broadcast reload
            for (const client of clients) {
                client.send(JSON.stringify({ type: 'reload' }))
            }
        } else if (filename.endsWith('.css')) {
            logger.hmr('CSS', filename)
            for (const client of clients) {
                client.send(JSON.stringify({
                    type: 'style-update',
                    url: filename.includes('global.css') ? '/styles/global.css' : `/${filename}`
                }))
            }
        } else if (filename.startsWith('content') || filename.includes('zenith-docs')) {
            logger.hmr('Content', filename)
            // Reinitialize content plugin to reload data
            if (registry.has('zenith-content')) {
                registry.initAll(createPluginContext(rootDir, (data) => {
                    contentData = data
                }))
            } else {
                contentData = loadContent(contentDir)
            }
            for (const client of clients) {
                client.send(JSON.stringify({ type: 'reload' }))
            }
        }
    })

    const server = serve({
        port,
        fetch(req, server) {
            const startTime = performance.now()
            const url = new URL(req.url)
            const pathname = url.pathname
            const ext = path.extname(pathname).toLowerCase()

            // Upgrade to WebSocket for HMR
            if (pathname === '/hmr') {
                const upgraded = server.upgrade(req)
                if (upgraded) return undefined
            }

            // Handle Zenith assets
            if (pathname === '/runtime.js') {
                const response = new Response(generateBundleJS(), {
                    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
                })
                logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                return response
            }

            if (pathname === '/styles/global.css') {
                const globalCssPath = path.join(pagesDir, '../styles/global.css')
                if (fs.existsSync(globalCssPath)) {
                    const css = fs.readFileSync(globalCssPath, 'utf-8')
                    const response = new Response(css, { headers: { 'Content-Type': 'text/css' } })
                    logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                    return response
                }
            }

            // Static files
            if (STATIC_EXTENSIONS.has(ext)) {
                const publicPath = path.join(pagesDir, '../public', pathname)
                if (fs.existsSync(publicPath)) {
                    const response = new Response(Bun.file(publicPath))
                    logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                    return response
                }
            }

            // Zenith Pages
            const pagePath = findPageForRoute(pathname, pagesDir)
            if (pagePath) {
                const compileStart = performance.now()
                let cached = pageCache.get(pagePath)
                const stat = fs.statSync(pagePath)

                if (!cached || stat.mtimeMs > cached.lastModified) {
                    cached = compilePageInMemory(pagePath) || undefined
                    if (cached) pageCache.set(pagePath, cached)
                }
                const compileEnd = performance.now()

                if (cached) {
                    const renderStart = performance.now()
                    const html = generateDevHTML(cached, contentData)
                    const renderEnd = performance.now()

                    const totalTime = Math.round(performance.now() - startTime)
                    const compileTime = Math.round(compileEnd - compileStart)
                    const renderTime = Math.round(renderEnd - renderStart)

                    logger.route('GET', pathname, 200, totalTime, compileTime, renderTime)
                    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
                }
            }

            logger.route('GET', pathname, 404, Math.round(performance.now() - startTime), 0, 0)
            return new Response('Not Found', { status: 404 })
        },
        websocket: {
            open(ws) {
                clients.add(ws)
            },
            close(ws) {
                clients.delete(ws)
            },
            message() { }
        }
    })

    process.on('SIGINT', () => {
        watcher.close()
        server.stop()
        process.exit(0)
    })

    await new Promise(() => { })
}

function findPageForRoute(route: string, pagesDir: string): string | null {
    // 1. Try exact match first (e.g., /about -> about.zen)
    const exactPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}.zen`)
    if (fs.existsSync(exactPath)) return exactPath

    // 2. Try index.zen in directory (e.g., /about -> about/index.zen)
    const indexPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}/index.zen`)
    if (fs.existsSync(indexPath)) return indexPath

    // 3. Try dynamic routes [slug].zen, [...slug].zen
    // Walk up the path looking for dynamic segments
    const segments = route === '/' ? [] : route.slice(1).split('/').filter(Boolean)

    // Try matching with dynamic [slug].zen at each level
    for (let i = segments.length - 1; i >= 0; i--) {
        const staticPart = segments.slice(0, i).join('/')
        const baseDir = staticPart ? path.join(pagesDir, staticPart) : pagesDir

        // Check for [slug].zen (single segment catch)
        const singleDynamicPath = path.join(baseDir, '[slug].zen')
        if (fs.existsSync(singleDynamicPath)) return singleDynamicPath

        // Check for [...slug].zen (catch-all)
        const catchAllPath = path.join(baseDir, '[...slug].zen')
        if (fs.existsSync(catchAllPath)) return catchAllPath
    }

    // 4. Check for catch-all at root
    const rootCatchAll = path.join(pagesDir, '[...slug].zen')
    if (fs.existsSync(rootCatchAll)) return rootCatchAll

    return null
}

function generateDevHTML(page: CompiledPage, contentData: any = {}): string {
    const runtimeTag = `<script src="/runtime.js"></script>`
    // Escape </script> sequences in JSON content to prevent breaking the script tag
    const contentJson = JSON.stringify(contentData).replace(/<\//g, '<\\/')
    const contentTag = `<script>window.__ZENITH_CONTENT__ = ${contentJson};</script>`
    const scriptTag = `<script>\n${page.script}\n</script>`
    const allScripts = `${runtimeTag}\n${contentTag}\n${scriptTag}`
    return page.html.includes('</body>')
        ? page.html.replace('</body>', `${allScripts}\n</body>`)
        : `${page.html}\n${allScripts}`
}
