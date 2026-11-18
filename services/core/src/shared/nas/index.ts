/** NAS-Control driver package — used only via `shared/storage` composition root. */

export { nasConfig, assertNasConfig } from './nas.config';
export {
  mapNasHttpError,
  isNasAuthRetryable,
  nasErrorMappingTable,
  type NasEnvelope,
} from './nas.errors';
export { readNasTokens, writeNasTokens, type NasStoredTokens } from './nas.token-store';
export {
  nasLogin,
  nasRequest,
  nasUploadFile,
  nasDownloadFile,
  nasDeleteFile,
  type NasFileMeta,
  type NasRequestInit,
} from './nas.client';
export { createNasStorageDriver } from './nas.driver';
