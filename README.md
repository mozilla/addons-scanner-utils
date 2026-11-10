# addons-scanner-utils

[![CircleCI](https://circleci.com/gh/mozilla/addons-scanner-utils.svg?style=svg)](https://circleci.com/gh/mozilla/addons-scanner-utils) [![codecov](https://codecov.io/gh/mozilla/addons-scanner-utils/branch/master/graph/badge.svg)](https://codecov.io/gh/mozilla/addons-scanner-utils) [![npm version](https://badge.fury.io/js/addons-scanner-utils.svg)](https://badge.fury.io/js/addons-scanner-utils)

Various addons related helpers to build scanners.

## Usage

```
npm install addons-scanner-utils
```

### Logging

Scanners on Cloud Run should log through `createLogger()`. It writes one JSON object per line, which Cloud Run turns into a structured log entry: `severity` becomes the entry's severity, `message` its text, and any extra fields become `jsonPayload.<name>`. Inside a request, every line also carries the `request_id` (the `X-AMO-Request-ID` header, or a generated UUID) and, when the `GOOGLE_CLOUD_PROJECT` environment variable is set on the service, the request's trace, so the Logs Explorer shows the scanner's lines under Cloud Run's own entry for the request.

```js
import { createExpressApp, createLogger } from 'addons-scanner-utils';

const log = createLogger();

const app = createExpressApp()((req, res) => {
  log.info('scan complete', { matched_rules: 2, elapsed_ms: 340 });
  res.json({ ok: true });
});
```

`ERROR` and `WARNING` go to stderr, `INFO` and `DEBUG` to stdout. Do not log objects with `console.error()` directly: Node prints them over several lines once they are longer than 80 characters, and Cloud Run stores each line as a separate entry with no severity. The error handler installed by `createExpressApp()` logs through the same logger: a 5xx as `ERROR`, a 4xx as `WARNING`.

## Requirements

- You need [Node](https://nodejs.org/) 22, which is the current [LTS](https://github.com/nodejs/LTS) (long term support) release.
- You need [npm](https://www.npmjs.com/) to manage dependencies and run commands.

## Development

- Read [our contributing guidelines](./CONTRIBUTING.md) to get started on your first patch
- Clone this repository
- Type `npm install` to install everything
- Run the test suite to make sure everything is set up: `npm test`

### Available development commands

In the project directory, you can run the following commands. There are a few commands not mentioned here (see `package.json`) but those are only used by internal processes.

#### `npm run eslint`

This runs [ESLint][] to discover problems within our codebase without executing it. ESLint also enforces some patterns and practices.

#### `npm run lint`

This runs all the _lint_ commands at once.

#### `npm run prettier`

This runs [Prettier][] to automatically format the entire codebase.

#### `npm run prettier-dev`

This runs [Prettier][] on only your changed files. This is intended for development.

#### `npm test`

This launches [Jest][] in the interactive watch mode.

### Prettier

We use [Prettier][] to automatically format our JavaScript code and stop all the on-going debates over styles. As a developer, you have to run it (with `npm run prettier-dev`) before submitting a Pull Request.

### Versioning

This project follows the [semantic versioning](https://semver.org/) specification. To release a new version of this library on npmjs.org, please see [our release process][].

[eslint]: https://eslint.org/
[jest]: https://jestjs.io/
[our release process]: https://github.com/mozilla/addons/tree/1.1/.github/actions/release#release-process
[prettier]: https://prettier.io/
