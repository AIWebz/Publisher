// Serial numbers (desktop/license.js): made with the private key, checked offline with the public key.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeSerial, checkSerial } = require('../../desktop/license.js');
const pair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { privateKey, pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
};

test('a serial made with the private key checks out, however it is typed', () => {
  const { privateKey, pub } = pair();
  const serial = makeSerial(privateKey);
  assert.match(serial, /^FOLIO-[0-9A-Z]{5}(-[0-9A-Z]{1,5})+$/);
  assert.equal(checkSerial(serial, pub).ok, true);
  assert.equal(checkSerial(`  ${serial.toLowerCase().replace(/-/g, ' ')}\n`, pub).serial, serial);
  assert.equal(checkSerial(serial.replace(/^FOLIO-/, '').replace(/0/g, 'O').replace(/1/g, 'l'), pub).ok, true);
});

test('altered serials, other keys and junk are refused', () => {
  const { privateKey, pub } = pair();
  const serial = makeSerial(privateKey);
  const i = serial.length - 10;
  const altered = serial.slice(0, i) + (serial[i] === 'A' ? 'B' : 'A') + serial.slice(i + 1);
  assert.equal(checkSerial(altered, pub).ok, false);
  assert.equal(checkSerial(serial, pair().pub).ok, false);
  for (const junk of ['', 'FOLIO-12345', 'not a serial', null, undefined]) assert.equal(checkSerial(junk, pub).ok, false);
  assert.equal(checkSerial(serial, '').ok, false);
});

test('package.json carries a usable public key', async () => {
  const { licensePublicKey } = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => crypto.createPublicKey({ key: Buffer.from(licensePublicKey, 'base64'), format: 'der', type: 'spki' }));
});
