# @zenithbuild/core ⚡

The execution target and orchestrator for the Zenith framework. Contains the minimal reactive runtime and CLI tools.

## Overview

Zenith is a modern reactive web framework designed for maximum performance and developer experience. The core package serves as the **Execution Target**:
- **Reactivity Engine**: Atomic signals and deep state with zero runtime abstraction.
- **Lifecycle System**: Efficient `onMount`/`onUnmount` management.
- **CLI Orchestrator**: Commands (`dev`, `build`, `preview`) that drive the native compiler.

## Key Components

### 1. Reactivity (`/core/reactivity`)
The foundational reactive system. Pure, fast, and deterministic.

### 2. Lifecycle (`/core/lifecycle`)
Instance-based lifecycle management tied to the DOM.

### 3. CLI (`/cli`)
The command-line interface that orchestrates the system build chain.

## Coordinated Architecture

Zenith follows a strict "Compiler-First" philosophy:
- **@zenithbuild/compiler**: Owns all structures, wiring, and build-time guarantees.
- **@zenithbuild/core**: Owns the minimal runtime execution needed to run compiled plans.

## Usage

```typescript
import { signal, effect, onMount } from '@zenithbuild/core';

const count = signal(0);
onMount(() => console.log('Ready'));
```

## License

MIT
