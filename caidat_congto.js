const API_URL = "https://script.google.com/macros/s/AKfycbztnw4S7AQaWVt3jS7B_9bcoj0aOJCOElNMz8HQpanPWh-_ufs2bmZGyqBjYhN1VZpA/exec";

let currentUser = null;
let groupedData = {};
let customerKeys = []; 
const currentCapturedFiles = {};

function getExcelKeyCaiDat() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `caidat_excel_data_${user}`;
}

function getOfflineImagesKey() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `caidat_offline_images_${user}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);

  initLocalExcelStore();
  await checkAndLoadInitialData();

  window.addEventListener("online", async () => {
    showToast("📶 Đã kết nối mạng. Đang đồng bộ dữ liệu cài đặt...");
    await syncLocalExcelToSheet();
  });
});

function initLocalExcelStore() {
  const storeKey = getExcelKeyCaiDat();
  const imgKey = getOfflineImagesKey();
  if (!localStorage.getItem(storeKey)) localStorage.setItem(storeKey, JSON.stringify([]));
  if (!localStorage.getItem(imgKey)) localStorage.setItem(imgKey, JSON.stringify({}));
}

async function checkAndLoadInitialData() {
  const storeKey = getExcelKeyCaiDat();
  let localList = [];
  try {
    localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  } catch (e) {
    localList = [];
  }

  if (!navigator.onLine) {
    if (localList.length > 0) {
      showToast("📶 Đang hoạt động ở chế độ ngoại tuyến!");
      loadDataFromLocal();
    } else {
      document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Chưa có dữ liệu trên thiết bị và chưa có mạng!</p>";
    }
    return;
  }

  showToast("⏳ Đang tải dữ liệu cài đặt công tơ...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "GET_CAIDAT_DATA", ten_ndung: currentUser.ten_ndung })
    });
    const data = await res.json();

    if (data.status === "success" && Array.isArray(data.list) && data.list.length > 0) {
      localStorage.setItem(storeKey, JSON.stringify(data.list));
      loadDataFromLocal();
      showToast("♻️ Lấy dữ liệu cài đặt thành công!");
    } else {
      if (localList.length > 0) {
        loadDataFromLocal();
        showToast("⚠️ Máy chủ chưa có dữ liệu mới. Hiển thị dữ liệu trên thiết bị.");
      } else {
        document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding:20px; color:red;'>Không có dữ liệu phân công cài đặt.</p>";
      }
    }
  } catch (err) {
    if (localList.length > 0) loadDataFromLocal();
    else showToast("❌ Lỗi kết nối máy chủ!");
  }
}

function handleFetchDataBtn() { checkAndLoadInitialData(); }

function loadDataFromLocal() {
  const storeKey = getExcelKeyCaiDat();
  const localData = JSON.parse(localStorage.getItem(storeKey) || "[]");
  if (localData.length > 0) groupAndRender(localData);
  else document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Không có dữ liệu.</p>";
}

function groupAndRender(flatList) {
  groupedData = {};
  flatList.forEach((item, index) => {
    item.rowIndex = item.rowIndex !== undefined ? item.rowIndex : index;
    const makh = item.MA_KHANG;
    if (!groupedData[makh]) {
      groupedData[makh] = { ...item, items: [] };
    }
    groupedData[makh].items.push(item);
  });

  customerKeys = Object.keys(groupedData);
  updateSummaryBar();
  renderCurrentCustomerCard();
}

function updateSummaryBar() {
  const total = customerKeys.length;
  let finished = 0;
  customerKeys.forEach(makh => {
    const cust = groupedData[makh];
    if (cust.THAY_CTO === "X" || cust.NGAY_THIEN) finished++;
  });
  document.getElementById("sumTongKh").innerText = total;
  document.getElementById("sumChuaGhi").innerText = total - finished;
}

function renderCurrentCustomerCard() {
  const container = document.getElementById("listContainer");
  if (customerKeys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold;'>Không tìm thấy dữ liệu.</p>";
    return;
  }

  let html = "";
  customerKeys.forEach((makh, index) => {
    const cust = groupedData[makh];

    html += `
      <div class="customer-card" id="customer_card_${makh}">
        <div class="cust-title">STT: ${index + 1}/${customerKeys.length} - Mã KH: ${cust.MA_KHANG} - <b>Sốc tơ:</b> ${cust.SO_TBI || ''}</div>
        <div class="cust-tenKH">${cust.TEN_KHANG || ''}</div>
        <div class="cust-address"><b>Đ/C:</b> ${cust.DCHI_DDO || ''}</div>
        <div class="cust-row-group">Sổ: ${cust.MA_SOGCS || ''} - Danh số: ${cust.DANH_SO || ''} - Trạm: ${cust.TEN_TRAM || ''}</div>

<div class="cust-row-group">
            <input type="text" class="input-ghichu" 
                   id="ghi_chu_${makh}" 
                   value="${cust.GHI_CHU || ''}" 
                   placeholder="Nhập ghi chú nếu có..." 
                   onchange="groupedData['${makh}'].GHI_CHU = this.value;">
          </div>

          <!-- 👉 THAY THẾ HOẶC ĐẶT PHẦN NÀY VÀO VỊ TRÍ KHUNG MAPS CŨ TRONG HÀM renderCurrentCustomerCard -->
          <div class="box-maps">
            ${
              (() => {
                const hasLocation = Boolean(cust.LAT && cust.LNG);
                if (hasLocation) {
                  return `<span id="map_link_${makh}"><a href="http://maps.google.com/?q=${cust.LAT},${cust.LNG}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps (${Number(cust.LAT).toFixed(5)}, ${Number(cust.LNG).toFixed(5)})</a></span>`;
                } else {
                  return `<a onclick="openNoteDialogForLocation(${index}, '${makh}')" style="color:red; font-size: 14px; font-weight:bold; text-decoration:none; cursor:pointer;">📍 Lấy mới định vị</a>`;
                }
              })()
            }
          </div>

        <div class="tech-info-grid">
          <div>Loại cto: <span>${cust.LOAI_CTO || ''}</span></div>
          <div>Mã Cloại: <span>${cust.MA_CLOAI || ''}</span></div>
          <div>Dòng/Áp: <span>${cust.DONG_DIEN || ''} / ${cust.DIEN_AP || ''}</span></div>
          <div>Mật khẩu P3: <span>${cust.MK_CAP3 || ''}</span></div>
          <div>Năm SX: <span>${cust.NAM_SX || ''}</span></div>
          <div>Hệ số nhân: <span>${cust.HSN || 1}</span></div>
        </div>

        <div style="margin-top: 6px; display:flex; gap:6px;">
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Loại ký BB:</label>
            <select class="select-field" id="LOAI_KYBBAN_${makh}">
              <option value="X" ${cust.LOAI_KYBBAN === "2" ? "selected" : ""}>Ký giấy</option>
              <option value="K" ${cust.LOAI_KYBBAN === "1" ? "selected" : ""}>Ký số</option>
              <option value="K" ${cust.LOAI_KYBBAN === "0" ? "selected" : ""}>Chưa ký</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Tình trạng cài đặt:</label>
               <select class="select-field" id="CAIDAT_HTRUONG_${makh}">
              <option value="X" ${cust.CAIDAT_HTRUONG === "1" ? "selected" : ""}>Thành công</option>
              <option value="K" ${cust.CAIDAT_HTRUONG === "2" ? "selected" : ""}>Lỗi cài đặt</option>
            </select>
          </div>
        </div>

        <div class="card-btn-group">
          <button class="btn-card btn-card-save" onclick="saveCustomerData('${makh}')">💾 Lưu dữ liệu</button>
          <button class="btn-card btn-card-cancel" onclick="cancelCustomerData('${makh}')">✂ Khôi phục chưa cài</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  // 1. Lấy đúng giá trị từ các ô input và select trên giao diện card của khách hàng đó
  const modemEl = document.getElementById(`modem_${maKhang}`);
  const htruongEl = document.getElementById(`CAIDAT_HTRUONG_${makh}` ) || document.getElementById(`CAIDAT_HTRUONG_${maKhang}`);
  const kybbEl = document.getElementById(`LOAI_KYBBAN_${makh}`) || document.getElementById(`LOAI_KYBBAN_${maKhang}`);
  const ghichuEl = document.getElementById(`ghi_chu_${maKhang}`);

  // 2. Gán giá trị thực tế người dùng chọn/nhập vào đối tượng dữ liệu
  cust.MODEM = modemEl ? modemEl.value.trim() : (cust.MODEM || "");
  cust.CAIDAT_HTRUONG = htruongEl ? htruongEl.value : (cust.CAIDAT_HTRUONG || "");
  cust.LOAI_KYBBAN = kybbEl ? kybbEl.value : (cust.LOAI_KYBBAN || "");
  cust.GHI_CHU = ghichuEl ? ghichuEl.value.trim() : (cust.GHI_CHU || "");
  
  // Đánh dấu trạng thái đã thực hiện và thời gian lưu
  cust.THAY_CTO = "X"; 
  cust.NGAY_THIEN = new Date().toLocaleString("vi-VN");

  // 3. Lưu vào LocalStorage của thiết bị
  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.MODEM = cust.MODEM;
      item.CAIDAT_HTRUONG = cust.CAIDAT_HTRUONG; // Lưu đúng giá trị value của select (ví dụ: '1', '2' hoặc 'X', 'K'...)
      item.LOAI_KYBBAN = cust.LOAI_KYBBAN;       // Lưu đúng giá trị value của select (ví dụ: 'X', 'K'...)
      item.GHI_CHU = cust.GHI_CHU;
      item.THAY_CTO = cust.THAY_CTO;
      item.NGAY_THIEN = cust.NGAY_THIEN;
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("💾 Đã lưu dữ liệu cài đặt thành công!");
  updateSummaryBar();
  
  // 4. Đồng bộ ngay lên server nếu có mạng
  if (navigator.onLine) {
    await syncLocalExcelToSheet();
  }
}

async function cancelCustomerData(maKhang) {
  const confirm = await showCustomConfirm("HỦY DỮ LIỆU", "Bạn có muốn xóa dữ liệu cài đặt của khách hàng này không?", true);
  if (!confirm) return;

  const cust = groupedData[maKhang];
  if (!cust) return;

  cust.MODEM = "";
  cust.CAIDAT_HTRUONG = "";
  cust.THAY_CTO = "";
  cust.NGAY_THIEN = "";

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.MODEM = "";
      item.CAIDAT_HTRUONG = "";
      item.THAY_CTO = "";
      item.NGAY_THIEN = "";
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("✂ Đã hủy dữ liệu cài đặt!");
  renderCurrentCustomerCard();
  updateSummaryBar();
}

async function handleSendDataBtn() {
  if (!navigator.onLine) {
    showToast("❌ Không có kết nối mạng!");
    return;
  }
  const confirm = await showCustomConfirm("GỬI DỮ LIỆU", "Bạn muốn đồng bộ toàn bộ dữ liệu cài đặt lên server không?");
  if (!confirm) return;

  await syncLocalExcelToSheet(true);
}

async function syncLocalExcelToSheet(isManual = false) {
  if (!navigator.onLine) return;
  const storeKey = getExcelKeyCaiDat();
  const localList = JSON.parse(localStorage.getItem(storeKey) || "[]");

  try {
    showToast("⏳ Đang đồng bộ dữ liệu lên server...");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "SYNC_CAIDAT_DATA", logs: localList })
    });
    const result = await res.json();
    if (result.status === "success") {
      showToast("♻️ Đồng bộ dữ liệu cài đặt thành công!");
    } else {
      if (isManual) showToast("❌ Lỗi: " + result.message);
    }
  } catch (e) {
    if (isManual) showToast("❌ Lỗi kết nối đồng bộ!");
  }
}

function downloadAllExcelFiles() {
  const storeKey = getExcelKeyCaiDat();
  const data = JSON.parse(localStorage.getItem(storeKey) || "[]");
  if (data.length === 0) {
    showToast("⚠️ Chưa có dữ liệu để tải!");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "caidat_cto");
  XLSX.writeFile(wb, "caidat_congto_export.xlsx");
  showToast("📊 Đã tải file Excel xuống máy!");
}

function showToast(msg, isError = false) {
  let t = document.getElementById("toast");
  if (!t) return;
  t.className = isError ? "error" : "";
  t.innerHTML = msg;
  t.classList.add("show");
  setTimeout(() => { t.classList.remove("show"); }, 3000);
}

function showCustomConfirm(title, message, isDanger = false) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customConfirmModal");
    document.getElementById("confirmModalTitle").innerText = title;
    document.getElementById("confirmModalMessage").innerText = message;
    const btnConfirm = document.getElementById("btnModalConfirm");
    const btnCancel = document.getElementById("btnModalCancel");
    btnConfirm.style.background = isDanger ? "#dc3545" : "#28a745";
    modal.style.display = "flex";
    btnConfirm.onclick = () => { modal.style.display = "none"; resolve(true); };
    btnCancel.onclick = () => { modal.style.display = "none"; resolve(false); };
  });
}

function filterChuaGhi() {
  document.getElementById("searchInput").value = "";
  customerKeys = Object.keys(groupedData).filter(makh => {
    const cust = groupedData[makh];
    return !cust.THAY_CTO && !cust.NGAY_THIEN;
  });
  renderCurrentCustomerCard();
}

function showAllData() {
  document.getElementById("searchInput").value = "";
  customerKeys = Object.keys(groupedData);
  renderCurrentCustomerCard();
}

function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!q) return;
  const targetKey = customerKeys.find(makh => {
    const c = groupedData[makh];
    return String(c.MA_KHANG || "").toLowerCase().includes(q) ||
           String(c.TEN_KHANG || "").toLowerCase().includes(q) ||
           String(c.SO_TBI || "").toLowerCase().includes(q) ||
           String(c.TEN_TRAM || "").toLowerCase().includes(q) ||
           String(c.MA_SOGCS || "").toLowerCase().includes(q);
  });
  if (targetKey) {
    const card = document.getElementById(`customer_card_${targetKey}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.style.backgroundColor = "#e8f4fd";
      setTimeout(() => card.style.backgroundColor = "", 1500);
    }
  } else {
    showToast("❌ Không tìm thấy thông tin phù hợp!");
  }
}

// Thêm key lưu trữ dữ liệu định vị ngoại tuyến tương tự nhap_chiso.js
function getExcelKeyDinhVi() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `caidat_dinhvi_excel_data_${user}`;
}

// Hàm gọi mở popup nhập ghi chú định vị trước khi lấy tọa độ GPS
function openNoteDialogForLocation(index, safeKey) {
  let modal = document.getElementById('noteLocationModal');
  if (!modal) {
    // Nếu trong html chưa có sẵn modal thì tạo động
    const modalHtml = `
      <div id="noteLocationModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;justify-content:center;align-items:center;">
        <div style="background:#fff;padding:20px;border-radius:8px;width:90%;max-width:350px;box-sizing:border-box;">
          <h3 style="margin-top:0;font-size:16px;text-align:center;color:red;">NHẬP CHI TIẾT VỊ TRÍ CÔNG TƠ</h3>
          <input type="text" id="inputLocationNote" placeholder="Số trụ, mô tả sơ bộ vị trí công tơ..." style="width:100%;padding:8px;box-sizing:border-box;margin-bottom:15px;border:1px solid #ccc;border-radius:4px;" oninput="validateNoteInput()">
          <div style="display:flex;justify-content:center;gap:10px;">
            <button type="button" onclick="closeNoteDialog()" style="width:110px;padding:6px 12px;background:#FFB6C1;border:none;border-radius:4px;cursor:pointer;font-weight: bold;">📤&nbsp;&nbsp;Thoát</button>
            <button type="button" id="btnExecuteGetLocation" onclick="executeGetLocationWithNote()" style="width:110px;padding:6px 12px;background:#007bff;border:none;border-radius:4px;cursor:pointer;opacity:0.5;pointer-events:none;font-weight: bold;color:#fff">📍&nbsp;&nbsp;Thực hiện</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('noteLocationModal');
  }

  window._pendingLocationContext = { index, safeKey };
  document.getElementById('inputLocationNote').value = '';
  validateNoteInput();
  modal.style.display = 'flex';
}

function validateNoteInput() {
  const input = document.getElementById('inputLocationNote');
  const btn = document.getElementById('btnExecuteGetLocation');
  if (!input || !btn) return;
  
  if (input.value.trim() !== '') {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  } else {
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }
}

function closeNoteDialog() {
  const modal = document.getElementById('noteLocationModal');
  if (modal) modal.style.display = 'none';
  window._pendingLocationContext = null;
}

function executeGetLocationWithNote() {
  const input = document.getElementById('inputLocationNote');
  const note = input ? input.value.trim() : '';
  const context = window._pendingLocationContext;
  
  if (!note || !context) return;
  
  closeNoteDialog();
  getLocationAndSave(context.safeKey, note);
}

// Hàm thực thi lấy định vị GPS và lưu vào localStorage theo chuẩn LAT/LNG
function getLocationAndSave(maKhang, locationNote = "") {
  if (!navigator.geolocation) {
    showToast("❌ Trình duyệt không hỗ trợ định vị GPS!");
    return;
  }
  showToast("⏳ Đang lấy vị trí GPS...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const cust = groupedData[maKhang] || {};
      const nowStr = new Date().toLocaleString("vi-VN");

      // Cập nhật trực tiếp vào dữ liệu RAM của khách hàng
      cust.LAT = lat;
      cust.LNG = lng;

      // Lưu vào LocalStorage của danh sách cài đặt công tơ
      const storeKey = getExcelKeyCaiDat();
      let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
      localList.forEach(item => {
        if (String(item.MA_KHANG) === String(maKhang)) {
          item.LAT = lat;
          item.LNG = lng;
        }
      });
      localStorage.setItem(storeKey, JSON.stringify(localList));

      // Đồng thời lưu log vào bảng định vị (nếu server bác có dùng bảng riêng cho định vị)
      const dvKey = getExcelKeyDinhVi();
      let dinhViList = JSON.parse(localStorage.getItem(dvKey) || "[]");
      dinhViList = dinhViList.filter(item => String(item.MA_KHANG) !== String(maKhang));
      dinhViList.push({
        MA_KHANG: maKhang,
        TEN_KHANG: cust.TEN_KHANG || "",
        SO_TBI: cust.SO_TBI || "",
        LAT: lat,
        LNG: lng,
        NOTE: locationNote || "",
        NGAY_THIEN: nowStr,
        NVIEN_CDAT: currentUser.ten_ndung || ""
      });
      localStorage.setItem(dvKey, JSON.stringify(dinhViList));

      renderCurrentCustomerCard();
      showToast("📍 Đã lấy và lưu tọa độ LAT/LNG thành công!");
    },
    (error) => { showToast("❌ Lỗi định vị GPS. Vui lòng bật vị trí trên điện thoại!"); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
