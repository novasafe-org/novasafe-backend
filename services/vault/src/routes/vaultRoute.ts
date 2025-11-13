import { Router, Request, Response } from 'express';
import { addItem, deleteItem, getItems, getItem, updateItem, trackItemAccess } from '../controllers/Vault';
import { authMiddleware } from '../middlewares/auth';
import { validateVaultItem, validateVaultItemUpdate } from '../middlewares/vaultItemValidation';

const router = Router();

/**
 * ALL VAULT ROUTES ARE PROTECTED
 * Users must be authenticated to access their vault items
 * 
 * IMPORTANT: All items must be in encrypted format (zero-knowledge architecture)
 * Validation middleware ensures encrypted_data and iv are present
 */

// Get all vault items for authenticated user
router.get('/getAll', authMiddleware, getItems);

// Get single vault item by ID (including shared items)
router.get('/:id/getItem', authMiddleware, getItem);

// Add new vault item (linked to authenticated user)
// Validates encrypted format before processing
router.post('/addItem', authMiddleware, validateVaultItem, addItem);

// Update vault item (only owner can update)
// Validates encrypted format for updates
router.put('/:id/updateItem', authMiddleware, validateVaultItemUpdate, updateItem);

// Delete vault item (only owner can delete)
router.delete('/:id/deleteItem', authMiddleware, deleteItem);

// Track item access (for analytics and "most used" sorting)
router.post('/:id/trackAccess', authMiddleware, trackItemAccess);

export default router;