import { Router } from 'express';
import {
  submitRegistration,
  getMyRegistration,
  getAllRegistrations,
  updateRegistration,
  getSeatCounts,
  getCommitteeAllocations,
  clearAllData,
  downloadAdminExcel,
  assignDelegatePortfolio,
  swapDelegatePortfolios,
  getAdminAuditLogs,
  sendAdminNotificationEmail,
  deleteRegistration,
  getAdminEmailLogs,
  resendNotificationEmail,
  getUserCredentials,
  updateUserPasswordAdmin,
  deleteUserCredentialAdmin,
  getRegistrationStatus,
  updateRegistrationStatus,
  getFeeSetting,
  updateFeeSetting,
  uploadDelegateDocument,
} from '../controllers/registrationController';
import {
  saveDraft,
  getDraft,
  deleteDraft,
} from '../controllers/draftController';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

const router = Router();

// Public routes
router.get('/seat-counts', getSeatCounts);
router.get('/committee-allocations', getCommitteeAllocations);
router.get('/status', getRegistrationStatus);
router.get('/settings/fee', getFeeSetting);
router.post('/settings/fee', updateFeeSetting);
router.post('/admin/settings/fee', updateFeeSetting);
router.post('/upload-docs', uploadMiddleware.any(), uploadDelegateDocument);

// Protected delegate routes
router.use(authMiddleware);

router.post('/submit', submitRegistration);
router.get('/my-registration', getMyRegistration);
router.post('/draft', saveDraft);
router.get('/draft', getDraft);
router.delete('/draft', deleteDraft);

// Admin-only routes
router.get('/all', requireAdmin, getAllRegistrations);
router.put('/update/:id', requireAdmin, updateRegistration);
router.get('/admin/download-excel', requireAdmin, downloadAdminExcel);
router.delete('/admin/clear-all', requireAdmin, clearAllData);
router.delete('/admin/delete/:id', requireAdmin, deleteRegistration);
router.post('/admin/status', requireAdmin, updateRegistrationStatus);

// Admin portfolio & user management
router.get('/admin/audit-logs', requireAdmin, getAdminAuditLogs);
router.get('/admin/user-credentials', requireAdmin, getUserCredentials);
router.put('/admin/update-user-password', requireAdmin, updateUserPasswordAdmin);
router.delete('/admin/user-credential/:id', requireAdmin, deleteUserCredentialAdmin);
router.post('/admin/assign', requireAdmin, assignDelegatePortfolio);
router.post('/admin/swap', requireAdmin, swapDelegatePortfolios);
router.post('/admin/send-email', requireAdmin, sendAdminNotificationEmail);
router.post('/admin/settings/fee', requireAdmin, updateFeeSetting);

export default router;
