const axios = require('axios');

const {
  decryptSecret
} = require('./crypto');


// ========================================
// HTTP Client
// ========================================

const http = axios.create({
  timeout: 12000,

  headers: {
    Accept:
      'application/json'
  }
});


// ========================================
// استخراج رسالة الخطأ
// ========================================

function errorMessage(
  error,
  fallback =
    'Salla API request failed'
) {
  return (
    error?.response
      ?.data
      ?.message ||

    error?.response
      ?.data
      ?.error ||

    error?.message ||

    fallback
  );
}


// ========================================
// التحقق من Embedded Token
// ========================================

async function introspectEmbeddedToken(
  token
) {
  const appId =
    String(
      process.env
        .SALLA_APP_ID ||
      ''
    ).trim();

  const cleanToken =
    String(
      token ||
      ''
    ).trim();


  if (!appId) {
    throw new Error(
      'SALLA_APP_ID is missing'
    );
  }


  if (!cleanToken) {
    throw new Error(
      'Salla embedded token is missing'
    );
  }


  try {
    const {
      data
    } =
      await http.post(
        'https://api.salla.dev/exchange-authority/v1/introspect',

        {
          token:
            cleanToken
        },

        {
          headers: {
            's-source':
              appId,

            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          }
        }
      );


    if (
      !data?.success ||
      !data?.data
        ?.merchant_id
    ) {
      console.error(
        '❌ Invalid Salla introspection response:',
        data
      );

      throw new Error(
        'Salla token introspection failed'
      );
    }


    return data.data;

  } catch (error) {
    console.error(
      '❌ Salla introspection error:',
      error.response?.status ||
      '',
      error.response?.data ||
      error.message
    );


    throw new Error(
      errorMessage(
        error,
        'Salla token introspection failed'
      )
    );
  }
}


// ========================================
// Authorization Headers
// ========================================

function authHeaders(store) {
  const encryptedToken =
    store?.salla
      ?.accessTokenEnc;


  if (!encryptedToken) {
    throw new Error(
      'No Salla access token stored for this merchant'
    );
  }


  const token =
    decryptSecret(
      encryptedToken
    );


  if (!token) {
    throw new Error(
      'Unable to decrypt Salla access token'
    );
  }


  return {
    Authorization:
      `Bearer ${token}`,

    Accept:
      'application/json'
  };
}


// ========================================
// بيانات المستخدم / المتجر
// ========================================

async function getUserInfo(
  accessToken
) {
  const token =
    String(
      accessToken ||
      ''
    ).trim();


  if (!token) {
    throw new Error(
      'Salla access token is missing'
    );
  }


  try {
    const {
      data
    } =
      await http.get(
        'https://accounts.salla.sa/oauth2/user/info',

        {
          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              'application/json'
          }
        }
      );


    return (
      data?.data ||
      null
    );

  } catch (error) {
    console.error(
      '❌ Failed to fetch Salla user info:',
      error.response?.status ||
      '',
      error.response?.data ||
      error.message
    );


    throw new Error(
      errorMessage(
        error,
        'Failed to fetch Salla user info'
      )
    );
  }
}


// ========================================
// تفاصيل السلة المتروكة
// ========================================

async function getAbandonedCart(
  store,
  cartId
) {
  const id =
    String(
      cartId ||
      ''
    ).trim();


  if (!id) {
    throw new Error(
      'Abandoned cart ID is missing'
    );
  }


  try {
    const {
      data
    } =
      await http.get(
        `https://api.salla.dev/admin/v2/carts/abandoned/${encodeURIComponent(
          id
        )}`,

        {
          headers:
            authHeaders(
              store
            )
        }
      );


    if (
      data?.success ===
      false
    ) {
      throw new Error(
        data?.message ||
        'Failed to fetch abandoned cart'
      );
    }


    return (
      data?.data ||
      null
    );

  } catch (error) {
    console.error(
      `❌ Failed to fetch abandoned cart ${id}:`,
      error.response?.status ||
      '',
      error.response?.data ||
      error.message
    );


    throw new Error(
      errorMessage(
        error,
        'Failed to fetch abandoned cart'
      )
    );
  }
}


// ========================================
// تفاصيل منتج
// ========================================

async function getProduct(
  store,
  productId
) {
  const id =
    String(
      productId ||
      ''
    ).trim();


  if (!id) {
    throw new Error(
      'Product ID is missing'
    );
  }


  try {
    const {
      data
    } =
      await http.get(
        `https://api.salla.dev/admin/v2/products/${encodeURIComponent(
          id
        )}`,

        {
          headers: {
            ...authHeaders(
              store
            ),

            'Accept-Language':
              'ar'
          }
        }
      );


    if (
      data?.success ===
      false
    ) {
      throw new Error(
        data?.message ||
        'Failed to fetch product'
      );
    }


    return (
      data?.data ||
      null
    );

  } catch (error) {
    console.error(
      `❌ Failed to fetch Salla product ${id}:`,
      error.response?.status ||
      '',
      error.response?.data ||
      error.message
    );


    throw new Error(
      errorMessage(
        error,
        'Failed to fetch Salla product'
      )
    );
  }
}


// ========================================
// Exports
// ========================================

module.exports = {
  introspectEmbeddedToken,
  getUserInfo,
  getAbandonedCart,
  getProduct
};