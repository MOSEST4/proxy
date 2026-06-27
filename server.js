/**
 * Allied Secondary School — MarzPay Payment Proxy
 * 
 * Deploy this on a VPS with a static IP, then whitelist that IP on MarzPay.
 * PHP backend calls this proxy instead of MarzPay directly.
 * 
 * ENV VARS:
 *   MARZPAY_AUTH  - Base64 auth string for MarzPay
 *   PROXY_KEY     - Secret key that PHP must send to authenticate
 *   PORT          - Port to listen on (default 3000)
 */

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const MARZPAY_BASE = 'https://wallet.wearemarz.com/api/v1';
const MARZPAY_AUTH = process.env.MARZPAY_AUTH || 'bWFyel9TTmdZMHRwb1FVcFk1WmNoOndIRWdTT0lhUjhCUjNMMDV2NlZFUHFzMTBOZFdNZzU4';
const PROXY_KEY    = process.env.PROXY_KEY || 'allied_ss_2025_proxy_key';

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Auth middleware
app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/') return next();
    const key = req.headers['x-proxy-key'];
    if (key !== PROXY_KEY) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized' });
    }
    next();
});

// Shared headers for MarzPay
function getMarzHeaders(reqBody) {
    // Allow PHP to pass auth override in the request body
    const auth = reqBody?._marzpay_auth || MARZPAY_AUTH;
    // Remove internal field before forwarding
    if (reqBody?._marzpay_auth) delete reqBody._marzpay_auth;
    return {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
}

// Health check
app.get('/health', async (_, res) => {
    try {
        const r = await axios.get('https://api.ipify.org?format=json');
        res.json({ status: 'ok', service: 'Allied SS Payment Proxy', outgoing_ip: r.data.ip });
    } catch {
        res.json({ status: 'ok', service: 'Allied SS Payment Proxy' });
    }
});

app.get('/', (_, res) => {
    res.json({ status: 'ok', service: 'Allied SS Payment Proxy v1.0' });
});

// Collect money (initiate payment)
app.post('/collect', async (req, res) => {
    try {
        const headers = getMarzHeaders(req.body);
        console.log('[COLLECT] Request body:', JSON.stringify(req.body));
        console.log('[COLLECT] Auth header:', headers.Authorization?.substring(0, 20) + '...');
        const r = await axios.post(`${MARZPAY_BASE}/collect-money`, req.body, { headers });
        console.log('[COLLECT] Response:', JSON.stringify(r.data));
        res.json(r.data);
    } catch (e) {
        console.error('[COLLECT] Error:', e.message);
        console.error('[COLLECT] Response data:', JSON.stringify(e.response?.data));
        res.status(e.response?.status || 500).json(e.response?.data ?? { status: 'error', message: e.message });
    }
});

// Check payment status
app.get('/status/:uuid', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache');
    try {
        const headers = getMarzHeaders(null);
        const url = `${MARZPAY_BASE}/collect-money/${req.params.uuid}?_t=${Date.now()}`;
        const r = await axios.get(url, { headers: { ...headers, 'Cache-Control': 'no-cache' } });
        res.json(r.data);
    } catch (e) {
        console.error('[STATUS]', e.message, e.response?.data);
        res.json(e.response?.data ?? { status: 'error', message: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Allied SS Payment Proxy running on port ${PORT}`));
