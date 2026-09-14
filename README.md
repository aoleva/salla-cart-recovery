# Salla Cart Recovery v2 — النسخة المحدثة للتطبيق الحالي

هذه النسخة مبنية لتُرفع **مكان النسخة القديمة** على نفس الاستضافة ونفس تطبيق سلة الحالي. لا تنشئ تطبيقًا جديدًا في Salla Partner Portal.

## ما تم إضافته

- Multi-Store: إعدادات مستقلة لكل Merchant ID.
- صفحة Embedded داخل لوحة سلة للتاجر.
- التاجر يحدد نسبة/مبلغ الخصم، كود الكوبون، وقت الإرسال، ونص الرسالة.
- الرسالة تدعم اسم المتجر، أسماء المنتجات، قيمة السلة، العملة، والعرض ورابط استكمال السلة.
- WhatsApp لكل متجر مستقل: أنت تخصّص UltraMsg Instance مرة واحدة، والتاجر يربط جواله بالـQR مرة واحدة، وبعدها الرسائل تعمل تلقائيًا.
- Queue دائمة محليًا في `data/state.json` بدل الاعتماد على `setTimeout` فقط.
- إلغاء الرسالة عند وصول `abandoned.cart.purchased` قبل موعد الإرسال.
- دعم أحداث سلة الرسمية `abandoned.cart`, `abandoned.cart.updated`, `abandoned.cart.status.changed`, `abandoned.cart.purchased`.
- الاحتفاظ بدعم `cart.abandoned` مؤقتًا لتوافق اختبارات النسخة القديمة.
- تشفير Access Tokens وUltraMsg Tokens على القرص باستخدام AES-256-GCM.
- دعم Custom Secret Header اختياري للتحقق من Webhook سلة.

## مهم: ربط WhatsApp

UltraMsg يحتاج Instance مستقلة لكل رقم. في النسخة الحالية:

1. المتجر يثبت تطبيقك من سلة.
2. التطبيق يستقبل `app.store.authorize` ويخزن Merchant ID وAccess Token مشفرًا.
3. أنت تدخل `/admin` وتخصص لهذا Merchant: `UltraMsg Instance ID + Token` مرة واحدة.
4. التاجر يفتح التطبيق داخل سلة ويضغط **ربط WhatsApp**.
5. يظهر QR؛ يمسحه من WhatsApp > الأجهزة المرتبطة.
6. بعد أن تصبح الحالة `authenticated` لا يحتاج التاجر لإعادة الربط إلا إذا فصل الجلسة/الجهاز.

التاجر **لا يرى UltraMsg Token**.

## تشغيل محلي

```bash
npm install
```

انسخ `.env.example` إلى `.env`.

إنشاء مفتاح AES 64-hex:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ثم:

```bash
npm start
```

للتجربة المحلية فقط:

- Dashboard: `http://localhost:3000/dev/login?merchant=demo`
- Admin: `http://localhost:3000/admin`
- Health: `http://localhost:3000/health`

## إعداد Environment على الاستضافة

في Production استخدم:

```env
NODE_ENV=production
DEV_MODE=false
COOKIE_SECURE=true
APP_BASE_URL=https://YOUR-CURRENT-DOMAIN.com
SALLA_APP_ID=YOUR_EXISTING_SALLA_APP_ID
SESSION_SECRET=LONG_RANDOM_SECRET
APP_ENCRYPTION_KEY=64_HEX_CHARACTERS
ADMIN_KEY=LONG_PRIVATE_ADMIN_KEY
RECOVERY_WORKER_INTERVAL_MS=15000
ULTRAMSG_TIMEOUT_MS=10000
```

اختياري للأمان: أضف Custom Header في Webhook إعدادات تطبيقك في Salla Partner Portal ثم ضع نفس القيمة هنا:

```env
SALLA_WEBHOOK_SECRET=LONG_RANDOM_WEBHOOK_SECRET
SALLA_WEBHOOK_SECRET_HEADER=x-cart-recovery-secret
```

إذا لم تضبط `SALLA_WEBHOOK_SECRET` لن يرفض السيرفر Webhooks القديمة، وهذا يسهل الترقية بدون قطع الربط الحالي.

## نفس تطبيق سلة الحالي

على نفس التطبيق الموجود حاليًا في مرحلة النشر:

- Webhook URL يبقى/يصبح:

```text
https://YOUR-CURRENT-DOMAIN.com/webhook/salla
```

- أضف Embedded Page داخل **نفس التطبيق** واجعل Iframe URL:

```text
https://YOUR-CURRENT-DOMAIN.com/salla/embedded
```

- ضع App ID الحالي في `SALLA_APP_ID`.

لا تغيّر App ID ولا تنشئ تطبيقًا جديدًا.

## الصلاحيات المطلوبة في سلة

الحد الأدنى:

- `carts.read` لقراءة تفاصيل السلة المتروكة.
- `products.read` إذا أردت جلب أسماء المنتجات عندما لا تكون موجودة في Payload.
- `offline_access` مهم لاستمرار الوصول حسب إعداد OAuth في تطبيقك.

## أحداث التطبيق/المتجر المهمة

- `app.store.authorize`
- `app.installed`
- `app.updated`
- `app.uninstalled`
- `app.subscription.started`
- `app.subscription.renewed`
- `app.subscription.expired`
- `app.subscription.canceled`
- `abandoned.cart`
- `abandoned.cart.updated`
- `abandoned.cart.status.changed`
- `abandoned.cart.purchased`

## قبل الرفع مكان النسخة القديمة

1. خذ Backup من المشروع القديم.
2. لا تنقل `.env` إلى GitHub.
3. ارفع ملفات هذه النسخة على نفس Repository/Hosting.
4. اضبط Environment Variables في الاستضافة.
5. اعمل Deploy.
6. جرّب `/health`.
7. من Demo Store، أعد تثبيت/تفويض التطبيق إذا احتجت لإعادة إرسال `app.store.authorize` للنسخة الجديدة.
8. افتح `/admin`، اضغط **عرض المتاجر المسجلة** ثم اختر Merchant ID وخصص UltraMsg Instance.
9. افتح التطبيق من لوحة سلة واضغط **ربط WhatsApp** وامسح QR.
10. أنشئ سلة متروكة تجريبية وتأكد من وصول الرسالة.

## ملاحظات Production

`data/state.json` مناسب للاختبار والإطلاق المحدود على Server واحد. قبل التوسع إلى عدد كبير من المتاجر أو أكثر من نسخة Server، انقل التخزين إلى PostgreSQL والـjobs إلى Queue مثل Redis/BullMQ.

كما يجب مراجعة سياسة موافقة العميل على رسائل WhatsApp وسياسات سلة/Meta قبل الإرسال التجاري واسع النطاق.
