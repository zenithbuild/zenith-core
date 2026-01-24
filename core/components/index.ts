/**
 * Core Components
 * 
 * Reusable components provided by zenith-core.
 */

// Export path constants for component resolution
export const CORE_COMPONENTS = {
    ErrorPage: '@zenithbuild/core/components/ErrorPage.zen'
} as const;

// Component path resolver
export function getCoreComponentPath(componentName: keyof typeof CORE_COMPONENTS): string {
    return CORE_COMPONENTS[componentName];
}
