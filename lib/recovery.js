const {
  getStore,
  getDueJobs,
  updateJob
} = require('./state');

const {
  getAbandonedCart,
  getProduct
} = require('./salla');

const {
  sendChat
} = require('./ultramsg');


// ================================
// تنظيف رقم الجوال
// ================================

function normalizeMobile(mobile) {
  if (!mobile) {
    return null;
  }

  let value =
    String(mobile)
      .trim()
      .replace(/[^\d+]/g, '');

  // إزالة +
  if (
    value.startsWith('+')
  ) {
    value =
      value.slice(1);
  }

  // إزالة 00
  if (
    value.startsWith('00')
  ) {
    value =
      value.slice(2);
  }

  // رقم سعودي محلي
  // 05XXXXXXXX -> 9665XXXXXXXX
  if (
    /^05\d{8}$/.test(value)
  ) {
    value =
      `966${value.slice(1)}`;
  }

  return value || null;
}


// ================================
// استخراج Cart ID
// ================================

function cartIdFrom(data) {
  return (
    data?.id ??
    data?.cart?.id ??
    data?.cart_id ??
    null
  );
}


// ================================
// استخراج بيانات العميل
// ================================

function customerFrom(data) {
  return (
    data?.customer ||
    data?.cart?.customer ||
    null
  );
}


// ================================
// قيمة السلة
// ================================

function totalFrom(data) {
  const value =
    data?.total?.amount ??
    data?.cart?.total?.amount ??
    data?.total ??
    data?.cart?.total ??
    0;

  return Number.isFinite(
    Number(value)
  )
    ? Number(value)
    : value;
}


// ================================
// العملة
// ================================

function currencyFrom(data) {
  return (
    data?.total?.currency ??
    data?.cart?.total?.currency ??
    'SAR'
  );
}


// ================================
// رابط إكمال السلة
// ================================

function checkoutFrom(data) {
  return (
    data?.checkout_url ||
    data?.urls?.checkout ||
    data?.cart?.checkout_url ||
    data?.cart?.urls?.checkout ||
    ''
  );
}


// ================================
// أسماء المنتجات
// ================================

function itemNamesFrom(data) {
  return (
    data?.items ||
    data?.cart?.items ||
    []
  )
    .map(
      (item) =>
        item?.name ||
        item?.product?.name
    )
    .filter(Boolean);
}


// ================================
// Product IDs
// ================================

function productIdsFrom(data) {
  return [
    ...new Set(
      (
        data?.items ||
        data?.cart?.items ||
        []
      )
        .map(
          (item) =>
            item?.product_id ||
            item?.product?.id
        )
        .filter(Boolean)
    )
  ];
}


// ================================
// هل السلة تم شراؤها؟
// ================================

function isPurchasedStatus(status) {
  const value =
    String(
      status || ''
    ).toLowerCase();

  return [
    'purchased',
    'completed',
    'paid'
  ].includes(value);
}


// ================================
// جلب تفاصيل إضافية للسلة
// ================================

async function enrichCart(
  store,
  raw
) {
  const cartId =
    cartIdFrom(raw);

  let data = raw;

  if (
    cartId &&
    store?.salla?.accessTokenEnc
  ) {
    try {
      const details =
        await getAbandonedCart(
          store,
          cartId
        );

      if (details) {
        data = {
          ...raw,
          ...details
        };
      }

    } catch (error) {
      console.warn(
        `⚠️ تعذر جلب تفاصيل السلة ${cartId}:`,
        error.response?.status ||
        error.message
      );
    }
  }


  let names =
    itemNamesFrom(data);


  // لو أسماء المنتجات غير موجودة
  // نحاول جلبها من Salla API
  if (
    !names.length &&
    store?.salla?.accessTokenEnc
  ) {
    const ids =
      productIdsFrom(data)
        .slice(0, 3);

    for (const id of ids) {
      try {
        const product =
          await getProduct(
            store,
            id
          );

        if (
          product?.name
        ) {
          names.push(
            product.name
          );
        }

      } catch (error) {
        console.warn(
          `⚠️ تعذر جلب المنتج ${id}:`,
          error.response?.status ||
          error.message
        );
      }
    }
  }


  return {
    data,
    names
  };
}


// ================================
// تجهيز رسالة WhatsApp
// ================================

function renderMessage(
  store,
  data,
  names
) {
  const settings =
    store.settings || {};

  const customer =
    customerFrom(data) || {};

  const total =
    totalFrom(data);

  const currency =
    currencyFrom(data);

  const checkoutUrl =
    checkoutFrom(data) ||
    store.storeDomain ||
    '';


  // وصف المنتجات
  const productsText =
    names.length
      ? names.length === 1
        ? `المنتج «${names[0]}»`
        : `المنتجات «${names
            .slice(0, 2)
            .join('، ')}${
              names.length > 2
                ? ' وغيرها'
                : ''
            }»`
      : 'منتجاتك';


  // قيمة الخصم
  const discount =
    settings.discountType ===
    'fixed'
      ? `${settings.discountValue} ${currency}`
      : `${settings.discountValue}%`;


  // سطر العرض
  // لن نخبر العميل بخصم
  // إلا لو التاجر أدخل كوبون فعلي
  const offerLine =
    settings.discountEnabled &&
    settings.couponCode
      ? `استخدم كود ${settings.couponCode} واحصل على خصم ${discount}.`
      : '';


  const replacements = {
    '{customer_name}':
      customer.first_name ||
      customer.name ||
      'عميلنا العزيز',

    '{store_name}':
      store.storeName ||
      'متجرنا',

    '{products_text}':
      productsText,

    '{cart_total}':
      String(total),

    '{currency}':
      currency,

    '{coupon_code}':
      settings.couponCode ||
      '',

    '{discount}':
      discount,

    '{offer_line}':
      offerLine,

    '{checkout_url}':
      checkoutUrl
  };


  let message =
    settings.messageTemplate ||
    '';


  for (
    const [key, value]
    of Object.entries(
      replacements
    )
  ) {
    message =
      message
        .split(key)
        .join(value);
  }


  return {
    message:
      message
        .replace(
          /\n{3,}/g,
          '\n\n'
        )
        .trim(),

    customer,

    checkoutUrl
  };
}


// ================================
// تنفيذ مهمة استعادة واحدة
// ================================

async function processJob(job) {

  const store =
    getStore(
      job.merchantId
    );


  // التطبيق متوقف للمتجر
  if (
    !store ||
    !store.active ||
    !store.settings?.enabled
  ) {
    await updateJob(
      job.id,
      {
        status:
          'cancelled',

        cancelReason:
          'store_disabled'
      }
    );

    return;
  }


  // WhatsApp غير مجهز
  if (
    !store.whatsapp?.instanceId ||
    !store.whatsapp?.tokenEnc
  ) {
    await updateJob(
      job.id,
      {
        status:
          'failed',

        error:
          'WhatsApp not provisioned'
      }
    );

    return;
  }


  await updateJob(
    job.id,
    {
      status:
        'processing',

      attempts:
        Number(
          job.attempts ||
          0
        ) + 1
    }
  );


  try {

    // جلب تفاصيل السلة
    const {
      data,
      names
    } =
      await enrichCart(
        store,
        job.payload || {}
      );


    // لو العميل اشترى بالفعل
    if (
      isPurchasedStatus(
        data?.status
      )
    ) {
      await updateJob(
        job.id,
        {
          status:
            'cancelled',

          cancelReason:
            'cart_purchased'
        }
      );

      return;
    }


    const customer =
      customerFrom(data);


    const mobile =
      normalizeMobile(
        customer?.mobile ||
        customer?.phone
      );


    if (!mobile) {
      throw new Error(
        'Customer mobile is missing'
      );
    }


    // تجهيز الرسالة
    const {
      message
    } =
      renderMessage(
        store,
        data,
        names
      );


    if (!message) {
      throw new Error(
        'Message template is empty'
      );
    }


    // إرسال WhatsApp
    const result =
      await sendChat(
        store,
        mobile,
        message
      );


    // تسجيل النجاح
    await updateJob(
      job.id,
      {
        status:
          'sent',

        sentAt:
          new Date()
            .toISOString(),

        providerResponse:
          result
      }
    );


    console.log(
      `✅ تم إرسال رسالة استعادة - Merchant: ${job.merchantId} - Cart: ${job.cartId}`
    );


  } catch (error) {

    const text =
      error.response
        ?.data?.error ||

      error.response
        ?.data ||

      error.message;


    await updateJob(
      job.id,
      {
        status:
          'failed',

        error:
          typeof text ===
          'string'
            ? text
            : JSON.stringify(
                text
              )
      }
    );


    console.error(
      `❌ فشل Recovery Job ${job.id}:`,
      text
    );
  }
}


// ================================
// Recovery Worker
// ================================

let workerBusy = false;


async function runWorkerOnce() {

  if (workerBusy) {
    return;
  }


  workerBusy = true;


  try {

    const due =
      getDueJobs()
        .slice(0, 20);


    for (
      const job
      of due
    ) {
      await processJob(
        job
      );
    }

  } finally {

    workerBusy = false;
  }
}


// ================================
// تشغيل العامل تلقائيًا
// ================================

function startWorker() {

  const interval =
    Number(
      process.env
        .RECOVERY_WORKER_INTERVAL_MS
    ) || 15000;


  setInterval(
    runWorkerOnce,
    interval
  ).unref();


  // أول تشغيل بعد ثانية ونصف
  setTimeout(
    runWorkerOnce,
    1500
  ).unref();
}


// ================================
// Export
// ================================

module.exports = {
  startWorker,
  cartIdFrom,
  isPurchasedStatus
};