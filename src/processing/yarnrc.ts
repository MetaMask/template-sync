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
 * displayed. The `.yarnrc.yml` is updated to use the current version.
 *
 * @param spinner - The spinner to use for logging.
 */
export async function updateYarnRc(spinner: Ora) {
  if (await pathExists(LEGACY_YARN_PATH)) {
    warn(spinner, 'Deleting legacy .yarnrc file.');
    await rm(LEGACY_YARN_PATH);
  }

  const { stdout: currentYarnVersion } = await execa('yarn', ['--version'], {
    cwd: process.cwd(),
  });

  const { stdout: templateYarnVersion } = await execa('yarn', ['--version'], {
    cwd: TEMPORARY_PATH,
  });

  if (semver.gt(currentYarnVersion, templateYarnVersion)) {
    warn(
      spinner,
      `The current version of Yarn (${currentYarnVersion}) is newer than the version used by the template (${templateYarnVersion}).`,
    );
  }

  const templateYarnRc = await readFile(TEMPLATE_YARN_PATH, 'utf8');
  const parsedTemplateYarnRc = load(templateYarnRc);

  assert(isPlainObject(parsedTemplateYarnRc));

  const { plugins } = parsedTemplateYarnRc;
  assert(Array.isArray(plugins));

  // For compatibility with the local repository, we need to use the same Yarn
  // version as the one currently installed. The plugins may not be available
  // either, so we need to remove them, and install them later.
  parsedTemplateYarnRc.yarnPath = `.yarn/releases/yarn-${currentYarnVersion}.cjs`;
  parsedTemplateYarnRc.plugins = [];

  await writeFile(CURRENT_YARN_PATH, dump(parsedTemplateYarnRc));

  // If the current Yarn version is older than the template version, update the
  // Yarn version.
  if (semver.lt(currentYarnVersion, templateYarnVersion)) {
    await execa('yarn', ['set', 'version', templateYarnVersion], {
      cwd: process.cwd(),
    });

    // The global Yarn CLI seems to have some kind of caching mechanism, so we
    // need to run the local CLI directly.
    await execa('node', [`.yarn/releases/yarn-${templateYarnVersion}.cjs`], {
      cwd: process.cwd(),
    });
  }

  const newVersion = semver.lt(currentYarnVersion, templateYarnVersion)
    ? templateYarnVersion
    : currentYarnVersion;

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
