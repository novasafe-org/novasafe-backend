# Add Item Request Troubleshooting Guide

## Common Errors and Solutions

### Error: "Missing required field: encrypted_data"

**Possible Causes:**
1. The `encrypted_data` field is missing from the request body
2. The `encrypted_data` field is `null` or `undefined`
3. The `encrypted_data` field is an empty string `""`
4. The field name is misspelled (e.g., `encryptedData` instead of `encrypted_data`)

**Solution:**
- Ensure `encrypted_data` is present in the JSON body
- Ensure it's a non-empty string
- Use the exact field name: `encrypted_data` (with underscore, not camelCase)

**Example of CORRECT request:**
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

**Example of INCORRECT request (missing encrypted_data):**
```json
{
  "title": "Gmail Account",
  "category": "password",
  "iv": "bNe69t3qfZRSGYhW",
  "field_count": 3,
  "attachment_count": 0
}
```

### Error: "Invalid IV length"

**Possible Causes:**
1. IV is not exactly 12 bytes when base64 decoded
2. IV contains invalid base64 characters
3. IV is missing padding or has incorrect padding

**Solution:**
- Generate a 12-byte IV using: `crypto.randomBytes(12).toString('base64')`
- A 12-byte IV will be exactly 16 base64 characters (no padding needed)
- Ensure the IV is valid base64

**Valid IV Example:**
- `bNe69t3qfZRSGYhW` (16 characters, decodes to 12 bytes) ✓

**Invalid IV Examples:**
- `YWJjZGVmZ2hpams=` (11 bytes when decoded) ✗
- `MTIzNDU2Nzg5MGFi` (11 bytes when decoded) ✗

### Error: "Missing or invalid field: category"

**Solution:**
- Ensure `category` is a non-empty string
- Valid categories: `password`, `personal-id`, `property`, `financial`, `medical`, `photos`, `notes`, `misc`

### Error: "Missing or invalid field: field_count"

**Solution:**
- Ensure `field_count` is a number (not a string)
- Must be >= 0
- If using FormData, convert string to number: `parseInt(field_count, 10)`

### Error: "Missing or invalid field: attachment_count"

**Solution:**
- Ensure `attachment_count` is a number (not a string)
- Must be >= 0
- If uploading files via multipart/form-data, this should match the number of files

## Testing with cURL

```bash
curl -X POST http://localhost:3123/v/addItem \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "title": "Gmail Account",
    "category": "password",
    "encrypted_data": "dGhpc2lzYW5leGFtcGxlZW5jcnlwdGVkZGF0YWZvcnRlc3Rpbmc=",
    "iv": "bNe69t3qfZRSGYhW",
    "field_count": 3,
    "attachment_count": 0,
    "folderId": null,
    "tags": ["email", "google"],
    "isFavorite": false
  }'
```

## Testing with Postman

1. Set method to `POST`
2. URL: `http://localhost:3123/v/addItem`
3. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer YOUR_JWT_TOKEN`
4. Body (raw JSON):
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

## Required vs Optional Fields

### Required Fields:
- ✅ `encrypted_data` (string, non-empty)
- ✅ `iv` (string, 12 bytes when decoded)
- ✅ `category` (string, non-empty)
- ✅ `field_count` (number >= 0)
- ✅ `attachment_count` (number >= 0)

### Optional Fields:
- `title` (string)
- `folderId` (string | null)
- `tags` (array of strings)
- `isFavorite` (boolean)

## Generating Valid IVs

**Node.js:**
```javascript
const crypto = require('crypto');
const iv = crypto.randomBytes(12).toString('base64');
console.log(iv); // e.g., "bNe69t3qfZRSGYhW"
```

**Browser (JavaScript):**
```javascript
const ivArray = crypto.getRandomValues(new Uint8Array(12));
const iv = btoa(String.fromCharCode(...ivArray));
console.log(iv); // e.g., "bNe69t3qfZRSGYhW"
```

## Validating Request Before Sending

**Node.js validation script:**
```javascript
const request = {
  title: "Gmail Account",
  category: "password",
  encrypted_data: "dGhpc2lzYW5leGFtcGxlZW5jcnlwdGVkZGF0YWZvcnRlc3Rpbmc=",
  iv: "bNe69t3qfZRSGYhW",
  field_count: 3,
  attachment_count: 0,
  folderId: null,
  tags: ["email", "google"],
  isFavorite: false
};

// Validate encrypted_data
if (!request.encrypted_data || typeof request.encrypted_data !== 'string' || request.encrypted_data.length === 0) {
  console.error('❌ encrypted_data is missing or invalid');
} else {
  console.log('✅ encrypted_data is valid');
}

// Validate IV
try {
  const ivBuffer = Buffer.from(request.iv, 'base64');
  if (ivBuffer.length !== 12) {
    console.error(`❌ IV is ${ivBuffer.length} bytes, expected 12`);
  } else {
    console.log('✅ IV is valid (12 bytes)');
  }
} catch (e) {
  console.error('❌ IV is not valid base64');
}

// Validate category
if (!request.category || typeof request.category !== 'string') {
  console.error('❌ category is missing or invalid');
} else {
  console.log('✅ category is valid');
}

// Validate field_count
if (typeof request.field_count !== 'number' || request.field_count < 0) {
  console.error('❌ field_count is invalid');
} else {
  console.log('✅ field_count is valid');
}

// Validate attachment_count
if (typeof request.attachment_count !== 'number' || request.attachment_count < 0) {
  console.error('❌ attachment_count is invalid');
} else {
  console.log('✅ attachment_count is valid');
}
```

