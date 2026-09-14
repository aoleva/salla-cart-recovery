const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'state.json');
let lock = Promise.resolve();

const defaultSettings = {
  enabled: true,
  discountEnabled: true,
  discountType: 'percent',
  discountValue: 10,
  couponCode: '',
  sendAfterMinutes: 30,
  messageTemplate:
    'أهلاً {customer_name} 👋\n' +
    'معك {store_name}\n\n' +
    'لاحظنا أن {products_text} ما زالت في سلتك بقيمة {cart_total} {currency} 🛒\n' +
    '{offer_line}\n\n' +
    'أكمل طلبك من هنا:\n{checkout_url}',
};

function emptyState() {
  return { stores: {}, jobs: {} };
}

function ensureFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(emptyState(), null, 2));
}

function readState() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    parsed.stores ||= {};
    parsed.jobs ||= {};
    return parsed;
  } catch (error) {
    console.error('❌ Failed to read state file:', error.message);
    return emptyState();
  }
}

function writeState(state) {
  ensureFile();
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, dataFile);
}

function mutate(fn) {
  lock = lock.then(async () => {
    const state = readState();
    const result = await fn(state);
    writeState(state);
    return result;
  });
  return lock;
}

function getStore(merchantId) {
  const state = readState();
  return state.stores[String(merchantId)] || null;
}

async function ensureStore(merchantId, extra = {}) {
  return mutate((state) => {
    const id = String(merchantId);
    const now = new Date().toISOString();
    if (!state.stores[id]) {
      state.stores[id] = {
        merchantId: id,
        storeName: extra.storeName || `متجر ${id}`,
        storeDomain: extra.storeDomain || '',
        active: true,
        settings: { ...defaultSettings },
        whatsapp: { instanceId: '', tokenEnc: '', phone: '', lastStatus: 'not_configured' },
        salla: { accessTokenEnc: '', refreshTokenEnc: '', expiresAt: null },
        createdAt: now,
        updatedAt: now,
      };
    } else {
      state.stores[id].updatedAt = now;
      Object.assign(state.stores[id], extra);
    }
    return state.stores[id];
  });
}

async function updateStore(merchantId, updater) {
  return mutate((state) => {
    const id = String(merchantId);
    const now = new Date().toISOString();
    if (!state.stores[id]) {
      state.stores[id] = {
        merchantId: id,
        storeName: `متجر ${id}`,
        storeDomain: '',
        active: true,
        settings: { ...defaultSettings },
        whatsapp: { instanceId: '', tokenEnc: '', phone: '', lastStatus: 'not_configured' },
        salla: { accessTokenEnc: '', refreshTokenEnc: '', expiresAt: null },
        createdAt: now,
        updatedAt: now,
      };
    }
    updater(state.stores[id]);
    state.stores[id].updatedAt = now;
    return state.stores[id];
  });
}

function listStores() {
  return Object.values(readState().stores);
}

async function scheduleJob(job) {
  return mutate((state) => {
    const id = String(job.id);
    const existing = state.jobs[id];
    if (existing && ['pending', 'processing', 'sent'].includes(existing.status)) return existing;
    state.jobs[id] = { ...job, id, status: 'pending', createdAt: new Date().toISOString(), attempts: 0 };
    return state.jobs[id];
  });
}

async function cancelCartJobs(merchantId, cartId, reason = 'cancelled') {
  return mutate((state) => {
    for (const job of Object.values(state.jobs)) {
      if (String(job.merchantId) === String(merchantId) && String(job.cartId) === String(cartId) && job.status === 'pending') {
        job.status = 'cancelled';
        job.cancelReason = reason;
        job.updatedAt = new Date().toISOString();
      }
    }
  });
}

function getDueJobs(now = Date.now()) {
  return Object.values(readState().jobs)
    .filter((job) => job.status === 'pending' && new Date(job.runAt).getTime() <= now)
    .sort((a, b) => new Date(a.runAt) - new Date(b.runAt));
}

async function updateJob(jobId, patch) {
  return mutate((state) => {
    const job = state.jobs[String(jobId)];
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return job;
  });
}

module.exports = {
  defaultSettings,
  getStore,
  ensureStore,
  updateStore,
  listStores,
  scheduleJob,
  cancelCartJobs,
  getDueJobs,
  updateJob,
};
