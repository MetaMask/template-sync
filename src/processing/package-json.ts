import chalk from 'chalk';
import { writeFile } from 'fs/promises';
import inquirer from 'inquirer';
import { resolve } from 'path';
import semver from 'semver';

import { TEMPORARY_PATH } from './files';
import { TaskOptions } from '../options';
import { getJsonFile, log, warn } from '../utils';

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

enum ScriptChoice {
  Skip = 'Skip',
  Overwrite = 'Overwrite',
}

/**
 * Process the "package.json" file.
 *
 * This function will merge the "package.json" file from the template with the
 * current "package.json" file. Namely, it:
 *
 * - Adds any missing dependencies.
 * - Updates any dependencies that are out of date.
 * - Adds any missing scripts.
 *
 * @param options - The options for the task.
 * @param options.spinner - The spinner to use for logging.
 * @param options.check - Whether to only check for changes compared to the
 * template. When this is enabled, no files will be modified. * @returns A promise that resolves when the file has been processed.
 */
export async function processPackageJson({ spinner, check }: TaskOptions) {
  const currentPackageJson = await getJsonFile<PackageJson>(
    resolve(process.cwd(), 'package.json'),
  );
  const templatePackageJson = await getJsonFile<PackageJson>(
    resolve(TEMPORARY_PATH, 'package.json'),
  );

  for (const dependencyKey of DEPENDENCY_KEYS) {
    const currentDependencies = currentPackageJson[dependencyKey];
    const templateDependencies = templatePackageJson[dependencyKey];

    if (!currentDependencies || !templateDependencies) {
      continue;
    }

    for (const [name, version] of Object.entries(templateDependencies)) {
      const currentVersion = currentDependencies[name];
      if (!currentVersion || semver.ltr(currentVersion.slice(1), version)) {
        if (check) {
          warn(
            spinner,
            `Local "${name}" dependency is out of date. It should be "${version}".`,
          );
          continue;
        }

        log(
          spinner,
          chalk.dim(
            `Updating dependency "${chalk.bold(name)}" to "${chalk.bold(
              version,
            )}"`,
          ),
        );

        currentDependencies[name] = version;
      }
    }
  }

  if (templatePackageJson.scripts) {
    for (const [name, script] of Object.entries(templatePackageJson.scripts)) {
      if (!currentPackageJson.scripts) {
        currentPackageJson.scripts = {};
      }

      if (!currentPackageJson.scripts[name]) {
        if (check) {
          warn(
            spinner,
            `Local "${name}" script is missing. It should be "${script}".`,
          );
          continue;
        }

        log(spinner, chalk.dim(`Adding script "${chalk.reset(name)}".`));
        currentPackageJson.scripts[name] = script;
      }

      if (currentPackageJson.scripts[name] !== script) {
        if (check) {
          warn(
            spinner,
            `Local "${name}" script does not match the template. It should be "${script}".`,
          );
          continue;
        }

        spinner.stop();
        const { choice } = await inquirer.prompt<{ choice: ScriptChoice }>([
          {
            type: 'list',
            name: 'choice',
            message: `Local "${name}" script does not match the template. What do you want to do?`,
            choices: Object.values(ScriptChoice),
          },
        ]);
        spinner.start();

        if (choice === ScriptChoice.Skip) {
          log(
            spinner,
            `${chalk.yellow('⚠')} Not overwriting "${script}" script.`,
          );
          continue;
        }

        if (choice === ScriptChoice.Overwrite) {
          currentPackageJson.scripts[name] = script;
        }
      }
    }
  }

  if (!check) {
    await writeFile(
      resolve(process.cwd(), 'package.json'),
      JSON.stringify(currentPackageJson, null, 2),
    );
  }
}
