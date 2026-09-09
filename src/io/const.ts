export const DEFLATE_COMPRESSION = 8;
// Control chars are not rejected by `yauzl`, even with `strictFileNames`.
// `\p{Cc}` covers the C0 controls, DEL and the C1 controls.
export const INVALID_ENTRY_NAME_REGEX = /\p{Cc}/u;
export const FLAGGED_FILE_MAGIC_NUMBERS_LENGTH = 4;
export const MAX_FILE_SIZE_MB = 100;
export const NO_COMPRESSION = 0;
