import { Request, Response } from 'express';
import { User } from '../models/userModel';
import { Order } from '../models/orderModel';
import { Transaction } from '../models/transactionModel';
import { Coupon } from '../models/couponModel';
import { WithdrawalRequest } from '../models/withdrawalModel';
import { NotFoundError, AppError } from '../utils/errors';
import { processRefund, resolveDispute } from '../services/refundService';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export const adminController = {
  getDashboard: async (req: AuthenticatedRequest, res: Response) => {
    const [totalUsers, totalOrders, pendingCouriers, pendingWithdrawals] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ 'courier.kycStatus': 'pending' }),
      WithdrawalRequest.countDocuments({ status: 'pending' }),
    ]);

    const revenueAgg = await Transaction.aggregate([
      { $match: { type: { $in: ['wallet_topup', 'platform_fee'] }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: { totalUsers, totalOrders, totalRevenue: revenueAgg[0]?.total || 0, pendingCouriers, pendingWithdrawals },
      meta: { timestamp: new Date().toISOString() },
    });
  },

  getRestaurants: async (req: AuthenticatedRequest, res: Response) => {
    const { Restaurant } = require('../models/restaurantModel');
    const { page = '1', limit = '20', isVerified } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = {};
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';

    const total = await Restaurant.countDocuments(filter);
    const items = await Restaurant.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },

  getCouriers: async (req: AuthenticatedRequest, res: Response) => {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = { role: 'courier' };
    if (status) filter['courier.kycStatus'] = status;

    const total = await User.countDocuments(filter);
    const items = await User.find(filter)
      .select('name phone registerNumber courier createdAt')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },

  getCourier: async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.params.id).select('-password -otp -otpExpires').lean();
    if (!user || user.role !== 'courier') throw new NotFoundError('Courier');
    res.json({ success: true, data: user, meta: { timestamp: new Date().toISOString() } });
  },

  verifyCourier: async (req: AuthenticatedRequest, res: Response) => {
    const { isVerified, rejectionReason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) throw new NotFoundError('User');

    if (!user.courier) throw new AppError('VALIDATION_ERROR', 'User is not a courier');
    user.courier.kycStatus = isVerified ? 'approved' : 'rejected';
    user.courier.isVerified = isVerified;
    if (!isVerified && rejectionReason) user.courier.kycStatus = 'rejected';
    await user.save();

    const io = (global as any).io;
    if (io) {
      io.emitToCourier(String(user._id), 'notification:new', {
        type: isVerified ? 'verification_approved' : 'verification_rejected',
        title: isVerified ? 'KYC Approved' : 'KYC Rejected',
        message: isVerified ? 'You can now start delivering orders' : `KYC rejected: ${rejectionReason || 'Please re-submit'}`,
      });
    }

    res.json({ success: true, data: { message: `Courier ${isVerified ? 'verified' : 'rejected'}`, kycStatus: user.courier!.kycStatus }, meta: { timestamp: new Date().toISOString() } });
  },

  getWithdrawals: async (req: AuthenticatedRequest, res: Response) => {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = {};
    if (status) filter.status = status;

    const total = await WithdrawalRequest.countDocuments(filter);
    const items = await WithdrawalRequest.find(filter).populate('user', 'name phone').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },

  processWithdrawal: async (req: AuthenticatedRequest, res: Response) => {
    const { action, note } = req.body;
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) throw new NotFoundError('Withdrawal');
    if (withdrawal.status !== 'pending') throw new AppError('CONFLICT', 'Withdrawal already processed');

    if (action === 'approve') {
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
      withdrawal.processedBy = req.user._id;
    } else {
      withdrawal.status = 'rejected';
      withdrawal.rejectionReason = note;
      withdrawal.processedBy = req.user._id;
      const user = await User.findById(withdrawal.user);
      if (user) {
        user.walletBalance += withdrawal.amount;
        await user.save();
      }
    }
    await withdrawal.save();

    res.json({ success: true, data: { message: `Withdrawal ${action}d`, withdrawal }, meta: { timestamp: new Date().toISOString() } });
  },

  createRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, data: { message: 'Restaurant created' }, meta: { timestamp: new Date().toISOString() } });
  },
  getRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    const { Restaurant } = require('../models/restaurantModel');
    const restaurant = await Restaurant.findById(req.params.id).populate('owner', 'name phone').lean();
    if (!restaurant) throw new NotFoundError('Restaurant');
    res.json({ success: true, data: restaurant, meta: { timestamp: new Date().toISOString() } });
  },
  updateRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    const { Restaurant } = require('../models/restaurantModel');
    const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!restaurant) throw new NotFoundError('Restaurant');
    res.json({ success: true, data: restaurant, meta: { timestamp: new Date().toISOString() } });
  },
  verifyRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    const { Restaurant } = require('../models/restaurantModel');
    const { isVerified } = req.body;
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) throw new NotFoundError('Restaurant');
    restaurant.isVerified = isVerified;
    await restaurant.save();
    res.json({ success: true, data: { message: `Restaurant ${isVerified ? 'verified' : 'unverified'}`, isVerified }, meta: { timestamp: new Date().toISOString() } });
  },
  deleteRestaurant: async (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, data: { message: 'Restaurant deleted' }, meta: { timestamp: new Date().toISOString() } });
  },
  toggleCourier: async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.params.id);
    if (!user || !user.courier) throw new NotFoundError('Courier');
    user.courier.isOnline = !user.courier.isOnline;
    await user.save();
    res.json({ success: true, data: { message: `Courier ${user.courier.isOnline ? 'online' : 'offline'}`, isOnline: user.courier.isOnline }, meta: { timestamp: new Date().toISOString() } });
  },
  getOrders: async (req: AuthenticatedRequest, res: Response) => {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const filter: any = {};
    if (status) filter.status = status;
    const total = await Order.countDocuments(filter);
    const items = await Order.find(filter).populate('student', 'name').populate('restaurant', 'name').populate('courier', 'name').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },
  getOrder: async (req: AuthenticatedRequest, res: Response) => {
    const order = await Order.findById(req.params.id).populate('student', 'name phone').populate('restaurant', 'name').populate('courier', 'name phone').lean();
    if (!order) throw new NotFoundError('Order');
    res.json({ success: true, data: order, meta: { timestamp: new Date().toISOString() } });
  },
  refundOrder: async (req: AuthenticatedRequest, res: Response) => {
    const { reason, fullRefund } = req.body;
    const orderId = req.params.id as string;
    const result = await processRefund(orderId, reason || 'Admin initiated refund', req.user._id.toString(), fullRefund !== false);
    res.json({ success: true, data: { message: 'Refund processed', ...result }, meta: { timestamp: new Date().toISOString() } });
  },
  getDisputes: async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const total = await Order.countDocuments({ status: 'disputed' });
    const items = await Order.find({ status: 'disputed' })
      .populate('student', 'name phone')
      .populate('restaurant', 'name')
      .populate('courier', 'name')
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },
  resolveDispute: async (req: AuthenticatedRequest, res: Response) => {
    const { resolution, adminNote } = req.body;
    if (!['refund_student', 'pay_courier', 'split'].includes(resolution)) {
      throw new AppError('VALIDATION_ERROR', 'Resolution must be refund_student, pay_courier, or split');
    }
    const orderId = req.params.id as string;
    const result = await resolveDispute(orderId, resolution, adminNote || '', req.user._id.toString());
    res.json({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
  },
  createCoupon: async (req: AuthenticatedRequest, res: Response) => {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ success: true, data: coupon, meta: { timestamp: new Date().toISOString() } });
  },
  getCoupons: async (req: AuthenticatedRequest, res: Response) => {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const total = await Coupon.countDocuments();
    const items = await Coupon.find().sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean();
    res.json({ success: true, data: { items, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } }, meta: { timestamp: new Date().toISOString() } });
  },
  updateCoupon: async (req: AuthenticatedRequest, res: Response) => {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!coupon) throw new NotFoundError('Coupon');
    res.json({ success: true, data: coupon, meta: { timestamp: new Date().toISOString() } });
  },
  deleteCoupon: async (req: AuthenticatedRequest, res: Response) => {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { message: 'Coupon deleted' }, meta: { timestamp: new Date().toISOString() } });
  },
  getAnalytics: async (req: AuthenticatedRequest, res: Response) => {
    const [totalUsers, totalOrders, totalCouriers, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: 'courier' }),
      Transaction.aggregate([{ $match: { type: { $in: ['wallet_topup', 'platform_fee'] }, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    res.json({ success: true, data: { totalUsers, totalOrders, totalCouriers, totalRevenue: totalRevenue[0]?.total || 0 }, meta: { timestamp: new Date().toISOString() } });
  },
  getSettings: async (req: AuthenticatedRequest, res: Response) => {
    const { Settings } = require('../models/settingsModel');
    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ success: true, data: settings, meta: { timestamp: new Date().toISOString() } });
  },
  updateSettings: async (req: AuthenticatedRequest, res: Response) => {
    const { Settings } = require('../models/settingsModel');
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    Object.assign(settings, req.body);
    await settings.save();
    res.json({ success: true, data: settings, meta: { timestamp: new Date().toISOString() } });
  },
};
