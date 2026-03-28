import { describe, it, expect } from 'vitest';
import { start } from 'workflow/api';
import orderSaga from '../workflows/order-saga';

describe('orderSaga', () => {
  it('completes happy path', async () => {
    const run = await start(orderSaga, [
      'order-1',
      100,
      [{ sku: 'A', qty: 1 }],
      { street: '123 Main' },
      'user@example.com',
    ]);
    await expect(run.returnValue).resolves.toEqual({
      orderId: 'order-1',
      status: 'fulfilled',
    });
  });

  it('compensates payment and inventory when shipment fails', async () => {
    // Mock bookShipment to throw FatalError (carrier rejected)
    const run = await start(orderSaga, [
      'order-2',
      50,
      [{ sku: 'B', qty: 1 }],
      { street: '456 Elm' },
      'user@example.com',
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify refundPayment and releaseInventory were called (compensation executed)
  });

  it('compensates inventory only when payment fails', async () => {
    // Mock chargePayment to throw FatalError (insufficient funds)
    const run = await start(orderSaga, [
      'order-3',
      75,
      [{ sku: 'C', qty: 1 }],
      { street: '789 Oak' },
      'user@example.com',
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify releaseInventory was called but refundPayment was not
  });
});
