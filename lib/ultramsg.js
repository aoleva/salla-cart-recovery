const axios = require('axios');

const {
  decryptSecret
} = require('./crypto');


// ========================================
// Timeout
// ========================================

function getTimeout() {
  const value =
    Number(
      process.env
        .ULTRAMSG_TIMEOUT_MS
    );

  if (
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  return 10000;
}


// ========================================
// تجهيز Instance Path
// ========================================

function instancePath(
  instanceId
) {
  const raw =
    String(
      instanceId || ''
    ).trim();

  if (!raw) {
    throw new Error(
      'UltraMsg instance is not configured'
    );
  }

  return raw.startsWith(
    'instance'
  )
    ? raw
    : `instance${raw}`;
}


// ========================================
// استخراج بيانات UltraMsg
// ========================================

function credentials(
  store
) {
  const instanceId =
    String(
      store?.whatsapp
        ?.instanceId ||
      ''
    ).trim();

  const encryptedToken =
    store?.whatsapp
      ?.tokenEnc;


  if (!instanceId) {
    throw new Error(
      'UltraMsg instance is not configured'
    );
  }


  if (!encryptedToken) {
    throw new Error(
      'UltraMsg token is not configured'
    );
  }


  const token =
    decryptSecret(
      encryptedToken
    );


  if (!token) {
    throw new Error(
      'Unable to decrypt UltraMsg token'
    );
  }


  return {
    instance:
      instancePath(
        instanceId
      ),

    token:
      String(token)
        .trim()
  };
}


// ========================================
// تجهيز Client
// ========================================

function client(
  store
) {
  const {
    instance,
    token
  } =
    credentials(
      store
    );

  return {
    base:
      `https://api.ultramsg.com/${instance}`,

    token
  };
}


// ========================================
// استخراج رسالة خطأ UltraMsg
// ========================================

function providerError(
  data,
  fallback =
    'UltraMsg request failed'
) {
  if (!data) {
    return fallback;
  }


  if (
    typeof data ===
    'string'
  ) {
    return data;
  }


  if (
    typeof data.error ===
    'string'
  ) {
    return data.error;
  }


  if (data.error) {
    try {
      return JSON.stringify(
        data.error
      );
    } catch (_) {
      return fallback;
    }
  }


  if (
    typeof data.message ===
    'string'
  ) {
    return data.message;
  }


  return fallback;
}


// ========================================
// التحقق من رد UltraMsg
// ========================================

function ensureSuccess(
  data
) {
  if (
    data?.error
  ) {
    throw new Error(
      providerError(
        data
      )
    );
  }

  return data;
}


// ========================================
// إرسال رسالة WhatsApp
// ========================================

async function sendChat(
  store,
  to,
  body
) {
  const destination =
    String(
      to || ''
    ).trim();

  const message =
    String(
      body || ''
    ).trim();


  if (!destination) {
    throw new Error(
      'WhatsApp destination is missing'
    );
  }


  if (!message) {
    throw new Error(
      'WhatsApp message is empty'
    );
  }


  const {
    base,
    token
  } =
    client(
      store
    );


  const form =
    new URLSearchParams();

  form.set(
    'token',
    token
  );

  form.set(
    'to',
    destination
  );

  form.set(
    'body',
    message
  );

  form.set(
    'priority',
    '10'
  );


  try {
    const {
      data
    } =
      await axios.post(
        `${base}/messages/chat`,

        form.toString(),

        {
          timeout:
            getTimeout(),

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded'
          }
        }
      );


    return ensureSuccess(
      data
    );

  } catch (error) {
    if (
      error?.response
        ?.data
    ) {
      throw new Error(
        providerError(
          error.response.data,
          error.message
        )
      );
    }

    throw error;
  }
}


// ========================================
// معرفة حالة اتصال WhatsApp
// ========================================

async function getStatus(
  store
) {
  const {
    base,
    token
  } =
    client(
      store
    );


  try {
    const {
      data
    } =
      await axios.get(
        `${base}/instance/status`,

        {
          params: {
            token
          },

          timeout:
            getTimeout()
        }
      );


    return ensureSuccess(
      data
    );

  } catch (error) {
    if (
      error?.response
        ?.data
    ) {
      throw new Error(
        providerError(
          error.response.data,
          error.message
        )
      );
    }

    throw error;
  }
}


// ========================================
// معلومات الرقم المتصل
// ========================================

async function getMe(
  store
) {
  const {
    base,
    token
  } =
    client(
      store
    );


  try {
    const {
      data
    } =
      await axios.get(
        `${base}/instance/me`,

        {
          params: {
            token
          },

          timeout:
            getTimeout()
        }
      );


    return ensureSuccess(
      data
    );

  } catch (error) {
    if (
      error?.response
        ?.data
    ) {
      throw new Error(
        providerError(
          error.response.data,
          error.message
        )
      );
    }

    throw error;
  }
}


// ========================================
// الحصول على QR Code
// ========================================

async function getQrImage(
  store
) {
  const {
    base,
    token
  } =
    client(
      store
    );


  const response =
    await axios.get(
      `${base}/instance/qr`,

      {
        params: {
          token
        },

        responseType:
          'arraybuffer',

        timeout:
          getTimeout(),

        // نرجع Response حتى لو UltraMsg
        // رجع حالة مثل 400 أو 404
        // والـRoute هو الذي يقرر ماذا يعرض
        validateStatus:
          () => true
      }
    );


  return response;
}


// ========================================
// فصل WhatsApp
// ========================================

async function logout(
  store
) {
  const {
    base,
    token
  } =
    client(
      store
    );


  const form =
    new URLSearchParams();

  form.set(
    'token',
    token
  );


  try {
    const {
      data
    } =
      await axios.post(
        `${base}/instance/logout`,

        form.toString(),

        {
          timeout:
            getTimeout(),

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded'
          }
        }
      );


    return ensureSuccess(
      data
    );

  } catch (error) {
    if (
      error?.response
        ?.data
    ) {
      throw new Error(
        providerError(
          error.response.data,
          error.message
        )
      );
    }

    throw error;
  }
}


// ========================================
// Exports
// ========================================

module.exports = {
  sendChat,
  getStatus,
  getMe,
  getQrImage,
  logout
};