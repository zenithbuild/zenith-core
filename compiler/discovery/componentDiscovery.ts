/**
 * Component Discovery
 * 
 * Discovers and catalogs components in a Zenith project
 * Similar to layout discovery but for reusable components
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseZenFile } from '../parse/parseZenFile'
import type { TemplateNode } from '../ir/types'

export interface SlotDefinition {
    name: string | null  // null = default slot, string = named slot
    location: {
        line: number
        column: number
    }
}

export interface ComponentMetadata {
    name: string          // Component name (e.g., "Card", "Button")
    path: string          // Absolute path to .zen file
    template: string      // Raw template HTML
    nodes: TemplateNode[] // Parsed template nodes
    slots: SlotDefinition[]
    props: string[]       // Declared props
    styles: string[]      // Raw CSS from <style> blocks
    script: string | null         // Raw script content for bundling
    scriptAttributes: Record<string, string> | null  // Script attributes (setup, lang)
    hasScript: boolean
    hasStyles: boolean
}

/**
 * Discover all components in a directory
 * @param baseDir - Base directory to search (e.g., src/components)
 * @returns Map of component name to metadata
 */
export function discoverComponents(baseDir: string): Map<string, ComponentMetadata> {
    const components = new Map<string, ComponentMetadata>()

    // Check if components directory exists
    if (!fs.existsSync(baseDir)) {
        return components
    }

    // Recursively find all .zen files
    const zenFiles = findZenFiles(baseDir)

    for (const filePath of zenFiles) {
        try {
            const metadata = parseComponentFile(filePath)
            if (metadata) {
                components.set(metadata.name, metadata)
            }
        } catch (error: any) {
            console.warn(`[Zenith] Failed to parse component ${filePath}: ${error.message}`)
        }
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
 */
function parseComponentFile(filePath: string): ComponentMetadata | null {
    const ir = parseZenFile(filePath)

    // Extract component name from filename
    const basename = path.basename(filePath, '.zen')
    const componentName = basename

    // Extract slots from template
    const slots = extractSlots(ir.template.nodes)

    // Extract props from script attributes
    const props = ir.script?.attributes['props']?.split(',').map(p => p.trim()) || []

    // Extract raw CSS from styles
    const styles = ir.styles.map(s => s.raw)

    return {
        name: componentName,
        path: filePath,
        template: ir.template.raw,
        nodes: ir.template.nodes,
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
