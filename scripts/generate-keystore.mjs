#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import readline from 'node:readline/promises';

const alias = 'linkdeck';
const outputFile = 'release-keystore.jks';
const keyFile = 'link-deck-key.pem';
const certFile = 'link-deck-cert.pem';

async function password() {
  const index = process.argv.indexOf('--password');
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (process.env.KEYSTORE_PASSWORD) return process.env.KEYSTORE_PASSWORD;
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const value = await input.question('Enter keystore password: ');
  input.close();
  if (!value) throw new Error('Password cannot be empty.');
  return value;
}

function run(command, args, environment = {}) {
  execFileSync(command, args, { env: { ...process.env, ...environment }, stdio: 'pipe' });
}

function cleanup() {
  for (const file of [keyFile, certFile]) if (existsSync(file)) rmSync(file);
}

try {
  run('openssl', ['version']);
  const secret = await password();
  if (existsSync(outputFile)) rmSync(outputFile);
  run('openssl', ['genrsa', '-out', keyFile, '2048']);
  run('openssl', [
    'req',
    '-new',
    '-x509',
    '-key',
    keyFile,
    '-out',
    certFile,
    '-days',
    '36500',
    '-subj',
    '/CN=LinkDeck/OU=Mobile/O=LinkDeck/C=IN',
  ]);
  run(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-in',
      certFile,
      '-inkey',
      keyFile,
      '-out',
      outputFile,
      '-name',
      alias,
      '-passout',
      'env:OPENSSL_PASS',
    ],
    { OPENSSL_PASS: secret },
  );
  cleanup();
  console.log(`Created ${outputFile}\nAlias: ${alias}\nFormat: PKCS12`);
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : 'Keystore generation failed.');
  process.exit(1);
}
