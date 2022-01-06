import { readFileSync, existsSync } from 'node:fs';
import { getPackageJsonPaths } from './workspace.js';
import semver from 'semver';
import editJsonFile from 'edit-json-file';
import { dirname, relative } from 'node:path';
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
export function calculateVersionsForEachDependency(root, ignorePackage) {
    const dependenciesToVersionsSeen = new Map();
    getPackageJsonPaths(root, ignorePackage).forEach((packageJsonPath) => recordDependencyVersionsForPackageJson(dependenciesToVersionsSeen, packageJsonPath, root));
    return dependenciesToVersionsSeen;
}
function recordDependencyVersionsForPackageJson(dependenciesToVersionsSeen, packageJsonPath, root) {
    if (!existsSync(packageJsonPath)) {
        // Ignore empty package.
        return;
    }
    const packageName = dirname(relative(root, packageJsonPath));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.dependencies) {
        for (const [dependency, dependencyVersion] of Object.entries(packageJson.dependencies)) {
            recordDependencyVersion(dependenciesToVersionsSeen, dependency, packageName, dependencyVersion);
        }
    }
    if (packageJson.devDependencies) {
        for (const [dependency, dependencyVersion] of Object.entries(packageJson.devDependencies)) {
            recordDependencyVersion(dependenciesToVersionsSeen, dependency, packageName, dependencyVersion);
        }
    }
}
function recordDependencyVersion(dependenciesToVersionsSeen, dependency, packageName, version) {
    if (!dependenciesToVersionsSeen.has(dependency)) {
        dependenciesToVersionsSeen.set(dependency, []);
    }
    const list = dependenciesToVersionsSeen.get(dependency);
    /* istanbul ignore if */
    if (list) {
        // `list` should always exist at this point, this if statement is just to please TypeScript.
        list.push({ packageName, version });
    }
}
export function calculateMismatchingVersions(dependencyVersions) {
    return [...dependencyVersions.keys()]
        .sort()
        .map((dependency) => {
        const versionList = dependencyVersions.get(dependency);
        /* istanbul ignore if */
        if (!versionList) {
            // `versionList` should always exist at this point, this if statement is just to please TypeScript.
            return undefined;
        }
        const uniqueVersions = [
            ...new Set(versionList.map((obj) => obj.version)),
        ].sort();
        if (uniqueVersions.length > 1) {
            const uniqueVersionsWithInfo = uniqueVersions.map((uniqueVersion) => {
                const matchingVersions = versionList.filter((obj) => obj.version === uniqueVersion);
                return {
                    version: uniqueVersion,
                    packages: matchingVersions.map((obj) => obj.packageName).sort(),
                };
            });
            return { dependency, versions: uniqueVersionsWithInfo };
        }
        return undefined;
    })
        .filter((obj) => obj !== undefined);
}
export function filterOutIgnoredDependencies(mismatchingVersions, ignoredDependencies) {
    ignoredDependencies.forEach((ignoreDependency) => {
        if (!mismatchingVersions.some((mismatchingVersion) => mismatchingVersion.dependency === ignoreDependency)) {
            throw new Error(`Specified option '--ignore-dep ${ignoreDependency}', but no mismatches detected.`);
        }
    });
    return mismatchingVersions.filter((mismatchingVersion) => !ignoredDependencies.includes(mismatchingVersion.dependency));
}
export function fixMismatchingVersions(root, ignorePackage, mismatchingVersions) {
    const packageJsonPaths = getPackageJsonPaths(root, ignorePackage);
    // Return any mismatching versions that are still present after attempting fixes.
    return mismatchingVersions
        .map((mismatchingVersion) => {
        const versions = mismatchingVersion.versions.map((obj) => obj.version);
        let sortedVersions;
        try {
            sortedVersions = versions.sort(compareRanges);
        }
        catch {
            // Unable to sort so skip this dependency (return it to indicate it was not fixed).
            return mismatchingVersion;
        }
        const fixedVersion = sortedVersions[sortedVersions.length - 1]; // Highest version will be sorted to end of list.
        for (const packageJsonPath of packageJsonPaths) {
            const packageJsonContents = readFileSync(packageJsonPath, 'utf-8');
            const packageJsonEndsInNewline = packageJsonContents.endsWith('\n');
            const packageJson = JSON.parse(packageJsonContents);
            if (packageJson.devDependencies &&
                packageJson.devDependencies[mismatchingVersion.dependency] &&
                packageJson.devDependencies[mismatchingVersion.dependency] !==
                    fixedVersion) {
                const packageJsonEditor = editJsonFile(packageJsonPath, {
                    autosave: true,
                    stringify_eol: packageJsonEndsInNewline, // If a newline at end of file exists, keep it.
                });
                packageJsonEditor.set(`devDependencies.${mismatchingVersion.dependency.replace(/\./g, // Escape dots.
                '\\.')}`, fixedVersion);
            }
            if (packageJson.dependencies &&
                packageJson.dependencies[mismatchingVersion.dependency] &&
                packageJson.dependencies[mismatchingVersion.dependency] !==
                    fixedVersion) {
                const packageJsonEditor = editJsonFile(packageJsonPath, {
                    autosave: true,
                    stringify_eol: packageJsonEndsInNewline, // If a newline at end of file exists, keep it.
                });
                packageJsonEditor.set(`dependencies.${mismatchingVersion.dependency.replace(/\./g, // Escape dots.
                '\\.')}`, fixedVersion);
            }
        }
        // Fixed successfully.
        return undefined;
    })
        .filter((item) => item !== undefined);
}
export function compareRanges(a, b) {
    // Strip range and coerce to normalized version.
    const aVersion = semver.coerce(a.replace(/^[\^~]/, ''));
    const bVersion = semver.coerce(b.replace(/^[\^~]/, ''));
    if (!aVersion) {
        throw new Error(`Invalid Version: ${a}`);
    }
    if (!bVersion) {
        throw new Error(`Invalid Version: ${b}`);
    }
    if (semver.eq(aVersion, bVersion)) {
        // Same version, but wider range considered higher.
        if (a.startsWith('^') && !b.startsWith('^')) {
            return 1;
        }
        else if (!a.startsWith('^') && b.startsWith('^')) {
            return -1;
        }
        else if (a.startsWith('~') && !b.startsWith('~')) {
            return 1;
        }
        else if (!a.startsWith('~') && b.startsWith('~')) {
            return -1;
        }
        // Same version, same range.
        return 0;
    }
    // Greater version considered higher.
    return semver.gt(aVersion, bVersion) ? 1 : -1;
}
