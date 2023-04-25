import { assert, isPlainObject } from '@metamask/utils';
import execa from 'execa';
import { readFile, rm, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { resolve } from 'path';
import semver from 'semver';

import { TEMPORARY_PATH } from './files';
import { TaskOptions } from '../options';
import { pathExists, warn } from '../utils';

const LEGACY_YARN_PATH = resolve(process.cwd(), '.yarnrc');
const CURRENT_YARN_PATH = resolve(process.cwd(), '.yarnrc.yml');
const TEMPLATE_YARN_PATH = resolve(TEMPORARY_PATH, '.yarnrc.yml');

/**
 * Check for a legacy `.yarnrc` file and delete it if it exists. If the check
 * option is enabled, a warning will be displayed instead.
 *
 * @param options - The options for the task.
 * @param options.spinner - The spinner to use for logging.
 * @param options.check - Whether to only check for changes compared to the
 * template. When this is enabled, no files will be modified.
 */
async function checkLegacyYarnRc({ spinner, check }: TaskOptions) {
  const legacyYarnRcExists = await pathExists(LEGACY_YARN_PATH);
  if (!legacyYarnRcExists) {
    return;
  }

  if (check) {
    warn(
      spinner,
      'Legacy .yarnrc file exists. It will not be deleted because the --check flag is enabled.',
    );
    return;
  }

  warn(spinner, 'Deleting legacy .yarnrc file.');
  await rm(LEGACY_YARN_PATH);
}

/**
 * Check the Yarn version. If the check option is enabled, a warning will be
 * displayed if the current version does not match the template version.
 *
 * @param options - The options for the task.
 * @param options.spinner - The spinner to use for logging.
 * @param options.check - Whether to only check for changes compared to the
 * template. When this is enabled, no files will be modified.
 * @param currentYarnVersion - The current Yarn version.
 * @param templateYarnVersion - The Yarn version used by the template.
 */
async function checkYarnVersion(
  { spinner, check }: TaskOptions,
  currentYarnVersion: string,
  templateYarnVersion: string,
) {
  if (!check && semver.gt(currentYarnVersion, templateYarnVersion)) {
    warn(
      spinner,
      `The current version of Yarn (${currentYarnVersion}) is newer than the version used by the template (${templateYarnVersion}).`,
    );
  }

  if (check && semver.neq(currentYarnVersion, templateYarnVersion)) {
    warn(
      spinner,
      `The current version of Yarn (${currentYarnVersion}) does not match the version used by the template (${templateYarnVersion}).`,
    );
  }
}

/**
 * Update the .yarnrc.yml.
 *
 * - If a legacy `.yarnrc` (Yarn 1) file exists, Yarn 3 will be installed and
 * the legacy file will be deleted.
 * - If the Yarn 3 version is older than the template version, it will be
 * updated to match.
 * - If the Yarn 3 version is newer than the template version, a warning will be
 * displayed. The `.yarnrc.yml` is updated to match the template version, but
 * the newer version is not downgraded.
 *
 * @param options - The options for the task.
 * @param options.spinner - The spinner to use for logging.
 * @param options.check - Whether to only check for changes compared to the
 * template. When this is enabled, no files will be modified.
 */
export async function updateYarnRc(options: TaskOptions) {
  const { stdout: templateYarnVersion } = await execa('yarn', ['--version'], {
    cwd: TEMPORARY_PATH,
  });

  const { stdout: currentYarnVersion } = await execa('yarn', ['--version'], {
    cwd: process.cwd(),
  });

  await checkLegacyYarnRc(options);
  await checkYarnVersion(options, currentYarnVersion, templateYarnVersion);

  // If the check option is enabled, we don't need to do anything else.
  if (options.check) {
    return;
  }

  const templateYarnExecutable = resolve(
    TEMPORARY_PATH,
    `.yarn/releases/yarn-${templateYarnVersion}.cjs`,
  );

  const templateYarnRc = await readFile(TEMPLATE_YARN_PATH, 'utf8');
  const parsedTemplateYarnRc = load(templateYarnRc);

  assert(isPlainObject(parsedTemplateYarnRc));

  const { plugins } = parsedTemplateYarnRc;
  assert(Array.isArray(plugins));

  // To avoid errors with the Yarn path not existing, we need to temporarily
  // delete it from the configuration. The plugins may not be available
  // either, so we need to delete them as well, and install them later.
  delete parsedTemplateYarnRc.yarnPath;
  delete parsedTemplateYarnRc.plugins;

  await writeFile(CURRENT_YARN_PATH, dump(parsedTemplateYarnRc));

  const newVersion = semver.lt(currentYarnVersion, templateYarnVersion)
    ? templateYarnVersion
    : currentYarnVersion;

  // Install the new Yarn version.
  await execa('node', [templateYarnExecutable, 'set', 'version', newVersion], {
    cwd: process.cwd(),
  });

  // (Re)install the plugins.
  for (const plugin of plugins) {
    assert(isPlainObject(plugin));
    assert(typeof plugin.spec === 'string');

    // The global Yarn CLI seems to have some kind of caching mechanism, so we
    // need to run the local CLI directly.
    await execa(
      'node',
      [
        `.yarn/releases/yarn-${newVersion}.cjs`,
        'plugin',
        'import',
        plugin.spec,
      ],
      {
        cwd: process.cwd(),
      },
    );
  }
}
