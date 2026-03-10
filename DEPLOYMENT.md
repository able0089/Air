# Deployment Guide

## Render Deployment

Your bot is now optimized for Render deployment. Here's what was fixed:

### Changes Made

1. **Improved Server Configuration**
   - Server now binds to `0.0.0.0` for external access
   - Added proper keepAlive timeouts for Render
   - Added `/health` endpoint for monitoring

2. **Better Error Handling**
   - Automatic reconnection with exponential backoff
   - Graceful shutdown handlers (SIGTERM/SIGINT)
   - Network error recovery

3. **Production Optimizations**
   - Disabled WebAssembly for better compatibility
   - Improved OCR initialization
   - Better logging for debugging

### Deploy to Render

1. **Connect Your Repository**
   - Go to https://render.com
   - Click "New +" and select "Web Service"
   - Connect your GitHub/GitLab repository

2. **Configuration**
   - Name: `poketwo-bot`
   - Environment: `Node`
   - Region: Choose closest to you
   - Branch: `main` (or your default branch)
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**

3. **Environment Variables**
   Add these in Render dashboard:
   - `TOKEN` = Your Discord token
   - `SPAM_CHANNEL_ID` = Channel ID for spam messages (optional)

4. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically
   - Check logs to verify bot is running

### Monitoring

- Visit your app URL to see status: `https://your-app.onrender.com`
- Health check endpoint: `https://your-app.onrender.com/health`
- Check logs in Render dashboard for bot activity

### Free Tier Limitations

Render free tier:
- Bot sleeps after 15 minutes of inactivity
- Takes 30-60 seconds to wake up
- 750 hours/month free runtime

To keep bot always active, you need a paid plan ($7/month).

### Troubleshooting

**Bot not responding:**
- Check Render logs for errors
- Verify TOKEN is set correctly
- Ensure bot has proper Discord permissions

**Connection timeouts:**
- Normal on free tier during wake-up
- Bot will auto-reconnect

**OCR not working:**
- OCR may fail on free tier (memory limits)
- Bot will still work for text-based hints

## Alternative: Replit Deployment

Your bot also works on Replit's free tier:

1. Keep the Replit project running
2. Use Replit's "Always On" feature (paid)
3. Or use UptimeRobot to ping your bot every 5 minutes

## Support

If you encounter issues:
1. Check Render logs first
2. Verify environment variables
3. Test locally with `npm start`
