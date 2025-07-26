# 🚀 Deployment Guide for Render

This guide walks you through deploying the Email Calendar Extractor to Render.

## 📋 Prerequisites

1. **GitHub Repository**: Your code is already pushed to [https://github.com/NaukhanGreenwin/Calendar.git](https://github.com/NaukhanGreenwin/Calendar.git)
2. **Render Account**: Create a free account at [render.com](https://render.com)
3. **OpenAI API Key**: You'll need your OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)

## 🎯 Step-by-Step Deployment

### 1. **Connect GitHub to Render**
- Go to [render.com](https://render.com) and sign up/login
- Click "New +" → "Web Service"
- Select "Build and deploy from a Git repository"
- Connect your GitHub account
- Choose the repository: `NaukhanGreenwin/Calendar`

### 2. **Configure the Service**
- **Name**: `email-calendar-extractor` (or your preferred name)
- **Branch**: `render-deploy` (this clean branch)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Free` (or upgrade as needed)

### 3. **Set Environment Variables**
In the Render dashboard, add these environment variables:

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | `[Your OpenAI API Key from platform.openai.com]` |

### 4. **Deploy**
- Click "Create Web Service"
- Render will automatically build and deploy your app
- Wait for the deployment to complete (usually 2-5 minutes)

### 5. **Access Your App**
- Once deployed, you'll get a URL like: `https://email-calendar-extractor.onrender.com`
- Your app will be accessible worldwide with automatic HTTPS!

## ✅ **Features Available in Production**

- ✅ **Secure HTTPS** (handled by Render)
- ✅ **PDF Upload Support** (up to 10MB)
- ✅ **Mobile-Friendly Interface**
- ✅ **OpenAI Integration** (GPT-4o-mini)
- ✅ **Time Validation & Correction**
- ✅ **Meeting Link Extraction**
- ✅ **Rate Limiting** (10 requests per 15 min)
- ✅ **Health Monitoring** (`/health` endpoint)

## 🔧 **Post-Deployment**

### **Test Your App**
1. Visit your Render URL
2. Upload a PDF or paste email content
3. Generate a calendar event
4. Download the .ics file

### **Monitor Your App**
- Check logs in Render dashboard
- Monitor the `/health` endpoint
- Set up alerts for downtime (Render Pro feature)

### **Custom Domain** (Optional)
- In Render dashboard: Settings → Custom Domains
- Add your domain and configure DNS

## 🛡️ **Security Notes**

- ✅ Environment variables are encrypted
- ✅ HTTPS is enforced automatically
- ✅ No sensitive data in code repository
- ✅ Rate limiting protects against abuse
- ✅ Input validation and sanitization

## 🔄 **Auto-Deployment**

Every time you push to the `render-deploy` branch on GitHub, Render will automatically redeploy your app with the latest changes!

## 📞 **Support**

If you encounter any issues:
1. Check the Render deployment logs
2. Verify environment variables are set correctly
3. Test the `/health` endpoint
4. Review this deployment guide

**Happy Deploying! 🎉** 