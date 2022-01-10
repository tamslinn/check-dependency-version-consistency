#!/usr/bin/env node
/* eslint node/shebang:"off" -- shebang needed so compiled code gets interpreted as JS */

import { Command, Argument } from 'commander';
import { readFileSync } from 'node:fs';
import {
  calculateVersionsForEachDependency,
  calculateMismatchingVersions,
  filterOutIgnoredDependencies,
  fixMismatchingVersions,
} from '../lib/dependency-versions.js';
import { mismatchingVersionsToOutput } from '../lib/output.js';
import { join, dirname } from 'node:path';
import type { PackageJson } from 'type-fest';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCurrentPackageVersion(): string {
  const packageJson: PackageJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8') // Relative to compiled version of this file in dist/bin
  );
  if (!packageJson.version) {
    throw new Error('Could not find package.json `version`');
  }
  return packageJson.version;
}

// Used for collecting repeated CLI options into an array.
function collect(value: string, previous: string[]) {
  return [...previous, value];
}

// Setup CLI.
function run() {
  const program = new Command();

  program
    .version(getCurrentPackageVersion())
    .addArgument(new Argument('[path]', 'path to workspace root').default('.'))
    .option(
      '--fix',
      'Whether to autofix inconsistencies (using highest version present)',
      false
    )
    .option(
      '--ignore-dep <dependency-name>',
      'Dependency to ignore (option can be repeated)',
      collect,
      []
    )
    .option(
      '--ignore-package <package>',
      'Package to ignore (option can be repeated)',
      collect,
      []
    ).option(
      '--ignore-dep-pattern <dependency-name-pattern>',
      'RegExp of dependency names to ignore (option can be repeated)',
      collect,
      []
    )
    .action(function (
      path,
      options: { ignoreDep: string[]; ignorePackage: string[]; ignoreDepPattern: RegExp[]; fix: boolean }
    ) {
      // Calculate.
      const dependencyVersions = calculateVersionsForEachDependency(
        path,
        options.ignorePackage
      );
      let mismatchingVersions = filterOutIgnoredDependencies(
        calculateMismatchingVersions(dependencyVersions),
        options.ignoreDep,
        options.ignoreDepPattern
      );

      if (options.fix) {
        mismatchingVersions = fixMismatchingVersions(
          path,
          options.ignorePackage,
          mismatchingVersions
        );
      }

      // Show output.
      if (mismatchingVersions.length > 0) {
        console.log(mismatchingVersionsToOutput(mismatchingVersions));
        process.exitCode = 1;
      }
    })
    .parse(process.argv);
}

try {
  run();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}
