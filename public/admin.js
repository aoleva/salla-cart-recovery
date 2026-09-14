const $ = (id) =>
  document.getElementById(id);


// ===================================
// قراءة قيمة الحقل بأمان
// ===================================

function valueOf(id) {
  return String(
    $(id)?.value || ''
  ).trim();
}


// ===================================
// Headers الإدارة
// ===================================

function adminHeaders(
  includeJson = false
) {
  const headers = {
    'x-admin-key':
      valueOf('adminKey')
  };

  if (includeJson) {
    headers[
      'Content-Type'
    ] =
      'application/json';
  }

  return headers;
}


// ===================================
// قراءة Response بأمان
// ===================================

async function readResponse(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);

  } catch (_) {
    return {
      message: text
    };
  }
}


// ===================================
// استخراج رسالة الخطأ
// ===================================

function responseError(
  response,
  data
) {
  return (
    data?.message ||
    data?.error ||
    `HTTP ${response.status}`
  );
}


// ===================================
// التحقق من Admin Key
// ===================================

function requireAdminKey() {
  const key =
    valueOf('adminKey');

  if (!key) {
    throw new Error(
      'أدخل Admin Key أولاً.'
    );
  }

  return key;
}


// ===================================
// عرض نتيجة
// ===================================

function showResult(
  value
) {
  const resultBox =
    $('result');

  const resultText =
    $('resultText');

  if (
    !resultBox ||
    !resultText
  ) {
    return;
  }

  resultBox.classList.remove(
    'hidden'
  );

  if (
    typeof value ===
    'string'
  ) {
    resultText.textContent =
      value;

    return;
  }

  resultText.textContent =
    JSON.stringify(
      value,
      null,
      2
    );
}


// ===================================
// عرض المتاجر
// ===================================

$('loadStores')
  ?.addEventListener(
    'click',

    async () => {

      const button =
        $('loadStores');

      const area =
        $('storesArea');

      const list =
        $('storesList');


      if (
        !area ||
        !list
      ) {
        return;
      }


      area.classList.remove(
        'hidden'
      );

      list.textContent =
        'جاري التحميل...';


      if (button) {
        button.disabled =
          true;
      }


      try {

        requireAdminKey();


        const response =
          await fetch(
            '/admin/api/stores',
            {
              method:
                'GET',

              headers:
                adminHeaders(
                  false
                ),

              cache:
                'no-store'
            }
          );


        const data =
          await readResponse(
            response
          );


        if (!response.ok) {
          throw new Error(
            responseError(
              response,
              data
            )
          );
        }


        const stores =
          Array.isArray(
            data?.stores
          )
            ? data.stores
            : [];


        if (!stores.length) {

          list.textContent =
            'لا توجد متاجر مسجلة حتى الآن.';

          return;
        }


        list.textContent =
          '';


        stores.forEach(
          (store) => {

            const button =
              document
                .createElement(
                  'button'
                );


            button.type =
              'button';


            button.className =
              'btn btn-secondary';


            button.style.cssText =
              [
                'display:block',
                'width:100%',
                'margin:8px 0',
                'text-align:right'
              ].join(';');


            const storeName =
              store?.storeName ||
              'متجر';


            const merchantId =
              store?.merchantId ||
              'غير معروف';


            const whatsappStatus =
              store
                ?.whatsappProvisioned

                ? 'WhatsApp مجهز'

                : 'WhatsApp غير مجهز';


            button.textContent =
              `${storeName} — Merchant ${merchantId} — ${whatsappStatus}`;


            button.addEventListener(
              'click',

              () => {

                const merchantInput =
                  $('merchantId');


                if (
                  merchantInput
                ) {
                  merchantInput.value =
                    String(
                      merchantId
                    );
                }


                window.scrollTo({
                  top:
                    document.body
                      .scrollHeight,

                  behavior:
                    'smooth'
                });
              }
            );


            list.appendChild(
              button
            );
          }
        );


      } catch (error) {

        list.textContent =
          error?.message ||
          'حدث خطأ أثناء تحميل المتاجر.';


      } finally {

        if (button) {
          button.disabled =
            false;
        }
      }
    }
  );


// ===================================
// تجهيز WhatsApp
// ===================================

$('save')
  ?.addEventListener(
    'click',

    async () => {

      const button =
        $('save');


      if (button) {
        button.disabled =
          true;
      }


      showResult(
        'جاري التحقق والحفظ...'
      );


      try {

        requireAdminKey();


        const merchantId =
          valueOf(
            'merchantId'
          );


        const instanceId =
          valueOf(
            'instanceId'
          );


        const token =
          valueOf(
            'token'
          );


        if (!merchantId) {
          throw new Error(
            'أدخل Merchant ID.'
          );
        }


        if (!instanceId) {
          throw new Error(
            'أدخل UltraMsg Instance ID.'
          );
        }


        if (!token) {
          throw new Error(
            'أدخل UltraMsg Token.'
          );
        }


        const response =
          await fetch(
            '/admin/api/provision-whatsapp',

            {
              method:
                'POST',

              headers:
                adminHeaders(
                  true
                ),

              cache:
                'no-store',

              body:
                JSON.stringify({
                  merchantId,
                  instanceId,
                  token
                })
            }
          );


        const data =
          await readResponse(
            response
          );


        if (!response.ok) {
          throw new Error(
            responseError(
              response,
              data
            )
          );
        }


        showResult(
          data
        );


        const tokenInput =
          $('token');


        if (
          tokenInput
        ) {
          tokenInput.value =
            '';
        }


      } catch (error) {

        showResult(
          {
            success: false,

            message:
              error?.message ||
              'حدث خطأ أثناء تجهيز WhatsApp.'
          }
        );


      } finally {

        if (button) {
          button.disabled =
            false;
        }
      }
    }
  );


// ===================================
// Enter على Admin Key
// ===================================

$('adminKey')
  ?.addEventListener(
    'keydown',

    (event) => {

      if (
        event.key ===
        'Enter'
      ) {
        event.preventDefault();

        $('loadStores')
          ?.click();
      }
    }
  );


// ===================================
// Enter على Token
// ===================================

$('token')
  ?.addEventListener(
    'keydown',

    (event) => {

      if (
        event.key ===
        'Enter'
      ) {
        event.preventDefault();

        $('save')
          ?.click();
      }
    }
  );