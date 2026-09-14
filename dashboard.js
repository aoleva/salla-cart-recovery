const $ = (id) => document.getElementById(id);
let merchant = null;
let statusTimer = null;

function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.style.background = error ? '#9b2c2c' : '#14382e';
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.message || data?.error || data || `HTTP ${res.status}`);
  return data;
}

function collect() {
  return {
    enabled: $('enabled').checked,
    discountEnabled: $('discountEnabled').checked,
    discountType: $('discountType').value,
    discountValue: Number($('discountValue').value || 0),
    couponCode: $('couponCode').value.trim(),
    sendAfterMinutes: Number($('sendAfterMinutes').value || 0),
    messageTemplate: $('messageTemplate').value,
  };
}

function preview() {
  const s = collect();
  const discount = s.discountType === 'fixed' ? `${s.discountValue} SAR` : `${s.discountValue}%`;
  const offer = s.discountEnabled && s.couponCode
    ? `استخدم كود ${s.couponCode} واحصل على خصم ${discount}.`
    : s.discountEnabled ? `لديك خصم ${discount} على طلبك.` : '';
  const values = {
    '{customer_name}': 'أحمد', '{store_name}': merchant?.storeName || 'اسم متجرك',
    '{products_text}': 'المنتج «مثال منتج»', '{cart_total}': '250', '{currency}': 'SAR',
    '{offer_line}': offer, '{checkout_url}': 'https://store.example/checkout', '{coupon_code}': s.couponCode,
    '{discount}': discount,
  };
  let text = s.messageTemplate || '';
  for (const [key, value] of Object.entries(values)) text = text.split(key).join(value);
  $('preview').textContent = text.replace(/\n{3,}/g, '\n\n');
}

function fillSettings(settings) {
  $('enabled').checked = settings.enabled !== false;
  $('discountEnabled').checked = settings.discountEnabled !== false;
  $('discountType').value = settings.discountType || 'percent';
  $('discountValue').value = settings.discountValue ?? 10;
  $('couponCode').value = settings.couponCode || '';
  $('sendAfterMinutes').value = settings.sendAfterMinutes ?? 30;
  $('messageTemplate').value = settings.messageTemplate || '';
  preview();
}

async function loadMe() {
  const data = await api('/api/me');
  merchant = data.store;
  $('storeBadge').textContent = merchant.storeName || `متجر ${merchant.merchantId}`;
  fillSettings(merchant.settings);
  await refreshWhatsApp();
}

async function refreshWhatsApp() {
  try {
    const data = await api('/api/whatsapp/status');
    $('waNotProvisioned').classList.toggle('hidden', data.provisioned);
    $('connectBtn').classList.toggle('hidden', !data.provisioned || data.authenticated);
    $('waConnected').classList.toggle('hidden', !data.authenticated);
    if (!data.provisioned) {
      $('waStatus').textContent = 'يحتاج تفعيل'; $('waStatus').className = 'status warn';
      $('waQrArea').classList.add('hidden');
      return;
    }
    if (data.authenticated) {
      $('waStatus').textContent = 'متصل'; $('waStatus').className = 'status ok';
      $('waPhone').textContent = data.phone || 'متصل';
      $('waQrArea').classList.add('hidden');
    } else {
      $('waStatus').textContent = data.status || 'غير متصل'; $('waStatus').className = 'status neutral';
    }
  } catch (error) {
    $('waStatus').textContent = 'تعذر الفحص'; $('waStatus').className = 'status warn';
  }
}

$('saveBtn').addEventListener('click', async () => {
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(collect()) });
    toast('تم حفظ الإعدادات بنجاح ✅');
  } catch (error) { toast(error.message, true); }
});

$('connectBtn').addEventListener('click', async () => {
  $('waQrArea').classList.remove('hidden');
  $('qrImage').src = `/api/whatsapp/qr?ts=${Date.now()}`;
  clearInterval(statusTimer);
  statusTimer = setInterval(async () => {
    await refreshWhatsApp();
    if (!$('waConnected').classList.contains('hidden')) clearInterval(statusTimer);
  }, 5000);
});

$('logoutBtn').addEventListener('click', async () => {
  if (!confirm('سيتم فصل رقم WhatsApp من التطبيق. هل تريد المتابعة؟')) return;
  try {
    await api('/api/whatsapp/logout', { method: 'POST', body: '{}' });
    toast('تم فصل WhatsApp. يمكنك ربطه مرة أخرى.');
    await refreshWhatsApp();
  } catch (error) { toast(error.message, true); }
});

document.querySelectorAll('input, select, textarea').forEach((el) => el.addEventListener('input', preview));
document.querySelectorAll('.chips button').forEach((btn) => btn.addEventListener('click', () => {
  const textarea = $('messageTemplate');
  const token = btn.dataset.token;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
  textarea.focus(); textarea.selectionStart = textarea.selectionEnd = start + token.length;
  preview();
}));

loadMe().catch((error) => toast(error.message, true));
