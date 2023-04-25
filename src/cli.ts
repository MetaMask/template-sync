import execa from 'execa';
import ora from 'ora';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { TaskOptions } from './options';
import {
  processFile,
  TEMPORARY_PATH,
  processPackageJson,
  checkLocalFiles,
} from './processing';
import { updateYarnRc } from './processing/yarnrc';
import { getFiles, info, pathExists, warn } from './utils';

const MODULE_TEMPLATE_URL =
  'https://github.com/MetaMask/metamask-module-template.git';

type Task = {
  title: string;
  task: (options: TaskOptions) => Promise<void>;
};

/**
 * Run the CLI.
 */
export async function main() {
  const { check } = await yargs(hideBin(process.argv))
    .command('$0', 'Synchronise the module template with the current project.')
    .option('check', {
      alias: 'c',
      type: 'boolean',
      default: false,
      description:
        'Whether to only check for changes compared to the template. When this is enabled, no files will be modified.',
    })
    .parse();

  const spinner = ora('Fetching module template.').start();
  const tasks: Task[] = [
    {
      title: 'Fetching module template.',
      task: async () => {
        // Check if the temporary path exists, and if so, pull the latest
        // changes.
        if (await pathExists(TEMPORARY_PATH)) {
          await execa('git', ['pull'], {
            cwd: TEMPORARY_PATH,
          });

          return;
        }

        // Otherwise, clone the repository.
        await execa('git', ['clone', MODULE_TEMPLATE_URL, TEMPORARY_PATH]);
      },
    },
    {
      title: 'Updating Yarn.',
      task: async (options) => {
        await updateYarnRc(options);
      },
    },
    {
      title: 'Processing files.',
      task: async (options) => {
        for await (const file of getFiles(TEMPORARY_PATH)) {
          await processFile(options, file);
        }
      },
    },
    {
      title: 'Processing "package.json".',
      task: async (options) => {
        await processPackageJson(options);
      },
    },
    {
      title: 'Installing dependencies (`yarn`).',
      task: async (options) => {
        // This task does not do anything if the --check flag is enabled, so
        // there is no need to log a message.
        if (options.check) {
          return;
        }

        await execa('yarn', {
          cwd: process.cwd(),
        });
      },
    },
    {
      title: 'Formatting files (`yarn lint:fix`).',
      task: async (options) => {
        // This task does not do anything if the --check flag is enabled, so
        // there is no need to log a message.
        if (options.check) {
          return;
        }

        await execa('yarn', ['lint:fix'], {
          cwd: process.cwd(),
          reject: false,
        });
      },
    },
    {
      title: 'Checking for extra files.',
      task: async (options) => {
        await checkLocalFiles(options);
      },
    },
    {
      title: 'Adding files to Git.',
      task: async (options) => {
        // This task does not do anything if the --check flag is enabled, so
        // there is no need to log a message.
        if (options.check) {
          return;
        }

        await execa('git', ['add', '.'], {
          cwd: process.cwd(),
        });
      },
    },
  ];

  for (const { title, task } of tasks) {
    spinner.text = title;
    await task({ spinner, check });
  }

  spinner.succeed('Done!');
}
