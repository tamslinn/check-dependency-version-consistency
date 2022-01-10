export declare type DependenciesToVersionsSeen = Map<string, {
    packageName: string;
    version: string;
}[]>;
export declare type MismatchingDependencyVersions = Array<{
    dependency: string;
    versions: {
        version: string;
        packages: string[];
    }[];
}>;
/**
 * Creates a map of each dependency in the workspace to an array of the packages it is used in.
 *
 * Example of such a map represented as an object:
 *
 * {
 *  'ember-cli': [
 *     { packageName: '@scope/package1', version: '~3.18.0' },
 *     { packageName: '@scope/package2', version: '~3.18.0' }
 *  ]
 *  'eslint': [
 *     { packageName: '@scope/package1', version: '^7.0.0' },
 *     { packageName: '@scope/package2', version: '^7.0.0' }
 *  ]
 * }
 */
export declare function calculateVersionsForEachDependency(root: string, ignorePackage: string[]): DependenciesToVersionsSeen;
export declare function calculateMismatchingVersions(dependencyVersions: DependenciesToVersionsSeen): MismatchingDependencyVersions;
export declare function filterOutIgnoredDependencies(mismatchingVersions: MismatchingDependencyVersions, ignoredDependencies: string[], ignoredDependencyPatterns: RegExp[]): MismatchingDependencyVersions;
export declare function fixMismatchingVersions(root: string, ignorePackage: string[], mismatchingVersions: MismatchingDependencyVersions): MismatchingDependencyVersions;
export declare function compareRanges(a: string, b: string): 0 | -1 | 1;
