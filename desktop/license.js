/* Folio Publisher — serial numbers.
   A serial is a short payload (format version + a random id) and an Ed25519 signature of it, written in
   Crockford base32 as FOLIO-XXXXX-XXXXX-…. The app holds only the public key (package.json
   "licensePublicKey"), so it can check serials offline but cannot make them; serials are made with
   scripts/license-keygen.mjs and the private key, which is never committed. */
'use strict';

const crypto = require('node:crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VERSION = 1;
const PAYLOAD = 5; // version byte + 4-byte id
const SIG = 64;
const CONTEXT = Buffer.from('folio-serial:');

function encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

/** Upper-cases, drops the FOLIO- prefix, spaces and dashes, and reads look-alike letters (O, I, L) as digits. */
function normalize(input) {
  let s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.startsWith('FOLIO')) s = s.slice(5);
  return s.replace(/O/g, '0').replace(/[IL]/g, '1');
}

const format = (body) => 'FOLIO-' + body.match(/.{1,5}/g).join('-');

/** Makes a serial with the private key (a KeyObject or PEM). */
function makeSerial(privateKey, id = crypto.randomBytes(4)) {
  const payload = Buffer.concat([Buffer.from([VERSION]), id]);
  const sig = crypto.sign(null, Buffer.concat([CONTEXT, payload]), privateKey);
  return format(encode(Buffer.concat([payload, sig])));
}

/** Checks a serial against the public key (base64 SPKI DER). Returns { ok, id, serial }. */
function checkSerial(input, publicKeyB64) {
  const fail = { ok: false };
  if (!publicKeyB64) return fail;
  const buf = decode(normalize(input));
  if (!buf || buf.length !== PAYLOAD + SIG || buf[0] !== VERSION) return fail;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    const payload = buf.subarray(0, PAYLOAD);
    if (!crypto.verify(null, Buffer.concat([CONTEXT, payload]), key, buf.subarray(PAYLOAD))) return fail;
    return { ok: true, id: payload.subarray(1).toString('hex'), serial: format(encode(buf)) };
  } catch {
    return fail;
  }
}

module.exports = { makeSerial, checkSerial, normalize };
