/**
 * Allied Secondary School — MarzPay Payment Proxy
 * Deploy on a VPS with static IP, whitelist that IP on MarzPay.
 */
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const MARZPAY_BASE = 'https://wallet.wearemarz.com/api/v1';
const MARZPAY_AUTH = process.env.MARZPAY_AUTH || 'bWFyel9TTmdZMHRwb1FVcFk1WmNoOndIRWdTT0lhUjhCUjNMMDV2NlZFUHFzMTBOZFdNZzU4';
const PROXY_KEY    = process.env.PROXY_KEY || 'allied_ss_2025_proxy_key';

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/') return next();
    const key = req.headers['x-proxy-key'];
    if (key !== PROXY_KEY) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized proxy key' });
    }
    next();
});

// MarzPay headers — always use the hardcoded auth
const marzHeaders = {
    'Authorization': `Basic ${MARZPAY_AUTH}`,
};

app.get('/health', async (_, res) => {
    try {
        const r = await axios.get('https://api.ipify.org?format=json');
        res.json({ status: 'ok', service: 'Allied SS Payment Proxy', outgoing_ip: r.data.ip });
    } catch {
        res.json({ status: 'ok', service: 'Allied SS Payment Proxy' });
    }
});

app.get('/', (_, res) => res.json({ status: 'ok', service: 'Allied SS Payment Proxy v1.1' }));

// Collect money
app.post('/collect', async (req, res) => {
    try {
        // Remove internal field if present
        const body = { ...req.body };
        delete body._marzpay_auth;

        // MarzPay expects form-data with these fields
        const FormData = require('form-data');
        const form = new FormData();
        form.append('phone_number', body.phone_number || body.msisdn || '');
        form.append('amount', String(body.amount || ''));
        form.append('country', body.country || 'UG');
        form.append('reference', body.reference || '');
        form.append('description', body.description || body.reason || 'Payment');
        if (body.callback_url) form.append('callback_url', body.callback_url);

        console.log('[COLLECT] phone:', body.phone_number || body.msisdn, 'amount:', body.amount);

        const r = await axios.post(`${MARZPAY_BASE}/collect-money`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Basic ${MARZPAY_AUTH}`,
            }
        });
        console.log('[COLLECT] MarzPay response:', JSON.stringify(r.data));
        res.json(r.data);
    } catch (e) {
        console.error('[COLLECT] ERROR:', e.response?.status, JSON.stringify(e.response?.data));
        const status = e.response?.status || 500;
        res.status(status).json(e.response?.data ?? { status: 'error', message: e.message });
    }
});

// Check status
app.get('/status/:uuid', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const url = `${MARZPAY_BASE}/collect-money/${req.params.uuid}?_t=${Date.now()}`;
        const r = await axios.get(url, { headers: { 'Authorization': `Basic ${MARZPAY_AUTH}`, 'Accept': 'application/json' } });
        res.json(r.data);
    } catch (e) {
        console.error('[STATUS] ERROR:', e.response?.status, JSON.stringify(e.response?.data));
        res.json(e.response?.data ?? { status: 'error', message: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Allied SS Payment Proxy v1.1 on port ${PORT}`));
