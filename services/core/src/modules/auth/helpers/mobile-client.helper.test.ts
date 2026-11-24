import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { isMobileAppClient, isWebAppClient } from './mobile-client.helper';

const asReq = (partial: Record<string, unknown>): Request => partial as unknown as Request;

describe('isMobileAppClient', () => {
  it('accepts X-Client-Source MOBILE_ANDROID / MOBILE_IOS', () => {
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'MOBILE_ANDROID' }, body: {} })),
      true,
    );
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'MOBILE_IOS' }, body: {} })),
      true,
    );
  });

  it('rejects WEB_APP / EXTENSION / MOBILE_WEB / BROWSER_EXTENSION headers', () => {
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'WEB_APP' }, body: {} })),
      false,
    );
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'EXTENSION' }, body: {} })),
      false,
    );
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'BROWSER_EXTENSION' }, body: {} })),
      false,
    );
    assert.equal(
      isMobileAppClient(asReq({ headers: { 'x-client-source': 'MOBILE_WEB' }, body: {} })),
      false,
    );
  });

  it('accepts android/ios devicePlatform body hint', () => {
    assert.equal(
      isMobileAppClient(asReq({ headers: {}, body: { devicePlatform: 'android' } })),
      true,
    );
  });
});

describe('isWebAppClient', () => {
  it('detects WEB_APP header', () => {
    assert.equal(
      isWebAppClient(asReq({ headers: { 'x-client-source': 'WEB_APP' }, body: {} })),
      true,
    );
  });
});
