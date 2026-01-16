# 🚀 Quick Start - Google OAuth Authentication

Get your Google OAuth authentication up and running in 5 minutes!

---

## Step 1: Get Google Client ID (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Click "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client ID"
5. Choose "Web application"
6. Add authorized origins:
   - `http://localhost:5173` (or your frontend URL)
7. Click "Create" and copy the **Client ID**

---

## Step 2: Configure Backend (1 minute)

Create `.env` file in `services/vault/`:

```bash
PORT=3123
GOOGLE_CLIENT_ID=paste-your-client-id-here.apps.googleusercontent.com
JWT_SECRET=generate-a-random-secret-at-least-32-characters-long
VAULT_DB_NAME=vault
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Step 3: Install & Start Backend (1 minute)

```bash
cd services/vault
pnpm install
pnpm dev
```

Server will run on `http://localhost:3123`

---

## Step 4: Setup Frontend (2 minutes)

### Install Package

```bash
npm install @react-oauth/google
```

### Wrap App with Provider

In your `App.tsx` or `main.tsx`:

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

### Create Login Component

```tsx
import { GoogleLogin } from '@react-oauth/google';

function Login() {
  const handleLogin = async (credentialResponse) => {
    const response = await fetch('http://localhost:3123/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credentialResponse.credential })
    });

    const data = await response.json();
    if (response.ok) {
      localStorage.setItem('authToken', data.token);
      console.log('Logged in:', data.user);
      // Redirect to dashboard or update UI
    }
  };

  return <GoogleLogin onSuccess={handleLogin} />;
}
```

---

## Step 5: Make Authenticated Requests

```tsx
const token = localStorage.getItem('authToken');

const response = await fetch('http://localhost:3123/v/getAll', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## ✅ Test It!

1. Click "Sign in with Google" in your frontend
2. Google popup appears, sign in
3. You're authenticated! 🎉
4. Token is stored in localStorage
5. All subsequent requests include the token

---

## 🎯 Available Endpoints

### Public
- `POST /auth/google` - Login/signup

### Protected (require JWT token)
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout
- `GET /v/getAll` - Get vault items (can be protected)
- `POST /v/addItem` - Add vault item (can be protected)

---

## 🔒 Protect Your Vault Routes (Optional)

To require authentication for vault routes:

```typescript
// In src/routes/vaultRoute.ts
import { authMiddleware } from '../middlewares/auth';

// Add this line to protect all routes
router.use(authMiddleware);
```

---

## 📚 Need More Details?

- **Setup Guide**: See `AUTHENTICATION_SETUP.md`
- **Implementation Details**: See `GOOGLE_AUTH_IMPLEMENTATION.md`
- **Troubleshooting**: Check the guides above

---

## 🆘 Common Issues

**"GOOGLE_CLIENT_ID not configured"**
→ Add `GOOGLE_CLIENT_ID` to `.env`

**"JWT_SECRET not configured"**
→ Add `JWT_SECRET` to `.env` (generate random string)

**"Invalid Google token"**
→ Check Client ID is correct and matches Google Console

**"CORS error"**
→ Already configured! Should work with any origin in dev mode

---

**That's it! You're ready to go! 🚀**

