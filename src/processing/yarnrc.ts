import { assert, isPlainObject } from '@metamask/utils';
import execa from 'execa';
import { readFile, rm, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { Ora } from 'ora';
import { resolve } from 'path';
import semver from 'semver';

import { TEMPORARY_PATH } from './files';
import { pathExists, warn } from '../utils';

const LEGACY_YARN_PATH = resolve(process.cwd(), '.yarnrc');
const CURRENT_YARN_PATH = resolve(process.cwd(), '.yarnrc.yml');
const TEMPLATE_YARN_PATH = resolve(TEMPORARY_PATH, '.yarnrc.yml');

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
 * @param spinner - The spinner to use for logging.
 */
export async function updateYarnRc(spinner: Ora) {
  const { stdout: templateYarnVersion } = await execa('yarn', ['--version'], {
    cwd: TEMPORARY_PATH,
  });

  const { stdout: currentYarnVersion } = await execa('yarn', ['--version'], {
    cwd: process.cwd(),
  });

  if (await pathExists(LEGACY_YARN_PATH)) {
    warn(spinner, 'Deleting legacy .yarnrc file.');
    await rm(LEGACY_YARN_PATH);
  }

  if (semver.gt(currentYarnVersion, templateYarnVersion)) {
    warn(
      spinner,
      `The current version of Yarn (${currentYarnVersion}) is newer than the version used by the template (${templateYarnVersion}).`,
    );
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
