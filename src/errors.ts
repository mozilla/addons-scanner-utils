/* eslint-disable max-classes-per-file */

export class InvalidZipFileError extends Error {
  get name() {
    return 'InvalidZipFileError';
  }
}

export class DuplicateZipEntryError extends Error {
  get name() {
    return 'DuplicateZipFileEntry';
  }
}
