import { Router } from 'express';
import {
  initiateHdfcPayment,
  handleHdfcCallback,
  getHdfcPaymentStatus,
  clearAllPayments,
} from '../controllers/paymentController';

const router = Router();

// HDFC Payment endpoints
router.post('/hdfc/initiate', initiateHdfcPayment);
router.all('/hdfc/callback', handleHdfcCallback);
router.get('/hdfc/status/:registrationId', getHdfcPaymentStatus);
router.post('/hdfc/clear-all', clearAllPayments);

export default router;
