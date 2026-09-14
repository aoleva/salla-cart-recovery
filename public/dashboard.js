const $ = (id) =>
  document.getElementById(id);


// ===================================
// Elements
// ===================================

const els = {
  enabled:
    $('enabled'),

  sendAfterMinutes:
    $('sendAfterMinutes'),

  discountEnabled:
    $('discountEnabled'),

  discountType:
    $('discountType'),

  discountValue:
    $('discountValue'),

  couponCode:
    $('couponCode'),

  messageTemplate:
    $('messageTemplate'),

  saveBtn:
    $('saveBtn'),

  saveStatus:
    $('saveStatus'),

  whatsappStatus:
    $('whatsappStatus'),

  whatsappPhone:
    $('whatsappPhone'),

  connectionBadge:
    $('connectionBadge'),

  connectWhatsappBtn:
    $('connectWhatsappBtn'),

  refreshWhatsappBtn:
    $('refreshWhatsappBtn'),

  qrContainer:
    $('qrContainer'),

  qrImage:
    $('qrImage'),

  messagePreview:
    $('messagePreview')
};


let currentStore =
  null;

let currentQrUrl =
  null;


// ===================================
// رسائل الحالة
// ===================================

function setSaveStatus(
  text,
  isError = false
) {
  if (!els.saveStatus) {
    return;
  }

  els.saveStatus.textContent =
    text || '';

  els.saveStatus.className =
    isError
      ? 'save-status error'
      : 'save-status success';
}


// ===================================
// هل حالة WhatsApp متصلة؟
// ===================================

function isConnectedStatus(
  status
) {
  const value =
    String(
      status || ''
    ).toLowerCase();

  return (
    value.includes(
      'authenticated'
    ) ||
    value.includes(
      'connected'
    )
  );
}


// ===================================
// معاينة الرسالة
// ===================================

function updatePreview() {
  if (
    !els.messageTemplate ||
    !els.messagePreview
  ) {
    return;
  }


  let message =
    els.messageTemplate.value ||
    '';


  const discountValue =
    Number(
      els.discountValue
        ?.value ||
      0
    );


  const discountText =
    els.discountType
      ?.value ===
      'fixed'

      ? `${discountValue} ريال`

      : `${discountValue}%`;


  const couponCode =
    String(
      els.couponCode
        ?.value ||
      ''
    ).trim();


  const discountEnabled =
    Boolean(
      els.discountEnabled
        ?.checked
    );


  const offerLine =
    discountEnabled &&
    couponCode

      ? `استخدم كود ${couponCode} واحصل على خصم ${discountText}.`

      : '';


  const replacements = {
    '{customer_name}':
      'أحمد',

    '{store_name}':
      currentStore
        ?.storeName ||
      'متجرك',

    '{products_text}':
      'المنتج «ساعة ذكية»',

    '{cart_total}':
      '250',

    '{currency}':
      'SAR',

    '{coupon_code}':
      couponCode,

    '{discount}':
      discountText,

    '{offer_line}':
      offerLine,

    '{checkout_url}':
      'https://example.com/cart'
  };


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      replacements
    )
  ) {
    message =
      message
        .split(key)
        .join(value);
  }


  els.messagePreview.textContent =
    message
      .replace(
        /\n{3,}/g,
        '\n\n'
      )
      .trim();
}


// ===================================
// تحميل إعدادات المتجر في الصفحة
// ===================================

function applyStore(
  store
) {
  if (!store) {
    return;
  }


  currentStore =
    store;


  const settings =
    store.settings ||
    {};


  if (els.enabled) {
    els.enabled.checked =
      settings.enabled !==
      false;
  }


  if (
    els.sendAfterMinutes
  ) {
    els.sendAfterMinutes.value =
      settings
        .sendAfterMinutes ??
      30;
  }


  if (
    els.discountEnabled
  ) {
    els.discountEnabled.checked =
      settings
        .discountEnabled !==
      false;
  }


  if (
    els.discountType
  ) {
    els.discountType.value =
      settings
        .discountType ||
      'percent';
  }


  if (
    els.discountValue
  ) {
    els.discountValue.value =
      settings
        .discountValue ??
      10;
  }


  if (
    els.couponCode
  ) {
    els.couponCode.value =
      settings
        .couponCode ||
      '';
  }


  if (
    els.messageTemplate
  ) {
    els.messageTemplate.value =
      settings
        .messageTemplate ||
      '';
  }


  updatePreview();

  applyWhatsappState(
    store
  );
}


// ===================================
// حالة WhatsApp
// ===================================

function applyWhatsappState(
  store
) {
  const whatsapp =
    store?.whatsapp ||
    {};


  const status =
    String(
      whatsapp.lastStatus ||
      'not_configured'
    ).toLowerCase();


  if (
    els.whatsappPhone
  ) {
    els.whatsappPhone
      .textContent =
        whatsapp.phone
          ? `الرقم: ${whatsapp.phone}`
          : '';
  }


  // =================================
  // WhatsApp متصل
  // =================================

  if (
    isConnectedStatus(
      status
    )
  ) {
    if (
      els.whatsappStatus
    ) {
      els.whatsappStatus
        .textContent =
          'متصل ✅';
    }


    if (
      els.connectionBadge
    ) {
      els.connectionBadge
        .textContent =
          'WhatsApp متصل';

      els.connectionBadge
        .className =
          'status-badge status-online';
    }


    if (
      els.connectWhatsappBtn
    ) {
      els.connectWhatsappBtn
        .textContent =
          'WhatsApp متصل';

      els.connectWhatsappBtn
        .disabled =
          true;
    }


    if (
      els.qrContainer
    ) {
      els.qrContainer
        .classList
        .add(
          'hidden'
        );
    }


    clearQrUrl();

    return;
  }


  // =================================
  // UltraMsg مجهز لكن غير متصل
  // =================================

  if (
    whatsapp.instanceId &&
    whatsapp.tokenConfigured
  ) {
    if (
      els.whatsappStatus
    ) {
      els.whatsappStatus
        .textContent =
          'غير متصل';
    }


    if (
      els.connectionBadge
    ) {
      els.connectionBadge
        .textContent =
          'WhatsApp غير متصل';

      els.connectionBadge
        .className =
          'status-badge status-offline';
    }


    if (
      els.connectWhatsappBtn
    ) {
      els.connectWhatsappBtn
        .textContent =
          'ربط WhatsApp';

      els.connectWhatsappBtn
        .disabled =
          false;
    }


    return;
  }


  // =================================
  // UltraMsg غير مجهز
  // =================================

  if (
    els.whatsappStatus
  ) {
    els.whatsappStatus
      .textContent =
        'لم يتم تجهيز WhatsApp بعد';
  }


  if (
    els.connectionBadge
  ) {
    els.connectionBadge
      .textContent =
        'WhatsApp غير مجهز';

    els.connectionBadge
      .className =
        'status-badge status-offline';
  }


  if (
    els.connectWhatsappBtn
  ) {
    els.connectWhatsappBtn
      .textContent =
        'ربط WhatsApp';

    els.connectWhatsappBtn
      .disabled =
        false;
  }
}


// ===================================
// API Helper
// ===================================

async function api(
  url,
  options = {}
) {
  const headers = {
    ...(options.body
      ? {
          'Content-Type':
            'application/json'
        }
      : {}),

    ...(options.headers ||
      {})
  };


  const response =
    await fetch(
      url,
      {
        ...options,

        headers,

        credentials:
          'include',

        cache:
          'no-store'
      }
    );


  const text =
    await response.text();


  let data =
    null;


  if (text) {
    try {
      data =
        JSON.parse(
          text
        );

    } catch (_) {
      data = {
        message:
          text
      };
    }
  }


  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `HTTP ${response.status}`;


    throw new Error(
      message
    );
  }


  return data;
}


// ===================================
// تحميل بيانات المتجر
// ===================================

async function loadStore() {
  const result =
    await api(
      '/api/store'
    );


  if (!result?.store) {
    throw new Error(
      'لم يتم العثور على بيانات المتجر.'
    );
  }


  applyStore(
    result.store
  );


  return result.store;
}


// ===================================
// التحقق من الإعدادات
// ===================================

function validateSettings() {
  const sendAfterMinutes =
    Number(
      els.sendAfterMinutes
        ?.value
    );


  if (
    !Number.isFinite(
      sendAfterMinutes
    ) ||
    sendAfterMinutes < 1 ||
    sendAfterMinutes > 10080
  ) {
    throw new Error(
      'مدة الإرسال يجب أن تكون بين دقيقة و10080 دقيقة.'
    );
  }


  const discountValue =
    Number(
      els.discountValue
        ?.value
    );


  if (
    !Number.isFinite(
      discountValue
    ) ||
    discountValue < 0
  ) {
    throw new Error(
      'قيمة الخصم غير صحيحة.'
    );
  }


  if (
    els.discountType
      ?.value ===
      'percent' &&
    discountValue > 100
  ) {
    throw new Error(
      'نسبة الخصم لا يمكن أن تتجاوز 100%.'
    );
  }


  const messageTemplate =
    String(
      els.messageTemplate
        ?.value ||
      ''
    ).trim();


  if (!messageTemplate) {
    throw new Error(
      'نص رسالة WhatsApp لا يمكن أن يكون فارغًا.'
    );
  }


  return {
    sendAfterMinutes,
    discountValue,
    messageTemplate
  };
}


// ===================================
// حفظ إعدادات الاستعادة
// ===================================

async function saveSettings() {
  if (
    els.saveBtn
  ) {
    els.saveBtn.disabled =
      true;
  }


  setSaveStatus(
    'جاري الحفظ...'
  );


  try {
    const validated =
      validateSettings();


    const payload = {
      enabled:
        Boolean(
          els.enabled
            ?.checked
        ),

      sendAfterMinutes:
        validated
          .sendAfterMinutes,

      discountEnabled:
        Boolean(
          els.discountEnabled
            ?.checked
        ),

      discountType:
        els.discountType
          ?.value ===
          'fixed'
            ? 'fixed'
            : 'percent',

      discountValue:
        validated
          .discountValue,

      couponCode:
        String(
          els.couponCode
            ?.value ||
          ''
        ).trim(),

      messageTemplate:
        validated
          .messageTemplate
    };


    const result =
      await api(
        '/api/settings',
        {
          method:
            'PUT',

          body:
            JSON.stringify(
              payload
            )
        }
      );


    if (
      result?.store
    ) {
      applyStore(
        result.store
      );
    }


    setSaveStatus(
      'تم حفظ الإعدادات بنجاح ✅'
    );


  } catch (error) {
    setSaveStatus(
      error?.message ||
      'تعذر حفظ الإعدادات.',
      true
    );


  } finally {
    if (
      els.saveBtn
    ) {
      els.saveBtn.disabled =
        false;
    }
  }
}


// ===================================
// تحديث حالة WhatsApp
// ===================================

async function refreshWhatsapp() {
  if (
    els.refreshWhatsappBtn
  ) {
    els.refreshWhatsappBtn
      .disabled =
        true;

    els.refreshWhatsappBtn
      .textContent =
        'جاري التحديث...';
  }


  try {
    const result =
      await api(
        '/api/whatsapp/status'
      );


    if (
      result?.store
    ) {
      applyStore(
        result.store
      );
    }


    setSaveStatus(
      'تم تحديث حالة WhatsApp ✅'
    );


  } catch (error) {
    setSaveStatus(
      error?.message ||
      'تعذر تحديث حالة WhatsApp.',
      true
    );


  } finally {
    if (
      els.refreshWhatsappBtn
    ) {
      els.refreshWhatsappBtn
        .disabled =
          false;

      els.refreshWhatsappBtn
        .textContent =
          'تحديث الحالة';
    }
  }
}


// ===================================
// تنظيف QR URL القديم
// ===================================

function clearQrUrl() {
  if (
    currentQrUrl
  ) {
    URL.revokeObjectURL(
      currentQrUrl
    );

    currentQrUrl =
      null;
  }


  if (
    els.qrImage
  ) {
    els.qrImage.removeAttribute(
      'src'
    );
  }
}


// ===================================
// ربط WhatsApp بالـ QR
// ===================================

async function connectWhatsapp() {
  if (
    els.connectWhatsappBtn
  ) {
    els.connectWhatsappBtn
      .disabled =
        true;

    els.connectWhatsappBtn
      .textContent =
        'جاري التحميل...';
  }


  setSaveStatus(
    'جاري التحقق من WhatsApp...'
  );


  try {

    // =================================
    // أولًا نتأكد إنه مش متصل بالفعل
    // =================================

    try {
      const statusResult =
        await api(
          '/api/whatsapp/status'
        );


      const currentStatus =
        String(
          statusResult
            ?.store
            ?.whatsapp
            ?.lastStatus ||
          ''
        ).toLowerCase();


      if (
        isConnectedStatus(
          currentStatus
        )
      ) {
        if (
          statusResult
            ?.store
        ) {
          applyStore(
            statusResult.store
          );
        }


        setSaveStatus(
          'WhatsApp متصل بالفعل ✅'
        );

        return;
      }

    } catch (error) {
      console.warn(
        'WhatsApp status check failed:',
        error?.message
      );
    }


    // =================================
    // طلب QR
    // =================================

    setSaveStatus(
      'جاري طلب QR...'
    );


    const response =
      await fetch(
        '/api/whatsapp/qr',
        {
          method:
            'GET',

          credentials:
            'include',

          cache:
            'no-store'
        }
      );


    if (!response.ok) {
      let errorMessage =
        'تعذر تحميل QR';


      try {
        const text =
          await response.text();


        if (text) {
          try {
            const data =
              JSON.parse(
                text
              );

            errorMessage =
              data?.message ||
              data?.error ||
              errorMessage;

          } catch (_) {
            errorMessage =
              text;
          }
        }

      } catch (_) {}


      throw new Error(
        errorMessage
      );
    }


    const blob =
      await response.blob();


    if (
      !blob.type ||
      !blob.type.startsWith(
        'image/'
      )
    ) {
      throw new Error(
        'UltraMsg لم يرجع صورة QR صالحة.'
      );
    }


    clearQrUrl();


    currentQrUrl =
      URL.createObjectURL(
        blob
      );


    if (
      els.qrImage
    ) {
      els.qrImage.src =
        currentQrUrl;
    }


    if (
      els.qrContainer
    ) {
      els.qrContainer
        .classList
        .remove(
          'hidden'
        );
    }


    setSaveStatus(
      'امسح QR من WhatsApp ثم اضغط تحديث الحالة.'
    );


  } catch (error) {
    setSaveStatus(
      error?.message ||
      'تعذر ربط WhatsApp.',
      true
    );


  } finally {
    const connected =
      els.connectionBadge
        ?.classList
        .contains(
          'status-online'
        );


    if (
      els.connectWhatsappBtn
    ) {
      els.connectWhatsappBtn
        .disabled =
          Boolean(
            connected
          );


      if (
        connected
      ) {
        els.connectWhatsappBtn
          .textContent =
            'WhatsApp متصل';

      } else {
        els.connectWhatsappBtn
          .textContent =
            'ربط WhatsApp';
      }
    }
  }
}


// ===================================
// تحديث المعاينة تلقائيًا
// ===================================

[
  els.enabled,
  els.sendAfterMinutes,
  els.discountEnabled,
  els.discountType,
  els.discountValue,
  els.couponCode,
  els.messageTemplate
]
  .filter(Boolean)
  .forEach(
    (element) => {

      element.addEventListener(
        'input',
        updatePreview
      );


      element.addEventListener(
        'change',
        updatePreview
      );
    }
  );


// ===================================
// Buttons
// ===================================

els.saveBtn
  ?.addEventListener(
    'click',
    saveSettings
  );


els.refreshWhatsappBtn
  ?.addEventListener(
    'click',
    refreshWhatsapp
  );


els.connectWhatsappBtn
  ?.addEventListener(
    'click',
    connectWhatsapp
  );


// ===================================
// Start
// ===================================
//
// مهم:
// لا نشغّل Salla Embedded SDK هنا.
// المصادقة تتم في /salla/embedded
// وبعد إنشاء Session نصل للـDashboard.
// ===================================

async function startApp() {
  try {
    setSaveStatus(
      'جاري تحميل بيانات المتجر...'
    );


    await loadStore();


    setSaveStatus(
      ''
    );


  } catch (error) {
    console.error(
      'Dashboard startup error:',
      error
    );


    setSaveStatus(
      error?.message ||
      'تعذر تحميل بيانات المتجر.',
      true
    );
  }
}


// ===================================
// تنظيف QR عند مغادرة الصفحة
// ===================================

window.addEventListener(
  'beforeunload',
  () => {
    clearQrUrl();
  }
);


// ===================================
// تشغيل الصفحة
// ===================================

startApp();