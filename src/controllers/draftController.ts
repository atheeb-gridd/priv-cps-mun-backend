import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import RegistrationDraft from '../models/RegistrationDraft';

/**
 * Save or update registration draft
 * POST /api/registration/draft
 */
export const saveDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized. Please sign in to save draft.' });
    }

    const { currentStep, regType, formData, registrationId } = req.body;
    const userId = req.user.userId;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    if (!userEmail && !userId) {
      return res.status(400).json({ message: 'Invalid user session for draft save.' });
    }

    const now = new Date();

    const queryOr: any[] = [];
    if (userId) queryOr.push({ userId });
    if (userEmail) queryOr.push({ userEmail });

    let draft = await RegistrationDraft.findOne({
      $or: queryOr,
      draftStatus: 'IN_PROGRESS'
    });

    const cleanFormData = { ...(formData || {}) };
    delete cleanFormData.docStudentIdFile;
    delete cleanFormData.docPhotoFile;
    delete cleanFormData.docStudentIdBase64;
    delete cleanFormData.docPhotoBase64;
    delete cleanFormData.docAadharBase64;

    if (Array.isArray(cleanFormData.delegates)) {
      cleanFormData.delegates = cleanFormData.delegates.map((d: any) => {
        const cD = { ...d };
        delete cD.docStudentIdFile;
        delete cD.docPhotoFile;
        delete cD.docStudentIdBase64;
        delete cD.docPhotoBase64;
        delete cD.docAadharBase64;
        return cD;
      });
    }

    if (draft) {
      draft.currentStep = currentStep || draft.currentStep || 1;
      draft.regType = regType || draft.regType || 'individual';
      if (registrationId) draft.registrationId = registrationId;
      draft.formData = { ...(draft.formData || {}), ...cleanFormData };
      draft.lastSavedAt = now;
      await draft.save();
    } else {
      draft = new RegistrationDraft({
        userId,
        userEmail,
        registrationId: registrationId || '',
        currentStep: currentStep || 1,
        regType: regType || 'individual',
        formData: cleanFormData,
        lastSavedAt: now,
        draftStatus: 'IN_PROGRESS'
      });
      await draft.save();
    }

    return res.status(200).json({
      message: 'Draft saved successfully.',
      lastSavedAt: draft.lastSavedAt,
      draft
    });
  } catch (error: any) {
    console.error('Save draft error:', error);
    return res.status(500).json({ message: 'Failed to save draft.', error: error.message });
  }
};

/**
 * Fetch current active draft for logged in user
 * GET /api/registration/draft
 */
export const getDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const userId = req.user.userId;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    if (!userEmail && !userId) {
      return res.status(200).json({ draft: null });
    }

    const queryOr: any[] = [];
    if (userId) queryOr.push({ userId });
    if (userEmail) queryOr.push({ userEmail });

    const draft = await RegistrationDraft.findOne({
      $or: queryOr,
      draftStatus: 'IN_PROGRESS'
    });

    return res.status(200).json({ draft: draft || null });
  } catch (error: any) {
    console.error('Get draft error:', error);
    return res.status(500).json({ message: 'Failed to retrieve draft.', error: error.message });
  }
};

/**
 * Delete draft for user (e.g., after successful registration completion)
 * DELETE /api/registration/draft
 */
export const deleteDraft = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const userId = req.user.userId;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    if (!userEmail && !userId) {
      return res.status(200).json({ success: true });
    }

    const queryOr: any[] = [];
    if (userId) queryOr.push({ userId });
    if (userEmail) queryOr.push({ userEmail });

    await RegistrationDraft.deleteMany({
      $or: queryOr
    });

    return res.status(200).json({ message: 'Draft deleted successfully.' });
  } catch (error: any) {
    console.error('Delete draft error:', error);
    return res.status(500).json({ message: 'Failed to delete draft.', error: error.message });
  }
};
