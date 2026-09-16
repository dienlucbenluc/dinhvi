// CẤU HÌNH API URL
const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec"; 

let globalData = [];
let filteredData = [];
let currentUser = { ten_ndung: "", ten_nvien: "" };
let modalInstance = null;
let currentGPS = { lat: "", lng: "" };

document.addEventListener("DOMContentLoaded", function () {
  modalInstance = new bootstrap.Modal(document.getElementById("modalNhapChiSo"));
  loadUserInfo();
  loadChiSoData();
});

function loadUserInfo() {
  const userStr = localStorage.getItem("user_info");
  if (userStr) {
    try {
      currentUser = JSON.parse(userStr);
      document.getElementById("userDisplay").innerHTML = `<i class="fa-solid fa-user me-1"></i>${currentUser.ten_nvien || currentUser.ten_ndung}`;
    } catch (e) {
      console.error("Lỗi parse user_info", e);
    }
  }
}

function showLoading(show, text = "Đang tải dữ liệu...") {
  const overlay = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").innerText = text;
  if (show) overlay.classList.remove("d-none");
  else overlay.classList.add("d-none");
}

function loadChiSoData() {
  showLoading(true, "Đang tải danh sách chỉ số...");

  const payload = {
    action: "GET_CHISO_DATA",
    ten_ndung: currentUser.ten_ndung,
    ten_nvien: currentUser.ten_nvien,
    tinh_trang: "ALL"
  };

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(res => {
      showLoading(false);
      if (res.status === "success") {
        globalData = res.list || [];
        filterData();
      } else {
        alert("Lỗi tải dữ liệu: " + res.message);
      }
    })
    .catch(err => {
      showLoading(false);
      alert("Lỗi kết nối máy chủ: " + err.toString());
    });
}

function filterData() {
  const searchKey = document.getElementById("searchInput").value.trim().toLowerCase();
  const filterStatus = document.getElementById("filterStatus").value;

  let totalCount = globalData.length;
  let doneCount = 0;
  let pendingCount = 0;

  filteredData = globalData.filter(item => {
    const hasCS = item.chiso_moi !== "" && item.chiso_moi !== null && item.chiso_moi !== undefined;
    if (hasCS) doneCount++;
    else pendingCount++;

    let matchStatus = true;
    if (filterStatus === "CO_CS") matchStatus = hasCS;
    else if (filterStatus === "CHUA_CS") matchStatus = !hasCS;

    let matchSearch = true;
    if (searchKey !== "") {
      const strKhang = (item.ten_khang || "").toLowerCase();
      const strMaKh = (item.ma_khang || "").toLowerCase();
      const strSoCto = (item.so_cto || "").toLowerCase();
      const strSoCot = (item.so_cot || "").toLowerCase();

      matchSearch = strKhang.includes(searchKey) || 
                    strMaKh.includes(searchKey) || 
                    strSoCto.includes(searchKey) || 
                    strSoCot.includes(searchKey);
    }

    return matchStatus && matchSearch;
  });

  document.getElementById("txtTotal").innerText = totalCount;
  document.getElementById("txtDone").innerText = doneCount;
  document.getElementById("txtPending").innerText = pendingCount;

  renderCustomerList(filteredData);
}

function renderCustomerList(list) {
  const container = document.getElementById("customerList");
  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center text-muted my-4"><i class="fa-solid fa-inbox fa-2x mb-2"></i><br>Không tìm thấy khách hàng nào</div>`;
    return;
  }

  list.forEach(item => {
    const isDone = item.chiso_moi !== "" && item.chiso_moi !== null && item.chiso_moi !== undefined;
    const cardClass = isDone ? "done" : "pending";
    const badgeHtml = isDone 
      ? `<span class="badge bg-success badge-status"><i class="fa-solid fa-check me-1"></i>Đã nhập: ${item.chiso_moi}</span>`
      : `<span class="badge bg-warning text-dark badge-status"><i class="fa-solid fa-clock me-1"></i>Chưa nhập</span>`;

    const card = document.createElement("div");
    card.className = `card card-customer ${cardClass} p-3`;
    card.onclick = () => openModalNhap(item.rowIndex);

    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-1">
        <h6 class="fw-bold mb-0 text-primary">${item.ten_khang}</h6>
        ${badgeHtml}
      </div>
      <div class="small text-muted mb-1">
        <i class="fa-solid fa-barcode me-1"></i>Mã KH: <strong>${item.ma_khang}</strong> | Số CT: <strong>${item.so_cto}</strong>
      </div>
      <div class="small text-muted mb-1">
        <i class="fa-solid fa-bolt me-1"></i>Cột: ${item.so_cot || '--'} | Trạm: ${item.ten_tram || '--'}
      </div>
      <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top small">
        <span class="text-muted">CS Cũ: <strong>${item.chiso_cu}</strong></span>
        <span class="text-muted">Sản lượng: <strong class="text-danger">${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '--'} kWh</strong></span>
      </div>
    `;

    container.appendChild(card);
  });
}

function openModalNhap(rowIndex) {
  const item = globalData.find(x => x.rowIndex === rowIndex);
  if (!item) return;

  currentGPS = { lat: item.lat || "", lng: item.lng || "" };

  document.getElementById("modalRowIndex").value = item.rowIndex;
  document.getElementById("modalTenKhang").innerText = item.ten_khang;
  document.getElementById("modalMaKhCto").innerText = `Mã KH: ${item.ma_khang} - Số CT: ${item.so_cto}`;
  document.getElementById("modalDiaChi").innerText = item.dia_chi || "Không có địa chỉ";

  document.getElementById("modalCSCu").value = item.chiso_cu || 0;
  document.getElementById("modalCSMoi").value = item.chiso_moi !== undefined ? item.chiso_moi : "";
  document.getElementById("modalHSN").value = item.hsn || 1;
  document.getElementById("modalSanLuong").value = item.san_luong !== undefined ? item.san_luong : "";
  document.getElementById("modalGhiChu").value = item.ghi_chu || "";

  if (item.lat && item.lng) {
    document.getElementById("modalToaDo").value = `${item.lat}, ${item.lng}`;
  } else {
    document.getElementById("modalToaDo").value = "";
    layToaDoGPS();
  }

  tinhSanLuong();
  modalInstance.show();
}

function tinhSanLuong() {
  const csCu = parseFloat(document.getElementById("modalCSCu").value) || 0;
  const csMoiInput = document.getElementById("modalCSMoi").value;
  const hsn = parseFloat(document.getElementById("modalHSN").value) || 1;

  if (csMoiInput !== "" && !isNaN(csMoiInput)) {
    const csMoi = parseFloat(csMoiInput);
    if (csMoi < csCu) {
      document.getElementById("modalSanLuong").value = "Lỗi (CS Mới < CS Cũ)";
    } else {
      const sl = Math.round((csMoi - csCu) * hsn);
      document.getElementById("modalSanLuong").value = sl;
    }
  } else {
    document.getElementById("modalSanLuong").value = "";
  }
}

function layToaDoGPS() {
  const txtToaDo = document.getElementById("modalToaDo");
  const txtStatus = document.getElementById("gpsStatus");

  txtStatus.innerText = "Đang lấy vị trí GPS...";
  txtStatus.className = "text-primary";

  if (!navigator.geolocation) {
    txtStatus.innerText = "Trình duyệt không hỗ trợ GPS.";
    txtStatus.className = "text-danger";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      currentGPS = { lat: lat, lng: lng };
      txtToaDo.value = `${lat}, ${lng}`;
      txtStatus.innerText = `Độ chính xác: ±${Math.round(position.coords.accuracy)}m`;
      txtStatus.className = "text-success";
    },
    error => {
      txtStatus.innerText = "Lỗi lấy GPS: " + error.message;
      txtStatus.className = "text-danger";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function luuChiSo() {
  const rowIndex = parseInt(document.getElementById("modalRowIndex").value);
  const csMoi = document.getElementById("modalCSMoi").value.trim();
  const csCu = parseFloat(document.getElementById("modalCSCu").value) || 0;
  const ghiChu = document.getElementById("modalGhiChu").value.trim();

  if (csMoi !== "" && parseFloat(csMoi) < csCu) {
    alert("Chỉ số mới không được nhỏ hơn chỉ số cũ!");
    return;
  }

  const payload = {
    action: "SAVE_CHISO",
    ten_ndung: currentUser.ten_ndung,
    ten_nvien: currentUser.ten_nvien,
    items: [
      {
        rowIndex: rowIndex,
        chiso_cu: csCu,
        chiso_moi: csMoi !== "" ? parseFloat(csMoi) : "",
        hsn: parseFloat(document.getElementById("modalHSN").value) || 1,
        lat: currentGPS.lat,
        lng: currentGPS.lng,
        ghi_chu: ghiChu
      }
    ]
  };

  showLoading(true, "Đang lưu chỉ số...");

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(res => {
      showLoading(false);
      if (res.status === "success") {
        modalInstance.hide();
        loadChiSoData();
      } else {
        alert("Lỗi lưu dữ liệu: " + res.message);
      }
    })
    .catch(err => {
      showLoading(false);
      alert("Lỗi kết nối máy chủ: " + err.toString());
    });
}

function xoaChiSo() {
  const rowIndex = parseInt(document.getElementById("modalRowIndex").value);
  if (!confirm("Bạn có chắc chắn muốn hủy chỉ số của khách hàng này?")) return;

  const payload = {
    action: "CANCEL_CHISO",
    rowIndices: [rowIndex]
  };

  showLoading(true, "Đang hủy chỉ số...");

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(res => {
      showLoading(false);
      if (res.status === "success") {
        modalInstance.hide();
        loadChiSoData();
      } else {
        alert("Lỗi hủy chỉ số: " + res.message);
      }
    })
    .catch(err => {
      showLoading(false);
      alert("Lỗi kết nối máy chủ: " + err.toString());
    });
}
