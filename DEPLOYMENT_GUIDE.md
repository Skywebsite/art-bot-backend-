# 🚀 Backend Deployment Guide

## Quick Deployment Steps

### 1. **Ensure All Changes Are Committed**
```bash
cd server
git add .
git commit -m "Update backend code"
```

### 2. **Push to Git (Force Push if Needed)**
```bash
# Regular push
git push origin main

# OR if you need to force push (be careful!)
git push origin main --force
```

### 3. **Vercel Auto-Deployment**
If your GitHub repo is connected to Vercel:
- ✅ **Vercel will automatically deploy** when you push to the main branch
- ✅ No manual deployment needed!
- ✅ Check your Vercel dashboard for deployment status

## 🔧 Environment Variables Setup in Vercel

**IMPORTANT:** You MUST add these environment variables in Vercel dashboard:

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Select your project

2. **Go to Settings → Environment Variables**

3. **Add these variables:**

```
MONGODB_URI=your_mongodb_connection_string
OPENAI_API_KEY=your_openai_api_key
AI_PROVIDER=google (or your provider)
LLM_MODEL=gemini-1.5-flash (or your model)
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
LLM_BASE_URL=https://api.edenai.run/v2
CLOUDINARY_CLOUD_NAME=dioknuz64
CLOUDINARY_API_KEY=842982369322241
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

4. **Redeploy after adding variables:**
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Click "Redeploy"

## ✅ CORS Settings

CORS is already configured in `index.js`:
- ✅ Allows all origins (`origin: '*'`)
- ✅ Allows all necessary HTTP methods
- ✅ Allows required headers

**For production, you can restrict origins:**
```javascript
app.use(cors({
  origin: ['https://your-app-domain.com', 'https://your-expo-app.com'],
  // ... rest of config
}));
```

## 📋 Pre-Deployment Checklist

- [ ] All code changes committed
- [ ] Environment variables added in Vercel
- [ ] MongoDB connection string is correct
- [ ] API keys are valid
- [ ] CORS settings are correct
- [ ] Tested locally before deploying

## 🔍 Verify Deployment

After deployment, test these endpoints:

1. **Health Check:**
   ```
   https://your-vercel-url.vercel.app/health
   ```
   Should return: "AI Retrieval Server is running..."

2. **Test API:**
   ```
   POST https://your-vercel-url.vercel.app/api/ai/chat
   ```

## 🐛 Troubleshooting

### If deployment fails:
1. Check Vercel build logs
2. Verify all environment variables are set
3. Check `vercel.json` configuration
4. Ensure `package.json` has correct scripts

### If API doesn't work after deployment:
1. Check environment variables in Vercel
2. Verify MongoDB connection
3. Check CORS settings
4. Review Vercel function logs

## 📝 Notes

- **Force Push:** Only use `--force` if you're sure about overwriting remote changes
- **CORS:** Current settings allow all origins - secure this in production
- **Environment Variables:** Never commit `.env` file - always use Vercel dashboard
- **Auto-Deploy:** Vercel auto-deploys on push to main branch

---

**Your backend URL will be:** `https://your-project-name.vercel.app`

Update this URL in your Expo app's `ChatScreen.js` and `App.js`!

