// Serial numbers (desktop/license.js): random serials, checked offline against their fingerprints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeSerial, checkSerial, readFingerprints, fingerprint, normalize } = require('../../desktop/license.js');
const issue = (...serials) => readFingerprints(Buffer.concat(serials.map((s) => fingerprint(normalize(s)))));

test('an issued serial checks out, however it is typed', () => {
  const serial = makeSerial();
  assert.match(serial, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  const issued = issue(makeSerial(), serial);
  assert.equal(checkSerial(serial, issued).ok, true);
  assert.equal(checkSerial(` ${serial.toLowerCase().replace(/-/g, ' ')}\n`, issued).serial, serial);
  assert.equal(checkSerial(serial.replace(/0/g, 'O').replace(/1/g, 'l'), issued).ok, true);
});

test('serials that were not issued, altered serials and junk are refused', () => {
  const serial = makeSerial();
  const issued = issue(serial);
  assert.equal(checkSerial(makeSerial(), issued).ok, false);
  assert.equal(checkSerial(serial.slice(0, -1) + (serial.endsWith('A') ? 'B' : 'A'), issued).ok, false);
  for (const junk of ['', 'ABCDE-12345', 'not a serial', null, undefined]) assert.equal(checkSerial(junk, issued).ok, false);
  assert.equal(checkSerial(serial, new Set()).ok, false);
});

test('desktop/serials.dat holds whole fingerprints', () => {
  const buf = readFileSync(new URL('../../desktop/serials.dat', import.meta.url));
  assert.ok(buf.length >= 8 && buf.length % 8 === 0);
  assert.equal(readFingerprints(buf).size, buf.length / 8);
});
