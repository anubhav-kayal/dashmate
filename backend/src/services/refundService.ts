import { Order } from '../models/orderModel';
import { User } from '../models/userModel';
import { Transaction } from '../models/transactionModel';
import { Notification } from '../models/notificationModel';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RefundResult {
  studentRefund: number;
  courierPenalty: number;
  restaurantPenalty: number;
}

export async function processRefund(
  orderId: string,
  reason: string,
  initiatedBy: string,
  fullRefund: boolean,
): Promise<RefundResult> {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');

  if (order.status !== 'cancelled' && order.status !== 'disputed') {
    throw new AppError('INVALID_STATUS_TRANSITION', 'Only cancelled or disputed orders can be refunded');
  }

  if (order.payment.status === 'refunded') {
    throw new AppError('CONFLICT', 'Order already refunded');
  }

  const studentRefund = fullRefund ? order.pricing.totalAmount : order.pricing.totalAmount * 0.5;
  const courierPenalty = order.courier && order.status === 'disputed' ? order.earnings.courierFee * 0.5 : 0;
  const restaurantPenalty = fullRefund ? order.pricing.subtotal * 0.3 : 0;

  const student = await User.findById(order.student);
  if (student && studentRefund > 0) {
    student.walletBalance += studentRefund;
    await student.save();

    await Transaction.create({
      user: student._id,
      type: 'wallet_refund',
      amount: studentRefund,
      balanceAfter: student.walletBalance,
      reference: { id: order._id, model: 'Order' },
      description: `Refund for order ${order.orderNumber}: ${reason}`,
      status: 'completed',
    });
  }

  if (courierPenalty > 0 && order.courier) {
    const courier = await User.findById(order.courier);
    if (courier) {
      courier.walletBalance = Math.max(0, courier.walletBalance - courierPenalty);
      await courier.save();
      await Transaction.create({
        user: courier._id,
        type: 'courier_penalty',
        amount: -courierPenalty,
        balanceAfter: courier.walletBalance,
        reference: { id: order._id, model: 'Order' },
        description: `Penalty for disputed order ${order.orderNumber}`,
        status: 'completed',
      });
    }
  }

  order.payment.status = fullRefund ? 'refunded' : 'partial_refund';

  if (order.status === 'disputed') {
    order.status = 'delivered';
  }

  await order.save();

  const io = (global as any).io;
  if (io) {
    io.emitToStudent(String(order.student), 'order:status', {
      orderId: order._id, status: order.status, refundAmount: studentRefund,
    });
  }

  await Notification.create({
    user: order.student,
    type: 'order_refund',
    title: fullRefund ? 'Refund Processed' : 'Partial Refund Processed',
    message: `₹${studentRefund} refunded for order ${order.orderNumber}. Reason: ${reason}`,
    data: { orderId: order._id, refundAmount: studentRefund },
    priority: 'high',
  });

  logger.info(`Refund processed for order ${order.orderNumber}`, {
    refundAmount: studentRefund,
    initiatedBy,
    fullRefund,
  });

  return { studentRefund, courierPenalty, restaurantPenalty };
}

export async function resolveDispute(
  orderId: string,
  resolution: 'refund_student' | 'pay_courier' | 'split',
  adminNote: string,
  adminId: string,
): Promise<{ message: string; refundAmount: number }> {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (order.status !== 'disputed') throw new AppError('INVALID_STATUS_TRANSITION', 'Order is not disputed');

  let refundAmount = 0;
  let resolutionMessage = '';

  switch (resolution) {
    case 'refund_student': {
      const result = await processRefund(orderId, adminNote, adminId, true);
      refundAmount = result.studentRefund;
      resolutionMessage = `Full refund of ₹${refundAmount} issued to student`;
      break;
    }
    case 'pay_courier': {
      if (order.courier) {
        const courier = await User.findById(order.courier);
        if (courier) {
          courier.walletBalance += order.earnings.courierFee;
          await courier.save();
        }
      }
      order.status = 'delivered';
      await order.save();
      resolutionMessage = 'Dispute resolved in favor of courier';
      break;
    }
    case 'split': {
      const result = await processRefund(orderId, adminNote, adminId, false);
      refundAmount = result.studentRefund;
      resolutionMessage = `Partial refund of ₹${refundAmount} issued to student`;
      if (order.courier) {
        const courier = await User.findById(order.courier);
        if (courier) {
          const halfFee = order.earnings.courierFee * 0.5;
          courier.walletBalance += halfFee;
          await courier.save();
        }
      }
      order.status = 'delivered';
      await order.save();
      break;
    }
  }

  await Notification.create({
    user: order.student,
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    message: resolutionMessage,
    data: { orderId: order._id, resolution },
    priority: 'high',
  });

  return { message: resolutionMessage, refundAmount };
}
