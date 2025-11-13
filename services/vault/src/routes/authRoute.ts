import express from 'express';
import { googleSignIn, getCurrentUser, logout } from '../controllers/Auth';
import { authMiddleware } from '../middlewares/auth';

/**
 * Authentication Routes
 * 
 * These routes handle all authentication-related operations:
 * - Google OAuth sign-in/sign-up
 * - Getting current user information
 * - Logout
 * 
 * BASE PATH: /v/auth
 */

const router = express.Router();

/**
 * @route   POST /v/auth/google
 * @desc    Authenticate user with Google OAuth
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "credential": "eyJhbGciOiJSUzI1NiIs..." // Google ID token from frontend
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Authentication successful",
 *   "token": "eyJhbGciOiJIUzI1NiIs...", // Your app's JWT token
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "googleId": "117200475532672775346",
 *     "name": "John Doe",
 *     "email": "john.doe@example.com",
 *     "picture": "https://lh3.googleusercontent.com/...",
 *     "createdAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 * 
 * FRONTEND USAGE:
 * ```javascript
 * // After getting Google credential from @react-oauth/google
 * const response = await fetch('http://localhost:3123/v/auth/google', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ credential: googleCredential })
 * });
 * const data = await response.json();
 * // Store data.token securely (localStorage, sessionStorage, or memory)
 * localStorage.setItem('authToken', data.token);
 * ```
 */
router.post('/google', googleSignIn);

/**
 * @route   GET /v/auth/me
 * @desc    Get current authenticated user's information
 * @access  Protected (requires JWT token)
 * 
 * HEADERS:
 * {
 *   "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
 * }
 * 
 * RESPONSE:
 * {
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "googleId": "117200475532672775346",
 *     "name": "John Doe",
 *     "email": "john.doe@example.com",
 *     "picture": "https://lh3.googleusercontent.com/...",
 *     "createdAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 * 
 * FRONTEND USAGE:
 * ```javascript
 * const token = localStorage.getItem('authToken');
 * const response = await fetch('http://localhost:3123/v/auth/me', {
 *   headers: { 
 *     'Authorization': `Bearer ${token}` 
 *   }
 * });
 * const data = await response.json();
 * ```
 */
router.get('/me', authMiddleware, getCurrentUser);

/**
 * @route   POST /v/auth/logout
 * @desc    Logout current user
 * @access  Protected (requires JWT token)
 * 
 * HEADERS:
 * {
 *   "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Logout successful",
 *   "note": "Please remove the JWT token from client-side storage"
 * }
 * 
 * FRONTEND USAGE:
 * ```javascript
 * const token = localStorage.getItem('authToken');
 * await fetch('http://localhost:3123/v/auth/logout', {
 *   method: 'POST',
 *   headers: { 
 *     'Authorization': `Bearer ${token}` 
 *   }
 * });
 * // Remove token from storage
 * localStorage.removeItem('authToken');
 * // Redirect to login page
 * ```
 */
router.post('/logout', authMiddleware, logout);

export default router;

