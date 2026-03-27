import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(express.json());

// --- 1. 数据与路径管理 ---
const users: any[] = [];
let fallbackShifts: any[] = []; 
// Vercel 环境下使用 /tmp 目录处理临时文件
const QUOTAS_FILE = path.join(process.env.VERCEL === '1' ? '/tmp' : process.cwd(), 'quotas.json');
let quotas: Record<string, Record<string, number>> = {};
if (fs.existsSync(QUOTAS_FILE)) {
  try { quotas = JSON.parse(fs.readFileSync(QUOTAS_FILE, 'utf-8')); } catch (e) { console.error(e); }
}

const ADMIN_FILE = path.join(process.env.VERCEL === '1' ? '/tmp' : process.cwd(), 'admin.json');
let adminPassword = '123456';
if (fs.existsSync(ADMIN_FILE)) {
  try {
    const adminData = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf-8'));
    if (adminData.password) adminPassword = adminData.password;
  } catch (e) { console.error(e); }
}

// --- 2. 飞书 Token 管理 ---
let tenantAccessToken = '';
let tokenExpire = 0;

async function getTenantAccessToken() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error('Feishu credentials not configured');
  }
  if (Date.now() < tokenExpire && tenantAccessToken) return tenantAccessToken;
  
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET })
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Failed to get token: ${data.msg}`);
  tenantAccessToken = data.tenant_access_token;
  tokenExpire = Date.now() + (data.expire * 1000) - 60000;
  return tenantAccessToken;
}

// --- 3. 身份验证路由 ---
app.get('/api/auth/feishu/url', (req, res) => {
  const origin = req.query.origin as string;
  if (!origin) return res.status(400).json({ error: 'Missing origin' });
  const redirectUri = `${origin}/api/auth/feishu/callback`;
  const url = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${process.env.FEISHU_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(origin)}`;
  res.json({ url });
});

app.get('/api/auth/feishu/callback', async (req, res) => {
  const { code, state } = req.query;
  const origin = decodeURIComponent(state as string);
  try {
    const token = await getTenantAccessToken();
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: `${origin}/api/auth/feishu/callback` })
    });
    const tokenData = await tokenRes.json();
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { 'Authorization': `Bearer ${tokenData.data.access_token}` }
    });
    const userData = await userRes.json();
    const safeUserData = JSON.stringify(userData.data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    res.send(`<html><body><script>
      localStorage.setItem('feishu_user', JSON.stringify(${safeUserData}));
      window.location.href = '${origin}/';
    </script></body></html>`);
  } catch (error: any) {
    res.status(500).send(`Auth Failed: ${error.message}`);
  }
});

// --- 4. 排班 API (Bitable) ---
app.get('/api/shifts', async (req, res) => {
  if (!process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) return res.json(fallbackShifts);
  try {
    const token = await getTenantAccessToken();
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records?page_size=500`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    const shifts = data.data.items.map((item: any) => ({ record_id: item.record_id, ...item.fields }));
    res.json(shifts);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/shifts', async (req, res) => {
  const shift = req.body;
  try {
    const token = await getTenantAccessToken();
    const fields = { ...shift, date: new Date(shift.date).getTime() };
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    const data = await response.json();
    res.json({ success: data.code === 0 });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// --- 5. 启动与导出 ---
async function startServer() {
  // 仅在本地开发环境启动 Vite 中间件
  if (process.env.VERCEL !== '1') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    const PORT = process.env.PORT || 3000;
    app.listen(PORT as number, '0.0.0.0', () => console.log(`Local: http://localhost:${PORT}`));
  }
}

startServer();

// 必须导出默认 app 供 Vercel 调用
export default app;
