const crypto = require('crypto');

function b64url(input) {
  return Buffer
    .from(input)
    .toString('base64url');
}

function sign(payload) {
  const secret =
    process.env.SESSION_SECRET ||
    'dev-only-change-me';

  const body =
    b64url(
      JSON.stringify(payload)
    );

  const signature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(body)
      .digest(
        'base64url'
      );

  return `${body}.${signature}`;
}

function verify(token) {
  if (!token) {
    return null;
  }

  try {
    const [
      body,
      signature
    ] =
      String(token)
        .split('.');

    if (
      !body ||
      !signature
    ) {
      return null;
    }

    const secret =
      process.env.SESSION_SECRET ||
      'dev-only-change-me';

    const expected =
      crypto
        .createHmac(
          'sha256',
          secret
        )
        .update(body)
        .digest(
          'base64url'
        );

    const a =
      Buffer.from(
        signature
      );

    const b =
      Buffer.from(
        expected
      );

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(
        a,
        b
      )
    ) {
      return null;
    }

    const payload =
      JSON.parse(
        Buffer
          .from(
            body,
            'base64url'
          )
          .toString(
            'utf8'
          )
      );

    if (
      payload.exp &&
      Date.now() >
        payload.exp
    ) {
      return null;
    }

    return payload;

  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const cookieHeader =
    String(
      req.headers.cookie ||
      ''
    );

  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean)
      .map(
        (part) => {
          const idx =
            part.indexOf('=');

          if (idx === -1) {
            return [
              part,
              ''
            ];
          }

          const name =
            part.slice(
              0,
              idx
            );

          const rawValue =
            part.slice(
              idx + 1
            );

          let value =
            rawValue;

          try {
            value =
              decodeURIComponent(
                rawValue
              );
          } catch (_) {}

          return [
            name,
            value
          ];
        }
      )
  );
}

function sessionMiddleware(
  req,
  res,
  next
) {
  const cookies =
    parseCookies(req);

  const session =
    verify(
      cookies
        .aoleva_session
    );

  if (
    !session
      ?.merchantId
  ) {
    return res
      .status(401)
      .json({
        success: false,

        message:
          'جلسة غير صالحة. افتح التطبيق من لوحة سلة مرة أخرى.'
      });
  }

  req.merchantId =
    String(
      session.merchantId
    );

  next();
}

function setSessionCookie(
  res,
  merchantId
) {
  const token =
    sign({
      merchantId:
        String(
          merchantId
        ),

      exp:
        Date.now() +
        8 *
        60 *
        60 *
        1000
    });

  const secure =
    String(
      process.env
        .COOKIE_SECURE ??
      'true'
    )
      .toLowerCase() ===
    'true';

  const parts = [
    `aoleva_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    'Max-Age=28800'
  ];

  if (secure) {
    parts.push(
      'Secure'
    );
  }

  res.setHeader(
    'Set-Cookie',
    parts.join('; ')
  );
}

module.exports = {
  sessionMiddleware,
  setSessionCookie
};