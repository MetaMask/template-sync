# `@metamask/template-sync`

Synchronise a local repository with `metamask-module-template` with an
easy-to-use CLI tool.

- Copies all files from `metamask-module-template` to the local repository.
- Updates the `package.json` file with the latest dependencies and scripts.
- Checks for any conflicts, and prompts the user to resolve them.

## Usage

```sh
npx @metamask/template-sync
```

```
Options:
      --help     Show help                                             [boolean]
      --version  Show version number                                   [boolean]
  -c, --check    Whether to only check for changes compared to the template.
                 When this is enabled, no files will be modified.
                                                      [boolean] [default: false]
```

## Caveats

- Existing files cannot be merged, and will be either skipped or overwritten.
  - This does not apply to the `package.json` file, which will be merged with
    the latest dependencies and scripts.
- Certain files (such as `CHANGELOG.md`, `LICENSE`, and `README.md`) are
  skipped, as they are not intended to be updated by this tool.
