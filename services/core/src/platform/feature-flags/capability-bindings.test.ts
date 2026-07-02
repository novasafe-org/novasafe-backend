import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlatformCapability } from '../../shared/request-context/types';
import { mergeCapabilities } from '../../shared/request-context/capabilities/platform-capabilities';

describe('mergeCapabilities', () => {
  it('removes webauthn when passkeys flag is disabled', () => {
    const result = mergeCapabilities(['webauthn', 'file_export'], { passkeys: false });
    assert.deepEqual(result, ['file_export']);
  });

  it('keeps webauthn when passkeys flag is enabled', () => {
    const result = mergeCapabilities(['file_export'], { passkeys: true });
    assert.deepEqual(result, ['file_export', 'webauthn']);
  });

  it('returns base capabilities when flags are omitted', () => {
    const base: PlatformCapability[] = ['biometrics', 'offline_vault'];
    assert.deepEqual(mergeCapabilities(base), base);
  });
});
