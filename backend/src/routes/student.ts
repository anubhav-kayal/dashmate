import { Router } from 'express';
import { protect } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import { studentController } from '../controllers/studentController';
import { pushController } from '../controllers/pushController';

const router = Router();

router.get('/restaurants', studentController.getRestaurants);
router.get('/restaurants/:id', studentController.getRestaurant);
router.get('/restaurants/:id/products', studentController.getRestaurantProducts);
router.get('/products/search', studentController.searchProducts);

router.post('/orders', studentController.placeOrder);
router.get('/orders', studentController.getOrders);
router.get('/orders/:id', studentController.getOrder);
router.post('/orders/:id/cancel', studentController.cancelOrder);
router.post('/orders/:id/dispute', studentController.disputeOrder);
router.post('/orders/:id/rate', studentController.rateOrder);

router.get('/wallet', studentController.getWallet);
router.post('/wallet/topup', studentController.initiateTopup);
router.post('/wallet/verify', studentController.verifyTopup);
router.get('/credits/history', studentController.getCreditsHistory);
router.post('/credits/convert', studentController.convertCredits);

router.get('/profile', studentController.getProfile);
router.put('/profile', studentController.updateProfile);
router.get('/addresses', studentController.getAddresses);
router.post('/addresses', studentController.addAddress);
router.put('/addresses/:id', studentController.updateAddress);
router.delete('/addresses/:id', studentController.deleteAddress);

router.get('/notifications', studentController.getNotifications);
router.put('/notifications/:id/read', studentController.markNotificationRead);
router.put('/notifications/read-all', studentController.markAllNotificationsRead);

router.get('/push/vapid-key', pushController.getVapidKey);
router.post('/push/subscribe', pushController.subscribe);
router.post('/push/unsubscribe', pushController.unsubscribe);

export default router;