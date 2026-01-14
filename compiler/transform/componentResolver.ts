/**
 * Component Resolution
 * 
 * Resolves component nodes in IR by inlining component templates with slot substitution.
 * Uses compound component pattern for named slots (Card.Header, Card.Footer).
 */

import type { TemplateNode, ComponentNode, ElementNode, ZenIR, LoopContext, ComponentScriptIR } from '../ir/types'
import type { ComponentMetadata } from '../discovery/componentDiscovery'
import { extractSlotsFromChildren, resolveSlots } from './slotResolver'
import { throwOrphanCompoundError, throwUnresolvedComponentError } from '../validate/invariants'

// Track which components have been used (for style and script collection)
const usedComponents = new Set<string>()

/**
 * Resolve all component nodes in a template IR
 * 
 * Recursively replaces ComponentNode instances with their resolved templates
 * Also collects styles AND scripts from used components and adds them to the IR
 */
export function resolveComponentsInIR(
    ir: ZenIR,
    components: Map<string, ComponentMetadata>
): ZenIR {
    // Clear used components tracking for this compilation
    usedComponents.clear()

    // Resolve components in template nodes
    const resolvedNodes = resolveComponentsInNodes(ir.template.nodes, components)

    // Collect styles from all used components
    const componentStyles = Array.from(usedComponents)
        .map(name => components.get(name))
        .filter((meta): meta is ComponentMetadata => meta !== undefined && meta.styles.length > 0)
        .flatMap(meta => meta.styles.map(raw => ({ raw })))

    // Collect scripts from all used components (for bundling)
    const componentScripts: ComponentScriptIR[] = Array.from(usedComponents)
        .map(name => components.get(name))
        .filter((meta): meta is ComponentMetadata => meta !== undefined && meta.script !== null)
        .map(meta => ({
            name: meta.name,
            script: meta.script!,
            props: meta.props,
            scriptAttributes: meta.scriptAttributes || {}
        }))

    return {
        ...ir,
        template: {
            ...ir.template,
            nodes: resolvedNodes
        },
        // Merge component styles with existing page styles
        styles: [...ir.styles, ...componentStyles],
        // Add component scripts for bundling
        componentScripts: [...(ir.componentScripts || []), ...componentScripts]
    }
}

/**
 * Resolve component nodes in a list of template nodes
 */
function resolveComponentsInNodes(
    nodes: TemplateNode[],
    components: Map<string, ComponentMetadata>,
    depth: number = 0
): TemplateNode[] {
    const resolved: TemplateNode[] = []

    for (const node of nodes) {
        const resolvedNode = resolveComponentNode(node, components, depth)

        if (Array.isArray(resolvedNode)) {
            resolved.push(...resolvedNode)
        } else {
            resolved.push(resolvedNode)
        }
    }

    return resolved
}

/**
 * Resolve a single component node
 * 
 * If the node is a component, look up its definition and inline it with slot resolution.
 * Otherwise, recursively process children.
 */
function resolveComponentNode(
    node: TemplateNode,
    components: Map<string, ComponentMetadata>,
    depth: number = 0
): TemplateNode | TemplateNode[] {
    // Handle component nodes
    if (node.type === 'component') {
        return resolveComponent(node, components, depth)
    }

    // Handle element nodes - recursively resolve children
    if (node.type === 'element') {
        const resolvedChildren = resolveComponentsInNodes(node.children, components, depth + 1)

        return {
            ...node,
            children: resolvedChildren
        }
    }

    // Text and expression nodes pass through unchanged
    return node
}

/**
 * Get base component name from compound name
 * 
 * "Card.Header" -> "Card"
 * "Button" -> "Button"
 */
function getBaseComponentName(name: string): string {
    const dotIndex = name.indexOf('.')
    return dotIndex > 0 ? name.slice(0, dotIndex) : name
}

/**
 * Check if a component name is a compound slot marker
 * 
 * "Card.Header" -> true (if Card exists)
 * "Card" -> false
 * "Button" -> false
 */
function isCompoundSlotMarker(name: string, components: Map<string, ComponentMetadata>): boolean {
    const dotIndex = name.indexOf('.')
    if (dotIndex <= 0) return false

    const baseName = name.slice(0, dotIndex)
    return components.has(baseName)
}

/**
 * Resolve a component by inlining its template with slot substitution
 */
function resolveComponent(
    componentNode: ComponentNode,
    components: Map<string, ComponentMetadata>,
    depth: number = 0
): TemplateNode | TemplateNode[] {
    const componentName = componentNode.name

    // Check if this is a compound slot marker (Card.Header, Card.Footer)
    // These are handled by the parent component, not resolved directly
    // INV007: Orphan compound slot markers are a compile-time error
    if (isCompoundSlotMarker(componentName, components)) {
        throwOrphanCompoundError(
            componentName,
            getBaseComponentName(componentName),
            'component', // filePath not available here, will be caught by caller
            componentNode.location.line,
            componentNode.location.column
        )
    }

    // Look up component metadata
    const componentMeta = components.get(componentName)

    // INV003: Unresolved components are a compile-time error
    if (!componentMeta) {
        throwUnresolvedComponentError(
            componentName,
            'component', // filePath not available here, will be caught by caller
            componentNode.location.line,
            componentNode.location.column
        )
    }

    // Track this component as used (for style collection)
    usedComponents.add(componentName)

    // Extract slots from component children FIRST (before resolving nested components)
    // This preserves compound component structure (Card.Header, Card.Footer)
    // IMPORTANT: Pass parent's loopContext to preserve reactive scope
    // Components are purely structural - they don't create new reactive boundaries
    const slots = extractSlotsFromChildren(
        componentName,
        componentNode.children,
        componentNode.loopContext  // Preserve parent's reactive scope
    )

    // Now resolve nested components within the extracted slot content
    const resolvedSlots = {
        default: resolveComponentsInNodes(slots.default, components, depth + 1),
        named: new Map<string, TemplateNode[]>(),
        parentLoopContext: slots.parentLoopContext  // Carry through the parent scope
    }

    for (const [slotName, slotContent] of slots.named) {
        resolvedSlots.named.set(slotName, resolveComponentsInNodes(slotContent, components, depth + 1))
    }

    // Deep clone the component template nodes to avoid mutation
    const templateNodes = JSON.parse(JSON.stringify(componentMeta.nodes)) as TemplateNode[]

    // Resolve slots in component template
    const resolvedTemplate = resolveSlots(templateNodes, resolvedSlots)

    // Forward attributes from component usage to the root element
    // Also adds data-zen-component marker for hydration-driven instantiation
    const forwardedTemplate = forwardAttributesToRoot(
        resolvedTemplate,
        componentNode.attributes,
        componentNode.loopContext,
        componentMeta.hasScript ? componentName : undefined  // Only mark if component has script
    )

    // Recursively resolve any nested components in the resolved template
    const fullyResolved = resolveComponentsInNodes(forwardedTemplate, components, depth + 1)

    return fullyResolved
}

/**
 * Forward attributes from component usage to the template's root element
 * 
 * When using <Button onclick="increment">Text</Button>,
 * the onclick should be applied to the <button> element in Button.zen template.
 * 
 * Also adds data-zen-component marker if componentName is provided,
 * enabling hydration-driven instantiation.
 */
function forwardAttributesToRoot(
    nodes: TemplateNode[],
    attributes: ComponentNode['attributes'],
    loopContext?: LoopContext,
    componentName?: string  // If provided, adds hydration marker
): TemplateNode[] {
    // Find the first non-text element (the root element)
    const rootIndex = nodes.findIndex(n => n.type === 'element')
    if (rootIndex === -1) {
        return nodes
    }

    const root = nodes[rootIndex] as ElementNode

    // Start with existing attributes
    const mergedAttributes = [...root.attributes]

    // Add component hydration marker if this component has a script
    if (componentName) {
        mergedAttributes.push({
            name: 'data-zen-component',
            value: componentName,
            location: { line: 0, column: 0 }
        })
    }

    // Forward attributes from component usage
    for (const attr of attributes) {
        const existingIndex = mergedAttributes.findIndex(a => a.name === attr.name)

        // Attach parent's loopContext to forwarded attributes to preserve reactivity
        const forwardedAttr = {
            ...attr,
            loopContext: attr.loopContext || loopContext
        }

        if (existingIndex >= 0) {
            const existingAttr = mergedAttributes[existingIndex]!
            // Special handling for class: merge classes
            if (attr.name === 'class' && typeof attr.value === 'string' && typeof existingAttr.value === 'string') {
                mergedAttributes[existingIndex] = {
                    ...existingAttr,
                    value: `${existingAttr.value} ${attr.value}`
                }
            } else {
                // Override other attributes
                mergedAttributes[existingIndex] = forwardedAttr
            }
        } else {
            // Add new attribute
            mergedAttributes.push(forwardedAttr)
        }
    }

    // Return updated nodes with root element having merged attributes
    return [
        ...nodes.slice(0, rootIndex),
        {
            ...root,
            attributes: mergedAttributes,
            loopContext: root.loopContext || loopContext
        },
        ...nodes.slice(rootIndex + 1)
    ]
}

/**
 * Check if an IR contains any component nodes
 */
export function hasComponents(nodes: TemplateNode[]): boolean {
    function checkNode(node: TemplateNode): boolean {
        if (node.type === 'component') {
            return true
        }
        if (node.type === 'element') {
            return node.children.some(checkNode)
        }
        return false
    }

    return nodes.some(checkNode)
}
