# CloudVandana Assignment — Salesforce CRUD App

A web app that logs into Salesforce via OAuth 2.0 and performs Create, Read,
Update, and Delete operations on Account, Opportunity, Lead, Contact, and
Case records, with infinite-scroll pagination (20 records at a time).

## Tech stack
- Backend: Node.js + Express (handles OAuth login and proxies calls to the Salesforce REST API)
- Frontend: Plain HTML/CSS/JavaScript served by the same Express server

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `SF_CLIENT_ID` — your Consumer Key from the External Client App
- `SF_CLIENT_SECRET` — your Consumer Secret
- `SESSION_SECRET` — any random string

Then run:

```bash
npm start
```

Visit `http://localhost:3000` and click "Login with Salesforce".

## 2. Deployment

1. Deploy this app to a free host (Render, Railway, Cyclic, etc.)
2. Set the same environment variables on the host as in your `.env`
3. Once deployed, update `SF_REDIRECT_URI` to your live URL, e.g.
   `https://your-app.onrender.com/oauth/callback`
4. In Salesforce Setup → External Client Apps → your app → Settings →
   OAuth Settings, update the **Callback URL** to match the new redirect URI
5. Redeploy with the updated `SF_REDIRECT_URI` environment variable

## 3. Submission
Send CloudVandana:
- The deployed app URL
- The GitHub repository link
- Your updated resume
