/*
 * tamngung_capdien.js
 * Front-end cho trang Tạm ngừng cấp điện.
 *
 * Backend Google Apps Script cần cung cấp:
 *   1) getTamNgungCapDienList()
 *   2) saveTamNgungCapDien(payload)
 *
 * Cloudinary:
 *   - Điền CLOUDINARY_CLOUD_NAME
 *   - Điền CLOUDINARY_UPLOAD_PRESET (Unsigned upload preset)
 */

const CLOUDINARY_CLOUD_NAME = 'jokzcdxt';
const CLOUDINARY_UPLOAD_PRESET = 'image_catdien';

let allCustomers = [];
let busy = false;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchBox').addEventListener('input', renderFiltered);
  loadCustomers();
});

function setStatus(text, error = false) {
  const el = document.getElementById('status');
  el.textContent = text || '';
  el.style.color = error ? '#c62828' : '#555';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalize(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function value(obj, ...names) {
  for (const name of names) {
    if (obj && obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return '';
}

function loadCustomers() {
  if (busy) return;
  busy = true;
  document.getElementById('btnLoad').disabled = true;
  setStatus('Đang lấy danh sách khách hàng...');

  if (!window.google || !google.script || !google.script.run) {
    busy = false;
    document.getElementById('btnLoad').disabled = false;
    setStatus('Không tìm thấy Google Apps Script.', true);
    return;
  }

  google.script.run
    .withSuccessHandler(data => {
      busy = false;
      document.getElementById('btnLoad').disabled = false;

      if (!Array.isArray(data)) {
        allCustomers = [];
        renderFiltered();
        setStatus('Backend không trả về danh sách hợp lệ.', true);
        return;
      }

      allCustomers = data;
      renderFiltered();
      setStatus(`Đã tải ${allCustomers.length} khách hàng.`);
    })
    .withFailureHandler(err => {
      busy = false;
      document.getElementById('btnLoad').disabled = false;
      setStatus('Lỗi lấy danh sách: ' + (err?.message || err), true);
    })
    .getTamNgungCapDienList();
}

function renderFiltered() {
  const keyword = normalize(document.getElementById('searchBox').value);
  const list = keyword
    ? allCustomers.filter(c => {
        const text = [
          value(c, 'MA_KHANG', 'ma_khang'),
          value(c, 'TEN_KHANG', 'ten_khang'),
          value(c, 'MA_SOGCS', 'ma_sogcs'),
          value(c, 'DANH_SO', 'danh_so'),
          value(c, 'SO_CTO', 'so_cto', 'SO_CTO'),
          value(c, 'VTRI_DNOI', 'vtri_dnoi')
        ].map(normalize).join(' ');
        return text.includes(keyword);
      })
    : allCustomers;

  renderCustomers(list);
}

function renderCustomers(items) {
  const root = document.getElementById('customerList');

  if (!items.length) {
    root.innerHTML = '<div class="empty">Không có khách hàng phù hợp.</div>';
    return;
  }

  root.innerHTML = items.map((c, index) => {
    const key = String(value(c, 'MA_KHANG', 'ma_khang') || index);
    const safeKey = encodeURIComponent(key);

    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    const tenKhang = value(c, 'TEN_KHANG', 'ten_khang');
    const maSogcs = value(c, 'MA_SOGCS', 'ma_sogcs');
    const danhSo = value(c, 'DANH_SO', 'danh_so');
    const soCto = value(c, 'SO_CTO', 'so_cto');
    const vtriDnoi = value(c, 'VTRI_DNOI', 'vtri_dnoi');
    const tenTram = value(c, 'TEN_TRAM', 'ten_tram');
    const lat = value(c, 'LAT', 'lat');
    const lng = value(c, 'LNG', 'lng');
    const picture = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    return `
      <div class="customer-box" id="box-${safeKey}" data-index="${index}">
        <div class="box-head">
          <div class="ma-khang">Mã KH: ${escapeHtml(maKhang)}</div>
          <div class="ten-khang">${escapeHtml(tenKhang)}</div>
        </div>

        <div class="grid">
          <div class="item"><label>MA_SOGCS</label><div>${escapeHtml(maSogcs)}</div></div>
          <div class="item"><label>DANH_SO</label><div>${escapeHtml(danhSo)}</div></div>
          <div class="item"><label>SO_CTO</label><div>${escapeHtml(soCto)}</div></div>
          <div class="item"><label>VTRI_DNOI</label><div>${escapeHtml(vtriDnoi)}</div></div>
          <div class="item"><label>TEN_TRAM</label><div>${escapeHtml(tenTram)}</div></div>
          <div class="item"><label>TỌA ĐỘ</label><div>${escapeHtml(lat)} , ${escapeHtml(lng)}</div></div>
        </div>

        <div class="photo-area">
          <div class="picture-box" id="picture-${safeKey}">
            ${picture ? `<img src="${escapeHtml(picture)}" alt="Hình ảnh ${escapeHtml(maKhang)}">` : 'Chưa có hình ảnh'}
          </div>
        </div>

        <div class="actions">
          <button class="btn-photo" onclick="takePhoto(${index}, '${safeKey}')">📷 Chụp ảnh</button>
          <label class="check-wrap">
            <input type="checkbox" id="check-${safeKey}" ${Number(value(c, 'TINH_TRANG', 'tinh_trang')) === 1 ? 'checked' : ''}>
            Đã cắt điện
          </label>
          <button class="btn-save" id="save-${safeKey}" onclick="saveCustomer(${index}, '${safeKey}')">💾 Lưu</button>
          <input type="file"
                 id="file-${safeKey}"
                 accept="image/*"
                 capture="environment"
                 style="display:none"
                 onchange="photoSelected(${index}, '${safeKey}', this)">
        </div>
      </div>
    `;
  }).join('');
}

function takePhoto(index, safeKey) {
  document.getElementById('file-' + safeKey).click();
}

function photoSelected(index, safeKey, input) {
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setStatus('Vui lòng chọn file hình ảnh.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const box = document.getElementById('picture-' + safeKey);
    box.innerHTML = `<img src="${e.target.result}" alt="Ảnh mới">`;

    allCustomers[index]._newPhotoFile = file;
    allCustomers[index]._newPhotoDataUrl = e.target.result;

    setStatus('Đã chọn ảnh. Nhấn Lưu để upload và cập nhật.');
  };
  reader.readAsDataURL(file);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadToCloudinary(dataUrl, maKhang) {
  if (!dataUrl) return '';

  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.startsWith('THAY_') ||
      !CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.startsWith('THAY_')) {
    throw new Error('Chưa cấu hình CLOUDINARY_CLOUD_NAME và CLOUDINARY_UPLOAD_PRESET trong tamngung_capdien.js');
  }

  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append('file', blob, `${maKhang || 'khachhang'}_${Date.now()}.jpg`);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'tamngung_capdien');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`,
    { method: 'POST', body: form }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error('Cloudinary upload lỗi: ' + txt);
  }

  const result = await response.json();
  return result.secure_url || result.url || '';
}

async function saveCustomer(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const btn = document.getElementById('save-' + safeKey);
  const checkbox = document.getElementById('check-' + safeKey);

  if (btn.disabled) return;

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '⏳ Đang lưu...';

  try {
    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    if (!maKhang) throw new Error('Thiếu MA_KHANG.');

    let imageUrl = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    if (c._newPhotoDataUrl) {
      setStatus(`Đang upload hình ${maKhang} lên Cloudinary...`);
      imageUrl = await uploadToCloudinary(c._newPhotoDataUrl, maKhang);
    }

    // Checked => TINH_TRANG = 1, bỏ check => 0.
    const tinhTrang = checkbox.checked ? 1 : 0;

    const payload = {
      MA_KHANG: maKhang,
      HINH_ANH: imageUrl,
      PICTUREBOX: imageUrl,
      TINH_TRANG: tinhTrang
    };

    setStatus(`Đang cập nhật ${maKhang}...`);

    google.script.run
      .withSuccessHandler(result => {
        btn.disabled = false;
        btn.textContent = oldText;

        if (result && result.success === false) {
          setStatus(result.message || 'Lưu thất bại.', true);
          return;
        }

        // Giữ URL ảnh và trạng thái mới trong bộ nhớ để không phải tải lại toàn bộ danh sách.
        c.HINH_ANH = imageUrl;
        c.hinh_anh = imageUrl;
        c.PICTUREBOX = imageUrl;
        c.TINH_TRANG = tinhTrang;
        delete c._newPhotoFile;
        delete c._newPhotoDataUrl;

        setStatus(`Đã lưu ${maKhang}. TINH_TRANG = ${tinhTrang}.`);
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.textContent = oldText;
        setStatus('Lỗi lưu: ' + (err?.message || err), true);
      })
      .saveTamNgungCapDien(payload);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = oldText;
    setStatus(err.message || String(err), true);
  }
}
