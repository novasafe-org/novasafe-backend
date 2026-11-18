import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmailsForTest,
  parseExpiryDays,
  parsePermission,
  permissionLabel,
} from './sharing.service';

describe('sharing.service helpers', () => {
  it('maps permission labels', () => {
    assert.equal(permissionLabel('Editor'), 'Can edit');
    assert.equal(permissionLabel('Viewer'), 'View only');
    assert.equal(permissionLabel('Admin'), 'View only');
  });

  it('parses permission aliases', () => {
    assert.equal(parsePermission('can-edit'), 'Editor');
    assert.equal(parsePermission('Can edit'), 'Editor');
    assert.equal(parsePermission('edit'), 'Editor');
    assert.equal(parsePermission('viewer'), 'Viewer');
    assert.equal(parsePermission(''), 'Viewer');
  });

  it('parses expiry presets and defaults to 7', () => {
    assert.equal(parseExpiryDays(1), 1);
    assert.equal(parseExpiryDays(3), 3);
    assert.equal(parseExpiryDays(7), 7);
    assert.equal(parseExpiryDays(15), 15);
    assert.equal(parseExpiryDays(9), 7);
    assert.equal(parseExpiryDays('nope'), 7);
    assert.equal(parseExpiryDays(undefined), 7);
  });

  it('normalizes emails, dedupes, and drops invalid', () => {
    assert.deepEqual(
      normalizeEmailsForTest(['  A@B.com ', 'a@b.com', 'bad', 'x@y.z']),
      ['a@b.com', 'x@y.z'],
    );
    assert.deepEqual(normalizeEmailsForTest('not-an-array'), []);
    assert.deepEqual(normalizeEmailsForTest([]), []);
  });
});
