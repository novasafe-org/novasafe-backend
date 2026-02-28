# Quick Start: Add Item to Database

## Files Created

1. **`sample-add-item-request.json`** - Simple ready-to-use example
2. **`SAMPLE_ADD_ITEM_REQUESTS.json`** - 10 comprehensive examples for all categories
3. **`validate-request.js`** - Validation script to check your request before sending
4. **`ADD_ITEM_TROUBLESHOOTING.md`** - Detailed troubleshooting guide

## Quick Usage

### 1. Validate Your Request

```bash
node validate-request.js sample-add-item-request.json
```

### 2. Send Request with cURL

```bash
curl -X POST http://localhost:5001/v/addItem \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d @sample-add-item-request.json
```

### 3. Send Request with Postman

1. Import the collection: `NovaSafe_API_Collection.postman_collection.json`
2. Use the "Add Item" request
3. Copy the body from `sample-add-item-request.json`

## Sample Request Body

```json
{
  "title": "Gmail Account",
  "category": "password",
  "encrypted_data": "dGhpc2lzYW5leGFtcGxlZW5jcnlwdGVkZGF0YWZvcnRlc3Rpbmc=",
  "iv": "bNe69t3qfZRSGYhW",
  "field_count": 3,
  "attachment_count": 0,
  "folderId": null,
  "tags": ["email", "google"],
  "isFavorite": false
}
```

## Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `encrypted_data` | string | Base64 encoded AES-256-GCM ciphertext | `"dGhpc2lzYW5leGFtcGxl..."` |
| `iv` | string | Base64 encoded 12-byte IV (16 chars) | `"bNe69t3qfZRSGYhW"` |
| `category` | string | Item category | `"password"` |
| `field_count` | number | Number of encrypted fields | `3` |
| `attachment_count` | number | Number of attachments | `0` |

## Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `title` | string | Item title | `"Gmail Account"` |
| `folderId` | string \| null | Folder ID or null | `null` |
| `tags` | string[] | Array of tags | `["email", "google"]` |
| `isFavorite` | boolean | Favorite flag | `false` |

## Valid Categories

- `password` - Passwords and login credentials
- `personal-id` - ID cards, passports, licenses
- `property` - Property documents
- `financial` - Credit cards, bank accounts
- `medical` - Medical records, insurance
- `photos` - Photo collections
- `notes` - Secure notes
- `misc` - Miscellaneous items

## Generating Valid IVs

**Node.js:**
```javascript
const crypto = require('crypto');
const iv = crypto.randomBytes(12).toString('base64');
console.log(iv); // e.g., "bNe69t3qfZRSGYhW"
```

**Browser:**
```javascript
const ivArray = crypto.getRandomValues(new Uint8Array(12));
const iv = btoa(String.fromCharCode(...ivArray));
console.log(iv);
```

## Common Issues

### ❌ "Missing required field: encrypted_data"
- Ensure `encrypted_data` is present and is a non-empty string
- Check field name spelling (must be `encrypted_data` with underscore)

### ❌ "Invalid IV length"
- IV must decode to exactly 12 bytes
- A 12-byte IV is exactly 16 base64 characters (no padding)
- Use the validation script to check: `node validate-request.js your-file.json`

### ❌ "Missing or invalid field: category"
- Category must be a non-empty string
- Use one of the valid categories listed above

## Testing Checklist

- [ ] Run validation script: `node validate-request.js sample-add-item-request.json`
- [ ] Verify all required fields are present
- [ ] Verify IV is exactly 12 bytes (16 base64 chars)
- [ ] Verify encrypted_data is valid base64
- [ ] Verify category is valid
- [ ] Verify field_count and attachment_count are numbers >= 0
- [ ] Test with cURL or Postman
- [ ] Check response for success (201 status)

## Example: Adding Multiple Items

You can use the examples from `SAMPLE_ADD_ITEM_REQUESTS.json`:

```bash
# Extract individual examples
cat SAMPLE_ADD_ITEM_REQUESTS.json | jq '.examples[0].request' > item1.json
cat SAMPLE_ADD_ITEM_REQUESTS.json | jq '.examples[1].request' > item2.json

# Validate each
node validate-request.js item1.json
node validate-request.js item2.json

# Send each
curl -X POST http://localhost:5001/v/addItem \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d @item1.json
```

## Next Steps

1. Replace `encrypted_data` with your actual encrypted data
2. Generate new IVs for each item
3. Use the validation script before sending
4. Test with your authentication token
5. Check the database to verify items were created

