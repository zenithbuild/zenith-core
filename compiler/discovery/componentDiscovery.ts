/**
 * Component Discovery
 * 
 * Discovers and catalogs components in a Zenith project.
 * Components are auto-imported based on filename:
 * 
 * Auto-Import Rules:
 *   - Component name = filename (without .zen extension)
 *   - Subdirectories are for organization, not namespacing
 *   - Name collisions produce compile-time errors with clear messages
 * 
 * Examples:
 *   components/Header.zen → <Header />
 *   components/sections/HeroSection.zen → <HeroSection />
 *   components/ui/buttons/Primary.zen → <Primary />
 * 
 * If you have name collisions (same filename in different directories),
 * you must rename one of the components.
 * 
 * Requirements:
 *   - Auto-import resolution is deterministic and compile-time only
 *   - Name collisions produce compile-time errors with clear messages
 *   - No runtime component registration or global singleton registries
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseZenFile } from '../parse/parseZenFile'
import { CompilerError } from '../errors/compilerError'
import type { TemplateNode, ExpressionIR } from '../ir/types'

export interface SlotDefinition {
    name: string | null  // null = default slot, string = named slot
    location: {
        line: number
        column: number
    }
}

export interface ComponentMetadata {
    name: string          // Component name (e.g., "Card", "HeroSection")
    path: string          // Absolute path to .zen file
    relativePath: string  // Relative path from components directory
    template: string      // Raw template HTML
    nodes: TemplateNode[] // Parsed template nodes
    expressions: ExpressionIR[] // Expressions referenced by nodes
    slots: SlotDefinition[]
    props: string[]       // Declared props
    styles: string[]      // Raw CSS from <style> blocks
    script: string | null         // Raw script content for bundling
    scriptAttributes: Record<string, string> | null  // Script attributes (setup, lang)
    hasScript: boolean
    hasStyles: boolean
}

/**
 * Discover all components in a directory with auto-import naming
 * 
 * Components are named by their filename (without .zen extension).
 * Subdirectories are for organization only and do not affect the component name.
 * 
 * @param baseDir - Base directory to search (e.g., src/components)
 * @returns Map of component name to metadata
 * @throws CompilerError on name collisions
 */
export function discoverComponents(baseDir: string): Map<string, ComponentMetadata> {
    const components = new Map<string, ComponentMetadata>()
    const collisions = new Map<string, string[]>() // name → [relative paths]

    // Check if components directory exists
    if (!fs.existsSync(baseDir)) {
        return components
    }

    // Recursively find all .zen files
    const zenFiles = findZenFiles(baseDir)

    for (const filePath of zenFiles) {
        try {
            const metadata = parseComponentFile(filePath, baseDir)
            if (metadata) {
                // Check for collision
                if (components.has(metadata.name)) {
                    const existing = components.get(metadata.name)!
                    if (!collisions.has(metadata.name)) {
                        collisions.set(metadata.name, [existing.relativePath])
                    }
                    collisions.get(metadata.name)!.push(metadata.relativePath)
                } else {
                    components.set(metadata.name, metadata)
                }
            }
        } catch (error: any) {
            console.warn(`[Zenith] Failed to parse component ${filePath}: ${error.message}`)
        }
    }

    // Report all collisions as a single error
    if (collisions.size > 0) {
        const collisionMessages = Array.from(collisions.entries())
            .map(([name, paths]) => {
                const pathList = paths.map(p => `  - ${p}`).join('\n')
                return `Component name "${name}" is used by multiple files:\n${pathList}`
            })
            .join('\n\n')
        
        throw new CompilerError(
            `Component name collision detected!\n\n${collisionMessages}\n\n` +
            `Each component must have a unique filename.\n` +
            `To fix: Rename one of the conflicting components to have a unique name.`,
            baseDir,
            0,
            0
        )
    }

    return components
}

/**
 * Recursively find all .zen files in a directory
 */
function findZenFiles(dir: string): string[] {
    const files: string[] = []

    if (!fs.existsSync(dir)) {
        return files
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            files.push(...findZenFiles(fullPath))
        } else if (entry.isFile() && entry.name.endsWith('.zen')) {
            files.push(fullPath)
        }
    }

    return files
}

/**
 * Parse a component file and extract metadata
 * 
 * Component name is derived from the filename (without .zen extension).
 * 
 * @param filePath - Absolute path to the component file
 * @param baseDir - Base directory for component discovery (used for relative path)
 */
function parseComponentFile(filePath: string, baseDir: string): ComponentMetadata | null {
    const ir = parseZenFile(filePath)

    // Component name is just the filename (without .zen extension)
    const componentName = path.basename(filePath, '.zen')
    
    // Relative path for error messages and debugging
    const relativePath = path.relative(baseDir, filePath)

    // Extract slots from template
    const slots = extractSlots(ir.template.nodes)

    // Extract props from script attributes
    const props = ir.script?.attributes['props']?.split(',').map(p => p.trim()) || []

    // Extract raw CSS from styles
    const styles = ir.styles.map(s => s.raw)

    return {
        name: componentName,
        path: filePath,
        relativePath,
        template: ir.template.raw,
        nodes: ir.template.nodes,
        expressions: ir.template.expressions,  // Store expressions for later merging
        slots,
        props,
        styles,
        script: ir.script?.raw || null,                    // Store raw script content
        scriptAttributes: ir.script?.attributes || null,   // Store script attributes
        hasScript: ir.script !== null,
        hasStyles: ir.styles.length > 0
    }
}

/**
 * Extract slot definitions from template nodes
 */
function extractSlots(nodes: TemplateNode[]): SlotDefinition[] {
    const slots: SlotDefinition[] = []

    function traverse(node: TemplateNode) {
        if (node.type === 'element') {
            // Check if this is a <slot> tag
            if (node.tag === 'slot') {
                // Extract slot name from attributes
                const nameAttr = node.attributes.find(attr => attr.name === 'name')
                const slotName = typeof nameAttr?.value === 'string' ? nameAttr.value : null

                slots.push({
                    name: slotName,
                    location: node.location
                })
            }

            // Traverse children
            for (const child of node.children) {
                traverse(child)
            }
        } else if (node.type === 'component') {
            // Also traverse component children
            for (const child of node.children) {
                traverse(child)
            }
        }
    }

    for (const node of nodes) {
        traverse(node)
    }

    return slots
}

/**
 * Check if a tag name represents a component (starts with uppercase)
 */
export function isComponentTag(tagName: string): boolean {
    return tagName.length > 0 && tagName[0] !== undefined && tagName[0] === tagName[0].toUpperCase()
}

/**
 * Get component metadata by name
 */
export function getComponent(
    components: Map<string, ComponentMetadata>,
    name: string
): ComponentMetadata | undefined {
    return components.get(name)
}
