# Deployment Guide

This guide provides step-by-step instructions for deploying BefundTool MVP to Vercel.

## Prerequisites

- GitHub account
- Vercel account (free tier is sufficient)
- Git installed locally

## Deployment Steps

### Step 1: Prepare Your Repository

1. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Name: `befundtool-mvp` (or your preferred name)
   - Description: "Radiology Reporting Tool with Speech Recognition"
   - Choose Public or Private
   - Do NOT initialize with README (we already have one)
   - Click "Create repository"

### Step 2: Push Code to GitHub

From your project directory, run:

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit the files
git commit -m "Initial commit: BefundTool MVP"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/befundtool-mvp.git

# Push to GitHub
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/login
2. Sign in with your GitHub account
3. Click "Add New..." → "Project"
4. Find and select your `befundtool-mvp` repository
5. Vercel will auto-detect Next.js settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: ./
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`
6. Click "Deploy"
7. Wait 2-3 minutes for deployment to complete
8. Your app will be live at: `https://befundtool-mvp-YOUR_USERNAME.vercel.app`

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name? befundtool-mvp
# - In which directory is your code located? ./
# - Want to override settings? N

# Deploy to production
vercel --prod
```

### Step 4: Verify Deployment

1. Visit your deployed URL
2. Check that the warning banner is visible: "Demo only – keine PHI/PAT-Daten verwenden"
3. Test the Report tab:
   - Click "Start" button for dictation
   - Grant microphone permissions if prompted
   - Speak: "MRT Prostata mit PI-RADS 5"
   - Verify transcript appears
   - Verify template suggestion changes to "MRT Prostata – PI-RADS"
   - Verify impression is auto-generated
4. Test the Template Editor tab:
   - Switch to "Template Editor"
   - Select a template
   - Verify YAML loads in editor
   - Try editing and saving

### Step 5: Custom Domain (Optional)

1. In Vercel Dashboard, go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's DNS configuration instructions
5. Wait for DNS propagation (can take up to 48 hours)

## Continuous Deployment

Once connected to GitHub, Vercel automatically:
- Deploys every push to `main` branch to production
- Creates preview deployments for pull requests
- Shows deployment status in GitHub

To update your app:
```bash
# Make changes to your code
git add .
git commit -m "Your commit message"
git push origin main
```

Vercel will automatically rebuild and deploy within minutes.

## Environment Configuration

### No Environment Variables Required

This app uses:
- **localStorage** for template persistence
- **Browser Speech API** for dictation
- **No backend or API keys needed**

Everything runs in the browser, making deployment simple.

### Build Configuration

The project is configured for static export via Next.js App Router with client-side rendering:
- All pages use `'use client'` directive
- No server-side features required
- Fully static after build

## Troubleshooting

### Build Fails

If deployment fails during build:

1. Check build logs in Vercel dashboard
2. Common issues:
   - Node version mismatch (ensure Node 18+)
   - Missing dependencies (check package.json)
   - TypeScript errors (run `npm run typecheck` locally)

3. Fix locally:
```bash
rm -rf node_modules .next
npm install
npm run build
```

### Runtime Errors

If app loads but doesn't work:

1. Check browser console for errors
2. Ensure using Chrome, Edge, or Safari (Firefox not supported)
3. Check microphone permissions
4. Try clearing browser cache and localStorage

### Speech Recognition Not Working on Deployed Site

1. Ensure site is served over HTTPS (Vercel does this automatically)
2. Check browser permissions for microphone
3. Test in a supported browser (Chrome recommended)

## Rollback

To rollback to a previous deployment:

1. Go to Vercel Dashboard → Your Project
2. Click "Deployments" tab
3. Find the deployment you want to rollback to
4. Click the three dots → "Promote to Production"

## Monitoring

Vercel provides:
- **Analytics**: Visit count, page views
- **Speed Insights**: Performance metrics
- **Logs**: Real-time function logs (if using API routes)

Access these in your Vercel Dashboard → Project → Analytics

## Cost

- **Vercel Free Tier**: Sufficient for this project
  - 100 GB bandwidth/month
  - Unlimited deployments
  - Preview deployments for PRs

- Upgrade only if you need:
  - Custom domains
  - Team collaboration features
  - Higher bandwidth limits

## Security Notes

Remember:
- ⚠️ This is a DEMO application
- ⚠️ DO NOT use with real patient data
- ⚠️ Speech API may send audio to browser vendor servers
- ⚠️ Data stored in localStorage only (browser-specific)

## Support

Issues with deployment?
1. Check Vercel Status: https://vercel-status.com
2. Review build logs in Vercel Dashboard
3. Consult Vercel Documentation: https://vercel.com/docs
4. Open an issue in the GitHub repository

---

Your BefundTool MVP should now be live and accessible to anyone with the URL!
