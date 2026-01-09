# @zenithbuild/core ⚡

The heart of the Zenith framework. High-performance reactive runtime, compiler, and build primitives.

## Overview

Zenith is a modern reactive web framework designed for maximum performance and developer experience. The core package contains the essential building blocks:
- **Compiler**: Transforms `.zen` files into optimized JavaScript.
- **Runtime**: A lightweight, efficient reactive system for the browser.
- **Router**: Lightweight client-side routing.
- **Build Primitives**: Tools for dev servers and production builds.

## Key Components

### 1. Compiler (`/compiler`)
The Zenith compiler handles parsing and transforming Single File Components (`.zen`). It leverages `parse5` for robust HTML parsing and generates highly optimized render functions.

### 2. Runtime (`/runtime`)
Our runtime is designed to be minimal. It manages the reactive cycle, efficient DOM updates, and lifecycle management (like `zenOnMount`).

### 3. Server (`/bin/zen-dev`, `/bin/zen-build`)
Low-level binaries for orchestrating development and production environments.

## Architecture

Zenith follows a "Compiler-First" philosophy. We shift as much work as possible to build time, keeping the client-side bundle lean and fast.

## Usage (Internal)

This package is typically consumed by the Zenith CLI and other ecosystem tools.

```typescript
import { compile } from '@zenithbuild/core/compiler';
// ... compile logic
```

## License

MIT
