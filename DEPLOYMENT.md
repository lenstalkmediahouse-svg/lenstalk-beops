# Lenstalk OS Backend - Deployment Guide

## 🚀 Render Deployment

This backend is configured to deploy to **Render** with automatic Node.js detection.

### Prerequisites
- MongoDB Atlas connection string (in `.env`)
- SMTP configuration for email
- JWT secret for authentication

### Environment Variables
Copy `.env.example` to `.env` and fill in your production values:
```bash
cp .env.example .env
```

### Deployment Steps

1. **Connect Repository to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select branch: `main`

2. **Configure Build Settings**
   - Runtime: **Node.js** (auto-detected from `render.yaml`)
   - Build Command: `npm ci --omit=dev`
   - Start Command: `npm start`
   - Port: `4000`

3. **Add Environment Variables**
   - Set all variables from `.env.example` in Render dashboard
   - Ensure `NODE_ENV=production`

4. **Deploy**
   - Render will automatically detect `render.yaml`
   - First deployment takes 2-3 minutes
   - Watch logs to confirm MongoDB connection

### Monitoring

The app logs key startup events:
```
✅ MongoDB Connected: [host]
🚀 Lenstalk OS Backend running on port 4000
```

If MongoDB connection fails, the app gracefully degrades and continues running.

### Local Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run database seed
npm run seed

# Start production server
npm start
```

### Troubleshooting

**Issue: `go: go.mod file not found`**
- ✅ Fixed! We added `render.yaml` with proper Node.js configuration

**Issue: Server hangs on startup**
- ✅ Fixed! Added connection timeouts and graceful error handling

**Issue: Demo users not syncing**
- This is normal if MongoDB is unreachable
- App will sync users once database becomes available
