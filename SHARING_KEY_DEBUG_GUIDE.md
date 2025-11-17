# Sharing Key Debugging Guide

## Issue: "error in DoCipher, status: 2" when unwrapping shared items

This error occurs when the React Native app tries to decrypt a wrapped key using RSA-OAEP, but the decryption fails.

## Backend Validation Added

The backend now includes:

1. **Base64 Validation**: Validates that `wrappedKey` and `wrappedKeyIV` are valid base64 strings
2. **Length Validation**: Checks that wrapped key length is reasonable (~256 bytes for RSA-OAEP 2048-bit)
3. **Storage Verification**: Verifies the wrapped key is stored correctly without corruption
4. **Key Mismatch Detection**: Flags when recipient's key was rotated after share was created
5. **Diagnostic Flags**: Returns `wrappedKeyValid` and `wrappedKeyError` in share responses

## Common Causes

### 1. Key Mismatch (Most Common)
**Symptom**: Error occurs even for new shares

**Cause**: The private key stored in React Native doesn't match the public key that was used to wrap the key.

**Check**:
- When sharing, verify the sharer is using the recipient's **current** public key from `/v/share/keys/public`
- When unwrapping, verify the recipient is using the **same** private key that corresponds to the public key used for wrapping
- Check if `keyMismatch: true` in the share response

**Solution**:
- Ensure the recipient's private key in `vault_private_key` matches the public key stored in the backend
- If keys were regenerated, all old shares become invalid - need to re-share

### 2. Key Format Issues
**Symptom**: Error occurs immediately after sharing

**Cause**: The private key format is incorrect or corrupted.

**Check**:
- Verify private key is valid JWK format
- Ensure private key is properly imported before use
- Check if private key has all required fields (n, e, d, p, q, dp, dq, qi)

**Solution**:
- Regenerate key pair and ensure both keys are stored correctly
- Verify key import/export functions handle JWK format correctly

### 3. Wrapped Key Corruption
**Symptom**: Error occurs randomly

**Cause**: The wrapped key is being corrupted during transmission or storage.

**Check**:
- Backend logs will show if wrapped key validation fails
- Check `wrappedKeyValid: false` in share response
- Verify base64 encoding/decoding is correct

**Solution**:
- Backend now validates and verifies wrapped keys
- Check backend logs for validation errors

### 4. RSA-OAEP Parameter Mismatch
**Symptom**: Error occurs consistently

**Cause**: The RSA-OAEP parameters (hash function, label) don't match between wrap and unwrap.

**Check**:
- Ensure both wrap and unwrap use SHA-256
- Ensure both use the same label (typically empty/null)
- Verify key algorithm is RSA-OAEP (not RSA-PKCS1-v1_5)

**Solution**:
- Standardize on RSA-OAEP with SHA-256
- Ensure consistent parameters in both wrap and unwrap operations

## Debugging Steps

### Step 1: Check Backend Response
When calling `/v/share/list?type=received`, check for:
```json
{
  "wrappedKeyValid": true/false,
  "wrappedKeyError": "error message if invalid",
  "keyMismatch": true/false,
  "recipientKeyId": "key-id-used-when-created"
}
```

### Step 2: Verify Key Pair
1. Get recipient's current public key: `GET /v/share/keys/public?userId=<recipientId>`
2. Compare with private key stored in React Native
3. Ensure they are a matching pair

### Step 3: Check Wrapped Key Format
1. Decode `wrappedKey` from base64
2. Should be ~256 bytes for RSA-OAEP 2048-bit
3. Should be valid binary data (not corrupted)

### Step 4: Test Key Pair
1. Generate a test key pair
2. Wrap a test key with public key
3. Unwrap with private key
4. If this fails, the key pair implementation has issues

## Backend Logs to Check

Look for these log messages:
- `Share validation: wrappedKey length=X bytes` - Shows wrapped key size
- `Wrapped key length is unusual: X bytes` - Warning if size is wrong
- `Share stored and verified` - Confirms storage was successful
- `Share X has invalid wrappedKey format` - Indicates corruption
- `keyMismatch` flag in share response - Indicates key rotation

## React Native Code Checks

1. **Key Storage**: Ensure private key is stored correctly in `vault_private_key`
2. **Key Import**: Verify private key is imported correctly before unwrapping
3. **Unwrap Function**: Check RSA-OAEP parameters match wrapping parameters
4. **Error Handling**: Check if error occurs before or during unwrap

## Expected Behavior

### When Sharing (Sharer Side):
1. Get recipient's public key from backend
2. Import public key as CryptoKey
3. Wrap AES key with RSA-OAEP using public key
4. Encode wrapped key as base64
5. Send to backend

### When Receiving (Recipient Side):
1. Get share from backend (includes wrappedKey)
2. Get private key from storage
3. Import private key as CryptoKey
4. Decode wrappedKey from base64
5. Unwrap with RSA-OAEP using private key
6. Use unwrapped AES key to decrypt item

## Next Steps

1. **Check backend logs** for validation errors
2. **Verify key pair** matches between wrap and unwrap
3. **Test with a fresh share** to rule out key rotation issues
4. **Check React Native crypto implementation** for parameter mismatches

## Backend API Response Example

```json
{
  "shares": [
    {
      "id": "...",
      "wrappedKey": "base64-encoded-key",
      "wrappedKeyIV": "base64-encoded-iv",
      "wrappedKeyValid": true,
      "wrappedKeyError": null,
      "keyMismatch": false,
      "recipientKeyId": "key-id-used"
    }
  ]
}
```

If `wrappedKeyValid: false` or `keyMismatch: true`, the share cannot be decrypted with the current keys.

