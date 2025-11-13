#!/bin/bash

# Production Deployment Script for Vault Service with Network Diagnostics
# This script helps diagnose and resolve MongoDB Atlas connection issues on Ubuntu servers

set -e

echo "🚀 Starting Vault Service Production Deployment..."

# Function to check network connectivity
check_network() {
    echo "🔍 Running network diagnostics..."
    
    # Check internet connectivity
    if ping -c 3 8.8.8.8 > /dev/null 2>&1; then
        echo "✅ Internet connectivity: OK"
    else
        echo "❌ Internet connectivity: FAILED"
        exit 1
    fi
    
    # Check DNS resolution
    if nslookup vault-cluster.chu49ca.mongodb.net > /dev/null 2>&1; then
        echo "✅ DNS resolution for MongoDB Atlas: OK"
    else
        echo "❌ DNS resolution for MongoDB Atlas: FAILED"
        echo "💡 Try updating DNS settings or using Google DNS (8.8.8.8)"
        exit 1
    fi
    
    # Check MongoDB Atlas connectivity
    echo "🔍 Testing MongoDB Atlas connectivity..."
    if timeout 10 telnet vault-cluster.chu49ca.mongodb.net 27017 < /dev/null 2>/dev/null; then
        echo "✅ MongoDB Atlas port 27017: ACCESSIBLE"
    else
        echo "❌ MongoDB Atlas port 27017: NOT ACCESSIBLE"
        echo "💡 Check firewall settings and ensure port 27017 is open"
    fi
    
    # Check SSL/TLS handshake
    echo "🔍 Testing SSL/TLS handshake with MongoDB Atlas..."
    if timeout 10 openssl s_client -connect vault-cluster.chu49ca.mongodb.net:27017 -servername vault-cluster.chu49ca.mongodb.net < /dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
        echo "✅ SSL/TLS handshake: OK"
    else
        echo "⚠️  SSL/TLS handshake: Issues detected (this might be normal for MongoDB)"
    fi
}

# Function to update system for better MongoDB compatibility
update_system() {
    echo "🔧 Updating system for better MongoDB compatibility..."
    
    # Update package lists
    sudo apt-get update
    
    # Install required packages
    sudo apt-get install -y \
        ca-certificates \
        curl \
        software-properties-common \
        apt-transport-https \
        lsb-release \
        gnupg \
        dnsutils \
        telnet \
        openssl
    
    # Update SSL certificates
    sudo update-ca-certificates
    
    echo "✅ System updated successfully"
}

# Function to set optimal network settings
optimize_network() {
    echo "🔧 Optimizing network settings for MongoDB Atlas..."
    
    # Set DNS to Google DNS for better reliability
    echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf.backup > /dev/null
    echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf.backup > /dev/null
    
    # Configure TCP settings for better MongoDB connectivity
    echo "net.ipv4.tcp_keepalive_time = 120" | sudo tee -a /etc/sysctl.conf > /dev/null
    echo "net.ipv4.tcp_keepalive_intvl = 30" | sudo tee -a /etc/sysctl.conf > /dev/null
    echo "net.ipv4.tcp_keepalive_probes = 8" | sudo tee -a /etc/sysctl.conf > /dev/null
    
    sudo sysctl -p
    
    echo "✅ Network settings optimized"
}

# Function to deploy the service
deploy_service() {
    echo "🚀 Deploying Vault Service..."
    
    # Stop existing container if running
    docker stop vault-service 2>/dev/null || true
    docker rm vault-service 2>/dev/null || true
    
    # Run the service with production environment
    docker run -d \
        --name vault-service \
        --restart unless-stopped \
        -p 3123:3123 \
        -e NODE_ENV=production \
        -e VAULT_DB_URI="${VAULT_DB_URI}" \
        -e VAULT_DB_NAME="${VAULT_DB_NAME:-vault}" \
        --log-driver json-file \
        --log-opt max-size=10m \
        --log-opt max-file=3 \
        vault-service
    
    echo "✅ Vault Service deployed successfully"
}

# Function to monitor service startup
monitor_startup() {
    echo "👀 Monitoring service startup..."
    
    # Wait for container to start
    sleep 5
    
    # Check if container is running
    if docker ps | grep -q vault-service; then
        echo "✅ Container is running"
    else
        echo "❌ Container failed to start"
        echo "📝 Container logs:"
        docker logs vault-service
        exit 1
    fi
    
    # Monitor logs for successful connection
    echo "📝 Monitoring connection logs (30 seconds)..."
    timeout 30 docker logs -f vault-service || true
    
    # Final health check
    if docker logs vault-service 2>&1 | grep -q "Database connection established successfully"; then
        echo "🎉 MongoDB Atlas connection successful!"
        echo "🌐 Service is available at http://localhost:3123"
    else
        echo "❌ MongoDB Atlas connection failed"
        echo "📝 Full logs:"
        docker logs vault-service
        exit 1
    fi
}

# Main execution
main() {
    echo "🔧 Vault Service Production Deployment"
    echo "======================================="
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        echo "⚠️  This script requires sudo privileges for system optimization"
        echo "   Run with: sudo ./deploy-production.sh"
        exit 1
    fi
    
    # Run all steps
    check_network
    update_system
    optimize_network
    deploy_service
    monitor_startup
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo "🌐 Vault Service is running at http://localhost:3123"
    echo "📝 Monitor logs with: docker logs -f vault-service"
}

# Run main function
main "$@"