require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');

const { encryptSecret } = require('./lib/crypto');
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

const PORT =
  Number(process.env.PORT) || 3000;


// ========================================
// التحقق من إعدادات Production
// ========================================

function validateEnvironment() {
  const isProduction =
    String(process.env.NODE_ENV)
      .toLowerCase() === 'production';

  if (!isProduction) {
    return;
  }

  const required = [
    'SALLA_APP_ID',
    'SESSION_SECRET',
    'APP_ENCRYPTION_KEY',
    'ADMIN_KEY'
  ];

  const missing =
    required.filter(
      (key) =>
        !String(
          process.env[key] || ''
        ).trim()
    );

  const badEncryptionKey =
    !/^[a-fA-F0-9]{64}$/.test(
      String(
        process.env.APP_ENCRYPTION_KEY ||
        ''
      )
    );

  if (
    missing.length ||
    badEncryptionKey
  ) {
    throw new Error(
      'Production environment is not configured safely'
    );
  }
}

validateEnvironment();


// ========================================
// إعداد Express
// ========================================

app.disable('x-powered-by');

app.use(
  helmet({
    frameguard: false,

    contentSecurityPolicy: {
      useDefaults: true,

      directives: {
        frameAncestors: [
          "'self'",
          'https://*.salla.sa',
          'https://s.salla.sa'
        ],

        imgSrc: [
          "'self'",
          'data:',
          'blob:'
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
    extended: false
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      'public'
    )
  )
);


// منع Cache في الصفحات الحساسة
app.use(
  [
    '/dashboard',
    '/admin',
    '/api',
    '/admin/api'
  ],

  (req, res, next) => {
    res.set(
      'Cache-Control',
      'no-store'
    );

    next();
  }
);


// ========================================
// الصفحة الرئيسية
// ========================================

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    service:
      'Salla Cart Recovery v2',
    message:
      'Server is running'
  });
});


// ========================================
// Health Check
// ========================================

app.get(
  '/health',
  (req, res) => {
    res.json({
      status: 'healthy',

      uptime:
        Math.floor(
          process.uptime()
        ),

      timestamp:
        new Date()
          .toISOString()
    });
  }
);


// ========================================
// دخول التطبيق من داخل Salla
// ========================================

// تقديم نسخة المتصفح من Salla Embedded SDK
app.get(
  '/vendor/salla-embedded-sdk.js',

  (req, res) => {
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


// الصفحة المضمنة داخل لوحة سلة
app.get(
  '/salla/embedded',

  (req, res) => {
    res.set(
      'Cache-Control',
      'no-store'
    );

    res.sendFile(
      path.join(
        __dirname,
        'public',
        'embedded.html'
      )
    );
  }
);


// التحقق من جلسة Salla Embedded وإنشاء Session للتاجر
app.post(
  '/api/embedded/login',

  async (req, res) => {
    try {
      const token =
        String(
          req.body?.token || ''
        ).trim();

      if (!token) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              'Salla embedded token is missing.'
          });
      }

      const identity =
        await introspectEmbeddedToken(
          token
        );

      const merchantId =
        identity?.merchant_id;

      if (!merchantId) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              'تعذر تحديد المتجر من جلسة سلة.'
          });
      }

      await ensureStore(
        merchantId
      );

      setSessionCookie(
        res,
        merchantId
      );

      return res.json({
        success: true,
        merchantId:
          String(
            merchantId
          )
      });

    } catch (error) {
      console.error(
        '❌ Embedded auth failed:',
        error.response?.data ||
        error.message
      );

      return res
        .status(401)
        .json({
          success: false,
          message:
            'تعذر التحقق من جلسة سلة.'
        });
    }
  }
);


// ========================================
// دخول محلي للتجربة فقط
// ========================================

app.get(
  '/dev/login',

  async (req, res) => {
    if (
      String(
        process.env.DEV_MODE
      ).toLowerCase() !== 'true'
    ) {
      return res.sendStatus(404);
    }

    const merchant =
      String(
        req.query.merchant ||
        'demo'
      );

    await ensureStore(
      merchant,
      {
        storeName:
          'Demo Store'
      }
    );

    setSessionCookie(
      res,
      merchant
    );

    res.redirect(
      '/dashboard'
    );
  }
);


// ========================================
// Dashboard
// ========================================

app.get(
  '/dashboard',

  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'dashboard.html'
      )
    );
  }
);


// ========================================
// Admin
// ========================================

app.get(
  '/admin',

  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'public',
        'admin.html'
      )
    );
  }
);


// ========================================
// بيانات المتجر الحالي
// ========================================

app.get(
  '/api/store',
  sessionMiddleware,

  async (req, res) => {
    const store =
      getStore(
        req.merchantId
      ) ||
      await ensureStore(
        req.merchantId
      );

    res.json({
      success: true,

      store: {
        merchantId:
          store.merchantId,

        storeName:
          store.storeName,

        storeDomain:
          store.storeDomain,

        settings:
          store.settings,

        whatsapp: {
          instanceId:
            store.whatsapp
              ?.instanceId || '',

          phone:
            store.whatsapp
              ?.phone || '',

          lastStatus:
            store.whatsapp
              ?.lastStatus ||
            'not_configured',

          tokenConfigured:
            Boolean(
              store.whatsapp
                ?.tokenEnc
            )
        }
      }
    });
  }
);


// ========================================
// حفظ إعدادات التاجر
// ========================================

app.put(
  '/api/settings',
  sessionMiddleware,

  async (req, res) => {
    const input =
      req.body || {};

    const discountType =
      input.discountType ===
      'fixed'
        ? 'fixed'
        : 'percent';

    const discountValue =
      Math.max(
        0,
        Number(
          input.discountValue
        ) || 0
      );

    if (
      discountType ===
        'percent' &&
      discountValue > 100
    ) {
      return res
        .status(400)
        .json({
          message:
            'نسبة الخصم لا يمكن أن تتجاوز 100%.'
        });
    }

    const sendAfterMinutes =
      Math.min(
        10080,
        Math.max(
          0,
          Math.round(
            Number(
              input
                .sendAfterMinutes
            ) || 0
          )
        )
      );

    const messageTemplate =
      String(
        input.messageTemplate ||
        ''
      ).trim();

    if (!messageTemplate) {
      return res
        .status(400)
        .json({
          message:
            'نص الرسالة مطلوب.'
        });
    }

    const store =
      await updateStore(
        req.merchantId,

        (s) => {
          s.settings = {
            ...s.settings,

            enabled:
              Boolean(
                input.enabled
              ),

            discountEnabled:
              Boolean(
                input
                  .discountEnabled
              ),

            discountType,

            discountValue,

            couponCode:
              String(
                input
                  .couponCode ||
                ''
              )
                .trim()
                .slice(
                  0,
                  50
                ),

            sendAfterMinutes,

            messageTemplate:
              messageTemplate
                .slice(
                  0,
                  4000
                )
          };
        }
      );

    res.json({
      success: true,
      store
    });
  }
);


// ========================================
// حالة WhatsApp
// ========================================

app.get(
  '/api/whatsapp/status',
  sessionMiddleware,

  async (req, res) => {
    const store =
      getStore(
        req.merchantId
      );

    const provisioned =
      Boolean(
        store?.whatsapp
          ?.instanceId &&
        store?.whatsapp
          ?.tokenEnc
      );

    if (!provisioned) {
      return res.json({
        success: true,
        store
      });
    }

    try {
      const statusRaw =
        await getStatus(
          store
        );

      const accountStatus =
  statusRaw?.status?.accountStatus;

const mainStatus =
  typeof accountStatus === 'object'
    ? accountStatus?.status
    : accountStatus;

const subStatus =
  typeof accountStatus === 'object'
    ? accountStatus?.substatus
    : '';

const status =
  `${mainStatus || ''} ${subStatus || ''}`
    .trim()
    .toLowerCase();

const authenticated =
  status.includes('authenticated') ||
  status.includes('connected');

      let phone =
        store.whatsapp.phone ||
        '';

      if (authenticated) {
        try {
          const me =
            await getMe(
              store
            );

          phone =
            me?.id
              ?._serialized ||
            me?.id ||
            me?.phone ||
            me?.number ||
            phone;

        } catch (_) {
        }
      }

      const updatedStore =
        await updateStore(
          req.merchantId,

          (s) => {
            s.whatsapp.phone =
              String(
                phone || ''
              );

            s.whatsapp.lastStatus =
              status ||
              'unknown';
          }
        );

      res.json({
        success: true,
        store: updatedStore
      });

    } catch (error) {
      res
        .status(502)
        .json({
          message:
            error.response
              ?.data
              ?.error ||
            error.message
        });
    }
  }
);


// ========================================
// QR Code
// ========================================

app.get(
  '/api/whatsapp/qr',
  sessionMiddleware,

  async (req, res) => {
    const store =
      getStore(
        req.merchantId
      );

    if (
      !store?.whatsapp
        ?.instanceId ||
      !store?.whatsapp
        ?.tokenEnc
    ) {
      return res
        .status(409)
        .json({
          message:
            'WhatsApp لم يتم تجهيزه لهذا المتجر بعد.'
        });
    }

    try {
      const response =
        await getQrImage(
          store
        );

      const contentType =
        response.headers[
          'content-type'
        ] ||
        'image/png';

      if (
        contentType.includes(
          'application/json'
        )
      ) {
        const text =
          Buffer
            .from(
              response.data
            )
            .toString(
              'utf8'
            );

        return res
          .status(
            response.status
          )
          .type(
            'application/json'
          )
          .send(
            text
          );
      }

      res
        .status(
          response.status
        )
        .set(
          'Content-Type',
          contentType
        )
        .send(
          Buffer.from(
            response.data
          )
        );

    } catch (error) {
      res
        .status(502)
        .json({
          message:
            error.response
              ?.data
              ?.error ||
            error.message
        });
    }
  }
);


// ========================================
// فصل WhatsApp
// ========================================

app.post(
  '/api/whatsapp/logout',
  sessionMiddleware,

  async (req, res) => {
    try {
      const store =
        getStore(
          req.merchantId
        );

      const result =
        await logout(
          store
        );

      res.json({
        success: true,
        result
      });

    } catch (error) {
      res
        .status(502)
        .json({
          message:
            error.response
              ?.data
              ?.error ||
            error.message
        });
    }
  }
);


// ========================================
// Admin Protection
// ========================================

function requireAdmin(
  req,
  res,
  next
) {
  const given =
    String(
      req.headers[
        'x-admin-key'
      ] || ''
    );

  if (
    !process.env.ADMIN_KEY ||
    given !==
      process.env.ADMIN_KEY
  ) {
    return res
      .status(401)
      .json({
        message:
          'Admin key is invalid.'
      });
  }

  next();
}


// ========================================
// تجهيز UltraMsg للمتجر
// ========================================

app.post(
  '/admin/api/provision-whatsapp',
  requireAdmin,

  async (req, res) => {
    const merchantId =
      String(
        req.body
          ?.merchantId ||
        ''
      ).trim();

    const instanceId =
      String(
        req.body
          ?.instanceId ||
        ''
      ).trim();

    const token =
      String(
        req.body?.token ||
        ''
      ).trim();

    if (
      !merchantId ||
      !instanceId ||
      !token
    ) {
      return res
        .status(400)
        .json({
          message:
            'merchantId, instanceId and token are required.'
        });
    }

    await ensureStore(
      merchantId
    );

    const store =
      await updateStore(
        merchantId,

        (s) => {
          s.whatsapp.instanceId =
            instanceId.replace(
              /^instance/i,
              ''
            );

          s.whatsapp.tokenEnc =
            encryptSecret(
              token
            );

          s.whatsapp.lastStatus =
            'provisioned';
        }
      );

    try {
      const status =
        await getStatus(
          store
        );

      res.json({
        success: true,
        merchantId,
        instanceId:
          store.whatsapp
            .instanceId,
        providerStatus:
          status
      });

    } catch (error) {
      res
        .status(400)
        .json({
          success: false,

          message:
            'تم الحفظ لكن تعذر التحقق من UltraMsg.',

          details:
            error.response
              ?.data ||
            error.message
        });
    }
  }
);


// ========================================
// عرض المتاجر في Admin
// ========================================

app.get(
  '/admin/api/stores',
  requireAdmin,

  (req, res) => {
    res.json({
      success: true,

      stores:
        listStores()
          .map(
            (s) => ({
              merchantId:
                s.merchantId,

              storeName:
                s.storeName,

              active:
                s.active,

              whatsappProvisioned:
                Boolean(
                  s.whatsapp
                    ?.instanceId &&
                  s.whatsapp
                    ?.tokenEnc
                )
            })
          )
    });
  }
);


// ========================================
// الحصول على Merchant ID
// ========================================

function getMerchant(payload) {
  return (
    payload?.merchant ??
    payload?.data
      ?.merchant ??
    null
  );
}


// ========================================
// حفظ Authorization من Salla
// ========================================

async function handleAuthorize(
  payload
) {
  const merchantId =
    getMerchant(
      payload
    );

  const accessToken =
    payload?.data
      ?.access_token;

  if (
    !merchantId ||
    !accessToken
  ) {
    return;
  }

  await ensureStore(
    merchantId
  );

  let info = null;

  try {
    info =
      await getUserInfo(
        accessToken
      );

  } catch (error) {
    console.warn(
      '⚠️ Could not fetch Salla user info:',
      error.response?.data ||
      error.message
    );
  }

  await updateStore(
    merchantId,

    (store) => {
      store.active = true;

      store.salla.accessTokenEnc =
        encryptSecret(
          accessToken
        );

      store.salla.refreshTokenEnc =
        encryptSecret(
          payload?.data
            ?.refresh_token ||
          ''
        );

      store.salla.expiresAt =
        payload?.data
          ?.expires ||
        null;

      if (
        info?.merchant?.name
      ) {
        store.storeName =
          info.merchant.name;
      }

      if (
        info?.merchant?.domain
      ) {
        store.storeDomain =
          info.merchant.domain;
      }
    }
  );

  console.log(
    `✅ Authorized Salla merchant ${merchantId}`
  );
}


// ========================================
// جدولة السلة المتروكة
// ========================================

async function scheduleAbandonedCart(
  payload
) {
  const merchantId =
    getMerchant(
      payload
    ) ||

    (
      String(
        process.env.DEV_MODE
      ).toLowerCase() ===
      'true'

        ? 'demo'
        : null
    );

  if (!merchantId) {
    return console.warn(
      '⚠️ abandoned.cart payload has no merchant id'
    );
  }

  const store =
    getStore(
      merchantId
    ) ||
    await ensureStore(
      merchantId
    );

  if (
    !store.settings
      ?.enabled
  ) {
    return;
  }

  const data =
    payload.data || {};

  const cartId =
    cartIdFrom(
      data
    );

  if (!cartId) {
    return console.warn(
      '⚠️ abandoned.cart payload has no cart id'
    );
  }

  const minutes =
    Math.max(
      0,
      Number(
        store.settings
          ?.sendAfterMinutes
      ) || 0
    );

  const runAt =
    new Date(
      Date.now() +
      minutes *
      60 *
      1000
    ).toISOString();

  const jobId =
    `${merchantId}:${cartId}`;

  await scheduleJob({
    id: jobId,

    merchantId:
      String(
        merchantId
      ),

    cartId:
      String(
        cartId
      ),

    runAt,

    payload:
      data,

    event:
      payload.event
  });

  console.log(
    `🛒 Scheduled recovery for merchant ${merchantId}, cart ${cartId}`
  );
}


// ========================================
// معالجة Webhook
// ========================================

async function processWebhook(
  payload
) {
  const event =
    payload?.event;

  if (
    event ===
    'app.store.authorize'
  ) {
    return handleAuthorize(
      payload
    );
  }

  if (
    event ===
      'app.installed' ||
    event ===
      'app.updated'
  ) {
    const id =
      getMerchant(
        payload
      );

    if (id) {
      return ensureStore(
        id
      );
    }

    return;
  }

  if (
    event ===
    'app.uninstalled'
  ) {
    const id =
      getMerchant(
        payload
      );

    if (id) {
      return updateStore(
        id,

        (s) => {
          s.active =
            false;

          s.salla.accessTokenEnc =
            '';

          s.salla.refreshTokenEnc =
            '';

          s.salla.expiresAt =
            null;
        }
      );
    }
  }

  if (
    [
      'app.subscription.started',
      'app.subscription.renewed'
    ].includes(
      event
    )
  ) {
    const id =
      getMerchant(
        payload
      );

    if (id) {
      return updateStore(
        id,
        (s) => {
          s.active = true;
        }
      );
    }
  }

  if (
    [
      'app.subscription.expired',
      'app.subscription.canceled'
    ].includes(
      event
    )
  ) {
    const id =
      getMerchant(
        payload
      );

    if (id) {
      return updateStore(
        id,
        (s) => {
          s.active = false;
        }
      );
    }
  }

  if (
    event ===
      'abandoned.cart' ||
    event ===
      'abandoned.cart.updated' ||
    event ===
      'cart.abandoned'
  ) {
    return scheduleAbandonedCart(
      payload
    );
  }

  if (
    event ===
    'abandoned.cart.purchased'
  ) {
    const id =
      getMerchant(
        payload
      );

    const cartId =
      cartIdFrom(
        payload.data ||
        {}
      );

    if (
      id &&
      cartId
    ) {
      return cancelCartJobs(
        id,
        cartId,
        'purchased'
      );
    }
  }

  if (
    event ===
    'abandoned.cart.status.changed'
  ) {
    const id =
      getMerchant(
        payload
      );

    const data =
      payload.data || {};

    const cartId =
      cartIdFrom(
        data
      );

    if (
      id &&
      cartId &&
      isPurchasedStatus(
        data.status
      )
    ) {
      return cancelCartJobs(
        id,
        cartId,
        `status:${data.status}`
      );
    }
  }
}


// ========================================
// Webhook من Salla
// ========================================

app.post(
  '/webhook/salla',

  (req, res) => {
    const payload =
      req.body || {};

    // نرد على سلة بسرعة
    res
      .status(200)
      .json({
        status:
          'received'
      });

    setImmediate(
      () => {
        processWebhook(
          payload
        ).catch(
          (error) =>
            console.error(
              '❌ Salla webhook processing error:',
              error.response
                ?.data ||
              error.message
            )
        );
      }
    );
  }
);


// ========================================
// اختبار محلي للسلة المتروكة
// ========================================

app.post(
  '/dev/test-abandoned',

  async (req, res) => {
    if (
      String(
        process.env.DEV_MODE
      ).toLowerCase() !==
      'true'
    ) {
      return res.sendStatus(
        404
      );
    }

    const merchant =
      String(
        req.query.merchant ||
        'demo'
      );

    const payload = {
      event:
        'abandoned.cart',

      merchant,

      data:
        req.body
    };

    await processWebhook(
      payload
    );

    res.json({
      success: true,
      merchant
    });
  }
);


// ========================================
// 404
// ========================================

app.use(
  (req, res) => {
    res
      .status(404)
      .json({
        status: 'error',
        message:
          'Route not found'
      });
  }
);


// ========================================
// تشغيل السيرفر
// ========================================

app.listen(
  PORT,

  () => {
    console.log(
      '========================================='
    );

    console.log(
      `🚀 Salla Cart Recovery v2 running on port ${PORT}`
    );

    console.log(
      `🧪 Local dashboard: http://localhost:${PORT}/dev/login?merchant=demo`
    );

    console.log(
      `🔧 Admin: http://localhost:${PORT}/admin`
    );

    console.log(
      '========================================='
    );

    startWorker();
  }
);