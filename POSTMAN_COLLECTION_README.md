# NovaSafe API Postman Collection

Complete Postman collection for testing all NovaSafe API endpoints.

## 📦 Files Included

1. **NovaSafe_API_Collection.postman_collection.json** - Main Postman collection with all API endpoints
2. **NovaSafe_API_Environment.postman_environment.json** - Postman environment file with variables
3. **POSTMAN_COLLECTION_README.md** - This file

## 🚀 Quick Start

### Step 1: Import Collection and Environment

1. Open Postman
2. Click **Import** button (top left)
3. Import both files:
   - `NovaSafe_API_Collection.postman_collection.json`
   - `NovaSafe_API_Environment.postman_environment.json`
4. Select the **NovaSafe API Environment** from the environment dropdown (top right)

### Step 2: Configure Environment Variables

The environment file includes these variables:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `base_url` | `http://localhost:3123` | API base URL |
| `auth_token` | (empty) | JWT token (auto-set after login) |
| `user_id` | (empty) | User ID (auto-set after login) |
| `item_id` | (empty) | Item ID (auto-set after creating item) |
| `folder_id` | (empty) | Folder ID (auto-set after creating folder) |
| `share_id` | (empty) | Share ID (auto-set after creating share) |
| `session_id` | (empty) | Session ID (for testing sessions) |

**Note:** You can modify `base_url` if your backend runs on a different port or host.

### Step 3: Authenticate

1. Go to **Authentication & Authorization** folder
2. Run **Google Sign-In** request
3. Replace `YOUR_GOOGLE_ID_TOKEN_HERE` with an actual Google ID token
4. The `auth_token` and `user_id` will be automatically saved to the environment

**Note:** For testing, you can use a valid Google ID token from your frontend OAuth flow, or use a test token if you have one.

### Step 4: Start Testing

Now you can test any endpoint! The collection is organized into folders:

- ✅ **Authentication & Authorization** - Login, logout, get user
- ✅ **Two-Factor Authentication (2FA)** - 2FA setup, enable, verify, disable
- ✅ **Session Management** - Get sessions, revoke sessions
- ✅ **Vault Items** - CRUD operations for vault items
- ✅ **Folders (Safes)** - CRUD operations for folders
- ✅ **Sharing** - Share items/folders, manage shares
- ✅ **Settings** - User settings, backup, restore

## 📋 Collection Structure

### Authentication & Authorization
- `POST /v/auth/google` - Google Sign-In
- `GET /v/auth/me` - Get Current User
- `POST /v/auth/logout` - Logout

### Two-Factor Authentication (2FA)
- `POST /v/auth/2fa/setup` - Setup 2FA
- `POST /v/auth/2fa/enable` - Enable 2FA
- `POST /v/auth/2fa/verify` - Verify 2FA
- `POST /v/auth/2fa/disable` - Disable 2FA
- `GET /v/auth/2fa/status` - Get 2FA Status
- `POST /v/auth/2fa/backup-codes` - Regenerate Backup Codes

### Session Management
- `GET /v/auth/sessions` - Get All Sessions
- `DELETE /v/auth/sessions/:sessionId` - Revoke Session
- `POST /v/auth/sessions/revoke-all` - Revoke All Other Sessions

### Vault Items
- `GET /v/getAll` - Get All Items (with optional query params)
- `GET /v/:id/getItem` - Get Single Item
- `POST /v/addItem` - Add Item (encrypted format)
- `PUT /v/:id/updateItem` - Update Item
- `DELETE /v/:id/deleteItem` - Delete Item
- `POST /v/:id/trackAccess` - Track Item Access

### Folders (Safes)
- `POST /v/folders/create` - Create Folder
- `GET /v/folders/list` - Get All Folders
- `GET /v/folders/frequent` - Get Frequent Folders
- `GET /v/folders/:id` - Get Folder by ID
- `PUT /v/folders/:id` - Update Folder
- `DELETE /v/folders/:id` - Delete Folder

### Sharing
- `POST /v/share/create` - Create Share
- `GET /v/share/list?type=received` - Get Received Shares
- `GET /v/share/list?type=sent` - Get Sent Shares
- `POST /v/share/revoke` - Revoke Share
- `PATCH /v/share/update` - Update Share Permission
- `GET /v/share/keys/public` - Get Public Key
- `POST /v/share/keys/public` - Save Public Key

### Settings
- `GET /v/api/settings` - Get Settings
- `POST /v/api/settings` - Create Settings
- `PATCH /v/api/settings` - Update Settings
- `DELETE /v/api/settings/reset` - Reset Settings
- `POST /v/api/settings/backup` - Backup Vault
- `POST /v/api/settings/restore` - Restore Vault

## 🔧 Features

### Automatic Variable Management

The collection includes **Test Scripts** that automatically save IDs to environment variables:

- **Google Sign-In**: Saves `auth_token` and `user_id`
- **Add Item**: Saves `item_id`
- **Create Folder**: Saves `folder_id`
- **Create Share**: Saves `share_id`

This means you can:
1. Create an item → `item_id` is automatically saved
2. Use `{{item_id}}` in subsequent requests (e.g., Get Single Item, Update Item)

### Environment Variables Usage

All requests use environment variables for:
- Base URL: `{{base_url}}`
- Authentication: `Bearer {{auth_token}}`
- Resource IDs: `{{item_id}}`, `{{folder_id}}`, `{{share_id}}`

### Request Examples

Each request includes:
- ✅ Proper HTTP method
- ✅ Required headers
- ✅ Example request body
- ✅ Description with field explanations
- ✅ Query parameters (where applicable)

## 📝 Important Notes

### Zero-Knowledge Encryption

**Vault Items** must be in encrypted format:
- `encrypted_data`: Base64 encoded AES-256-GCM ciphertext
- `iv`: Base64 encoded 12-byte initialization vector
- `field_count`: Number of encrypted fields

**Note:** For testing, you'll need to encrypt data client-side first. The Postman collection includes example structure, but you'll need actual encrypted data from your frontend.

### Sharing Endpoints

**Sharing** requires:
- `wrappedKey`: Item's AES key encrypted with recipient's RSA public key
- `wrappedKeyIV`: Base64 encoded IV (for compatibility)

**Note:** Key wrapping must be done client-side. The Postman collection includes example structure.

### Authentication

Most endpoints require JWT authentication:
```
Authorization: Bearer {{auth_token}}
```

The token is automatically included in all protected requests via the environment variable.

## 🧪 Testing Workflow

### Recommended Testing Order

1. **Authenticate**
   - Run "Google Sign-In" to get `auth_token`

2. **Get User Info**
   - Run "Get Current User" to verify authentication

3. **Create Resources**
   - Create a folder → `folder_id` saved
   - Create an item → `item_id` saved

4. **Test CRUD Operations**
   - Get all items
   - Get single item (uses `{{item_id}}`)
   - Update item (uses `{{item_id}}`)
   - Track item access (uses `{{item_id}}`)

5. **Test Sharing**
   - Get recipient's public key
   - Create share (uses `{{item_id}}` or `{{folder_id}}`)
   - Get received/sent shares
   - Update share permission
   - Revoke share

6. **Test Settings**
   - Get settings
   - Update settings
   - Backup vault
   - Restore vault

## 🔍 Troubleshooting

### "Unauthorized" Errors

- **Issue**: Token expired or invalid
- **Solution**: Run "Google Sign-In" again to get a new token

### "Item not found" Errors

- **Issue**: `item_id` not set or invalid
- **Solution**: Create an item first, or manually set `item_id` in environment

### "Missing required fields" Errors

- **Issue**: Request body missing required fields
- **Solution**: Check the request body example and ensure all required fields are present

### Environment Variables Not Updating

- **Issue**: Test scripts not running
- **Solution**: Ensure "Save responses" is enabled in Postman settings

## 📚 Additional Resources

- **API Documentation**: See `API_DOCUMENTATION.md` for detailed endpoint documentation
- **Zero-Knowledge Encryption**: See `ZERO_KNOWLEDGE_ENCRYPTION_FEATURE_DOC.md` for encryption details
- **Sharing Feature**: See `SHARING_AND_ACCESS_CONTROL_FEATURE_DOC.md` for sharing details

## 🎯 Tips

1. **Use Collection Runner**: Run multiple requests in sequence using Postman's Collection Runner
2. **Save Responses**: Enable "Save responses" to see response examples
3. **Use Pre-request Scripts**: Add custom logic before requests run
4. **Organize with Folders**: The collection is already organized, but you can create your own folders
5. **Export/Import**: Share the collection with your team

## 📞 Support

For issues or questions:
- Check the API documentation
- Review error messages in responses
- Verify environment variables are set correctly
- Ensure backend is running on the correct port

---

**Last Updated:** January 2024  
**Postman Version:** 10.0.0+  
**Collection Version:** 1.0

