import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import upath from 'upath';

import { Stderr } from '../stdio';

export const lstat = promisify(fs.lstat);
export const readFile = promisify(fs.readFile);
export const readdir = promisify(fs.readdir);

export type WalkPromiseOptions = {
  shouldIncludePath?: (_path: string, isDirectory: boolean) => boolean;
  stderr: Stderr;
};

export function walkPromise(
  curPath: string,
  { shouldIncludePath = () => true, stderr }: WalkPromiseOptions,
) {
  const result: { [path: string]: { size: number } } = {};
  // Set a basePath var with the initial path so all file paths (the result
  // keys) can be relative to the starting point.
  const basePath = curPath;
  const walk = async function walk(_curPath: string) {
    const stat = await lstat(_curPath);
    const relPath = upath.toUnix(path.relative(basePath, _curPath));

    if (!shouldIncludePath(relPath, stat.isDirectory())) {
      stderr.debug(`Skipping file path: ${relPath}`);
    } else if (stat.isFile()) {
      const { size } = stat;
      result[relPath] = { size };
    } else if (stat.isDirectory()) {
      const files = await readdir(_curPath);

      // Map the list of files and make a list of readdir promises to pass to
      // Promise.all so we can recursively get the data on all the files in the
      // directory.
      await Promise.all(
        files.map(async (fileName) => {
          await walk(path.join(_curPath, fileName));
        }),
      );
    }
    return result;
  };
  return walk(curPath);
}

export async function checkFileExists(
  filepath: string,
  { _lstat = lstat } = {},
) {
  const invalidMessage = new Error(
    `Path "${filepath}" is not a file or directory or does not exist.`,
  );

  try {
    const stats = await _lstat(filepath);

    if (stats.isFile() === true || stats.isDirectory() === true) {
      return stats;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  throw invalidMessage;
}
