'use workflow';

import { FatalError, RetryableError } from 'workflow';

const checkDuplicate = async (orderId: string) => {
  'use step';
  const existing = await db.orders.findUnique({
    where: { shopifyId: orderId },
  });
  if (existing?.status === 'completed') {
    throw new FatalError(`Order ${orderId} already processed`);
  }
  return existing;
};

const chargePayment = async (orderId: string, amount: number) => {
  'use step';
  const result = await paymentProvider.charge({
    idempotencyKey: `payment:${orderId}`,
    amount,
  });
  return result;
};

const reserveInventory = async (orderId: string, items: CartItem[]) => {
  'use step';
  const reservation = await warehouse.reserve({
    idempotencyKey: `inventory:${orderId}`,
    items,
  });
  return reservation;
};

const refundPayment = async (orderId: string, chargeId: string) => {
  'use step';
  await paymentProvider.refund({
    idempotencyKey: `refund:${orderId}`,
    chargeId,
  });
};

const sendConfirmation = async (orderId: string, email: string) => {
  'use step';
  await emailService.send({
    idempotencyKey: `confirmation:${orderId}`,
    to: email,
    template: 'order-confirmed',
  });
};

export default async function shopifyOrder(
  orderId: string,
  amount: number,
  items: CartItem[],
  email: string
) {
  // Duplicate check — skip if already processed
  await checkDuplicate(orderId);

  // Charge payment with idempotency key
  const charge = await chargePayment(orderId, amount);

  // Reserve inventory — compensate with refund on failure
  try {
    await reserveInventory(orderId, items);
  } catch (error) {
    if (error instanceof FatalError) {
      await refundPayment(orderId, charge.id);
      throw error;
    }
    throw error;
  }

  // Send confirmation
  await sendConfirmation(orderId, email);

  return { orderId, status: 'fulfilled' };
}
