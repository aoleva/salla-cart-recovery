(async () => {
  const embedded =
    window.Salla?.embedded ||
    window.salla?.embedded;

  if (!embedded) {
    document.body.innerHTML =
      '<p style="text-align:center;padding:40px">تعذر تحميل Salla Embedded SDK.</p>';
    return;
  }

  try {
    await embedded.init({
      debug: true
    });

    const token =
      embedded.auth.getToken();

    if (!token) {
      throw new Error(
        'لم يتم استلام جلسة سلة.'
      );
    }

    const response =
      await fetch(
        '/api/embedded/login',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            token
          })
        }
      );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ||
        'تعذر التحقق من جلسة سلة.'
      );
    }

    embedded.page?.setTitle?.(
      'استعادة السلات المتروكة'
    );

    embedded.ready();

    window.location.replace(
      '/dashboard'
    );

  } catch (error) {
    console.error(
      'Embedded startup error:',
      error
    );

    document.body.innerHTML =
      `<div style="
        font-family:Arial,sans-serif;
        text-align:center;
        padding:40px;
        direction:rtl;
      ">
        <h3>تعذر فتح التطبيق</h3>
        <p>${error.message}</p>
      </div>`;
  }
})();