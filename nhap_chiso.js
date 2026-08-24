// nhap_chiso.js
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxJZHenN4zoxZR7wOk4SiBnUx071LKLdAWOdJLToJPScSdBIj8Qn_pOeTDAABlN_UAF/exec"; // Thay URL Web App của bác vào đây

let allCustomers = [];
let currentUser = null;

document.addEventListener("DOMContentLoaded", function () {
  checkSession();
  loadData();
});

function checkSession() {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) {
    window.location.href = "login.html";
    return;
  }
  try {
    currentUser = JSON.parse(sessionStr);
    const userDisplay = document.getElementById("userDisplay");
    if (userDisplay) {
      userDisplay.innerText = "👷 " + (currentUser.ten_nvien || currentUser.ten_ndung);
    }
  } catch (e) {
    window.location.href = "login.html";
  }
}

function loadData() {
  if (!currentUser || !currentUser.ten_ndung) return;

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "GET_CHISO_DATA",
      ten_ndung: currentUser.ten_ndung
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        allCustomers = data.list || [];
        updateSummary();
        renderCustomerList(allCustomers);
      } else {
        showToast("Lỗi tải dữ liệu: " + data.message);
      }
    })
    .catch(err => {
      console.error(err);
      showToast("Lỗi kết nối máy chủ!");
    });
}

function updateSummary() {
  const tong = allCustomers.length;
  const daGhi = allCustomers.filter(c => c.chiso_moi !== "" && c.chiso_moi !== null && c.chiso_moi !== undefined).length;
  const chuaGhi = tong - daGhi;

  document.getElementById("sumTongKh").innerText = tong;
  document.getElementById("sumDaCS").innerText = daGhi;
  document.getElementById("sumChuaGhi").innerText = chuaGhi;
}

function renderCustomerList(list) {
  const container = document.getElementById("listContainer");
  if (!list || list.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: #666;">Không tìm thấy dữ liệu khách hàng.</div>';
    return;
  }

  let html = "";
  list.forEach(item => {
    html += `
      <div class="customer-card" id="card-${item.rowIndex}" onclick="setActiveCard(${item.rowIndex})">
        <div class="cust-header">
          <div class="cust-title">${item.ten_khang} (${item.ma_khang})</div>
          <div class="cust-address">📍 ${item.dia_chi || 'Chưa có địa chỉ'}</div>
        </div>
        <div class="cust-row-group">
          <span>STT: <b>${item.danh_so || ''}</b></span>
          <span>Số Cột: <b>${item.so_cot || ''}</b></span>
          <span>Trạm: <b>${item.ten_tram || ''}</b></span>
        </div>
        <div style="margin-top: 6px;">
          <table class="chiso-table">
            <thead>
              <tr>
                <th>BCS</th>
                <th>Chỉ số cũ</th>
                <th>Chỉ số mới</th>
                <th>Sản lượng</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center"><span class="bcs-badge">${item.bcs || 'KT'}</span></td>
                <td class="text-right val-calc-large">${item.chiso_cu}</td>
                <td class="td-input-container">
                  <input type="number" class="input-cs-moi" id="cs-input-${item.rowIndex}" 
                    value="${item.chiso_moi !== undefined ? item.chiso_moi : ''}" placeholder="Nhập..." 
                    oninput="calculateCard(${item.rowIndex})" />
                </td>
                <td class="text-right val-highlight" id="sl-${item.rowIndex}">${item.san_luong || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 6px;">
          <input type="text" class="input-ghichu" id="note-${item.rowIndex}" 
            value="${item.ghi_chu || ''}" placeholder="Nhập ghi chú (nếu có)..." />
        </div>
        <div class="card-btn-group">
          <button class="btn-card btn-card-save" id="btn-save-${item.rowIndex}" onclick="saveCustomer(${item.rowIndex})">Lưu & Định vị</button>
          <button class="btn-card btn-card-cancel" onclick="cancelCustomer(${item.rowIndex})">Hủy chỉ số</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setActiveCard(rowIndex) {
  document.querySelectorAll(".customer-card").forEach(c => c.classList.remove("active"));
  const card = document.getElementById("card-" + rowIndex);
  if (card) card.classList.add("active");
}

function calculateCard(rowIndex) {
  const item = allCustomers.find(c => c.rowIndex === rowIndex);
  if (!item) return;

  const csMoiInput = document.getElementById(`cs-input-${rowIndex}`).value;
  if (csMoiInput !== "" && !isNaN(csMoiInput)) {
    const csMoi = Number(csMoiInput);
    const csCu = Number(item.chiso_cu) || 0;
    const hsn = Number(item.hsn) || 1;
    const sanLuong = Math.round((csMoi - csCu) * hsn);
    document.getElementById(`sl-${rowIndex}`).innerText = sanLuong;
  } else {
    document.getElementById(`sl-${rowIndex}`).innerText = 0;
  }
}

function saveCustomer(rowIndex) {
  const item = allCustomers.find(c => c.rowIndex === rowIndex);
  if (!item) return;

  const csMoi = document.getElementById(`cs-input-${rowIndex}`).value;
  const ghiChu = document.getElementById(`note-${rowIndex}`).value;

  if (csMoi === "") {
    showToast("Vui lòng nhập chỉ số mới!");
    return;
  }

  const btnSave = document.getElementById(`btn-save-${rowIndex}`);
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerText = "Đang lấy GPS...";
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        sendSaveRequest(rowIndex, item, csMoi, ghiChu, position.coords.latitude, position.coords.longitude, btnSave);
      },
      (error) => {
        showToast("Lỗi GPS, đang lưu không tọa độ...");
        sendSaveRequest(rowIndex, item, csMoi, ghiChu, "", "", btnSave);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    sendSaveRequest(rowIndex, item, csMoi, ghiChu, "", "", btnSave);
  }
}

function sendSaveRequest(rowIndex, item, csMoi, ghiChu, lat, lng, btnSave) {
  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "SAVE_CHISO",
      ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung,
      items: [{
        rowIndex: rowIndex,
        chiso_cu: item.chiso_cu,
        chiso_moi: csMoi,
        hsn: item.hsn,
        sluong_thao: item.sluong_thao,
        sluong_kt: item.sluong_kt,
        ghi_chu: ghiChu,
        lat: lat,
        lng: lng
      }]
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        // Cập nhật bộ nhớ tại chỗ mà không gọi lại Server (Ghi 25 máy siêu mượt)
        item.chiso_moi = csMoi;
        item.ghi_chu = ghiChu;
        const csCu = Number(item.chiso_cu) || 0;
        const hsn = Number(item.hsn) || 1;
        item.san_luong = Math.round((Number(csMoi) - csCu) * hsn);
        
        updateSummary();
        showToast(lat ? "Đã lưu chỉ số & GPS 📍" : "Đã lưu chỉ số!");
      } else {
        showToast("Lỗi: " + data.message);
      }
    })
    .catch(err => {
      showToast("Lỗi kết nối máy chủ!");
    })
    .finally(() => {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerText = "Lưu & Định vị";
      }
    });
}

function cancelCustomer(rowIndex) {
  if (!confirm("Bạn có chắc chắn muốn hủy chỉ số vừa nhập?")) return;

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "CANCEL_CHISO",
      rowIndices: [rowIndex]
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        const item = allCustomers.find(c => c.rowIndex === rowIndex);
        if (item) {
          item.chiso_moi = "";
          item.san_luong = 0;
          document.getElementById(`cs-input-${rowIndex}`).value = "";
          document.getElementById(`sl-${rowIndex}`).innerText = 0;
          updateSummary();
        }
        showToast("Đã hủy chỉ số!");
      }
    });
}

function filterData() {
  const kw = document.getElementById("searchInput").value.toLowerCase().trim();
  const filtered = allCustomers.filter(item => {
    return (item.ma_khang || "").toLowerCase().includes(kw) ||
      (item.ten_khang || "").toLowerCase().includes(kw) ||
      (item.dia_chi || "").toLowerCase().includes(kw) ||
      (item.so_cot || "").toLowerCase().includes(kw) ||
      (item.so_cto || "").toLowerCase().includes(kw) ||
      (item.ten_tram || "").toLowerCase().includes(kw);
  });
  renderCustomerList(filtered);
}

function filterChuaGhi() {
  const filtered = allCustomers.filter(c => c.chiso_moi === "" || c.chiso_moi === null || c.chiso_moi === undefined);
  renderCustomerList(filtered);
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
}
