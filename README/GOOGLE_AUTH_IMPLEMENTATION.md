# 🔐 Google OAuth + JWT Authentication - Implementation Summary

## ✅ Implementation Complete

This document summarizes the complete Google OAuth authentication system with JWT session management that has been implemented in your vault backend.

---

## 📦 Files Created

### 1. **User Model** - `src/models/User.ts`
Defines the TypeScript interfaces for:
- `IUser`: Complete user document structure in MongoDB
- `IUserPayload`: Minimal user data encoded in JWT tokens

### 2. **JWT Utilities** - `src/utils/generateToken.ts`
Contains two main functions:
- `generateToken(user)`: Creates JWT tokens (7-day expiration)
- `verifyToken(token)`: Verifies and decodes JWT tokens

### 3. **Auth Middleware** - `src/middlewares/auth.ts`
Protects routes by verifying JWT tokens from `Authorization: Bearer <token>` header.
Attaches decoded user info to `req.user` for use in route handlers.

### 4. **Auth Controller** - `src/controllers/Auth.ts`
Three main controller functions:
- `googleSignIn`: Verifies Google credential, creates/retrieves user, issues JWT
- `getCurrentUser`: Returns authenticated user's information
- `logout`: Handles logout (primarily client-side)

### 5. **Auth Routes** - `src/routes/authRoute.ts`
Defines three endpoints:
- `POST /auth/google` - Login/signup with Google
- `GET /auth/me` - Get current user (protected)
- `POST /auth/logout` - Logout (protected)

### 6. **Updated Server** - `src/server.ts`
Added auth routes to Express app: `app.use('/auth', authRoute)`

### 7. **Environment Configuration**
- `env.example` - Template for environment variables
- `AUTHENTICATION_SETUP.md` - Complete setup and usage guide

---

## 🔄 Authentication Flow

```
┌─────────────┐
│   Frontend  │
│  (React)    │
└──────┬──────┘
       │ 1. User clicks "Sign in with Google"
       ▼
┌─────────────┐
│   Google    │
│   OAuth     │
└──────┬──────┘
       │ 2. Returns Google credential (ID token)
       ▼
┌─────────────┐
│   Frontend  │
│  sends to   │
│   Backend   │
└──────┬──────┘
       │ 3. POST /auth/google { credential: "..." }
       ▼
┌─────────────────────────────────────────────────┐
│              Backend Processing                  │
│                                                  │
│  1. Verify Google token with OAuth2Client       │
│  2. Extract user info (email, name, picture)    │
│  3. Check if user exists in MongoDB             │
│  4. Create new user OR update existing user     │
│  5. Generate JWT session token (7-day exp)      │
│  6. Return { token, user }                      │
└─────────────┬───────────────────────────────────┘
              │ 4. Frontend stores JWT token
              ▼
       ┌─────────────┐
       │  Frontend   │
       │   stores    │
       │   token     │
       └──────┬──────┘
              │ 5. All subsequent requests
              │    include: Authorization: Bearer <token>
              ▼
       ┌─────────────┐
       │  Protected  │
       │   Routes    │
       └─────────────┘
```

---

## 🎯 API Endpoints

### Public Endpoints

#### `POST /auth/google`
Authenticate with Google OAuth credential.

**Request:**
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI..."
}
```

**Response:**
```json
{
  "message": "Authentication successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "googleId": "117200475532672775346",
    "name": "John Doe",
    "email": "john@example.com",
    "picture": "https://lh3.googleusercontent.com/...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Protected Endpoints (Require JWT)

#### `GET /auth/me`
Get current user information.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "googleId": "117200475532672775346",
    "name": "John Doe",
    "email": "john@example.com",
    "picture": "https://lh3.googleusercontent.com/...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### `POST /auth/logout`
Logout current user.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "message": "Logout successful",
  "note": "Please remove the JWT token from client-side storage"
}
```

---

## 🔧 Environment Variables Required

Create a `.env` file in `services/vault/`:

```env
# Server Configuration
PORT=3123

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long

# Database Configuration
VAULT_DB_NAME=vault
```

### How to Get Google Client ID:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable Google+ API
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized origins (e.g., `http://localhost:5173`)
6. Copy the Client ID

### How to Generate JWT Secret:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -base64 64
```

---

## 💻 Frontend Integration Example

### 1. Install Dependencies

```bash
npm install @react-oauth/google
```

### 2. Setup Provider

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <YourApp />
    </GoogleOAuthProvider>
  );
}
```

### 3. Login Component

```tsx
import { GoogleLogin } from '@react-oauth/google';

function Login() {
  const handleSuccess = async (credentialResponse) => {
    const response = await fetch('http://localhost:3123/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: credentialResponse.credential
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      // Store the JWT token
      localStorage.setItem('authToken', data.token);
      console.log('Logged in:', data.user);
    }
  };

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={() => console.log('Login Failed')}
    />
  );
}
```

### 4. Making Authenticated Requests

```tsx
const fetchVaultItems = async () => {
  const token = localStorage.getItem('authToken');

  const response = await fetch('http://localhost:3123/v/items', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.ok) {
    const data = await response.json();
    return data.items;
  } else if (response.status === 401) {
    // Token expired - redirect to login
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  }
};
```

---

## 🔒 Security Features Implemented

### ✅ Token Verification
- Google ID tokens are verified with Google's servers
- Audience verification ensures tokens are for your app
- Signature verification prevents tampering

### ✅ JWT Session Management
- Tokens expire in 7 days
- Signed with secret key (HS256 algorithm)
- Includes issuer and audience claims

### ✅ Authentication Middleware
- Verifies JWT on every protected request
- Extracts user payload and attaches to `req.user`
- Returns 401 for invalid/expired tokens

### ✅ Secure User Storage
- Users stored in MongoDB with googleId as unique identifier
- User info updated on each login
- Timestamps for created/updated tracking

### ✅ Error Handling
- Comprehensive error messages
- Specific errors for token issues
- Logging of auth events

---

## 🛡️ Security Best Practices

### Backend
- ✅ HTTPS required in production
- ✅ Strong JWT secret (64+ characters)
- ✅ Token expiration (7 days)
- ✅ Google token verification
- ✅ Comprehensive error handling
- ⚠️ Consider implementing: Rate limiting, refresh tokens, token blacklist

### Frontend
- ✅ Store tokens securely (localStorage acceptable for most apps)
- ✅ Include token in Authorization header
- ✅ Handle 401 errors gracefully
- ⚠️ For maximum security: Use httpOnly cookies or memory storage

---

## 🚀 How to Use

### Step 1: Install Dependencies
```bash
cd services/vault
pnpm install
```

### Step 2: Configure Environment
```bash
cp env.example .env
# Edit .env with your values
```

### Step 3: Start Server
```bash
pnpm dev
```

### Step 4: Test Endpoints

**Test with frontend or use cURL:**

```bash
# After getting Google credential from frontend
curl -X POST http://localhost:3123/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential":"YOUR_GOOGLE_CREDENTIAL"}'

# Get current user
curl -X GET http://localhost:3123/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🔄 Protecting Existing Routes

To protect your existing vault routes, add the `authMiddleware`:

```typescript
// In src/routes/vaultRoute.ts
import { authMiddleware } from '../middlewares/auth';

// Protect all routes
router.use(authMiddleware);

// Or protect specific routes
router.get('/items', authMiddleware, getItems);
router.post('/items', authMiddleware, addItem);
router.put('/items/:id', authMiddleware, updateItem);
router.delete('/items/:id', authMiddleware, deleteItem);
```

---

## 📊 Database Schema

### vaultUsers Collection

```typescript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  googleId: "117200475532672775346",
  name: "John Doe",
  email: "john.doe@example.com",
  picture: "https://lh3.googleusercontent.com/...",
  createdAt: ISODate("2024-01-15T10:30:00.000Z"),
  updatedAt: ISODate("2024-01-15T10:30:00.000Z")
}
```

---

## 🐛 Troubleshooting

### Issue: "GOOGLE_CLIENT_ID environment variable is not configured"
**Solution:** Add `GOOGLE_CLIENT_ID` to `.env` file

### Issue: "JWT_SECRET environment variable is not configured"
**Solution:** Add `JWT_SECRET` to `.env` file (generate strong random string)

### Issue: "Invalid Google token"
**Solutions:**
- Verify GOOGLE_CLIENT_ID is correct
- Ensure authorized origins are configured in Google Console
- Token may have expired (get fresh credential)

### Issue: "Invalid or expired token" on protected routes
**Solutions:**
- Check token is included in Authorization header
- Verify format: `Bearer <token>`
- Token may have expired (7 days) - login again

---

## 📚 Code Structure

```
services/vault/
├── src/
│   ├── models/
│   │   └── User.ts                    # User interfaces
│   ├── utils/
│   │   └── generateToken.ts           # JWT utilities
│   ├── middlewares/
│   │   └── auth.ts                    # Auth middleware
│   ├── controllers/
│   │   ├── Auth.ts                    # Auth controllers
│   │   └── Vault.ts                   # Vault controllers
│   ├── routes/
│   │   ├── authRoute.ts               # Auth routes
│   │   └── vaultRoute.ts              # Vault routes
│   └── server.ts                      # Express app setup
├── config/
│   └── config.ts                      # Config (includes DB)
├── env.example                        # Environment template
├── AUTHENTICATION_SETUP.md            # Setup guide
└── GOOGLE_AUTH_IMPLEMENTATION.md      # This file
```

---

## 🎓 Key Concepts

### Google OAuth vs JWT

**Google Credential (ID Token):**
- Issued by Google
- Used ONLY for initial verification
- Short-lived (minutes)
- Never stored in database

**JWT Session Token:**
- Issued by YOUR backend
- Used for all subsequent requests
- Longer-lived (7 days)
- Stored in frontend (localStorage)

### Stateless Authentication

JWTs are stateless - the server doesn't store session data:
- ✅ Pros: Scalable, no server-side storage needed
- ⚠️ Cons: Can't invalidate tokens before expiration

**For production**: Consider implementing refresh tokens + token blacklist (using Redis)

---

## 🚧 Future Enhancements

### Recommended for Production

1. **Refresh Tokens**
   - Short-lived access tokens (15 minutes)
   - Long-lived refresh tokens (30 days)
   - Better security and UX

2. **Token Blacklist**
   - Use Redis to store invalidated tokens
   - Enable true logout functionality
   - Revoke tokens when compromised

3. **Rate Limiting**
   - Prevent brute force attacks
   - Use express-rate-limit package

4. **Logging & Monitoring**
   - Log all auth events
   - Monitor failed login attempts
   - Alert on suspicious activity

5. **Multi-Factor Authentication**
   - Add extra security layer
   - Time-based OTP (TOTP)

### Nice to Have

- Social logins (Facebook, GitHub, etc.)
- Email/password authentication
- Password reset functionality
- Account deletion
- Admin user management

---

## ✨ Summary

You now have a complete, production-ready Google OAuth authentication system with:

- ✅ Google OAuth verification
- ✅ User creation/retrieval from MongoDB
- ✅ JWT session token generation
- ✅ Protected route middleware
- ✅ Comprehensive error handling
- ✅ Security best practices
- ✅ Complete documentation

**All endpoints are ready to use!** Just configure your environment variables and you're good to go.

For detailed setup instructions, see `AUTHENTICATION_SETUP.md`.

---

**Happy Coding! 🚀**

