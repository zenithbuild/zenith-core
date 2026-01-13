/**
 * Invariant Validation
 * 
 * Compile-time checks that enforce Zenith's non-negotiable invariants.
 * If any invariant is violated, compilation fails immediately with a clear explanation.
 * 
 * INVARIANTS:
 * 1. Components are structural only — no reactive scopes, no state
 * 2. Reactivity is scope-owned — flows through components, never into them
 * 3. Slot projection preserves identity — loopContext is preserved or merged upward
 * 4. Attribute ownership belongs to usage — must be forwarded to semantic root
 * 5. All resolution is compile-time — no unresolved components
 * 6. Failure is a compiler error — no silent degradation
 */

import type { ZenIR, TemplateNode, ElementNode, ComponentNode, LoopContext } from '../ir/types'
import { InvariantError } from '../errors/compilerError'

/**
 * Invariant Codes
 * 
 * Each invariant has a unique ID for tracking and documentation.
 */
export const INVARIANT = {
    LOOP_CONTEXT_LOST: 'INV001',
    ATTRIBUTE_NOT_FORWARDED: 'INV002',
    UNRESOLVED_COMPONENT: 'INV003',
    REACTIVE_BOUNDARY: 'INV004',
    TEMPLATE_TAG: 'INV005',
    SLOT_ATTRIBUTE: 'INV006',
    ORPHAN_COMPOUND: 'INV007',
    NON_ENUMERABLE_JSX: 'INV008',
} as const

/**
 * Guarantee Messages
 * 
 * Human-readable explanations of what each invariant guarantees.
 */
const GUARANTEES: Record<string, string> = {
    [INVARIANT.LOOP_CONTEXT_LOST]:
        'Slot content retains its original reactive scope. Expressions and event handlers continue to work after projection.',
    [INVARIANT.ATTRIBUTE_NOT_FORWARDED]:
        'Attributes passed to components are forwarded to the semantic root element.',
    [INVARIANT.UNRESOLVED_COMPONENT]:
        'All components are resolved at compile time. No runtime component discovery.',
    [INVARIANT.REACTIVE_BOUNDARY]:
        'Components are purely structural transforms. They do not create reactive scopes.',
    [INVARIANT.TEMPLATE_TAG]:
        'Named slots use compound component pattern (Card.Header), not <template> tags.',
    [INVARIANT.SLOT_ATTRIBUTE]:
        'Named slots use compound component pattern (Card.Header), not slot="" attributes.',
    [INVARIANT.ORPHAN_COMPOUND]:
        'Compound slot markers (Card.Header) must be direct children of their parent component.',
    [INVARIANT.NON_ENUMERABLE_JSX]:
        'JSX expressions must have statically enumerable output. The compiler must know all possible DOM shapes at compile time.',
}

/**
 * Validate all invariants on a compiled IR
 * 
 * Called after component resolution to ensure all invariants hold.
 * Throws InvariantError if any invariant is violated.
 */
export function validateInvariants(ir: ZenIR, filePath: string): void {
    validateNoUnresolvedComponents(ir.template.nodes, filePath)
    // Additional invariant checks can be added here
}

/**
 * INV003: Validate that no unresolved components remain
 * 
 * After component resolution, all ComponentNode instances should be
 * resolved to ElementNode instances. If any remain, the compiler failed.
 */
export function validateNoUnresolvedComponents(
    nodes: TemplateNode[],
    filePath: string
): void {
    for (const node of nodes) {
        checkNodeForUnresolvedComponent(node, filePath)
    }
}

function checkNodeForUnresolvedComponent(node: TemplateNode, filePath: string): void {
    if (node.type === 'component') {
        throw new InvariantError(
            INVARIANT.UNRESOLVED_COMPONENT,
            `Unresolved component: <${node.name}>. Component was not found or failed to resolve.`,
            GUARANTEES[INVARIANT.UNRESOLVED_COMPONENT]!,
            filePath,
            node.location.line,
            node.location.column
        )
    }

    if (node.type === 'element') {
        for (const child of node.children) {
            checkNodeForUnresolvedComponent(child, filePath)
        }
    }
}

/**
 * INV005: Validate no <template> tags are used
 * 
 * Zenith uses compound component pattern for named slots.
 * <template> tags are a different mental model and are forbidden.
 */
export function validateNoTemplateTags(
    nodes: TemplateNode[],
    filePath: string
): void {
    for (const node of nodes) {
        checkNodeForTemplateTag(node, filePath)
    }
}

function checkNodeForTemplateTag(node: TemplateNode, filePath: string): void {
    if (node.type === 'element' && node.tag === 'template') {
        throw new InvariantError(
            INVARIANT.TEMPLATE_TAG,
            `<template> tags are forbidden in Zenith. Use compound components (e.g., Card.Header) for named slots.`,
            GUARANTEES[INVARIANT.TEMPLATE_TAG]!,
            filePath,
            node.location.line,
            node.location.column
        )
    }

    if (node.type === 'element') {
        for (const child of node.children) {
            checkNodeForTemplateTag(child, filePath)
        }
    }
}

/**
 * INV006: Validate no slot="" attributes are used
 * 
 * Zenith uses compound component pattern, not slot props.
 */
export function validateNoSlotAttributes(
    nodes: TemplateNode[],
    filePath: string
): void {
    for (const node of nodes) {
        checkNodeForSlotAttribute(node, filePath)
    }
}

function checkNodeForSlotAttribute(node: TemplateNode, filePath: string): void {
    if (node.type === 'element') {
        const slotAttr = node.attributes.find(attr => attr.name === 'slot')
        if (slotAttr) {
            throw new InvariantError(
                INVARIANT.SLOT_ATTRIBUTE,
                `slot="${typeof slotAttr.value === 'string' ? slotAttr.value : '...'}" attribute is forbidden. Use compound components (e.g., Card.Header) for named slots.`,
                GUARANTEES[INVARIANT.SLOT_ATTRIBUTE]!,
                filePath,
                slotAttr.location.line,
                slotAttr.location.column
            )
        }

        for (const child of node.children) {
            checkNodeForSlotAttribute(child, filePath)
        }
    }

    if (node.type === 'component') {
        for (const child of node.children) {
            checkNodeForSlotAttribute(child, filePath)
        }
    }
}

/**
 * INV001: Validate loopContext is preserved during slot projection
 * 
 * When slot content is moved from the usage site to the slot target,
 * the loopContext must be preserved so reactivity continues to work.
 * 
 * @param originalNodes - Nodes before slot projection
 * @param projectedNodes - Nodes after slot projection
 */
export function validateLoopContextPreservation(
    originalNodes: TemplateNode[],
    projectedNodes: TemplateNode[],
    filePath: string
): void {
    // Collect all loopContext from original nodes
    const originalContexts = collectLoopContexts(originalNodes)

    // Verify all contexts are still present in projected nodes
    const projectedContexts = collectLoopContexts(projectedNodes)

    for (const entry of Array.from(originalContexts.entries())) {
        const [nodeId, context] = entry
        const projected = projectedContexts.get(nodeId)
        if (context && !projected) {
            // loopContext was lost during projection
            // This is a compiler bug, not a user error
            throw new InvariantError(
                INVARIANT.LOOP_CONTEXT_LOST,
                `Reactive scope was lost during slot projection. This is a Zenith compiler bug.`,
                GUARANTEES[INVARIANT.LOOP_CONTEXT_LOST]!,
                filePath,
                1, // We don't have precise location, use line 1
                1
            )
        }
    }
}

function collectLoopContexts(nodes: TemplateNode[]): Map<string, LoopContext | undefined> {
    const contexts = new Map<string, LoopContext | undefined>()
    let nodeId = 0

    function visit(node: TemplateNode): void {
        const id = `node_${nodeId++}`

        if (node.type === 'expression') {
            contexts.set(id, node.loopContext)
        } else if (node.type === 'element') {
            contexts.set(id, node.loopContext)
            for (const attr of node.attributes) {
                if (attr.loopContext) {
                    contexts.set(`${id}_attr_${attr.name}`, attr.loopContext)
                }
            }
            for (const child of node.children) {
                visit(child)
            }
        } else if (node.type === 'component') {
            contexts.set(id, node.loopContext)
            for (const child of node.children) {
                visit(child)
            }
        }
    }

    for (const node of nodes) {
        visit(node)
    }

    return contexts
}

/**
 * INV007: Throw error for orphan compound slot markers
 * 
 * Called when a compound component (Card.Header) is found outside
 * its parent component context.
 */
export function throwOrphanCompoundError(
    componentName: string,
    parentName: string,
    filePath: string,
    line: number,
    column: number
): never {
    throw new InvariantError(
        INVARIANT.ORPHAN_COMPOUND,
        `<${componentName}> must be a direct child of <${parentName}>. Compound slot markers cannot be used outside their parent component.`,
        GUARANTEES[INVARIANT.ORPHAN_COMPOUND]!,
        filePath,
        line,
        column
    )
}

/**
 * INV003: Throw error for unresolved component
 * 
 * Called when a component definition cannot be found.
 */
export function throwUnresolvedComponentError(
    componentName: string,
    filePath: string,
    line: number,
    column: number
): never {
    throw new InvariantError(
        INVARIANT.UNRESOLVED_COMPONENT,
        `Component <${componentName}> not found. All components must be defined in the components directory.`,
        GUARANTEES[INVARIANT.UNRESOLVED_COMPONENT]!,
        filePath,
        line,
        column
    )
}
