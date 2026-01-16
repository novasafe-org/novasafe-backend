#!/usr/bin/env node

/**
 * Scheduler Startup Script
 * 
 * Ensures required Docker containers (Redis, etc.) are running
 * before starting the scheduler service.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REQUIRED_CONTAINERS = [
  { name: 'novasafe-redis', image: 'redis:7-alpine', port: 6379 },
];

function checkDockerInstalled() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isContainerRunning(containerName) {
  try {
    const result = execSync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return result.trim() === containerName;
  } catch {
    return false;
  }
}

async function startContainer(container) {
  console.log(`\n📦 Starting container: ${container.name}...`);
  
  try {
    // Check if container exists but is stopped
    const existsResult = execSync(`docker ps -a --filter "name=${container.name}" --format "{{.Names}}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    if (existsResult === container.name) {
      // Container exists, start it
      console.log(`   Container exists, starting...`);
      execSync(`docker start ${container.name}`, { stdio: 'inherit' });
      console.log(`   ✅ Container ${container.name} started`);
    } else {
      // Container doesn't exist, create it using docker-compose
      console.log(`   Container doesn't exist, creating via docker-compose...`);
      const composeFile = path.join(__dirname, '..', 'docker-compose.yml');
      
      if (!fs.existsSync(composeFile)) {
        throw new Error(`docker-compose.yml not found at ${composeFile}`);
      }

      // Start specific service
      const serviceName = container.name === 'novasafe-redis' ? 'redis' : container.name;
      execSync(`docker-compose -f ${composeFile} up -d ${serviceName}`, { 
        stdio: 'inherit',
        cwd: path.dirname(composeFile),
      });
      console.log(`   ✅ Container ${container.name} created and started`);
    }

    // Wait for container to be healthy
    console.log(`   Waiting for container to be ready...`);
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      if (isContainerRunning(container.name)) {
        // For Redis, check if it's responding
        if (container.name === 'novasafe-redis') {
          try {
            execSync(`docker exec ${container.name} redis-cli ping`, { stdio: 'ignore' });
            console.log(`   ✅ Container ${container.name} is healthy`);
            return true;
          } catch {
            // Redis not ready yet
          }
        } else {
          console.log(`   ✅ Container ${container.name} is running`);
          return true;
        }
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Container ${container.name} failed to start within ${maxAttempts} seconds`);
  } catch (error) {
    console.error(`   ❌ Failed to start container ${container.name}: ${error.message}`);
    return false;
  }
}

async function ensureContainersRunning() {
  console.log('🔍 Checking required containers...\n');

  if (!checkDockerInstalled()) {
    console.error('❌ Docker is not installed or not in PATH');
    console.error('   Please install Docker: https://docs.docker.com/get-docker/');
    process.exit(1);
  }

  const containersToStart = [];

  for (const container of REQUIRED_CONTAINERS) {
    if (isContainerRunning(container.name)) {
      console.log(`✅ ${container.name} is already running`);
    } else {
      console.log(`⚠️  ${container.name} is not running`);
      containersToStart.push(container);
    }
  }

  if (containersToStart.length === 0) {
    console.log('\n✅ All required containers are running\n');
    return true;
  }

  console.log(`\n📦 Starting ${containersToStart.length} container(s)...\n`);

  for (const container of containersToStart) {
    const success = await startContainer(container);
    if (!success) {
      console.error(`\n❌ Failed to start required container: ${container.name}`);
      process.exit(1);
    }
  }

  console.log('\n✅ All required containers are running\n');
  return true;
}

async function main() {
  try {
    await ensureContainersRunning();

    // Change to scheduler directory and start the service
    const schedulerDir = path.join(__dirname, '..', 'services', 'vault_scheduler');
    
    if (!fs.existsSync(schedulerDir)) {
      console.error(`❌ Scheduler directory not found: ${schedulerDir}`);
      process.exit(1);
    }

    console.log('🚀 Starting scheduler service...\n');
    
    // Install dependencies if node_modules doesn't exist
    const nodeModulesPath = path.join(schedulerDir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('📦 Installing scheduler dependencies...\n');
      execSync('pnpm install', {
        stdio: 'inherit',
        cwd: schedulerDir,
      });
    }

    // Start the scheduler
    execSync('pnpm run dev', {
      stdio: 'inherit',
      cwd: schedulerDir,
    });
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();

