const API_URL = "https://script.google.com/macros/s/AKfycbxJZHenN4zoxZR7wOk4SiBnUx071LKLdAWOdJLToJPScSdBIj8Qn_pOeTDAABlN_UAF/exec";
let currentUser = null;
let groupedData = {};
let activeMaKhang = null;
let currentLocations = {};

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

document.addEventListener("DOMContentLoaded", () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);
  document.getElementById("userDisplay").innerText = `👷 ${currentUser.ten_nvien || currentUser.ten_ndung}`;
  
  loadChiSoData();
});

function toggleMenu(e) {
  e.stopPropagation();
  document.getElementById("menuDropdown").classList.toggle("show");
}

document.addEventListener("click", () => {
  const menu = document.getElementById("menuDropdown");
  if (menu && menu.classList.contains("show")) menu.classList.remove("show");
});

function goToHome() { window.location.href = "home.html"; }

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
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
  document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px;'>⏳ Đang tải dữ liệu...</p>";
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "GET_CHISO_DATA", ten_ndung: currentUser.ten_ndung })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      groupAndRender(res.list);
    } else {
      document.getElementById("listContainer").innerHTML = "<p style='color:red; text-align:center;'>Lỗi: " + res.message + "</p>";
    }
  })
  .catch(() => {
    document.getElementById("listContainer").innerHTML = "<p style='color:red; text-align:center;'>Lỗi kết nối máy chủ!</p>";
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
        ma_sogcs: item.ma_sogcs,
        danh_so: item.danh_so,
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
  let daCoCS = 0;

  keys.forEach(makh => {
    const hasCS = groupedData[makh].items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (hasCS) daCoCS++;
  });

  const chuaGhi = tongKh - daCoCS;

  document.getElementById("sumTongKh").innerText = tongKh;
  document.getElementById("sumDaCS").innerText = daCoCS;
  document.getElementById("sumChuaGhi").innerText = chuaGhi;
}

function filterChuaGhi() {
  document.getElementById("searchInput").value = "";
  const filteredGroups = {};

  Object.keys(groupedData).forEach(makh => {
    const cust = groupedData[makh];
    const hasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (!hasCS) {
      filteredGroups[makh] = cust;
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

function updateRowDetail(maKhang, bcs, sanLuong, sluongThao, sluongKt) {
  selectCustomer(maKhang);
  const detailEl = document.getElementById(`detail_info_${maKhang}`);
  if (detailEl) {
    const mapSpan = document.getElementById(`map_link_${maKhang}`);
    const mapHtml = mapSpan ? mapSpan.outerHTML : '';
    detailEl.innerHTML = `
      <span>${mapHtml}</span>
      <span>SL Tháo(<b>${bcs}</b>): <b>${sluongThao}</b></span>
      <span>SL KT: <b>${sluongKt}</b></span>
    `;
  }
}

// TỐI ƯU HÀM RENDER DÙNG CHUNK RENDERING
function renderGroupedList(groups) {
  const container = document.getElementById("listContainer");
  const keys = Object.keys(groups);

  if (keys.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px;'>Không có dữ liệu khách hàng.</p>";
    return;
  }

  container.innerHTML = "";
  
  const CHUNK_SIZE = 30; // Render trước 30 khách hàng để hiện ngay màn hình
  let currentIndex = 0;

  function renderChunk() {
    const nextKeys = keys.slice(currentIndex, currentIndex + CHUNK_SIZE);
    if (nextKeys.length === 0) return;

    let html = "";
    nextKeys.forEach(makh => {
      const cust = groups[makh];
      const isActive = (makh === activeMaKhang) ? "active" : "";
      const firstItem = cust.items[0] || {};
      const cotTramText = [cust.so_cot, cust.ten_tram].filter(Boolean).join(" - ");
      const hasLocation = Boolean(firstItem.lat && firstItem.lng);
      
      let mapLinkHtml = `<span id="map_link_${cust.ma_khang}" style="color:#dc3545; font-weight:bold;">🌏 Chưa có tọa độ</span>`;
      let btnLocationText = "LẤY ĐỊNH VỊ";
      if (hasLocation) {
        mapLinkHtml = `<span id="map_link_${cust.ma_khang}"><a href="https://www.google.com/maps?q=${firstItem.lat},${firstItem.lng}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps</a></span>`;
        btnLocationText = "SỬA ĐỊNH VỊ";
      }

      const alreadyHasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);

      html += `
        <div class="customer-card ${isActive}" id="card_${cust.ma_khang}" onclick="selectCustomer('${cust.ma_khang}')">
          <div class="cust-header">
            <div class="cust-title">${cust.ma_khang} - ${cust.ten_khang}</div>
            <div class="cust-address">Địa chỉ: ${cust.dia_chi || ''}</div>
            
            <div class="cust-row-group">
              <span style="width: 100%; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Sổ:<b>${cust.ma_sogcs || ''}</b>  DS:<b>${cust.danh_so || ''}</b>  NO:<b>${cust.so_cto || ''}</b>  ĐT:<b>${cust.so_dthoai || ''}</b>
              </span>
            </div>

            <div class="cust-row-group">
              <span class="flex-1">Cột-Trạm: <b>${cotTramText || ''}</b></span>
            </div>

            <div class="cust-row-group" style="margin-top: 3px;">
              <span style="padding-left:0; color:#000; min-width:55px;">Ghi chú:</span>
              <input type="text" 
                     class="input-ghichu" 
                     id="ghi_chu_${cust.ma_khang}" 
                     value="${cust.ghi_chu || ''}" 
                     placeholder="Nhập, sửa ghi chú nếu có..." 
                     style="font-style: italic; font-weight: normal;"
                     onclick="event.stopPropagation(); selectCustomer('${cust.ma_khang}');"
                     onchange="groupedData['${cust.ma_khang}'].ghi_chu = this.value;">
            </div>

            <div class="cust-dynamic-info-v2" id="detail_info_${cust.ma_khang}">
              <span>${mapLinkHtml}</span>
              <span>SL Tháo(<b>${firstItem.bcs}</b>): <b>${firstItem.sluong_thao || 0}</b></span>
              <span>SL KT: <b>${firstItem.sluong_kt || 0}</b></span>
            </div>
          </div>

          <div class="table-responsive">
            <table class="chiso-table">
              <thead>
                <tr>
                  <th style="width: 12%;">BCS</th>
                  <th style="width: 18%;">CS cũ</th>
                  <th style="width: 26%;">CS mới</th>
                  <th style="width: 18%;">Tổng SL</th>
                  <th style="width: 13%;">C.Lệch</th>
                  <th style="width: 13%;">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
      `;

      cust.items.forEach(item => {
        const csMoiVal = (item.chiso_moi !== "" && item.chiso_moi !== undefined && item.chiso_moi !== null) ? item.chiso_moi : "";
        const isDisabled = !hasLocation ? "disabled" : "";

        html += `
          <tr id="row_${item.rowIndex}" onclick="event.stopPropagation(); updateRowDetail('${cust.ma_khang}', '${item.bcs}', document.getElementById('sl_val_${item.rowIndex}').value, ${item.sluong_thao}, ${item.sluong_kt});">
            <td class="text-center" style="padding: 4px 2px;"><span class="bcs-badge">${item.bcs}</span></td>
            <td class="val-calc-large text-right">${item.chiso_cu}</td>
            <td class="td-input-container">
              <input type="number" 
                     class="input-cs-moi" 
                     id="cs_moi_${item.rowIndex}" 
                     value="${csMoiVal}" ${isDisabled}
                     onclick="event.stopPropagation(); updateRowDetail('${cust.ma_khang}', '${item.bcs}', document.getElementById('sl_val_${item.rowIndex}').value, ${item.sluong_thao}, ${item.sluong_kt});"
                     oninput="calculateRow('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0}, ${item.sluong_kt || 0})"
              <input type="hidden" id="sl_val_${item.rowIndex}" value="${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '-'}">
            </td>
            <td id="tong_sl_${item.rowIndex}" class="val-calc-large text-right">${item.tong_sluong !== "" && item.tong_sluong !== undefined ? item.tong_sluong : '-'}</td>
            <td id="clech_${item.rowIndex}" class="val-highlight text-right">${item.chenh_lech !== "" && item.chenh_lech !== undefined ? item.chenh_lech : '-'}</td>
            <td id="tyle_${item.rowIndex}" class="val-highlight text-right">${item.tyle_clech !== "" && item.tyle_clech !== undefined ? item.tyle_clech : '-'}</td>
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
            <button class="btn-card btn-card-location" onclick="event.stopPropagation(); getLocation('${cust.ma_khang}')">${btnLocationText}</button>
            <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" ${saveDisabledAttr} onclick="event.stopPropagation(); saveCustomerData('${cust.ma_khang}')">LƯU</button>
            <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${cancelDisabledAttr} onclick="event.stopPropagation(); cancelCustomerData('${cust.ma_khang}')">HỦY</button>
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
      setTimeout(renderChunk, 0); // Đưa công việc tiếp theo vào Event Loop để không khóa UI
    }
  }

  renderChunk();
}

async function getLocation(maKhang) {
  selectCustomer(maKhang);
  const cust = groupedData[maKhang];
  const firstItem = cust ? cust.items[0] : {};

  const hasCoords = (firstItem && firstItem.lat && firstItem.lng) || currentLocations[maKhang];

  if (hasCoords) {
    const confirmAgain = await showCustomConfirm("LẤY TỌA ĐỘ GPS", `Bạn có muốn lấy lại tọa độ mới cho mã khách hàng ${maKhang} này không?`);
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
          lng: lng,
          nhap_cmis: 0
        }));

        showToast(`⏳ Đang lưu tọa độ GPS...`);
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
            showToast("📍 Đã lấy & lưu tọa độ thành công!");
            
            cust.items.forEach(it => { it.lat = lat; it.lng = lng; });
            enableInputsAndSaveBtn(maKhang);
            
            const mapSpan = document.getElementById(`map_link_${maKhang}`);
            if (mapSpan) {
              mapSpan.innerHTML = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps</a>`;
            }
          } else {
            showToast("❌ Lỗi lưu định vị: " + res.message);
          }
        })
        .catch(() => showToast("❌ Lỗi kết nối máy chủ!"));
      },
      (error) => { showToast("❌ Không thể lấy GPS! Bật vị trí thiết bị."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    showToast("❌ Thiết bị không hỗ trợ GPS!");
  }
}

function enableInputsAndSaveBtn(maKhang) {
  const card = document.getElementById(`card_${maKhang}`);
  if (!card) return;

  card.querySelectorAll('.input-cs-moi').forEach(input => input.disabled = false);
  
  const btnSave = document.getElementById(`btn_save_${maKhang}`);
  if (btnSave) btnSave.disabled = false;
}

function checkCancelButtonStatus(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  let hasNewCS = false;
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    if (inputEl && inputEl.value !== "") {
      hasNewCS = true;
    }
  });

  const btnCancel = document.getElementById(`btn_cancel_${maKhang}`);
  if (btnCancel) {
    btnCancel.disabled = !hasNewCS;
  }
}

function calculateRow(maKhang, bcs, rowIndex, csCu, hsn, sluongThao, sluongKt) {
  const inputEl = document.getElementById(`cs_moi_${rowIndex}`);
  const val = inputEl ? inputEl.value.trim() : "";

  const slHiddenEl = document.getElementById(`sl_val_${rowIndex}`);
  const tongSlCell = document.getElementById(`tong_sl_${rowIndex}`);
  const clechCell = document.getElementById(`clech_${rowIndex}`);
  const tyleCell = document.getElementById(`tyle_${rowIndex}`);

  // 1. Kiểm tra nếu rỗng hoặc không phải số hợp lệ
  if (val === "" || isNaN(Number(val))) {
    if (slHiddenEl) slHiddenEl.value = "-";
    if (tongSlCell) tongSlCell.innerText = "-";
    if (clechCell) clechCell.innerText = "-";
    if (tyleCell) tyleCell.innerText = "-";
    updateRowDetail(maKhang, bcs, "-", sluongThao, sluongKt);
    checkCancelButtonStatus(maKhang);
    return;
  }

  // 2. Ép kiểu an toàn
  const csMoi = Number(val);
  const csCuVal = Number(csCu) || 0;
  const hsnVal = Number(hsn) || 1;
  const slThao = Number(sluongThao) || 0;
  const slKt = Number(sluongKt) || 0;

  // 3. Tính toán sản lượng
  const sanLuong = Math.round((csMoi - csCuVal) * hsnVal);
  const tongSluong = sanLuong + slThao;
  const chenhLech = tongSluong - slKt;

  // 4. Tính tỷ lệ chênh lệch
  let tyleClech = "-";
  if (slKt !== 0) {
    const rawTyle = ((tongSluong - slKt) / slKt) * 100;
    const prefix = rawTyle > 0 ? "+" : "";
    tyleClech = prefix + rawTyle.toFixed(2) + "%";
  } else if (tongSluong > 0) {
    // Trường hợp kỳ trước bằng 0 nhưng kỳ này có sản lượng
    tyleClech = "+100%";
  } else {
    tyleClech = "0%";
  }

  // 5. Cập nhật lên UI
  if (slHiddenEl) slHiddenEl.value = sanLuong;
  if (tongSlCell) tongSlCell.innerText = tongSluong;
  if (clechCell) clechCell.innerText = chenhLech;
  if (tyleCell) tyleCell.innerText = tyleClech;

  updateRowDetail(maKhang, bcs, sanLuong, slThao, slKt);
  checkCancelButtonStatus(maKhang);
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
    const ghiChuInput = document.getElementById(`ghi_chu_${makh}`);
    const currentGhiChu = ghiChuInput ? ghiChuInput.value : (cust.ghi_chu || "");

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
      String(currentGhiChu).toLowerCase().includes(q);

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

async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const ghiChuInput = document.getElementById(`ghi_chu_${maKhang}`);
  const newGhiChu = ghiChuInput ? ghiChuInput.value.trim() : (cust.ghi_chu || "");

  let warningMsgs = [];
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    if (inputEl && inputEl.value !== "") {
      const csMoi = Number(inputEl.value);
      const hsnVal = Number(item.hsn) || 1;
      const slThao = Number(item.sluong_thao) || 0;
      const slKt = Number(item.sluong_kt) || 0;

      const sanLuong = Math.round((csMoi - item.chiso_cu) * hsnVal);
      const tongSluong = sanLuong + slThao;

      if (slKt === 0) {
        if (tongSluong > 0) {
          warningMsgs.push(`* ${item.bcs}: Sản lượng kỳ trước bằng 0, kỳ này phát sinh +100% (${tongSluong} kWh).`);
        }
      } else {
        const percentChange = ((tongSluong - slKt) / slKt) * 100;
        if (percentChange > 50) {
          warningMsgs.push(`* ${item.bcs}: Slượng tăng ${percentChange.toFixed(1)}% so với kỳ trước.`);
        } else if (percentChange < -50) {
          warningMsgs.push(`* ${item.bcs}: Slượng giảm ${Math.abs(percentChange).toFixed(1)}% so với kỳ trước.`);
        }
      }
    }
  });

  let isWarning = warningMsgs.length > 0;
  let confirmMessage = isWarning 
    ? warningMsgs.join("\n") + "\n⚡Kiểm tra chỉ số trên công tơ kỹ lại.\n📂 Bạn vẫn muốn xác nhận ghi dữ liệu?" 
    : "Xác nhận ghi dữ liệu chỉ số và ghi chú?";

  const confirmSave = await showCustomConfirm(
    isWarning ? "CẢNH BÁO SẢN LƯỢNG" : "XÁC NHẬN GHI DỮ LIỆU",
    confirmMessage,
    isWarning
  );

  if (!confirmSave) return;

  // Vô hiệu hóa nút LƯU trong lúc chờ lưu để không bấm lung tung
  const btnSave = document.getElementById(`btn_save_${maKhang}`);
  if (btnSave) btnSave.disabled = true;

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
        lng: loc.lng || item.lng || "",
        nhap_cmis: 0
      });
    }
  });

  // Hàm gửi dữ liệu có cơ chế xếp hàng & tự động thử lại cho đến khi thành công
  async function sendSaveRequest() {
    showToast(`⏳ Đang xếp hàng & lưu dữ liệu KH ${maKhang}...`);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "SAVE_CHISO",
          ten_ndung: currentUser.ten_ndung,
          ten_nvien: currentUser.ten_nvien,
          items: payload
        })
      });

      const res = await response.json();

      // Trường hợp 1: Nhiều người cùng bấm, backend đang bận xử lý người khác -> Tự động thử lại sau 2 giây
      if (res.status === "WAIT_QUEUE") {
        showToast(`⏳ Nhiều người đang lưu, đang chờ tới lượt KH ${maKhang}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return sendSaveRequest(); // Thử lại lượt mới
      }

      // Trường hợp 2: Đã đến lượt và lưu thành công
      if (res.status === "success") {
        showToast("✅ " + res.message);

        cust.ghi_chu = newGhiChu;
        cust.items.forEach(item => {
          const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
          if (inputEl && inputEl.value !== "") {
            item.chiso_moi = Number(inputEl.value);
            item.san_luong = document.getElementById(`sl_val_${item.rowIndex}`).value;
            item.tong_sluong = document.getElementById(`tong_sl_${item.rowIndex}`).innerText;
            item.chenh_lech = document.getElementById(`clech_${item.rowIndex}`).innerText;
            item.tyle_clech = document.getElementById(`tyle_${item.rowIndex}`).innerText;
          }
        });

        updateSummaryBar();
        checkCancelButtonStatus(maKhang);
      } else {
        showToast("❌ " + res.message);
      }
    } catch (error) {
      // Nếu rớt mạng đột ngột -> Tự động thử lại
      showToast(`⏳ Mạng chập chờn, đang thử lưu lại cho KH ${maKhang}...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return sendSaveRequest();
    } finally {
      if (btnSave) btnSave.disabled = false;
    }
  }

  // Bắt đầu tiến trình gửi request
  sendSaveRequest();
}

async function cancelCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const confirmCancel = await showCustomConfirm(
    "XÁC NHẬN HỦY", 
    `Bạn có chắc chắn muốn HỦY chỉ số đã nhập của khách hàng ${maKhang}? (Ghi chú sẽ giữ nguyên)`,
    true
  );

  if (!confirmCancel) return;

  const rowIndices = cust.items.map(item => item.rowIndex);

  showToast(`⏳ Đang hủy chỉ số KH ${maKhang}...`);
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
        item.chenh_lech = "-";
        item.tyle_clech = "-";

        const csMoiInput = document.getElementById(`cs_moi_${item.rowIndex}`);
        if (csMoiInput) csMoiInput.value = "";

        const slHiddenEl = document.getElementById(`sl_val_${item.rowIndex}`);
        if (slHiddenEl) slHiddenEl.value = "-";

        const tongSlCell = document.getElementById(`tong_sl_${item.rowIndex}`);
        if (tongSlCell) tongSlCell.innerText = "-";

        const clechCell = document.getElementById(`clech_${item.rowIndex}`);
        if (clechCell) clechCell.innerText = "-";

        const tyleCell = document.getElementById(`tyle_${item.rowIndex}`);
        if (tyleCell) tyleCell.innerText = "-";
      });

      const btnCancel = document.getElementById(`btn_cancel_${maKhang}`);
      if (btnCancel) btnCancel.disabled = true;

      updateSummaryBar();
    } else {
      showToast("❌ " + res.message);
    }
  })
  .catch(() => showToast("❌ Lỗi hệ thống!"));
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
