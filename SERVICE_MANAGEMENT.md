# 🚀 Service Management Guide

## **Command Structure**
All commands run from **root directory** with pattern: `pnpm run start:<service-name>`

## 📋 **Available Services**
- **vault** - Core vault service (Port: 5001)
- **gateway** - API Gateway (Port: 3000)
- **auth** - Authentication service (Port: 3124)
- **notification** - Notification service (Port: 3125)
- **file** - File management service (Port: 3126)

## 🔧 **Development Commands**

### **Start Individual Services (Development Mode)**
```bash
# From root directory only
cd /Users/pavankumar.tidke/Projects/vault-backend

# Start specific service in development mode
pnpm run start:vault           # Starts vault service
pnpm run start:gateway         # Starts gateway service
pnpm run start:auth            # Starts auth service
pnpm run start:notification    # Starts notification service
pnpm run start:file            # Starts file service
```

## 🚀 **Production Commands**

### **Start Individual Services (Production Mode)**
```bash
# From root directory only
cd /Users/pavankumar.tidke/Projects/vault-backend

# Build and start specific service in production mode
pnpm run start:vault:prod           # Builds and starts vault service
pnpm run start:gateway:prod         # Builds and starts gateway service
pnpm run start:auth:prod            # Builds and starts auth service
pnpm run start:notification:prod    # Builds and starts notification service
pnpm run start:file:prod            # Builds and starts file service
```

## 🔨 **Build Commands**

### **Build Individual Services**
```bash
# Build specific service
pnpm run build:vault           # Builds vault service
pnpm run build:gateway         # Builds gateway service
pnpm run build:auth            # Builds auth service
pnpm run build:notification    # Builds notification service
pnpm run build:file            # Builds file service

# Build all services
pnpm run build:all
```

## 🐳 **Docker Commands**

### **Build Docker Images**
```bash
# Build specific service docker image
pnpm run docker:build:vault           # Builds vault service image
pnpm run docker:build:gateway         # Builds gateway service image
pnpm run docker:build:auth            # Builds auth service image
pnpm run docker:build:notification    # Builds notification service image
pnpm run docker:build:file            # Builds file service image
```

### **Run Docker Containers**
```bash
# Run specific service docker container
pnpm run docker:run:vault           # Runs vault service container
pnpm run docker:run:gateway         # Runs gateway service container
pnpm run docker:run:auth            # Runs auth service container
pnpm run docker:run:notification    # Runs notification service container
pnpm run docker:run:file            # Runs file service container
```

## 📦 **Package Management**

### **Install Dependencies**
```bash
# Install all dependencies for all services
pnpm run install:all

# Clean all node_modules and cache
pnpm run clean
```

## 🎯 **Quick Examples**

### **Development Workflow**
```bash
# 1. Navigate to root
cd /Users/pavankumar.tidke/Projects/vault-backend

# 2. Install dependencies
pnpm run install:all

# 3. Start vault service in development
pnpm run start:vault

# 4. In another terminal, start gateway
pnpm run start:gateway
```

### **Production Workflow**
```bash
# 1. Navigate to root
cd /Users/pavankumar.tidke/Projects/vault-backend

# 2. Install dependencies
pnpm run install:all

# 3. Start vault service in production
pnpm run start:vault:prod

# 4. In another terminal, start gateway in production
pnpm run start:gateway:prod
```

### **Docker Workflow**
```bash
# 1. Navigate to root
cd /Users/pavankumar.tidke/Projects/vault-backend

# 2. Build vault service Docker image
pnpm run docker:build:vault

# 3. Run vault service in Docker
pnpm run docker:run:vault
```

## 🔍 **Service Dependencies**

Each service manages its own dependencies in its respective `package.json`:
- `services/vault/package.json` - Vault service dependencies
- `services/gateway/package.json` - Gateway service dependencies
- `services/auth-service/package.json` - Auth service dependencies
- `services/notification-service/package.json` - Notification service dependencies
- `services/file-service/package.json` - File service dependencies

## 🌐 **Service URLs**

When running locally:
- **Vault Service**: http://localhost:5001
- **Gateway Service**: http://localhost:3000
- **Auth Service**: http://localhost:3124
- **Notification Service**: http://localhost:3125
- **File Service**: http://localhost:3126

## ⚡ **Key Benefits**

1. **Standardized Commands**: All commands follow `pnpm run start:<service-name>` pattern
2. **Root Directory Execution**: Run all commands from project root
3. **Isolated Dependencies**: Each service has its own dependencies
4. **Environment Flexibility**: Separate dev and prod commands
5. **Docker Ready**: Built-in Docker commands for each service