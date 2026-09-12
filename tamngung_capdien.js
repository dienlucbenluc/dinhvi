const API_URL = 'https://script.google.com/macros/s/AKfycbypH-vE7ctJxQObLPLvRrG71zbVx6_6E40foxkb4SS7e38kCmnyuj-09kuUGyFxcGhW/exec';
const CLOUDINARY_CLOUD_NAME = 'jokzcdxt';
const CLOUDINARY_UPLOAD_PRESET = 'image_catdien';

const CACHE_KEY_CUSTOMERS = 'tamngung_customers_cache';
const CACHE_KEY_SESSION = 'tamngung_last_session';
const CACHE_KEY_DATE = 'tamngung_last_date';

let allCustomers = [];
let currentFilteredList = []; 
let currentCardIndex = 0;     
let isAnimating = false;      
let busy = false;
let appInitialized = false;
let pendingCancelArgs = null;

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

  setupSwipeEvents();
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

function showToast(text, error = false) {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    window.showToast(text, error);
    return;
  }
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    // Cố định chiều rộng 90% (tối đa 400px), chữ dài tự ngắt (...) không làm phình khung
    toast.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);padding:12px 16px;background:#006400;color:#fff;font-size:13px;z-index:10000;transition:opacity 0.3s;pointer-events:none;text-align:center;width:90%;max-width:400px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;border-radius:20px;';
    document.body.appendChild(toast);
  } else {
    // Đảm bảo trạng thái bình thường luôn trả về xanh lá
    toast.style.background = '#006400';
  }
  if (error) {
    toast.style.background = '#b71c1c';
  }
  toast.innerHTML = text || '';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

function updateStatsSummary() {
  const statsEl = document.getElementById('statsSummary');
  if (statsEl) {
    const uncutCount = getUncutCount();
    statsEl.innerHTML = `Tổng khách hàng: <span style=color:blue;>${allCustomers.length}</span> - Chưa thực hiện: <span style=color:red;>${uncutCount}</span>`;
  }
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

/**
 * Hàm tiện ích đếm số lượng khách hàng chưa thực hiện cắt điện (TINH_TRANG = 0 & Chưa thanh toán)
 */
function getUncutCount() {
  if (!allCustomers || allCustomers.length === 0) return 0;
  return allCustomers.filter(c => {
    const tinhTrang = Number(value(c, 'TINH_TRANG', 'tinh_trang') || 0);
    const sotienTtoan = value(c, 'SOTIEN_TTOAN', 'sotien_ttoan');
    const isSotienNull = (
      sotienTtoan === null ||
      sotienTtoan === undefined ||
      String(sotienTtoan).trim() === '' ||
      String(sotienTtoan).trim().toLowerCase() === 'null' ||
      String(sotienTtoan).trim() === 'Chưa TT'
    );
    return tinhTrang === 0 && isSotienNull;
  }).length;
}

function saveCache() {
  try {
    const selectedDate = localStorage.getItem(CACHE_KEY_DATE) || '';
    localStorage.setItem(`${CACHE_KEY_CUSTOMERS}_${selectedDate}`, JSON.stringify(allCustomers));
  } catch (e) {
    console.warn('Không thể lưu bộ nhớ web:', e);
  }
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

async function loadCustomers(forceFetch = false) {
  if (busy) return;

  // 1. Nếu ô chọn ngày bị trống (dd/mm/yyyy), tự động điền ngày hiện tại (YYYY-MM-DD)
  const dateInput = document.getElementById('filterDate');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    dateInput.value = localDate;
  }

  // 2. Chạy lại spinner hiển thị trạng thái đang lấy danh sách
  const root = document.getElementById('customerList');
  if (root) {
    root.innerHTML = `
      <li style="text-align: center; padding: 20px; list-style: none;">
        <span class="spinner"></span>
        <span style="font-weight: bold; color: #007bff; vertical-align: middle; font-size: 15px;">Đang lấy danh sách...</span>
      </li>`;
  }

  const currentUser = getCurrentUser();
  const loggedTenNdung = String(getUserField(
    currentUser, 'ten_ndung', 'TEN_NDUNG', 'username', 'userName'
  ) || '').trim();

  if (!loggedTenNdung) {
    showToast('không tìm thấy tài khoản đăng nhập.', true);
    if (root) root.innerHTML = '<div class="empty">Không tìm thấy tài khoản đăng nhập.</div>';
    return;
  }

  const selectedDate = dateInput?.value || '';
  const lastSession = localStorage.getItem(CACHE_KEY_SESSION);
  const lastDate = localStorage.getItem(CACHE_KEY_DATE);
  const cachedDataStr = localStorage.getItem(`${CACHE_KEY_CUSTOMERS}_${selectedDate}`);

  const isNewSession = (lastSession !== loggedTenNdung || lastDate !== selectedDate);

  if (!forceFetch && !isNewSession && cachedDataStr) {
    try {
      allCustomers = JSON.parse(cachedDataStr);
      renderFiltered();
      const countUncut = getUncutCount();
      showToast(` Tổng khách hàng: ${allCustomers.length}. (Chưa thực hiện: ${countUncut})`);
      fetchServerDataInBackground(selectedDate, loggedTenNdung);
      return;
    } catch (e) {
      console.warn('Lỗi đọc cache local, tải lại từ server...', e);
    }
  }

  await fetchServerData(selectedDate, loggedTenNdung);
}

/**
 * Hàm lọc lấy danh sách chưa cắt điện (TINH_TRANG = 0 và SOTIEN_TTOAN = null / rỗng)
 */
function filterUncutCustomers() {
  if (!allCustomers || allCustomers.length === 0) {
    showToast('Chưa có dữ liệu danh sách khách hàng.', true);
    return;
  }

  // Xóa nội dung khung tìm kiếm từ khóa để tránh xung đột bộ lọc
  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.value = '';
  
  currentFilteredList = allCustomers.filter(c => {
    // 1. Kiểm tra TINH_TRANG = 0
    const tinhTrang = Number(value(c, 'TINH_TRANG', 'tinh_trang') || 0);

    // 2. Kiểm tra SOTIEN_TTOAN = null (hoặc null/undefined/rỗng/Chưa TT)
    const sotienTtoan = value(c, 'SOTIEN_TTOAN', 'sotien_ttoan');
    const isSotienNull = (
      sotienTtoan === null ||
      sotienTtoan === undefined ||
      String(sotienTtoan).trim() === '' ||
      String(sotienTtoan).trim().toLowerCase() === 'null' ||
      String(sotienTtoan).trim() === 'Chưa TT'
    );

    return tinhTrang === 0 && isSotienNull;
  });

  currentCardIndex = 0;
  renderCurrentCustomerCard();
  updateStatsSummary();
  showToast(`Khách hàng chưa CĐ: ${currentFilteredList.length} / ${allCustomers.length}`);
}

async function fetchServerData(selectedDate, loggedTenNdung) {
  busy = true;
  const btn = document.getElementById('btnSearch');
  if (btn) btn.disabled = true;
  const btncut = document.getElementById('btnUncut');
  if (btncut) btncut.disabled = true;
  showToast(`Đang tải dữ liệu...`);

  const queryParams = new URLSearchParams({
    action: 'getList',
    date: selectedDate,
    ten_ndung: loggedTenNdung
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
    localStorage.setItem(CACHE_KEY_SESSION, loggedTenNdung);
    localStorage.setItem(CACHE_KEY_DATE, selectedDate);
    saveCache();

    renderFiltered();
    const countUncut = getUncutCount();
    showToast(` Tổng khách hàng: ${allCustomers.length}. (Chưa thực hiện: ${countUncut})`);
  } catch (err) {
    showToast('Lỗi lấy danh sách: ' + err.message, true);
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
    if (btncut) btncut.disabled = false;
  }
}

async function fetchServerDataInBackground(selectedDate, loggedTenNdung) {
  const queryParams = new URLSearchParams({
    action: 'getList',
    date: selectedDate,
    ten_ndung: loggedTenNdung
  });

  try {
    let res;
    try {
      res = await fetchJSONP(`${API_URL}?${queryParams.toString()}`);
    } catch (jsonpErr) {
      const response = await fetch(`${API_URL}?${queryParams.toString()}`);
      if (!response.ok) return;
      res = await response.json();
    }

    if (res && res.success && Array.isArray(res.data)) {
      allCustomers = res.data;
      localStorage.setItem(CACHE_KEY_SESSION, loggedTenNdung);
      localStorage.setItem(CACHE_KEY_DATE, selectedDate);
      saveCache();
      renderFiltered();

      const countUncut = getUncutCount();
      showToast(` Tổng khách hàng: ${allCustomers.length}. (Chưa thực hiện: ${countUncut})`);
    }
  } catch (err) {
    console.warn('Cập nhật ngầm thất bại:', err);
  }
}

function renderFiltered() {
  const searchBox = document.getElementById('searchBox');
  const keyword = searchBox ? normalize(searchBox.value) : '';
  currentFilteredList = keyword
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

  currentCardIndex = 0;
  renderCurrentCustomerCard();
  updateStatsSummary();
}

function renderCurrentCustomerCard(slideDirection = null) {
  const root = document.getElementById('customerList');
  if (!root) return;

  if (!currentFilteredList.length) {
    root.innerHTML = '<div class="empty">Không có khách hàng phù hợp.</div>';
    return;
  }

  if (currentCardIndex < 0) currentCardIndex = currentFilteredList.length - 1;
  if (currentCardIndex >= currentFilteredList.length) currentCardIndex = 0;

  const c = currentFilteredList[currentCardIndex];
  const filteredIndex = currentCardIndex;
  const total = currentFilteredList.length;

  const originalIndex = allCustomers.findIndex(item => 
    value(item, 'MA_KHANG', 'ma_khang') === value(c, 'MA_KHANG', 'ma_khang')
  );
  const realIndex = originalIndex !== -1 ? originalIndex : filteredIndex;

  const key = String(value(c, 'MA_KHANG', 'ma_khang') || realIndex);
  const safeKey = encodeURIComponent(key);
  const maKhang = value(c, 'MA_KHANG', 'ma_khang');
  const tenKhang = value(c, 'TEN_KHANG', 'ten_khang');
  const soTien = value(c, 'SO_TIEN', 'so_tien');
  const maSogcs = value(c, 'MA_SOGCS', 'ma_sogcs');
  const danhSo = value(c, 'DANH_SO', 'danh_so');
  const ngayCat = value(c, 'NGAY_CAT', 'ngay_cat');
  const soCto = value(c, 'SO_CTO', 'so_cto');
  const vtriDnoi = value(c, 'VTRI_DNOI', 'vtri_dnoi');
  const tenTram = value(c, 'TEN_TRAM', 'ten_tram');
  const ngaySua = value(c, 'NGAY_SUA', 'ngay_sua');
  const CphiDcat = value(c, 'CPHI_DCAT', 'cphi_dcat');
  const gtrinhLydo = value(c, 'GTRINH_LYDO', 'gtrinh_lydo'); // Giá trị Giải trình lý do
  const SotienTtoan = String(value(c, 'SOTIEN_TTOAN', 'sotien_ttoan') || 'Chưa TT').trim();
  const SotienCpdc = String(value(c, 'SOTIEN_CPDC', 'sotien_cpdc')|| 'Chưa TT').trim();
  const lat = String(value(c, 'LAT', 'lat') || '').trim();
  const lng = String(value(c, 'LNG', 'lng') || '').trim();
  const picture = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');
  const hasLocation = lat !== '' && lng !== '' && !isNaN(lat) && !isNaN(lng);
  let optimizedPicture = picture;
  if (picture && picture.includes('cloudinary.com')) {
    optimizedPicture = picture.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
  }

  let dateOnly = '<a style="color:red;">Chưa thực hiện cắt điện</a>';

  if (ngaySua && String(ngaySua).trim() !== '' && String(ngaySua).trim().toLowerCase() !== 'null' && String(ngaySua).trim().toLowerCase() !== 'undefined') {
      const strTime = String(ngaySua).trim();
      const dateTimeMatch = strTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);

      if (dateTimeMatch) {
          const day = dateTimeMatch[1].padStart(2, '0');
          const month = dateTimeMatch[2].padStart(2, '0');
          const year = dateTimeMatch[3];
          const hours = (dateTimeMatch[4] || '0').padStart(2, '0');
          const minutes = (dateTimeMatch[5] || '0').padStart(2, '0');
          const seconds = (dateTimeMatch[6] || '0').padStart(2, '0');

          dateOnly = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
      } else {
          const d = new Date(strTime);
          if (!isNaN(d.getTime())) {
              const day = d.getDate().toString().padStart(2, '0');
              const month = (d.getMonth() + 1).toString().padStart(2, '0');
              const year = d.getFullYear();
              const hours = d.getHours().toString().padStart(2, '0');
              const minutes = d.getMinutes().toString().padStart(2, '0');
              const seconds = d.getSeconds().toString().padStart(2, '0');

              dateOnly = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
          }
      }
  }

  let locationHtml = hasLocation
    ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:#1976d2;font-weight:bold;text-decoration:none;">📍 Xem Google Maps</a>`
    : `<span id="btn-location-${safeKey}" onclick="getLocationAndSave(${realIndex}, '${safeKey}')" style="color:red;font-weight:bold;cursor:pointer;">📍 Bấm lấy tọa độ mới</span>`;

  let initialClass = "";
  if (slideDirection === "left") initialClass = "slide-left-in";
  else if (slideDirection === "right") initialClass = "slide-right-in";

  root.innerHTML = `
    <div class="customer-box ${initialClass}" id="activeCustomerCard" data-index="${filteredIndex}">
      <div class="box-stt-bar">
        <span class="stt-badge">STT: ${filteredIndex + 1} / ${total}</span>
        <span class="swipe-hint">⬅️ Vuốt để đổi KH ➡️</span>
      </div>
      <div class="box-head">
        <div class="ma-khang">Mã KH: ${escapeHtml(maKhang)}</div>
        <div class="ten-khang">${escapeHtml(tenKhang)}</div>
      </div>
      <div class="grid">
        <div class="cust-row-group">
          Sổ: ${escapeHtml(maSogcs)}-DS: ${escapeHtml(danhSo)}-Số CTơ: ${escapeHtml(soCto)}
        </div>
        <div style="max-width: 400px; margin-top: 5px; white-space: nowrap;overflow: hidden; text-overflow: ellipsis;">
          Cột-Trạm: ${escapeHtml(vtriDnoi)} - ${escapeHtml(tenTram)}
        </div>
        <div class="cust-row-group">
          TGian CĐ: ${dateOnly}    <span style="color:blue;">${escapeHtml(CphiDcat)}</span>
        </div>
        <div class="cust-row-group">
          <span>${escapeHtml(soTien)}</span>
        </div>   
        <div class="cust-row-group">
          Đã TT tiền điện: <span style="color: red;">${escapeHtml(SotienTtoan)}</span>      <span style="margin-left: 20px; margin-righ: 5px;">Đã TT CPĐC:</span><span style="color: red;">${escapeHtml(SotienCpdc)}</span>
        </div> 

        <!-- BỔ SUNG: Ô nhập giải trình lý do & Nút Ghi nằm TRÊN box-maps -->
        <div class="lydo-container">
          <input type="text" id="lydo-${safeKey}" class="input-lydo" placeholder="Giải trình lý do chưa cắt điện..." value="${escapeHtml(gtrinhLydo)}">
          <button type="button" id="btn-ghi-lydo-${safeKey}" class="btn-ghi-lydo" onclick="saveLyDoOnly(${realIndex}, '${safeKey}')">Ghi</button>
        </div>

        <div class="box-maps">
          <span id="loc-cell-${safeKey}">${locationHtml}</span>
        </div> 
      </div>
      <div class="photo-actions-container">
        <div class="picture-box" id="picture-${safeKey}">
          ${optimizedPicture ? `<img src="${escapeHtml(optimizedPicture)}" alt="Hình ảnh ${escapeHtml(maKhang)}">` : 'Chưa có hình ảnh'}
        </div>
        <div class="actions-right">
          <label class="check-wrap">
          <input type="checkbox" id="check-${safeKey}" ${Number(value(c, 'TINH_TRANG', 'tinh_trang')) === 1 ? 'checked' : ''} onchange="updateActionButtonsState('${safeKey}')">
            Đã thực hiện
          </label>
          <button class="btn-photo" onclick="takePhoto(${realIndex}, '${safeKey}')">📷 Chụp ảnh</button>
          <button class="btn-save" id="save-${safeKey}" onclick="saveCustomer(${realIndex}, '${safeKey}')">💾 Lưu</button>
          <button class="btn-cancel" id="cancel-${safeKey}" onclick="cancelCustomer(${realIndex}, '${safeKey}')">❌ Hủy</button>
          <input type="file" id="file-${safeKey}" style="display:none" onchange="photoSelected(${realIndex}, '${safeKey}', this)">
        </div>
      </div>
    </div>`;

  updateActionButtonsState(safeKey);

  if (slideDirection) {
    const activeCard = document.getElementById("activeCustomerCard");
    setTimeout(() => {
      if (activeCard) activeCard.classList.remove("slide-left-in", "slide-right-in");
      setTimeout(() => { isAnimating = false; }, 250);
    }, 20);
  } else {
    isAnimating = false;
  }
}

/**
 * Hàm ghi riêng ô Lý do Giải trình lên Google Sheet cột GTRINH_LYDO
 */
async function saveLyDoOnly(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const btnGhi = document.getElementById(`btn-ghi-lydo-${safeKey}`);
  const inputLydo = document.getElementById(`lydo-${safeKey}`);
  if (!inputLydo) return;

  const lyDoVal = inputLydo.value.trim();
  const maKhang = value(c, 'MA_KHANG', 'ma_khang');
  const selectedDate = localStorage.getItem(CACHE_KEY_DATE) || '';

  if (btnGhi) {
    btnGhi.disabled = true;
    btnGhi.textContent = '⏳...';
  }

  c.GTRINH_LYDO = lyDoVal;
  saveCache();

  showToast(`Đang ghi lý do giải trình cho KH ${maKhang}...`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'save_lydo',
        payload: {
          MA_KHANG: maKhang,
          NGAY: selectedDate,
          GTRINH_LYDO: lyDoVal
        }
      })
    });
    const result = await response.json();

    if (result && result.success) {
      showToast(`Đã ghi giải trình lý do thành công.`);
    } else {
      showToast('Đã lưu local, server báo lỗi: ' + (result?.message || ''), true);
    }
  } catch (err) {
    showToast('Đã lưu local, chưa đồng bộ được server: ' + err.message, true);
  } finally {
    if (btnGhi) {
      btnGhi.disabled = false;
      btnGhi.textContent = 'Ghi';
    }
  }
}

function nextCustomer() {
  if (isAnimating || currentFilteredList.length === 0) return;

  isAnimating = true;
  const activeCard = document.getElementById("activeCustomerCard");
  if (activeCard) {
    activeCard.classList.add("slide-left-out");
    setTimeout(() => {
      currentCardIndex = (currentCardIndex >= currentFilteredList.length - 1) ? 0 : currentCardIndex + 1;
      renderCurrentCustomerCard("left");
    }, 200);
  } else {
    currentCardIndex = (currentCardIndex >= currentFilteredList.length - 1) ? 0 : currentCardIndex + 1;
    renderCurrentCustomerCard();
  }
}

function prevCustomer() {
  if (isAnimating || currentFilteredList.length === 0) return;

  isAnimating = true;
  const activeCard = document.getElementById("activeCustomerCard");
  if (activeCard) {
    activeCard.classList.add("slide-right-out");
    setTimeout(() => {
      currentCardIndex = (currentCardIndex <= 0) ? currentFilteredList.length - 1 : currentCardIndex - 1;
      renderCurrentCustomerCard("right");
    }, 200);
  } else {
    currentCardIndex = (currentCardIndex <= 0) ? currentFilteredList.length - 1 : currentCardIndex - 1;
    renderCurrentCustomerCard();
  }
}

function setupSwipeEvents() {
  const container = document.getElementById("customerList");
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let isMouseDown = false;

  // --- 1. XỬ LÝ TRÊN ĐIỆN THOẠI (TOUCH EVENTS) ---
  container.addEventListener('touchstart', (e) => {
    if (["INPUT", "BUTTON", "A", "TEXTAREA"].includes(e.target.tagName)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!startX || !startY || isAnimating) return;
    let endX = e.changedTouches[0].clientX;
    let endY = e.changedTouches[0].clientY;
    handleSwipe(startX, startY, endX, endY);
    startX = 0;
    startY = 0;
  }, { passive: true });

  // --- 2. XỬ LÝ TRÊN PC (MOUSE EVENTS) ---
  container.addEventListener('mousedown', (e) => {
    if (["INPUT", "BUTTON", "A", "TEXTAREA"].includes(e.target.tagName)) return;
    isMouseDown = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  container.addEventListener('mouseup', (e) => {
    if (!isMouseDown || isAnimating) return;
    isMouseDown = false;
    handleSwipe(startX, startY, e.clientX, e.clientY);
    startX = 0;
    startY = 0;
  });

  container.addEventListener('mouseleave', () => {
    isMouseDown = false;
  });

  // --- HÀM XỬ LÝ HƯỚNG VUỐT CHUNG ---
  function handleSwipe(sX, sY, eX, eY) {
    let diffX = sX - eX;
    let diffY = sY - eY;

    // Kiểm tra khoảng cách kéo ngang lớn hơn kéo dọc và vượt ngưỡng 40px
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX > 0) {
        nextCustomer(); // Kéo sang trái -> Xem khách hàng tiếp theo
      } else {
        prevCustomer(); // Kéo sang phải -> Xem khách hàng trước đó
      }
    }
  }
}

function updateActionButtonsState(safeKey) {
  const locCell = document.getElementById(`loc-cell-${safeKey}`);
  const checkbox = document.getElementById(`check-${safeKey}`);
  const pictureBox = document.getElementById(`picture-${safeKey}`);
  const btnSave = document.getElementById(`save-${safeKey}`);
  const btnCancel = document.getElementById(`cancel-${safeKey}`);

  if (!btnSave || !btnCancel) return;

  const hasLocation = locCell ? !locCell.innerHTML.includes('📍 Bấm lấy tọa độ mới') : false;
  const isChecked = checkbox ? checkbox.checked : false;
  const hasPicture = pictureBox ? !pictureBox.innerHTML.includes('Chưa có hình ảnh') : false;

  const isAllValid = hasLocation && isChecked && hasPicture;

  if (isAllValid) {
    btnSave.style.opacity = '1';
    btnSave.style.pointerEvents = 'auto';
    btnCancel.style.opacity = '1';
    btnCancel.style.pointerEvents = 'auto';
  } else {
    btnSave.style.opacity = '0.5';
    btnSave.style.pointerEvents = 'none';
    btnCancel.style.opacity = '0.5';
    btnCancel.style.pointerEvents = 'none';
  }
}

async function getLocationAndSave(index, safeKey) {
  const c = allCustomers[index];
  if (!c) return;

  const btnLoc = document.getElementById(`btn-location-${safeKey}`);
  const maKhang = value(c, 'MA_KHANG', 'ma_khang');
  const selectedDate = localStorage.getItem(CACHE_KEY_DATE) || '';

  if (!navigator.geolocation) {
    showToast('Trình duyệt không hỗ trợ GPS.', true);
    return;
  }

  if (btnLoc) {
    btnLoc.style.pointerEvents = 'none';
    btnLoc.textContent = '⏳ Đang lấy vị trí...';
  }
  showToast(`Đang định vị GPS cho ${maKhang}...`);

  const currentUser = getCurrentUser();
  const loggedTenNdung = String(getUserField(currentUser, 'ten_ndung', 'TEN_NDUNG', 'username') || '').trim();
  const loggedTenNvien = String(getUserField(currentUser, 'ten_nvien', 'TEN_NVIEN') || loggedTenNdung).trim();

  navigator.geolocation.getCurrentPosition(
    async position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      c.LAT = lat; 
      c.LNG = lng;
      saveCache();

      const cell = document.getElementById(`loc-cell-${safeKey}`);
      if (cell) cell.innerHTML = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:#1976d2;font-weight:bold;text-decoration:none;">📍 Xem Google Maps</a>`;
      
      updateActionButtonsState(safeKey);
      showToast(`Lưu định vị thành công.`);

      const payload = {
        MA_KHANG: maKhang,
        NGAY: selectedDate,
        TEN_KHANG: value(c, 'TEN_KHANG', 'ten_khang'),
        SO_CTO: value(c, 'SO_CTO', 'so_cto'),
        MA_TRAM: value(c, 'MA_TRAM', 'ma_tram'),
        TEN_TRAM: value(c, 'TEN_TRAM', 'ten_tram'),
        VTRI_DNOI: value(c, 'VTRI_DNOI', 'vtri_dnoi', 'SO_COT', 'so_cot'),
        TEN_NDUNG: loggedTenNdung,
        TEN_NVIEN: loggedTenNvien,
        TEN_CVIEC: 'Tạm ngừng CĐ',
        LAT: lat,
        LNG: lng
      };

      fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'save', payload: payload })
      }).then(res => res.json()).then(result => {
        if (result && result.success) {
          showToast(`Lưu định vị thành công.`);
        } else {
          showToast('Đã lưu local, server chưa nhận được: ' + (result?.message || ''), true);
        }
      }).catch(err => {
        showToast('Đã lưu local, lỗi đồng bộ server: ' + err.message, true);
      });
    },
    err => {
      if (btnLoc) { btnLoc.style.pointerEvents = 'auto'; btnLoc.textContent = '📍 Bấm lấy tọa độ mới'; }
      showToast('Không thể lấy vị trí GPS: ' + err.message, true);
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
    showToast('Đang nén tối ưu dung lượng ảnh...');
    
    const compressedDataUrl = await compressImage(file, 1000, 0.7);

    const box = document.getElementById('picture-' + safeKey);
    if (box) box.innerHTML = `<img src="${compressedDataUrl}" alt="Ảnh mới">`;
    
    allCustomers[index]._newPhotoFile = file;
    allCustomers[index]._newPhotoDataUrl = compressedDataUrl;
    
    updateActionButtonsState(safeKey);
    showToast('Đã chọn và tối ưu ảnh. Nhấn Lưu để cập nhật.');
  } catch (err) {
    console.error('Lỗi nén ảnh:', err);
    showToast('Lỗi xử lý ảnh, vui lòng thử lại.', true);
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
    const currentUser = getCurrentUser();
    const loggedTenNdung = String(getUserField(currentUser, 'ten_ndung', 'TEN_NDUNG', 'username') || '').trim();

    const maKhang = value(c, 'MA_KHANG', 'ma_khang');
    const selectedDate = localStorage.getItem(CACHE_KEY_DATE) || '';
    let imageUrl = value(c, 'HINH_ANH', 'hinh_anh', 'PICTUREBOX');

    if (c._newPhotoDataUrl) {
      showToast(`Đang upload hình ${maKhang}...`);
      imageUrl = await uploadToCloudinary(c._newPhotoDataUrl, maKhang);
    }

    const tinhTrang = checkbox && checkbox.checked ? 1 : 0;

    c.HINH_ANH = imageUrl;
    c.PICTUREBOX = imageUrl;
    c.TINH_TRANG = tinhTrang;
    delete c._newPhotoDataUrl;
    saveCache();

    updateActionButtonsState(safeKey);
    updateStatsSummary();
    showToast(`Lưu dữ liệu thành công.`);

    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'save',
        payload: {
          MA_KHANG: maKhang,
          NGAY: selectedDate,
          HINH_ANH: imageUrl,
          PICTUREBOX: imageUrl,
          TINH_TRANG: tinhTrang,
          NGUOI_SUA: loggedTenNdung
        }
      })
    }).then(res => res.json()).then(result => {
      if (result && result.success) {
        showToast(`Lưu dữ liệu thành công.`);
        setTimeout(() => nextCustomer(), 400);
      } else {
        showToast('Đã lưu local, server báo lỗi: ' + (result?.message || ''), true);
      }
    }).catch(err => {
      showToast('Đã lưu local, chưa thể cập nhật server: ' + err.message, true);
    });

  } catch (err) {
    showToast(err.message || String(err), true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

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
    msgEl.textContent = `Bạn có chắc chắn muốn xóa trạng thái, hình ảnh và định vị của khách hàng ${maKhang}?`;
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
  const checkbox = document.getElementById('check-' + safeKey);
  const pictureBox = document.getElementById('picture-' + safeKey);
  
  const selectedDate = document.getElementById('filterDate')?.value || localStorage.getItem(CACHE_KEY_DATE) || '';
  const ngayCat = value(c, 'NGAY_CAT', 'ngay_cat') || selectedDate;

  const oldLat = c.LAT || '';
  const oldLng = c.LNG || '';

  c.HINH_ANH = '';
  c.PICTUREBOX = '';
  c.TINH_TRANG = 0;
  c.LAT = ''; 
  c.LNG = ''; 
  delete c._newPhotoFile;
  delete c._newPhotoDataUrl;
  saveCache();

  if (checkbox) checkbox.checked = false;
  if (pictureBox) pictureBox.innerHTML = 'Chưa có hình ảnh';
  const cell = document.getElementById(`loc-cell-${safeKey}`);
  if (cell) {
    cell.innerHTML = `<span id="btn-location-${safeKey}" onclick="getLocationAndSave(${index}, '${safeKey}')" style="color:red;font-weight:bold;cursor:pointer;">📍 Bấm lấy tọa độ mới</span>`;
  }

  updateActionButtonsState(safeKey);
  updateStatsSummary();
  showToast(`Hủy dữ liệu thành công.`);

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'cancel',
      payload: {
        MA_KHANG: maKhang,
        NGAY: selectedDate,
        NGAY_CAT: ngayCat,
        NGAY_SUA: selectedDate,
        LAT: oldLat,
        LNG: oldLng
      }
    })
  }).then(res => res.json()).then(result => {
    if (result && result.success) {
      showToast(`Hủy dữ liệu thành công.`);
    } else {
      showToast('Đã hủy local, lỗi cập nhật server: ' + (result?.message || ''), true);
    }
  }).catch(err => {
    showToast('Lỗi đồng bộ server khi hủy: ' + (err.message || String(err)), true);
  });
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
