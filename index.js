const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// دالة إرسال الواتساب (تم وضع بياناتك هنا)
async function sendWhatsAppMessage(mobile, customerName, cartTotal) {
    const API_URL = "https://api.ultramsg.com/instance189061/"; 
    const INSTANCE_ID = "189061";
    const TOKEN = "5undhi8grr4dtap6";

    const message = `أهلاً ${customerName}، لاحظنا أنك تركت سلة بقيمة ${cartTotal} ريال. 🛒\nاستخدم الكوبون "SAVE20" لتحصل على خصم 20% وأكمل طلبك الآن!`;

    try {
        await axios.post(`${API_URL}messages/chat?token=${TOKEN}`, {
            to: mobile,
            body: message
        });
        console.log("✅ تم إرسال رسالة الواتساب بنجاح للعميل:", customerName);
    } catch (error) {
        console.error("❌ فشل إرسال الرسالة:", error.message);
    }
}

app.post('/webhook/salla', async (req, res) => {
    const data = req.body;

    console.log("-----------------------------------------");
    console.log("🔔 وصلت سلة متروكة جديدة!");

    if (data.event === 'cart.abandoned' && data.data) {
        const customer = data.data.customer;
        const total = data.data.cart?.total?.amount || 0;

        if (customer && customer.mobile) {
            console.log(`👤 العميل: ${customer.first_name || ''} - 📱 الجوال: ${customer.mobile}`);
            await sendWhatsAppMessage(customer.mobile, customer.first_name || 'عميلنا العزيز', total);
        }
    }
    console.log("-----------------------------------------");

    res.status(200).send({ status: "success" });
});

app.get('/', (req, res) => {
    res.send('السيرفر يعمل بكفاءة!');
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على البورت: ${PORT}`);
});
