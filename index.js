const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook/salla', async (req, res) => {
    try {
        const eventData = req.body;
        console.log('تم استلام حدث جديد من سلة:', eventData.event);

        if (eventData.event === 'cart.created' || eventData.event === 'cart.abandoned') {
            const customerPhone = eventData.data.customer.mobile;
            const customerName = eventData.data.customer.first_name;
            const cartTotal = eventData.data.total;
            console.log(`رسالة استرداد سلة لـ: ${customerName} على الرقم ${customerPhone}`);
        }

        return res.status(200).json({ status: 'success', message: 'Webhook received successfully' });
    } catch (error) {
        console.error('خطأ في معالجة الويب هوك:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على البورت: ${PORT}`);
});
