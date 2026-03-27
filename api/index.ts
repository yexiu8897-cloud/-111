import 'dotenv/config';
import express from 'express';
// 这里放你原本 server.ts 里的所有 import ...
import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

import fs from 'fs';
const app = express();
app.use(express.json());

// ... 这里粘贴你原本 server.ts 里的所有逻辑（飞书登录、表格读写等）
const app = express();
app.use(express.json());

// In-memory fallback for users (since we only have 1 table ID for shifts)
const users: any[] = [];
let fallbackShifts: any[] = []; // Used if Feishu is not configured

// Quotas Management
const QUOTAS_FILE = path.join(process.env.VERCEL === '1' ? '/tmp' : process.cwd(), 'quotas.json');
let quotas: Record<string, Record<string, number>> = {};
if (fs.existsSync(QUOTAS_FILE)) {
  try {
    quotas = JSON.parse(fs.readFileSync(QUOTAS_FILE, 'utf-8'));
  } catch (e) {
    console.error('Failed to parse quotas file', e);
  }
}

// Admin Password Management
const ADMIN_FILE = path.join(process.env.VERCEL === '1' ? '/tmp' : process.cwd(), 'admin.json');
let adminPassword = '123456'; // Default password
if (fs.existsSync(ADMIN_FILE)) {
  try {
    const adminData = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf-8'));
    if (adminData.password) {
      adminPassword = adminData.password;
    }
  } catch (e) {
    console.error('Failed to parse admin file', e);
  }
}

// Feishu Token Management
let tenantAccessToken = '';
let tokenExpire = 0;

async function getTenantAccessToken() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error('Feishu credentials not configured in environment variables.');
  }
  
  if (Date.now() < tokenExpire && tenantAccessToken) {
    return tenantAccessToken;
  }
  
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  });
  
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }
  
  tenantAccessToken = data.tenant_access_token;
  tokenExpire = Date.now() + (data.expire * 1000) - 60000;
  return tenantAccessToken;
}

// Feishu OAuth Routes
app.get('/api/auth/feishu/url', (req, res) => {
  const origin = req.query.origin as string;
  if (!origin) {
    return res.status(400).json({ error: 'Missing origin parameter' });
  }
  const redirectUri = `${origin}/api/auth/feishu/callback`;
  const appId = process.env.FEISHU_APP_ID;
  if (!appId) {
    return res.status(500).json({ error: 'FEISHU_APP_ID not configured' });
  }
  const state = encodeURIComponent(origin);
  const url = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
  res.json({ url });
});

app.get('/api/auth/feishu/callback', async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const origin = decodeURIComponent(state);
  // Ensure the redirectUri matches exactly what was sent in the /url request
  const redirectUri = `${origin}/api/auth/feishu/callback`;

  try {
    const token = await getTenantAccessToken();

    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });
    const tokenData = await tokenRes.json();

    if (tokenData.code !== 0) {
      throw new Error(`Token exchange failed: ${tokenData.msg}`);
    }

    const userAccessToken = tokenData.data.access_token;

    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`
      }
    });
    const userData = await userRes.json();

    if (userData.code !== 0) {
      throw new Error(`Get user info failed: ${userData.msg}`);
    }

    const safeUserData = JSON.stringify(userData.data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    res.send(`
      <html><body><script>
        const user = ${safeUserData};
        if (window.opener) {
          window.opener.postMessage({ type: 'FEISHU_AUTH_SUCCESS', user }, '*');
          window.close();
        } else {
          localStorage.setItem('feishu_user', JSON.stringify(user));
          window.location.href = '${origin}/';
        }
      </script></body></html>
    `);
  } catch (error: any) {
    console.error('Feishu OAuth Error:', error);
    res.send(`<html><body><h3>Authentication Failed</h3><p>${error.message}</p></body></html>`);
  }
});

// API Routes
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/admin/password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword !== adminPassword) {
    return res.status(401).json({ error: 'Invalid current password' });
  }
  adminPassword = newPassword;
  try {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ password: adminPassword }, null, 2));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/quotas', (req, res) => {
  res.json(quotas);
});

app.post('/api/quotas', (req, res) => {
  quotas = req.body;
  try {
    fs.writeFileSync(QUOTAS_FILE, JSON.stringify(quotas, null, 2));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/me', (req, res) => {
  const userId = req.headers['x-user-id'];
  const user = users.find(u => u.id === userId);
  if (user) {
    res.json(user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/users', (req, res) => {
  const { id, ...userData } = req.body;
  const userId = id || Date.now().toString();
  
  const existingIndex = users.findIndex(u => u.id === userId);
  const userRecord = { id: userId, ...userData, updatedAt: new Date().toISOString() };
  
  if (existingIndex >= 0) {
    users[existingIndex] = { ...users[existingIndex], ...userRecord };
  } else {
    users.push(userRecord);
  }
  
  res.json(userRecord);
});

app.get('/api/debug/fields', async (req, res) => {
  try {
    const token = await getTenantAccessToken();
    const appToken = process.env.FEISHU_APP_TOKEN;
    const tableId = process.env.FEISHU_TABLE_ID;
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/shifts', async (req, res) => {
  const { date } = req.query;
  
  if (!process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) {
    console.warn('Feishu not configured, using in-memory fallback');
    let results = fallbackShifts;
    if (date) {
      results = results.filter(s => s.date === date);
    }
    return res.json(results);
  }

  try {
    const token = await getTenantAccessToken();
    const appToken = process.env.FEISHU_APP_TOKEN;
    const tableId = process.env.FEISHU_TABLE_ID;
    
    let allRecords: any[] = [];
    let hasMore = true;
    let pageToken = '';
    
    while (hasMore) {
      const body: any = { page_size: 500 };
      if (pageToken) body.page_token = pageToken;
      
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;
      console.log(`[Feishu API] Fetching shifts from: ${url}`);
      console.log(`[Feishu API] AppToken: ${appToken}, TableId: ${tableId}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      if (data.code !== 0) {
        console.error(`[Feishu API] Error response:`, data);
        throw new Error(data.msg);
      }
      
      if (data.data && data.data.items) {
        allRecords = allRecords.concat(data.data.items.map((item: any) => {
          const normalizedFields: any = {};
          if (item.fields) {
            for (const [key, value] of Object.entries(item.fields)) {
              if (Array.isArray(value) && value.length > 0 && value[0].text !== undefined) {
                normalizedFields[key] = value.map((v: any) => v.text).join('');
              } else if (key === 'date' && typeof value === 'number') {
                const dateObj = new Date(value);
                normalizedFields[key] = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
              } else {
                normalizedFields[key] = value;
              }
            }
          }
          return {
            record_id: item.record_id,
            ...normalizedFields
          };
        }));
      }
      
      hasMore = data.data.has_more;
      pageToken = data.data.page_token;
    }
    
    if (date) {
      allRecords = allRecords.filter(r => r.date === date);
    }
    
    res.json(allRecords);
  } catch (error: any) {
    console.error('Feishu API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shifts', async (req, res) => {
  const shift = req.body;
  if (!shift.uid || !shift.date) {
    return res.status(400).json({ error: 'Missing uid or date' });
  }

  if (!process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) {
    const existingIndex = fallbackShifts.findIndex(s => s.date === shift.date && s.uid === shift.uid);
    if (existingIndex >= 0) {
      fallbackShifts[existingIndex] = { ...fallbackShifts[existingIndex], ...shift, updatedAt: new Date().toISOString() };
    } else {
      fallbackShifts.push({ ...shift, updatedAt: new Date().toISOString() });
    }
    return res.json({ success: true, shift });
  }
  
  try {
    const token = await getTenantAccessToken();
    const appToken = process.env.FEISHU_APP_TOKEN;
    const tableId = process.env.FEISHU_TABLE_ID;
    
    const searchUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;
    console.log(`[Feishu API POST] Searching existing record at: ${searchUrl}`);
    const searchBody = {
      filter: {
        conjunction: "and",
        conditions: [
          { field_name: "uid", operator: "is", value: [shift.uid] }
        ]
      }
    };
    console.log(`[Feishu API POST] Search body:`, JSON.stringify(searchBody));

    const searchRes = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });
    
    const searchData = await searchRes.json();
    console.log(`[Feishu API POST] Search response:`, JSON.stringify(searchData));
    if (searchData.code !== 0) throw new Error(`Search failed: ${searchData.msg} - ${JSON.stringify(searchData)}`);
    
    // Filter by date in memory to avoid Feishu DateTime strict type issues in search API
    const existingRecord = searchData.data?.items?.find((item: any) => {
      // Handle both string dates and timestamp dates from Feishu
      const recordDate = item.fields.date;
      if (!recordDate) return false;
      if (typeof recordDate === 'number') {
        // Feishu timestamps are in milliseconds
        const dateObj = new Date(recordDate);
        const dateString = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
        return dateString === shift.date;
      }
      return recordDate === shift.date;
    });
    
    // Convert date string (YYYY-MM-DD) to timestamp (milliseconds) for Feishu DateTime field
    const dateObj = new Date(shift.date);
    // Set to noon UTC to avoid timezone issues shifting the date
    dateObj.setUTCHours(12, 0, 0, 0);
    const dateTimestamp = dateObj.getTime();

    const fields = {
      uid: shift.uid,
      date: dateTimestamp,
      shiftId: shift.shiftId || '',
      roleId: shift.roleId || '',
      subRoleId: shift.subRoleId || '',
      lineId: shift.lineId || '',
      leaveReason: shift.leaveReason || '',
      userName: shift.userName || '',
      roleName: shift.roleName || '',
      lineName: shift.lineName || '',
      shiftName: shift.shiftName || '',
      englishName: shift.englishName || '',
      chineseName: shift.chineseName || ''
    };
    
    console.log(`[Feishu API POST] Fields to write:`, JSON.stringify(fields));
    
    if (existingRecord) {
      console.log(`[Feishu API POST] Updating existing record: ${existingRecord.record_id}`);
      const updateRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existingRecord.record_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      const updateData = await updateRes.json();
      console.log(`[Feishu API POST] Update response:`, JSON.stringify(updateData));
      if (updateData.code !== 0) throw new Error(`Update failed: ${updateData.msg} - ${JSON.stringify(updateData)}`);
    } else {
      console.log(`[Feishu API POST] Creating new record`);
      const createRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      const createData = await createRes.json();
      console.log(`[Feishu API POST] Create response:`, JSON.stringify(createData));
      if (createData.code !== 0) throw new Error(`Create failed: ${createData.msg} - ${JSON.stringify(createData)}`);
    }
    
    res.json({ success: true, shift });
  } catch (error: any) {
    console.error('Feishu API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/shifts/user/:uid', async (req, res) => {
  const { uid } = req.params;

  if (!process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) {
    const now = new Date();
    fallbackShifts = fallbackShifts.filter(s => {
      if (s.uid !== uid) return true;
      const [year, month, day] = s.date.split('-').map(Number);
      const shiftDate = new Date(year, month - 1, day);
      const cutoff = new Date(shiftDate);
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(22, 0, 0, 0);
      return now > cutoff; // Keep if locked
    });
    return res.json({ success: true });
  }
  
  try {
    const token = await getTenantAccessToken();
    const appToken = process.env.FEISHU_APP_TOKEN;
    const tableId = process.env.FEISHU_TABLE_ID;
    
    // Fetch all records and filter in memory to avoid search API syntax issues
    const getRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const getData = await getRes.json();
    if (getData.code !== 0) throw new Error(`Fetch failed: ${getData.msg}`);
    
    const allRecords = getData.data?.items || [];
    const now = new Date();
    
    const userRecords = allRecords.filter((record: any) => {
      const fieldUid = record.fields.uid;
      const uidStr = Array.isArray(fieldUid) ? fieldUid[0]?.text : fieldUid;
      if (uidStr !== uid) return false;
      
      const fieldDate = record.fields.date;
      let dateStr = Array.isArray(fieldDate) ? fieldDate[0]?.text : fieldDate;
      if (typeof dateStr === 'number') {
        const dateObj = new Date(dateStr);
        dateStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
      }
      
      if (!dateStr || typeof dateStr !== 'string') return false;
      
      const [year, month, day] = dateStr.split('-').map(Number);
      const shiftDate = new Date(year, month - 1, day);
      const cutoff = new Date(shiftDate);
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(22, 0, 0, 0);
      
      return now <= cutoff; // Only delete editable records
    });
    
    // Delete all found records
    for (const record of userRecords) {
      const deleteRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${record.record_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const deleteData = await deleteRes.json();
      if (deleteData.code !== 0) console.error(`Failed to delete record ${record.record_id}: ${deleteData.msg}`);
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Feishu API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/shifts/:id', async (req, res) => {
  const { id } = req.params;
  const firstUnderscoreIndex = id.indexOf('_');
  const date = id.substring(0, firstUnderscoreIndex);
  const uid = id.substring(firstUnderscoreIndex + 1);

  if (!process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) {
    const index = fallbackShifts.findIndex(s => s.date === date && s.uid === uid);
    if (index >= 0) {
      fallbackShifts.splice(index, 1);
      return res.json({ success: true });
    } else {
      return res.status(404).json({ error: 'Shift not found' });
    }
  }
  
  try {
    const token = await getTenantAccessToken();
    const appToken = process.env.FEISHU_APP_TOKEN;
    const tableId = process.env.FEISHU_TABLE_ID;
    
    const searchRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          conjunction: "and",
          conditions: [
            { field_name: "uid", operator: "is", value: [uid] }
          ]
        }
      })
    });
    
    const searchData = await searchRes.json();
    console.log(`[Feishu API DELETE] Search response:`, JSON.stringify(searchData));
    if (searchData.code !== 0) throw new Error(`Search failed: ${searchData.msg}`);
    
    const existingRecord = searchData.data?.items?.find((item: any) => {
      const recordDate = item.fields.date;
      console.log(`[Feishu API DELETE] Checking record date:`, recordDate, 'against', date);
      if (!recordDate) return false;
      if (typeof recordDate === 'number') {
        const dateObj = new Date(recordDate);
        const dateString = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
        return dateString === date;
      }
      return recordDate === date;
    });
    
    if (existingRecord) {
      const deleteRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existingRecord.record_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const deleteData = await deleteRes.json();
      if (deleteData.code !== 0) throw new Error(`Delete failed: ${deleteData.msg}`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Shift not found' });
    }
  } catch (error: any) {
    console.error('Feishu API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.VERCEL !== '1') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT as number, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

// Only start the server if not running on Vercel
if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;

// 确保这段逻辑保留，用于适配 Vercel 环境
async function startServer() {
  if (process.env.VERCEL !== '1') {
    // 只有在本地开发时才启动 Vite 和 端口监听
    const PORT = process.env.PORT || 3000;
    app.listen(PORT as number, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

// 必须导出 app 供 Vercel 调用
export default app;