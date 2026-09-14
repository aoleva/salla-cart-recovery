const crypto = require('crypto');

function getKey() {
  const raw =
    String(
      process.env.APP_ENCRYPTION_KEY ||
      ''
    ).trim();

  if (
    /^[a-fA-F0-9]{64}$/.test(raw)
  ) {
    return Buffer.from(
      raw,
      'hex'
    );
  }

  const fallback =
    process.env.SESSION_SECRET ||
    'dev-only-change-me';

  if (
    process.env.NODE_ENV ===
    'production'
  ) {
    console.warn(
      '⚠️ APP_ENCRYPTION_KEY is not a valid 64-character hex key. Using fallback key.'
    );
  }

  return crypto
    .createHash('sha256')
    .update(
      fallback
    )
    .digest();
}


function encryptSecret(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      'aes-256-gcm',
      getKey(),
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(value),
        'utf8'
      ),

      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    iv.toString(
      'base64url'
    ),

    tag.toString(
      'base64url'
    ),

    encrypted.toString(
      'base64url'
    )
  ].join('.');
}


function decryptSecret(value) {
  if (!value) {
    return null;
  }

  try {
    const [
      ivRaw,
      tagRaw,
      dataRaw
    ] =
      String(value)
        .split('.');

    if (
      !ivRaw ||
      !tagRaw ||
      !dataRaw
    ) {
      return null;
    }

    const iv =
      Buffer.from(
        ivRaw,
        'base64url'
      );

    const tag =
      Buffer.from(
        tagRaw,
        'base64url'
      );

    const encrypted =
      Buffer.from(
        dataRaw,
        'base64url'
      );

    if (
      iv.length !== 12 ||
      tag.length !== 16
    ) {
      return null;
    }

    const decipher =
      crypto.createDecipheriv(
        'aes-256-gcm',
        getKey(),
        iv
      );

    decipher.setAuthTag(
      tag
    );

    const decrypted =
      Buffer.concat([
        decipher.update(
          encrypted
        ),

        decipher.final()
      ]);

    return decrypted.toString(
      'utf8'
    );

  } catch (error) {
    console.error(
      '❌ Failed to decrypt secret:',
      error.message
    );

    return null;
  }
}


module.exports = {
  encryptSecret,
  decryptSecret
};