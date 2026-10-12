/* Folio Publisher — serial numbers.
   A serial is 20 random Crockford-base32 characters, written XXXXX-XXXXX-XXXXX-XXXXX (100 bits).
   The app holds only an 8-byte SHA-256 fingerprint of each serial issued (desktop/serials.dat), so it
   can check a serial offline but the serials cannot be read back out of it. Serials are made with
   scripts/license-keygen.mjs, which adds their fingerprints to serials.dat; the list of serials itself
   is never committed. A new batch works in builds made after it was added. */
'use strict';

const crypto = require('node:crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20;
const FP = 8;

/** Upper-cases, drops spaces and dashes, and reads look-alike letters (O, I, L, U) as their alphabet twins. */
function normalize(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

const format = (body) => body.match(/.{1,5}/g).join('-');
const fingerprint = (body) => crypto.createHash('sha256').update(`folio-serial:${body}`).digest().subarray(0, FP);

/** A new random serial. */
function makeSerial() {
  const bytes = crypto.randomBytes(LENGTH);
  return format([...bytes].map((b) => ALPHABET[b & 31]).join(''));
}

/** The fingerprints in a serials.dat buffer, as a Set of hex strings. */
function readFingerprints(buf) {
  const set = new Set();
  for (let i = 0; i + FP <= (buf ? buf.length : 0); i += FP) set.add(buf.subarray(i, i + FP).toString('hex'));
  return set;
}

/** Checks a serial against the issued fingerprints. Returns { ok, serial }. */
function checkSerial(input, fingerprints) {
  const body = normalize(input);
  if (body.length !== LENGTH || !fingerprints || !fingerprints.has(fingerprint(body).toString('hex'))) return { ok: false };
  return { ok: true, serial: format(body) };
}

module.exports = { makeSerial, checkSerial, readFingerprints, fingerprint, normalize };
