const axios = require('axios');
const { decryptSecret } = require('./crypto');

function instancePath(instanceId) {
  const raw = String(instanceId || '').trim();
  if (!raw) throw new Error('UltraMsg instance is not configured');
  return raw.startsWith('instance') ? raw : `instance${raw}`;
}

function credentials(store) {
  const instanceId = store?.whatsapp?.instanceId;
  const token = decryptSecret(store?.whatsapp?.tokenEnc);
  if (!instanceId || !token) throw new Error('WhatsApp is not provisioned for this merchant');
  return { instance: instancePath(instanceId), token };
}

function client(store) {
  const { instance, token } = credentials(store);
  return {
    base: `https://api.ultramsg.com/${instance}`,
    token,
  };
}

async function sendChat(store, to, body) {
  const { base, token } = client(store);
  const form = new URLSearchParams({ token, to: String(to), body: String(body), priority: '10' });
  const { data } = await axios.post(`${base}/messages/chat`, form, {
    timeout: Number(process.env.ULTRAMSG_TIMEOUT_MS) || 10000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data;
}

async function getStatus(store) {
  const { base, token } = client(store);
  const { data } = await axios.get(`${base}/instance/status`, { params: { token }, timeout: 10000 });
  return data;
}

async function getMe(store) {
  const { base, token } = client(store);
  const { data } = await axios.get(`${base}/instance/me`, { params: { token }, timeout: 10000 });
  return data;
}

async function getQrImage(store) {
  const { base, token } = client(store);
  return axios.get(`${base}/instance/qr`, {
    params: { token },
    responseType: 'arraybuffer',
    timeout: 10000,
    validateStatus: () => true,
  });
}

async function logout(store) {
  const { base, token } = client(store);
  const form = new URLSearchParams({ token });
  const { data } = await axios.post(`${base}/instance/logout`, form, {
    timeout: 10000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

module.exports = { sendChat, getStatus, getMe, getQrImage, logout };
