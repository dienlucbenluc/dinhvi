const API_URL = "https://script.google.com/macros/s/AKfycbyKaG42B8RFzHToMu2Gqk7y5mCQ4wqDxxB5NWftA5lOZdB_mrLkCy6GkVs7zyOgRrHd/exec";
let currentUser = null;
let groupedData = {};
let customerKeys = []; // Danh sách mã KH theo thứ tự ma_sogcs -> danh_so -> ma_khang
let currentCardIndex = 0; // Vị trí KH đang hiển thị
let currentLocations = {};

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

document.addEventListener("DOMContentLoaded", () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);
  document.getElementById("userDisplay").innerText = `👷 ${currentUser.ten_nvien || currentUser.ten_ndung}`;
  
  loadChiSoData();
  setupSwipeEvents();
});

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = "none"; }, 3500);
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

    btnConfirm.onclick = () => { modal.style.display = "none"; resolve(true); };
    btnCancel.onclick = () => { modal.style.display = "none"; resolve(false); };
  });
}

function getClientCacheKey() {
  return "cmis_chiso_cache_" + String(currentUser?.ten_ndung || "").trim().toLowerCase();
}

function loadChiSoData() {
  let cachedList = null;
  try {
    const raw = localStorage.getItem(getClientCacheKey());
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.list) && obj.list.length > 0) {
        cachedList = obj.list;
        groupAndRender(cachedList);
      }
    }
  } catch (e) {}

  if (currentUser && currentUser.ten_ndung) {
    fetchSilentLatestData(currentUser.ten_ndung, !cachedList);
  }
}

function fetchSilentLatestData(username, isFirstLoad = false) {
  const targetUser = username || currentUser?.ten_ndung;
  if (!targetUser) return;

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "GET_CHISO_DATA", ten_ndung: targetUser })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      localStorage.setItem(getClientCacheKey(), JSON.stringify({ time: Date.now(), list: res.list }));
      groupAndRender(res.list);
    } else if (isFirstLoad) {
      document.getElementById("listContainer").innerHTML = `<p style='color:red; text-align:center;'>❌ ${res.message || 'Lỗi tải dữ liệu!'}</p>`;
    }
  })
  .catch(() => {
    if (isFirstLoad) {
      document.getElementById("listContainer").innerHTML = "<p style='color:red; text-align:center;'>❌ Lỗi kết nối máy chủ!</p>";
    }
  });
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
        ma_sogcs: item.ma_sogcs || "",
        danh_so: item.danh_so || "",
        so_cot: item.so_cot,
        ten_tram: item.ten_tram,
        so_cto: item.so_cto,
        so_dthoai: item.so_dthoai || "",
        ghi_chu: item.ghi_chu || "",
        items: []
      };
    }
    groupedData[makh].items.push(item);
  });

  // 1. Sắp xếp thứ tự BCS
  Object.keys(groupedData).forEach(makh => {
    groupedData[makh].items.sort((a, b) => {
      let idxA = BCS_ORDER.indexOf(String(a.bcs).toUpperCase().trim());
      let idxB = BCS_ORDER.indexOf(String(b.bcs).toUpperCase().trim());
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  });

  // 2. Sắp xếp danh sách KH theo: ma_sogcs -> danh_so -> ma_khang
  customerKeys = Object.keys(groupedData).sort((a, b) => {
    const custA = groupedData[a];
    const custB = groupedData[b];

    const sogcsCompare = String(custA.ma_sogcs).localeCompare(String(custB.ma_sogcs), undefined, { numeric: true, sensitivity: 'base' });
    if (sogcsCompare !== 0) return sogcsCompare;

    const danhSoCompare = String(custA.danh_so).localeCompare(String(custB.danh_so), undefined, { numeric: true, sensitivity: 'base' });
    if (danhSoCompare !== 0) return danhSoCompare;

    return String(custA.ma_khang).localeCompare(String(custB.ma_khang), undefined, { numeric: true, sensitivity: 'base' });
  });

  updateSummaryBar();
  renderCurrentCustomerCard();
}

function updateSummaryBar() {
  const tongKh = customerKeys.length;
  let daCoCS = 0;

  customerKeys.forEach(makh => {
    const hasCS = groupedData[makh].items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (hasCS) daCoCS++;
  });

  document.getElementById("sumTongKh").innerText = tongKh;
  document.getElementById("sumDaCS").innerText = daCoCS;
  document.getElementById("sumChuaGhi").innerText = tongKh - daCoCS;
}

// Render duy nhất Card của KH hiện tại
function renderCurrentCustomerCard() {
  const container = document.getElementById("listContainer");

  if (customerKeys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold;'>Không tìm thấy dữ liệu khách hàng.</p>";
    return;
  }

  if (currentCardIndex < 0) currentCardIndex = 0;
  if (currentCardIndex >= customerKeys.length) currentCardIndex = customerKeys.length - 1;

  const makh = customerKeys[currentCardIndex];
  const cust = groupedData[makh];
  const firstItem = cust.items[0] || {};
  const cotTramText = [cust.so_cot, cust.ten_tram].filter(Boolean).join(" - ");
  const hasLocation = Boolean(firstItem.lat && firstItem.lng);

  let mapLinkHtml = `<span id="map_link_${cust.ma_khang}" style="color:#dc3545; font-weight:bold;">🌏 Chưa vị trí</span>`;
  let btnLocationText = "📍 LẤY VỊ TRÍ";
  if (hasLocation) {
    mapLinkHtml = `<span id="map_link_${cust.ma_khang}"><a href="http://maps.google.com/?q=${firstItem.lat},${firstItem.lng}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps</a></span>`;
    btnLocationText = "📍 SỬA VỊ TRÍ";
  }

  const alreadyHasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);

  let html = `
    <div class="customer-card" id="activeCustomerCard">
      <div class="cust-header">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:13px; color:#0056b3; font-weight:bold; background:#eef5fc; padding:2px 8px; border-radius:4px;">
            STT: ${currentCardIndex + 1} / ${customerKeys.length}
          </span>
          <span style="font-size:12px; color:#777; font-style:italic;">👈 Vuốt ngang để đổi KH 👉</span>
        </div>
        <div class="cust-title">${cust.ma_khang} - ${cust.ten_khang}</div>
        <div class="cust-address"><b>Đ/C:</b> ${cust.dia_chi || ''}</div>
        
        <div class="cust-row-group">
          <b>Sổ:</b> ${cust.ma_sogcs} | <b>DS:</b> ${cust.danh_so} | <b>ST:</b> ${cust.so_cto} | <b>ĐT:</b> ${cust.so_dthoai || 'N/A'}
        </div>

        <div class="cust-row-group" style="margin-top: 4px;">
          <b>Cột - Trạm:</b> ${cotTramText || 'N/A'}
        </div>

        <div class="cust-row-group" style="margin-top: 6px;">
          <b style="color:#000;">Ghi chú:</b>
          <input type="text" 
                 class="input-ghichu" 
                 id="ghi_chu_${cust.ma_khang}" 
                 value="${cust.ghi_chu || ''}" 
                 placeholder="Nhập ghi chú nếu có..." 
                 onchange="groupedData['${cust.ma_khang}'].ghi_chu = this.value;">
        </div>

        <div class="cust-dynamic-info-v2" id="detail_info_${cust.ma_khang}">
          <span>${mapLinkHtml}</span>
          <span>SL Tháo(${firstItem.bcs}): <b>${firstItem.sluong_thao || 0}</b></span>
          <span>SL KT: <b>${firstItem.sluong_kt || 0}</b></span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="chiso-table">
          <thead>
            <tr>
              <th style="width: 15%;">BCS</th>
              <th style="width: 25%;">CS cũ</th>
              <th style="width: 35%;">CS mới</th>
              <th style="width: 25%;">Tổng SL</th>
            </tr>
          </thead>
          <tbody>
  `;

  cust.items.forEach(item => {
    const csMoiVal = (item.chiso_moi !== "" && item.chiso_moi !== undefined && item.chiso_moi !== null) ? item.chiso_moi : "";
    const isDisabled = !hasLocation ? "disabled" : "";

    html += `
      <tr id="row_${item.rowIndex}">
        <td class="text-center" style="padding: 6px 2px;"><span class="bcs-badge">${item.bcs}</span></td>
        <td class="val-calc-large text-right">${item.chiso_cu}</td>
        <td>
          <input type="number" 
                 class="input-cs-moi" 
                 id="cs_moi_${item.rowIndex}" 
                 value="${csMoiVal}" ${isDisabled}
                 oninput="calculateRow('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0})">
          <input type="hidden" id="sl_val_${item.rowIndex}" value="${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '-'}">
        </td>
        <td id="tong_sl_${item.rowIndex}" class="val-calc-large text-right">${item.tong_sluong !== "" && item.tong_sluong !== undefined ? item.tong_sluong : '-'}</td>
      </tr>
    `;
  });

  const saveDisabledAttr = !hasLocation ? "disabled" : "";
  const cancelDisabledAttr = !alreadyHasCS ? "disabled" : "";

  html += `
          </tbody>
        </table>
      </div>

      <div class="card-btn-group">
        <button class="btn-card btn-card-location" onclick="getLocation('${cust.ma_khang}')">${btnLocationText}</button>
        <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" ${saveDisabledAttr} onclick="saveCustomerData('${cust.ma_khang}')">LƯU CS</button>
        <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${cancelDisabledAttr} onclick="cancelCustomerData('${cust.ma_khang}')">HỦY CS</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Xử lý Sự kiện Vuốt Kéo (Swipe Physics) có hiệu ứng chuyển động Box
function setupSwipeEvents() {
  const container = document.getElementById("listContainer");
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isDragging = false;

  container.addEventListener('touchstart', (e) => {
    // Không nhận swipe nếu bấm vào các ô nhập liệu
    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
    const card = document.getElementById("activeCustomerCard");
    if (!card) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    isDragging = true;
    
    // Tắt transition hiệu ứng khi tay đang kéo trực tiếp
    card.style.transition = "none";
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const card = document.getElementById("activeCustomerCard");
    if (!card) return;

    currentX = e.touches[0].clientX;
    let diffX = currentX - startX;
    let diffY = e.touches[0].clientY - startY;

    // Ưu tiên chuyển động nếu vuốt ngang nhiều hơn vuốt dọc
    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Dịch chuyển Box theo ngón tay và xoay nhẹ tạo hiệu ứng sinh động
      card.style.transform = `translateX(${diffX}px) rotate(${diffX * 0.03}deg)`;
      card.style.opacity = `${1 - Math.abs(diffX) / 500}`;
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const card = document.getElementById("activeCustomerCard");
    if (!card) return;

    let diffX = currentX - startX;
    
    // Bật hiệu ứng transition mượt cho chuyển động nhả tay
    card.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";

    if (diffX < -80) {
      // Vuốt sang trái (Kéo Box sang bên trái -> Chuyển đến KH tiếp theo)
      if (currentCardIndex < customerKeys.length - 1) {
        card.style.transform = "translateX(-120%) rotate(-10deg)";
        card.style.opacity = "0";
        setTimeout(() => {
          currentCardIndex++;
          renderCurrentCustomerCard();
        }, 200);
      } else {
        // Nảy lại vị trí cũ nếu ở KH cuối
        card.style.transform = "translateX(0) rotate(0deg)";
        card.style.opacity = "1";
        showToast("ℹ️ Đã đến khách hàng cuối cùng");
      }
    } else if (diffX > 80) {
      // Vuốt sang phải (Kéo Box sang bên phải -> Quay lại KH trước)
      if (currentCardIndex > 0) {
        card.style.transform = "translateX(120%) rotate(10deg)";
        card.style.opacity = "0";
        setTimeout(() => {
          currentCardIndex--;
          renderCurrentCustomerCard();
        }, 200);
      } else {
        // Nảy lại vị trí cũ nếu ở KH đầu tiên
        card.style.transform = "translateX(0) rotate(0deg)";
        card.style.opacity = "1";
        showToast("ℹ️ Đang ở khách hàng đầu tiên");
      }
    } else {
      // Khoảng cách vuốt chưa đủ -> Bật nảy về lại vị trí giữa
      card.style.transform = "translateX(0) rotate(0deg)";
      card.style.opacity = "1";
    }

    startX = 0;
    startY = 0;
    currentX = 0;
  }, { passive: true });
}

function calculateRow(maKhang, bcs, rowIndex, csCu, hsn, sluongThao) {
  const inputEl = document.getElementById(`cs_moi_${rowIndex}`);
  const val = inputEl ? inputEl.value.trim() : "";

  const slHiddenEl = document.getElementById(`sl_val_${rowIndex}`);
  const tongSlCell = document.getElementById(`tong_sl_${rowIndex}`);

  if (val === "" || isNaN(Number(val))) {
    if (slHiddenEl) slHiddenEl.value = "-";
    if (tongSlCell) tongSlCell.innerText = "-";
    checkCancelButtonStatus(maKhang);
    return;
  }

  const csMoi = Number(val);
  const csCuVal = Number(csCu) || 0;
  const hsnVal = Number(hsn) || 1;
  const slThao = Number(sluongThao) || 0;

  const sanLuong = Math.round((csMoi - csCuVal) * hsnVal);
  const tongSluong = sanLuong + slThao;

  if (slHiddenEl) slHiddenEl.value = sanLuong;
  if (tongSlCell) tongSlCell.innerText = tongSluong;

  checkCancelButtonStatus(maKhang);
}

function checkCancelButtonStatus(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  let hasNewCS = false;
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    if (inputEl && inputEl.value !== "") hasNewCS = true;
  });

  const btnCancel = document.getElementById(`btn_cancel_${maKhang}`);
  if (btnCancel) btnCancel.disabled = !hasNewCS;
}

function filterChuaGhi() {
  document.getElementById("searchInput").value = "";
  const unrecordedKeys = [];

  customerKeys.forEach(makh => {
    const cust = groupedData[makh];
    const hasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (!hasCS) unrecordedKeys.push(makh);
  });

  if (unrecordedKeys.length > 0) {
    customerKeys = unrecordedKeys;
    currentCardIndex = 0;
    renderCurrentCustomerCard();
  } else {
    showToast("🎉 Tất cả khách hàng đã được ghi!");
  }
}

function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  
  if (!q) {
    loadChiSoData();
    return;
  }

  const filtered = [];
  Object.keys(groupedData).forEach(makh => {
    const cust = groupedData[makh];
    const match = 
      String(cust.ma_khang || "").toLowerCase().includes(q) ||
      String(cust.ten_khang || "").toLowerCase().includes(q) ||
      String(cust.dia_chi || "").toLowerCase().includes(q) ||
      String(cust.so_cot || "").toLowerCase().includes(q) ||
      String(cust.ten_tram || "").toLowerCase().includes(q) ||
      String(cust.so_cto || "").toLowerCase().includes(q) ||
      String(cust.ma_sogcs || "").toLowerCase().includes(q) ||
      String(cust.danh_so || "").toLowerCase().includes(q) ||
      String(cust.so_dthoai || "").toLowerCase().includes(q) ||
      String(cust.ghi_chu || "").toLowerCase().includes(q);

    if (match) filtered.push(makh);
  });

  customerKeys = filtered;
  currentCardIndex = 0;
  renderCurrentCustomerCard();
}

async function getLocation(maKhang) {
  const cust = groupedData[maKhang];
  const firstItem = cust ? cust.items[0] : {};

  if (firstItem.lat && firstItem.lng) {
    const confirmAgain = await showCustomConfirm("LẤY VỊ TRÍ", `Tọa độ cũ đã có. Bạn có muốn cập nhật lại vị trí mới cho KH ${maKhang}?`);
    if (!confirmAgain) return;
  }

  if (navigator.geolocation) {
    showToast(`⏳ Đang lấy vị trí GPS...`);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        currentLocations[maKhang] = { lat, lng };

        const currentGhiChu = document.getElementById(`ghi_chu_${maKhang}`) ? document.getElementById(`ghi_chu_${maKhang}`).value : cust.ghi_chu;

        const payload = cust.items.map(item => ({
          rowIndex: item.rowIndex,
          chiso_cu: item.chiso_cu,
          chiso_moi: "",
          ghi_chu: currentGhiChu,
          lat: lat,
          lng: lng
        }));

        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "SAVE_CHISO",
            ten_ndung: currentUser.ten_ndung,
            ten_nvien: currentUser.ten_nvien,
            items: payload
          })
        })
        .then(res => res.json())
        .then(res => {
          if (res.status === "success") {
            showToast("📍 Lấy & lưu tọa độ thành công!");
            cust.items.forEach(it => { it.lat = lat; it.lng = lng; });
            renderCurrentCustomerCard();
          } else {
            showToast("❌ Lỗi lưu định vị: " + res.message);
          }
        })
        .catch(() => showToast("❌ Lỗi kết nối máy chủ!"));
      },
      () => showToast("❌ Không thể lấy GPS! Hãy bật vị trí thiết bị."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    showToast("❌ Thiết bị không hỗ trợ GPS!");
  }
}

async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const ghiChuInput = document.getElementById(`ghi_chu_${maKhang}`);
  const newGhiChu = ghiChuInput ? ghiChuInput.value.trim() : (cust.ghi_chu || "");

  const confirmSave = await showCustomConfirm("XÁC NHẬN GHI DỮ LIỆU", "Lưu chỉ số và ghi chú cho khách hàng này?");
  if (!confirmSave) return;

  const loc = currentLocations[maKhang] || {};
  const payload = [];

  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    if (inputEl) {
      payload.push({
        rowIndex: item.rowIndex,
        chiso_cu: item.chiso_cu,
        chiso_moi: inputEl.value !== "" ? Number(inputEl.value) : "",
        ghi_chu: newGhiChu,
        hsn: item.hsn,
        sluong_thao: item.sluong_thao,
        sluong_kt: item.sluong_kt,
        lat: loc.lat || item.lat || "",
        lng: loc.lng || item.lng || ""
      });
    }
  });

  showToast(`⏳ Đang lưu dữ liệu...`);
  
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "SAVE_CHISO",
      ten_ndung: currentUser.ten_ndung,
      ten_nvien: currentUser.ten_nvien,
      items: payload
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      showToast("✅ " + res.message);
      cust.ghi_chu = newGhiChu;
      cust.items.forEach(item => {
        const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
        if (inputEl && inputEl.value !== "") {
          item.chiso_moi = Number(inputEl.value);
          item.san_luong = document.getElementById(`sl_val_${item.rowIndex}`).value;
          item.tong_sluong = document.getElementById(`tong_sl_${item.rowIndex}`).innerText;
        }
      });

      updateSummaryBar();
      // Tự động vuốt sang KH tiếp theo sau khi lưu
      if (currentCardIndex < customerKeys.length - 1) {
        const card = document.getElementById("activeCustomerCard");
        if (card) {
          card.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
          card.style.transform = "translateX(-120%) rotate(-10deg)";
          card.style.opacity = "0";
        }
        setTimeout(() => {
          currentCardIndex++;
          renderCurrentCustomerCard();
        }, 220);
      }
    } else {
      showToast("❌ " + res.message);
    }
  })
  .catch(() => showToast("❌ Lỗi kết nối hệ thống khi lưu!"));
}

async function cancelCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const confirmCancel = await showCustomConfirm("HỦY CHỈ SỐ", `Xác nhận HỦY chỉ số đã nhập của KH ${maKhang}?`, true);
  if (!confirmCancel) return;

  const rowIndices = cust.items.map(item => item.rowIndex);

  showToast(`⏳ Đang hủy chỉ số...`);
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "CANCEL_CHISO",
      ten_ndung: currentUser.ten_ndung,
      rowIndices: rowIndices
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      showToast("✅ " + res.message);

      cust.items.forEach(item => {
        item.chiso_moi = "";
        item.san_luong = "-";
        item.tong_sluong = "-";
      });

      updateSummaryBar();
      renderCurrentCustomerCard();
    } else {
      showToast("❌ " + res.message);
    }
  })
  .catch(() => showToast("❌ Lỗi kết nối khi hủy!"));
}
