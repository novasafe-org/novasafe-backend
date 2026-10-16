# Blog media storage providers

Upload and serve APIs are unchanged:

- `POST /api/v1/media/upload` (multipart field `file`)
- `GET /api/v1/media/:id` (proxied bytes; no Google Drive URLs exposed)

## Providers

| `MEDIA_PROVIDER` | Backend |
|------------------|---------|
| `local` (default) | Files under `MEDIA_STORAGE_PATH` |
| `google_drive` | Private files in a shared Google Drive folder |

## Google Drive setup (personal 15 GB)

1. [Google Cloud Console](https://console.cloud.google.com/) → create project → enable **Google Drive API**.
2. **IAM → Service accounts** → create → download JSON key.
3. In **My Drive**, create folder `NovaSafe Blog Media` → **Share** with the service account email from the JSON (`client_email`) as **Editor** (not Viewer).
4. Open the folder in Drive; copy the **folder ID** from the URL (`https://drive.google.com/drive/folders/FOLDER_ID`). Use only `FOLDER_ID`, not a file id or shared-drive root id unless that folder is the upload target.

## Environment variables

```bash
MEDIA_PROVIDER=google_drive
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Paste the full service account JSON (one line) or use base64:
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=...

# Optional read cache (recommended on Lambda)
MEDIA_STORAGE_CACHE_ENABLED=true
MEDIA_STORAGE_CACHE_TTL_MS=900000
MEDIA_STORAGE_CACHE_MAX_ENTRIES=64
MEDIA_STORAGE_CACHE_MAX_BYTES=67108864
```

For **local** / Docker / VPS:

```bash
MEDIA_PROVIDER=local
MEDIA_STORAGE_PATH=./uploads
```

## Storage keys in MongoDB (`media.r2_key`)

- `local:media/{mediaId}/{filename}`
- `google_drive:{driveFileId}`

Legacy rows without a prefix are treated as local.

## Error codes (API)

| Code | Meaning |
|------|---------|
| `MEDIA_STORAGE_CONFIG` | Missing/invalid env |
| `MEDIA_STORAGE_AUTH` | Service account cannot access folder |
| `MEDIA_STORAGE_NOT_FOUND` | File missing in provider |
| `MEDIA_STORAGE_QUOTA` | Drive storage full |
| `MEDIA_STORAGE_RATE_LIMIT` | Drive API quota |
| `MEDIA_STORAGE_PROVIDER` | Other provider error |

Check `GET /api/v1/health` → `checks.media` for provider health.
