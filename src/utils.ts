import execa from 'execa';
import { constants } from 'fs';
import { readFile, readdir, access } from 'fs/promises';
import { Ora } from 'ora';
import { relative, resolve } from 'path';

/**
 * Files and folders to ignore when processing files.
 */
const IGNORED_FILES = [
  '.git',
  '.yarn',
  '.yarnrc.yml',
  'src',
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'package.json',
  'yarn.lock',
];

/**
 * Log a message to the console.
 *
 * @param spinner - The spinner to use for logging.
 * @param message - The message to log.
 */
export function log(spinner: Ora, message: string) {
  spinner.clear();
  spinner.frame();
  console.log(message);
}

/**
 * Asynchronously check if a file or folder exists.
 *
 * @param path - The path to check.
 * @returns A promise that resolves to true if the file exists, and false
 * otherwise.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the relative path of a file or folder.
 *
 * @param path - The path to the file or folder.
 * @param relativeTo - The path to use as the base.
 * @returns The relative path.
 */
export function getRelativePath(path: string, relativeTo: string): string {
  return relative(relativeTo, path);
}

/**
 * Check if the byte contents of two files are equal.
 *
 * @param file - The path to the file.
 * @param destination - The path to the destination.
 * @returns A promise that resolves to true if the files are equal, and false
 * otherwise.
 */
export async function isFileEqual(
  file: string,
  destination: string,
): Promise<boolean> {
  const [fileBuffer, destinationBuffer] = await Promise.all([
    readFile(file),
    readFile(destination),
  ]);

  return fileBuffer.equals(destinationBuffer);
}

/**
 * Read a JSON file.
 *
 * @param path - The path to the file.
 * @returns A promise that resolves to the parsed JSON.
 */
export async function getJsonFile<Type = unknown>(path: string): Promise<Type> {
  const file = await readFile(path, 'utf8');
  return JSON.parse(file);
}

/**
 * Check if a file is ignored by Git.
 *
 * @param path - The path to the file.
 * @returns A promise that resolves to true if the file is ignored, and false
 * otherwise.
 */
export async function isIgnored(path: string): Promise<boolean> {
  try {
    await execa('git', ['check-ignore', '--quiet', path]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously get all files in a directory and its subdirectories.
 *
 * @param path - The path to the directory.
 * @yields An async iterable of file paths.
 */
export async function* getFiles(path: string): AsyncGenerator<string, void> {
  const files = await readdir(path, { withFileTypes: true });

  for (const file of files) {
    if (IGNORED_FILES.includes(file.name)) {
      continue;
    }

    const fullPath = resolve(path, file.name);
    if (await isIgnored(fullPath)) {
      continue;
    }

    if (file.isDirectory()) {
      yield* getFiles(fullPath);
    } else {
      yield fullPath;
    }
  }
}
