import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('Windows CRT staging accepts signed x64 files and rejects unsafe sets before copying',
  { skip: process.platform !== 'win32' }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omera-crt-test-'));
    const staged = path.join(root, 'valid');
    const script = path.resolve('src-tauri/windows/prepare-runtime.ps1');
    const run = (destination, source) => execFileSync('powershell.exe', [
      '-NoProfile', '-File', script, '-Destination', destination,
      ...(source ? ['-RedistDir', source] : []),
    ], { encoding: 'utf8', stdio: 'pipe' });
    try {
      assert.match(run(staged), /Microsoft-signed x64 CRT libraries/);
      assert.ok(fs.existsSync(path.join(staged, 'msvcp140_1.dll')));
      for (const name of fs.readdirSync(staged)) {
        const bytes = fs.readFileSync(path.join(staged, name));
        assert.equal(bytes.readUInt16LE(bytes.readInt32LE(0x3c) + 4), 0x8664);
      }
      const reject = (name, mutate, error) => {
        const source = path.join(root, name);
        const destination = path.join(root, `${name}-output`);
        fs.cpSync(staged, source, { recursive: true });
        fs.mkdirSync(destination);
        fs.writeFileSync(path.join(destination, 'sentinel.txt'), 'untouched');
        mutate(source);
        assert.throws(() => run(destination, source), error);
        assert.deepEqual(fs.readdirSync(destination), ['sentinel.txt']);
      };
      reject('missing', source => fs.unlinkSync(path.join(source, 'msvcp140_1.dll')),
        /Missing required CRT library/);
      reject('wrong-architecture', source => {
        const file = path.join(source, 'msvcp140.dll');
        const bytes = fs.readFileSync(file);
        bytes.writeUInt16LE(0x14c, bytes.readInt32LE(0x3c) + 4);
        fs.writeFileSync(file, bytes);
      }, /not Windows x64/);
      reject('tampered', source => {
        const file = path.join(source, 'msvcp140.dll');
        const bytes = fs.readFileSync(file);
        bytes[0x20] ^= 1;
        fs.writeFileSync(file, bytes);
      }, /lacks a valid Microsoft signature/);
      // Regeneration must discard obsolete generated DLLs, preserving other files.
      fs.writeFileSync(path.join(staged, 'obsolete.dll'), 'old');
      fs.writeFileSync(path.join(staged, 'receipt.txt'), 'retain');
      run(staged);
      assert.equal(fs.existsSync(path.join(staged, 'obsolete.dll')), false);
      assert.equal(fs.readFileSync(path.join(staged, 'receipt.txt'), 'utf8'), 'retain');
    } finally {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('omera-crt-test-'));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
