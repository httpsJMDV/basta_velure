import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discountPercent, pesoCompact } from '../src/utils/pricing.ts';

test('storefront discounts use the original price as their basis', () => {
  assert.equal(discountPercent(800, 1000), 20);
  assert.equal(discountPercent(29167.29, 36009), 19);
});

test('regular or missing original prices never display a false discount', () => {
  for (const original of [undefined, null, 0, 800, 700]) {
    assert.equal(discountPercent(800, original), 0);
  }
});

test('Philippine peso labels preserve centavos without adding them to whole amounts', () => {
  assert.equal(pesoCompact(1599), '₱1,599');
  assert.equal(pesoCompact(32.5), '₱32.50');
  assert.equal(pesoCompact(0), '₱0');
});

test('the delivered Loved-IT build exposes its classroom release output', async () => {
  const status = JSON.parse(await readFile(new URL('../public/ci-status.json', import.meta.url), 'utf8'));
  assert.equal(status.application, 'Loved-IT');
  assert.equal(status.message, 'INTENTIONAL LAB FAILURE: incorrect expected message');
  assert.equal(status.version, '1.0.0');
});
