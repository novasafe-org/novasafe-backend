# 🔐 Google OAuth + JWT Authentication Setup Guide

This guide explains how to set up and use Google OAuth authentication with JWT session management in your Vault backend.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setup Instructions](#setup-instructions)
3. [Environment Variables](#environment-variables)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Security Best Practices](#security-best-practices)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### Authentication Flow

```
1. User clicks "Sign in with Google" in React frontend
   ↓
2. Google OAuth popup appears, user signs in
   ↓
3. Frontend receives Google credential (ID token)
   ↓
4. Frontend sends credential to POST /auth/google
   ↓
5. Backend verifies token with Google servers
   ↓
6. Backend creates/retrieves user from MongoDB
   ↓
7. Backend generates JWT session token
   ↓
8. Frontend stores JWT token
   ↓
9. Frontend includes JWT in Authorization header for protected requests
```

### Components

- **Google OAuth2Client**: Verifies Google ID tokens
- **JWT (jsonwebtoken)**: Issues session tokens for your app
- **MongoDB**: Stores user information
- **Auth Middleware**: Protects routes requiring authentication

---

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
cd services/vault
pnpm install
# or
npm install
```

New dependencies added:
- `google-auth-library`: Google OAuth verification
- `jsonwebtoken`: JWT token generation/verification
- `@types/jsonwebtoken`: TypeScript types

### 2. Configure Google OAuth

#### A. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google+ API** (or Google Identity API)

#### B. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose **Web application**
4. Configure:
   - **Authorized JavaScript origins**: 
     - `http://localhost:5173` (or your frontend dev URL)
     - `https://yourdomain.com` (production)
   - **Authorized redirect URIs**: (not needed for credential flow)
5. Copy the **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)

### 3. Set Environment Variables

Create a `.env` file in `services/vault/`:

```bash
cp env.example .env
```

Edit `.env` and set these values:

```env
# Server
PORT=5001

# Google OAuth
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long

# Database
VAULT_DB_NAME=vault
```

**Generate a strong JWT secret:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -base64 64
```

### 4. Start the Server

```bash
pnpm dev
# or
npm run dev
```

The server will run on `http://localhost:5001`

---

## 🌐 API Endpoints

### 1. POST /auth/google

Authenticate user with Google OAuth credential.

**Request:**
```http
POST http://localhost:5001/auth/google
Content-Type: application/json

{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

**Response (Success):**
```json
{
  "message": "Authentication successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "googleId": "117200475532672775346",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "picture": "https://lh3.googleusercontent.com/...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "message": "Authentication failed",
  "error": "Google credential is required"
}
```

---

### 2. GET /auth/me

Get current authenticated user's information.

**Request:**
```http
GET http://localhost:5001/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (Success):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "googleId": "117200475532672775346",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "picture": "https://lh3.googleusercontent.com/...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "message": "Invalid or expired token",
  "error": "Token has expired"
}
```

---

### 3. POST /auth/logout

Logout current user.

**Request:**
```http
POST http://localhost:5001/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (Success):**
```json
{
  "message": "Logout successful",
  "note": "Please remove the JWT token from client-side storage"
}
```

---

## 💻 Frontend Integration

### 1. Install Frontend Dependencies

```bash
npm install @react-oauth/google
```

### 2. Setup Google OAuth Provider

**In your React app's main file (e.g., `App.tsx` or `main.tsx`):**

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {/* Your app components */}
    </GoogleOAuthProvider>
  );
}
```

### 3. Create Login Component

```tsx
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useState } from 'react';

function Login() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    try {
      const response = await fetch('http://localhost:5001/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: credentialResponse.credential,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store token securely
        localStorage.setItem('authToken', data.token);
        setToken(data.token);
        setUser(data.user);
        console.log('Login successful:', data.user);
      } else {
        console.error('Login failed:', data.error);
      }
    } catch (error) {
      console.error('Error during login:', error);
    }
  };

  const handleLogout = async () => {
    const authToken = localStorage.getItem('authToken');
    
    try {
      await fetch('http://localhost:5001/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Clear token and user
    localStorage.removeItem('authToken');
    setToken(null);
    setUser(null);
  };

  return (
    <div>
      {!user ? (
        <GoogleLogin
          onSuccess={handleGoogleLogin}
          onError={() => console.log('Login Failed')}
        />
      ) : (
        <div>
          <h2>Welcome, {user.name}!</h2>
          <img src={user.picture} alt={user.name} />
          <button onClick={handleLogout}>Logout</button>
        </div>
      )}
    </div>
  );
}

export default Login;
```

### 4. Making Authenticated Requests

```tsx
const fetchProtectedData = async () => {
  const token = localStorage.getItem('authToken');

  try {
    const response = await fetch('http://localhost:5001/v/items', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Protected data:', data);
    } else if (response.status === 401) {
      // Token expired or invalid - redirect to login
      console.error('Authentication failed');
      localStorage.removeItem('authToken');
      // Redirect to login page
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};
```

### 5. Create API Helper (Recommended)

```tsx
// api/client.ts
const API_BASE_URL = 'http://localhost:5001';

export class ApiClient {
  private getAuthHeader() {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    return response;
  }

  async get(endpoint: string) {
    const response = await this.request(endpoint);
    return response.json();
  }

  async post(endpoint: string, data: any) {
    const response = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  }
}

export const apiClient = new ApiClient();
```

**Usage:**

```tsx
import { apiClient } from './api/client';

// Login
const loginWithGoogle = async (credential: string) => {
  return apiClient.post('/auth/google', { credential });
};

// Get current user
const getCurrentUser = async () => {
  return apiClient.get('/auth/me');
};

// Get vault items
const getVaultItems = async () => {
  return apiClient.get('/v/items');
};
```

---

## 🔒 Security Best Practices

### Backend Security

1. **Use HTTPS in Production**
   - Never send tokens over HTTP
   - Configure SSL/TLS certificates

2. **Secure JWT_SECRET**
   - Use a strong, random secret (64+ characters)
   - Never commit to version control
   - Rotate periodically
   - Use different secrets for different environments

3. **Token Expiration**
   - Tokens expire in 7 days by default
   - Consider shorter expiration for sensitive apps
   - Implement refresh tokens for better UX

4. **Verify Google Tokens**
   - Always verify `audience` matches your Client ID
   - Never trust tokens without verification

5. **Database Security**
   - Move MongoDB URI to environment variables
   - Use strong passwords
   - Enable IP whitelisting
   - Use MongoDB Atlas for managed security

6. **Rate Limiting**
   - Implement rate limiting on auth endpoints
   - Prevent brute force attacks

### Frontend Security

1. **Token Storage**
   - **For maximum security**: Use memory (state) or httpOnly cookies
   - **For convenience**: Use localStorage (acceptable for most apps)
   - **Never**: Store in URL parameters or visible HTML

2. **XSS Protection**
   - Sanitize user inputs
   - Use React's built-in XSS protection
   - Set Content-Security-Policy headers

3. **CORS Configuration**
   - In production, restrict CORS to your frontend domain
   - Never use `*` in production

4. **Token Validation**
   - Check token expiration before requests
   - Handle 401 errors gracefully
   - Redirect to login when unauthorized

---

## 🧪 Testing

### Manual Testing with cURL

**1. Login with Google:**

First, get a Google credential from your frontend, then:

```bash
curl -X POST http://localhost:5001/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential":"YOUR_GOOGLE_CREDENTIAL_HERE"}'
```

**2. Get Current User:**

```bash
curl -X GET http://localhost:5001/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

**3. Logout:**

```bash
curl -X POST http://localhost:5001/auth/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### Testing with Postman

1. **POST /auth/google**
   - Method: POST
   - URL: `http://localhost:5001/auth/google`
   - Body (JSON):
     ```json
     {
       "credential": "YOUR_GOOGLE_CREDENTIAL"
     }
     ```
   - Copy the `token` from the response

2. **GET /auth/me**
   - Method: GET
   - URL: `http://localhost:5001/auth/me`
   - Headers:
     - Key: `Authorization`
     - Value: `Bearer YOUR_JWT_TOKEN`

---

## 🔧 Troubleshooting

### Common Issues

#### 1. "GOOGLE_CLIENT_ID environment variable is not configured"

**Solution:** 
- Create a `.env` file in `services/vault/`
- Add: `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`
- Restart the server

---

#### 2. "JWT_SECRET environment variable is not configured"

**Solution:**
- Add to `.env`: `JWT_SECRET=your-strong-secret-key-here`
- Generate a strong secret (see setup instructions)
- Restart the server

---

#### 3. "Invalid Google token" or "Token verification failed"

**Causes:**
- Token expired (Google tokens expire quickly)
- Wrong GOOGLE_CLIENT_ID
- Token from different Google project

**Solution:**
- Ensure GOOGLE_CLIENT_ID matches your Google Cloud Console
- Get a fresh credential from the frontend
- Verify authorized origins in Google Console

---

#### 4. "CORS Error" in Frontend

**Solution:**
- Backend CORS is configured for `*` in development
- For production, update CORS in `server.ts`:
  ```typescript
  res.header('Access-Control-Allow-Origin', 'https://yourdomain.com');
  ```

---

#### 5. "401 Unauthorized" on Protected Routes

**Causes:**
- Token expired (7 days)
- Token not included in request
- Wrong Authorization header format

**Solution:**
- Check token is in localStorage
- Ensure header format: `Authorization: Bearer <token>`
- Login again to get fresh token

---

#### 6. MongoDB Connection Issues

**Solution:**
- Check MongoDB URI in `config/config.ts`
- Verify network access in MongoDB Atlas
- Check credentials are correct

---

## 📚 Additional Resources

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [JWT.io](https://jwt.io/) - Decode and verify JWT tokens
- [@react-oauth/google Documentation](https://www.npmjs.com/package/@react-oauth/google)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 🎯 Next Steps

1. **Implement Refresh Tokens**: For better security and UX
2. **Add Token Blacklist**: Using Redis for logout invalidation
3. **Multi-Factor Authentication**: Add extra security layer
4. **Social Logins**: Add Facebook, GitHub, etc.
5. **Email Verification**: Verify email addresses
6. **Password Reset**: For users with email/password auth

---

## 📝 Notes

- This implementation uses Google OAuth for authentication
- JWTs are stateless - logout is client-side only
- For production, consider implementing refresh tokens
- Always use HTTPS in production
- Keep your JWT_SECRET secure and rotate it periodically

---

**Happy Coding! 🚀**

