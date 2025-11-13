# MongoDB Atlas Connection Troubleshooting Guide

## 🚨 Common Production Issues & Solutions

### 1. **DNS Resolution Issues**
```bash
# Test DNS resolution
nslookup vault-cluster.chu49ca.mongodb.net

# Fix: Update DNS settings
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf
```

### 2. **Firewall/Port Issues**
```bash
# Test port connectivity
telnet vault-cluster.chu49ca.mongodb.net 27017

# Fix: Open required ports
sudo ufw allow 27017
sudo ufw allow out 27017
```

### 3. **SSL/TLS Certificate Issues**
```bash
# Update SSL certificates
sudo apt-get update
sudo apt-get install ca-certificates
sudo update-ca-certificates

# Test SSL connection
openssl s_client -connect vault-cluster.chu49ca.mongodb.net:27017
```

### 4. **Alternative Connection Methods**

#### Option A: Use Standard MongoDB URI (instead of SRV)
```env
VAULT_DB_URI=mongodb://vaultatlasdbuser:TGExCm3gURQg7mvg@ac-wkabvmq-shard-00-00.chu49ca.mongodb.net:27017,ac-wkabvmq-shard-00-01.chu49ca.mongodb.net:27017,ac-wkabvmq-shard-00-02.chu49ca.mongodb.net:27017/vault?ssl=true&replicaSet=atlas-i5mxtv-shard-0&authSource=admin&retryWrites=true&w=majority
```

#### Option B: Use IP Addresses (if DNS fails)
```bash
# Get IP addresses
nslookup vault-cluster.chu49ca.mongodb.net

# Use IP in connection string
VAULT_DB_URI=mongodb://vaultatlasdbuser:TGExCm3gURQg7mvg@[IP1]:27017,[IP2]:27017,[IP3]:27017/vault?ssl=true&authSource=admin
```

### 5. **Network Optimization**
```bash
# Optimize TCP settings
echo "net.ipv4.tcp_keepalive_time = 120" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_keepalive_intvl = 30" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_keepalive_probes = 8" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 6. **Docker Network Issues**
```bash
# Run with host networking (bypass Docker network isolation)
docker run --network host vault-service

# Or use custom DNS
docker run --dns 8.8.8.8 --dns 8.8.4.4 vault-service
```

### 7. **MongoDB Atlas IP Whitelist**
- Ensure your server IP is whitelisted in MongoDB Atlas
- Or use `0.0.0.0/0` for testing (not recommended for production)

### 8. **Environment Variables for Production**
```env
# Use these in your production environment
NODE_ENV=production
NODE_OPTIONS=--openssl-legacy-provider
VAULT_DB_URI=mongodb+srv://vaultatlasdbuser:TGExCm3gURQg7mvg@vault-cluster.chu49ca.mongodb.net/vault?retryWrites=true&w=majority&ssl=true&authSource=admin&connectTimeoutMS=30000&socketTimeoutMS=60000
VAULT_DB_NAME=vault
```

### 9. **Debugging Steps**
```bash
# 1. Check container logs
docker logs vault-service

# 2. Run with debug mode
docker run -e DEBUG=mongodb:* vault-service

# 3. Test connectivity from inside container
docker exec -it vault-service sh
ping vault-cluster.chu49ca.mongodb.net
nslookup vault-cluster.chu49ca.mongodb.net
```

### 10. **Quick Production Deployment**
```bash
# 1. Set environment variables
export VAULT_DB_URI="your-mongodb-uri"
export VAULT_DB_NAME="vault"

# 2. Run the deployment script
sudo ./deploy-production.sh

# 3. Monitor the service
docker logs -f vault-service
```

## 🆘 Still Having Issues?

1. **Check MongoDB Atlas Status**: https://status.mongodb.com/
2. **Verify Network ACL**: Ensure your server IP is whitelisted
3. **Test from Different Network**: Try from a different server/network
4. **Contact MongoDB Support**: If all else fails, reach out to MongoDB Atlas support

## 📞 Emergency Fallback

If MongoDB Atlas is completely inaccessible, you can temporarily use a local MongoDB:

```bash
# Install MongoDB locally
sudo apt-get install mongodb
sudo systemctl start mongodb

# Update connection string
VAULT_DB_URI=mongodb://localhost:27017/vault
```