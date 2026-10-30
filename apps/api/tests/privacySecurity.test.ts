import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findPrivacySecurityAction,
  PRIVACY_SECURITY_AGENCIES,
  privacySecurityActionTitle,
  privacySecurityRequestKey
} from '../src/lib/privacySecurity.js';

test('privacy and security catalog exposes only approved commands with HTTPS destinations', () => {
  assert.ok(PRIVACY_SECURITY_AGENCIES.length >= 8);
  for (const agency of PRIVACY_SECURITY_AGENCIES) {
    assert.ok(agency.actions.length > 0, `${agency.name} needs at least one action`);
    for (const action of agency.actions) {
      assert.match(action.url, /^https:\/\//);
      assert.equal(findPrivacySecurityAction(agency.code, action.command)?.agency.code, agency.code);
    }
  }
  assert.equal(findPrivacySecurityAction('experian', 'DISPUTE'), null);
  assert.equal(findPrivacySecurityAction('unknown', 'FREEZE'), null);
});

test('privacy request keys are stable and action titles describe the requested work', () => {
  assert.equal(privacySecurityRequestKey('chexsystems', 'DISPUTE'), 'privacy-security:chexsystems:dispute');
  assert.equal(privacySecurityActionTitle('Experian', 'FREEZE'), 'Freeze Experian file');
  assert.equal(privacySecurityActionTitle('ChexSystems', 'DISPUTE'), 'Prepare dispute for ChexSystems');
});
