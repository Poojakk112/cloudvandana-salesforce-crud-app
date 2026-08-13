require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_LOGIN_URL,
  SF_REDIRECT_URI,
  SESSION_SECRET
} = process.env;

const API_VERSION = 'v60.0';

// Field configuration for each supported Salesforce object.
// "fields" = shown in the table (Id + 5-10 fields as required by the assignment)
// "editableFields" = shown in the create/edit form
// "requiredFields" = fields Salesforce requires when creating a record
const OBJECT_CONFIG = {
  Account: {
    label: 'Account',
    fields: ['Id', 'Name', 'Industry', 'Phone', 'Website', 'BillingCity', 'Type'],
    editableFields: ['Name', 'Industry', 'Phone', 'Website', 'BillingCity', 'Type'],
    requiredFields: ['Name']
  },
  Opportunity: {
    label: 'Opportunity',
    fields: ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'Probability', 'Type'],
    editableFields: ['Name', 'StageName', 'Amount', 'CloseDate', 'Probability', 'Type'],
    requiredFields: ['Name', 'StageName', 'CloseDate']
  },
  Lead: {
    label: 'Lead',
    fields: ['Id', 'FirstName', 'LastName', 'Company', 'Email', 'Phone', 'Status'],
    editableFields: ['FirstName', 'LastName', 'Company', 'Email', 'Phone', 'Status'],
    requiredFields: ['LastName', 'Company']
  },
  Contact: {
    label: 'Contact',
    fields: ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department'],
    editableFields: ['FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department'],
    requiredFields: ['LastName']
  },
  Case: {
    label: 'Case',
    fields: ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'Description'],
    editableFields: ['Subject', 'Status', 'Priority', 'Origin', 'Description'],
    requiredFields: ['Subject']
  }
};

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));
app.use(express.static('public'));

function requireAuth(req, res, next) {
  if (!req.session.accessToken || !req.session.instanceUrl) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ---- Auth status check (frontend calls this on page load) ----
app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!req.session.accessToken });
});

// ---- Object/field configuration (frontend calls this to build dropdown + table) ----
app.get('/api/config', (req, res) => {
  res.json(OBJECT_CONFIG);
});

// ---- OAuth Step 1: send user to Salesforce login (with PKCE) ----
app.get('/login', (req, res) => {
  // PKCE: generate a random "code_verifier" and its hashed "code_challenge"
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Save the verifier in the session so we can use it in the callback step
  req.session.codeVerifier = codeVerifier;

  const authUrl = `${SF_LOGIN_URL}/services/oauth2/authorize?` +
    `response_type=code` +
    `&client_id=${encodeURIComponent(SF_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(SF_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent('api refresh_token id web')}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  res.redirect(authUrl);
});

// ---- OAuth Step 2: Salesforce redirects back here with a code ----
app.get('/oauth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Login failed: ${error_description || error}`);
  }

  try {
    const tokenRes = await axios.post(
      `${SF_LOGIN_URL}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: SF_CLIENT_ID,
        client_secret: SF_CLIENT_SECRET,
        redirect_uri: SF_REDIRECT_URI,
        code_verifier: req.session.codeVerifier
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    req.session.accessToken = tokenRes.data.access_token;
    req.session.instanceUrl = tokenRes.data.instance_url;
    req.session.refreshToken = tokenRes.data.refresh_token;

    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).send('Failed to complete login. Check server logs.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---- Helper: authenticated call to Salesforce REST API ----
async function sfRequest(req, method, path, data) {
  const url = `${req.session.instanceUrl}${path}`;
  return axios({
    method,
    url,
    data,
    headers: {
      Authorization: `Bearer ${req.session.accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// ---- READ (paginated, 20 at a time) ----
app.get('/api/objects/:type', requireAuth, async (req, res) => {
  const { type } = req.params;
  const config = OBJECT_CONFIG[type];
  if (!config) return res.status(400).json({ error: 'Unsupported object type' });

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const fieldList = config.fields.join(', ');
  const soql = `SELECT ${fieldList} FROM ${type} ORDER BY Id LIMIT ${limit} OFFSET ${offset}`;

  try {
    const result = await sfRequest(
      req, 'get',
      `/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`
    );
    res.json(result.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Query failed' });
  }
});

// ---- CREATE ----
app.post('/api/objects/:type', requireAuth, async (req, res) => {
  const { type } = req.params;
  if (!OBJECT_CONFIG[type]) return res.status(400).json({ error: 'Unsupported object type' });

  try {
    const result = await sfRequest(
      req, 'post',
      `/services/data/${API_VERSION}/sobjects/${type}`,
      req.body
    );
    res.status(201).json(result.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Create failed' });
  }
});

// ---- UPDATE ----
app.patch('/api/objects/:type/:id', requireAuth, async (req, res) => {
  const { type, id } = req.params;
  if (!OBJECT_CONFIG[type]) return res.status(400).json({ error: 'Unsupported object type' });

  try {
    await sfRequest(
      req, 'patch',
      `/services/data/${API_VERSION}/sobjects/${type}/${id}`,
      req.body
    );
    res.status(204).send();
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Update failed' });
  }
});

// ---- DELETE ----
app.delete('/api/objects/:type/:id', requireAuth, async (req, res) => {
  const { type, id } = req.params;
  if (!OBJECT_CONFIG[type]) return res.status(400).json({ error: 'Unsupported object type' });

  try {
    await sfRequest(req, 'delete', `/services/data/${API_VERSION}/sobjects/${type}/${id}`);
    res.status(204).send();
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Delete failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});