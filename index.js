require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const { encryptSecret, decryptSecret } = require('./lib/crypto');
const { sessionMiddleware, setSessionCookie } = require('./lib/auth');
const {
  introspectEmbeddedToken,
  getUserInfo
} = require('./lib/salla');
const {
  getStatus,
  getMe,
  getQrImage,
  logout
} = require('./lib/ultramsg');
const {
  getStore,
  ensureStore,
  updateStore,
  listStores,
  scheduleJob,
  cancelCartJobs
} = require('./lib/state');
const {
  startWorker,
  cartIdFrom,
  isPurchasedStatus
} = require('./lib/recovery');

const app = express();
const PORT = Number(process.env.PORT) || 3000;


// ========================================
// Environment
// ========================================

function validateEnvironment() {
  const isProduction =
    String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (!isProduction) {
    return;
  }

  const required = [
    'SALLA_APP_ID',
    'SESSION_SECRET',
    'APP_ENCRYPTION_KEY',
    'ADMIN_KEY',
    'WEBHOOK_SECRET'
  ];

  const missing = required.filter(
    (key) => !String(process.env[key] || '').trim()
  );

  const encryptionKey =
    String(process.env.APP_ENCRYPTION_KEY || '').trim();

  const badEncryptionKey =
    !/^[a-fA-F0-9]{64}$/.test(encryptionKey);

  if (missing.length) {
    throw new Error(
      `Missing production environment variables: ${missing.join(', ')}`
    );
  }

  if (badEncryptionKey) {
    throw new Error(
      'APP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.'
    );
  }
}

validateEnvironment();


// ========================================
// Helpers
// ========================================

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function isPlaceholderStoreName(name, merchantId) {
  const value =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');

  const id =
    String(merchantId || '')
      .trim();

  if (!value) {
    return true;
  }

  if (!id) {
    return false;
  }

  const normalized =
    value.toLowerCase();

  return [
    id,
    `متجر ${id}`,
    `store ${id}`,
    `merchant ${id}`
  ].some(
    (candidate) =>
      normalized ===
      String(candidate).toLowerCase()
  );
}

function extractStoreProfile(source) {
  const root =
    source?.data &&
    typeof source.data === 'object'
      ? source.data
      : source || {};

  const merchant =
    root?.merchant ||
    root?.store ||
    source?.merchant ||
    source?.store ||
    null;

  const name =
    String(
      merchant?.name ||
      merchant?.store_name ||
      root?.store_name ||
      ''
    ).trim();

  const domain =
    String(
      merchant?.domain ||
      merchant?.url ||
      root?.domain ||
      root?.store_domain ||
      ''
    ).trim();

  return {
    name,
    domain
  };
}

async function refreshStoreProfileFromSalla(merchantId, currentStore) {
  let store = currentStore;

  if (
    !store ||
    !store.salla?.accessTokenEnc
  ) {
    return store;
  }

  const needsName =
    isPlaceholderStoreName(
      store.storeName,
      merchantId
    );

  const needsDomain =
    !String(store.storeDomain || '').trim();

  if (!needsName && !needsDomain) {
    return store;
  }

  let accessToken = '';

  try {
    accessToken =
      String(
        decryptSecret(
          store.salla.accessTokenEnc
        ) ||
        ''
      ).trim();
  } catch (error) {
    console.warn(
      `⚠️ Could not decrypt Salla access token for merchant ${merchantId}:`,
      extractErrorMessage(error)
    );

    return store;
  }

  if (!accessToken) {
    return store;
  }

  try {
    const info =
      await getUserInfo(accessToken);

    const profile =
      extractStoreProfile(info);

    if (!profile.name && !profile.domain) {
      return store;
    }

    store =
      await updateStore(
        merchantId,
        (draft) => {
          if (profile.name) {
            draft.storeName =
              profile.name;
          }

          if (profile.domain) {
            draft.storeDomain =
              profile.domain;
          }
        }
      );

    return store;
  } catch (error) {
    console.warn(
      `⚠️ Could not refresh Salla store profile for merchant ${merchantId}:`,
      extractErrorMessage(error)
    );

    return store;
  }
}

function publicStore(store) {
  if (!store) {
    return null;
  }

  const merchantId =
    String(store.merchantId || '');

  const storeName =
    isPlaceholderStoreName(
      store.storeName,
      merchantId
    )
      ? ''
      : String(store.storeName || '');

  return {
    merchantId,
    storeName,
    storeDomain: String(store.storeDomain || ''),
    active: store.active !== false,
    settings: store.settings || {},
    whatsapp: {
      instanceId: String(store.whatsapp?.instanceId || ''),
      phone: String(store.whatsapp?.phone || ''),
      lastStatus: String(
        store.whatsapp?.lastStatus || 'not_configured'
      ),
      tokenConfigured: Boolean(store.whatsapp?.tokenEnc)
    }
  };
}

function getMerchant(payload) {
  const raw =
    payload?.merchant ??
    payload?.merchant_id ??
    payload?.data?.merchant ??
    payload?.data?.merchant_id ??
    null;

  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  if (typeof raw === 'object') {
    const nested =
      raw.id ??
      raw.merchant_id ??
      raw.merchantId ??
      null;

    return nested === null || nested === undefined
      ? null
      : String(nested);
  }

  return String(raw);
}

function normalizeUltraMsgStatus(statusRaw) {
  const accountStatus =
    statusRaw?.status?.accountStatus ??
    statusRaw?.accountStatus ??
    null;

  let mainStatus = '';
  let subStatus = '';

  if (accountStatus && typeof accountStatus === 'object') {
    mainStatus =
      accountStatus.status ??
      accountStatus.state ??
      '';

    subStatus =
      accountStatus.substatus ??
      accountStatus.subStatus ??
      '';
  } else if (accountStatus !== null && accountStatus !== undefined) {
    mainStatus = accountStatus;
  } else if (typeof statusRaw?.status === 'string') {
    mainStatus = statusRaw.status;
  }

  return `${mainStatus || ''} ${subStatus || ''}`
    .trim()
    .toLowerCase();
}

function isWhatsappConnected(status) {
  const value = String(status || '').toLowerCase();

  return (
    value.includes('authenticated') ||
    value.includes('connected')
  );
}

function extractErrorMessage(error, fallback = 'Unexpected error') {
  const value =
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.response?.data ??
    error?.message ??
    fallback;

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return fallback;
  }
}


// ========================================
// Express / Security
// ========================================

app.disable('x-powered-by');

app.use(
  helmet({
    frameguard: false,

    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: [
          "'self'",
          'https://salla.sa',
          'https://*.salla.sa',
          'https://s.salla.sa'
        ]
      }
    }
  })
);

app.use(
  express.json({
    limit: '512kb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '512kb'
  })
);


// ========================================
// Salla Embedded SDK browser bundle
// ========================================

app.get(
  '/vendor/salla-embedded-sdk.js',
  (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');

    res.sendFile(
      path.join(
        __dirname,
        'node_modules',
        '@salla.sa',
        'embedded-sdk',
        'dist',
        'umd',
        'index.js'
      )
    );
  }
);


// ========================================
// Static files
// ========================================

app.use(
  express.static(
    path.join(__dirname, 'public'),
    {
      index: false
    }
  )
);


// ========================================
// No-cache for sensitive routes
// ========================================

app.use(
  [
    '/salla/embedded',
    '/dashboard',
    '/admin',
    '/api',
    '/admin/api'
  ],
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }
);


// ========================================
// Home
// ========================================

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    service: 'Salla Cart Recovery v2',
    message: 'Server is running'
  });
});


// ========================================
// Health
// ========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});


// ========================================
// Salla Embedded entry page
// ========================================

app.get('/salla/embedded', (req, res) => {
  res.set('Cache-Control', 'no-store');

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'embedded.html'
    )
  );
});


// ========================================
// Embedded token -> local merchant session
// ========================================

app.post(
  '/api/embedded/login',
  async (req, res) => {
    try {
      const token =
        String(req.body?.token || '').trim();

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Salla embedded token is missing.'
        });
      }

      const identity =
        await introspectEmbeddedToken(token);

      const merchantId =
        identity?.merchant_id;

      if (!merchantId) {
        return res.status(401).json({
          success: false,
          message: 'تعذر تحديد المتجر من جلسة سلة.'
        });
      }

      await ensureStore(
        String(merchantId)
      );

      setSessionCookie(
        res,
        String(merchantId)
      );

      return res.json({
        success: true,
        merchantId: String(merchantId)
      });

    } catch (error) {
      console.error(
        '❌ Embedded auth failed:',
        extractErrorMessage(error)
      );

      return res.status(401).json({
        success: false,
        message: 'تعذر التحقق من جلسة سلة.'
      });
    }
  }
);


// ========================================
// Local dev login only
// ========================================

app.get(
  '/dev/login',
  async (req, res) => {
    if (
      String(process.env.DEV_MODE || '').toLowerCase() !== 'true'
    ) {
      return res.sendStatus(404);
    }

    const merchant =
      String(req.query.merchant || 'demo').trim() || 'demo';

    await ensureStore(
      merchant,
      {
        storeName: 'Demo Store'
      }
    );

    setSessionCookie(
      res,
      merchant
    );

    return res.redirect('/dashboard');
  }
);


// ========================================
// Dashboard
// ========================================

app.get('/dashboard', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'dashboard.html'
    )
  );
});


// ========================================
// Admin page
// ========================================

app.get('/admin', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'admin.html'
    )
  );
});


// ========================================
// Current merchant
// ========================================

app.get(
  '/api/store',
  sessionMiddleware,
  async (req, res) => {
    try {
      let store =
        getStore(req.merchantId) ||
        await ensureStore(req.merchantId);

      store =
        await refreshStoreProfileFromSalla(
          req.merchantId,
          store
        );

      return res.json({
        success: true,
        store: publicStore(store)
      });

    } catch (error) {
      console.error(
        '❌ Failed to load merchant store:',
        extractErrorMessage(error)
      );

      return res.status(500).json({
        success: false,
        message: 'تعذر تحميل بيانات المتجر.'
      });
    }
  }
);


// ========================================
// Save recovery settings
// ========================================

app.put(
  '/api/settings',
  sessionMiddleware,
  async (req, res) => {
    try {
      const input = req.body || {};

      const discountType =
        input.discountType === 'fixed'
          ? 'fixed'
          : 'percent';

      const discountValue =
        Math.max(
          0,
          Number(input.discountValue) || 0
        );

      if (
        discountType === 'percent' &&
        discountValue > 100
      ) {
        return res.status(400).json({
          success: false,
          message: 'نسبة الخصم لا يمكن أن تتجاوز 100%.'
        });
      }

      const sendAfterMinutes =
        Math.min(
          10080,
          Math.max(
            1,
            Math.round(
              Number(input.sendAfterMinutes) || 1
            )
          )
        );

      const messageTemplate =
        String(input.messageTemplate || '').trim();

      if (!messageTemplate) {
        return res.status(400).json({
          success: false,
          message: 'نص الرسالة مطلوب.'
        });
      }

      const store =
        await updateStore(
          req.merchantId,
          (s) => {
            s.settings = {
              ...s.settings,
              enabled: Boolean(input.enabled),
              discountEnabled: Boolean(input.discountEnabled),
              discountType,
              discountValue,
              couponCode:
                String(input.couponCode || '')
                  .trim()
                  .slice(0, 50),
              sendAfterMinutes,
              messageTemplate:
                messageTemplate.slice(0, 4000)
            };
          }
        );

      return res.json({
        success: true,
        store: publicStore(store)
      });

    } catch (error) {
      console.error(
        '❌ Failed to save settings:',
        extractErrorMessage(error)
      );

      return res.status(500).json({
        success: false,
        message: 'تعذر حفظ الإعدادات.'
      });
    }
  }
);


// ========================================
// WhatsApp status
// ========================================

app.get(
  '/api/whatsapp/status',
  sessionMiddleware,
  async (req, res) => {
    const store =
      getStore(req.merchantId);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'المتجر غير موجود.'
      });
    }

    const provisioned =
      Boolean(
        store.whatsapp?.instanceId &&
        store.whatsapp?.tokenEnc
      );

    if (!provisioned) {
      return res.json({
        success: true,
        store: publicStore(store)
      });
    }

    try {
      const statusRaw =
        await getStatus(store);

      const status =
        normalizeUltraMsgStatus(statusRaw) ||
        'unknown';

      const authenticated =
        isWhatsappConnected(status);

      let phone =
        String(store.whatsapp?.phone || '');

      if (authenticated) {
        try {
          const me =
            await getMe(store);

          phone = String(
            me?.id?._serialized ??
            me?.id ??
            me?.phone ??
            me?.number ??
            phone ??
            ''
          );
        } catch (error) {
          console.warn(
            '⚠️ UltraMsg getMe failed:',
            extractErrorMessage(error)
          );
        }
      }

      const updatedStore =
        await updateStore(
          req.merchantId,
          (s) => {
            s.whatsapp.phone = phone;
            s.whatsapp.lastStatus = status;
          }
        );

      return res.json({
        success: true,
        store: publicStore(updatedStore)
      });

    } catch (error) {
      return res.status(502).json({
        success: false,
        message: extractErrorMessage(
          error,
          'تعذر التحقق من حالة WhatsApp.'
        )
      });
    }
  }
);


// ========================================
// WhatsApp QR
// ========================================

app.get(
  '/api/whatsapp/qr',
  sessionMiddleware,
  async (req, res) => {
    const store =
      getStore(req.merchantId);

    if (
      !store?.whatsapp?.instanceId ||
      !store?.whatsapp?.tokenEnc
    ) {
      return res.status(409).json({
        success: false,
        message: 'WhatsApp لم يتم تجهيزه لهذا المتجر بعد.'
      });
    }

    try {
      const response =
        await getQrImage(store);

      const contentType =
        String(
          response.headers?.['content-type'] ||
          'application/octet-stream'
        );

      if (
        contentType.includes('application/json') ||
        contentType.includes('text/')
      ) {
        const text =
          Buffer.from(response.data)
            .toString('utf8');

        return res
          .status(response.status)
          .type(contentType)
          .send(text);
      }

      return res
        .status(response.status)
        .set('Content-Type', contentType)
        .set('Cache-Control', 'no-store')
        .send(Buffer.from(response.data));

    } catch (error) {
      return res.status(502).json({
        success: false,
        message: extractErrorMessage(
          error,
          'تعذر تحميل QR.'
        )
      });
    }
  }
);


// ========================================
// WhatsApp logout
// ========================================

app.post(
  '/api/whatsapp/logout',
  sessionMiddleware,
  async (req, res) => {
    try {
      const store =
        getStore(req.merchantId);

      if (
        !store?.whatsapp?.instanceId ||
        !store?.whatsapp?.tokenEnc
      ) {
        return res.status(409).json({
          success: false,
          message: 'WhatsApp لم يتم تجهيزه لهذا المتجر بعد.'
        });
      }

      const result =
        await logout(store);

      const updatedStore =
        await updateStore(
          req.merchantId,
          (s) => {
            s.whatsapp.phone = '';
            s.whatsapp.lastStatus = 'disconnected';
          }
        );

      return res.json({
        success: true,
        result,
        store: publicStore(updatedStore)
      });

    } catch (error) {
      return res.status(502).json({
        success: false,
        message: extractErrorMessage(
          error,
          'تعذر فصل WhatsApp.'
        )
      });
    }
  }
);


// ========================================
// Admin protection
// ========================================

function requireAdmin(req, res, next) {
  const expected =
    String(process.env.ADMIN_KEY || '').trim();

  const given =
    String(req.headers['x-admin-key'] || '').trim();

  if (
    !expected ||
    !given ||
    !safeEqual(given, expected)
  ) {
    return res.status(401).json({
      success: false,
      message: 'Admin key is invalid.'
    });
  }

  next();
}


// ========================================
// Provision UltraMsg for merchant
// ========================================

app.post(
  '/admin/api/provision-whatsapp',
  requireAdmin,
  async (req, res) => {
    try {
      const merchantId =
        String(req.body?.merchantId || '').trim();

      const instanceId =
        String(req.body?.instanceId || '').trim();

      const token =
        String(req.body?.token || '').trim();

      if (
        !merchantId ||
        !instanceId ||
        !token
      ) {
        return res.status(400).json({
          success: false,
          message:
            'merchantId, instanceId and token are required.'
        });
      }

      await ensureStore(merchantId);

      let store =
        await updateStore(
          merchantId,
          (s) => {
            s.whatsapp.instanceId =
              instanceId.replace(/^instance/i, '');

            s.whatsapp.tokenEnc =
              encryptSecret(token);

            s.whatsapp.phone = '';
            s.whatsapp.lastStatus = 'provisioned';
          }
        );

      try {
        const statusRaw =
          await getStatus(store);

        const normalizedStatus =
          normalizeUltraMsgStatus(statusRaw) ||
          'provisioned';

        store =
          await updateStore(
            merchantId,
            (s) => {
              s.whatsapp.lastStatus = normalizedStatus;
            }
          );

        return res.json({
          success: true,
          merchantId,
          instanceId: store.whatsapp.instanceId,
          providerStatus: statusRaw
        });

      } catch (error) {
        return res.status(400).json({
          success: false,
          message:
            'تم الحفظ لكن تعذر التحقق من UltraMsg.',
          details: extractErrorMessage(error)
        });
      }

    } catch (error) {
      console.error(
        '❌ WhatsApp provisioning failed:',
        extractErrorMessage(error)
      );

      return res.status(500).json({
        success: false,
        message: 'تعذر تجهيز WhatsApp للمتجر.'
      });
    }
  }
);


// ========================================
// Admin stores list
// ========================================

app.get(
  '/admin/api/stores',
  requireAdmin,
  (req, res) => {
    const stores =
      listStores().map(
        (store) => ({
          merchantId: String(store.merchantId || ''),
          storeName: String(store.storeName || ''),
          active: store.active !== false,
          whatsappProvisioned:
            Boolean(
              store.whatsapp?.instanceId &&
              store.whatsapp?.tokenEnc
            )
        })
      );

    return res.json({
      success: true,
      stores
    });
  }
);


// ========================================
// Salla authorize webhook
// ========================================

async function handleAuthorize(payload) {
  const merchantId =
    getMerchant(payload);

  const accessToken =
    String(
      payload?.data?.access_token ||
      payload?.access_token ||
      ''
    ).trim();

  if (
    !merchantId ||
    !accessToken
  ) {
    console.warn(
      '⚠️ app.store.authorize payload is missing merchant or access token'
    );
    return;
  }

  await ensureStore(merchantId);

  let info = null;

  try {
    info =
      await getUserInfo(accessToken);

  } catch (error) {
    console.warn(
      '⚠️ Could not fetch Salla user info:',
      extractErrorMessage(error)
    );
  }

  await updateStore(
    merchantId,
    (store) => {
      store.active = true;

      store.salla.accessTokenEnc =
        encryptSecret(accessToken) || '';

      store.salla.refreshTokenEnc =
        encryptSecret(
          payload?.data?.refresh_token ||
          payload?.refresh_token ||
          ''
        ) || '';

      store.salla.expiresAt =
        payload?.data?.expires ??
        payload?.data?.expires_at ??
        payload?.expires ??
        null;

      const profile =
        extractStoreProfile(info);

      if (profile.name) {
        store.storeName =
          profile.name;
      }

      if (profile.domain) {
        store.storeDomain =
          profile.domain;
      }
    }
  );

  console.log(
    `✅ Authorized Salla merchant ${merchantId}`
  );
}


// ========================================
// Schedule abandoned cart recovery
// ========================================

async function scheduleAbandonedCart(payload) {
  const merchantId =
    getMerchant(payload) ||
    (
      String(process.env.DEV_MODE || '').toLowerCase() === 'true'
        ? 'demo'
        : null
    );

  if (!merchantId) {
    console.warn(
      '⚠️ abandoned.cart payload has no merchant id'
    );
    return;
  }

  const store =
    getStore(merchantId) ||
    await ensureStore(merchantId);

  if (!store.settings?.enabled) {
    return;
  }

  const data =
    payload?.data || {};

  const cartId =
    cartIdFrom(data);

  if (!cartId) {
    console.warn(
      '⚠️ abandoned.cart payload has no cart id'
    );
    return;
  }

  const minutes =
    Math.max(
      1,
      Number(store.settings?.sendAfterMinutes) || 30
    );

  const runAt =
    new Date(
      Date.now() +
      minutes * 60 * 1000
    ).toISOString();

  const jobId =
    `${merchantId}:${cartId}`;

  await scheduleJob({
    id: jobId,
    merchantId: String(merchantId),
    cartId: String(cartId),
    runAt,
    payload: data,
    event: payload?.event || 'abandoned.cart'
  });

  console.log(
    `🛒 Scheduled recovery for merchant ${merchantId}, cart ${cartId}`
  );
}


// ========================================
// Process Salla webhook payload
// ========================================

async function processWebhook(payload) {
  const event =
    String(payload?.event || '').trim();

  if (!event) {
    console.warn(
      '⚠️ Salla webhook payload has no event'
    );
    return;
  }

  if (event === 'app.store.authorize') {
    return handleAuthorize(payload);
  }

  if (
    event === 'app.installed' ||
    event === 'app.updated'
  ) {
    const merchantId =
      getMerchant(payload);

    if (merchantId) {
      return ensureStore(merchantId);
    }

    return;
  }

  if (event === 'app.uninstalled') {
    const merchantId =
      getMerchant(payload);

    if (!merchantId) {
      return;
    }

    return updateStore(
      merchantId,
      (store) => {
        store.active = false;
        store.salla.accessTokenEnc = '';
        store.salla.refreshTokenEnc = '';
        store.salla.expiresAt = null;
      }
    );
  }

  if (
    [
      'app.subscription.started',
      'app.subscription.renewed'
    ].includes(event)
  ) {
    const merchantId =
      getMerchant(payload);

    if (merchantId) {
      return updateStore(
        merchantId,
        (store) => {
          store.active = true;
        }
      );
    }

    return;
  }

  if (
    [
      'app.subscription.expired',
      'app.subscription.canceled',
      'app.subscription.cancelled'
    ].includes(event)
  ) {
    const merchantId =
      getMerchant(payload);

    if (merchantId) {
      return updateStore(
        merchantId,
        (store) => {
          store.active = false;
        }
      );
    }

    return;
  }

  if (
    [
      'abandoned.cart',
      'abandoned.cart.updated',
      'cart.abandoned'
    ].includes(event)
  ) {
    return scheduleAbandonedCart(payload);
  }

  if (event === 'abandoned.cart.purchased') {
    const merchantId =
      getMerchant(payload);

    const cartId =
      cartIdFrom(
        payload?.data || {}
      );

    if (
      merchantId &&
      cartId
    ) {
      return cancelCartJobs(
        merchantId,
        cartId,
        'purchased'
      );
    }

    return;
  }

  if (event === 'abandoned.cart.status.changed') {
    const merchantId =
      getMerchant(payload);

    const data =
      payload?.data || {};

    const cartId =
      cartIdFrom(data);

    if (
      merchantId &&
      cartId &&
      isPurchasedStatus(data.status)
    ) {
      return cancelCartJobs(
        merchantId,
        cartId,
        `status:${data.status}`
      );
    }
  }
}


// ========================================
// Verify Salla webhook token strategy
// ========================================

function verifySallaWebhook(req) {
  const expected =
    String(process.env.WEBHOOK_SECRET || '').trim();

  if (!expected) {
    return false;
  }

  const authorization =
    String(req.headers.authorization || '').trim();

  const withoutBearer =
    authorization.replace(/^Bearer\s+/i, '').trim();

  return (
    safeEqual(authorization, expected) ||
    safeEqual(withoutBearer, expected)
  );
}


// ========================================
// Salla webhook endpoint
// ========================================

app.post(
  '/webhook/salla',
  (req, res) => {
    if (!verifySallaWebhook(req)) {
      console.warn(
        '⚠️ Rejected Salla webhook: invalid token'
      );

      return res.status(401).json({
        status: 'error',
        message: 'Invalid webhook token'
      });
    }

    const payload =
      req.body || {};

    // Respond quickly to Salla.
    res.status(200).json({
      status: 'received'
    });

    setImmediate(() => {
      processWebhook(payload)
        .catch(
          (error) => {
            console.error(
              '❌ Salla webhook processing error:',
              extractErrorMessage(error)
            );
          }
        );
    });
  }
);


// ========================================
// Local abandoned cart test
// ========================================

app.post(
  '/dev/test-abandoned',
  async (req, res) => {
    if (
      String(process.env.DEV_MODE || '').toLowerCase() !== 'true'
    ) {
      return res.sendStatus(404);
    }

    const merchant =
      String(req.query.merchant || 'demo').trim() || 'demo';

    const payload = {
      event: 'abandoned.cart',
      merchant,
      data: req.body || {}
    };

    await processWebhook(payload);

    return res.json({
      success: true,
      merchant
    });
  }
);


// ========================================
// 404
// ========================================

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});


// ========================================
// Global error handler
// ========================================

app.use((error, req, res, next) => {
  console.error(
    '❌ Unhandled request error:',
    extractErrorMessage(error)
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});


// ========================================
// Start server
// ========================================

app.listen(PORT, () => {
  console.log(
    '========================================='
  );

  console.log(
    `🚀 Salla Cart Recovery v2 running on port ${PORT}`
  );

  if (
    String(process.env.DEV_MODE || '').toLowerCase() === 'true'
  ) {
    console.log(
      `🧪 Local dashboard: http://localhost:${PORT}/dev/login?merchant=demo`
    );
  }

  console.log(
    `🔧 Admin: http://localhost:${PORT}/admin`
  );

  console.log(
    '========================================='
  );

  startWorker();
});
