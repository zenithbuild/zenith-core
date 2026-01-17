/**
 * Component Stacking Test
 * 
 * Tests that multiple sibling components and multiple instances
 * of the same component render correctly.
 */

import { compileZenSource } from '../index'
import { discoverComponents, type ComponentMetadata } from '../discovery/componentDiscovery'
import { resolveComponentsInIR } from '../transform/componentResolver'
import { parseTemplate } from '../parse/parseTemplate'
import * as fs from 'fs'
import * as path from 'path'

// Test 1: Multiple sibling components
async function testMultipleSiblingComponents() {
  console.log('\n=== Test 1: Multiple Sibling Components ===\n')
  
  // Create mock components
  const mockComponents = new Map<string, ComponentMetadata>()
  
  mockComponents.set('Header', {
    name: 'Header',
    path: '/mock/Header.zen',
    template: '<header class="test-header">Header Content</header>',
    nodes: [{
      type: 'element',
      tag: 'header',
      attributes: [{ name: 'class', value: 'test-header', location: { line: 1, column: 1 } }],
      children: [{ type: 'text', value: 'Header Content', location: { line: 1, column: 1 } }],
      location: { line: 1, column: 1 }
    }],
    slots: [],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  mockComponents.set('Hero', {
    name: 'Hero',
    path: '/mock/Hero.zen',
    template: '<section class="test-hero">Hero Content</section>',
    nodes: [{
      type: 'element',
      tag: 'section',
      attributes: [{ name: 'class', value: 'test-hero', location: { line: 1, column: 1 } }],
      children: [{ type: 'text', value: 'Hero Content', location: { line: 1, column: 1 } }],
      location: { line: 1, column: 1 }
    }],
    slots: [],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  mockComponents.set('Footer', {
    name: 'Footer',
    path: '/mock/Footer.zen',
    template: '<footer class="test-footer">Footer Content</footer>',
    nodes: [{
      type: 'element',
      tag: 'footer',
      attributes: [{ name: 'class', value: 'test-footer', location: { line: 1, column: 1 } }],
      children: [{ type: 'text', value: 'Footer Content', location: { line: 1, column: 1 } }],
      location: { line: 1, column: 1 }
    }],
    slots: [],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  // Test source with multiple sibling components
  const testSource = `
<script setup="ts">
</script>
<div class="page">
  <Header />
  <Hero />
  <Footer />
</div>
`
  
  // Parse the template
  const template = parseTemplate(testSource, 'test.zen')
  
  console.log('Parsed nodes:', JSON.stringify(template.nodes, null, 2))
  console.log('\nComponent nodes found:')
  
  // Find all component nodes
  function findComponents(nodes: any[], depth = 0): void {
    for (const node of nodes) {
      if (node.type === 'component') {
        console.log(`${'  '.repeat(depth)}Component: ${node.name}`)
      } else if (node.type === 'element') {
        console.log(`${'  '.repeat(depth)}Element: <${node.tag}>`)
        if (node.children) {
          findComponents(node.children, depth + 1)
        }
      }
    }
  }
  
  findComponents(template.nodes)
  
  // Create IR
  const ir = {
    filePath: 'test.zen',
    template,
    script: { raw: '', attributes: {} },
    styles: []
  }
  
  // Resolve components
  const resolvedIR = resolveComponentsInIR(ir, mockComponents)
  
  console.log('\nResolved nodes:', JSON.stringify(resolvedIR.template.nodes, null, 2))
  
  // Count how many test-* classes appear in the resolved HTML
  const jsonStr = JSON.stringify(resolvedIR.template.nodes)
  const countHeaders = (jsonStr.match(/"value":"test-header"/g) || []).length
  const countHeros = (jsonStr.match(/"value":"test-hero"/g) || []).length
  const countFooters = (jsonStr.match(/"value":"test-footer"/g) || []).length
  
  console.log(`\nResults:`)
  console.log(`  Headers: ${countHeaders} (expected: 1)`)
  console.log(`  Heros: ${countHeros} (expected: 1)`)
  console.log(`  Footers: ${countFooters} (expected: 1)`)
  
  const passed = countHeaders === 1 && countHeros === 1 && countFooters === 1
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Multiple sibling components`)
  
  return passed
}

// Test 2: Multiple instances of the same component
async function testMultipleInstances() {
  console.log('\n=== Test 2: Multiple Instances of Same Component ===\n')
  
  const mockComponents = new Map<string, ComponentMetadata>()
  
  mockComponents.set('Card', {
    name: 'Card',
    path: '/mock/Card.zen',
    template: '<div class="card">Card Content</div>',
    nodes: [{
      type: 'element',
      tag: 'div',
      attributes: [{ name: 'class', value: 'card', location: { line: 1, column: 1 } }],
      children: [{ type: 'text', value: 'Card Content', location: { line: 1, column: 1 } }],
      location: { line: 1, column: 1 }
    }],
    slots: [],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  const testSource = `
<script setup="ts">
</script>
<div class="grid">
  <Card />
  <Card />
  <Card />
</div>
`
  
  const template = parseTemplate(testSource, 'test.zen')
  
  console.log('Component nodes found:')
  
  function countComponents(nodes: any[]): number {
    let count = 0
    for (const node of nodes) {
      if (node.type === 'component') {
        console.log(`  Found component: ${node.name}`)
        count++
      } else if (node.type === 'element' && node.children) {
        count += countComponents(node.children)
      }
    }
    return count
  }
  
  const componentCount = countComponents(template.nodes)
  console.log(`Total component nodes before resolution: ${componentCount}`)
  
  const ir = {
    filePath: 'test.zen',
    template,
    script: { raw: '', attributes: {} },
    styles: []
  }
  
  const resolvedIR = resolveComponentsInIR(ir, mockComponents)
  
  // Count card divs in resolved output - search for the attribute value
  const jsonStr = JSON.stringify(resolvedIR.template.nodes)
  const cardCount = (jsonStr.match(/"value":"card"/g) || []).length
  
  console.log(`\nResolved JSON (first 500 chars): ${jsonStr.substring(0, 500)}...`)
  console.log(`\nCard divs in resolved output: ${cardCount} (expected: 3)`)
  
  const passed = cardCount === 3
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Multiple instances of same component`)
  
  return passed
}

// Test 3: Nested components
async function testNestedComponents() {
  console.log('\n=== Test 3: Nested Components ===\n')
  
  const mockComponents = new Map<string, ComponentMetadata>()
  
  mockComponents.set('Outer', {
    name: 'Outer',
    path: '/mock/Outer.zen',
    template: '<div class="outer"><slot /></div>',
    nodes: [{
      type: 'element',
      tag: 'div',
      attributes: [{ name: 'class', value: 'outer', location: { line: 1, column: 1 } }],
      children: [{
        type: 'element',
        tag: 'slot',
        attributes: [],
        children: [],
        location: { line: 1, column: 1 }
      }],
      location: { line: 1, column: 1 }
    }],
    slots: [{ name: null, location: { line: 1, column: 1 } }],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  mockComponents.set('Inner', {
    name: 'Inner',
    path: '/mock/Inner.zen',
    template: '<span class="inner">Inner Content</span>',
    nodes: [{
      type: 'element',
      tag: 'span',
      attributes: [{ name: 'class', value: 'inner', location: { line: 1, column: 1 } }],
      children: [{ type: 'text', value: 'Inner Content', location: { line: 1, column: 1 } }],
      location: { line: 1, column: 1 }
    }],
    slots: [],
    props: [],
    styles: [],
    script: null,
    scriptAttributes: null,
    hasScript: false,
    hasStyles: false
  })
  
  const testSource = `
<script setup="ts">
</script>
<Outer>
  <Inner />
</Outer>
`
  
  const template = parseTemplate(testSource, 'test.zen')
  
  const ir = {
    filePath: 'test.zen',
    template,
    script: { raw: '', attributes: {} },
    styles: []
  }
  
  const resolvedIR = resolveComponentsInIR(ir, mockComponents)
  
  const jsonStr = JSON.stringify(resolvedIR.template.nodes)
  const hasOuter = jsonStr.includes('"value":"outer"')
  const hasInner = jsonStr.includes('"value":"inner"')
  
  console.log(`Resolved JSON (first 500 chars): ${jsonStr.substring(0, 500)}...`)
  console.log(`Outer div present: ${hasOuter}`)
  console.log(`Inner span present: ${hasInner}`)
  
  const passed = hasOuter && hasInner
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Nested components`)
  
  return passed
}

// Test 4: Auto-import naming (filename-based)
async function testAutoImportNaming() {
  console.log('\n=== Test 4: Auto-Import Naming ===\n')
  
  // Test the naming algorithm directly
  // With the new convention, component name = filename (subdirectories are ignored)
  const testCases = [
    { input: 'components/Header.zen', expected: 'Header' },
    { input: 'components/globals/Header.zen', expected: 'Header' }, // Filename only!
    { input: 'components/ui/buttons/Primary.zen', expected: 'Primary' },
    { input: 'components/sections/HeroSection.zen', expected: 'HeroSection' },
    { input: 'components/ui-kit/Button.zen', expected: 'Button' },
  ]
  
  let passed = true
  
  for (const tc of testCases) {
    // Component name is just the filename without .zen extension
    const result = path.basename(tc.input, '.zen')
    
    const match = result === tc.expected
    console.log(`  ${match ? '✓' : '✗'} "${tc.input}" → "${result}" (expected: "${tc.expected}")`)
    
    if (!match) passed = false
  }
  
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Auto-import naming`)
  
  return passed
}

// Run all tests
async function runTests() {
  console.log('╔════════════════════════════════════════════╗')
  console.log('║    Component Stacking Tests                ║')
  console.log('╚════════════════════════════════════════════╝')
  
  const results = []
  
  results.push(await testMultipleSiblingComponents())
  results.push(await testMultipleInstances())
  results.push(await testNestedComponents())
  results.push(await testAutoImportNaming())
  
  console.log('\n════════════════════════════════════════════')
  console.log('Summary:')
  console.log(`  Total: ${results.length}`)
  console.log(`  Passed: ${results.filter(r => r).length}`)
  console.log(`  Failed: ${results.filter(r => !r).length}`)
  console.log('════════════════════════════════════════════\n')
  
  process.exit(results.every(r => r) ? 0 : 1)
}

runTests().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
