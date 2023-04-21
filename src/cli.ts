import execa from 'execa';
import ora, { Ora } from 'ora';

import {
  processFile,
  TEMPORARY_PATH,
  processPackageJson,
  checkLocalFiles,
} from './processing';
import { getFiles, pathExists } from './utils';

const MODULE_TEMPLATE_URL =
  'https://github.com/MetaMask/metamask-module-template.git';

type Task = {
  title: string;
  task: (options: { spinner: Ora }) => Promise<void>;
};

/**
 * Run the CLI.
 */
export async function main() {
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
      title: 'Processing files.',
      task: async () => {
        for await (const file of getFiles(TEMPORARY_PATH)) {
          await processFile(spinner, file);
        }
      },
    },
    {
      title: 'Processing "package.json".',
      task: async () => {
        await processPackageJson(spinner);
      },
    },
    {
      title: 'Installing dependencies (`yarn`).',
      task: async () => {
        await execa('yarn', {
          cwd: process.cwd(),
        });
      },
    },
    {
      title: 'Formatting files (`yarn lint:fix`).',
      task: async () => {
        await execa('yarn', ['lint:fix'], {
          cwd: process.cwd(),
          reject: false,
        });
      },
    },
    {
      title: 'Checking for extra files.',
      task: async () => {
        await checkLocalFiles(spinner);
      },
    },
  ];

  for (const { title, task } of tasks) {
    spinner.text = title;
    await task({ spinner });
  }

  spinner.succeed('Done!');
}
