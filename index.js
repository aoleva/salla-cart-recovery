require('dotenv').config();

const express = require('express');
const axios = require('axios');
const helmet = require('helmet');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3000;

const INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const TOKEN = process.env.ULTRAMSG_TOKEN;

const COUPON_CODE = process.env.COUPON_CODE || 'SAVE20';
const DISCOUNT_PERCENT = process.env.DISCOUNT_PERCENT || '20';

const ULTRAMSG_TIMEOUT_MS =
    Number(process.env.ULTRAMSG_TIMEOUT_MS) || 10000;

const DEDUPE_TTL_MS =
    Number(process.env.DEDUPE_TTL_MS) || 24 * 60 * 60 * 1000;


// ========================================
// التحقق من إعدادات UltraMsg
// ========================================

if (!INSTANCE_ID || !TOKEN) {
    console.error(
        '❌ خطأ: يجب إضافة ULTRAMSG_INSTANCE_ID و ULTRAMSG_TOKEN'
    );
    process.exit(1);
}


// ========================================
// منع معالجة نفس الحدث أكثر من مرة
// ملاحظة: التخزين هنا مؤقت داخل الذاكرة
// ========================================

const processedEvents = new Map();

function cleanupProcessedEvents() {
    const now = Date.now();

    for (const [key, timestamp] of processedEvents.entries()) {
        if (now - timestamp > DEDUPE_TTL_MS) {
            processedEvents.delete(key);
        }
    }
}

function getEventKey(data) {
    const eventId =
        data?.id ||
        data?.event_id ||
        data?.data?.id ||
        data?.data?.cart?.id;

    if (!eventId) {
        return null;
    }

    return `${data.event}:${eventId}`;
}

function isDuplicateEvent(key) {
    if (!key) {
        return false;
    }

    cleanupProcessedEvents();

    if (processedEvents.has(key)) {
        return true;
    }

    processedEvents.set(key, Date.now());

    return false;
}


// ========================================
// تجهيز رقم الجوال
// ========================================

function normalizeMobile(mobile) {
    if (!mobile) {
        return null;
    }

    let normalized = String(mobile)
        .trim()
        .replace(/[^\d+]/g, '');

    if (normalized.startsWith('+')) {
        normalized = normalized.substring(1);
    }

    if (normalized.startsWith('00')) {
        normalized = normalized.substring(2);
    }

    return normalized || null;
}


// ========================================
// إخفاء جزء من رقم العميل في Logs
// ========================================

function maskMobile(mobile) {
    if (!mobile || mobile.length < 6) {
        return '***';
    }

    return `${mobile.slice(0, 3)}****${mobile.slice(-3)}`;
}


// ========================================
// إرسال رسالة WhatsApp
// ========================================

async function sendWhatsAppMessage(
    mobile,
    customerName,
    cartTotal
) {
    const API_URL =
        `https://api.ultramsg.com/instance${INSTANCE_ID}/messages/chat`;

    const message =
        `أهلاً ${customerName} 👋\n\n` +
        `لاحظنا أنك تركت سلة بقيمة ${cartTotal} ريال 🛒\n\n` +
        `استخدم الكوبون "${COUPON_CODE}" لتحصل على خصم ${DISCOUNT_PERCENT}% وأكمل طلبك الآن!`;

    try {

        const response = await axios.post(
            `${API_URL}?token=${encodeURIComponent(TOKEN)}`,
            {
                to: mobile,
                body: message
            },
            {
                timeout: ULTRAMSG_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(
            `✅ تم إرسال WhatsApp إلى ${customerName} (${maskMobile(mobile)})`
        );

        return {
            success: true,
            data: response.data
        };

    } catch (error) {

        const errorDetails =
            error.response?.data ||
            error.message ||
            'Unknown error';

        console.error(
            `❌ فشل إرسال WhatsApp إلى ${maskMobile(mobile)}:`,
            errorDetails
        );

        return {
            success: false,
            error: errorDetails
        };
    }
}


// ========================================
// معالجة السلة المتروكة
// ========================================

async function processAbandonedCart(data) {

    if (data.event !== 'cart.abandoned') {
        return;
    }

    if (!data.data) {
        console.log('⚠️ الحدث لا يحتوي على data');
        return;
    }

    const eventKey = getEventKey(data);

    if (isDuplicateEvent(eventKey)) {
        console.log(
            '⚠️ تم تجاهل Webhook مكرر:',
            eventKey
        );
        return;
    }


    // محاولة قراءة بيانات العميل بأكثر من شكل
    const customer =
        data.data.customer ||
        data.data.cart?.customer;


    if (!customer) {
        console.log(
            '⚠️ لم يتم العثور على بيانات العميل'
        );
        return;
    }


    const rawMobile =
        customer.mobile ||
        customer.phone;

    const mobile =
        normalizeMobile(rawMobile);


    if (!mobile) {
        console.log(
            '⚠️ العميل ليس لديه رقم جوال صالح'
        );
        return;
    }


    const customerName =
        customer.first_name ||
        customer.name ||
        'عميلنا العزيز';


    // دعم أكثر من شكل محتمل لقيمة السلة
    const cartTotal =
        data.data.cart?.total?.amount ??
        data.data.total?.amount ??
        data.data.total ??
        0;


    console.log('-----------------------------------------');

    console.log('🛒 سلة متروكة جديدة');

    console.log(
        `👤 العميل: ${customerName}`
    );

    console.log(
        `📱 الجوال: ${maskMobile(mobile)}`
    );

    console.log(
        `💰 قيمة السلة: ${cartTotal} ريال`
    );


    await sendWhatsAppMessage(
        mobile,
        customerName,
        cartTotal
    );

    console.log('-----------------------------------------');
}


// ========================================
// Salla Webhook
// ========================================

app.post('/webhook/salla', (req, res) => {

    const data = req.body;

    // نرسل الرد لسلة بسرعة
    res.status(200).json({
        status: 'received'
    });


    // نتأكد أن Payload صحيح
    if (!data || typeof data !== 'object') {
        console.log('⚠️ تم استقبال Payload غير صالح');
        return;
    }


    console.log(
        `🔔 Webhook وصل من سلة: ${data.event || 'unknown'}`
    );


    // تشغيل المعالجة بعد الرد على سلة
    setImmediate(async () => {

        try {

            await processAbandonedCart(data);

        } catch (error) {

            console.error(
                '❌ خطأ أثناء معالجة Webhook:',
                error.message
            );

        }

    });

});


// ========================================
// صفحة فحص السيرفر
// ========================================

app.get('/', (req, res) => {

    res.status(200).json({
        status: 'success',
        message: 'Salla Cart Recovery Server is running'
    });

});


// ========================================
// Health Check
// ========================================

app.get('/health', (req, res) => {

    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });

});


// ========================================
// معالجة المسارات غير الموجودة
// ========================================

app.use((req, res) => {

    res.status(404).json({
        status: 'error',
        message: 'Route not found'
    });

});


// ========================================
// تشغيل السيرفر
// ========================================

app.listen(PORT, () => {

    console.log('=========================================');

    console.log(
        `🚀 السيرفر يعمل على البورت: ${PORT}`
    );

    console.log(
        '✅ Salla Cart Recovery جاهز'
    );

    console.log('=========================================');

});
