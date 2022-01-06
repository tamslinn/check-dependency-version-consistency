import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { globbySync } from 'globby';
export function getPackageJsonPaths(root, ignorePackage) {
    const packages = getPackages(root);
    ignorePackage?.forEach((ignoredPackage) => {
        if (!packages.includes(ignoredPackage)) {
            throw new Error(`Specified option '--ignore-package ${ignoredPackage}', but no such package detected.`);
        }
    });
    return packages
        .filter((pkg) => !ignorePackage || !ignorePackage.includes(pkg))
        .map((pkg) => join(root, pkg, 'package.json'))
        .filter((packageJsonPath) => existsSync(packageJsonPath));
}
function getPackages(root) {
    const workspacePackages = getWorkspaces(root).flatMap((workspace) => {
        if (!workspace.includes('*')) {
            return workspace;
        }
        // Use cwd instead of passing join()'d paths to globby for Windows support: https://github.com/micromatch/micromatch/blob/34f44b4f57eacbdbcc74f64252e0845cf44bbdbd/README.md?plain=1#L822
        return globbySync(workspace, { onlyDirectories: true, cwd: root });
    });
    return ['.', ...workspacePackages].map((path) => join(root, path)); // Include workspace root.
}
export function getWorkspaces(root) {
    const workspacePackageJsonPath = join(root, 'package.json');
    if (!existsSync(workspacePackageJsonPath)) {
        throw new Error('No package.json found at provided path.');
    }
    const workspacePackageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    if (!workspacePackageJson.workspaces) {
        throw new Error('package.json at provided path does not specify `workspaces`.');
    }
    if (!Array.isArray(workspacePackageJson.workspaces)) {
        throw new TypeError('package.json `workspaces` is not a string array.');
    }
    return workspacePackageJson.workspaces;
}
