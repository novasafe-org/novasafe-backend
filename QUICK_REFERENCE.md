# 🚀 Quick Reference Card

## **Command Pattern**
All commands run from **root directory**: `pnpm run start:<service-name>`

## **Development Commands** 🔧
```bash
# Always from root directory
cd /Users/pavankumar.tidke/Projects/vault-backend

pnpm run start:vault           # Start vault service (Port: 3123)
pnpm run start:gateway         # Start gateway service (Port: 3000)
pnpm run start:auth            # Start auth service (Port: 3124)
pnpm run start:notification    # Start notification service (Port: 3125)
pnpm run start:file            # Start file service (Port: 3126)
```

## **Production Commands** 🚀
```bash
# Always from root directory
cd /Users/pavankumar.tidke/Projects/vault-backend

pnpm run start:vault:prod           # Build + Start vault service
pnpm run start:gateway:prod         # Build + Start gateway service
pnpm run start:auth:prod            # Build + Start auth service
pnpm run start:notification:prod    # Build + Start notification service
pnpm run start:file:prod            # Build + Start file service
```

## **Build Commands** 🔨
```bash
pnpm run build:vault           # Build vault service
pnpm run build:gateway         # Build gateway service
pnpm run build:auth            # Build auth service
pnpm run build:notification    # Build notification service
pnpm run build:file            # Build file service
pnpm run build:all             # Build all services
```

## **Docker Commands** 🐳
```bash
# Build Docker Images
pnpm run docker:build:vault           # Build vault image
pnpm run docker:build:gateway         # Build gateway image
pnpm run docker:build:auth            # Build auth image
pnpm run docker:build:notification    # Build notification image
pnpm run docker:build:file            # Build file image

# Run Docker Containers
pnpm run docker:run:vault           # Run vault container
pnpm run docker:run:gateway         # Run gateway container
pnpm run docker:run:auth            # Run auth container
pnpm run docker:run:notification    # Run notification container
pnpm run docker:run:file            # Run file container
```

## **Utilities** 🛠
```bash
pnpm run install:all    # Install all dependencies
pnpm run clean          # Clean all node_modules
```

## **Service URLs** 🌐
- **Vault**: http://localhost:3123
- **Gateway**: http://localhost:3000  
- **Auth**: http://localhost:3124
- **Notification**: http://localhost:3125
- **File**: http://localhost:3126

## **Key Features** ✨
✅ **Standardized Commands**: `pnpm run start:<service-name>`  
✅ **Root Directory Only**: All commands from project root  
✅ **Isolated Dependencies**: Each service has own packages  
✅ **Dev/Prod Modes**: Separate environments  
✅ **Docker Ready**: Built-in containerization