const API_URL = 'https://script.google.com/macros/s/AKfycbypH-vE7ctJxQObLPLvRrG71zbVx6_6E40foxkb4SS7e38kCmnyuj-09kuUGyFxcGhW/exec';
const CLOUDINARY_CLOUD_NAME = 'jokzcdxt';
const CLOUDINARY_UPLOAD_PRESET = 'image_catdien';

let allCustomers = [];
let busy = false;
let appInitialized = false;
let nhanVienLoaded = false;
let pendingCancelArgs = null; // Biến lưu tạm thông tin khách hàng chờ hủy

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  const dateInput = document.getElementById('filterDate');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    dateInput.value = localDate;
  }

  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.addEventListener('input', renderFiltered);

  await loadNhanVienList();
  loadCustomers();
}

function getCurrentUser() {
  const keys = ['cmis_user_session', 'user_info'];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') return obj;
      } catch (e) {
        console.warn('Không đọc được phiên đăng nhập:', key, e);
      }
    }
  }
  return {};
}

function getUserField(user, ...names) {
  for (const name of names) {
    if (user && user[name] !== undefined && user[name] !== null) {
      const v = String(user[name]).trim();
      if (v !== '') return v;
    }
  }
  return '';
}

function setStatus(text, error = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = error ? '#d32f2f' : '#2e7d32';
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
    const callbackName = 'jsonp_cb_' + Math.round(1000000 * Math.random());
    const script = document.createElement('script');

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('KẾT NỐI QUÁ THỜI GIAN.'));
    }, 10000);

    function cleanup() {
      clearTimeout(timeoutId);
      try { delete window[callbackName]; } catch (_) {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };

    script.src = url + (url.includes('?') ? '&' : '?') +
                 'callback=' + encodeURIComponent(callbackName);
    script.onerror = function() {
      cleanup();
      reject(new Error('Không thể kết nối đến Web App.'));
    };

    document.body.appendChild(script);
  });
}

async function loadNhanVienList() {
  if (nhanVienLoaded) return;

  const selectUser = document.getElementById('userSelect');
  if (!selectUser) return;

  const currentUser = getCurrentUser();
  const loggedTenNdung = String(getUserField(
    currentUser, 'ten_ndung', 'TEN_NDUNG', 'username', 'userName'
  ) || '').trim();

  if (!loggedTenNdung) {
    selectUser.innerHTML =
      '<option value="">-- Chưa có đăng nhập --</option>';
    selectUser.disabled = true;
    setStatus(
      'Không đọc được cmis_user_session. Bác hãy đăng nhập lại từ login.html.',
      true
    );
    return;
  }

  selectUser.disabled = true;
  selectUser.style.display = '';
  selectUser.innerHTML = '<option value="">⏳ Đang tải nhân viên...</option>';

  try {
    const query = new URLSearchParams({
      action: 'getNhanVien',
      ten_ndung: loggedTenNdung
    });

    let res;
    try {
      res = await fetchJSONP(`${API_URL}?${query.toString()}`);
    } catch (_) {
      const response = await fetch(`${API_URL}?${query.toString()}`);
      if (!response.ok) throw new Error('Server Apps Script từ chối kết nối.');
      res = await response.json();
    }

    if (!res || res.success !== true || !Array.isArray(res.data)) {
      throw new Error(res?.message || 'Dữ liệu nhân viên không hợp lệ.');
    }

    let actualLevel = Number(res.level);

    if (!Number.isFinite(actualLevel) || actualLevel <= 0) {
      const loggedRow = res.data.find(u =>
        normalize(String(u.ten_ndung || '')) === normalize(loggedTenNdung)
      );
      const rowLevel = Number(loggedRow?.level);
      if (Number.isFinite(rowLevel) && rowLevel > 0) actualLevel = rowLevel;
    }

    const level = Number.isFinite(actualLevel) && actualLevel > 0 ? actualLevel : 3;

    currentUser.ten_ndung = loggedTenNdung;
    currentUser.level = level;
    localStorage.setItem('cmis_user_session', JSON.stringify(currentUser));

    selectUser.innerHTML = '';

    res.data.forEach(u => {
      const tenNdung = String(u.ten_ndung ?? '').trim();
      if (!tenNdung) return;

      const tenNvien = String(u.ten_nvien ?? '').trim();
      const opt = document.createElement('option');
      opt.value = tenNdung;
      opt.textContent = tenNvien || tenNdung;

      if (normalize(tenNdung) === normalize(loggedTenNdung)) {
        opt.selected = true;
      }
      selectUser.appendChild(opt);
    });

    if (!selectUser.options.length) {
      const opt = document.createElement('option');
      opt.value = loggedTenNdung;
      opt.textContent = getUserField(currentUser, 'ten_nvien', 'TEN_NVIEN') || loggedTenNdung;
      opt.selected = true;
      selectUser.appendChild(opt);
    }

    selectUser.style.display = '';
    selectUser.disabled = level !== 1;

    if (level === 1) {
      setStatus(`Đã tải ${res.data.length} nhân viên. Quyền Level 1.`);
    } else {
      setStatus(`Nhân viên: ${loggedTenNdung}. Quyền Level ${level}.`);
    }

    nhanVienLoaded = true;
  } catch (err) {
    console.error('Lỗi tải danh sách nhân viên:', err);
    selectUser.style.display = '';
    selectUser.innerHTML =
      `<option value="${escapeHtml(loggedTenNdung)}">${escapeHtml(
        getUserField(currentUser, 'ten_nvien', 'TEN_NVIEN') || loggedTenNdung
      )}</option>`;
    selectUser.disabled = true;
    setStatus('Lỗi tải danh sách nhân viên: ' + (err.message || err), true);
  }
}

async function loadCustomers() {
  if (busy) return;

  busy = true;
  const btn = document.getElementById('btnSearch');
  if (btn) btn.disabled = true;
  setStatus('Đang kết nối server...');

  const currentUser = getCurrentUser();
  const loggedTenNdung = String(getUserField(
    currentUser, 'ten_ndung', 'TEN_NDUNG', 'username', 'userName'
  ) || '').trim();
  const selectedDate = document.getElementById('filterDate')?.value || '';
  const selectedUser =
    document.getElementById('userSelect')?.value || loggedTenNdung;

  const parsedLevel = Number(currentUser.level);
  const level = Number.isFinite(parsedLevel) && parsedLevel > 0 ? parsedLevel : 3;

  const queryParams = new URLSearchParams({
    action: 'getList',
    date: selectedDate,
    ten_ndung: selectedUser,
    logged_ten_ndung: loggedTenNdung
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

    if (!res || !res.success || !Array.isArray(res.data)) {
      throw new Error(res?.message || 'Dữ liệu trả về không hợp lệ.');
    }

    allCustomers = res.data;
    renderFiltered();
    setStatus(`Đã tải ${allCustomers.length} khách hàng.`);
  } catch (err) {
    setStatus('Lỗi lấy danh sách: ' + err.message, true);
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
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

  const total = items.length;

  root.innerHTML = items.map((c, index) => {
    const key = String(value(c, 'MA_KHANG', 'ma_khang') || index);
    const safeKey = encodeURIComponent(key);
    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    const tenKhang = value(c, 'TEN_KHANG', 'ten_khang');
    const maSogcs = value(c, 'MA_SOGCS', 'ma_sogcs');
    const danhSo = value(c, 'DANH_SO', 'danh_so');
    const ngayCat = value(c, 'NGAY_CAT', 'ngay_cat');
    const soCto = value(c, 'SO_CTO', 'so_cto');
    const vtriDnoi = value(c, 'VTRI_DNOI', 'vtri_dnoi');
    const tenTram = value(c, 'TEN_TRAM', 'ten_tram');
    const lat = String(value(c, 'LAT', 'lat') || '').trim();
    const lng = String(value(c, 'LNG', 'lng') || '').trim();
    const picture = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');
    const hasLocation = lat !== '' && lng !== '' && !isNaN(lat) && !isNaN(lng);
    let optimizedPicture = picture;
    if (picture && picture.includes('cloudinary.com')) {
      optimizedPicture = picture.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
    }
    let dateOnly = "---";
    if (ngayCat) {
        const strTime = String(ngayCat).trim();
        const dateMatch = strTime.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        
        if (dateMatch) {
            dateOnly = dateMatch[0]; 
            let parts = dateOnly.split('/');
            if(parts.length === 3) {
                dateOnly = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
            }
        } else {
            const d = new Date(strTime);
            if (!isNaN(d.getTime())) {
                const day = d.getDate().toString().padStart(2, '0');
                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                dateOnly = `${day}/${month}/${d.getFullYear()}`;
            } else {
                dateOnly = strTime.split(/[ T]/)[0]; 
            }
        }
    }
    
    let locationHtml = hasLocation
      ? `<span href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:#1976d2;font-weight:bold;text-decoration:none;">📍 Xem Google Maps</span>`
      : `<span id="btn-location-${safeKey}" onclick="getLocationAndSave(${index}, '${safeKey}')" style="color:red;font-weight:bold;text-decoration:none;">📍 Bấm lấy tọa độ mới</span>`;

    return `
      <div class="customer-box" id="box-${safeKey}" data-index="${index}">
        <div class="box-stt-bar">
          <span class="stt-badge">STT: ${index + 1} / ${total}</span>
          <span class="swipe-hint">⬅️ Vuốt để đổi KH ➡️</span>
        </div>
        <div class="box-head">
          <div class="ma-khang">Mã KH: ${escapeHtml(maKhang)}</div>
          <div class="ten-khang">${escapeHtml(tenKhang)}</div>
        </div>
        <div class="grid">
          <div class="item">Sổ: ${escapeHtml(maSogcs)}</div>
          <div class="item">Danh số: ${escapeHtml(danhSo)}</div>
          <div class="item">Số CTơ: ${escapeHtml(soCto)}</div>
          <div class="item">Cột: ${escapeHtml(vtriDnoi)}</div>
          <div class="item">Ngày CĐ: ${dateOnly}</div>
          <div class="item"><a id="loc-cell-${safeKey}">${locationHtml}</a></div>
        </div>
         <div style="max-width: 400px; font-size:13px; padding:10px 12px;margin-top:-10px;white-space: nowrap;overflow: hidden; text-overflow: ellipsis;">Trạm: ${escapeHtml(tenTram)}</div>
        <div class="photo-actions-container">
         <div class="picture-box" id="picture-${safeKey}">
         ${optimizedPicture ? `<img src="${escapeHtml(optimizedPicture)}" alt="Hình ảnh ${escapeHtml(maKhang)}">` : 'Chưa có hình ảnh'}
         </div>
          <div class="actions-right">
            <label class="check-wrap">
              <input type="checkbox" id="check-${safeKey}" ${Number(value(c, 'TINH_TRANG', 'tinh_trang')) === 1 ? 'checked' : ''}>
              Đã cắt điện
            </label>
            <button class="btn-photo" onclick="takePhoto(${index}, '${safeKey}')">📷 Chụp ảnh</button>
            <button class="btn-save" id="save-${safeKey}" onclick="saveCustomer(${index}, '${safeKey}')">💾 Lưu</button>
            <button class="btn-cancel" id="cancel-${safeKey}" onclick="cancelCustomer(${index}, '${safeKey}')">❌ Hủy</button>
            <input type="file" id="file-${safeKey}" accept="image/*" capture="environment" style="display:none" onchange="photoSelected(${index}, '${safeKey}', this)">
          </div>
        </div>
      </div>`;
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

  // Lấy thông tin user đăng nhập
  const currentUser = getCurrentUser();
  const loggedTenNdung = String(getUserField(currentUser, 'ten_ndung', 'TEN_NDUNG', 'username') || '').trim();
  const loggedTenNvien = String(getUserField(currentUser, 'ten_nvien', 'TEN_NVIEN') || '').trim();

  navigator.geolocation.getCurrentPosition(
    async position => {
      try {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Truyền đầy đủ dữ liệu khách hàng + tọa độ để server ghi vào sheet dinh_vi
        const payload = {
          MA_KHANG: maKhang,
          TEN_KHANG: value(c, 'TEN_KHANG', 'ten_khang'),
          SO_CTO: value(c, 'SO_CTO', 'so_cto'),
          MA_TRAM: value(c, 'MA_TRAM', 'ma_tram'),
          TEN_TRAM: value(c, 'TEN_TRAM', 'ten_tram'),
          VTRI_DNOI: value(c, 'VTRI_DNOI', 'vtri_dnoi', 'SO_COT', 'so_cot'),
          TEN_NDUNG: loggedTenNdung,
          TEN_NVIEN: loggedTenNvien,
          TEN_CVIEC: 'Cắt điện',
          LAT: lat,
          LNG: lng
        };

        const response = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'save', payload: payload })
        });

        const result = await response.json();
        if (!result || result.success !== true) throw new Error(result?.message || 'Không thể lưu tọa độ.');

        c.LAT = lat; 
        c.LNG = lng;
        const cell = document.getElementById(`loc-cell-${safeKey}`);
        if (cell) cell.innerHTML = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:#1976d2;font-weight:bold;text-decoration:none;">📍 Xem Google Maps</a>`;
        setStatus(`Đã lưu tọa độ & ghi định vị thành công cho ${maKhang}!`);
      } catch (err) {
        if (btnLoc) { btnLoc.disabled = false; btnLoc.textContent = '📍 Lấy tọa độ mới'; }
        setStatus('Lỗi lưu tọa độ: ' + err.message, true);
      }
    },
    err => {
      if (btnLoc) { btnLoc.disabled = false; btnLoc.textContent = '📍 Lấy tọa độ mới'; }
      setStatus('Không thể lấy vị trí GPS: ' + err.message, true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function takePhoto(index, safeKey) {
  const input = document.getElementById('file-' + safeKey);
  if (input) input.click();
}

async function photoSelected(index, safeKey, input) {
  const file = input.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;

  try {
    setStatus('Đang nén tối ưu dung lượng ảnh...');
    
    const compressedDataUrl = await compressImage(file, 1000, 0.7);

    const box = document.getElementById('picture-' + safeKey);
    if (box) box.innerHTML = `<img src="${compressedDataUrl}" alt="Ảnh mới">`;
    
    allCustomers[index]._newPhotoFile = file;
    allCustomers[index]._newPhotoDataUrl = compressedDataUrl;
    
    setStatus('Đã chọn và tối ưu ảnh. Nhấn Lưu để cập nhật.');
  } catch (err) {
    console.error('Lỗi nén ảnh:', err);
    setStatus('Lỗi xử lý ảnh, vui lòng thử lại.', true);
  }
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
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu...'; }

  try {
    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    let imageUrl = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    if (c._newPhotoDataUrl) {
      setStatus(`Đang upload hình ${maKhang}...`);
      imageUrl = await uploadToCloudinary(c._newPhotoDataUrl, maKhang);
    }

    const tinhTrang = checkbox && checkbox.checked ? 1 : 0;
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'save',
        payload: {
          MA_KHANG: maKhang,
          HINH_ANH: imageUrl,
          PICTUREBOX: imageUrl,
          TINH_TRANG: tinhTrang
        }
      })
    });

    const result = await response.json();
    if (!result || result.success !== true) throw new Error(result?.message || 'Lưu thất bại.');

    c.HINH_ANH = imageUrl;
    c.TINH_TRANG = tinhTrang;
    delete c._newPhotoDataUrl;
    setStatus(`Đã lưu ${maKhang} thành công.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

// --- LOGIC MỚI CHO MODAL HỦY TRẠNG THÁI ---
function closeCancelModal() {
  const modal = document.getElementById('cancelModal');
  if (modal) modal.style.display = 'none';
  pendingCancelArgs = null;
}

function cancelCustomer(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const maKhang = value(c, 'MA_KHANG', 'ma_khang');
  
  const msgEl = document.getElementById('cancelModalMsg');
  if (msgEl) {
    msgEl.textContent = `Bạn có chắc chắn muốn hủy trạng thái và xóa hình ảnh của khách hàng ${maKhang}?`;
  }

  pendingCancelArgs = { index, safeKey, maKhang };

  const btnConfirm = document.getElementById('btnConfirmCancel');
  if (btnConfirm) {
    btnConfirm.onclick = executeCancel;
  }

  const modal = document.getElementById('cancelModal');
  if (modal) modal.style.display = 'flex';
}

async function executeCancel() {
  if (!pendingCancelArgs) return;

  const { index, safeKey, maKhang } = pendingCancelArgs;
  closeCancelModal();

  const c = allCustomers[index];
  const btnCancel = document.getElementById('cancel-' + safeKey);
  const btnSave = document.getElementById('save-' + safeKey);
  const checkbox = document.getElementById('check-' + safeKey);
  const pictureBox = document.getElementById('picture-' + safeKey);

  if (btnCancel && btnCancel.disabled) return;

  const oldText = btnCancel ? btnCancel.textContent : '';
  if (btnCancel) { btnCancel.disabled = true; btnCancel.textContent = '⏳ Đang hủy...'; }
  if (btnSave) btnSave.disabled = true;

  try {
    setStatus(`Đang tiến hành hủy và xóa ảnh cho ${maKhang}...`);

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'cancel',
        payload: {
          MA_KHANG: maKhang
        }
      })
    });

    const result = await response.json();
    if (!result || result.success !== true) {
      throw new Error(result?.message || 'Hủy thất bại.');
    }

    c.HINH_ANH = '';
    c.PICTUREBOX = '';
    c.TINH_TRANG = 0;
    c.LAT = ''; 
    c.LNG = ''; 
    delete c._newPhotoFile;
    delete c._newPhotoDataUrl;

    if (checkbox) checkbox.checked = false;
    if (pictureBox) pictureBox.innerHTML = 'Chưa có hình ảnh';
    const cell = document.getElementById(`loc-cell-${safeKey}`);
    if (cell) {
      cell.innerHTML = `<a id="btn-location-${safeKey}" onclick="getLocationAndSave(${index}, '${safeKey}')" style="color:red;font-weight:bold;text-decoration:none;">📍 Lấy tọa độ mới</a>`;
    }
    setStatus(`Đã hủy thành công khách hàng ${maKhang}.`);
  } catch (err) {
    setStatus('Lỗi khi hủy: ' + (err.message || String(err)), true);
  } finally {
    if (btnCancel) { btnCancel.disabled = false; btnCancel.textContent = oldText; }
    if (btnSave) btnSave.disabled = false;
  }
}

const slider = document.getElementById('customerList');

if (slider) {
  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
    slider.style.cursor = 'grabbing';
    slider.style.userSelect = 'none';
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.style.cursor = 'grab';
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.style.cursor = 'grab';
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });

  slider.style.cursor = 'grab';
}

function compressImage(file, maxWidth = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
}
