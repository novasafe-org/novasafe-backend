import { Router, Request, Response } from 'express';
import { addItem, deleteItem, getItems, getItem, updateItem, trackItemAccess, downloadAttachment, viewAttachment } from '../controllers/Vault';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';
import { validateVaultItem, validateVaultItemUpdate } from '../middlewares/vaultItemValidation';
import { uploadAttachments } from '../middlewares/upload';
import { multerErrorHandler } from '../middlewares/multerErrorHandler';

const router = Router();

/**
 * ALL VAULT ROUTES ARE PROTECTED
 * Users must be authenticated to access their vault items
 * 
 * IMPORTANT: All items must be in encrypted format (zero-knowledge architecture)
 * Validation middleware ensures encrypted_data and iv are present
 */

// Get all vault items for authenticated user
router.get('/getAll', authMiddleware, loadRBACContext, requirePermission(Permission.ITEM_READ), getItems);

// Get single vault item by ID (including shared items)
router.get('/:id/getItem', authMiddleware, loadRBACContext, requirePermission(Permission.ITEM_READ), getItem);

// Add new vault item (linked to authenticated user)
// Validates encrypted format before processing
// Supports file uploads via multipart/form-data
// multerErrorHandler must come after uploadAttachments to catch Multer errors
router.post('/addItem', authMiddleware, loadRBACContext, requirePermission(Permission.ITEM_CREATE), uploadAttachments, multerErrorHandler, validateVaultItem, addItem);

// Update vault item (only owner can update)
// Validates encrypted format for updates
router.put('/:id/updateItem', authMiddleware, loadRBACContext, requirePermission(Permission.ITEM_UPDATE), validateVaultItemUpdate, updateItem);

// Delete vault item (only owner can delete)
router.delete('/:id/deleteItem', authMiddleware, loadRBACContext, requirePermission(Permission.ITEM_DELETE), deleteItem);

// Track item access (for analytics and "most used" sorting)
router.post('/:id/trackAccess', authMiddleware, trackItemAccess);

// Download file attachment
router.get('/:itemId/attachments/:attachmentId/download', authMiddleware, downloadAttachment);

// View file attachment (inline)
router.get('/:itemId/attachments/:attachmentId/view', authMiddleware, viewAttachment);

export default router;