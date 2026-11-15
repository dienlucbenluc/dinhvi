const API_URL = "https://script.google.com/macros/s/AKfycbztnw4S7AQaWVt3jS7B_9bcoj0aOJCOElNMz8HQpanPWh-_ufs2bmZGyqBjYhN1VZpA/exec";

let currentUser = null;
let groupedData = {};
let customerKeys = []; 
const currentCapturedFiles = {};

function getExcelKeyCaiDat() {
  return `caidat_excel_data_toanquan`;
}

function getOfflineImagesKey() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `caidat_offline_images_${user}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);

  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById("inputNgayTH");
  if (dateInput) dateInput.value = todayStr;

  initLocalExcelStore();
  await checkAndLoadInitialData(false); // Khi mới vào trang, ưu tiên tải hoặc hiển thị local nếu offline

  window.addEventListener("online", async () => {
    showToast("📶 Đang kết nối mạng. Đang đồng bộ dữ liệu cài đặt...");
    await syncLocalExcelToSheet();
  });
});

function initLocalExcelStore() {
  const storeKey = getExcelKeyCaiDat();
  const imgKey = getOfflineImagesKey();
  if (!localStorage.getItem(storeKey)) localStorage.setItem(storeKey, JSON.stringify([]));
  if (!localStorage.getItem(imgKey)) localStorage.setItem(imgKey, JSON.stringify({}));
}

// YÊU CẦU 3: Bấm nút lấy dữ liệu là lấy lại trực tiếp trên server chứ không lấy từ bộ nhớ thiết bị
async function checkAndLoadInitialData(forceServer = false) {
  const storeKey = getExcelKeyCaiDat();
  let localList = [];
  try {
    localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  } catch (e) {
    localList = [];
  }

  const ngayThInput = document.getElementById("inputNgayTH");
  const selectedDate = ngayThInput ? ngayThInput.value : ""; // dạng "YYYY-MM-DD"

  if (!navigator.onLine) {
    if (localList.length > 0) {
      showToast("📶 Đang hoạt động ở chế độ ngoại tuyến!");
      loadDataFromLocal();
    } else {
      document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Chưa có dữ liệu trên thiết bị và chưa có mạng!</p>";
    }
    return;
  }

  showToast("⏳ Đang tải dữ liệu cài đặt công tơ từ server...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ 
        action: "GET_CAIDAT_DATA", 
        ten_ndung: currentUser.ten_ndung,
        ngay_th: selectedDate // YÊU CẦU 1: Gửi ngày thực hiện lên server lọc
      })
    });
    const data = await res.json();

    if (data.status === "success" && Array.isArray(data.list)) {
      const filteredList = data.list;

      localStorage.setItem(storeKey, JSON.stringify(filteredList));
      loadDataFromLocal();
      showToast(`♻️ Lấy thành công ${filteredList.length} khách hàng từ server!`);
    } else {
      if (localList.length > 0 && !forceServer) {
        loadDataFromLocal();
        showToast("⚠️ Không có dữ liệu mới. Hiển thị dữ liệu trên thiết bị.");
      } else {
        document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding:20px; color:red;'>Không có dữ liệu phân công phù hợp.</p>";
        showToast("⚠️ Không tìm thấy dữ liệu phù hợp trên server.", true);
      }
    }
  } catch (err) {
    if (localList.length > 0 && !forceServer) loadDataFromLocal();
    else {
      showToast("❌ Lỗi kết nối máy chủ!", true);
      document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Lỗi kết nối máy chủ hoặc không tải được dữ liệu.</p>";
    }
  }
}

// Bắt sự kiện nút "Lấy dữ liệu" -> Bắt buộc lấy từ server (forceServer = true)
function handleFetchDataBtn() { 
  checkAndLoadInitialData(true); 
}

function loadDataFromLocal() {
  const storeKey = getExcelKeyCaiDat();
  const localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  if (localList.length > 0) groupAndRender(localList);
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
    if ((cust.NGAY_THIEN && String(cust.NGAY_THIEN).trim() !== '')) finished++;
  });
  document.getElementById("sumTongKh").innerText = total;
  document.getElementById("sumChuaGhi").innerText = total - finished;
}

function renderCurrentCustomerCard() {
  const container = document.getElementById("listContainer");
  if (customerKeys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Không tìm thấy dữ liệu cho ngày và nhân viên này.</p>";
    return;
  }

  let html = "";
  customerKeys.forEach((makh, index) => {
    const cust = groupedData[makh];
    let dateOnly = '<a style="color:red;">Chưa cài ĐG</a>';

    if (cust.NGAY_THIEN && String(cust.NGAY_THIEN).trim() !== '' && String(cust.NGAY_THIEN).trim().toLowerCase() !== 'null') {
      const strTime = String(cust.NGAY_THIEN).trim();
      const dateTimeMatch = strTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);

      if (dateTimeMatch) {
          dateOnly = `${dateTimeMatch[1].padStart(2, '0')}/${dateTimeMatch[2].padStart(2, '0')}/${dateTimeMatch[3]} ${(dateTimeMatch[4]||'0').padStart(2, '0')}:${(dateTimeMatch[5]||'0').padStart(2, '0')}:${(dateTimeMatch[6]||'0').padStart(2, '0')}`;
      } else {
          const d = new Date(strTime);
          if (!isNaN(d.getTime())) {
              dateOnly = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
          }
      }
    }

    html += `
      <div class="customer-card" id="customer_card_${makh}">
        <div class="cust-title">STT: ${index + 1}/${customerKeys.length} - Mã KH: ${cust.MA_KHANG} - <b>Số ĐT:</b> ${cust.DTHOAI_DVU || ''}</div>
        <div class="cust-tenKH">${cust.TEN_KHANG || ''}</div>
        <div class="cust-address"><b>Đ/C:</b> ${cust.DCHI_DDO || ''}</div>
        <div class="cust-row-group">Sổ: ${cust.MA_SOGCS || ''}-Danh số: ${cust.DANH_SO || ''}-Trụ: ${cust.SO_COT || ''}-Trạm: ${cust.TEN_TRAM || ''}</div>
        <div class="cust-address"><b>VT đấu nối:</b> ${cust.VITRI_DNOI || ''}</div>
        
        <div class="tech-info-grid">
          <div>Loại cto: <span>${cust.LOAI_CTO || ''}</span></div>
          <div>Sốc tơ: <span>${cust.SO_TBI || ''}</span></div>
          <div>GĐV: <span>${cust.TEN_NVGCS || ''}</span></div>
          <div>Mật khẩu C3: <span>${cust.MK_CAP3 || ''}</span></div>
          <div>NV cài ĐG: <span>${cust.TEN_NVCDAT || 'Chưa có'}</span></div>
          <div>Ngày cài ĐG: <span>${dateOnly}</span></div>          
        </div>

        <div class="cust-row-group">
          <input type="text" class="input-ghichu" 
                 id="ghi_chu_${makh}" 
                 value="${cust.GHI_CHU || ''}" 
                 placeholder="Nhập ghi chú nếu có..." 
                 onchange="groupedData['${makh}'].GHI_CHU = this.value;">
        </div>
        
        <div class="box-maps">
          ${
            (() => {
              const hasLocation = Boolean(cust.LAT && cust.LNG);
              if (hasLocation) {
                return `<span id="map_link_${makh}"><a href="http://maps.google.com/?q=${cust.LAT},${cust.LNG}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem VT công tơ trên Google Maps</a></span>`;
              } else {
                return `<a onclick="openNoteDialogForLocation(${index}, '${makh}')" style="color:red; font-size: 14px; font-weight:bold; text-decoration:none; cursor:pointer;">📍 Lấy mới định vị</a>`;
              }
            })()
          }
        </div>

        <div style="margin-top: 6px; display:flex; gap:6px;">
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Loại ký BB:</label>
            <select class="select-field" id="LOAI_KYBBAN_${makh}">
              <option value="Ký giấy" ${cust.LOAI_KYBBAN === "Ký giấy" ? "selected" : ""}>Ký giấy</option>
              <option value="Ký số" ${cust.LOAI_KYBBAN === "Ký số" ? "selected" : ""}>Ký số</option>
              <option value="Chưa ký" ${cust.LOAI_KYBBAN === "Chưa ký" ? "selected" : ""}>Chưa ký</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Tình trạng cài đặt:</label>
            <select class="select-field" id="CAIDAT_HTRUONG_${makh}">
              <option value="Thành công" ${cust.CAIDAT_HTRUONG === "Thành công" ? "selected" : ""}>Thành công</option>
              <option value="Lỗi cài đặt" ${cust.CAIDAT_HTRUONG === "Lỗi cài đặt" ? "selected" : ""}>Lỗi cài đặt</option>
            </select>
          </div>
        </div>

        <div class="card-btn-group">
          <button class="btn-card btn-card-save" onclick="saveCustomerData('${makh}')">💾 Lưu dữ liệu</button>
          <button class="btn-card btn-card-cancel" onclick="cancelCustomerData('${makh}')">✂ Hủy lưu</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function getFormattedDateTime() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const htruongEl = document.getElementById(`CAIDAT_HTRUONG_${maKhang}`);
  const kybbEl = document.getElementById(`LOAI_KYBBAN_${maKhang}`);
  const ghichuEl = document.getElementById(`ghi_chu_${maKhang}`);

  cust.CAIDAT_HTRUONG = htruongEl ? htruongEl.value : (cust.CAIDAT_HTRUONG || "");
  cust.LOAI_KYBBAN = kybbEl ? kybbEl.value : (cust.LOAI_KYBBAN || "");
  cust.GHI_CHU = ghichuEl ? ghichuEl.value.trim() : (cust.GHI_CHU || "");
  cust.NGAY_THIEN = getFormattedDateTime();
  
  if (!cust.TEN_NVCDAT) cust.TEN_NVCDAT = currentUser.ten_ndung || "";
  if (!cust.NVIEN_CDAT) cust.NVIEN_CDAT = currentUser.ten_ndung || "";

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.CAIDAT_HTRUONG = cust.CAIDAT_HTRUONG;
      item.LOAI_KYBBAN = cust.LOAI_KYBBAN;
      item.GHI_CHU = cust.GHI_CHU;
      item.NGAY_THIEN = cust.NGAY_THIEN;
      item.TEN_NVCDAT = cust.TEN_NVCDAT;
      item.NVIEN_CDAT = cust.NVIEN_CDAT;
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("💾 Đã lưu dữ liệu cài đặt thành công!");
  updateSummaryBar();
  
  if (navigator.onLine) await syncLocalExcelToSheet();
}

// YÊU CẦU 2: Khi bấm hủy dữ liệu thì trả các cột CAIDAT_HTRUONG, LOAI_KYBBAN, NGAY_THIEN, GHI_CHU về rỗng
async function cancelCustomerData(maKhang) {
  const confirm = await showCustomConfirm("HỦY DỮ LIỆU", "Bạn có muốn xóa dữ liệu cài đặt của khách hàng này không?", true);
  if (!confirm) return;

  const cust = groupedData[maKhang];
  if (!cust) return;

  cust.CAIDAT_HTRUONG = "";
  cust.LOAI_KYBBAN = "";
  cust.NGAY_THIEN = "";
  cust.GHI_CHU = "";

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.CAIDAT_HTRUONG = "";
      item.LOAI_KYBBAN = "";
      item.NGAY_THIEN = "";
      item.GHI_CHU = "";
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("✂ Đã hủy dữ liệu cài đặt!");
  renderCurrentCustomerCard();
  updateSummaryBar();

  if (navigator.onLine) await syncLocalExcelToSheet();
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
  if (data.length === 0) { showToast("⚠️ Chưa có dữ liệu để tải!"); return; }
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
    return !cust.NGAY_THIEN;
  });
  renderCurrentCustomerCard();
}

function showAllData() {
  document.getElementById("searchInput").value = "";
  customerKeys = Object.keys(groupedData);
  renderCurrentCustomerCard();
}

let searchedCustomer = null;

async function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!q) return;

  // 1. Kiểm tra xem khách hàng có sẵn trong danh sách hiện tại không
  const localTargetKey = Object.keys(groupedData).find(makh => {
    const c = groupedData[makh];
    return String(c.MA_KHANG || "").toLowerCase().trim() === q || String(c.SO_TBI || "").toLowerCase().trim() === q;
  });

  if (localTargetKey) {
    searchedCustomer = null;
    if (!customerKeys.includes(localTargetKey)) {
      customerKeys = Object.keys(groupedData);
      renderCurrentCustomerCard();
    }
    setTimeout(() => {
      const card = document.getElementById(`customer_card_${localTargetKey}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.style.backgroundColor = "#e8f4fd";
        setTimeout(() => card.style.backgroundColor = "", 1800);
      }
    }, 100);
    return;
  }

  if (!navigator.onLine) {
    showToast("❌ Không tìm thấy trong danh sách!", true);
    return;
  }

  // 2. Nếu không có trong danh sách, gọi API tìm trên server
  showToast("🔍 Đang tìm kiếm trên toàn bảng...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "SEARCH_ALL_CAIDAT", keyword: q })
    });
    const data = await res.json();
    
    if (data.status === "success" && Array.isArray(data.list) && data.list.length > 0) {
      searchedCustomer = data.list[0];
      const makh = searchedCustomer.MA_KHANG;
      const cust = searchedCustomer;

      let dateOnly = '<a style="color:red;">Chưa cài ĐG</a>';
      if (cust.NGAY_THIEN && String(cust.NGAY_THIEN).trim() !== '' && String(cust.NGAY_THIEN).trim().toLowerCase() !== 'null') {
        dateOnly = cust.NGAY_THIEN;
      }

      // Chỉ render ĐÚNG 1 card của khách hàng tìm kiếm với đầy đủ giao diện chuẩn y chang card gốc
      const container = document.getElementById("listContainer");
      container.innerHTML = `
        <div style="background: #fff3cd; border: 2px dashed #ffc107; padding: 6px; margin-bottom: 8px; border-radius: 8px; font-size: 13px; text-align: center; font-weight: bold; color: #856404;">
          ⚠️ Khách hàng nằm ngoài danh sách lọc. Lưu sẽ tự động thêm vào danh sách!
        </div>
        <div class="customer-card" id="customer_card_${makh}" style="border: 2px solid #fd7e14;">
          <div class="cust-title" style="color: #fd7e14;">🔍 TÌM KIẾM - Mã KH: ${cust.MA_KHANG} - <b>Số ĐT:</b> ${cust.DTHOAI_DVU || ''}</div>
          <div class="cust-tenKH">${cust.TEN_KHANG || ''}</div>
          <div class="cust-address"><b>Đ/C:</b> ${cust.DCHI_DDO || ''}</div>
          <div class="cust-row-group">Sổ: ${cust.MA_SOGCS || ''}-Danh số: ${cust.DANH_SO || ''}-Trụ: ${cust.SO_COT || ''}-Trạm: ${cust.TEN_TRAM || ''}</div>
          <div class="cust-address"><b>VT đấu nối:</b> ${cust.VITRI_DNOI || ''}</div>
          
          <div class="tech-info-grid">
            <div>Loại cto: <span>${cust.LOAI_CTO || ''}</span></div>
            <div>Sốc tơ: <span>${cust.SO_TBI || ''}</span></div>
            <div>GĐV: <span>${cust.TEN_NVGCS || ''}</span></div>
            <div>Mật khẩu C3: <span>${cust.MK_CAP3 || ''}</span></div>
            <div>NV cài ĐG: <span>${cust.TEN_NVCDAT || currentUser.ten_ndung || 'Chưa có'}</span></div>
            <div>Ngày cài ĐG: <span>${dateOnly}</span></div>          
          </div>

          <div class="cust-row-group">
            <input type="text" class="input-ghichu" 
                   id="ghi_chu_search_${makh}" 
                   value="${cust.GHI_CHU || ''}" 
                   placeholder="Nhập ghi chú nếu có..." 
                   onchange="searchedCustomer.GHI_CHU = this.value;">
          </div>
          
          <div class="box-maps">
            ${
              (() => {
                const hasLocation = Boolean(cust.LAT && cust.LNG);
                if (hasLocation) {
                  return `<span id="map_link_${makh}"><a href="http://maps.google.com/?q=${cust.LAT},${cust.LNG}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem VT công tơ trên Google Maps</a></span>`;
                } else {
                  return `<a onclick="openNoteDialogForLocation(0, '${makh}')" style="color:red; font-size: 14px; font-weight:bold; text-decoration:none; cursor:pointer;">📍 Lấy mới định vị</a>`;
                }
              })()
            }
          </div>

          <div style="margin-top: 6px; display:flex; gap:6px;">
            <div style="flex:1;">
              <label style="font-size:11px; font-weight:bold;">Loại ký BB:</label>
              <select class="select-field" id="LOAI_KYBBAN_search_${makh}">
                <option value="Ký giấy" ${cust.LOAI_KYBBAN === "Ký giấy" ? "selected" : ""}>Ký giấy</option>
                <option value="Ký số" ${cust.LOAI_KYBBAN === "Ký số" ? "selected" : ""}>Ký số</option>
                <option value="Chưa ký" ${cust.LOAI_KYBBAN === "Chưa ký" ? "selected" : ""}>Chưa ký</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:11px; font-weight:bold;">Tình trạng cài đặt:</label>
              <select class="select-field" id="CAIDAT_HTRUONG_search_${makh}">
                <option value="Thành công" ${cust.CAIDAT_HTRUONG === "Thành công" ? "selected" : ""}>Thành công</option>
                <option value="Lỗi cài đặt" ${cust.CAIDAT_HTRUONG === "Lỗi cài đặt" ? "selected" : ""}>Lỗi cài đặt</option>
              </select>
            </div>
          </div>

          <div class="card-btn-group">
            <button class="btn-card btn-card-save" onclick="saveSearchedCustomerData('${makh}')">💾 Lưu và Thêm vào DS</button>
            <button class="btn-card btn-card-cancel" onclick="showAllData()">✂ Thoát</button>
          </div>
        </div>
      `;
      showToast("✅ Đã tìm thấy khách hàng!");
    } else {
      showToast("❌ Không tìm thấy Mã KH hoặc Số công tơ!", true);
    }
  } catch (err) {
    showToast("❌ Lỗi tìm kiếm!", true);
  }
}

async function saveSearchedCustomerData(maKhang) {
  if (!searchedCustomer) return;

  const htruongEl = document.getElementById(`CAIDAT_HTRUONG_search_${maKhang}`);
  const kybbEl = document.getElementById(`LOAI_KYBBAN_search_${maKhang}`);
  const ghichuEl = document.getElementById(`ghi_chu_search_${maKhang}`);

  searchedCustomer.CAIDAT_HTRUONG = htruongEl ? htruongEl.value : (searchedCustomer.CAIDAT_HTRUONG || "");
  searchedCustomer.LOAI_KYBBAN = kybbEl ? kybbEl.value : (searchedCustomer.LOAI_KYBBAN || "");
  searchedCustomer.GHI_CHU = ghichuEl ? ghichuEl.value.trim() : (searchedCustomer.GHI_CHU || "");
  searchedCustomer.NGAY_THIEN = getFormattedDateTime();
  searchedCustomer.NVIEN_CDAT = currentUser.ten_ndung || "";
  searchedCustomer.TEN_NVCDAT = currentUser.ten_ndung || "";
  
  const ngayThInput = document.getElementById("inputNgayTH");
  if (ngayThInput && ngayThInput.value) {
    const parts = ngayThInput.value.split("-");
    if (parts.length === 3) searchedCustomer.NGAY_GIAOBB = `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  // Đưa vào kho dữ liệu chính và gộp chung
  groupedData[maKhang] = { ...searchedCustomer, items: [searchedCustomer] };
  
  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  // Kiểm tra nếu đã có trong local storage thì cập nhật, chưa có thì push vào
  let existingIndex = localList.findIndex(item => String(item.MA_KHANG) === String(maKhang));
  if (existingIndex >= 0) {
    localList[existingIndex] = searchedCustomer;
  } else {
    localList.push(searchedCustomer);
  }

  localStorage.setItem(storeKey, JSON.stringify(localList));
  
  customerKeys = Object.keys(groupedData);
  searchedCustomer = null;
  
  showToast("💾 Đã lưu và thêm vào danh sách!");
  renderCurrentCustomerCard();
  updateSummaryBar();
  
  if (navigator.onLine) await syncLocalExcelToSheet();
}

function openNoteDialogForLocation(index, safeKey) {
  let modal = document.getElementById('noteLocationModal');
  if (!modal) return;
  window._pendingLocationContext = { index, safeKey };
  document.getElementById('inputLocationNote').value = '';
  modal.style.display = 'flex';
}

function closeNoteDialog() {
  document.getElementById('noteLocationModal').style.display = 'none';
  window._pendingLocationContext = null;
}

function validateNoteInput() {
  const input = document.getElementById('inputLocationNote');
  const btn = document.getElementById('btnExecuteGetLocation');
  if (input.value.trim() !== '') {
    btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
  } else {
    btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none';
  }
}

function executeGetLocationWithNote() {
  const input = document.getElementById('inputLocationNote');
  const note = input ? input.value.trim() : '';
  const context = window._pendingLocationContext;
  if (!note || !context) return;
  closeNoteDialog();
  
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const cust = groupedData[context.safeKey] || {};
    cust.LAT = lat; cust.LNG = lng;
    
    const storeKey = getExcelKeyCaiDat();
    let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
    localList.forEach(item => {
      if (String(item.MA_KHANG) === String(context.safeKey)) { item.LAT = lat; item.LNG = lng; }
    });
    localStorage.setItem(storeKey, JSON.stringify(localList));
    renderCurrentCustomerCard();
    showToast("📍 Đã lưu tọa độ GPS thành công!");
  }, () => { showToast("❌ Lỗi định vị GPS!"); }, { enableHighAccuracy: true });
}
