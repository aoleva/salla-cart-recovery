const $ = (id) => document.getElementById(id);

const els = {
  enabled: $('enabled'),
  sendAfterMinutes: $('sendAfterMinutes'),
  discountEnabled: $('discountEnabled'),
  discountType: $('discountType'),
  discountValue: $('discountValue'),
  couponCode: $('couponCode'),
  messageTemplate: $('messageTemplate'),

  saveBtn: $('saveBtn'),
  saveStatus: $('saveStatus'),

  whatsappStatus: $('whatsappStatus'),
  whatsappPhone: $('whatsappPhone'),
  connectionBadge: $('connectionBadge'),

  connectWhatsappBtn: $('connectWhatsappBtn'),
  refreshWhatsappBtn: $('refreshWhatsappBtn'),

  qrContainer: $('qrContainer'),
  qrImage: $('qrImage'),

  messagePreview: $('messagePreview')
};

let currentStore = null;


// ===============================
// رسائل الحالة
// ===============================

function setSaveStatus(text, isError = false) {
  els.saveStatus.textContent = text || '';

  els.saveStatus.className =
    isError
      ? 'save-status error'
      : 'save-status success';
}


// ===============================
// معاينة الرسالة
// ===============================

function updatePreview() {
  let message =
    els.messageTemplate.value || '';

  const discountText =
    els.discountType.value === 'fixed'
      ? `${els.discountValue.value || 0} ريال`
      : `${els.discountValue.value || 0}%`;

  const replacements = {
    '{customer_name}': 'أحمد',

    '{store_name}':
      currentStore?.storeName ||
      'متجرك',

    '{products_text}':
      'المنتج «ساعة ذكية»',

    '{cart_total}':
      '250',

    '{currency}':
      'SAR',

    '{coupon_code}':
      els.couponCode.value ||
      'BACK10',

    '{discount}':
      discountText,

    '{offer_line}':
      els.discountEnabled.checked
        ? `استخدم كود ${els.couponCode.value || 'BACK10'} واحصل على خصم ${discountText}.`
        : '',

    '{checkout_url}':
      'https://example.com/cart'
  };

  for (
    const [key, value]
    of Object.entries(replacements)
  ) {
    message =
      message
        .split(key)
        .join(value);
  }

  els.messagePreview.textContent =
    message.trim();
}


// ===============================
// تحميل إعدادات المتجر
// ===============================

function applyStore(store) {
  currentStore = store;

  const settings =
    store.settings || {};

  els.enabled.checked =
    settings.enabled !== false;

  els.sendAfterMinutes.value =
    settings.sendAfterMinutes ?? 30;

  els.discountEnabled.checked =
    settings.discountEnabled !== false;

  els.discountType.value =
    settings.discountType ||
    'percent';

  els.discountValue.value =
    settings.discountValue ?? 10;

  els.couponCode.value =
    settings.couponCode || '';

  els.messageTemplate.value =
    settings.messageTemplate || '';

  updatePreview();
  applyWhatsappState(store);
}


// ===============================
// حالة WhatsApp
// ===============================

function applyWhatsappState(store) {
  const whatsapp =
    store.whatsapp || {};

  const status =
    String(
      whatsapp.lastStatus ||
      'not_configured'
    ).toLowerCase();

  els.whatsappPhone.textContent =
    whatsapp.phone
      ? `الرقم: ${whatsapp.phone}`
      : '';

  // WhatsApp متصل
  if (
    status.includes('authenticated') ||
    status.includes('connected')
  ) {
    els.whatsappStatus.textContent =
      'متصل ✅';

    els.connectionBadge.textContent =
      'WhatsApp متصل';

    els.connectionBadge.className =
      'status-badge status-online';

    els.connectWhatsappBtn.textContent =
      'WhatsApp متصل';

    els.connectWhatsappBtn.disabled =
      true;

    els.qrContainer.classList.add(
      'hidden'
    );

    return;
  }


  // UltraMsg مجهز لكن WhatsApp غير متصل
  if (
    whatsapp.instanceId &&
    whatsapp.tokenConfigured
  ) {
    els.whatsappStatus.textContent =
      'غير متصل';

    els.connectionBadge.textContent =
      'WhatsApp غير متصل';

    els.connectionBadge.className =
      'status-badge status-offline';

    els.connectWhatsappBtn.textContent =
      'ربط WhatsApp';

    els.connectWhatsappBtn.disabled =
      false;

    return;
  }


  // لم يتم تجهيز UltraMsg
  els.whatsappStatus.textContent =
    'لم يتم تجهيز WhatsApp بعد';

  els.connectionBadge.textContent =
    'WhatsApp غير مجهز';

  els.connectionBadge.className =
    'status-badge status-offline';

  els.connectWhatsappBtn.textContent =
    'ربط WhatsApp';

  els.connectWhatsappBtn.disabled =
    false;
}


// ===============================
// API Helper
// ===============================

async function api(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          'Content-Type':
            'application/json',

          ...(options.headers || {})
        },

        ...options
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch (_) {}

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `HTTP ${response.status}`
    );
  }

  return data;
}


// ===============================
// تحميل بيانات المتجر
// ===============================

async function loadStore() {
  try {
    const result =
      await api('/api/store');

    applyStore(
      result.store
    );

  } catch (error) {
    setSaveStatus(
      error.message,
      true
    );
  }
}


// ===============================
// حفظ إعدادات الاستعادة
// ===============================

async function saveSettings() {
  els.saveBtn.disabled = true;

  setSaveStatus(
    'جاري الحفظ...'
  );

  try {
    const payload = {
      enabled:
        els.enabled.checked,

      sendAfterMinutes:
        Number(
          els.sendAfterMinutes.value ||
          30
        ),

      discountEnabled:
        els.discountEnabled.checked,

      discountType:
        els.discountType.value,

      discountValue:
        Number(
          els.discountValue.value ||
          0
        ),

      couponCode:
        els.couponCode.value.trim(),

      messageTemplate:
        els.messageTemplate.value
    };

    const result =
      await api(
        '/api/settings',
        {
          method: 'PUT',

          body:
            JSON.stringify(
              payload
            )
        }
      );

    applyStore(
      result.store
    );

    setSaveStatus(
      'تم حفظ الإعدادات بنجاح ✅'
    );

  } catch (error) {
    setSaveStatus(
      error.message,
      true
    );

  } finally {
    els.saveBtn.disabled =
      false;
  }
}


// ===============================
// تحديث حالة WhatsApp
// ===============================

async function refreshWhatsapp() {
  els.refreshWhatsappBtn.disabled =
    true;

  els.refreshWhatsappBtn.textContent =
    'جاري التحديث...';

  try {
    const result =
      await api(
        '/api/whatsapp/status'
      );

    applyStore(
      result.store
    );

    setSaveStatus(
      'تم تحديث حالة WhatsApp ✅'
    );

  } catch (error) {
    setSaveStatus(
      error.message,
      true
    );

  } finally {
    els.refreshWhatsappBtn.disabled =
      false;

    els.refreshWhatsappBtn.textContent =
      'تحديث الحالة';
  }
}


// ===============================
// ربط WhatsApp بالـ QR
// ===============================

async function connectWhatsapp() {
  els.connectWhatsappBtn.disabled =
    true;

  setSaveStatus(
    'جاري طلب QR...'
  );

  try {
    // نتأكد الأول إن الرقم مش متصل أصلًا
    try {
      const statusResult =
        await api(
          '/api/whatsapp/status'
        );

      const currentStatus =
        String(
          statusResult.store
            ?.whatsapp
            ?.lastStatus ||
          ''
        ).toLowerCase();

      if (
        currentStatus.includes(
          'authenticated'
        ) ||
        currentStatus.includes(
          'connected'
        )
      ) {
        applyStore(
          statusResult.store
        );

        setSaveStatus(
          'WhatsApp متصل بالفعل ✅'
        );

        return;
      }

    } catch (_) {
      // نكمل لمحاولة جلب QR
    }


    const response =
      await fetch(
        '/api/whatsapp/qr'
      );

    if (!response.ok) {
      let errorMessage =
        'تعذر تحميل QR';

      try {
        const data =
          await response.json();

        errorMessage =
          data.message ||
          errorMessage;

      } catch (_) {}

      throw new Error(
        errorMessage
      );
    }

    const blob =
      await response.blob();

    if (
      !blob.type.startsWith(
        'image/'
      )
    ) {
      throw new Error(
        'UltraMsg لم يرجع صورة QR صالحة'
      );
    }

    const url =
      URL.createObjectURL(
        blob
      );

    els.qrImage.src =
      url;

    els.qrContainer.classList.remove(
      'hidden'
    );

    setSaveStatus(
      'امسح QR من WhatsApp ثم اضغط تحديث الحالة.'
    );

  } catch (error) {
    setSaveStatus(
      error.message,
      true
    );

  } finally {
    const connected =
      els.connectionBadge.classList.contains(
        'status-online'
      );

    els.connectWhatsappBtn.disabled =
      connected;

    if (!connected) {
      els.connectWhatsappBtn.textContent =
        'ربط WhatsApp';
    }
  }
}


// ===============================
// تحديث المعاينة تلقائيًا
// ===============================

[
  els.enabled,
  els.sendAfterMinutes,
  els.discountEnabled,
  els.discountType,
  els.discountValue,
  els.couponCode,
  els.messageTemplate
].forEach((element) => {

  element.addEventListener(
    'input',
    updatePreview
  );

  element.addEventListener(
    'change',
    updatePreview
  );
});


// ===============================
// Buttons
// ===============================

els.saveBtn.addEventListener(
  'click',
  saveSettings
);

els.refreshWhatsappBtn.addEventListener(
  'click',
  refreshWhatsapp
);

els.connectWhatsappBtn.addEventListener(
  'click',
  connectWhatsapp
);


// ===============================
// Start
// ===============================

loadStore();