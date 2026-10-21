import assert from 'node:assert/strict';
import test from 'node:test';
import { d1BlobBytes } from '../src/lib/d1-bytes.ts';

test('reads D1 BLOB values returned as arrays of bytes', () => {
  assert.deepEqual(d1BlobBytes([0, 1, 127, 255]), new Uint8Array([0, 1, 127, 255]));
});

test('reads D1 BLOB values returned as buffers and typed-array views', () => {
  assert.deepEqual(d1BlobBytes(new Uint8Array([1, 2]).buffer), new Uint8Array([1, 2]));
  assert.deepEqual(d1BlobBytes(new DataView(new Uint8Array([9, 3, 4, 9]).buffer, 1, 2)), new Uint8Array([3, 4]));
});

test('rejects malformed D1 BLOB values', () => {
  assert.throws(() => d1BlobBytes([0, -1]), /not binary data/);
  assert.throws(() => d1BlobBytes([256]), /not binary data/);
  assert.throws(() => d1BlobBytes('AQI='), /not binary data/);
});
