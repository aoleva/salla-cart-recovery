(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    pageAlert: $('pageAlert'),

    enabled: $('enabled'),
    recoveryBadge: $('recoveryBadge'),

    sendAfterMinutes: $('sendAfterMinutes'),
    discountEnabled: $('discountEnabled'),
    discountFields: $('discountFields'),
    discountType: $('discountType'),
    discountValue: $('discountValue'),
    couponCode: $('couponCode'),

    messagePreview: $('messagePreview'),

    whatsappStatus: $('whatsappStatus'),
    whatsappPhone: $('whatsappPhone'),
    whatsappHint: $('whatsappHint'),
    connectionBadge: $('connectionBadge'),
    whatsappVisual: $('whatsappVisual'),

    connectWhatsappBtn: $('connectWhatsappBtn'),
    refreshWhatsappBtn: $('refreshWhatsappBtn'),
    disconnectWhatsappBtn: $('disconnectWhatsappBtn'),

    saveBtn: $('saveBtn'),
    saveTitle: $('saveTitle'),
    saveStatus: $('saveStatus'),
    saveBar: document.querySelector('.save-bar'),

    qrModal: $('qrModal'),
    qrImage: $('qrImage'),
    qrLoading: $('qrLoading'),
    qrStatus: $('qrStatus'),
    closeQrBtn: $('closeQrBtn'),
    reloadQrBtn: $('reloadQrBtn'),
    checkQrStatusBtn: $('checkQrStatusBtn')
  };

  const MESSAGE_TEMPLATES = {
    friendly:
      'مرحبًا {customer_name} 👋\n' +
      'لاحظنا أن لديك {products_text} في سلتك لدى {store_name}.\n' +
      '{offer_line}\n' +
      'يمكنك إكمال طلبك بسهولة من هنا:\n' +
      '{checkout_url}\n\n' +
      'يسعدنا خدمتك 💚',

    short:
      'مرحبًا {customer_name} 👋\n' +
      'سلتك في {store_name} ما زالت بانتظارك.\n' +
      '{offer_line}\n' +
      'أكمل طلبك من هنا:\n' +
      '{checkout_url}',

    sales:
      'أهلًا {customer_name} ✨\n' +
      'لا تفوّت منتجاتك في {store_name}.\n' +
      '{offer_line}\n' +
      'أكمل طلبك الآن:\n' +
      '{checkout_url}'
  };

  let currentStore = null;
  let qrObjectUrl = null;
  let qrPollTimer = null;
  let currentMessageStyle = 'friendly';

  function isConnectedStatus(value) {
    const status = String(value || '').toLowerCase();

    return (
      status.includes('authenticated') ||
      status.includes('connected')
    );
  }

  function cleanPhone(value) {
    const raw = String(value || '')
      .replace(/@c\.us$/i, '')
      .replace(/[^\d+]/g, '');

    if (!raw) {
      return '';
    }

    return raw.startsWith('+')
      ? raw
      : `+${raw}`;
  }

  function showAlert(message, type = 'warning') {
    if (!message) {
      els.pageAlert.className = 'alert hidden';
      els.pageAlert.textContent = '';
      return;
    }

    els.pageAlert.textContent = message;
    els.pageAlert.className = `alert ${type}`;
  }

  function setSaveState(title, message, type = '') {
    els.saveTitle.textContent = title;
    els.saveStatus.textContent = message;

    els.saveBar.classList.remove(
      'is-success',
      'is-error'
    );

    if (type === 'success') {
      els.saveBar.classList.add('is-success');
    }

    if (type === 'error') {
      els.saveBar.classList.add('is-error');
    }
  }

  async function api(url, options = {}) {
    const request = {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, request);

    let data = null;

    const contentType =
      response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `تعذر إكمال الطلب (${response.status}).`
      );
    }

    return data;
  }

  function getSelectedMessageStyle() {
    const checked =
      document.querySelector(
        'input[name="messageStyle"]:checked'
      );

    return checked?.value || 'friendly';
  }

  function getTemplate() {
    const style = getSelectedMessageStyle();

    return (
      MESSAGE_TEMPLATES[style] ||
      MESSAGE_TEMPLATES.friendly
    );
  }

  function getDiscountText() {
    const value =
      Number(els.discountValue.value || 0);

    if (els.discountType.value === 'fixed') {
      return `${value || 0} ر.س`;
    }

    return `${value || 0}%`;
  }

  function getOfferLinePreview() {
    if (!els.discountEnabled.checked) {
      return '';
    }

    const coupon =
      els.couponCode.value.trim() || 'BACK10';

    return (
      `استخدم كود ${coupon} واحصل على خصم ` +
      `${getDiscountText()}.`
    );
  }

  function updateMessagePreview() {
    let message = getTemplate();

    const replacements = {
      '{customer_name}': 'أحمد',
      '{store_name}':
        currentStore?.storeName ||
        'متجرك',
      '{products_text}':
        'منتجاتك المختارة',
      '{cart_total}':
        '250',
      '{currency}':
        'ر.س',
      '{coupon_code}':
        els.couponCode.value.trim() ||
        'BACK10',
      '{discount}':
        getDiscountText(),
      '{offer_line}':
        getOfferLinePreview(),
      '{checkout_url}':
        'https://متجرك.com/checkout'
    };

    for (const [key, value] of Object.entries(replacements)) {
      message =
        message
          .split(key)
          .join(value);
    }

    message =
      message
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    els.messagePreview.textContent = message;
  }

  function updateDiscountUi() {
    const active =
      els.discountEnabled.checked;

    els.discountFields.classList.toggle(
      'hidden',
      !active
    );

    updateMessagePreview();
  }

  function updateRecoveryUi() {
    const enabled =
      els.enabled.checked;

    els.recoveryBadge.textContent =
      enabled
        ? 'الاستعادة مفعّلة'
        : 'الاستعادة متوقفة';

    els.recoveryBadge.className =
      enabled
        ? 'pill pill-success'
        : 'pill pill-muted';
  }

  function applyWhatsappState(store) {
    const whatsapp =
      store?.whatsapp || {};

    const status =
      String(
        whatsapp.lastStatus ||
        'not_configured'
      ).toLowerCase();

    const connected =
      isConnectedStatus(status);

    const provisioned =
      Boolean(
        whatsapp.tokenConfigured ||
        whatsapp.instanceId
      );

    const phone =
      cleanPhone(whatsapp.phone);

    els.whatsappPhone.textContent =
      phone
        ? `الرقم المرتبط: ${phone}`
        : '';

    els.whatsappPhone.classList.toggle(
      'hidden',
      !phone
    );

    els.disconnectWhatsappBtn.classList.toggle(
      'hidden',
      !connected
    );

    if (connected) {
      els.whatsappStatus.textContent =
        'متصل وجاهز للإرسال';

      els.whatsappHint.textContent =
        'سيتم استخدام هذا الرقم لإرسال رسائل استعادة السلات.';

      els.connectionBadge.textContent =
        'WhatsApp متصل';

      els.connectionBadge.className =
        'pill pill-success';

      els.whatsappVisual.className =
        'connection-visual is-online';

      els.connectWhatsappBtn.textContent =
        'WhatsApp متصل';

      els.connectWhatsappBtn.disabled = true;

      stopQrPolling();

      if (!els.qrModal.classList.contains('hidden')) {
        els.qrStatus.textContent =
          'تم الاتصال بنجاح ✓';

        els.qrStatus.className =
          'qr-status success';

        window.setTimeout(
          closeQrModal,
          1100
        );
      }

      return;
    }

    els.connectWhatsappBtn.disabled = false;
    els.connectWhatsappBtn.textContent =
      'ربط WhatsApp';

    els.connectionBadge.className =
      'pill pill-warning';

    els.whatsappVisual.className =
      'connection-visual is-offline';

    if (provisioned) {
      els.whatsappStatus.textContent =
        'غير متصل';

      els.whatsappHint.textContent =
        'اضغط «ربط WhatsApp» ثم امسح رمز QR من جوالك.';

      els.connectionBadge.textContent =
        'WhatsApp غير متصل';

      return;
    }

    els.whatsappStatus.textContent =
      'خدمة الربط لم تُجهز بعد';

    els.whatsappHint.textContent =
      'يجب تجهيز قناة WhatsApp لهذا المتجر أولًا، وبعدها سيظهر رمز QR للربط.';

    els.connectionBadge.textContent =
      'بانتظار تجهيز الربط';
  }

  function inferMessageStyle(template) {
    const value =
      String(template || '').trim();

    if (!value) {
      return 'friendly';
    }

    for (
      const [style, candidate]
      of Object.entries(MESSAGE_TEMPLATES)
    ) {
      if (candidate.trim() === value) {
        return style;
      }
    }

    return 'friendly';
  }

  function selectMessageStyle(style) {
    const input =
      document.querySelector(
        `input[name="messageStyle"][value="${style}"]`
      );

    if (input) {
      input.checked = true;
      currentMessageStyle = style;
    }
  }

  function applyStore(store) {
    if (!store) {
      return;
    }

    currentStore = store;

    const settings =
      store.settings || {};

    els.enabled.checked =
      settings.enabled === true;

    const allowedDelays =
      ['15', '30', '60', '180', '360', '1440'];

    const savedDelay =
      String(
        settings.sendAfterMinutes ??
        30
      );

    els.sendAfterMinutes.value =
      allowedDelays.includes(savedDelay)
        ? savedDelay
        : '30';

    els.discountEnabled.checked =
      settings.discountEnabled === true;

    els.discountType.value =
      settings.discountType === 'fixed'
        ? 'fixed'
        : 'percent';

    els.discountValue.value =
      Number.isFinite(
        Number(settings.discountValue)
      )
        ? Number(settings.discountValue)
        : 10;

    els.couponCode.value =
      String(
        settings.couponCode || ''
      );

    currentMessageStyle =
      inferMessageStyle(
        settings.messageTemplate
      );

    selectMessageStyle(
      currentMessageStyle
    );

    updateDiscountUi();
    updateRecoveryUi();
    updateMessagePreview();
    applyWhatsappState(store);
  }

  function validateSettings() {
    const delay =
      Number(
        els.sendAfterMinutes.value
      );

    if (!Number.isFinite(delay) || delay < 1) {
      throw new Error(
        'اختر وقتًا صحيحًا لإرسال التذكير.'
      );
    }

    if (els.discountEnabled.checked) {
      const value =
        Number(
          els.discountValue.value
        );

      const coupon =
        els.couponCode.value.trim();

      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(
          'أدخل قيمة خصم أكبر من صفر.'
        );
      }

      if (
        els.discountType.value === 'percent' &&
        value > 100
      ) {
        throw new Error(
          'نسبة الخصم لا يمكن أن تتجاوز 100%.'
        );
      }

      if (!coupon) {
        throw new Error(
          'أدخل كود كوبون صالح عند تشغيل الخصم.'
        );
      }
    }

    if (
      els.enabled.checked &&
      !isConnectedStatus(
        currentStore?.whatsapp?.lastStatus
      )
    ) {
      throw new Error(
        'اربط WhatsApp أولًا قبل تشغيل الاستعادة.'
      );
    }
  }

  async function loadStore() {
    setSaveState(
      'جاري التحميل',
      'يتم تحميل إعدادات المتجر...'
    );

    try {
      const result =
        await api('/api/store');

      applyStore(result?.store);

      setSaveState(
        'جاهز',
        'يمكنك تعديل الإعدادات وحفظها.'
      );

      showAlert('');

      return result?.store || null;
    } catch (error) {
      setSaveState(
        'تعذر تحميل الإعدادات',
        error.message,
        'error'
      );

      showAlert(
        error.message,
        'error'
      );

      return null;
    }
  }

  async function refreshWhatsapp({
    silent = false
  } = {}) {
    if (!silent) {
      els.refreshWhatsappBtn.disabled = true;
      els.refreshWhatsappBtn.textContent =
        'جاري التحقق...';
    }

    try {
      const result =
        await api('/api/whatsapp/status');

      if (result?.store) {
        currentStore = {
          ...(currentStore || {}),
          ...result.store
        };

        applyWhatsappState(
          currentStore
        );
      }

      return result?.store || null;
    } catch (error) {
      if (!silent) {
        showAlert(
          error.message,
          'error'
        );
      }

      return null;
    } finally {
      if (!silent) {
        els.refreshWhatsappBtn.disabled = false;
        els.refreshWhatsappBtn.textContent =
          'تحديث الحالة';
      }
    }
  }

  function openQrModal() {
    els.qrModal.classList.remove(
      'hidden'
    );

    document.body.style.overflow =
      'hidden';
  }

  function closeQrModal() {
    stopQrPolling();

    els.qrModal.classList.add(
      'hidden'
    );

    document.body.style.overflow =
      '';

    if (qrObjectUrl) {
      URL.revokeObjectURL(
        qrObjectUrl
      );

      qrObjectUrl = null;
    }

    els.qrImage.src = '';
    els.qrImage.classList.add(
      'hidden'
    );

    els.qrLoading.classList.remove(
      'hidden'
    );
  }

  function stopQrPolling() {
    if (qrPollTimer) {
      window.clearInterval(
        qrPollTimer
      );

      qrPollTimer = null;
    }
  }

  function startQrPolling() {
    stopQrPolling();

    qrPollTimer =
      window.setInterval(
        async () => {
          const store =
            await refreshWhatsapp({
              silent: true
            });

          if (
            isConnectedStatus(
              store?.whatsapp?.lastStatus
            )
          ) {
            stopQrPolling();
          }
        },
        4000
      );
  }

  async function loadQr() {
    els.qrLoading.classList.remove(
      'hidden'
    );

    els.qrImage.classList.add(
      'hidden'
    );

    els.qrStatus.textContent =
      'جاري إنشاء رمز QR...';

    els.qrStatus.className =
      'qr-status';

    try {
      const latest =
        await refreshWhatsapp({
          silent: true
        });

      if (
        isConnectedStatus(
          latest?.whatsapp?.lastStatus
        )
      ) {
        els.qrStatus.textContent =
          'WhatsApp متصل بالفعل ✓';

        els.qrStatus.className =
          'qr-status success';

        return;
      }

      const response =
        await fetch(
          '/api/whatsapp/qr',
          {
            credentials: 'include'
          }
        );

      if (!response.ok) {
        let message =
          'تعذر إنشاء رمز QR.';

        try {
          const data =
            await response.json();

          message =
            data?.message ||
            message;
        } catch (_) {
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      if (
        !blob.type.startsWith(
          'image/'
        )
      ) {
        throw new Error(
          'تعذر استلام رمز QR صالح.'
        );
      }

      if (qrObjectUrl) {
        URL.revokeObjectURL(
          qrObjectUrl
        );
      }

      qrObjectUrl =
        URL.createObjectURL(
          blob
        );

      els.qrImage.src =
        qrObjectUrl;

      els.qrImage.classList.remove(
        'hidden'
      );

      els.qrLoading.classList.add(
        'hidden'
      );

      els.qrStatus.textContent =
        'في انتظار مسح الرمز من WhatsApp...';

      startQrPolling();
    } catch (error) {
      els.qrLoading.classList.add(
        'hidden'
      );

      els.qrStatus.textContent =
        error.message;

      els.qrStatus.className =
        'qr-status';

      showAlert(
        error.message,
        'error'
      );
    }
  }

  async function connectWhatsapp() {
    els.connectWhatsappBtn.disabled =
      true;

    showAlert('');

    try {
      const store =
        await refreshWhatsapp({
          silent: true
        });

      if (
        isConnectedStatus(
          store?.whatsapp?.lastStatus
        )
      ) {
        applyWhatsappState(store);
        return;
      }

      const whatsapp =
        store?.whatsapp ||
        currentStore?.whatsapp ||
        {};

      const provisioned =
        Boolean(
          whatsapp.tokenConfigured ||
          whatsapp.instanceId
        );

      if (!provisioned) {
        throw new Error(
          'خدمة WhatsApp لم تُجهز لهذا المتجر بعد. جهّز قناة الربط من إدارة التطبيق ثم أعد المحاولة.'
        );
      }

      openQrModal();
      await loadQr();
    } catch (error) {
      showAlert(
        error.message,
        'error'
      );
    } finally {
      const connected =
        isConnectedStatus(
          currentStore?.whatsapp?.lastStatus
        );

      els.connectWhatsappBtn.disabled =
        connected;
    }
  }

  async function disconnectWhatsapp() {
    const confirmed =
      window.confirm(
        'هل تريد فصل رقم WhatsApp الحالي؟ ستتوقف رسائل الاستعادة حتى تربط رقمًا من جديد.'
      );

    if (!confirmed) {
      return;
    }

    els.disconnectWhatsappBtn.disabled =
      true;

    try {
      await api(
        '/api/whatsapp/logout',
        {
          method: 'POST'
        }
      );

      if (currentStore?.whatsapp) {
        currentStore.whatsapp.lastStatus =
          'disconnected';

        currentStore.whatsapp.phone =
          '';
      }

      els.enabled.checked = false;

      applyWhatsappState(
        currentStore || {}
      );

      updateRecoveryUi();

      showAlert(
        'تم فصل WhatsApp. اربط الرقم من جديد قبل تشغيل الاستعادة.',
        'success'
      );
    } catch (error) {
      showAlert(
        error.message,
        'error'
      );
    } finally {
      els.disconnectWhatsappBtn.disabled =
        false;
    }
  }

  async function saveSettings() {
    els.saveBtn.disabled = true;

    setSaveState(
      'جاري الحفظ',
      'نحفظ إعدادات الاستعادة الآن...'
    );

    showAlert('');

    try {
      validateSettings();

      const payload = {
        enabled:
          els.enabled.checked,

        sendAfterMinutes:
          Number(
            els.sendAfterMinutes.value
          ),

        discountEnabled:
          els.discountEnabled.checked,

        discountType:
          els.discountType.value,

        discountValue:
          els.discountEnabled.checked
            ? Number(
                els.discountValue.value ||
                0
              )
            : 0,

        couponCode:
          els.discountEnabled.checked
            ? els.couponCode.value.trim()
            : '',

        messageTemplate:
          getTemplate()
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
        result?.store ||
        {
          ...(currentStore || {}),
          settings: payload
        }
      );

      setSaveState(
        'تم الحفظ',
        els.enabled.checked
          ? 'الاستعادة تعمل بالإعدادات الجديدة ✓'
          : 'تم حفظ الإعدادات والاستعادة متوقفة.',
        'success'
      );

      showAlert(
        'تم حفظ الإعدادات بنجاح.',
        'success'
      );
    } catch (error) {
      setSaveState(
        'راجع الإعدادات',
        error.message,
        'error'
      );

      showAlert(
        error.message,
        'error'
      );
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  function markDirty() {
    setSaveState(
      'لديك تعديلات غير محفوظة',
      'اضغط حفظ الإعدادات لتطبيق التغييرات.'
    );
  }

  els.discountEnabled.addEventListener(
    'change',
    () => {
      updateDiscountUi();
      markDirty();
    }
  );

  els.enabled.addEventListener(
    'change',
    () => {
      updateRecoveryUi();
      markDirty();
    }
  );

  [
    els.sendAfterMinutes,
    els.discountType,
    els.discountValue,
    els.couponCode
  ].forEach((element) => {
    element.addEventListener(
      'input',
      () => {
        updateMessagePreview();
        markDirty();
      }
    );

    element.addEventListener(
      'change',
      () => {
        updateMessagePreview();
        markDirty();
      }
    );
  });

  document
    .querySelectorAll(
      'input[name="messageStyle"]'
    )
    .forEach((input) => {
      input.addEventListener(
        'change',
        () => {
          currentMessageStyle =
            getSelectedMessageStyle();

          updateMessagePreview();
          markDirty();
        }
      );
    });

  els.connectWhatsappBtn.addEventListener(
    'click',
    connectWhatsapp
  );

  els.refreshWhatsappBtn.addEventListener(
    'click',
    async () => {
      const store =
        await refreshWhatsapp();

      if (store) {
        showAlert(
          isConnectedStatus(
            store.whatsapp?.lastStatus
          )
            ? 'WhatsApp متصل وجاهز للإرسال.'
            : 'تم تحديث حالة WhatsApp.',
          'success'
        );
      }
    }
  );

  els.disconnectWhatsappBtn.addEventListener(
    'click',
    disconnectWhatsapp
  );

  els.saveBtn.addEventListener(
    'click',
    saveSettings
  );

  els.closeQrBtn.addEventListener(
    'click',
    closeQrModal
  );

  els.reloadQrBtn.addEventListener(
    'click',
    loadQr
  );

  els.checkQrStatusBtn.addEventListener(
    'click',
    async () => {
      els.checkQrStatusBtn.disabled =
        true;

      els.qrStatus.textContent =
        'جاري التحقق من الاتصال...';

      const store =
        await refreshWhatsapp({
          silent: true
        });

      if (
        isConnectedStatus(
          store?.whatsapp?.lastStatus
        )
      ) {
        els.qrStatus.textContent =
          'تم الاتصال بنجاح ✓';

        els.qrStatus.className =
          'qr-status success';
      } else {
        els.qrStatus.textContent =
          'لم يتم الاتصال بعد. امسح الرمز ثم انتظر لحظات.';

        els.qrStatus.className =
          'qr-status';
      }

      els.checkQrStatusBtn.disabled =
        false;
    }
  );

  els.qrModal.addEventListener(
    'click',
    (event) => {
      if (
        event.target.matches(
          '[data-close-qr]'
        )
      ) {
        closeQrModal();
      }
    }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        !els.qrModal.classList.contains(
          'hidden'
        )
      ) {
        closeQrModal();
      }
    }
  );

  window.addEventListener(
    'beforeunload',
    () => {
      stopQrPolling();

      if (qrObjectUrl) {
        URL.revokeObjectURL(
          qrObjectUrl
        );
      }
    }
  );

  updateMessagePreview();
  loadStore();
})();
