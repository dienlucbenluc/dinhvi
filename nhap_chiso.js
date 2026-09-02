const API_URL = "https://script.google.com/macros/s/AKfycbyKaG42B8RFzHToMu2Gqk7y5mCQ4wqDxxB5NWftA5lOZdB_mrLkCy6GkVs7zyOgRrHd/exec";
let currentUser = null;
let groupedData = {};
let customerKeys = []; // Mã KH sắp xếp theo ma_sogcs -> danh_so -> ma_khang
let currentCardIndex = 0; 
let isAnimating = false; // Chống vuốt quá nhanh gây lỗi animation

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

  // Sắp xếp BCS
  Object.keys(groupedData).forEach(makh => {
    groupedData[makh].items.sort((a, b) => {
      let idxA = BCS_ORDER.indexOf(String(a.bcs).toUpperCase().trim());
      let idxB = BCS_ORDER.indexOf(String(b.bcs).toUpperCase().trim());
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  });

  // Sắp xếp danh sách KH: ma_sogcs -> danh_so -> ma_khang
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

function renderCurrentCustomerCard(slideDirection = null) {
  const container = document.getElementById("listContainer");

  if (customerKeys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold;'>Không tìm thấy dữ liệu khách hàng.</p>";
    return;
  }

  if (currentCardIndex < 0) currentCardIndex = customerKeys.length - 1;
  if (currentCardIndex >= customerKeys.length) currentCardIndex = 0;

  const makh = customerKeys[currentCardIndex];
  const cust = groupedData[makh];
  const firstItem = cust.items[0] || {};
  const cotTramText = [cust.so_cot, cust.ten_tram].filter(Boolean).join(" - ");

  // Giữ lại đường link Google Maps nếu khách hàng đã có sẵn tọa độ trong Sheet
  const hasLocation = Boolean(firstItem.lat && firstItem.lng);
  let mapLinkHtml = `<span id="map_link_${cust.ma_khang}" style="color:#dc3545; font-weight:bold;">🌏 Chưa vị trí</span>`;
  if (hasLocation) {
    mapLinkHtml = `<span id="map_link_${cust.ma_khang}"><a href="http://maps.google.com/?q=${firstItem.lat},${firstItem.lng}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps</a></span>`;
  }

  const alreadyHasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);

  // Class chuẩn bị cho Animation trượt
  let initialClass = "";
  if (slideDirection === "left") initialClass = "slide-left-in";
  else if (slideDirection === "right") initialClass = "slide-right-in";

  let html = `
    <div class="customer-card ${initialClass}" id="activeCustomerCard">
      <div class="cust-header">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:13px; color:#0056b3; font-weight:bold; background:#eef5fc; padding:2px 6px; border-radius:4px;">
            STT: ${currentCardIndex + 1} / ${customerKeys.length}
          </span>
          <span style="font-size:12px; color:#666;">⬅️ Vuốt để đổi KH ➡️</span>
        </div>
        <div class="cust-title">Mã KH: ${cust.ma_khang} - <b>Số CTơ:</b> ${cust.so_cto}</div>
        <div class="cust-tenKH">Tên KH: ${cust.ten_khang || ''}</div>
        <div class="cust-address" title="${cust.dia_chi || ''}"><b>Đ/C:</b> ${cust.dia_chi || ''}</div>
        <div class="cust-row-group">
         Mã sổ: ${cust.ma_sogcs} - Danh số: ${cust.danh_so || ''}
        </div>

        <div class="cust-row-group" style="margin-top: 4px;">
          Cột - Trạm: ${cotTramText || ''}
        </div>
        <div class="cust-dynamic-info-v3">
         Số ĐT: ${cust.so_dthoai || ''}  <span style="float: right;">${mapLinkHtml}</span>
        </div>
        <div class="cust-row-group" style="margin-top: 6px;">
          <input type="text" 
                 class="input-ghichu" 
                 id="ghi_chu_${cust.ma_khang}" 
                 value="${cust.ghi_chu || ''}" 
                 placeholder="Nhập ghi chú nếu có..." 
                 onchange="groupedData['${cust.ma_khang}'].ghi_chu = this.value;">
        </div>

        <div class="cust-dynamic-info-v2" id="detail_info_${cust.ma_khang}">
          <span>kW tháo <span id="bcs_thao_label_${cust.ma_khang}">(${firstItem.bcs})</span>: <b id="kw_thao_val_${cust.ma_khang}">${firstItem.sluong_thao || 0}</b></span>
          <span>kW kỳ trước <span id="bcs_label_${cust.ma_khang}">(${firstItem.bcs})</span>: <b id="kw_kt_val_${cust.ma_khang}">${firstItem.sluong_kt || 0}</b></span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="chiso-table">
          <thead>
            <tr>
              <th style="width: 15%;">BCS</th>
              <th style="width: 25%;">CS cũ</th>
              <th style="width: 35%;">CS mới</th>
              <th style="width: 25%;">Tổng kW</th>
            </tr>
          </thead>
          <tbody>
  `;

  cust.items.forEach(item => {
    const csMoiVal = (item.chiso_moi !== "" && item.chiso_moi !== undefined && item.chiso_moi !== null) ? item.chiso_moi : "";

    html += `
      <tr id="row_${item.rowIndex}">
        <td class="text-center" style="padding: 6px 2px;"><span class="bcs-badge">${item.bcs}</span></td>
        <td class="val-calc-large text-right">${item.chiso_cu}</td>
        <td>
          <input type="number" 
                 class="input-cs-moi" 
                 id="cs_moi_${item.rowIndex}" 
                 value="${csMoiVal}"
                 onfocus="updateKwKtDisplay('${cust.ma_khang}', '${item.bcs}', ${item.sluong_kt || 0}, ${item.sluong_thao || 0})"
                 onchange="calculateRow('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0}, ${item.sluong_kt || 0})">
          <input type="hidden" id="sl_val_${item.rowIndex}" value="${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '-'}">
        </td>
        <td id="tong_sl_${item.rowIndex}" class="val-calc-large text-right">${item.tong_sluong !== "" && item.tong_sluong !== undefined ? item.tong_sluong : '-'}</td>
      </tr>
    `;
  });

  const cancelDisabledAttr = !alreadyHasCS ? "disabled" : "";

  html += `
          </tbody>
        </table>
      </div>

      <div class="card-btn-group">
        <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" onclick="saveCustomerData('${cust.ma_khang}')">LƯU CS</button>
        <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${cancelDisabledAttr} onclick="cancelCustomerData('${cust.ma_khang}')">HỦY CS</button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  if (slideDirection) {
    const activeCard = document.getElementById("activeCustomerCard");
    setTimeout(() => {
      activeCard.classList.remove("slide-left-in", "slide-right-in");
      setTimeout(() => { isAnimating = false; }, 250);
    }, 20);
  } else {
    isAnimating = false;
  }
}

// Cập nhật cả kW kỳ trước & kW tháo đúng theo BCS khi focus/click vào ô nhập CS
function updateKwKtDisplay(maKhang, bcs, sluongKt, sluongThao) {
  const labelEl = document.getElementById(`bcs_label_${maKhang}`);
  const valEl = document.getElementById(`kw_kt_val_${maKhang}`);
  if (labelEl) labelEl.innerText = `(${bcs})`;
  if (valEl) valEl.innerText = sluongKt || 0;

  const labelThaoEl = document.getElementById(`bcs_thao_label_${maKhang}`);
  const valThaoEl = document.getElementById(`kw_thao_val_${maKhang}`);
  if (labelThaoEl) labelThaoEl.innerText = `(${bcs})`;
  if (valThaoEl) valThaoEl.innerText = sluongThao || 0;
}

function nextCustomer() {
  if (isAnimating) return;

  isAnimating = true;
  const activeCard = document.getElementById("activeCustomerCard");
  if (activeCard) {
    activeCard.classList.add("slide-left-out");
    setTimeout(() => {
      currentCardIndex = (currentCardIndex >= customerKeys.length - 1) ? 0 : currentCardIndex + 1;
      renderCurrentCustomerCard("left");
    }, 200);
  } else {
    currentCardIndex = (currentCardIndex >= customerKeys.length - 1) ? 0 : currentCardIndex + 1;
    renderCurrentCustomerCard();
  }
}

function prevCustomer() {
  if (isAnimating) return;

  isAnimating = true;
  const activeCard = document.getElementById("activeCustomerCard");
  if (activeCard) {
    activeCard.classList.add("slide-right-out");
    setTimeout(() => {
      currentCardIndex = (currentCardIndex <= 0) ? customerKeys.length - 1 : currentCardIndex - 1;
      renderCurrentCustomerCard("right");
    }, 200);
  } else {
    currentCardIndex = (currentCardIndex <= 0) ? customerKeys.length - 1 : currentCardIndex - 1;
    renderCurrentCustomerCard();
  }
}

function setupSwipeEvents() {
  const container = document.getElementById("listContainer");
  let startX = 0;
  let startY = 0;

  container.addEventListener('touchstart', (e) => {
    if (e.target.tagName === "INPUT") return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!startX || !startY || isAnimating) return;

    let endX = e.changedTouches[0].clientX;
    let endY = e.changedTouches[0].clientY;

    let diffX = startX - endX;
    let diffY = startY - endY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX > 0) {
        nextCustomer();
      } else {
        prevCustomer();
      }
    }
    startX = 0;
    startY = 0;
  }, { passive: true });
}

async function calculateRow(maKhang, bcs, rowIndex, csCu, hsn, sluongThao, sluongKt) {
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

  if (csMoi < csCuVal) {
    await showCustomConfirm(
      "⚠️ CẢNH BÁO CHỈ SỐ LỖI", 
      `Chỉ số mới (${csMoi}) nhỏ hơn chỉ số cũ (${csCuVal})!\nVui lòng kiểm tra và nhập lại.`, 
      true
    );
    inputEl.value = "";
    if (slHiddenEl) slHiddenEl.value = "-";
    if (tongSlCell) tongSlCell.innerText = "-";
    checkCancelButtonStatus(maKhang);
    setTimeout(() => inputEl.focus(), 100);
    return;
  }

  const sanLuong = Math.round((csMoi - csCuVal) * hsnVal);
  const tongSluong = sanLuong + slThao;

  if (slHiddenEl) slHiddenEl.value = sanLuong;
  if (tongSlCell) tongSlCell.innerText = tongSluong;

  const sluongKtVal = Number(sluongKt) || 0;
  if (sluongKtVal > 0) {
    const diffPercent = ((tongSluong - sluongKtVal) / sluongKtVal) * 100;
    if (diffPercent > 50 || diffPercent < -50) {
      const phanTramText = diffPercent > 0 ? `tăng +${diffPercent.toFixed(1)}%` : `giảm ${diffPercent.toFixed(1)}%`;
      
      const confirmAlert = await showCustomConfirm(
        "⚠️ CẢNH BÁO BẤT THƯỜNG", 
        `Tổng sản lượng BCS (${bcs}) kỳ này (${tongSluong} kW) ${phanTramText} so với kỳ trước (${sluongKtVal} kW).\n\nBạn có xác nhận lưu chỉ số này không?`, 
        true
      );

      if (confirmAlert) {
        saveCustomerData(maKhang, true);
        return;
      } else {
        checkCancelButtonStatus(maKhang);
        return;
      }
    }
  }

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

// Bấm nút Tìm / Enter mới tìm và CHỈ DỜI CON TRỎ đến vị trí khách hàng đó (danh sách không thay đổi)
function filterData() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!q) return;

  const targetIndex = customerKeys.findIndex(makh => {
    const cust = groupedData[makh];
    return (
      String(cust.ma_khang || "").toLowerCase().includes(q) ||
      String(cust.ten_khang || "").toLowerCase().includes(q) ||
      String(cust.dia_chi || "").toLowerCase().includes(q) ||
      String(cust.so_cot || "").toLowerCase().includes(q) ||
      String(cust.ten_tram || "").toLowerCase().includes(q) ||
      String(cust.so_cto || "").toLowerCase().includes(q) ||
      String(cust.ma_sogcs || "").toLowerCase().includes(q) ||
      String(cust.danh_so || "").toLowerCase().includes(q) ||
      String(cust.so_dthoai || "").toLowerCase().includes(q) ||
      String(cust.ghi_chu || "").toLowerCase().includes(q)
    );
  });

  if (targetIndex !== -1) {
    currentCardIndex = targetIndex;
    renderCurrentCustomerCard();
    showToast(`📍 Đến KH: ${groupedData[customerKeys[targetIndex]].ten_khang || customerKeys[targetIndex]}`);
  } else {
    showToast("❌ Không tìm thấy khách hàng phù hợp!");
  }
}

async function saveCustomerData(maKhang, skipConfirm = false) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  let emptyItem = null;
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    const val = inputEl ? inputEl.value.trim() : "";
    if (!emptyItem && (val === "" || isNaN(Number(val)))) {
      emptyItem = { item, inputEl };
    }
  });

  if (emptyItem) {
    await showCustomConfirm(
      "⚠️ CHƯA NHẬP CHỈ SỐ", 
      `Chưa nhập đầy đủ chỉ số mới cho BCS (${emptyItem.item.bcs})!\nVui lòng kiểm tra lại trước khi lưu.`, 
      true
    );
    if (emptyItem.inputEl) {
      setTimeout(() => emptyItem.inputEl.focus(), 100);
    }
    return;
  }

  const ghiChuInput = document.getElementById(`ghi_chu_${maKhang}`);
  const newGhiChu = ghiChuInput ? ghiChuInput.value.trim() : (cust.ghi_chu || "");

  if (!skipConfirm) {
    const confirmSave = await showCustomConfirm("XÁC NHẬN GHI DỮ LIỆU", "Lưu chỉ số và ghi chú cho khách hàng này?");
    if (!confirmSave) return;
  }

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
        lat: item.lat || "",
        lng: item.lng || ""
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
      setTimeout(() => nextCustomer(), 400);
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
