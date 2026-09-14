const axios = require('axios');
const { decryptSecret } = require('./crypto');

const http = axios.create({ timeout: 12000 });

async function introspectEmbeddedToken(token) {
  const appId = process.env.SALLA_APP_ID;
  if (!appId) throw new Error('SALLA_APP_ID is missing');
  const { data } = await http.post(
    'https://api.salla.dev/exchange-authority/v1/introspect',
    { token },
    { headers: { 's-source': appId, 'Content-Type': 'application/json' } },
  );
  if (!data?.success || !data?.data?.merchant_id) throw new Error('Salla token introspection failed');
  return data.data;
}

function authHeaders(store) {
  const token = decryptSecret(store?.salla?.accessTokenEnc);
  if (!token) throw new Error('No Salla access token stored for this merchant');
  return { Authorization: `Bearer ${token}` };
}

async function getUserInfo(accessToken) {
  const { data } = await http.get('https://accounts.salla.sa/oauth2/user/info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data?.data || null;
}

async function getAbandonedCart(store, cartId) {
  const { data } = await http.get(`https://api.salla.dev/admin/v2/carts/abandoned/${encodeURIComponent(cartId)}`, {
    headers: authHeaders(store),
  });
  return data?.data || null;
}

async function getProduct(store, productId) {
  const { data } = await http.get(`https://api.salla.dev/admin/v2/products/${encodeURIComponent(productId)}`, {
    headers: { ...authHeaders(store), 'Accept-Language': 'ar' },
  });
  return data?.data || null;
}

module.exports = { introspectEmbeddedToken, getUserInfo, getAbandonedCart, getProduct };
