#!/usr/bin/env node

import { main } from './cli';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
