# Nginx Deployment Guide for Nova Crest Backend

## Prerequisites
- Ubuntu/Debian Linux server
- Nginx installed: `sudo apt-get install nginx`
- SSL certificate (Let's Encrypt recommended)
- Your Nova Crest backend running on port 5001

---

## Step 1: Setup SSL Certificate with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot certonly --standalone -d api.novacrest.com -d www.api.novacrest.com

# Auto-renewal (optional)
sudo certbot renew --dry-run
```

---

## Step 2: Deploy Nginx Config

```bash
# Copy config to Nginx sites-available
sudo cp nginx.conf /etc/nginx/sites-available/nova-backend

# Create symlink to sites-enabled
sudo ln -s /etc/nginx/sites-available/nova-backend /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 3: Create Log Directory

```bash
sudo mkdir -p /var/log/nginx
sudo touch /var/log/nginx/nova-backend-access.log
sudo touch /var/log/nginx/nova-backend-error.log
sudo chown www-data:www-data /var/log/nginx/nova-backend-*.log
```

---

## Step 4: Frontend Static Files

```bash
# Create frontend directory
sudo mkdir -p /var/www/nova-frontend

# Copy your built frontend
sudo cp -r /path/to/your/frontend/dist/* /var/www/nova-frontend/dist/

# Set permissions
sudo chown -R www-data:www-data /var/www/nova-frontend
sudo chmod -R 755 /var/www/nova-frontend
```

---

## Step 5: Start Backend Services with PM2

```bash
cd /path/to/NovaBackend

# Install PM2 globally (if not done)
sudo npm install -g pm2

# Start services
pm2 start ecosystem.config.js --env production

# Make PM2 start on boot
pm2 startup
pm2 save
```

---

## Step 6: Verify Everything Works

```bash
# Check Nginx status
sudo systemctl status nginx

# Check PM2 processes
pm2 list

# Test API endpoint
curl https://api.novacrest.com/api/health

# Check logs
sudo tail -f /var/log/nginx/nova-backend-access.log
sudo tail -f /var/log/nginx/nova-backend-error.log
pm2 logs nova-server
pm2 logs nova-worker
```

---

## Common Configuration Changes

### Update Domain Name
Find and replace:
```
api.novacrest.com → your-actual-domain.com
```

### Increase Upload Size
Edit line in nginx.conf:
```nginx
client_max_body_size 50M;  # Change 50M to desired limit
```

### Add Rate Limiting
Uncomment the rate limiting section at bottom of nginx.conf and adjust:
```nginx
rate=10r/s;  # 10 requests per second
```

### Enable Multiple Backend Instances
Uncomment in nginx.conf:
```nginx
upstream nova_backend {
    server localhost:5001;
    server localhost:5002;
    server localhost:5003;
}
```

---

## Troubleshooting

### Nginx won't start
```bash
sudo nginx -t  # Check for config errors
sudo systemctl status nginx  # Check status
sudo journalctl -xe  # Check system logs
```

### WebSocket connections failing
- Ensure `Upgrade` and `Connection` headers are present in socket.io location
- Check firewall allows port 443
- Verify backend is running on port 5001

### SSL certificate errors
```bash
# Renew certificate
sudo certbot renew

# Check certificate validity
sudo certbot certificates
```

### Backend connection refused
```bash
# Verify backend is running
pm2 status
curl http://localhost:5001/api/health

# Check firewall
sudo ufw allow 5001
```

---

## Monitoring

### Real-time logs
```bash
# Nginx access logs
sudo tail -f /var/log/nginx/nova-backend-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/nova-backend-error.log

# Application logs
pm2 monit
```

### System resources
```bash
# Check Nginx processes
ps aux | grep nginx

# Check Node.js processes
ps aux | grep node

# Monitor performance
pm2 monit
```

---

## Security Best Practices

✅ Use HTTPS only (HTTP redirects to HTTPS)
✅ Security headers configured (HSTS, CSP, X-Frame-Options)
✅ Gzip compression enabled
✅ Rate limiting available (uncomment to enable)
✅ SSL session caching for performance
✅ File upload size limited to 50MB
✅ Deny access to hidden files and backups

---

## Performance Tips

1. **Enable gzip** - Already enabled, compresses responses
2. **Cache static files** - Already configured (30 days)
3. **Disable logging for health checks** - Already done
4. **Use HTTP/2** - Already enabled in config
5. **Connection pooling** - Configured with keepalive

---

## Rollback / Disable Nginx

If you need to disable Nginx and connect directly:
```bash
# Disable site
sudo rm /etc/nginx/sites-enabled/nova-backend

# Reload Nginx
sudo systemctl reload nginx

# Now access directly: http://server-ip:5001
```

---

## Questions?
Check Nginx logs and PM2 logs first for most issues!
