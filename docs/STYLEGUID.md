## styleguide.md

---

### Code Style

* TypeScript only
* No implicit `any`
* Prefer explicit return types for public APIs
* Avoid magic strings

---

### Architectural Rules

* Compiler decisions > runtime decisions
* HTML is the source of truth
* Navigation controls rendering, not components
* Layouts persist unless explicitly changed

---

### Naming Conventions

* camelCase for variables
* PascalCase for components
* kebab-case for files where appropriate
* `.zenith` for user-facing components

---

### API Design Rules

* No developer flags for runtime behavior
* Behavior inferred via static analysis
* Fail loudly at compile time

---

### What to Avoid

* Implicit global state
* Hidden hydration logic
* Runtime heuristics
* JSX-only APIs

---

### Guiding Question

> "Can the compiler decide this instead?"

If yes — move it out of runtime.
