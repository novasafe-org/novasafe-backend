import { Router, Request, Response } from 'express';
import { addItem, deleteItem, getItems, updateItem } from '../controllers/Vault';
import { validateAddMiddleware } from '../middlewares/operations/validateAddMiddleware';
import { authMiddleware } from '../middlewares/auth';

/**
 * Protected Vault Routes Example
 * 
 * This file shows how to protect your vault routes with authentication.
 * 
 * OPTION 1: Protect all routes at once
 * Apply authMiddleware to the entire router, so all routes require authentication
 */

const router = Router();

// Protect ALL routes - every route below requires authentication
router.use(authMiddleware);

router.get('/getAll', getItems);
router.post('/addItem', addItem);
router.put('/:id/updateItem', updateItem);
router.delete('/:id/deleteItem', deleteItem);

export default router;

/**
 * OPTION 2: Protect individual routes
 * Apply authMiddleware only to specific routes
 * 
 * Example:
 * 
 * const router = Router();
 * 
 * // Public route - no authentication required
 * router.get('/public', getPublicItems);
 * 
 * // Protected routes - authentication required
 * router.get('/getAll', authMiddleware, getItems);
 * router.post('/addItem', authMiddleware, addItem);
 * router.put('/:id/updateItem', authMiddleware, updateItem);
 * router.delete('/:id/deleteItem', authMiddleware, deleteItem);
 * 
 * export default router;
 */

/**
 * USAGE:
 * 
 * Once routes are protected, the frontend must include the JWT token:
 * 
 * ```typescript
 * const token = localStorage.getItem('authToken');
 * 
 * const response = await fetch('http://localhost:3123/v/getAll', {
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'Content-Type': 'application/json'
 *   }
 * });
 * ```
 * 
 * The authMiddleware will:
 * 1. Extract and verify the JWT token
 * 2. Attach user info to req.user
 * 3. Allow the request to proceed if valid
 * 4. Return 401 if token is invalid/expired
 * 
 * Inside your controller, you can access the authenticated user:
 * 
 * ```typescript
 * export const getItems = async (req: Request, res: Response) => {
 *   const userId = req.user?.id;  // User ID from JWT
 *   const userEmail = req.user?.email;  // User email from JWT
 *   
 *   // Now you can filter items by user, etc.
 *   const items = await db.findMany(collection.vaultItems, { 
 *     userId: userId,  // Only get items for this user
 *     deleted: { $ne: true } 
 *   });
 *   
 *   res.status(200).json({ items });
 * };
 * ```
 */

