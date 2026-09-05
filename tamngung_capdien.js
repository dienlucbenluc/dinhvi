const API_URL = 'https://script.google.com/macros/s/AKfycbypH-vE7ctJxQObLPLvRrG71zbVx6_6E40foxkb4SS7e38kCmnyuj-09kuUGyFxcGhW/exec';
const API_URL = 'https://script.google.com/macros/s/AKfycbzKkiiIsB_4BWx2VUN2rIiC6s1MQY6L9g5S90J90__ja83-7_awlfyxbMYevwAFJuq9fg/exec';
const CLOUDINARY_CLOUD_NAME = 'jokzcdxt';
const CLOUDINARY_UPLOAD_PRESET = 'image_catdien';

let allCustomers = [];
let busy = false;

document.addEventListener('DOMContentLoaded', () => {
  // Tự động gán ngày hiện tại cho ô Date
  const dateInput = document.getElementById('filterDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  // Khởi tạo thông tin người dùng từ localStorage khi đăng nhập
  initUserInfo();

  const searchBox = document.getElementById('searchBox');
  if (searchBox) {
    searchBox.addEventListener('input', renderFiltered);
  }

  loadCustomers();
});

function initUserInfo() {
  // Lấy dữ liệu đăng nhập từ localStorage
  const currentUser = JSON.parse(localStorage.getItem('user_info') || '{}');
  const tenNdung = currentUser.ten_ndung || '';
  const level = Number(currentUser.level || 3);

  const selectUser = document.getElementById('userSelect');
  if (!selectUser) return;

  // Lấy danh sách nhân viên từ danh sách đã lưu hoặc lấy mẫu từ hệ thống
  const userList = JSON.parse(localStorage.getItem('users_list') || '[]');
  
  selectUser.innerHTML = '';
  
  if (userList.length > 0) {
    userList.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.ten_ndung;
      opt.textContent = u.ten_nvien || u.ten_ndung;
      if (u.ten_ndung === tenNdung) opt.selected = true;
      selectUser.appendChild(opt);
    });
  } else if (tenNdung) {
    const opt = document.createElement('option');
    opt.value = tenNdung;
    opt.textContent = currentUser.ten_nvien || tenNdung;
    opt.selected = true;
    selectUser.appendChild(opt);
  }

  // Khóa Combobox nếu level = 3 (chỉ xem của mình), cho phép chọn nếu level = 1
  if (level !== 1) {
    selectUser.disabled = true;
  }
}

function setStatus(text, error = false) {
  const el = document.getElementById('status');
  if (!el) return;
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

function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_cb_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('KẾT NỐI QUÁ THỜI GIAN.'));
    }, 10000);

    function cleanup() {
      clearTimeout(timeoutId);
      if (window[callbackName]) delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };

    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = function() {
      cleanup();
      reject(new Error('Không thể kết nối đến Web App.'));
    };

    document.body.appendChild(script);
  });
}

// 2 & 3. Hàm tải khách hàng dựa vào date, combo value ten_ndung và level
async function loadCustomers() {
  if (busy) return;

  busy = true;
  const btn = document.getElementById('btnSearch');
  if (btn) btn.disabled = true;
  setStatus('Đang kết nối server...');

  const currentUser = JSON.parse(localStorage.getItem('user_info') || '{}');
  const selectedDate = document.getElementById('filterDate')?.value || '';
  const selectedUser = document.getElementById('userSelect')?.value || currentUser.ten_ndung || '';
  const level = Number(currentUser.level || 3);

  // Tạo URL truy vấn truyền kèm date, ten_ndung và level
  const queryParams = new URLSearchParams({
    action: 'getList',
    date: selectedDate,
    ten_ndung: selectedUser,
    level: level
  });

  try {
    let res;
    try {
      res = await fetchJSONP(`${API_URL}?${queryParams.toString()}`);
    } catch (jsonpErr) {
      console.warn('JSONP thất bại, thử Fetch:', jsonpErr);
      const response = await fetch(`${API_URL}?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Server Apps Script từ chối kết nối.');
      res = await response.json();
    }

    busy = false;
    if (btn) btn.disabled = false;

    if (!res || !res.success || !Array.isArray(res.data)) {
      throw new Error(res?.message || 'Dữ liệu trả về không hợp lệ.');
    }

    allCustomers = res.data;
    renderFiltered();
    setStatus(`Đã tải ${allCustomers.length} khách hàng.`);
  } catch (err) {
    busy = false;
    if (btn) btn.disabled = false;
    setStatus('Lỗi lấy danh sách: ' + err.message, true);
  }
}

function renderFiltered() {
  const searchBox = document.getElementById('searchBox');
  const keyword = searchBox ? normalize(searchBox.value) : '';
  const list = keyword
    ? allCustomers.filter(c => {
        const text = [
          value(c, 'MA_KHANG', 'ma_khang'),
          value(c, 'TEN_KHANG', 'ten_khang'),
          value(c, 'MA_SOGCS', 'ma_sogcs'),
          value(c, 'DANH_SO', 'danh_so'),
          value(c, 'SO_CTO', 'so_cto'),
          value(c, 'VTRI_DNOI', 'vtri_dnoi')
        ].map(normalize).join(' ');
        return text.includes(keyword);
      })
    : allCustomers;

  renderCustomers(list);
}

function renderCustomers(items) {
  const root = document.getElementById('customerList');
  if (!root) return;

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
    const lat = String(value(c, 'LAT', 'lat') || '').trim();
    const lng = String(value(c, 'LNG', 'lng') || '').trim();
    const picture = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    const hasLocation = lat !== '' && lng !== '' && !isNaN(lat) && !isNaN(lng);

    let locationHtml = '';
    if (hasLocation) {
      const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      locationHtml = `
        <a href="${mapUrl}" target="_blank" style="color: #1976d2; font-weight: bold; text-decoration: none;">
          📍 Xem Google Maps
        </a>
      `;
    } else {
      locationHtml = `
        <button id="btn-location-${safeKey}" 
                onclick="getLocationAndSave(${index}, '${safeKey}')" 
                style="background: #ef6c00; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 12px; border: 0; cursor: pointer;">
          📍 Lấy tọa độ mới
        </button>
      `;
    }

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
          <div class="item"><label>TỌA ĐỘ</label><div id="loc-cell-${safeKey}">${locationHtml}</div></div>
        </div>

        <div class="photo-actions-container">
          <div class="picture-box" id="picture-${safeKey}">
            ${picture ? `<img src="${escapeHtml(picture)}" alt="Hình ảnh ${escapeHtml(maKhang)}">` : 'Chưa có hình ảnh'}
          </div>

          <div class="actions-right">
            <label class="check-wrap">
              <input type="checkbox" id="check-${safeKey}" ${Number(value(c, 'TINH_TRANG', 'tinh_trang')) === 1 ? 'checked' : ''}>
              Đã cắt điện
            </label>

            <button class="btn-photo" onclick="takePhoto(${index}, '${safeKey}')">📷 Chụp ảnh</button>
            <button class="btn-save" id="save-${safeKey}" onclick="saveCustomer(${index}, '${safeKey}')">💾 Lưu</button>

            <input type="file"
                   id="file-${safeKey}"
                   accept="image/*"
                   capture="environment"
                   style="display:none"
                   onchange="photoSelected(${index}, '${safeKey}', this)">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function getLocationAndSave(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const btnLoc = document.getElementById(`btn-location-${safeKey}`);
  const maKhang = value(c, 'MA_KHANG', 'ma_khang');

  if (!navigator.geolocation) {
    setStatus('Trình duyệt không hỗ trợ GPS.', true);
    return;
  }

  if (btnLoc) {
    btnLoc.disabled = true;
    btnLoc.textContent = '⏳ Đang lấy vị trí...';
  }
  setStatus(`Đang định vị GPS cho ${maKhang}...`);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      try {
        const payload = {
          action: 'save',
          payload: { MA_KHANG: maKhang, LAT: lat, LNG: lng }
        };

        const response = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!result || result.success !== true) throw new Error(result?.message || 'Không thể lưu tọa độ.');

        c.LAT = lat;
        c.LNG = lng;

        const cell = document.getElementById(`loc-cell-${safeKey}`);
        if (cell) {
          const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
          cell.innerHTML = `<a href="${mapUrl}" target="_blank" style="color: #1976d2; font-weight: bold; text-decoration: none;">📍 Xem Google Maps</a>`;
        }

        setStatus(`Đã lưu tọa độ cho ${maKhang}!`);
      } catch (err) {
        if (btnLoc) {
          btnLoc.disabled = false;
          btnLoc.textContent = '📍 Lấy tọa độ mới';
        }
        setStatus('Lỗi lưu tọa độ: ' + err.message, true);
      }
    },
    (err) => {
      if (btnLoc) {
        btnLoc.disabled = false;
        btnLoc.textContent = '📍 Lấy tọa độ mới';
      }
      setStatus('Không thể lấy vị trí GPS: ' + err.message, true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function takePhoto(index, safeKey) {
  const input = document.getElementById('file-' + safeKey);
  if (input) input.click();
}

function photoSelected(index, safeKey, input) {
  const file = input.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = e => {
    const box = document.getElementById('picture-' + safeKey);
    if (box) box.innerHTML = `<img src="${e.target.result}" alt="Ảnh mới">`;

    allCustomers[index]._newPhotoFile = file;
    allCustomers[index]._newPhotoDataUrl = e.target.result;
    setStatus('Đã chọn ảnh. Nhấn Lưu để cập nhật.');
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

  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append('file', blob, `${maKhang || 'khachhang'}_${Date.now()}.jpg`);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'tamngung_capdien');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`,
    { method: 'POST', body: form }
  );

  if (!response.ok) throw new Error('Cloudinary upload lỗi.');
  const result = await response.json();
  return result.secure_url || result.url || '';
}

async function saveCustomer(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const btn = document.getElementById('save-' + safeKey);
  const checkbox = document.getElementById('check-' + safeKey);
  if (btn && btn.disabled) return;

  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu...';
  }

  try {
    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    let imageUrl = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    if (c._newPhotoDataUrl) {
      setStatus(`Đang upload hình ${maKhang}...`);
      imageUrl = await uploadToCloudinary(c._newPhotoDataUrl, maKhang);
    }

    const tinhTrang = checkbox && checkbox.checked ? 1 : 0;
    const payload = {
      action: 'save',
      payload: {
        MA_KHANG: maKhang,
        HINH_ANH: imageUrl,
        PICTUREBOX: imageUrl,
        TINH_TRANG: tinhTrang
      }
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!result || result.success !== true) throw new Error(result?.message || 'Lưu thất bại.');

    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }

    c.HINH_ANH = imageUrl;
    c.TINH_TRANG = tinhTrang;
    delete c._newPhotoDataUrl;

    setStatus(`Đã lưu ${maKhang} thành công.`);
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
    setStatus(err.message || String(err), true);
  }
}
