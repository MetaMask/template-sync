import { Ora } from 'ora';

export type Options = {
  /**
   * Whether to only check for changes compared to the template. When this is
   * enabled, no files will be modified.
   */
  check: boolean;
};

export type TaskOptions = Options & {
  /**
   * The spinner to use for logging.
   */
  spinner: Ora;
};
