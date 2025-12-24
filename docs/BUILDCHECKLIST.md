## checklist.md

---

### Phase 0 — Project Setup

* [ ] Create monorepo (pnpm / npm workspaces)
* [ ] Define `packages/` and `runtime/` separation
* [ ] Establish build tooling (tsconfig, bundler)

---

### Phase 1 — Compiler Foundation (START HERE)

**Goal:** Establish a deterministic compiler contract

* [ ] Define `.zenith` file contract
* [ ] Implement HTML parsing using a real parser
* [ ] Extract:

  * DOM AST
  * `<script>` block
  * `<style>` block
* [ ] Detect document ownership (`<html>` present)

Directory:

```
packages/compiler/
  ├─ spec.ts
  ├─ parse.ts
```

---

### Phase 2 — Layout Composition

**Goal:** Separate document ownership from views

* [ ] Implement `<slot />` placeholder logic
* [ ] Compose layout + page at compile time
* [ ] Support nested layouts
* [ ] Enforce ownership rules

Directory:

```
packages/compiler/
  ├─ compose.ts
```

---

### Phase 3 — Static Analysis

**Goal:** Infer runtime needs without developer flags

* [ ] Walk DOM AST
* [ ] Detect:

  * Text bindings (`{{ }}`)
  * Event bindings (`@click`)
  * Dynamic attributes
* [ ] Analyze `<script>` AST
* [ ] Determine runtime requirements:

  * static
  * reactive
  * VDOM
  * client-only

Directory:

```
packages/compiler/
  ├─ analyze.ts
```

---

### Phase 4 — Code Generation

**Goal:** Produce deterministic JS output

* [ ] Generate render functions from DOM AST
* [ ] Generate scoped runtime wrappers
* [ ] Attach styles safely
* [ ] Output ES modules

Directory:

```
packages/compiler/
  ├─ generate.ts
```

---

### Phase 5 — Runtime Core

**Goal:** Navigation-driven rendering

* [ ] Navigation history manager
* [ ] Before / after navigation hooks
* [ ] Layout persistence
* [ ] Render scheduling

Directory:

```
runtime/
  ├─ navigation.ts
  ├─ app.ts
```

---

### Phase 6 — VDOM (Selective)

**Goal:** Efficient updates only where required

* [ ] VNode definition
* [ ] Minimal diffing algorithm
* [ ] DOM commit layer

Directory:

```
runtime/vdom/
```

---

### Phase 7 — Hooks System

**Goal:** Controlled state + effects

* [ ] Hook dispatcher
* [ ] `useState`
* [ ] `useEffect`
* [ ] Navigation-aware hooks

---

### Phase 8 — Routing & Transitions

**Goal:** Lifecycle-aware navigation

* [ ] File-based routing
* [ ] Route-level layouts
* [ ] Transition hooks

---

### Phase 9 — SSR & Streaming (Future)

* [ ] HTML streaming
* [ ] Partial hydration
* [ ] Head diffing
