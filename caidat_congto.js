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
  await checkAndLoadInitialData();

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

async function checkAndLoadInitialData() {
  const storeKey = getExcelKeyCaiDat();
  let localList = [];
  try {
    localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  } catch (e) {
    localList = [];
  }

  // Lấy chính xác giá trị ngày TH người dùng chọn trên giao diện
  const ngayThInput = document.getElementById("inputNgayTH");
  const selectedDate = ngayThInput ? ngayThInput.value : "";

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
      body: JSON.stringify({ 
        action: "GET_CAIDAT_DATA", 
        ten_ndung: currentUser.ten_ndung, // Lọc theo tên đăng nhập
        ngay_th: selectedDate             // Lọc theo ngày chọn (YYYY-MM-DD)
      })
    });
    const data = await res.json();

    if (data.status === "success" && Array.isArray(data.list)) {
      let formattedNgayTH = "";
      if (selectedDate) {
        const parts = selectedDate.split("-"); // [YYYY, MM, DD]
        if (parts.length === 3) {
          formattedNgayTH = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      // Gán chuẩn NGAY_GIAOBB và NVIEN_CDAT cho danh sách trả về
      data.list.forEach(item => {
        if (formattedNgayTH) {
          item.NGAY_GIAOBB = formattedNgayTH;
        }
        item.NVIEN_CDAT = currentUser.ten_ndung;
      });

      localStorage.setItem(storeKey, JSON.stringify(data.list));
      loadDataFromLocal();
      showToast("♻️ Lấy dữ liệu cài đặt thành công!");
    } else {
      if (localList.length > 0) {
        loadDataFromLocal();
        showToast("⚠️ Không có dữ liệu mới theo ngày này. Hiển thị dữ liệu trên thiết bị.");
      } else {
        document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding:20px; color:red;'>Không có dữ liệu phân công cho ngày này.</p>";
      }
    }
  } catch (err) {
    if (localList.length > 0) loadDataFromLocal();
    else {
      showToast("❌ Lỗi kết nối máy chủ!");
      document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Lỗi kết nối máy chủ hoặc không tải được dữ liệu.</p>";
    }
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
    let dateOnly = '<a style="color:red;">Chưa cài ĐG</a>';

    if (cust.NGAY_THIEN && String(cust.NGAY_THIEN).trim() !== '' && String(cust.NGAY_THIEN).trim().toLowerCase() !== 'null' && String(cust.NGAY_THIEN).trim().toLowerCase() !== 'undefined') {
      const strTime = String(cust.NGAY_THIEN).trim();
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
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
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
  
  if (!cust.TEN_NVCDAT || String(cust.TEN_NVCDAT).trim() === "" || String(cust.TEN_NVCDAT).trim().toLowerCase() === "null") {
    cust.TEN_NVCDAT = currentUser.ten_ndung || "";
  }
  if (!cust.NVIEN_CDAT || String(cust.NVIEN_CDAT).trim() === "" || String(cust.NVIEN_CDAT).trim().toLowerCase() === "null") {
    cust.NVIEN_CDAT = currentUser.ten_ndung || "";
  }

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.CAIDAT_HTRUONG = cust.CAIDAT_HTRUONG;
      item.LOAI_KYBBAN = cust.LOAI_KYBBAN;
      item.GHI_CHU = cust.GHI_CHU;
      item.THAY_CTO = cust.THAY_CTO;
      item.NGAY_THIEN = cust.NGAY_THIEN;
      item.TEN_NVCDAT = item.TEN_NVCDAT && String(item.TEN_NVCDAT).trim() !== "" ? item.TEN_NVCDAT : cust.TEN_NVCDAT;
      item.NVIEN_CDAT = item.NVIEN_CDAT && String(item.NVIEN_CDAT).trim() !== "" ? item.NVIEN_CDAT : cust.NVIEN_CDAT;
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("💾 Đã lưu dữ liệu cài đặt thành công!");
  updateSummaryBar();
  
  if (navigator.onLine) {
    await syncLocalExcelToSheet();
  }
}

async function cancelCustomerData(maKhang) {
  const confirm = await showCustomConfirm("HỦY DỮ LIỆU", "Bạn có muốn xóa dữ liệu cài đặt của khách hàng này không?", true);
  if (!confirm) return;

  const cust = groupedData[maKhang];
  if (!cust) return;

  cust.CAIDAT_HTRUONG = "";
  cust.THAY_CTO = "";
  cust.NGAY_THIEN = "";
  cust.TEN_NVCDAT = "";

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.CAIDAT_HTRUONG = "";
      item.THAY_CTO = "";
      item.NGAY_THIEN = "";
      item.TEN_NVCDAT = "";
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("✂ Đã hủy dữ liệu cài đặt!");
  renderCurrentCustomerCard();
  updateSummaryBar();
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
  const allKeys = Object.keys(groupedData);
  customerKeys = allKeys.filter(makh => {
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

let searchedCustomer = null;

async function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!q) return;

  const localTargetKey = Object.keys(groupedData).find(makh => {
    const c = groupedData[makh];
    const maKhang = String(c.MA_KHANG || "").toLowerCase().trim();
    const soTbi = String(c.SO_TBI || "").toLowerCase().trim();
    return maKhang === q || soTbi === q;
  });

  if (localTargetKey) {
    searchedCustomer = null;
    if (!customerKeys.includes(localTargetKey)) {
      customerKeys = Object.keys(groupedData);
      renderCurrentCustomerCard();
    }
    scrollToAndHighlightCard(localTargetKey);
    return;
  }

  if (!navigator.onLine) {
    showToast("❌ Không tìm thấy trong danh sách giao hôm nay (Đang ngoại tuyến)!", true);
    return;
  }

  showToast("🔍 Đang tìm kiếm chính xác trên toàn bảng...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ 
        action: "SEARCH_ALL_CAIDAT", 
        keyword: q 
      })
    });
    const data = await res.json();

    if (data.status === "success" && Array.isArray(data.list) && data.list.length > 0) {
      searchedCustomer = data.list[0];
      renderSearchedCustomerCard(searchedCustomer);
      showToast(`✅ Đã tìm thấy khách hàng ${searchedCustomer.MA_KHANG} (Ngoài danh sách giao)!`);
    } else {
      showToast("❌ Không tìm thấy chính xác Mã KH hoặc Số công tơ này trong toàn bảng!", true);
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối khi tìm kiếm!", true);
  }
}

function renderSearchedCustomerCard(cust) {
  const container = document.getElementById("listContainer");
  const makh = cust.MA_KHANG;
  
  let dateOnly = '<a style="color:red;">Chưa cài ĐG</a>';
  if (cust.NGAY_THIEN && String(cust.NGAY_THIEN).trim() !== '' && String(cust.NGAY_THIEN).trim().toLowerCase() !== 'null') {
      dateOnly = cust.NGAY_THIEN;
  }

  let html = `
    <div style="background: #fff3cd; border: 2px dashed #ffc107; padding: 6px; margin-bottom: 8px; border-radius: 8px; font-size: 13px; text-align: center; font-weight: bold; color: #856404;">
      ⚠️ Khách hàng này nằm ngoài danh sách được giao trong ngày. Sau khi lưu, hệ thống sẽ thêm vào danh sách của bạn!
    </div>
    <div class="customer-card" id="customer_card_${makh}" style="border: 2px solid #fd7e14;">
      <div class="cust-title" style="color: #fd7e14;">🔍 KHÁCH HÀNG TÌM KIẾM - Mã KH: ${cust.MA_KHANG} - <b>Số ĐT:</b> ${cust.DTHOAI_DVU || ''}</div>
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
        <button class="btn-card btn-card-save" onclick="saveSearchedCustomerData('${makh}')">💾 Lưu và Thêm vào DS</button>
        <button class="btn-card btn-card-cancel" onclick="showAllData()">✂ Thoát</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

async function saveSearchedCustomerData(maKhang) {
  if (!searchedCustomer) return;

  const htruongEl = document.getElementById(`CAIDAT_HTRUONG_${maKhang}`);
  const kybbEl = document.getElementById(`LOAI_KYBBAN_${maKhang}`);
  const ghichuEl = document.getElementById(`ghi_chu_${maKhang}`);

  searchedCustomer.CAIDAT_HTRUONG = htruongEl ? htruongEl.value : "";
  searchedCustomer.LOAI_KYBBAN = kybbEl ? kybbEl.value : "";
  searchedCustomer.GHI_CHU = ghichuEl ? ghichuEl.value.trim() : "";
  
  searchedCustomer.THAY_CTO = "X"; 
  searchedCustomer.NGAY_THIEN = getFormattedDateTime();
  
  const sampleKeys = Object.keys(groupedData);
  if (sampleKeys.length > 0) {
    const sampleCust = groupedData[sampleKeys[0]];
    
    let rawNgayGiao = sampleCust.NGAY_GIAOBB || "";
    if (rawNgayGiao) {
      let d = new Date(rawNgayGiao);
      if (!isNaN(d.getTime())) {
        let day = String(d.getDate()).padStart(2, '0');
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let year = d.getFullYear();
        searchedCustomer.NGAY_GIAOBB = `${day}/${month}/${year}`;
      } else {
        let strGiao = String(rawNgayGiao).trim();
        if (strGiao.includes("T")) {
          let parts = strGiao.split("T")[0].split("-");
          if (parts.length === 3) {
            strGiao = `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
        }
        searchedCustomer.NGAY_GIAOBB = strGiao;
      }
    } else {
      searchedCustomer.NGAY_GIAOBB = "";
    }

    searchedCustomer.NVIEN_CDAT = sampleCust.NVIEN_CDAT || currentUser.ten_ndung || "";
    searchedCustomer.TEN_NVCDAT = sampleCust.TEN_NVCDAT || currentUser.ten_ndung || "";
    searchedCustomer.NVIEN_CHTT = sampleCust.NVIEN_CHTT || ""; 
  }

  groupedData[maKhang] = { ...searchedCustomer, items: [searchedCustomer] };
  
  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  const existingIdx = localList.findIndex(item => String(item.MA_KHANG) === String(maKhang));
  if (existingIdx !== -1) {
    localList[existingIdx] = searchedCustomer;
  } else {
    localList.push(searchedCustomer);
  }

  localStorage.setItem(storeKey, JSON.stringify(localList));
  
  customerKeys = Object.keys(groupedData);
  searchedCustomer = null; 
  
  showToast("💾 Đã lưu và thêm khách hàng vào danh sách của bạn thành công!");
  updateSummaryBar();
  renderCurrentCustomerCard();
  
  if (navigator.onLine) {
    await syncLocalExcelToSheet();
  }
}

function scrollToAndHighlightCard(targetKey) {
  setTimeout(() => {
    const card = document.getElementById(`customer_card_${targetKey}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.style.backgroundColor = "#e8f4fd";
      setTimeout(() => card.style.backgroundColor = "", 1800);
    }
  }, 100);
}

function getExcelKeyDinhVi() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `caidat_dinhvi_excel_data_${user}`;
}

function openNoteDialogForLocation(index, safeKey) {
  let modal = document.getElementById('noteLocationModal');
  if (!modal) return;
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
      // Đã sửa lỗi đánh máy maKghang thành maKhang ở đây:
      const cust = groupedData[maKhang] || {};
      const nowStr = new Date().toLocaleString("vi-VN");

      cust.LAT = lat;
      cust.LNG = lng;

      const storeKey = getExcelKeyCaiDat();
      let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
      localList.forEach(item => {
        if (String(item.MA_KHANG) === String(maKhang)) {
          item.LAT = lat;
          item.LNG = lng;
        }
      });
      localStorage.setItem(storeKey, JSON.stringify(localList));

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
