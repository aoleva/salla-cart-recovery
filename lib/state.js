const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL =
  String(process.env.DATABASE_URL || '').trim();

const DATABASE_SSL =
  String(process.env.DATABASE_SSL || '')
    .trim()
    .toLowerCase();

let pool = null;
let initialized = false;

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultMessageTemplate() {
  return (
    'مرحبًا {customer_name} 👋\n' +
    'لاحظنا أن لديك {products_text} في سلتك لدى {store_name}.\n' +
    '{offer_line}\n' +
    'يمكنك إكمال طلبك بسهولة من هنا:\n' +
    '{checkout_url}\n\n' +
    'يسعدنا خدمتك 💚'
  );
}

function defaultStore(merchantId, seed = {}) {
  const id = String(merchantId || '').trim();
  const createdAt =
    String(seed.createdAt || nowIso());

  const store = {
    merchantId: id,
    storeName: '',
    storeDomain: '',
    active: true,

    settings: {
      enabled: false,
      discountEnabled: false,
      discountType: 'percent',
      discountValue: 10,
      couponCode: '',
      sendAfterMinutes: 30,
      messageTemplate:
        defaultMessageTemplate()
    },

    whatsapp: {
      instanceId: '',
      tokenEnc: '',
      phone: '',
      lastStatus: 'not_configured'
    },

    salla: {
      accessTokenEnc: '',
      refreshTokenEnc: '',
      expiresAt: null
    },

    createdAt,
    updatedAt:
      String(seed.updatedAt || createdAt)
  };

  return mergeStore(store, seed);
}

function mergeStore(base, extra = {}) {
  const result = {
    ...base,
    ...extra,

    settings: {
      ...(base.settings || {}),
      ...(extra.settings || {})
    },

    whatsapp: {
      ...(base.whatsapp || {}),
      ...(extra.whatsapp || {})
    },

    salla: {
      ...(base.salla || {}),
      ...(extra.salla || {})
    }
  };

  result.merchantId =
    String(result.merchantId || '').trim();

  result.storeName =
    String(result.storeName || '').trim();

  result.storeDomain =
    String(result.storeDomain || '').trim();

  result.active =
    result.active !== false;

  result.settings.enabled =
    result.settings.enabled === true;

  result.settings.discountEnabled =
    result.settings.discountEnabled === true;

  result.settings.discountType =
    result.settings.discountType === 'fixed'
      ? 'fixed'
      : 'percent';

  result.settings.discountValue =
    Math.max(
      0,
      Number(result.settings.discountValue) || 0
    );

  result.settings.couponCode =
    String(result.settings.couponCode || '')
      .trim()
      .slice(0, 50);

  result.settings.sendAfterMinutes =
    Math.min(
      10080,
      Math.max(
        1,
        Math.round(
          Number(result.settings.sendAfterMinutes) || 30
        )
      )
    );

  result.settings.messageTemplate =
    String(
      result.settings.messageTemplate ||
      defaultMessageTemplate()
    )
      .trim()
      .slice(0, 4000);

  result.whatsapp.instanceId =
    String(result.whatsapp.instanceId || '')
      .trim()
      .replace(/^instance/i, '');

  result.whatsapp.tokenEnc =
    String(result.whatsapp.tokenEnc || '').trim();

  result.whatsapp.phone =
    String(result.whatsapp.phone || '').trim();

  result.whatsapp.lastStatus =
    String(
      result.whatsapp.lastStatus ||
      'not_configured'
    ).trim();

  result.salla.accessTokenEnc =
    String(result.salla.accessTokenEnc || '').trim();

  result.salla.refreshTokenEnc =
    String(result.salla.refreshTokenEnc || '').trim();

  result.salla.expiresAt =
    result.salla.expiresAt ?? null;

  result.createdAt =
    String(result.createdAt || nowIso());

  result.updatedAt =
    String(result.updatedAt || nowIso());

  return result;
}

function normalizeStore(raw, merchantId) {
  return defaultStore(
    merchantId || raw?.merchantId,
    raw || {}
  );
}

function defaultJob(input = {}) {
  const now = nowIso();

  return {
    id: String(input.id || '').trim(),
    merchantId:
      String(input.merchantId || '').trim(),
    cartId:
      String(input.cartId || '').trim(),
    runAt:
      String(input.runAt || now),
    payload:
      input.payload &&
      typeof input.payload === 'object'
        ? input.payload
        : {},
    event:
      String(
        input.event ||
        'abandoned.cart'
      ).trim(),
    status:
      String(input.status || 'pending').trim(),
    attempts:
      Math.max(
        0,
        Number(input.attempts) || 0
      ),
    error:
      input.error ?? '',
    cancelReason:
      input.cancelReason ?? '',
    sentAt:
      input.sentAt ?? null,
    providerResponse:
      input.providerResponse ?? null,
    createdAt:
      String(input.createdAt || now),
    updatedAt:
      String(input.updatedAt || now)
  };
}

function shouldUseSsl() {
  if (
    ['1', 'true', 'yes', 'require']
      .includes(DATABASE_SSL)
  ) {
    return true;
  }

  return /[?&]sslmode=(require|verify-ca|verify-full)/i
    .test(DATABASE_URL);
}

function getPool() {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required. Add the Render PostgreSQL Internal Database URL to the web service environment.'
    );
  }

  if (!pool) {
    const config = {
      connectionString: DATABASE_URL,
      max: Math.max(
        2,
        Number(process.env.DB_POOL_MAX) || 5
      ),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    };

    if (shouldUseSsl()) {
      config.ssl = {
        rejectUnauthorized: false
      };
    }

    pool = new Pool(config);

    pool.on('error', (error) => {
      console.error(
        '❌ PostgreSQL pool error:',
        error.message
      );
    });
  }

  return pool;
}

async function initDatabase() {
  if (initialized) {
    return;
  }

  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_stores (
      merchant_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS recovery_jobs (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      cart_id TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS recovery_jobs_due_idx
      ON recovery_jobs (status, run_at)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS recovery_jobs_cart_idx
      ON recovery_jobs (merchant_id, cart_id)
  `);

  // لو السيرفر توقف أثناء تنفيذ مهمة، رجّع المهام القديمة للطابور.
  await db.query(`
    UPDATE recovery_jobs
    SET
      status = 'pending',
      data = jsonb_set(
        data,
        '{status}',
        '"pending"'::jsonb,
        true
      ),
      updated_at = NOW()
    WHERE
      status = 'processing'
      AND updated_at < NOW() - INTERVAL '10 minutes'
  `);

  initialized = true;

  await migrateLegacyStateIfPresent();

  console.log('✅ PostgreSQL state storage is ready');
}

async function checkDatabase() {
  try {
    const db = getPool();
    await db.query('SELECT 1');
    return true;
  } catch (_) {
    return false;
  }
}

async function migrateLegacyStateIfPresent() {
  const legacyPath =
    path.join(
      process.env.DATA_DIR ||
        path.join(__dirname, '..', 'data'),
      'state.json'
    );

  if (!fs.existsSync(legacyPath)) {
    return;
  }

  let legacy = null;

  try {
    legacy = JSON.parse(
      fs.readFileSync(legacyPath, 'utf8')
    );
  } catch (error) {
    console.warn(
      '⚠️ Could not read legacy state.json:',
      error.message
    );
    return;
  }

  const db = getPool();

  const storeEntries =
    Object.entries(legacy?.stores || {});

  for (const [merchantId, raw] of storeEntries) {
    const store =
      normalizeStore(raw, merchantId);

    await db.query(
      `
        INSERT INTO app_stores (
          merchant_id,
          data,
          created_at,
          updated_at
        )
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (merchant_id) DO NOTHING
      `,
      [
        store.merchantId,
        JSON.stringify(store),
        store.createdAt,
        store.updatedAt
      ]
    );
  }

  const jobEntries =
    Object.values(legacy?.jobs || {});

  for (const raw of jobEntries) {
    const job = defaultJob(raw);

    if (!job.id || !job.merchantId || !job.cartId) {
      continue;
    }

    await db.query(
      `
        INSERT INTO recovery_jobs (
          id,
          merchant_id,
          cart_id,
          run_at,
          status,
          data,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        job.id,
        job.merchantId,
        job.cartId,
        job.runAt,
        job.status,
        JSON.stringify(job),
        job.createdAt,
        job.updatedAt
      ]
    );
  }

  if (storeEntries.length || jobEntries.length) {
    console.log(
      `✅ Legacy state migration checked: ${storeEntries.length} stores, ${jobEntries.length} jobs`
    );
  }
}

async function getStore(merchantId) {
  const id = String(merchantId || '').trim();

  if (!id) {
    return null;
  }

  const db = getPool();

  const result =
    await db.query(
      `
        SELECT data
        FROM app_stores
        WHERE merchant_id = $1
        LIMIT 1
      `,
      [id]
    );

  if (!result.rows.length) {
    return null;
  }

  return normalizeStore(
    result.rows[0].data,
    id
  );
}

async function ensureStore(merchantId, seed = {}) {
  const id = String(merchantId || '').trim();

  if (!id) {
    throw new Error('merchantId is required');
  }

  const existing =
    await getStore(id);

  if (existing) {
    const seedName =
      String(seed?.storeName || '').trim();

    const seedDomain =
      String(seed?.storeDomain || '').trim();

    const shouldUpdateName =
      seedName &&
      !String(existing.storeName || '').trim();

    const shouldUpdateDomain =
      seedDomain &&
      !String(existing.storeDomain || '').trim();

    if (shouldUpdateName || shouldUpdateDomain) {
      return updateStore(
        id,
        (draft) => {
          if (shouldUpdateName) {
            draft.storeName = seedName;
          }

          if (shouldUpdateDomain) {
            draft.storeDomain = seedDomain;
          }
        }
      );
    }

    return existing;
  }

  const store =
    defaultStore(id, {
      ...seed,
      merchantId: id
    });

  const db = getPool();

  await db.query(
    `
      INSERT INTO app_stores (
        merchant_id,
        data,
        created_at,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3, $4)
      ON CONFLICT (merchant_id) DO NOTHING
    `,
    [
      id,
      JSON.stringify(store),
      store.createdAt,
      store.updatedAt
    ]
  );

  return (
    await getStore(id)
  ) || store;
}

async function updateStore(merchantId, mutator) {
  const id = String(merchantId || '').trim();

  if (!id) {
    throw new Error('merchantId is required');
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const result =
      await client.query(
        `
          SELECT data
          FROM app_stores
          WHERE merchant_id = $1
          FOR UPDATE
        `,
        [id]
      );

    let store =
      result.rows.length
        ? normalizeStore(
            result.rows[0].data,
            id
          )
        : defaultStore(id);

    const draft = deepClone(store);

    if (typeof mutator === 'function') {
      await mutator(draft);
    }

    draft.merchantId = id;
    draft.updatedAt = nowIso();

    store = normalizeStore(draft, id);

    await client.query(
      `
        INSERT INTO app_stores (
          merchant_id,
          data,
          created_at,
          updated_at
        )
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (merchant_id)
        DO UPDATE SET
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        JSON.stringify(store),
        store.createdAt,
        store.updatedAt
      ]
    );

    await client.query('COMMIT');

    return store;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listStores() {
  const db = getPool();

  const result =
    await db.query(`
      SELECT merchant_id, data
      FROM app_stores
      ORDER BY updated_at DESC
    `);

  return result.rows.map(
    (row) =>
      normalizeStore(
        row.data,
        row.merchant_id
      )
  );
}

async function scheduleJob(input) {
  const job =
    defaultJob({
      ...input,
      status: 'pending',
      attempts: input?.attempts ?? 0,
      error: '',
      cancelReason: '',
      sentAt: null,
      providerResponse: null,
      updatedAt: nowIso()
    });

  if (!job.id || !job.merchantId || !job.cartId) {
    throw new Error(
      'Job id, merchantId and cartId are required'
    );
  }

  const db = getPool();

  await db.query(
    `
      INSERT INTO recovery_jobs (
        id,
        merchant_id,
        cart_id,
        run_at,
        status,
        data,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      ON CONFLICT (id)
      DO UPDATE SET
        merchant_id = EXCLUDED.merchant_id,
        cart_id = EXCLUDED.cart_id,
        run_at = EXCLUDED.run_at,
        status = EXCLUDED.status,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE recovery_jobs.status NOT IN ('sent', 'cancelled')
    `,
    [
      job.id,
      job.merchantId,
      job.cartId,
      job.runAt,
      job.status,
      JSON.stringify(job),
      job.createdAt,
      job.updatedAt
    ]
  );

  return job;
}

async function getDueJobs(limit = 20) {
  const max =
    Math.min(
      100,
      Math.max(1, Number(limit) || 20)
    );

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Requeue a job if a worker died while processing it.
    const stale =
      await client.query(`
        SELECT id, data
        FROM recovery_jobs
        WHERE
          status = 'processing'
          AND updated_at < NOW() - INTERVAL '10 minutes'
        FOR UPDATE SKIP LOCKED
      `);

    for (const row of stale.rows) {
      const job =
        defaultJob({
          ...row.data,
          status: 'pending',
          updatedAt: nowIso()
        });

      await client.query(
        `
          UPDATE recovery_jobs
          SET
            status = 'pending',
            data = $2::jsonb,
            updated_at = $3
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify(job),
          job.updatedAt
        ]
      );
    }

    const result =
      await client.query(
        `
          SELECT id, data
          FROM recovery_jobs
          WHERE
            status = 'pending'
            AND run_at <= NOW()
          ORDER BY run_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        `,
        [max]
      );

    const claimed = [];

    for (const row of result.rows) {
      const job =
        defaultJob({
          ...row.data,
          status: 'processing',
          attempts:
            Number(row.data?.attempts || 0) + 1,
          updatedAt: nowIso()
        });

      await client.query(
        `
          UPDATE recovery_jobs
          SET
            status = 'processing',
            data = $2::jsonb,
            updated_at = $3
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify(job),
          job.updatedAt
        ]
      );

      claimed.push(job);
    }

    await client.query('COMMIT');

    return claimed;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateJob(jobId, patch = {}) {
  const id = String(jobId || '').trim();

  if (!id) {
    return null;
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const result =
      await client.query(
        `
          SELECT data
          FROM recovery_jobs
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

    if (!result.rows.length) {
      await client.query('COMMIT');
      return null;
    }

    const current =
      defaultJob(result.rows[0].data);

    const next =
      defaultJob({
        ...current,
        ...(patch || {}),
        id,
        updatedAt: nowIso()
      });

    await client.query(
      `
        UPDATE recovery_jobs
        SET
          merchant_id = $2,
          cart_id = $3,
          run_at = $4,
          status = $5,
          data = $6::jsonb,
          updated_at = $7
        WHERE id = $1
      `,
      [
        id,
        next.merchantId,
        next.cartId,
        next.runAt,
        next.status,
        JSON.stringify(next),
        next.updatedAt
      ]
    );

    await client.query('COMMIT');

    return next;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cancelCartJobs(
  merchantId,
  cartId,
  reason = 'cancelled'
) {
  const merchant =
    String(merchantId || '').trim();

  const cart =
    String(cartId || '').trim();

  if (!merchant || !cart) {
    return 0;
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const result =
      await client.query(
        `
          SELECT id, data
          FROM recovery_jobs
          WHERE
            merchant_id = $1
            AND cart_id = $2
            AND status NOT IN ('sent', 'cancelled')
          FOR UPDATE
        `,
        [merchant, cart]
      );

    for (const row of result.rows) {
      const job =
        defaultJob({
          ...row.data,
          status: 'cancelled',
          cancelReason: reason,
          updatedAt: nowIso()
        });

      await client.query(
        `
          UPDATE recovery_jobs
          SET
            status = 'cancelled',
            data = $2::jsonb,
            updated_at = $3
          WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify(job),
          job.updatedAt
        ]
      );
    }

    await client.query('COMMIT');

    return result.rows.length;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    initialized = false;
  }
}

module.exports = {
  initDatabase,
  checkDatabase,
  closeDatabase,
  getStore,
  ensureStore,
  updateStore,
  listStores,
  scheduleJob,
  getDueJobs,
  updateJob,
  cancelCartJobs
};
