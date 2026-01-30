# Backend CI/CD Setup Summary

## ✅ What's Been Set Up

### 1. Dockerfile
- **Location**: `/Dockerfile` (root level)
- **Type**: Multi-stage build
- **Features**:
  - Builds TypeScript code
  - Production-optimized image
  - Health check support
  - Port 3000 (internal), mapped to 3123 (external)

### 2. GitHub Workflow
- **Location**: `.github/workflows/docker-build.yml`
- **Triggers**: Push to `master` branch
- **Jobs**:
  1. **Build**: Builds and pushes Docker image to GHCR
  2. **Deploy**: Deploys to server via SSH

### 3. Docker Compose
- **Location**: `docker-compose.yml`
- **Image**: `ghcr.io/pavankumar-tidke/novasafe-backend:latest`
- **Container**: `vault-backend`
- **Port**: `3123:3000`

### 4. .dockerignore
- Excludes unnecessary files from Docker build
- Reduces image size and build time

## 🔧 Required GitHub Secrets

Add these to your GitHub repository settings:

```
SSH_USER              # Server SSH username (e.g., "root", "ubuntu")
SSH_HOST              # Server IP or hostname (e.g., "64.227.135.126")
SSH_PASSWORD          # Server SSH password
DEPLOY_PATH_BACKEND   # Backend deployment path (e.g., "/home/user/backend")
```

**Alternative**: Use SSH keys instead of password:
```
SSH_USER              # Server SSH username
SSH_HOST              # Server IP or hostname
SSH_PRIVATE_KEY       # Private SSH key content
DEPLOY_PATH_BACKEND   # Backend deployment path
```

## 🚀 Quick Start

### 1. Update docker-compose.yml Image

Make sure the image name matches your GitHub repository:

```yaml
services:
  vault:
    image: ghcr.io/YOUR_USERNAME/novasafe-backend:latest
```

Replace `YOUR_USERNAME` with your GitHub username or organization.

### 2. Set Up Server

On your deployment server:

```bash
# Create deployment directory
mkdir -p /path/to/backend-deployment
cd /path/to/backend-deployment

# Copy docker-compose.yml
# (Copy from your local machine or clone repo)

# Create .env file with all required environment variables
nano .env
```

### 3. Add GitHub Secrets

Go to: `Settings → Secrets and variables → Actions`

Add the secrets listed above.

### 4. Deploy

Push to master branch:

```bash
git add .
git commit -m "Setup backend CI/CD"
git push origin master
```

The workflow will:
1. Build Docker image
2. Push to GHCR
3. Deploy to server automatically

## 📋 Deployment Checklist

- [ ] GitHub secrets configured
- [ ] docker-compose.yml image name updated
- [ ] Server has Docker and Docker Compose installed
- [ ] .env file created on server with all variables
- [ ] docker-compose.yml copied to server
- [ ] Server can access GHCR (login configured)
- [ ] Test deployment with manual push

## 🔍 Verification

After deployment, verify:

```bash
# On server
docker ps
# Should show vault-backend running

docker logs vault-backend
# Check for errors

curl http://localhost:3123/health
# Should return: {"status":"ok",...}
```

## 📚 Documentation

- **Full Guide**: See `BACKEND_DEPLOYMENT.md`
- **Troubleshooting**: See `BACKEND_DEPLOYMENT.md` → Troubleshooting section

## 🔄 Workflow Details

### Build Job
- Runs on: `ubuntu-latest`
- Builds: Docker image using Dockerfile
- Pushes to: `ghcr.io/<repo>:latest`
- Uses: Docker Buildx with caching

### Deploy Job
- Runs on: `ubuntu-latest`
- Connects: Via SSH to deployment server
- Actions:
  1. Pulls latest image from GHCR
  2. Stops existing container
  3. Starts new container with docker-compose
  4. Verifies health endpoint

## 🎯 Next Steps

1. Configure GitHub secrets
2. Update docker-compose.yml image name
3. Set up server environment
4. Test deployment
5. Monitor logs and health checks

