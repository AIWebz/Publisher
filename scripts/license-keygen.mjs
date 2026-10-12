// Makes Folio Publisher serial numbers.
//
//   node scripts/license-keygen.mjs --init <private-key.pem>   new key pair: writes the private key to
//                                                             <private-key.pem> and its public half to
//                                                             package.json "licensePublicKey"
//   node scripts/license-keygen.mjs <private-key.pem> [count]  print [count] new serials (default 1)
//
// Keep the private key out of the repository and backed up: anyone with it can make serials, and
// without it no new serials can be made for builds that carry its public key. After --init, serials
// made with an older key stop working in new builds.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { makeSerial, checkSerial } = require('../desktop/license.js');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkgPath = path.join(root, 'package.json');
const [a, b] = process.argv.slice(2);

if (a === '--init' && b) {
  if (existsSync(b)) throw new Error(`${b} already exists; refusing to overwrite a private key`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  writeFileSync(b, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const src = readFileSync(pkgPath, 'utf8');
  const next = /"licensePublicKey": "[^"]*"/.test(src)
    ? src.replace(/"licensePublicKey": "[^"]*"/, `"licensePublicKey": "${pub}"`)
    : src.replace(/("main": "[^"]*",)/, `$1\n  "licensePublicKey": "${pub}",`);
  writeFileSync(pkgPath, next);
  console.log(`Private key: ${b}\nPublic key written to package.json: ${pub}`);
} else if (a && a !== '--init') {
  const key = crypto.createPrivateKey(readFileSync(a, 'utf8'));
  const pub = JSON.parse(readFileSync(pkgPath, 'utf8')).licensePublicKey;
  for (let i = 0; i < Math.max(1, Number(b) || 1); i++) {
    const serial = makeSerial(key);
    if (!checkSerial(serial, pub).ok) throw new Error('This private key does not match package.json "licensePublicKey"');
    console.log(serial);
  }
} else {
  console.log('usage: node scripts/license-keygen.mjs --init <private-key.pem> | <private-key.pem> [count]');
}
