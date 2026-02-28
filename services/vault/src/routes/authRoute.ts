import express from 'express';
import { googleSignIn, getCurrentUser, logout, emailLogin, unlockVault, forgotPassword, resetPassword, recoverAccount } from '../controllers/Auth';
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
 * const response = await fetch('http://localhost:5001/v/auth/google', {
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
 * @route   POST /v/auth/email
 * @desc    Authenticate user with email and password
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com",
 *   "password": "userpassword"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Authentication successful",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "createdAt": "2024-01-15T10:30:00.000Z"
 *   },
 *   "requires2FA": false
 * }
 */
router.post('/email', emailLogin);

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
 * const response = await fetch('http://localhost:5001/v/auth/me', {
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
 * await fetch('http://localhost:5001/v/auth/logout', {
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

/**
 * @route   POST /v/auth/unlock
 * @desc    Unlock vault after inactivity (password only, no 2FA required)
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com",
 *   "password": "userpassword"
 * }
 * 
 * RESPONSE:
 * {
 *   "message": "Vault unlocked successfully",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "user": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "createdAt": "2024-01-15T10:30:00.000Z"
 *   },
 *   "requires2FA": false
 * }
 */
router.post('/unlock', unlockVault);

/**
 * @route   POST /v/auth/forgot-password
 * @desc    Request password reset link
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "If an account exists, we've sent a password reset link to your email."
 * }
 */
router.post('/forgot-password', forgotPassword);

/**
 * @route   POST /v/auth/reset-password
 * @desc    Reset password using token from email
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "token": "reset_token_from_email",
 *   "password": "new_password"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Password has been reset successfully. All encrypted vault data has been permanently deleted."
 * }
 * 
 * NOTE: This endpoint permanently deletes all encrypted vault data.
 * This is a zero-knowledge system - data cannot be recovered without the password.
 */
router.post('/reset-password', resetPassword);

/**
 * @route   POST /v/auth/recover-account
 * @desc    Recover account using recovery key (restores encrypted data)
 * @access  Public
 * 
 * REQUEST BODY:
 * {
 *   "email": "user@example.com",
 *   "recoveryKey": "base64_encoded_recovery_key",
 *   "masterPassword": "base64_encoded_master_password" (optional, if encryptedData provided),
 *   "encryptedData": "base64_encoded_encrypted_data" (optional),
 *   "newPassword": "new_password"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Account recovered successfully. Your encrypted vault data has been restored.",
 *   "token": "jwt_token",
 *   "user": { ... }
 * }
 * 
 * NOTE: This endpoint RESTORES encrypted vault data instead of deleting it.
 * Use this if you have a recovery key file from account creation.
 */
router.post('/recover-account', recoverAccount);

export default router;

