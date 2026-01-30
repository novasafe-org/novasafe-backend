# Backend Deployment Guide

This guide explains the CI/CD pipeline setup for the NovaSafe backend.

## Architecture

The backend uses:
- **Monorepo structure** with pnpm workspaces
- **Docker multi-stage build** for optimized production images
- **GitHub Container Registry (GHCR)** for image storage
- **GitHub Actions** for automated build and deployment

## Files Structure

```
novasafe-backend/
├── Dockerfile                    # Root Dockerfile for building vault service
├── docker-compose.yml            # Production docker-compose configuration
├── .dockerignore                # Files to exclude from Docker build
├── .github/
│   └── workflows/
│       └── docker-build.yml     # CI/CD workflow
└── services/
    └── vault/
        ├── Dockerfile           # Service-specific Dockerfile (legacy)
        └── src/                 # Source code
```

## Dockerfile

The root `Dockerfile` uses a multi-stage build:

1. **Builder stage**: Installs dependencies and builds TypeScript
2. **Production stage**: Creates minimal image with only production dependencies

**Key features**:
- Uses Node.js 20
- pnpm for package management
- Monorepo workspace support
- Health check endpoint
- Production optimizations

## GitHub Workflow

The workflow (`.github/workflows/docker-build.yml`) has two jobs:

### 1. Build Job
- Builds Docker image using Docker Buildx
- Pushes to GitHub Container Registry (GHCR)
- Uses caching for faster builds
- Tags: `latest`, `master`, `master-<sha>`

### 2. Deploy Job
- SSH to deployment server
- Pulls latest image from GHCR
- Updates docker-compose services
- Restarts containers

## Setup Instructions

### 1. GitHub Secrets

Add these secrets to your GitHub repository:

```
SSH_USER              # Server SSH username
SSH_HOST              # Server IP or hostname
SSH_PASSWORD          # Server SSH password (or use SSH key)
DEPLOY_PATH_BACKEND   # Path to backend deployment directory on server
```

**Note**: For better security, use SSH keys instead of passwords:
1. Generate SSH key pair
2. Add public key to server's `~/.ssh/authorized_keys`
3. Add private key as GitHub secret `SSH_PRIVATE_KEY`
4. Update workflow to use SSH key authentication

### 2. Docker Compose Configuration

Update `docker-compose.yml` to use the GHCR image:

```yaml
services:
  vault:
    image: ghcr.io/YOUR_USERNAME/novasafe-backend:latest
    container_name: vault-backend
    ports:
      - "3123:3000"
    env_file:
      - .env
    restart: always
```

**Important**: Replace `YOUR_USERNAME` with your GitHub username or organization.

### 3. Server Setup

On your deployment server:

1. **Install Docker and Docker Compose**:
   ```bash
   # Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Docker Compose (if not included)
   sudo apt-get update
   sudo apt-get install docker-compose-plugin
   ```

2. **Create deployment directory**:
   ```bash
   mkdir -p /path/to/backend-deployment
   cd /path/to/backend-deployment
   ```

3. **Copy docker-compose.yml**:
   ```bash
   # Copy docker-compose.yml to server
   scp docker-compose.yml user@server:/path/to/backend-deployment/
   ```

4. **Create .env file**:
   ```bash
   # On server, create .env with all required variables
   nano .env
   ```

5. **Login to GHCR** (for pulling private images):
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
   ```

### 4. Environment Variables

Create `.env` file on server with required variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/vault

# Server
PORT=3000
NODE_ENV=production

# Domain Configuration (for multi-tenant)
BASE_DOMAIN=novasafe.io
INDIVIDUAL_SUBDOMAIN=app
VAULT_PATH=/vault
PROTOCOL=https

# Authentication
JWT_SECRET=your-jwt-secret
GOOGLE_CLIENT_ID=your-google-client-id

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com

# Frontend URL
FRONTEND_URL=https://novasafe.io

# Payment (Razorpay/PayU)
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-key-secret
# ... other payment configs
```

## Deployment Flow

### Automatic Deployment

1. **Push to master branch**:
   ```bash
   git push origin master
   ```

2. **GitHub Actions triggers**:
   - Builds Docker image
   - Pushes to GHCR
   - Deploys to server

### Manual Deployment

If you need to deploy manually:

```bash
# On server
cd /path/to/backend-deployment

# Pull latest image
docker pull ghcr.io/YOUR_USERNAME/novasafe-backend:latest

# Restart services
docker compose up -d --force-recreate
```

## Testing the Deployment

### 1. Check Container Status

```bash
docker ps
# Should show vault-backend container running
```

### 2. Check Logs

```bash
docker logs vault-backend
# Check for startup errors
```

### 3. Test Health Endpoint

```bash
curl http://localhost:3123/health
# Should return: {"status":"ok",...}
```

### 4. Test API Endpoint

```bash
curl http://localhost:3123/v/auth/me
# Should return authentication required error (not 404)
```

## Troubleshooting

### Issue: Image not found

**Solution**: 
- Check GHCR image name matches docker-compose.yml
- Verify GitHub token has package read permissions
- Login to GHCR manually: `docker login ghcr.io`

### Issue: Container exits immediately

**Solution**:
- Check logs: `docker logs vault-backend`
- Verify .env file exists and has required variables
- Check database connection
- Verify port 3000 is available

### Issue: Health check fails

**Solution**:
- Verify health endpoint: `curl http://localhost:3000/health`
- Check if curl is installed in container
- Increase health check timeout in docker-compose.yml

### Issue: Deployment script fails

**Solution**:
- Check SSH connection: `ssh user@server`
- Verify DEPLOY_PATH_BACKEND is correct
- Check docker compose command: `docker compose version`
- Verify GitHub token has package write permissions

## Security Best Practices

1. **Use SSH keys** instead of passwords
2. **Rotate secrets** regularly
3. **Limit GHCR access** to necessary repositories
4. **Use environment-specific .env files**
5. **Enable Docker security scanning**
6. **Use secrets management** (e.g., HashiCorp Vault)

## Monitoring

### Health Checks

The container includes a health check that:
- Runs every 30 seconds
- Checks `/health` endpoint
- Times out after 3 seconds
- Retries 3 times
- Starts checking after 40 seconds

### Logs

View logs:
```bash
# All logs
docker logs vault-backend

# Follow logs
docker logs -f vault-backend

# Last 100 lines
docker logs --tail 100 vault-backend
```

## Rollback

If deployment fails:

```bash
# On server
cd /path/to/backend-deployment

# Pull previous image tag
docker pull ghcr.io/YOUR_USERNAME/novasafe-backend:master-<previous-sha>

# Update docker-compose.yml to use specific tag
# Then restart
docker compose up -d --force-recreate
```

## Next Steps

1. ✅ Set up GitHub secrets
2. ✅ Update docker-compose.yml with correct image name
3. ✅ Configure server environment
4. ✅ Test deployment
5. ✅ Set up monitoring and alerts

