const fs = require('fs');
const path = require('path');


// ========================================
// مكان حفظ البيانات
// محليًا: data/
// Production: DATA_DIR مثل /data
// ========================================

const dataDir =
  process.env.DATA_DIR
    ? path.resolve(
        process.env.DATA_DIR
      )
    : path.join(
        __dirname,
        '..',
        'data'
      );

const dataFile =
  path.join(
    dataDir,
    'state.json'
  );


// ========================================
// Lock لمنع الكتابة المتزامنة
// ========================================

let lock =
  Promise.resolve();


// ========================================
// الإعدادات الافتراضية للمتجر
// ========================================

const defaultSettings = {
  enabled: true,

  discountEnabled: true,

  discountType:
    'percent',

  discountValue:
    10,

  couponCode:
    '',

  sendAfterMinutes:
    30,

  messageTemplate:
    'أهلاً {customer_name} 👋\n' +
    'معك {store_name}\n\n' +
    'لاحظنا أن {products_text} ما زالت في سلتك بقيمة {cart_total} {currency} 🛒\n' +
    '{offer_line}\n\n' +
    'أكمل طلبك من هنا:\n{checkout_url}'
};


// ========================================
// إنشاء Settings جديدة
// ========================================

function createDefaultSettings() {
  return {
    ...defaultSettings
  };
}


// ========================================
// إنشاء WhatsApp State
// ========================================

function createWhatsappState() {
  return {
    instanceId:
      '',

    tokenEnc:
      '',

    phone:
      '',

    lastStatus:
      'not_configured'
  };
}


// ========================================
// إنشاء Salla State
// ========================================

function createSallaState() {
  return {
    accessTokenEnc:
      '',

    refreshTokenEnc:
      '',

    expiresAt:
      null
  };
}


// ========================================
// State فارغ
// ========================================

function emptyState() {
  return {
    stores: {},
    jobs: {}
  };
}


// ========================================
// تنظيف Merchant ID
// ========================================

function normalizeMerchantId(
  merchantId
) {
  const id =
    String(
      merchantId ??
      ''
    ).trim();

  if (!id) {
    throw new Error(
      'Merchant ID is required'
    );
  }

  return id;
}


// ========================================
// التأكد من وجود مجلد وملف البيانات
// ========================================

function ensureFile() {
  fs.mkdirSync(
    dataDir,
    {
      recursive: true
    }
  );

  if (
    !fs.existsSync(
      dataFile
    )
  ) {
    fs.writeFileSync(
      dataFile,

      JSON.stringify(
        emptyState(),
        null,
        2
      ),

      'utf8'
    );
  }
}


// ========================================
// تجهيز شكل State
// ========================================

function normalizeState(
  state
) {
  if (
    !state ||
    typeof state !==
      'object' ||
    Array.isArray(state)
  ) {
    return emptyState();
  }

  if (
    !state.stores ||
    typeof state.stores !==
      'object' ||
    Array.isArray(
      state.stores
    )
  ) {
    state.stores = {};
  }

  if (
    !state.jobs ||
    typeof state.jobs !==
      'object' ||
    Array.isArray(
      state.jobs
    )
  ) {
    state.jobs = {};
  }

  return state;
}


// ========================================
// قراءة البيانات
// ========================================

function readState() {
  ensureFile();

  try {
    const raw =
      fs.readFileSync(
        dataFile,
        'utf8'
      );

    if (
      !String(raw).trim()
    ) {
      return emptyState();
    }

    const parsed =
      JSON.parse(raw);

    return normalizeState(
      parsed
    );

  } catch (error) {
    console.error(
      '❌ Failed to read state file:',
      error.message
    );

    return emptyState();
  }
}


// ========================================
// حفظ البيانات
// ========================================

function writeState(state) {
  ensureFile();

  const safeState =
    normalizeState(
      state
    );

  const temp =
    `${dataFile}.tmp`;

  fs.writeFileSync(
    temp,

    JSON.stringify(
      safeState,
      null,
      2
    ),

    'utf8'
  );

  fs.renameSync(
    temp,
    dataFile
  );
}


// ========================================
// تنفيذ تعديل آمن على State
// ========================================

function mutate(fn) {
  if (
    typeof fn !==
    'function'
  ) {
    return Promise.reject(
      new Error(
        'State updater must be a function'
      )
    );
  }

  const task =
    lock
      .catch(
        () => {}
      )
      .then(
        async () => {
          const state =
            readState();

          const result =
            await fn(
              state
            );

          writeState(
            state
          );

          return result;
        }
      );

  // مهم:
  // حتى لو العملية الحالية فشلت
  // لا نترك Lock في حالة rejected
  lock =
    task.then(
      () => undefined,
      () => undefined
    );

  return task;
}


// ========================================
// إنشاء Store جديد
// ========================================

function createStore(
  merchantId,
  extra = {}
) {
  const now =
    new Date()
      .toISOString();

  const id =
    normalizeMerchantId(
      merchantId
    );

  return {
    merchantId:
      id,

    storeName:
      String(
        extra.storeName ||
        `متجر ${id}`
      ),

    storeDomain:
      String(
        extra.storeDomain ||
        ''
      ),

    active:
      extra.active !==
      undefined
        ? Boolean(
            extra.active
          )
        : true,

    settings:
      createDefaultSettings(),

    whatsapp:
      createWhatsappState(),

    salla:
      createSallaState(),

    createdAt:
      now,

    updatedAt:
      now
  };
}


// ========================================
// إصلاح Store قديم لو ناقص بيانات
// ========================================

function normalizeStore(
  store,
  merchantId
) {
  const id =
    normalizeMerchantId(
      merchantId
    );

  const now =
    new Date()
      .toISOString();

  store.merchantId =
    String(
      store.merchantId ||
      id
    );

  store.storeName =
    String(
      store.storeName ||
      `متجر ${id}`
    );

  store.storeDomain =
    String(
      store.storeDomain ||
      ''
    );

  if (
    typeof store.active !==
    'boolean'
  ) {
    store.active =
      true;
  }

  store.settings = {
    ...createDefaultSettings(),
    ...(
      store.settings ||
      {}
    )
  };

  store.whatsapp = {
    ...createWhatsappState(),
    ...(
      store.whatsapp ||
      {}
    )
  };

  store.salla = {
    ...createSallaState(),
    ...(
      store.salla ||
      {}
    )
  };

  store.createdAt =
    store.createdAt ||
    now;

  store.updatedAt =
    store.updatedAt ||
    now;

  return store;
}


// ========================================
// جلب متجر
// ========================================

function getStore(
  merchantId
) {
  const id =
    normalizeMerchantId(
      merchantId
    );

  const state =
    readState();

  const store =
    state.stores[
      id
    ];

  if (!store) {
    return null;
  }

  return normalizeStore(
    store,
    id
  );
}


// ========================================
// إنشاء متجر إذا لم يكن موجودًا
// ========================================

async function ensureStore(
  merchantId,
  extra = {}
) {
  const id =
    normalizeMerchantId(
      merchantId
    );

  return mutate(
    (state) => {

      const now =
        new Date()
          .toISOString();

      if (
        !state.stores[id]
      ) {
        state.stores[id] =
          createStore(
            id,
            extra
          );

      } else {
        const store =
          normalizeStore(
            state.stores[id],
            id
          );

        if (
          extra.storeName !==
          undefined
        ) {
          store.storeName =
            String(
              extra.storeName
            );
        }

        if (
          extra.storeDomain !==
          undefined
        ) {
          store.storeDomain =
            String(
              extra.storeDomain
            );
        }

        if (
          extra.active !==
          undefined
        ) {
          store.active =
            Boolean(
              extra.active
            );
        }

        store.updatedAt =
          now;
      }

      return state.stores[
        id
      ];
    }
  );
}


// ========================================
// تحديث متجر
// ========================================

async function updateStore(
  merchantId,
  updater
) {
  const id =
    normalizeMerchantId(
      merchantId
    );

  if (
    typeof updater !==
    'function'
  ) {
    throw new Error(
      'Store updater must be a function'
    );
  }

  return mutate(
    async (state) => {

      if (
        !state.stores[id]
      ) {
        state.stores[id] =
          createStore(
            id
          );
      }

      const store =
        normalizeStore(
          state.stores[id],
          id
        );

      await updater(
        store
      );

      store.updatedAt =
        new Date()
          .toISOString();

      return store;
    }
  );
}


// ========================================
// قائمة المتاجر
// ========================================

function listStores() {
  const state =
    readState();

  return Object.entries(
    state.stores
  ).map(
    (
      [
        merchantId,
        store
      ]
    ) =>
      normalizeStore(
        store,
        merchantId
      )
  );
}


// ========================================
// إنشاء Recovery Job
// ========================================

async function scheduleJob(
  job
) {
  if (
    !job ||
    typeof job !==
      'object'
  ) {
    throw new Error(
      'Recovery job is required'
    );
  }

  const id =
    String(
      job.id ??
      ''
    ).trim();

  if (!id) {
    throw new Error(
      'Recovery job ID is required'
    );
  }

  return mutate(
    (state) => {

      const existing =
        state.jobs[
          id
        ];

      // لو المهمة موجودة بالفعل
      // ومعلقة أو تم تنفيذها
      // لا ننشئ نسخة مكررة
      if (
        existing &&
        [
          'pending',
          'processing',
          'sent'
        ].includes(
          existing.status
        )
      ) {
        return existing;
      }

      state.jobs[id] = {
        ...job,

        id,

        status:
          'pending',

        createdAt:
          new Date()
            .toISOString(),

        updatedAt:
          new Date()
            .toISOString(),

        attempts:
          0
      };

      return state.jobs[
        id
      ];
    }
  );
}


// ========================================
// إلغاء Jobs للسلة
// ========================================

async function cancelCartJobs(
  merchantId,
  cartId,
  reason = 'cancelled'
) {
  const merchant =
    normalizeMerchantId(
      merchantId
    );

  const cart =
    String(
      cartId ??
      ''
    ).trim();

  if (!cart) {
    return;
  }

  return mutate(
    (state) => {

      for (
        const job
        of Object.values(
          state.jobs
        )
      ) {
        if (
          String(
            job.merchantId
          ) ===
            merchant &&

          String(
            job.cartId
          ) ===
            cart &&

          [
            'pending',
            'processing'
          ].includes(
            job.status
          )
        ) {
          job.status =
            'cancelled';

          job.cancelReason =
            String(
              reason ||
              'cancelled'
            );

          job.updatedAt =
            new Date()
              .toISOString();
        }
      }
    }
  );
}


// ========================================
// Jobs الجاهزة للإرسال
// ========================================

function getDueJobs(
  now = Date.now()
) {
  const state =
    readState();

  return Object.values(
    state.jobs
  )
    .filter(
      (job) => {
        if (
          job.status !==
          'pending'
        ) {
          return false;
        }

        const runAt =
          new Date(
            job.runAt
          ).getTime();

        return (
          Number.isFinite(
            runAt
          ) &&
          runAt <= now
        );
      }
    )
    .sort(
      (a, b) =>
        new Date(
          a.runAt
        ).getTime() -
        new Date(
          b.runAt
        ).getTime()
    );
}


// ========================================
// تحديث Job
// ========================================

async function updateJob(
  jobId,
  patch
) {
  const id =
    String(
      jobId ??
      ''
    ).trim();

  if (!id) {
    return null;
  }

  return mutate(
    (state) => {

      const job =
        state.jobs[
          id
        ];

      if (!job) {
        return null;
      }

      Object.assign(
        job,
        patch || {},
        {
          updatedAt:
            new Date()
              .toISOString()
        }
      );

      return job;
    }
  );
}


// ========================================
// Exports
// ========================================

module.exports = {
  defaultSettings,

  getStore,
  ensureStore,
  updateStore,
  listStores,

  scheduleJob,
  cancelCartJobs,
  getDueJobs,
  updateJob
};