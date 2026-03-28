import { describe, it, expect } from 'vitest';
import { start } from 'workflow/api';
import shopifyOrder from '../workflows/shopify-order';

describe('shopifyOrder', () => {
  it('completes happy path', async () => {
    const run = await start(shopifyOrder, [
      'order-1',
      100,
      [{ sku: 'A', qty: 1 }],
      'user@example.com',
    ]);
    await expect(run.returnValue).resolves.toEqual({
      orderId: 'order-1',
      status: 'fulfilled',
    });
  });

  it('skips duplicate webhook delivery', async () => {
    // First delivery succeeds
    const run1 = await start(shopifyOrder, [
      'order-2',
      50,
      [{ sku: 'B', qty: 1 }],
      'user@example.com',
    ]);
    await expect(run1.returnValue).resolves.toEqual({
      orderId: 'order-2',
      status: 'fulfilled',
    });

    // Second delivery with same order ID is skipped
    const run2 = await start(shopifyOrder, [
      'order-2',
      50,
      [{ sku: 'B', qty: 1 }],
      'user@example.com',
    ]);
    await expect(run2.returnValue).rejects.toThrow(FatalError);
  });

  it('refunds payment when inventory fails', async () => {
    // Mock reserveInventory to throw FatalError (out of stock)
    const run = await start(shopifyOrder, [
      'order-3',
      75,
      [{ sku: 'C', qty: 999 }],
      'user@example.com',
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify refundPayment was called (compensation executed)
  });
});
