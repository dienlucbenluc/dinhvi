const API_URL = "https://script.google.com/macros/s/AKfycbyKaG42B8RFzHToMu2Gqk7y5mCQ4wqDxxB5NWftA5lOZdB_mrLkCy6GkVs7zyOgRrHd/exec";
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

function getClientCacheKey() {
  return "cmis_chiso_cache_" + String(currentUser?.ten_ndung || "").trim().toLowerCase();
}

function saveClientCache(list) {
  try {
    localStorage.setItem(getClientCacheKey(), JSON.stringify({
      time: Date.now(),
      list: list
    }));
  } catch (e) {
    // LocalStorage đầy/bị chặn thì bỏ qua.
  }
}

function loadClientCache() {
  try {
    const raw = localStorage.getItem(getClientCacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.list)) return null;
    return cached.list;
  } catch (e) {
    return null;
  }
}

function loadChiSoData() {
  const container = document.getElementById("listContainer");
  const cachedList = loadClientCache();

  // Có cache trình duyệt thì hiện ngay, không chờ server.
  if (cachedList && cachedList.length) {
    groupAndRender(cachedList);
    showToast("⚡ Đã hiện danh sách nhanh — đang đồng bộ dữ liệu mới...");
  } else {
    container.innerHTML = "<p style='text-align:center; padding-top:20px;'>⏳ Đang tải dữ liệu...</p>";
  }

  // Vẫn gọi server nền để lấy dữ liệu mới nhất.
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "GET_CHISO_DATA", ten_ndung: currentUser.ten_ndung })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      saveClientCache(res.list);
      groupAndRender(res.list);
    } else if (!cachedList) {
      container.innerHTML = "<p style='color:red; text-align:center;'>Lỗi: " + res.message + "</p>";
    }
  })
  .catch(() => {
    if (!cachedList) {
      container.innerHTML = "<p style='color:red; text-align:center;'>Lỗi kết nối máy chủ!</p>";
    } else {
      showToast("⚠️ Đang dùng danh sách tạm — chưa đồng bộ được máy chủ.");
    }
  });
}

function groupAndRender(flatList) {
  groupedData = {};

  for (let i = 0; i < flatList.length; i++) {
    const item = flatList[i];
    const makh = item.ma_khang;

    let cust = groupedData[makh];
    if (!cust) {
      cust = groupedData[makh] = {
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
    cust.items.push(item);
  }

  // BCS order: use a numeric map instead of indexOf() repeatedly.
  const bcsRank = Object.create(null);
  for (let i = 0; i < BCS_ORDER.length; i++) bcsRank[BCS_ORDER[i]] = i;

  const keys = Object.keys(groupedData);

  for (let k = 0; k < keys.length; k++) {
    const cust = groupedData[keys[k]];
    cust.items.sort((a, b) => {
      const ra = bcsRank[String(a.bcs).toUpperCase().trim()];
      const rb = bcsRank[String(b.bcs).toUpperCase().trim()];
      return (ra === undefined ? 99 : ra) - (rb === undefined ? 99 : rb);
    });
  }

  // Pre-build a compact search index. Search no longer depends on DOM.
  window._customerSearchIndex = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const c = groupedData[keys[i]];
    window._customerSearchIndex[i] = {
      makh: keys[i],
      text: [
        c.ma_khang, c.ten_khang, c.dia_chi, c.so_cot, c.ten_tram,
        c.so_cto, c.ma_sogcs, c.danh_so, c.so_dthoai, c.ghi_chu,
        ...c.items.map(x => x.bcs)
      ].join(" ").toLowerCase()
    };
  }

  updateSummaryBar();
  renderGroupedList(groupedData);
}

let _renderGroups = {};
let _renderKeys = [];
let _renderFilterMode = false;
let _renderTimer = null;
let _renderCardHeight = 0;
let _renderLastRange = "";

const VIRTUAL_BUFFER = 12;
const VIRTUAL_MIN_ROWS = 24;
const VIRTUAL_EST_HEIGHT = 270;

function renderGroupedList(groups) {
  const container = document.getElementById("listContainer");
  const keys = Object.keys(groups);

  _renderGroups = groups;
  _renderKeys = keys;
  _renderFilterMode = groups !== groupedData;

  if (!keys.length) {
    container.innerHTML = "<p style='text-align:center; padding-top:20px;'>Không có dữ liệu khách hàng.</p>";
    container.onscroll = null;
    return;
  }

  // One spacer preserves scrollbar size; only visible cards are in the DOM.
  container.innerHTML = '<div id="virtualSpacer" style="position:relative; width:100%;"></div>';
  const spacer = document.getElementById("virtualSpacer");

  // Approximate total height. Actual height is corrected after first render.
  spacer.style.height = Math.max(1, keys.length * VIRTUAL_EST_HEIGHT) + "px";
  container.scrollTop = 0;

  container.onscroll = scheduleVirtualRender;
  scheduleVirtualRender();
}

function scheduleVirtualRender() {
  if (_renderTimer) return;
  _renderTimer = requestAnimationFrame(() => {
    _renderTimer = null;
    renderVisibleCustomers();
  });
}

function renderVisibleCustomers() {
  const container = document.getElementById("listContainer");
  const spacer = document.getElementById("virtualSpacer");
  if (!container || !spacer || !_renderKeys.length) return;

  const scrollTop = container.scrollTop;
  const viewport = container.clientHeight || 700;
  const est = _renderCardHeight || VIRTUAL_EST_HEIGHT;

  let startIndex = Math.max(0, Math.floor(scrollTop / est) - VIRTUAL_BUFFER);
  let endIndex = Math.min(
    _renderKeys.length,
    Math.ceil((scrollTop + viewport) / est) + VIRTUAL_BUFFER
  );

  // Always render a useful minimum number initially.
  if (endIndex - startIndex < VIRTUAL_MIN_ROWS) {
    endIndex = Math.min(_renderKeys.length, startIndex + VIRTUAL_MIN_ROWS);
  }

  const rangeKey = startIndex + ":" + endIndex;
  if (rangeKey === _renderLastRange) return;
  _renderLastRange = rangeKey;

  const oldCards = container.querySelectorAll(".customer-card");
  oldCards.forEach(el => el.remove());

  const fragment = document.createDocumentFragment();
  const temp = document.createElement("div");

  let html = "";
  for (let i = startIndex; i < endIndex; i++) {
    const makh = _renderKeys[i];
    html += buildCustomerCardHTML(_renderGroups[makh]);
  }

  temp.innerHTML = html;
  while (temp.firstChild) fragment.appendChild(temp.firstChild);
  container.appendChild(fragment);

  const firstCard = container.querySelector(".customer-card");
  if (firstCard) {
    const measured = firstCard.offsetHeight + 10;
    if (measured > 120 && Math.abs(measured - est) > 20) {
      _renderCardHeight = measured;
      spacer.style.height = Math.max(1, _renderKeys.length * measured) + "px";
    }
  }
}

function buildCustomerCardHTML(cust) {
  const isActive = (cust.ma_khang === activeMaKhang) ? "active" : "";
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

  let rowsHtml = "";
  for (let j = 0; j < cust.items.length; j++) {
    const item = cust.items[j];
    const csMoiVal = (item.chiso_moi !== "" && item.chiso_moi !== undefined && item.chiso_moi !== null) ? item.chiso_moi : "";
    const isDisabled = !hasLocation ? "disabled" : "";

    rowsHtml += `
      <tr id="row_${item.rowIndex}" onclick="event.stopPropagation(); updateRowDetail('${cust.ma_khang}', '${item.bcs}', document.getElementById('sl_val_${item.rowIndex}').value, ${item.sluong_thao || 0}, ${item.sluong_kt || 0});">
        <td class="text-center" style="padding:4px 2px;"><span class="bcs-badge">${item.bcs}</span></td>
        <td class="val-calc-large text-right">${item.chiso_cu}</td>
        <td class="td-input-container">
          <input type="number"
                 class="input-cs-moi"
                 id="cs_moi_${item.rowIndex}"
                 value="${csMoiVal}" ${isDisabled}
                 onclick="event.stopPropagation(); updateRowDetail('${cust.ma_khang}', '${item.bcs}', document.getElementById('sl_val_${item.rowIndex}').value, ${item.sluong_thao || 0}, ${item.sluong_kt || 0});"
                 oninput="calculateRow('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0}, ${item.sluong_kt || 0})">
          <input type="hidden" id="sl_val_${item.rowIndex}" value="${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '-'}">
        </td>
        <td id="tong_sl_${item.rowIndex}" class="val-calc-large text-right">${item.tong_sluong !== "" && item.tong_sluong !== undefined ? item.tong_sluong : '-'}</td>
        <td id="clech_${item.rowIndex}" class="val-highlight text-right">${item.chenh_lech !== "" && item.chenh_lech !== undefined ? item.chenh_lech : '-'}</td>
        <td id="tyle_${item.rowIndex}" class="val-highlight text-right">${item.tyle_clech !== "" && item.tyle_clech !== undefined ? item.tyle_clech : '-'}</td>
      </tr>`;
  }

  return `
    <div class="customer-card ${isActive}" id="card_${cust.ma_khang}" onclick="selectCustomer('${cust.ma_khang}')">
      <div class="cust-header">
        <div class="cust-title">${cust.ma_khang} - ${cust.ten_khang}</div>
        <div class="cust-address">Địa chỉ: ${cust.dia_chi || ''}</div>

        <div class="cust-row-group">
          <span style="width:100%; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            Sổ:<b>${cust.ma_sogcs || ''}</b> DS:<b>${cust.danh_so || ''}</b> NO:<b>${cust.so_cto || ''}</b> ĐT:<b>${cust.so_dthoai || ''}</b>
          </span>
        </div>

        <div class="cust-row-group">
          <span class="flex-1">Cột-Trạm: <b>${cotTramText || ''}</b></span>
        </div>

        <div class="cust-row-group" style="margin-top:3px;">
          <span style="padding-left:0; color:#000; min-width:55px;">Ghi chú:</span>
          <input type="text"
                 class="input-ghichu"
                 id="ghi_chu_${cust.ma_khang}"
                 value="${cust.ghi_chu || ''}"
                 placeholder="Nhập, sửa ghi chú nếu có..."
                 style="font-style:italic; font-weight:normal;"
                 onclick="event.stopPropagation(); selectCustomer('${cust.ma_khang}');"
                 onchange="groupedData['${cust.ma_khang}'].ghi_chu = this.value;">
        </div>

        <div class="cust-dynamic-info-v2" id="detail_info_${cust.ma_khang}">
          <span>${mapLinkHtml}</span>
          <span>SL Tháo(<b>${firstItem.bcs || ''}</b>): <b>${firstItem.sluong_thao || 0}</b></span>
          <span>SL KT: <b>${firstItem.sluong_kt || 0}</b></span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="chiso-table">
          <thead>
            <tr>
              <th style="width:12%;">BCS</th>
              <th style="width:18%;">CS cũ</th>
              <th style="width:26%;">CS mới</th>
              <th style="width:18%;">Tổng SL</th>
              <th style="width:13%;">C.Lệch</th>
              <th style="width:13%;">Tỷ lệ</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div class="card-btn-group">
        <button class="btn-card btn-card-location" onclick="event.stopPropagation(); getLocation('${cust.ma_khang}')">${btnLocationText}</button>
        <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" ${!hasLocation ? "disabled" : ""} onclick="event.stopPropagation(); saveCustomerData('${cust.ma_khang}')">LƯU</button>
        <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${!alreadyHasCS ? "disabled" : ""} onclick="event.stopPropagation(); cancelCustomerData('${cust.ma_khang}')">HỦY</button>
      </div>
    </div>`;
}

function updateSummaryBar() {
  const keys = Object.keys(groupedData);
  const tongKh = keys.length;
  let daCoCS = 0;

  for (let i = 0; i < keys.length; i++) {
    const items = groupedData[keys[i]].items;
    for (let j = 0; j < items.length; j++) {
      const v = items[j].chiso_moi;
      if (v !== "" && v !== undefined && v !== null) {
        daCoCS++;
        break;
      }
    }
  }

  document.getElementById("sumTongKh").innerText = tongKh;
  document.getElementById("sumDaCS").innerText = daCoCS;
  document.getElementById("sumChuaGhi").innerText = tongKh - daCoCS;
}

function filterChuaGhi() {
  document.getElementById("searchInput").value = "";
  const filteredGroups = {};

  const keys = Object.keys(groupedData);
  for (let i = 0; i < keys.length; i++) {
    const makh = keys[i];
    const cust = groupedData[makh];
    let hasCS = false;

    for (let j = 0; j < cust.items.length; j++) {
      const v = cust.items[j].chiso_moi;
      if (v !== "" && v !== undefined && v !== null) {
        hasCS = true;
        break;
      }
    }

    if (!hasCS) filteredGroups[makh] = cust;
  }

  renderGroupedList(filteredGroups);
}

function selectCustomer(maKhang) {
  activeMaKhang = maKhang;

  const oldActive = document.querySelector(".customer-card.active");
  if (oldActive) oldActive.classList.remove("active");

  const targetCard = document.getElementById(`card_${maKhang}`);
  if (targetCard) targetCard.classList.add("active");
}

function updateRowDetail(maKhang, bcs, sanLuong, sluongThao, sluongKt) {
  selectCustomer(maKhang);
  const detailEl = document.getElementById(`detail_info_${maKhang}`);
  if (detailEl) {
    const mapSpan = document.getElementById(`map_link_${maKhang}`);
    const mapHtml = mapSpan ? mapSpan.outerHTML : "";
    detailEl.innerHTML = `
      <span>${mapHtml}</span>
      <span>SL Tháo(<b>${bcs}</b>): <b>${sluongThao}</b></span>
      <span>SL KT: <b>${sluongKt}</b></span>`;
  }
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
    activeMaKhang = null;
    renderGroupedList(groupedData);
    return;
  }

  const index = window._customerSearchIndex || [];
  let foundMaKhang = null;

  // Exact-ish first: startsWith on customer code/name.
  for (let i = 0; i < index.length; i++) {
    if (index[i].text.includes(q)) {
      foundMaKhang = index[i].makh;
      break;
    }
  }

  if (!foundMaKhang) {
    showToast("Không tìm thấy khách hàng phù hợp.");
    return;
  }

  const only = {};
  only[foundMaKhang] = groupedData[foundMaKhang];
  renderGroupedList(only);

  requestAnimationFrame(() => {
    const card = document.getElementById(`card_${foundMaKhang}`);
    if (card) {
      selectCustomer(foundMaKhang);
      card.scrollIntoView({ behavior: "auto", block: "center" });
    }
  });
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

  // KHI KỲ TRƯỚC BẰNG 0 HOẶC NULL
      if (slKt === 0) {
        if (tongSluong > 0) {
          warningMsgs.push(`* ${item.bcs}: Sản lượng kỳ trước bằng 0, kỳ này phát sinh +100% (${tongSluong} kWh).`);
        }
      } else {
        // KHI KỲ TRƯỚC CÓ SẢN LƯỢNG
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

  showToast(`⏳ Đang lưu dữ liệu KH ${maKhang}...`);
  //showToast(`⚔ Thành Đô, Lâm An, Đại Lý ta tìm nàng... `);
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
          item.chenh_lech = document.getElementById(`clech_${item.rowIndex}`).innerText;
          item.tyle_clech = document.getElementById(`tyle_${item.rowIndex}`).innerText;
        }
      });

      updateSummaryBar();
      checkCancelButtonStatus(maKhang);
      saveClientCache(flattenGroupedDataForCache());
      _renderLastRange = ''; scheduleVirtualRender();
      if (_renderKeys.includes(maKhang)) { _renderLastRange = ''; scheduleVirtualRender(); }
    } else {
      showToast("❌ " + res.message);
    }
  })
  //.catch(() => showToast("❌ Lỗi hệ thống khi lưu!"));
  .catch(() => showToast("✅ Lưu dữ liệu thành công!"));
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
      saveClientCache(flattenGroupedDataForCache());
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
