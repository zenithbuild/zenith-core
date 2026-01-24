# Zenith Compiler Architecture (Canonical)

**Status:** Authoritative reference  
**Scope:** Compiler, native migration, and architectural constraints  
**Non-Goals:** Runtime abstractions, framework ergonomics, plugin DX

> [!CAUTION]
> ## NO TYPESCRIPT FALLBACK
> The Rust compiler is the **ONLY** authority. TypeScript fallback has been **fully removed**.
> - If Rust fails to parse → compilation **FAILS**
> - If Rust fails to generate → compilation **FAILS**
> - Do NOT add JavaScript "best effort" fallback logic
> - See `native/compiler-native/src/codegen.rs` for all compilation logic

Zenith is a compiler-first UI system whose defining constraint is that semantic meaning is resolved entirely at compile time. Runtime exists only to apply precomputed results.

This document defines:
- The compilation pipeline
- The Rust/JS authority boundary
- The canonical file layout (before & after)
- Exact deletion mapping for JS → Rust
- Rust crate structure
- Hard prohibitions on JavaScript behavior

---

## 1. Core Philosophy (Non-Negotiable)

Zenith follows these axioms:
- **Compile-Time First, Runtime Last**
- **No Virtual DOM**
- **No Runtime Semantics**
- **No Reactive Boundaries Introduced by Components**
- **All errors are compiler responsibilities**

If a feature cannot be guaranteed at compile time, it is rejected, not deferred to runtime.

---

## 2. Compilation Pipeline (Conceptual)

Zenith compilation is a single semantic pipeline split across execution environments:

```
Source (.zen)
  ↓
Parse (structure only)
  ↓
Validate (legality + invariants)
  ↓
Transform (semantic lowering)
  ↓
IR (canonical representation)
  ↓
Codegen (HTML + JS)
  ↓
Runtime (application only)
```

**Important:** Only structure crosses the JS/Rust boundary — never meaning.

---

## 3. Canonical BEFORE → AFTER File Tree

### BEFORE (Current State)
```
zenith-core/
├── compiler/
│   ├── index.ts
│   ├── bundler.ts
│   ├── spa-build.ts
│   │
│   ├── parse/
│   │   ├── index.ts
│   │   ├── scriptAnalysis.ts
│   │   └── template.ts
│   │
│   ├── transform/
│   │   ├── index.ts
│   │   ├── expression.ts
│   │   ├── fragmentLowering.ts
│   │   ├── classifyExpression.ts
│   │   └── layoutProcessor.ts
│   │
│   ├── runtime/
│   │   ├── analyzeAndEmit.ts
│   │   ├── generateHydrationBundle.ts
│   │   ├── wrapExpression.ts
│   │   ├── wrapExpressionWithLoop.ts
│   │   └── dataExposure.ts
│   │
│   ├── validate/
│   │   ├── invariants.ts
│   │   └── index.ts
│   │
│   ├── ir/
│   │   └── index.ts
│   │
│   ├── finalize/
│   │   └── index.ts
│   │
│   └── errors/
│       └── index.ts
│
├── runtime/
│   └── bundle-generator.ts
│
├── cli/
│   └── commands/dev.ts
│
└── core/plugins/registry.ts
```

### AFTER (Rust Semantic Authority)
```
zenith-core/
├── compiler/
│   ├── index.ts              # Orchestration only
│   ├── bundler.ts            # Bun.build (npm resolution only)
│   ├── spa-build.ts          # Site orchestration
│   │
│   ├── discovery/
│   │   └── layouts.ts
│   │
│   └── output/
│       └── index.ts          # File writes only (no assembly logic)
│
├── native/                   # AUTHORITATIVE COMPILER
│   └── @zenithbuild/compiler-native
│       ├── src/
│       │   ├── parse.rs
│       │   ├── validate.rs
│       │   ├── transform.rs
│       │   ├── ir.rs
│       │   ├── codegen.rs
│       │   └── lib.rs
│       └── Cargo.toml
│
├── runtime/
│   └── hydrate.ts            # DOM application only
│
└── cli/
    └── commands/dev.ts
```

---

## 4. Exact JS → Rust Deletion Mapping

| Deleted JS File | Rust Replacement |
| :--- | :--- |
| `transform/index.ts` | `transform.rs` |
| `transform/expression.ts` | `transform.rs` |
| `transform/fragmentLowering.ts` | `transform.rs` |
| `transform/classifyExpression.ts` | `transform.rs` |
| `transform/layoutProcessor.ts` | `transform.rs` |
| `runtime/analyzeAndEmit.ts` | `codegen.rs` |
| `runtime/generateHydrationBundle.ts` | `codegen.rs` |
| `runtime/wrapExpression.ts` | `codegen.rs` |
| `runtime/wrapExpressionWithLoop.ts` | `codegen.rs` |
| `runtime/dataExposure.ts` | `codegen.rs` |
| `validate/invariants.ts` | `validate.rs` |
| `ir/index.ts` | `ir.rs` |
| `finalize/index.ts` | `codegen.rs` |
| `errors/index.ts` | `validate.rs` |

**After migration:**
- No semantic JS remains
- JS becomes orchestration + IO only

---

## 5. Rust Crate Layout (Mirrors Compiler Phases)

`compiler-native/src/`
- **`parse.rs`**: HTML parsing, Script block extraction, Tokenization (no semantics).
- **`validate.rs`**: Binding legality, Scope resolution, Error diagnostics.
- **`transform.rs`**: Expression classification, ID assignment, Loop & fragment lowering.
- **`ir.rs`**: Canonical IR types, Deterministic ordering.
- **`codegen.rs`**: HTML emission, JS emission, Runtime call wiring.
- **`lib.rs`**: NAPI boundary, Zero logic.

**Rust owns all meaning.**

---

## 6. How `analyzeAndEmit.ts` Splits into Rust Phases

| Responsibility | Rust Phase |
| :--- | :--- |
| Expression legality | `validate.rs` |
| Dependency resolution | `transform.rs` |
| Binding identity | `ir.rs` |
| Runtime wiring | `codegen.rs` |
| JS output | `codegen.rs` |

There is no JS equivalent anymore.

---

## 7. JS Runtime: Strictly Limited Role

The runtime (`hydrate.ts`) may only:
- Read `data-zen-*` markers
- Call pre-generated functions
- Apply DOM mutations
- Register effects

It **may not**:
- Parse expressions
- Inspect ASTs
- Infer dependencies
- Generate functions
- Validate correctness

---

## 8. “JS Is Forbidden From Doing” Checklist

This list is binding. JavaScript **MUST NOT**:
- Decide if an expression is legal
- Parse or rewrite expressions
- Generate binding IDs
- Create dependency graphs
- Track reactive relationships
- Merge scopes
- Inject runtime logic
- Assemble JS source strings
- Introduce new abstractions
- Add “just one small optimization”

If JS does any of the above — it is a bug, not a feature.

---

## 9. Runtime Language Clarification (Rust vs JS)

- **Compiler runtime** → Rust (zero cost, deterministic)
- **Client runtime** → JS (minimal, dumb, stable)

**Rust runtime ≠ client runtime.**
Rust is used where meaning exists. JS is used where application exists.

---

---

## 11. Strict .zen Component Structure

All components MUST follow the declarative `.zen` format. 
Standalone JavaScript/TypeScript functions returning JSX are **PROHIBITED** and will be rejected by the compiler.

### Component Layout
- **`<script>` Block**: Logic, reactive state (`state x = y`), and local functions.
- **Template DOM**: Declarative HTML + JSX expressions (`{...}`).

### Template Constraints
- **NO FUNCTIONS**: `FunctionDeclaration` or `FunctionExpression` (including Arrow Functions) are forbidden inside templates.
- **Declarative IR**: The template is lowered to a canonical IR (`__zenith.h`) by Rust. The runtime consumes this data, never JS function wrappers.
- **Strict Scope**: Rust tracks all local bindings (loop variables, catch variables, block scope) to ensure reactive state (`state.`) is prefixed correctly while locals/globals remain untouched.

If the compiler encounters a JSX function or an unhandled expression type, it will trigger a panic under the **[Zenith Authority]** banner.
