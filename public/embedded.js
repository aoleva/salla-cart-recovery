(async () => {

  // ========================================
  // عناصر الصفحة
  // ========================================

  const loadingMessage =
    document.getElementById(
      'loadingMessage'
    );

  const errorMessage =
    document.getElementById(
      'errorMessage'
    );


  // ========================================
  // عرض حالة التحميل
  // ========================================

  function showLoading(
    message
  ) {
    if (
      loadingMessage
    ) {
      loadingMessage.style.display =
        'block';

      loadingMessage.textContent =
        message ||
        'جاري فتح التطبيق...';
    }


    if (
      errorMessage
    ) {
      errorMessage.style.display =
        'none';

      errorMessage.textContent =
        '';
    }
  }


  // ========================================
  // عرض الخطأ
  // ========================================

  function showError(
    message
  ) {
    if (
      loadingMessage
    ) {
      loadingMessage.style.display =
        'none';
    }


    if (
      errorMessage
    ) {
      errorMessage.style.display =
        'block';

      errorMessage.textContent =
        message ||
        'تعذر فتح التطبيق.';
    }
  }


  // ========================================
  // قراءة Response بأمان
  // ========================================

  async function readResponse(
    response
  ) {
    const text =
      await response.text();


    if (!text) {
      return {};
    }


    try {
      return JSON.parse(
        text
      );

    } catch (_) {
      return {
        message:
          text
      };
    }
  }


  // ========================================
  // التأكد إن الصفحة مفتوحة داخل سلة
  // ========================================

  if (
    window.self ===
    window.top
  ) {
    showError(
      'يجب فتح التطبيق من داخل لوحة تحكم سلة.'
    );

    return;
  }


  // ========================================
  // الحصول على Salla Embedded SDK
  // ========================================

  const embedded =
    window.salla
      ?.embedded ||

    window.Salla
      ?.embedded ||

    null;


  if (!embedded) {
    showError(
      'تعذر تحميل Salla Embedded SDK.'
    );

    console.error(
      'Salla Embedded SDK was not found.'
    );

    return;
  }


  try {

    // ========================================
    // 1) بدء الاتصال بلوحة سلة
    // ========================================

    showLoading(
      'جاري الاتصال بسلة...'
    );


    await embedded.init({
      debug: false
    });


    // ========================================
    // 2) الحصول على Session Token
    // ========================================

    showLoading(
      'جاري التحقق من المتجر...'
    );


    const token =
      embedded.auth
        ?.getToken?.();


    if (!token) {
      throw new Error(
        'لم يتم استلام جلسة المتجر من سلة.'
      );
    }


    // ========================================
    // 3) إرسال Token للسيرفر
    // ========================================

    const response =
      await fetch(
        '/api/embedded/login',

        {
          method:
            'POST',

          credentials:
            'include',

          cache:
            'no-store',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          body:
            JSON.stringify({
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
        data?.message ||
        data?.error ||
        `تعذر التحقق من جلسة سلة. HTTP ${response.status}`
      );
    }


    if (
      data?.success ===
      false
    ) {
      throw new Error(
        data?.message ||
        'تعذر إنشاء جلسة المتجر.'
      );
    }


    // ========================================
    // 4) تم إنشاء Session بنجاح
    // ========================================

    showLoading(
      'تم الاتصال بسلة، جاري فتح التطبيق...'
    );


    // إبلاغ لوحة سلة أن صفحة الدخول جاهزة
    embedded.ready();


    // ========================================
    // 5) الانتقال للـ Dashboard
    // ========================================

    window.location.replace(
      '/dashboard'
    );


  } catch (error) {

    console.error(
      'Embedded startup error:',
      error
    );


    // ========================================
    // في حالة فشل الاتصال أو المصادقة
    // ننهي جلسة SDK بشكل سليم
    // ========================================

    try {
      embedded.destroy?.();

    } catch (_) {}


    const message =
      String(
        error?.message ||
        'تعذر فتح التطبيق.'
      );


    // رسالة أوضح لو المشكلة من Context
    if (
      message.includes(
        'embedded::context.provide'
      ) ||
      message
        .toLowerCase()
        .includes(
          'timeout'
        )
    ) {
      showError(
        'لم يتم الاتصال بلوحة سلة. تأكد أن التطبيق مفتوح من داخل المتجر التجريبي في سلة وأن رابط الصفحة المضمّنة مضبوط بشكل صحيح.'
      );

      return;
    }


    showError(
      message
    );
  }

})();