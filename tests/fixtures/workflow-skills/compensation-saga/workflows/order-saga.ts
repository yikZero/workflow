'use workflow';

import { FatalError, RetryableError } from 'workflow';

const reserveInventory = async (orderId: string, items: CartItem[]) => {
  'use step';
  const reservation = await warehouse.reserve({
    idempotencyKey: `inventory:${orderId}`,
    items,
  });
  return reservation;
};

const chargePayment = async (orderId: string, amount: number) => {
  'use step';
  const result = await paymentProvider.charge({
    idempotencyKey: `payment:${orderId}`,
    amount,
  });
  return result;
};

const bookShipment = async (orderId: string, address: Address) => {
  'use step';
  const shipment = await carrier.book({
    idempotencyKey: `shipment:${orderId}`,
    address,
  });
  return shipment;
};

const refundPayment = async (orderId: string, chargeId: string) => {
  'use step';
  await paymentProvider.refund({
    idempotencyKey: `refund:${orderId}`,
    chargeId,
  });
};

const releaseInventory = async (orderId: string, reservationId: string) => {
  'use step';
  await warehouse.release({
    idempotencyKey: `release:${orderId}`,
    reservationId,
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

export default async function orderSaga(
  orderId: string,
  amount: number,
  items: CartItem[],
  address: Address,
  email: string
) {
  // Forward step 1: Reserve inventory
  const reservation = await reserveInventory(orderId, items);

  // Forward step 2: Charge payment
  let charge;
  try {
    charge = await chargePayment(orderId, amount);
  } catch (error) {
    // Compensate: release inventory
    if (error instanceof FatalError) {
      await releaseInventory(orderId, reservation.id);
      throw error;
    }
    throw error;
  }

  // Forward step 3: Book shipment
  try {
    await bookShipment(orderId, address);
  } catch (error) {
    // Compensate in reverse order: refund payment, then release inventory
    if (error instanceof FatalError) {
      await refundPayment(orderId, charge.id);
      await releaseInventory(orderId, reservation.id);
      throw error;
    }
    throw error;
  }

  // All forward steps succeeded
  await sendConfirmation(orderId, email);

  return { orderId, status: 'fulfilled' };
}
