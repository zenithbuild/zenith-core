/**
 * Slot Resolution - Compound Component Model
 * 
 * Resolves slots using compound component pattern (Card.Header, Card.Body)
 * NOT template tags. This matches React/Astro semantics.
 * 
 * IMPORTANT: Slot content must preserve the parent reactive scope.
 * Components are purely structural transforms - they don't create new reactive boundaries.
 * 
 * Example usage:
 * <Card>
 *   <Card.Header><h3>Title</h3></Card.Header>
 *   <p>Body content goes to default slot</p>
 *   <Card.Footer><Button>OK</Button></Card.Footer>
 * </Card>
 */

import type { TemplateNode, ComponentNode, ElementNode, LoopContext } from '../ir/types'

export interface ResolvedSlots {
    default: TemplateNode[]
    named: Map<string, TemplateNode[]>
    // Preserve the parent's reactive scope for slot content
    parentLoopContext?: LoopContext
}

/**
 * Extract slots from component children using compound component pattern
 * 
 * Children named `ParentComponent.SlotName` become named slots.
 * All other children go to the default slot.
 * Preserves the parent's reactive scope (loopContext) for all slot content.
 * 
 * @param parentName - Name of the parent component (e.g., "Card")
 * @param children - Child nodes from component usage
 * @param parentLoopContext - The reactive scope from the parent (must be preserved)
 */
export function extractSlotsFromChildren(
    parentName: string,
    children: TemplateNode[],
    parentLoopContext?: LoopContext
): ResolvedSlots {
    const defaultSlot: TemplateNode[] = []
    const namedSlots = new Map<string, TemplateNode[]>()

    for (const child of children) {
        // Check if this is a compound component (e.g., Card.Header)
        if (child.type === 'component') {
            const compoundMatch = parseCompoundName(child.name, parentName)

            if (compoundMatch) {
                // This is a named slot (e.g., Card.Header -> "header")
                const slotName = compoundMatch.toLowerCase()

                if (!namedSlots.has(slotName)) {
                    namedSlots.set(slotName, [])
                }

                // The compound component's children become the slot content
                // Preserve parent's loopContext on each child
                const scopedChildren = child.children.map(c =>
                    rebindNodeToScope(c, parentLoopContext)
                )
                namedSlots.get(slotName)!.push(...scopedChildren)
            } else {
                // Regular component, goes to default slot
                // Preserve parent's loopContext
                defaultSlot.push(rebindNodeToScope(child, parentLoopContext))
            }
        } else {
            // Elements, text, expressions go to default slot
            // Preserve parent's loopContext
            defaultSlot.push(rebindNodeToScope(child, parentLoopContext))
        }
    }

    return {
        default: defaultSlot,
        named: namedSlots,
        parentLoopContext
    }
}

/**
 * Rebind a node to the parent's reactive scope
 * 
 * This ensures that expressions and event bindings in slot content
 * remain connected to the parent component's reactive graph.
 * Components must be purely structural - they don't create new reactive boundaries.
 */
function rebindNodeToScope(node: TemplateNode, loopContext?: LoopContext): TemplateNode {
    // If no parent scope to preserve, return as-is
    if (!loopContext) {
        return node
    }

    // Merge the parent's loopContext with existing loopContext
    // Parent scope takes precedence to ensure reactivity flows through
    switch (node.type) {
        case 'expression':
            return {
                ...node,
                loopContext: mergeLoopContext(node.loopContext, loopContext)
            }

        case 'element':
            return {
                ...node,
                loopContext: mergeLoopContext(node.loopContext, loopContext),
                attributes: node.attributes.map(attr => ({
                    ...attr,
                    loopContext: attr.loopContext
                        ? mergeLoopContext(attr.loopContext, loopContext)
                        : loopContext
                })),
                children: node.children.map(c => rebindNodeToScope(c, loopContext))
            }

        case 'component':
            return {
                ...node,
                loopContext: mergeLoopContext(node.loopContext, loopContext),
                children: node.children.map(c => rebindNodeToScope(c, loopContext))
            }

        case 'text':
            // Text nodes don't have reactive bindings
            return node

        default:
            return node
    }
}

/**
 * Merge two loop contexts, combining their variables
 * Parent context variables take precedence (added last so they shadow)
 */
function mergeLoopContext(existing?: LoopContext, parent?: LoopContext): LoopContext | undefined {
    if (!existing && !parent) return undefined
    if (!existing) return parent
    if (!parent) return existing

    // Combine variables, parent variables shadow existing
    const allVars = new Set([...existing.variables, ...parent.variables])

    return {
        variables: Array.from(allVars),
        mapSource: parent.mapSource || existing.mapSource
    }
}

/**
 * Parse compound component name
 * 
 * Given "Card.Header" and parent "Card", returns "Header"
 * Given "Card.Footer" and parent "Card", returns "Footer"
 * Given "Button" and parent "Card", returns null (not a compound)
 * 
 * @param componentName - Full component name (e.g., "Card.Header")
 * @param parentName - Parent component name (e.g., "Card")
 * @returns Slot name or null if not a compound of this parent
 */
function parseCompoundName(componentName: string, parentName: string): string | null {
    const prefix = `${parentName}.`

    if (componentName.startsWith(prefix)) {
        return componentName.slice(prefix.length)
    }

    return null
}

/**
 * Resolve slots in component template nodes
 * 
 * Replaces <slot /> and <slot name="X" /> with children from resolved slots.
 * All slot content is rebound to the parent's reactive scope.
 */
export function resolveSlots(
    componentNodes: TemplateNode[],
    slots: ResolvedSlots
): TemplateNode[] {
    const resolved: TemplateNode[] = []

    for (const node of componentNodes) {
        const result = resolveNode(node, slots)
        if (Array.isArray(result)) {
            resolved.push(...result)
        } else {
            resolved.push(result)
        }
    }

    return resolved
}

/**
 * Resolve a single node, replacing slot tags with content
 * Ensures all slot content maintains the parent's reactive scope
 */
function resolveNode(
    node: TemplateNode,
    slots: ResolvedSlots
): TemplateNode | TemplateNode[] {
    if (node.type === 'element' && node.tag === 'slot') {
        // This is a slot tag - replace it with children
        const nameAttr = node.attributes.find(attr => attr.name === 'name')
        const slotName = typeof nameAttr?.value === 'string' ? nameAttr.value : null

        if (slotName) {
            // Named slot
            const namedChildren = slots.named.get(slotName.toLowerCase()) || []

            // If no children provided and slot has fallback content, use fallback
            if (namedChildren.length === 0 && node.children.length > 0) {
                return node.children
            }

            // Return slot content (already scoped during extraction)
            return namedChildren.length > 0 ? namedChildren : []
        } else {
            // Default slot
            // If no children provided and slot has fallback content, use fallback
            if (slots.default.length === 0 && node.children.length > 0) {
                return node.children
            }

            // Return slot content (already scoped during extraction)
            return slots.default
        }
    }

    if (node.type === 'element') {
        // Recursively resolve slots in children
        const resolvedChildren: TemplateNode[] = []
        for (const child of node.children) {
            const result = resolveNode(child, slots)
            if (Array.isArray(result)) {
                resolvedChildren.push(...result)
            } else {
                resolvedChildren.push(result)
            }
        }

        return {
            ...node,
            children: resolvedChildren
        }
    }

    if (node.type === 'component') {
        // Recursively resolve slots in component children
        const resolvedChildren: TemplateNode[] = []
        for (const child of node.children) {
            const result = resolveNode(child, slots)
            if (Array.isArray(result)) {
                resolvedChildren.push(...result)
            } else {
                resolvedChildren.push(result)
            }
        }

        return {
            ...node,
            children: resolvedChildren
        }
    }

    // Text and expression nodes pass through unchanged
    return node
}

/**
 * Check if a node tree contains any slots
 */
export function hasSlots(nodes: TemplateNode[]): boolean {
    function checkNode(node: TemplateNode): boolean {
        if (node.type === 'element') {
            if (node.tag === 'slot') {
                return true
            }
            return node.children.some(checkNode)
        }
        if (node.type === 'component') {
            return node.children.some(checkNode)
        }
        return false
    }

    return nodes.some(checkNode)
}
