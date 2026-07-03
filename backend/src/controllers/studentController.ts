import { Request, Response } from 'express';
import { Restaurant } from '../models/restaurantModel';
import { Product } from '../models/productModel';
import { User } from '../models/userModel';
import { Order } from '../models/orderModel';
import { Transaction } from '../models/transactionModel';
import { Coupon } from '../models/couponModel';
import { Notification } from '../models/notificationModel';
import { config } from '../config';
import { NotFoundError, AppError } from '../utils/errors';
import { getCancellationPolicy, canCancel, isValidTransition } from '../utils/cancellationPolicy';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export const studentController = {
  getRestaurants: async (req: AuthenticatedRequest, res: Response) => {
    const { category, search, openNow, rating, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));

    const filter: any = { isActive: true, isVerified: true };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (rating) filter.rating = { $gte: parseFloat(rating as string) };

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = now.getDay();

    const total = await Restaurant.countDocuments(filter);
    const restaurants = await Restaurant.find(filter)
      .select('-payoutUpiId -gstNumber -platformCommission')
      .sort({ rating: -1, totalOrders: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    let items = restaurants.map(r => {
      const isOpenNow = r.operatingHours.daysOpen.includes(currentDay) &&
        currentTime >= r.operatingHours.open && currentTime < r.operatingHours.close;
      return { ...r, isOpenNow };
    });

    if (openNow === 'true') items = items.filter(i => i.isOpenNow);

    res.json({
      success: true,
      data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    const restaurant = await Restaurant.findById(req.params.id)
      .select('-payoutUpiId -gstNumber -platformCommission')
      .populate('owner', 'name')
      .lean();

    if (!restaurant) throw new NotFoundError('Restaurant');

    const productCount = await Product.countDocuments({ restaurant: restaurant._id, isAvailable: true });

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const isOpenNow = restaurant.operatingHours.daysOpen.includes(now.getDay()) &&
      currentTime >= restaurant.operatingHours.open && currentTime < restaurant.operatingHours.close;

    res.json({
      success: true,
      data: { ...restaurant, productCount, isOpenNow },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getRestaurantProducts: async (req: AuthenticatedRequest, res: Response) => {
    const { category, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));

    const filter: any = { restaurant: req.params.id, isAvailable: true };
    if (category) filter.category = category;

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort({ category: 1, name: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      data: { items: products, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  searchProducts: async (req: AuthenticatedRequest, res: Response) => {
    const { q, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));

    if (!q) {
      res.json({
        success: true,
        data: { items: [], pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } },
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const products = await Product.find(
      { $text: { $search: q as string }, isAvailable: true },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('restaurant', 'name category')
      .lean();

    const total = await Product.countDocuments({ $text: { $search: q as string }, isAvailable: true });

    res.json({
      success: true,
      data: { items: products, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },
  placeOrder: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const { restaurantId, items, deliveryAddress, paymentMethod, couponCode, creditsToApply } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) throw new NotFoundError('Restaurant');
    if (!restaurant.isActive || !restaurant.isVerified) throw new AppError('RESTAURANT_NOT_VERIFIED', 'Restaurant is not available');

    const productIds = items.map((i: any) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, restaurant: restaurantId, isAvailable: true }).lean();
    if (products.length !== productIds.length) throw new NotFoundError('Some products');

    let subtotal = 0;
    const orderItems = items.map((item: any) => {
      const product = products.find((p: any) => p._id.toString() === item.productId)!;
      subtotal += product.price * item.quantity;
      return { product: product._id, name: product.name, price: product.price, quantity: item.quantity, specialInstructions: item.specialInstructions };
    });

    if (subtotal < restaurant.minimumOrderAmount) {
      throw new AppError('VALIDATION_ERROR', `Minimum order amount is ₹${restaurant.minimumOrderAmount}`);
    }

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true, validFrom: { $lte: new Date() }, validUntil: { $gte: new Date() } });
      if (!coupon) throw new AppError('NOT_FOUND', 'Invalid or expired coupon');
      if (coupon!.usageLimit !== -1 && coupon!.usedCount >= coupon!.usageLimit) throw new AppError('CONFLICT', 'Coupon usage limit reached');
      if (subtotal < coupon!.minOrderAmount) throw new AppError('VALIDATION_ERROR', `Minimum order amount ₹${coupon!.minOrderAmount} required`);
      if (coupon!.applicableRestaurants.length > 0 && !coupon!.applicableRestaurants.map((r: any) => r.toString()).includes(restaurantId)) {
        throw new AppError('VALIDATION_ERROR', 'Coupon not applicable for this restaurant');
      }
      discount = coupon!.discountType === 'percentage'
        ? Math.min(subtotal * coupon!.discountValue / 100, coupon!.maxDiscount || Infinity)
        : coupon!.discountValue;
      discount = Math.min(discount, subtotal);
      coupon!.usedCount += 1;
      await coupon!.save();
    }

    let creditsApplied = 0;
    if (creditsToApply && user.creditsBalance > 0) {
      const maxCredits = Math.floor(subtotal * config.credit.maxOrderPercentage);
      creditsApplied = Math.min(creditsToApply, user.creditsBalance, maxCredits);
    }

    const deliveryFee = restaurant.deliveryFee || config.restaurant.defaultDeliveryFee;
    const platformFee = Math.round(subtotal * config.restaurant.platformCommission / 100);
    const totalAmount = Math.max(0, subtotal + deliveryFee + platformFee - discount - creditsApplied);
    const creditsEarned = Math.floor(subtotal * config.credit.earnRate);

    if (paymentMethod === 'wallet' && user.walletBalance < totalAmount) {
      throw new AppError('INSUFFICIENT_WALLET', 'Insufficient wallet balance');
    }

    const order = await Order.create({
      student: user._id, restaurant: restaurantId, items: orderItems,
      pricing: { subtotal, deliveryFee, platformFee, discount, creditsApplied, totalAmount },
      payment: { method: paymentMethod || 'wallet', status: paymentMethod === 'wallet' ? 'paid' : 'pending' },
      deliveryAddress,
      earnings: { studentCreditsEarned: creditsEarned, courierFee: 0, restaurantPayout: 0, platformRevenue: 0 },
      timestamps: { placedAt: new Date() },
    });

    if (paymentMethod === 'wallet') {
      user.walletBalance -= totalAmount;
      order.payment.paidAt = new Date();
      await Transaction.create({ user: user._id, type: 'wallet_deduction', amount: totalAmount, balanceAfter: user.walletBalance, reference: { id: order._id, model: 'Order' }, description: `Payment for order ${order.orderNumber}`, status: 'completed' });
    }

    if (creditsApplied > 0) {
      user.creditsBalance -= creditsApplied;
      await Transaction.create({ user: user._id, type: 'credits_spent', amount: creditsApplied, balanceAfter: user.walletBalance, creditsBalanceAfter: user.creditsBalance, reference: { id: order._id, model: 'Order' }, description: `Credits applied for order ${order.orderNumber}`, status: 'completed' });
    }

    user.creditsBalance += creditsEarned;
    user.creditsLastActivityAt = new Date();
    user.orderCountToday += 1;
    user.lastOrderAt = new Date();
    user.creditEarnedToday += creditsEarned;
    await user.save();

    if (creditsEarned > 0) {
      await Transaction.create({ user: user._id, type: 'credits_earned', amount: creditsEarned, balanceAfter: user.walletBalance, creditsBalanceAfter: user.creditsBalance, reference: { id: order._id, model: 'Order' }, description: `Credits earned for order ${order.orderNumber}`, status: 'completed' });
    }

    await Notification.create({ user: user._id, type: 'order_placed', title: 'Order Placed', message: `Your order ${order.orderNumber} has been placed.`, data: { orderId: order._id }, priority: 'normal' });

    const io = (global as any).io;
    if (io) {
      io.emitToRestaurant(restaurantId, 'order:new', { orderId: order._id, orderNumber: order.orderNumber });
      io.emitToStudent(user._id.toString(), 'order:status', { orderId: order._id, status: 'placed' });
    }

    await order.save();

    res.status(201).json({
      success: true,
      data: { order: { id: order._id, orderNumber: order.orderNumber, status: order.status, pricing: order.pricing }, creditsEarned, creditsBalance: user.creditsBalance, walletBalance: user.walletBalance },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getOrders: async (req: AuthenticatedRequest, res: Response) => {
    const { status, page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = { student: req.user._id };
    if (status) filter.status = status;

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('restaurant', 'name category images')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      data: { items: orders, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getOrder: async (req: AuthenticatedRequest, res: Response) => {
    const order = await Order.findOne({ _id: req.params.id, student: req.user._id })
      .populate('restaurant', 'name category images contactPhone')
      .populate('courier', 'name phone')
      .lean();
    if (!order) throw new NotFoundError('Order');

    res.json({
      success: true, data: order,
      meta: { timestamp: new Date().toISOString() },
    });
  },

  cancelOrder: async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, student: req.user._id });
    if (!order) throw new NotFoundError('Order');
    if (!canCancel('student', order.status)) throw new AppError('ORDER_NOT_CANCELLABLE', `Order cannot be cancelled in ${order.status} status`);

    const foodCost = order.pricing.subtotal;
    const comp = getCancellationPolicy('student', order.status, order.pricing.totalAmount, order.pricing.deliveryFee, foodCost);
    order.status = 'cancelled';
    order.cancelledBy = 'student';
    order.cancellationReason = reason || 'Cancelled by student';
    order.timestamps.cancelledAt = new Date();
    order.cancellationFee = comp.student;

    if (comp.studentRefund > 0 && order.payment.status === 'paid') {
      const user = await User.findById(req.user._id);
      if (user) {
        user.walletBalance += comp.studentRefund;
        await user.save();
        await Transaction.create({ user: user._id, type: 'wallet_refund', amount: comp.studentRefund, balanceAfter: user.walletBalance, reference: { id: order._id, model: 'Order' }, description: `Refund for cancelled order ${order.orderNumber}`, status: 'completed' });
      }
    }
    await order.save();

    const io = (global as any).io;
    if (io && order.restaurant) {
      io.emitToRestaurant(order.restaurant.toString(), 'order:cancelled', { orderId: order._id, orderNumber: order.orderNumber, reason });
    }

    res.json({
      success: true,
      data: { message: 'Order cancelled', orderNumber: order.orderNumber, status: order.status },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  rateOrder: async (req: AuthenticatedRequest, res: Response) => {
    const { foodRating, deliveryRating, review } = req.body;
    const order = await Order.findOne({ _id: req.params.id, student: req.user._id, status: 'delivered' });
    if (!order) throw new NotFoundError('Order');

    order.rating = { food: foodRating, delivery: deliveryRating, review: review || '', ratedAt: new Date() };
    await order.save();

    res.json({
      success: true, data: { message: 'Order rated successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  disputeOrder: async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, student: req.user._id });
    if (!order) throw new NotFoundError('Order');
    if (!isValidTransition(order.status, 'disputed')) {
      throw new AppError('INVALID_STATUS_TRANSITION', `Cannot dispute order in ${order.status} status`);
    }

    order.status = 'disputed';
    order.cancellationReason = reason || 'Disputed by student';
    order.timestamps.cancelledAt = new Date();
    await order.save();

    await Notification.create({
      user: req.user._id,
      type: 'dispute_opened',
      title: 'Dispute Opened',
      message: `Dispute opened for order ${order.orderNumber}. Admin will review it shortly.`,
      data: { orderId: order._id },
      priority: 'high',
    });

    const io = (global as any).io;
    if (io) {
      io.emitToAdmins('dispute:new', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason,
      });
    }

    res.json({
      success: true, data: { message: 'Dispute opened', orderNumber: order.orderNumber },
      meta: { timestamp: new Date().toISOString() },
    });
  },
  getWallet: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const { type, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = { user: user._id, type: { $in: ['wallet_topup', 'wallet_deduction', 'wallet_refund'] } };
    if (type) filter.type = type;

    const total = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();

    res.json({
      success: true,
      data: { balance: user.walletBalance, creditsBalance: user.creditsBalance, transactions: { items: transactions, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  initiateTopup: async (req: AuthenticatedRequest, res: Response) => {
    const { amount } = req.body;
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
    const order = await razorpay.orders.create({ amount: amount * 100, currency: 'INR', receipt: `topup_${req.user._id}_${Date.now()}` });

    res.json({
      success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  verifyTopup: async (req: AuthenticatedRequest, res: Response) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (expected !== razorpaySignature) throw new AppError('VALIDATION_ERROR', 'Payment verification failed');

    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User');

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
    const payment = await razorpay.payments.fetch(razorpayPaymentId);
    const topupAmount = (payment.amount || 0) / 100;

    user.walletBalance += topupAmount;
    await user.save();
    await Transaction.create({ user: user._id, type: 'wallet_topup', amount: topupAmount, balanceAfter: user.walletBalance, reference: { id: user._id, model: 'User' }, description: `Wallet topup of ₹${topupAmount}`, status: 'completed' });

    res.json({
      success: true, data: { message: 'Payment verified', walletBalance: user.walletBalance, amount: topupAmount },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getCreditsHistory: async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = { user: req.user._id, type: { $in: ['credits_earned', 'credits_spent', 'credits_expired'] } };
    const total = await Transaction.countDocuments(filter);
    const items = await Transaction.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();

    res.json({
      success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  convertCredits: async (req: AuthenticatedRequest, res: Response) => {
    const { credits } = req.body;
    const user = req.user;
    if (credits < config.credit.minConversion) throw new AppError('VALIDATION_ERROR', `Minimum ${config.credit.minConversion} credits required`);
    if (credits > user.creditsBalance) throw new AppError('INSUFFICIENT_CREDITS', 'Insufficient credits');

    const walletAmount = Math.floor(credits * config.credit.earnRate);
    user.creditsBalance -= credits;
    user.walletBalance += walletAmount;
    user.creditsLastActivityAt = new Date();
    await user.save();

    await Transaction.create({ user: user._id, type: 'credits_spent', amount: credits, balanceAfter: user.walletBalance, creditsBalanceAfter: user.creditsBalance, reference: { id: user._id, model: 'User' }, description: `Converted ${credits} credits to ₹${walletAmount}`, status: 'completed' });

    res.json({
      success: true, data: { message: `Converted ${credits} credits to ₹${walletAmount}`, walletBalance: user.walletBalance, creditsBalance: user.creditsBalance },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getProfile: async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.user._id).select('-password -otp -otpExpires').lean();
    res.json({ success: true, data: user, meta: { timestamp: new Date().toISOString() } });
  },

  updateProfile: async (req: AuthenticatedRequest, res: Response) => {
    const { name, roomNumber, hostelBlock, preferences } = req.body;
    const user = req.user;
    if (name) user.name = name;
    if (roomNumber !== undefined) user.roomNumber = roomNumber;
    if (hostelBlock !== undefined) user.hostelBlock = hostelBlock;
    if (preferences) user.preferences = { ...(user.preferences || {}), ...preferences };
    await user.save();

    res.json({
      success: true, data: { message: 'Profile updated', user: { name: user.name, roomNumber: user.roomNumber, hostelBlock: user.hostelBlock, preferences: user.preferences } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getAddresses: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    res.json({ success: true, data: user.addresses || [], meta: { timestamp: new Date().toISOString() } });
  },

  addAddress: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const { building, floor, roomNumber, landmark, coordinates, label } = req.body;
    if (!user.addresses) user.addresses = [];
    user.addresses.push({ building, floor, roomNumber, landmark, coordinates, label, isDefault: user.addresses.length === 0 });
    await user.save();
    res.status(201).json({ success: true, data: { message: 'Address added', addresses: user.addresses }, meta: { timestamp: new Date().toISOString() } });
  },

  updateAddress: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const addr = user.addresses?.id(req.params.id);
    if (!addr) throw new NotFoundError('Address');
    Object.assign(addr, req.body);
    await user.save();
    res.json({ success: true, data: { message: 'Address updated', addresses: user.addresses }, meta: { timestamp: new Date().toISOString() } });
  },

  deleteAddress: async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    user.addresses = (user.addresses || []).filter((a: any) => a._id.toString() !== req.params.id);
    await user.save();
    res.json({ success: true, data: { message: 'Address deleted', addresses: user.addresses }, meta: { timestamp: new Date().toISOString() } });
  },

  getNotifications: async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20', unreadOnly } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = { user: req.user._id };
    if (unreadOnly === 'true') filter.isRead = false;

    const total = await Notification.countDocuments(filter);
    const items = await Notification.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    res.json({
      success: true, data: { items, unreadCount, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  markNotificationRead: async (req: AuthenticatedRequest, res: Response) => {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) throw new NotFoundError('Notification');
    await notification.markAsRead();
    res.json({ success: true, data: { message: 'Notification marked as read' }, meta: { timestamp: new Date().toISOString() } });
  },

  markAllNotificationsRead: async (req: AuthenticatedRequest, res: Response) => {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
    res.json({ success: true, data: { message: 'All notifications marked as read' }, meta: { timestamp: new Date().toISOString() } });
  },
};