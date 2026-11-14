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

        <div class="tech-info-grid">
          <div>Loại cto: <span>${cust.LOAI_CTO || ''}</span></div>
          <div>Mã Cloại: <span>${cust.MA_CLOAI || ''}</span></div>
          <div>Dòng/Áp: <span>${cust.DONG_DIEN || ''} / ${cust.DIEN_AP || ''}</span></div>
          <div>Mật khẩu P3: <span>${cust.MK_CAP3 || ''}</span></div>
          <div>Năm SX: <span>${cust.NAM_SX || ''}</span></div>
          <div>Hệ số nhân: <span>${cust.HSN || 1}</span></div>
        </div>

        <div style="margin-top: 6px;">
          <table style="width:100%; font-size:13px; border-collapse:collapse;">
            <tr>
              <td style="width:50%; padding-right:4px;">
                <label style="font-size:11px; font-weight:bold;">Modem:</label>
                <input type="text" class="input-field" id="modem_${makh}" value="${cust.MODEM || ''}" placeholder="Nhập modem...">
              </td>
              <td style="width:50%; padding-left:4px;">
                <label style="font-size:11px; font-weight:bold;">Cài đặt hệ trưởng:</label>
                <input type="text" class="input-field" id="htruong_${makh}" value="${cust.CAIDAT_HTRUONG || ''}" placeholder="Hệ trưởng...">
              </td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 6px; display:flex; gap:6px;">
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Loại ký BB:</label>
            <select class="select-field" id="thay_cto_${makh}">
              <option value="X" ${cust.LOAI_KYBBAN === "2" ? "selected" : ""}>Ký giấy</option>
              <option value="K" ${cust.LOAI_KYBBAN === "1" ? "selected" : ""}>Ký số</option>
              <option value="K" ${cust.LOAI_KYBBAN === "0" ? "selected" : ""}>Chưa ký</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; font-weight:bold;">Nhân viên cài đặt:</label>
            <input type="text" class="input-field" id="nv_cdat_${makh}" value="${cust.NVIEN_CDAT || currentUser.ten_nvien || ''}">
          </div>
        </div>

        <div class="card-btn-group">
          <button class="btn-card btn-card-save" onclick="saveCustomerData('${makh}')">💾 Lưu cài đặt</button>
          <button class="btn-card btn-card-cancel" onclick="cancelCustomerData('${makh}')">✂ Hủy</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  cust.MODEM = document.getElementById(`modem_${maKhang}`).value.trim();
  cust.CAIDAT_HTRUONG = document.getElementById(`htruong_${maKhang}`).value.trim();
  cust.THAY_CTO = document.getElementById(`thay_cto_${maKhang}`).value;
  cust.NVIEN_CDAT = document.getElementById(`nv_cdat_${maKhang}`).value.trim();
  cust.NGAY_THIEN = new Date().toLocaleString("vi-VN");

  const storeKey = getExcelKeyCaiDat();
  let localList = JSON.parse(localStorage.getItem(storeKey) || "[]");
  
  localList.forEach(item => {
    if (String(item.MA_KHANG) === String(maKhang)) {
      item.MODEM = cust.MODEM;
      item.CAIDAT_HTRUONG = cust.CAIDAT_HTRUONG;
      item.THAY_CTO = cust.THAY_CTO;
      item.NVIEN_CDAT = cust.NVIEN_CDAT;
      item.NGAY_THIEN = cust.NGAY_THIEN;
    }
  });

  localStorage.setItem(storeKey, JSON.stringify(localList));
  showToast("💾 Đã lưu dữ liệu cài đặt công tơ!");
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
