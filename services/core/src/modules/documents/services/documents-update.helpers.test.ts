import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from '../../../database/object-id';
import { StorageError, StorageErrorCodes } from '../../../shared/storage';
import {
  hasDocumentMetadataChanges,
  prepareDocumentMetadataUpdate,
} from './documents-update.helpers';

const here = dirname(fileURLToPath(import.meta.url));
const validId = new ObjectId().toHexString();
const validFolderId = new ObjectId().toHexString();

describe('prepareDocumentMetadataUpdate', () => {
  it('rejects invalid document id', () => {
    assert.throws(
      () => prepareDocumentMetadataUpdate('not-an-id', { title: 'X' }),
      (err: unknown) =>
        err instanceof StorageError &&
        err.statusCode === 400 &&
        err.code === StorageErrorCodes.DOCUMENT_INVALID_ID,
    );
  });

  it('rejects empty title', () => {
    assert.throws(
      () => prepareDocumentMetadataUpdate(validId, { title: '   ' }),
      (err: unknown) =>
        err instanceof StorageError &&
        err.statusCode === 400 &&
        err.code === StorageErrorCodes.DOCUMENT_INVALID_UPLOAD,
    );
  });

  it('rejects invalid folder id', () => {
    assert.throws(
      () => prepareDocumentMetadataUpdate(validId, { folderId: 'bad' }),
      (err: unknown) =>
        err instanceof StorageError &&
        err.code === StorageErrorCodes.DOCUMENT_INVALID_ID,
    );
  });

  it('builds $set for title and folderId', () => {
    const { $set } = prepareDocumentMetadataUpdate(validId, {
      title: '  Tax PDF  ',
      folderId: validFolderId,
    });
    assert.equal($set.title, 'Tax PDF');
    assert.ok($set.folderId instanceof ObjectId);
    assert.equal(String($set.folderId), validFolderId);
    assert.equal(hasDocumentMetadataChanges($set), true);
  });

  it('clears folder when folderId is null', () => {
    const { $set } = prepareDocumentMetadataUpdate(validId, { folderId: null });
    assert.equal($set.folderId, null);
  });

  it('returns empty $set when patch has no fields (no storage touch needed)', () => {
    const { $set } = prepareDocumentMetadataUpdate(validId, {});
    assert.deepEqual($set, {});
    assert.equal(hasDocumentMetadataChanges($set), false);
  });
});

describe('documents update route wiring (static)', () => {
  it('registers PUT and PATCH /:id without calling storage in updateDocument source', () => {
    const routesSrc = readFileSync(join(here, '../routes/documents.routes.ts'), 'utf8');
    assert.match(routesSrc, /router\.put\('\/:id'/);
    assert.match(routesSrc, /router\.patch\('\/:id'/);
    assert.match(routesSrc, /updateDocumentHandler/);

    const serviceSrc = readFileSync(join(here, './documents.service.ts'), 'utf8');
    const updateBlock = serviceSrc.slice(
      serviceSrc.indexOf('export const updateDocument'),
      serviceSrc.indexOf('export const downloadDocument'),
    );
    assert.equal(updateBlock.includes('getStorage()'), false);
    assert.match(updateBlock, /prepareDocumentMetadataUpdate/);
  });
});

describe('updateDocumentHandler response shape (static)', () => {
  it('returns success + data JSON on update handler', () => {
    const controllerSrc = readFileSync(join(here, '../controllers/documents.controller.ts'), 'utf8');
    assert.match(controllerSrc, /export const updateDocumentHandler/);
    assert.match(
      controllerSrc,
      /res\.status\(200\)\.json\(\{\s*success:\s*true,\s*source:\s*sendSource\(req\),\s*data\s*\}\)/,
    );
  });
});
