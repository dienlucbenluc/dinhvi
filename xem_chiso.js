const API_URL = "https://script.google.com/macros/s/AKfycbxJZHenN4zoxZR7wOk4SiBnUx071LKLdAWOdJLToJPScSdBIj8Qn_pOeTDAABlN_UAF/exec";
let currentUser = null;
let rawData = []; 
let groupedData = {};
let activeMaKhang = null;

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

// Khai báo hàm đổ dữ liệu vào Combobox ở trên cùng để tránh lỗi undefined
function populateEmployeeDropdown(list) {
  const selectEl = document.getElementById("employeeSelect");
  if (!selectEl) return;

  // In mẫu 1 dòng dữ liệu ra Console (F12) để xem chính xác tên thuộc tính
  if (list && list.length > 0) {
    console.log("👉 Dữ liệu dòng 1 nhận từ Server:", list[0]);
  } else {
    console.warn("⚠️ Mảng dữ liệu nhận từ Server bị RỖNG!");
  }

  // Lọc an toàn: Chấp nhận mọi giá trị chiso_moi miễn là KHÔNG phải null, undefined, hoặc chuỗi rỗng
  const validItems = list.filter(item => {
    const name = item.ten_nvien || item.ten_nv || item.TEN_NVIEN; // Thử các kiểu tên cột
    const csMoi = item.chiso_moi !== undefined ? item.chiso_moi : item.cs_moi;
    
    const hasName = name && String(name).trim() !== "";
    const hasCSMoi = csMoi !== null && csMoi !== undefined && String(csMoi).trim() !== "";

    return hasName && hasCSMoi;
  });

  // Lấy danh sách tên không trùng lặp
  const employees = Array.from(new Set(
    validItems.map(item => String(item.ten_nvien || item.ten_nv || item.TEN_NVIEN).trim())
  )).sort();

  selectEl.innerHTML = '<option value="">-- Chọn nhân viên --</option>';

  if (employees.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "-- Không tìm thấy NV có chỉ số mới --";
    selectEl.appendChild(opt);
    return;
  }

  employees.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp;
    opt.textContent = emp;
    selectEl.appendChild(opt);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);
  
  const userDisplayEl = document.getElementById("userDisplay");
  if (userDisplayEl) {
    userDisplayEl.innerText = `👷 ${currentUser.ten_nvien || currentUser.ten_ndung}`;
  }
  
  loadChiSoData();
});

function toggleMenu(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("menuDropdown");
  if (dropdown) dropdown.classList.toggle("show");
}

document.addEventListener("click", () => {
  const menu = document.getElementById("menuDropdown");
  if (menu && menu.classList.contains("show")) menu.classList.remove("show");
});

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerText = msg;
  t.style.display = "block";
  
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 3500);
}

function showCustomConfirm(title, message, isDanger = false) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customConfirmModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnConfirm = document.getElementById("btnModalConfirm");
    const btnCancel = document.getElementById("btnModalCancel");

    titleEl.innerText = title;
    titleEl.style.color = isDanger ? "#dc3545" : "#007bff";
    msgEl.innerText = message;
    btnConfirm.style.background = isDanger ? "#dc3545" : "#28a745";

    modal.style.display = "flex";

    btnConfirm.onclick = () => {
      modal.style.display = "none";
      resolve(true);
    };

    btnCancel.onclick = () => {
      modal.style.display = "none";
      resolve(false);
    };
  });
}

function loadChiSoData() {
  const container = document.getElementById("listContainer");
  if (container) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; color:#666;'>⏳ Đang tải dữ liệu chỉ số...</p>";
  }

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "GET_CHISO_DATA", getAll: true }),
    redirect: "follow"
  })
  .then(async res => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Phản hồi không phải JSON: " + text.substring(0, 80));
    }
  })
  .then(res => {
    if (res.status === "success" && Array.isArray(res.list)) {
      rawData = res.list;
      populateEmployeeDropdown(rawData);
      
      if (container) {
        container.innerHTML = "<p style='text-align:center; padding-top:20px; color:#666;'>👆 Vui lòng chọn nhân viên để hiển thị danh sách.</p>";
      }
    } else {
      if (container) {
        container.innerHTML = "<p style='color:red; text-align:center;'>Lỗi Backend: " + (res.message || "Không có dữ liệu trả về") + "</p>";
      }
    }
  })
  .catch(err => {
    console.error("Fetch Error:", err);
    if (container) {
      container.innerHTML = `<p style='color:red; text-align:center;'>Lỗi kết nối: ${err.message}</p>`;
    }
  });
}

function onEmployeeChange() {
  const selectedEmp = document.getElementById("employeeSelect").value;
  const container = document.getElementById("listContainer");
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = ""; 

  if (!selectedEmp) {
    groupedData = {};
    container.innerHTML = "<p style='text-align:center; padding-top:20px; color:#666;'>👆 Vui lòng chọn nhân viên để hiển thị danh sách.</p>";
    updateSummaryBar();
    return;
  }

  const filteredList = rawData.filter(item => {
    const empName = String(item.ten_nvien || item.ten_nv || item.TEN_NVIEN || "").trim();
    const isEmpMatch = empName === String(selectedEmp).trim();
    
    const csMoi = item.chiso_moi !== undefined ? item.chiso_moi : item.cs_moi;
    const hasChiSoMoi = csMoi !== null && csMoi !== undefined && String(csMoi).trim() !== "";

    return isEmpMatch && hasChiSoMoi;
  });

  groupAndRender(filteredList);
}

function groupAndRender(flatList) {
  groupedData = {};
  flatList.forEach(item => {
    const makh = item.ma_khang;
    if (!groupedData[makh]) {
      groupedData[makh] = {
        ma_khang: item.ma_khang,
        ten_khang: item.ten_khang,
        dia_chi: item.dia_chi,
        ma_sogcs: item.ma_sogcs,
        danh_so: item.danh_so,
        so_cto: item.so_cto,
        nhap_cmis: Number(item.nhap_cmis || 0),
        items: []
      };
    }
    groupedData[makh].items.push(item);
  });

  Object.keys(groupedData).forEach(makh => {
    groupedData[makh].items.sort((a, b) => {
      let idxA = BCS_ORDER.indexOf(String(a.bcs).toUpperCase().trim());
      let idxB = BCS_ORDER.indexOf(String(b.bcs).toUpperCase().trim());
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  });

  updateSummaryBar();
  renderGroupedList(groupedData);
}

function updateSummaryBar() {
  const keys = Object.keys(groupedData);
  const tongKh = keys.length;
  let daNhap = 0;

  keys.forEach(makh => {
    if (groupedData[makh].nhap_cmis === 1) {
      daNhap++;
    }
  });

  const chuaNhap = tongKh - daNhap;

  const elTong = document.getElementById("sumTongKh");
  const elDaNhap = document.getElementById("sumDaNhap");
  const elChuaNhap = document.getElementById("sumChuaNhap");

  if (elTong) elTong.innerText = tongKh;
  if (elDaNhap) elDaNhap.innerText = daNhap;
  if (elChuaNhap) elChuaNhap.innerText = chuaNhap;
}

function filterChuaNhap() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";
  
  const filteredGroups = {};
  Object.keys(groupedData).forEach(makh => {
    if (groupedData[makh].nhap_cmis === 0) {
      filteredGroups[makh] = groupedData[makh];
    }
  });

  renderGroupedList(filteredGroups);
}

function selectCustomer(maKhang) {
  activeMaKhang = maKhang;
  document.querySelectorAll('.customer-card.active').forEach(card => card.classList.remove('active'));
  const targetCard = document.getElementById(`card_${maKhang}`);
  if (targetCard) targetCard.classList.add('active');
}

function toggleCheckCMIS(maKhang, isChecked) {
  if (groupedData[maKhang]) {
    groupedData[maKhang].nhap_cmis = isChecked ? 1 : 0;
    groupedData[maKhang].is_checked = isChecked;
    updateSummaryBar();
  }
}

function renderGroupedList(groups) {
  const container = document.getElementById("listContainer");
  const keys = Object.keys(groups);

  if (keys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; color:#666;'>Không có dữ liệu chỉ số cho nhân viên này.</p>";
    return;
  }

  container.innerHTML = "";
  
  const CHUNK_SIZE = 30;
  let currentIndex = 0;

  function renderChunk() {
    const nextKeys = keys.slice(currentIndex, currentIndex + CHUNK_SIZE);
    if (nextKeys.length === 0) return;

    let html = "";
    nextKeys.forEach(makh => {
      const cust = groups[makh];
      const isActive = (makh === activeMaKhang) ? "active" : "";
      const isCMIS = cust.nhap_cmis === 1;
      const isChecked = cust.is_checked || isCMIS;

      html += `
        <div class="customer-card ${isActive}" id="card_${cust.ma_khang}" onclick="selectCustomer('${cust.ma_khang}')">
          <div class="cust-header">
            <div class="cust-title">${cust.ma_khang} - ${cust.ten_khang}</div>
            <div class="cust-row-group">
              <label class="chk-cmis-label" onclick="event.stopPropagation();">
                <input type="checkbox" 
                       id="chk_cmis_${cust.ma_khang}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleCheckCMIS('${cust.ma_khang}', this.checked)">
                CMIS
              </label>
              <span>Sổ: <b>${cust.ma_sogcs || ''}</b> - DS:${cust.danh_so || ''}</span>
            </div>
          </div>

          <div class="table-responsive">
            <table class="chiso-table">
              <thead>
                <tr>
                  <th style="width: 20%;">BCS</th>
                  <th style="width: 26%;">CS cũ</th>
                  <th style="width: 27%;">CS mới</th>
                  <th style="width: 27%;">Sản lượng</th>
                </tr>
              </thead>
              <tbody>
      `;

      cust.items.forEach(item => {
        const csMoiVal = (item.chiso_moi !== "" && item.chiso_moi !== undefined && item.chiso_moi !== null) ? item.chiso_moi : "-";
        const sanLuongVal = (item.san_luong !== "" && item.san_luong !== undefined && item.san_luong !== null) ? item.san_luong : "-";

        html += `
          <tr>
            <td class="text-center"><span class="bcs-badge">${item.bcs}</span></td>
            <td class="val-calc-large text-right">${item.chiso_cu !== undefined ? item.chiso_cu : '-'}</td>
            <td class="val-calc-large text-right" style="color: #0056b3;">${csMoiVal}</td>
            <td class="val-calc-large text-right" style="color: #28a745;">${sanLuongVal}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    currentIndex += CHUNK_SIZE;
    if (currentIndex < keys.length) {
      setTimeout(renderChunk, 0);
    }
  }

  renderChunk();
}

async function saveCheckedCMIS() {
  const updates = [];

  Object.keys(groupedData).forEach(makh => {
    const cust = groupedData[makh];
    const rowIndices = (cust.items || [])
      .map(item => item.rowIndex)
      .filter(idx => idx !== undefined);

    if (rowIndices.length > 0) {
      updates.push({
        ma_khang: makh,
        rowIndices: rowIndices,
        val: cust.nhap_cmis
      });
    }
  });

  if (updates.length === 0) {
    showToast("⚠️ Không có dữ liệu để cập nhật!");
    return;
  }

  const confirmSave = await showCustomConfirm(
    "XÁC NHẬN LƯU TRẠNG THÁI CMIS",
    "Bạn có chắc chắn muốn lưu lại trạng thái nhập CMIS cho tất cả danh sách hiện tại?"
  );

  if (!confirmSave) return;

  showToast(`⏳ Đang cập nhật trạng thái CMIS...`);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "UPDATE_NHAP_CMIS",
      ten_ndung: currentUser ? currentUser.ten_ndung : "",
      updates: updates
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      showToast("✅ Đã cập nhật trạng thái thành công!");
      renderGroupedList(groupedData);
      updateSummaryBar();
    } else {
      showToast("❌ Lỗi: " + (res.message || "Cập nhật thất bại"));
    }
  })
  .catch((err) => {
    console.error(err);
    showToast("❌ Lỗi kết nối máy chủ!");
  });
}

function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  
  if (!q) {
    document.querySelectorAll('.customer-card.active').forEach(card => card.classList.remove('active'));
    activeMaKhang = null;
    return;
  }

  let foundMaKhang = null;

  Object.keys(groupedData).forEach(makh => {
    if (foundMaKhang) return;

    const cust = groupedData[makh];
    const match = 
      String(cust.ma_khang || "").toLowerCase().includes(q) ||
      String(cust.ten_khang || "").toLowerCase().includes(q) ||
      String(cust.so_cto || "").toLowerCase().includes(q) ||
      String(cust.ma_sogcs || "").toLowerCase().includes(q) ||
      String(cust.danh_so || "").toLowerCase().includes(q);

    if (match) {
      foundMaKhang = makh;
    }
  });

  if (foundMaKhang) {
    selectCustomer(foundMaKhang);
    const targetCard = document.getElementById(`card_${foundMaKhang}`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function handleLogout() {
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal) logoutModal.style.display = 'flex';
}

function closeLogoutModal() {
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal) logoutModal.style.display = 'none';
}

function confirmLogout() {
  localStorage.removeItem("cmis_user_session");
  window.location.href = "login.html";
}
