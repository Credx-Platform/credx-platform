# CredX Launch Checklist — Week of April 13, 2026

## Status Summary

### ✅ LIVE NOW — `credxme.com` (Vercel)
The public-facing landing page + client portal is deployed and functional.

**What works:**
- Landing page with lead capture
- Client login / registration
- Client portal with onboarding, disputes, letters, documents, education, billing
- Contract agreement (inline checkbox + sign)
- Profile save (localStorage)
- Affiliate links wired to real IdentityIQ and MyFreeScoreNow URLs
- Sharon Galloway dispute preset for demo/testing

**Limitations:**
- Data is stored in-memory on Vercel (resets on deploy / server restart)
- Good for soft launch, lead collection, and testing
- Real persistent backend still needs Railway deployment

---

## 🚀 To Complete Launch

### 1. Railway Deployment — Admin Backend

**Why:** Gives you a real Postgres database + admin portal for managing clients and disputes internally.

**What to do:**

#### Step A: Create GitHub Repo
1. Go to https://github.com/new
2. Create a private repo (e.g., `credx-platform`)
3. Add the remote and push:

```bash
cd /home/ubuntu/.openclaw/workspace/credx-platform
git remote add origin https://github.com/YOUR_USERNAME/credx-platform.git
git branch -M main
git push -u origin main
```

#### Step B: Railway Setup
1. Go to https://railway.app
2. Create a new project
3. Add a **PostgreSQL** database
4. Create **two services** from the same GitHub repo:

**Service 1: API**
- Root directory: `credx-platform`
- Build command: `npm install && npm run prisma:generate && npm run build:api`
- Start command: `npm run start:api`
- Environment variables (set in Railway dashboard):

```env
NODE_ENV=production
PORT=3000
APP_URL=https://credxme.com
API_URL=https://api.credxme.com
JWT_SECRET=<generate a strong random secret>
DATABASE_URL=<copy from Railway Postgres>
FROM_EMAIL=contact@credxme.com
LEAD_NOTIFICATION_EMAIL=jmalloy@credxme.com
```

- Health check path: `/health`

**Service 2: Admin Web**
- Root directory: `credx-platform`
- Build command: `npm install && npm run build:web`
- Start command: `npm run start:web`
- Environment variables:

```env
VITE_API_URL=https://api.credxme.com
```

#### Step C: Run Database Migration
In Railway shell for the API service:

```bash
cd packages/db
npx prisma migrate deploy
```

Or run once locally against the Railway DB:

```bash
# Set DATABASE_URL to your Railway Postgres URL, then:
cd packages/db
npx prisma migrate deploy
```

#### Step D: Domain Setup
- API service → `api.credxme.com`
- Admin web service → `admin.credxme.com` (or keep local for now)

**DNS:** Point `api.credxme.com` CNAME to Railway's provided domain.

---

### 2. Post-Deploy Verification

**API checks:**
- [ ] `https://api.credxme.com/health` returns OK
- [ ] `POST /api/auth/register` creates a user
- [ ] `POST /api/auth/login` returns a token
- [ ] `GET /api/clients` returns client list (with auth)
- [ ] `GET /api/disputes` returns disputes (with auth)

**Admin portal checks:**
- [ ] Login works with a staff/admin account
- [ ] Overview loads with stats
- [ ] Clients tab shows data
- [ ] Disputes tab shows the Dispute Manager with 4 tabs

---

### 3. Connect Landing Page to Railway API (Optional for Soft Launch)

If you want the Vercel landing page to use the Railway backend instead of its in-memory API:

1. Update `credx/public/index.html` API calls to point to `https://api.credxme.com`
2. Enable CORS on the Railway API for `https://credxme.com`
3. Redeploy Vercel

**Note:** This is a bigger change. For this week's soft launch, the in-memory Vercel API is acceptable for testing.

---

### 4. Create Admin User on Railway Backend

After deploy, seed an admin user so you can log into the admin portal:

```bash
# In Railway shell for API service
node -e "
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('YourAdminPassword', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@credxme.com',
      passwordHash: hash,
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'User'
    }
  });
  console.log('Admin created:', user.id);
})();
"
```

---

## 📋 What's Done vs What's Left

| Item | Status |
|------|--------|
| Landing page design | ✅ Live |
| Client portal UI | ✅ Live on Vercel |
| Login/register flow | ✅ Working |
| Onboarding steps (5-step) | ✅ Working with contract + profile |
| Affiliate links | ✅ Wired to real URLs |
| Dispute manager (client view) | ✅ Working with Galloway preset |
| Letter vault | ✅ Working |
| Education / master class | ✅ Working |
| Admin portal (backend) | ✅ Built, needs deploy |
| Dispute manager (admin view) | ✅ Built, needs deploy |
| Real Postgres database | ✅ Schema ready, needs migration |
| Railway deployment | 🔄 Needs GitHub + Railway setup |
| Stripe billing | ⏸️ Deferred |
| Real email (SendGrid) | ⏸️ Deferred |
| File upload to S3 | ⏸️ Deferred |
| DocuSign integration | ⏸️ Deferred |

---

## 🎯 Recommended Launch Sequence

**This week (by Friday):**
1. ✅ Soft launch `credxme.com` as-is — collect leads, test flow
2. 🔄 Deploy `credx-platform` to Railway for internal admin use
3. 🔄 Create your admin account and test the admin portal
4. 🔄 Manually onboard 1-2 test clients through both systems

**Next week:**
1. Connect Vercel frontend to Railway API for real data persistence
2. Add Stripe for payments
3. Add SendGrid for emails

---

## 🔧 Quick Fixes Made Today

1. **Affiliate links updated** — IdentityIQ and MyFreeScoreNow now point to real URLs
2. **Contract signing un-stubbed** — Users can now check a box and "sign" the agreement inline
3. **Profile save un-stubbed** — Profile data persists to localStorage and updates the dashboard
4. **Landing page redeployed** — Live at `https://credxme.com`
5. **Git repo initialized** — `credx-platform` is ready to push to GitHub for Railway
6. **Env files created** — `.env`, `apps/api/.env`, `apps/web/.env` are configured for production

---

## ❓ Blockers for You to Resolve

1. **Railway account + GitHub repo** — I can't create these for you
2. **JWT_SECRET** — Generate a strong random string for production
3. **Domain DNS for `api.credxme.com`** — Add CNAME record at your registrar
4. **Stripe account** — Still needed before you can collect automated payments

---

If you want me to do anything else before launch — like build a specific feature, fix a bug, or write more onboarding copy — just say the word.
