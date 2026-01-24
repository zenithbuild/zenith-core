/**
 * Zenith Router
 * 
 * This module re-exports from @zenithbuild/router package.
 * 
 * The router has been extracted to its own package for:
 * - Independent versioning
 * - Better separation of concerns
 * - Easier maintenance
 * 
 * @example
 * ```ts
 * import { navigate, isActive, prefetch } from 'zenith/router'
 * 
 * // Navigate programmatically
 * navigate('/about')
 * 
 * // Check active state
 * if (isActive('/blog')) {
 *   console.log('On blog section')
 * }
 * ```
 * 
 * @deprecated Import directly from '@zenithbuild/router' for new projects
 */

// Re-export everything from @zenithbuild/router
export * from "@zenithbuild/router"
