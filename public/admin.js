const $ = (id) => document.getElementById(id);

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': $('adminKey').value
  };
}


// ===================================
// عرض المتاجر
// ===================================

$('loadStores').addEventListener(
  'click',
  async () => {

    const area = $('storesArea');
    const list = $('storesList');

    area.classList.remove('hidden');
    list.textContent = 'جاري التحميل...';

    try {
      const response = await fetch(
        '/admin/api/stores',
        {
          headers: adminHeaders()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          `HTTP ${response.status}`
        );
      }

      if (!data.stores?.length) {
        list.innerHTML =
          '<p class="muted">لا توجد متاجر مسجلة حتى الآن.</p>';

        return;
      }

      list.innerHTML = '';

      data.stores.forEach(
        (store) => {

          const button =
            document.createElement(
              'button'
            );

          button.type = 'button';

          button.className =
            'btn btn-secondary';

          button.style.cssText =
            'display:block;width:100%;margin:8px 0;text-align:right';

          button.textContent =
            `${store.storeName || 'متجر'} — Merchant ${store.merchantId} — ${
              store.whatsappProvisioned
                ? 'WhatsApp مجهز'
                : 'WhatsApp غير مجهز'
            }`;

          button.addEventListener(
            'click',
            () => {
              $('merchantId').value =
                store.merchantId;

              window.scrollTo({
                top:
                  document.body.scrollHeight,

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
        error.message;
    }
  }
);


// ===================================
// تجهيز WhatsApp
// ===================================

$('save').addEventListener(
  'click',
  async () => {

    const resultBox =
      $('result');

    const resultText =
      $('resultText');

    resultBox.classList.remove(
      'hidden'
    );

    resultText.textContent =
      'جاري التحقق والحفظ...';

    try {
      const response =
        await fetch(
          '/admin/api/provision-whatsapp',
          {
            method: 'POST',

            headers:
              adminHeaders(),

            body:
              JSON.stringify({
                merchantId:
                  $('merchantId')
                    .value
                    .trim(),

                instanceId:
                  $('instanceId')
                    .value
                    .trim(),

                token:
                  $('token')
                    .value
                    .trim()
              })
          }
        );

      const data =
        await response.json();

      resultText.textContent =
        JSON.stringify(
          data,
          null,
          2
        );

      if (response.ok) {
        $('token').value = '';
      }

    } catch (error) {
      resultText.textContent =
        error.message;
    }
  }
);