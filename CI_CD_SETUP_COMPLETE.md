# ✅ Backend CI/CD Setup Complete

## What's Been Created

### 1. **Dockerfile** (Root Level)
- Multi-stage build for production
- Builds TypeScript code
- Optimized production image
- Health check support
- Port: 3000 (internal) → 5001 (external)

### 2. **GitHub Workflow** 
- Location: `.github/workflows/docker-build.yml`
- Triggers on: Push to `master` branch
- Builds and pushes to: `ghcr.io/<your-repo>:latest`
- Auto-deploys to server via SSH

### 3. **Docker Compose**
- Updated to use GHCR image
- Container name: `vault-backend`
- Health check configured
- Port mapping: `5001:3000`

### 4. **.dockerignore**
- Excludes unnecessary files
- Reduces build time and image size

### 5. **Documentation**
- `BACKEND_DEPLOYMENT.md` - Complete deployment guide
- `README_DEPLOYMENT.md` - Quick reference

## 🚀 Quick Setup Steps

### Step 1: Update Image Name

In `docker-compose.yml`, verify the image name matches your GitHub repo:

```yaml
services:
  vault:
    image: ghcr.io/YOUR_USERNAME/novasafe-backend:latest
```

**Replace `YOUR_USERNAME`** with your GitHub username or organization name.

### Step 2: Add GitHub Secrets

Go to: `GitHub Repo → Settings → Secrets and variables → Actions`

Add these secrets:

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SSH_USER` | Server SSH username | `root` or `ubuntu` |
| `SSH_HOST` | Server IP/hostname | `64.227.135.126` |
| `SSH_PASSWORD` | Server SSH password | `your-password` |
| `DEPLOY_PATH_BACKEND` | Backend deployment path | `/home/user/backend` |

**Note**: You can also use `DEPLOY_PATH` if it's the same for frontend and backend.

### Step 3: Server Setup

On your deployment server:

```bash
# 1. Create deployment directory
mkdir -p /path/to/backend-deployment
cd /path/to/backend-deployment

# 2. Copy docker-compose.yml to server
# (Use scp or clone the repo)

# 3. Create .env file with all required variables
nano .env

# 4. Login to GHCR (for pulling images)
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### Step 4: Deploy

Push to master branch:

```bash
git add .
git commit -m "Setup backend CI/CD"
git push origin master
```

The workflow will automatically:
1. ✅ Build Docker image
2. ✅ Push to GHCR
3. ✅ Deploy to server
4. ✅ Restart container

## 📋 Verification

After deployment, verify on server:

```bash
# Check container is running
docker ps | grep vault-backend

# Check logs
docker logs vault-backend

# Test health endpoint
curl http://localhost:5001/health
# Should return: {"status":"ok",...}
```

## 🔄 Workflow Details

### Build Job
- **Runs on**: `ubuntu-latest`
- **Builds**: Docker image using root `Dockerfile`
- **Pushes to**: `ghcr.io/<repo>:latest`
- **Uses**: Docker Buildx with GitHub Actions cache

### Deploy Job
- **Runs on**: `ubuntu-latest` (after build succeeds)
- **Connects**: Via SSH to deployment server
- **Actions**:
  1. Pulls latest image from GHCR
  2. Stops existing `vault-backend` container
  3. Starts new container with `docker compose up -d --force-recreate vault`
  4. Tests health endpoint
  5. Shows logs

## 🎯 Key Differences from Frontend

| Feature | Frontend | Backend |
|---------|----------|---------|
| **Dockerfile** | Nginx-based | Node.js-based |
| **Port** | 80 (nginx) | 3000 (internal) → 5001 (external) |
| **Health Check** | Nginx default | `/health` endpoint |
| **Build** | Static files | TypeScript compilation |
| **Deploy Path** | `DEPLOY_PATH` | `DEPLOY_PATH_BACKEND` |

## 🔧 Environment Variables

Make sure your server `.env` file includes:

```env
# Required
MONGODB_URI=mongodb://...
PORT=3000
NODE_ENV=production

# Multi-tenant domains
BASE_DOMAIN=novasafe.io
INDIVIDUAL_SUBDOMAIN=app
VAULT_PATH=/vault
PROTOCOL=https

# Authentication
JWT_SECRET=...
GOOGLE_CLIENT_ID=...

# Email
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...

# Payments
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

## 🐛 Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Verify pnpm workspace structure
- Check build logs in GitHub Actions

### Deploy Fails
- Verify SSH credentials
- Check `DEPLOY_PATH_BACKEND` is correct
- Ensure docker-compose.yml exists on server
- Check server has Docker and Docker Compose installed

### Container Exits
- Check logs: `docker logs vault-backend`
- Verify .env file exists and has all variables
- Check database connection
- Verify port 5001 is available

## 📚 Next Steps

1. ✅ Test build locally: `docker build -t test-backend .`
2. ✅ Test image: `docker run -p 5001:3000 test-backend`
3. ✅ Push to master and watch GitHub Actions
4. ✅ Verify deployment on server
5. ✅ Set up monitoring and alerts

## 🎉 Success!

Your backend now has:
- ✅ Automated Docker builds
- ✅ GitHub Container Registry integration
- ✅ Automated deployment on push
- ✅ Health checks
- ✅ Production-ready configuration

Just push to master and it will deploy automatically! 🚀

