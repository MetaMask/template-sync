import chalk from 'chalk';
import execa from 'execa';
import { copyFile, mkdir, rm } from 'fs/promises';
import inquirer from 'inquirer';
import { Ora } from 'ora';
import os from 'os';
import { dirname, resolve } from 'path';

import { TaskOptions } from '../options';
import {
  getFiles,
  getRelativePath,
  isFileEqual,
  log,
  pathExists,
  warn,
} from '../utils';

export const TEMPORARY_PATH = resolve(os.tmpdir(), 'metamask-module-template');

enum DuplicateChoice {
  Diff = 'Show diff',
  Skip = 'Skip',
  Overwrite = 'Overwrite',
}

enum UnknownChoice {
  Skip = 'Skip',
  Remove = 'Remove',
}

/**
 * Handle a duplicate file.
 *
 * @param file - The path to the file.
 * @param relativePath - The relative path to the file.
 * @param destination - The path to the destination.
 * @returns A promise that resolves to the user's choice, i.e., whether to
 * skip or overwrite the file.
 */
async function handleDuplicate(
  file: string,
  relativePath: string,
  destination: string,
): Promise<DuplicateChoice.Skip | DuplicateChoice.Overwrite> {
  const { choice } = await inquirer.prompt<{ choice: DuplicateChoice }>([
    {
      type: 'list',
      name: 'choice',
      message: `File "${relativePath}" already exists. What do you want to do?`,
      choices: Object.values(DuplicateChoice),
    },
  ]);

  if (choice === DuplicateChoice.Diff) {
    await execa('git', ['diff', '--no-index', file, destination], {
      stdio: 'inherit',
      reject: false,
    });

    return await handleDuplicate(file, relativePath, destination);
  }

  return choice;
}

/**
 * Process a file.
 *
 * @param options - The options for the task.
 * @param options.spinner - The spinner to use for logging.
 * @param file - The path to the file.
 * @returns A promise that resolves when the file has been processed.
 */
export async function processFile(
  { spinner }: TaskOptions,
  file: string,
): Promise<void> {
  const relativePath = getRelativePath(file, TEMPORARY_PATH);
  const destination = resolve(process.cwd(), relativePath);

  if (await pathExists(destination)) {
    // Files that are equal to the destination do not need to be processed.
    if (await isFileEqual(file, destination)) {
      return;
    }

    spinner.stop();

    try {
      const choice = await handleDuplicate(file, relativePath, destination);
      if (choice === DuplicateChoice.Skip) {
        log(spinner, `${chalk.yellow('⚠')} Skipped file "${relativePath}".`);
        return;
      }

      if (choice === DuplicateChoice.Overwrite) {
        await rm(destination);
      }
    } finally {
      spinner.start();
    }
  }

  log(
    spinner,
    chalk.dim(
      `Processing file "${chalk.bold(getRelativePath(file, TEMPORARY_PATH))}".`,
    ),
  );

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(file, destination);
}

/**
 * Check for files that exist locally, but not in the template.
 *
 * @param spinner - The spinner to use for logging.
 * @returns A promise that resolves when the files have been checked.
 */
export async function checkLocalFiles(spinner: Ora): Promise<void> {
  for await (const file of getFiles(process.cwd())) {
    const relativePath = getRelativePath(file, process.cwd());
    const destination = resolve(TEMPORARY_PATH, relativePath);

    if (!(await pathExists(destination))) {
      spinner.stop();
      const { choice } = await inquirer.prompt<{ choice: UnknownChoice }>([
        {
          type: 'list',
          name: 'choice',
          message: `File "${relativePath}" exists locally, but not in the template. What do you want to do?`,
          choices: Object.values(UnknownChoice),
        },
      ]);
      spinner.start();

      if (choice === UnknownChoice.Skip) {
        log(spinner, `${chalk.yellow('⚠')} Unknown file "${relativePath}".`);
        continue;
      }

      if (choice === UnknownChoice.Remove) {
        await rm(file);
      }
    }
  }
}

/**
 * Show a diff between the local file and the template file, if the file is
 * different.
 *
 * @param options - The task options.
 * @param options.spinner - The spinner to use for logging.
 * @param relativePath - The relative path to the file.
 * @returns A promise that resolves when the diff has been shown.
 */
export async function handleFileDifference(
  { spinner }: TaskOptions,
  relativePath: string,
) {
  const localPath = resolve(process.cwd(), relativePath);
  const templatePath = resolve(TEMPORARY_PATH, relativePath);

  const { choice } = await inquirer.prompt<{ choice: boolean }>([
    {
      type: 'confirm',
      name: 'choice',
      message: `File "${relativePath}" is different from the template. Do you want to see the diff?`,
      default: true,
    },
  ]);

  if (choice) {
    return await execa('git', ['diff', '--no-index', localPath, templatePath], {
      stdio: 'inherit',
      reject: false,
    });
  }

  warn(spinner, `File "${relativePath}" is different from the template.`);
}
