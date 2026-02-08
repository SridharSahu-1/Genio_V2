# 🔧 Fix Vercel Frontend Deployment

## Problem
Vercel is trying to build from the repository root instead of the `client` folder, causing build failures.

## Solution: Configure Root Directory in Vercel

### Step 1: Set Root Directory in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **Genio_V2** project
3. Go to **Settings** → **General**
4. Scroll down to **Root Directory**
5. Click **Edit**
6. Set it to: `client`
7. Click **Save**

### Step 2: Verify vercel.json

I've created a `vercel.json` file in the `client` folder. It should contain:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install"
}
```

### Step 3: Set Environment Variables

1. In Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: Your API endpoint (e.g., `https://api.yourdomain.com` or `http://3.84.220.241:5001` for testing)
   - **Environment**: Select all (Production, Preview, Development)
3. Click **Save**

### Step 4: Redeploy

1. Go to **Deployments** tab
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new deployment

---

## Alternative: If Root Directory Setting Doesn't Work

If setting the root directory in Vercel doesn't work, you can use a `vercel.json` in the repository root:

**Create `/vercel.json` in the root:**
```json
{
  "buildCommand": "cd client && npm install && npm run build",
  "outputDirectory": "client/.next",
  "installCommand": "cd client && npm install",
  "framework": "nextjs"
}
```

But **prefer the Root Directory setting** in Vercel dashboard as it's cleaner.

---

## Common Build Errors & Fixes

### Error: "Cannot find module"
- **Fix**: Make sure Root Directory is set to `client` in Vercel settings

### Error: "Build command failed"
- **Fix**: Check that `package.json` exists in `client/` folder
- **Fix**: Verify `npm run build` works locally

### Error: "Environment variable not found"
- **Fix**: Add `NEXT_PUBLIC_API_URL` in Vercel Environment Variables

### Error: TypeScript errors
- **Fix**: Run `npm run build` locally to see the actual errors
- **Fix**: Check `tsconfig.json` in `client/` folder

---

## Quick Checklist

- [ ] Root Directory set to `client` in Vercel Settings
- [ ] `vercel.json` exists in `client/` folder (optional, but helpful)
- [ ] `NEXT_PUBLIC_API_URL` environment variable is set
- [ ] Pushed latest changes to GitHub
- [ ] Triggered a new deployment

---

## Test Your Deployment

After redeploying, check:
1. Build logs in Vercel dashboard - should show successful build
2. Visit your Vercel URL - should load the frontend
3. Check browser console - should not show API connection errors

---

**Need help?** Share the full error message from Vercel build logs and I'll help you fix it!
