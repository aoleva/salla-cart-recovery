const crypto = require('crypto');

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY || '';

  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const fallback =
    process.env.SESSION_SECRET ||
    'dev-only-change-me';

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️ APP_ENCRYPTION_KEY is not a 64-char hex key. Using a derived fallback.'
    );
  }

  return crypto
    .createHash('sha256')
    .update(fallback)
    .digest();
}

function encryptSecret(value) {
  if (!value) return null;

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(
      String(value),
      'utf8'
    ),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

function decryptSecret(value) {
  if (!value) return null;

  const [
    ivRaw,
    tagRaw,
    dataRaw
  ] = String(value).split('.');

  if (
    !ivRaw ||
    !tagRaw ||
    !dataRaw
  ) {
    return null;
  }

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      getKey(),
      Buffer.from(
        ivRaw,
        'base64url'
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      tagRaw,
      'base64url'
    )
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        dataRaw,
        'base64url'
      )
    ),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret
};