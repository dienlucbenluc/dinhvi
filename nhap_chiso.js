const API_URL = "https://script.google.com/macros/s/AKfycbwjw5x47mNLBpC3Ar4beIIM20XzZJAVXMLusNZV2rHbyCvls7pICldt7UAkM6htgqpa/exec";

// Cấu hình Cloudinary
const CLOUDINARY_UPLOAD_PRESET = "nhap_chiso_preset"; // Thay bằng upload_preset của bạn nếu cần
const CLOUDINARY_CLOUD_NAME = "dienlucbenluc";       // Thay bằng cloud_name của bạn nếu cần
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

let currentUser = null;
let groupedData = {};
let customerKeys = []; // Mã KH sắp xếp theo ma_sogcs -> danh_so -> ma_khang
let currentCardIndex = 0; 
let isAnimating = false; // Chống vuốt quá nhanh gây lỗi animation

// Biến lưu trữ ảnh tạm thời dạng File/Blob theo từng ma_khang
const currentCapturedFiles = {};

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

// Tên các file text lưu trữ cục bộ trên thiết bị
const FILE_CHISO_TXT = "chiso.txt";
const FILE_DINHVI_TXT = "dinhvi.txt";
const FILE_SERVER_BACKUP_TXT = "chiso_server_backup.txt";

document.addEventListener("DOMContentLoaded", () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);
  document.getElementById("userDisplay").innerText = `👷 ${currentUser.ten_nvien || currentUser.ten_ndung}`;
  
  // 1. Khởi tạo file text nếu chưa có
  initLocalTextFiles();

  // 2. Kiểm tra nếu có mạng -> Đồng bộ dữ liệu từ text file lên Sheet TRƯỚC, xong mới Load danh sách
  if (navigator.onLine) {
    syncLocalTextFilesToSheet().then(() => {
      loadChiSoData();
    });
  } else {
    // Nếu mất mạng -> Load dữ liệu từ Cache local / File text backup
    loadChiSoData();
  }

  setupSwipeEvents();

  // 3. Sự kiện tự động đồng bộ khi thiết bị vừa khôi phục kết nối Internet
  window.addEventListener("online", () => {
    showToast("📶 Đã kết nối mạng, Đang đồng bộ dữ liệu lại...");
    syncLocalTextFilesToSheet().then(() => {
      if (currentUser && currentUser.ten_ndung) {
        fetchSilentLatestData(currentUser.ten_ndung, false);
      }
    });
  });

  // Đặt lịch tự động đồng bộ ngầm định kỳ 30 phút
  setInterval(() => {
    if (navigator.onLine) {
      syncLocalTextFilesToSheet();
    }
  }, 30 * 60 * 1000);
});

// ----------------------------------------------------
// HÀM BỔ TRỢ NÉN ẢNH VÀ XỬ LÝ CLOUDINARY
// ----------------------------------------------------
function compressImage(file, maxWidth = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name || "photo.jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Lỗi nén ảnh"));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadToCloudinary(file) {
  const compressedFile = await compressImage(file, 1000, 0.7);
  const formData = new FormData();
  formData.append("file", compressedFile);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (data.secure_url) {
    return data.secure_url;
  } else {
    throw new Error(data.error?.message || "Lỗi tải ảnh lên Cloudinary!");
  }
}

// ----------------------------------------------------
// HÀM BỔ TRỢ ĐỊNH DẠNG SỐ (FORMAT & PARSE)
// ----------------------------------------------------
function formatNumberText(val) {
  if (val === "" || val === null || val === undefined || isNaN(Number(val))) return "";
  return Number(val).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function formatCoordText(val) {
  if (val === "" || val === null || val === undefined || isNaN(Number(val))) return "";
  return Number(val).toLocaleString("en-US", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8
  });
}

function parseFormattedNumber(val) {
  if (val === "" || val === null || val === undefined) return "";
  const cleanStr = String(val).replace(/,/g, "").trim();
  return isNaN(Number(cleanStr)) ? "" : Number(cleanStr);
}

// ----------------------------------------------------
// QUẢN LÝ TỰ ĐỘNG TẠO VÀ GHI HÀNG VÀO FILE TEXT CỤC BỘ
// ----------------------------------------------------
function initLocalTextFiles() {
  if (!localStorage.getItem(FILE_CHISO_TXT)) {
    const headerChiSo = "id_chiso\tma_khang\tten_khang\tdia_chi\tma_sogcs\tdanh_so\tso_cot\tma_tram\tten_tram\tso_cto\tten_ndung\tten_nvien\thsn\tbcs\tchiso_cu\tchiso_moi\tsan_luong\tsluong_thao\ttong_sluong\tsluong_kt\tchenh_lech\ttyle_clech\tky\tthang\tnam\tngay_nhap\tnguoi_nhap\tlat\tlng\tso_dthoai\tghi_chu\ttype\thinh_cto";
    localStorage.setItem(FILE_CHISO_TXT, headerChiSo);
  }

  if (!localStorage.getItem(FILE_DINHVI_TXT)) {
    const headerDinhVi = "id\tma_khang\tten_khang\tso_cto\tma_tram\tten_tram\tso_cot\tten_ndung\tten_nvien\tten_cviec\tnote\tlat\tlng\ttime\ttrang_thai\tnhap_cmis";
    localStorage.setItem(FILE_DINHVI_TXT, headerDinhVi);
  }
}

function appendToTextFile(fileName, rowDataObj) {
  let content = localStorage.getItem(fileName) || "";
  if (fileName === FILE_CHISO_TXT) {
    const line = [
      rowDataObj.id_chiso || "", rowDataObj.ma_khang || "", rowDataObj.ten_khang || "",
      rowDataObj.dia_chi || "", rowDataObj.ma_sogcs || "", rowDataObj.danh_so || "",
      rowDataObj.so_cot || "", rowDataObj.ma_tram || "", rowDataObj.ten_tram || "",
      rowDataObj.so_cto || "", rowDataObj.ten_ndung || "", rowDataObj.ten_nvien || "",
      rowDataObj.hsn || 1, rowDataObj.bcs || "", 
      formatNumberText(rowDataObj.chiso_cu),
      rowDataObj.chiso_moi !== undefined && rowDataObj.chiso_moi !== "" ? formatNumberText(rowDataObj.chiso_moi) : "",
      formatNumberText(rowDataObj.san_luong),
      formatNumberText(rowDataObj.sluong_thao),
      formatNumberText(rowDataObj.tong_sluong),
      formatNumberText(rowDataObj.sluong_kt),
      rowDataObj.chenh_lech || "", rowDataObj.tyle_clech || "",
      rowDataObj.ky || "", rowDataObj.thang || "", rowDataObj.nam || "",
      rowDataObj.time || "", rowDataObj.nguoi_nhap || "", 
      formatCoordText(rowDataObj.lat),
      formatCoordText(rowDataObj.lng), 
      rowDataObj.so_dthoai || "", rowDataObj.ghi_chu || "",
      rowDataObj.type || "SAVE",
      rowDataObj.hinh_cto || ""
    ].join("\t");
    content += "\n" + line;
  } else if (fileName === FILE_DINHVI_TXT) {
    const line = [
      rowDataObj.id || "", rowDataObj.ma_khang || "", rowDataObj.ten_khang || "",
      rowDataObj.so_cto || "", rowDataObj.ma_tram || "", rowDataObj.ten_tram || "",
      rowDataObj.so_cot || "", rowDataObj.ten_ndung || "", rowDataObj.ten_nvien || "",
      rowDataObj.ten_cviec || "Ghi điện", rowDataObj.ghi_chu || "", rowDataObj.lat || "",
      rowDataObj.lng || "", rowDataObj.time || "", rowDataObj.trang_thai || "1",
      rowDataObj.nhap_cmis || ""
    ].join("\t");
    content += "\n" + line;
  }
  localStorage.setItem(fileName, content);
}

// ----------------------------------------------------
// ĐỒNG BỘ NỘI DUNG 2 FILE TEXT LÊN GOOGLE SHEET
// ----------------------------------------------------
function syncLocalTextFilesToSheet() {
  return new Promise((resolve) => {
    const chisoRaw = localStorage.getItem(FILE_CHISO_TXT) || "";
    const dinhviRaw = localStorage.getItem(FILE_DINHVI_TXT) || "";

    const chisoLines = chisoRaw.split("\n").filter(l => l.trim().length > 0);
    const dinhviLines = dinhviRaw.split("\n").filter(l => l.trim().length > 0);

    if (chisoLines.length <= 1 && dinhviLines.length <= 1) {
      resolve(false);
      return;
    }

    const chisoLogs = [];
    for (let i = 1; i < chisoLines.length; i++) {
      const cols = chisoLines[i].split("\t");
      chisoLogs.push({
        id_chiso: cols[0], ma_khang: cols[1], ten_khang: cols[2], dia_chi: cols[3],
        ma_sogcs: cols[4], danh_so: cols[5], so_cot: cols[6], ma_tram: cols[7],
        ten_tram: cols[8], so_cto: cols[9], ten_ndung: cols[10], ten_nvien: cols[11],
        hsn: cols[12], bcs: cols[13], 
        chiso_cu: parseFormattedNumber(cols[14]), 
        chiso_moi: parseFormattedNumber(cols[15]),
        san_luong: parseFormattedNumber(cols[16]), 
        sluong_thao: parseFormattedNumber(cols[17]), 
        tong_sluong: parseFormattedNumber(cols[18]), 
        sluong_kt: parseFormattedNumber(cols[19]),
        chenh_lech: cols[20], tyle_clech: cols[21], ky: cols[22], thang: cols[23],
        nam: cols[24], time: cols[25], nguoi_nhap: cols[26], 
        lat: parseFormattedNumber(cols[27]),
        lng: parseFormattedNumber(cols[28]), 
        so_dthoai: cols[29], ghi_chu: cols[30], type: cols[31],
        hinh_cto: cols[32] || ""
      });
    }

    const dinhviLogs = [];
    for (let i = 1; i < dinhviLines.length; i++) {
      const cols = dinhviLines[i].split("\t");
      dinhviLogs.push({
        id: cols[0], ma_khang: cols[1], ten_khang: cols[2], so_cto: cols[3],
        ma_tram: cols[4], ten_tram: cols[5], so_cot: cols[6], ten_ndung: cols[7],
        ten_nvien: cols[8], ten_cviec: cols[9], ghi_chu: cols[10], lat: cols[11],
        lng: cols[12], time: cols[13], trang_thai: cols[14], nhap_cmis: cols[15]
      });
    }

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "SYNC_BATCH_DATA",
        chiso_logs: chisoLogs,
        dinhvi_logs: dinhviLogs
      })
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        localStorage.removeItem(FILE_CHISO_TXT);
        localStorage.removeItem(FILE_DINHVI_TXT);
        initLocalTextFiles();
        showToast("🔄 Đã đồng bộ dữ liệu từ thiết bị lên server.");
        resolve(true);
      } else {
        resolve(false);
      }
    })
    .catch(() => resolve(false));
  });
}

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
      }
    }
  } catch (e) {}

  if (!cachedList) {
    try {
      const backupRaw = localStorage.getItem(FILE_SERVER_BACKUP_TXT);
      if (backupRaw) {
        cachedList = JSON.parse(backupRaw);
      }
    } catch (e) {}
  }

  if (cachedList && Array.isArray(cachedList) && cachedList.length > 0) {
    groupAndRender(cachedList);
  }

  if (navigator.onLine && currentUser && currentUser.ten_ndung) {
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
      try {
        localStorage.setItem(FILE_SERVER_BACKUP_TXT, JSON.stringify(res.list));
      } catch (e) {}

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
        hinh_cto: item.hinh_cto || "",
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

// ----------------------------------------------------
// THAO TÁC NÚT CHỤP ẢNH & HIỂN THỊ HÌNH ẢNH
// ----------------------------------------------------
function promptImageSource(maKhang) {
  const inputCamera = document.getElementById(`input_camera_${maKhang}`);
  const inputGallery = document.getElementById(`input_gallery_${maKhang}`);

  const modal = document.getElementById("customConfirmModal");
  const titleEl = document.getElementById("confirmModalTitle");
  const msgEl = document.getElementById("confirmModalMessage");
  const btnConfirm = document.getElementById("btnModalConfirm");
  const btnCancel = document.getElementById("btnModalCancel");

  titleEl.innerText = "CHỌN NGUỒN ẢNH";
  titleEl.style.color = "#007bff";
  msgEl.innerText = "Bạn muốn chụp ảnh trực tiếp từ máy ảnh hay chọn ảnh sẵn từ bộ sưu tập?";
  
  btnConfirm.innerText = "📸 Máy ảnh";
  btnConfirm.style.background = "#007bff";
  btnCancel.innerText = "🖼️ Bộ sưu tập";
  btnCancel.style.background = "#28a745";
  btnCancel.style.color = "white";

  modal.style.display = "flex";

  btnConfirm.onclick = () => {
    modal.style.display = "none";
    resetConfirmModalButtons();
    if (inputCamera) inputCamera.click();
  };

  btnCancel.onclick = () => {
    modal.style.display = "none";
    resetConfirmModalButtons();
    if (inputGallery) inputGallery.click();
  };
}

function resetConfirmModalButtons() {
  const btnConfirm = document.getElementById("btnModalConfirm");
  const btnCancel = document.getElementById("btnModalCancel");
  btnConfirm.innerText = "Xác nhận";
  btnConfirm.style.background = "#28a745";
  btnCancel.innerText = "Hủy";
  btnCancel.style.background = "#e0e0e0";
  btnCancel.style.color = "#333";
}

function handleImageSelected(event, maKhang) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  currentCapturedFiles[maKhang] = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewContainer = document.getElementById(`img_preview_container_${maKhang}`);
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
    }
  };
  reader.readAsDataURL(file);
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

  const hasLocation = Boolean(firstItem.lat && firstItem.lng);
  let mapLinkHtml = `<a onclick="getLocationAndSave('${cust.ma_khang}')" style="color:red; font-size: 14px; font-weight:bold; text-decoration:none;">📍 Lấy mới định vị</a>`;
  if (hasLocation) {
    mapLinkHtml = `<span id="map_link_${cust.ma_khang}"><a href="http://maps.google.com/?q=${firstItem.lat},${firstItem.lng}" target="_blank" style="color:#007bff; font-weight:bold; text-decoration:none;">🌏 Xem Google Maps</a></span>`;
  }

  const alreadyHasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);

  let initialClass = "";
  if (slideDirection === "left") initialClass = "slide-left-in";
  else if (slideDirection === "right") initialClass = "slide-right-in";

  let imgPreviewHtml = "";
  if (currentCapturedFiles[makh]) {
    const tempUrl = URL.createObjectURL(currentCapturedFiles[makh]);
    imgPreviewHtml = `<img src="${tempUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
  } else if (cust.hinh_cto) {
    imgPreviewHtml = `<a href="${cust.hinh_cto}" target="_blank"><img src="${cust.hinh_cto}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" /></a>`;
  } else {
    imgPreviewHtml = `<span style="font-size: 12px; color: #888;">Khung ảnh</span>`;
  }

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
        <div class="cust-tenKH">${cust.ten_khang || ''}</div>
        <div class="cust-address" title="${cust.dia_chi || ''}"><b>Đ/C:</b> ${cust.dia_chi || ''}</div>
        <div class="cust-row-group">
         Sổ: ${cust.ma_sogcs}-DS: ${cust.danh_so || ''}-ĐT: ${cust.so_dthoai || ''}
        </div>
        <div class="cust-address" style="margin-top: 4px;"> Cột - Trạm: ${cotTramText || ''}</div>

        <div class="cust-row-group" style="margin-top: 6px;">
          <input type="text" class="input-ghichu" 
                 id="ghi_chu_${cust.ma_khang}" 
                 value="${cust.ghi_chu || ''}" 
                 placeholder="Nhập ghi chú nếu có..." 
                 onchange="groupedData['${cust.ma_khang}'].ghi_chu = this.value;">
        </div>
        <div class="box-maps">${mapLinkHtml}</div>
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
                 onchange="calculateRow('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0})">
          <input type="hidden" id="sl_val_${item.rowIndex}" value="${item.san_luong !== "" && item.san_luong !== undefined ? item.san_luong : '-'}">
        </td>
        <td id="tong_sl_${item.rowIndex}" class="val-calc-large text-right">${item.tong_sluong !== "" && item.tong_sluong !== undefined ? item.tong_sluong : '-'}</td>
      </tr>
    `;
  });

  const cancelDisabledAttr = !alreadyHasCS && !cust.hinh_cto && !currentCapturedFiles[makh] ? "disabled" : "";
  const saveDisabledAttr = !hasLocation ? "disabled" : "";

  html += `
          </tbody>
        </table>
      </div>

      <!-- Inputs ẩn để chọn file máy ảnh / thư viện -->
      <input type="file" id="input_camera_${cust.ma_khang}" accept="image/*" capture="environment" style="display:none;" onchange="handleImageSelected(event, '${cust.ma_khang}')">
      <input type="file" id="input_gallery_${cust.ma_khang}" accept="image/*" style="display:none;" onchange="handleImageSelected(event, '${cust.ma_khang}')">

      <div class="card-btn-group">
        <div id="img_preview_container_${cust.ma_khang}" style="flex: 1; height: 110px; border: 1px dashed #ccc; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafafa;">
          ${imgPreviewHtml}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <button class="btn-card" style="background: #17a2b8;" id="btn_capture_${cust.ma_khang}" onclick="promptImageSource('${cust.ma_khang}')">📷 CHỤP ẢNH</button>
          <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" ${saveDisabledAttr} onclick="saveCustomerData('${cust.ma_khang}')">LƯU CS</button>
          <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${cancelDisabledAttr} onclick="cancelCustomerData('${cust.ma_khang}')">HỦY CS</button>
        </div>
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

function getLocationAndSave(maKhang) {
  if (!navigator.geolocation) {
    showToast("❌ Trình duyệt không hỗ trợ định vị GPS!");
    return;
  }

  showToast("⏳ Đang lấy vị trí GPS...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const cust = groupedData[maKhang] || {};
      const firstItem = (cust.items && cust.items[0]) ? cust.items[0] : {};
      const nowStr = new Date().toLocaleString("vi-VN");

      const newDinhViRecord = {
        id: String(Date.now()) + Math.floor(Math.random() * 10),
        ma_khang: maKhang,
        ten_khang: cust.ten_khang || "",
        so_cto: cust.so_cto || "",
        ma_tram: firstItem.ma_tram || "",
        ten_tram: cust.ten_tram || "",
        so_cot: cust.so_cot || "",
        ten_ndung: currentUser.ten_ndung || "",
        ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung || "",
        ten_cviec: "Ghi điện",
        ghi_chu: cust.ghi_chu || "",
        lat: lat,
        lng: lng,
        time: nowStr,
        trang_thai: "1",
        nhap_cmis: ""
      };
      appendToTextFile(FILE_DINHVI_TXT, newDinhViRecord);

      if (groupedData[maKhang]) {
        groupedData[maKhang].items.forEach(item => {
          item.lat = lat;
          item.lng = lng;
        });
        renderCurrentCustomerCard();
      }

      showToast("⏳ Đang cập nhật tọa độ...");

      fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "UPDATE_LOCATION",
          ma_khang: maKhang,
          ten_khang: cust.ten_khang || "",
          so_cto: cust.so_cto || "",
          ma_tram: firstItem.ma_tram || "",
          ten_tram: cust.ten_tram || "",
          so_cot: cust.so_cot || "",
          ten_ndung: currentUser.ten_ndung || "",
          ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung || "",
          ghi_chu: cust.ghi_chu || "",
          lat: lat,
          lng: lng
        })
      })
      .then(res => res.json())
      .then(res => {
        if (res.status === "success") {
          showToast("✅ " + res.message);
          localStorage.removeItem(getClientCacheKey());
        } else {
          showToast("⚠️ Đã lưu tọa độ vào thiết bị!");
        }
      })
      .catch(() => showToast("⚠️ Đã lưu tọa độ vào thiết bị!"));
    },
    (error) => {
      showToast("❌ Lỗi định vị GPS. Vui lòng bật vị trí!");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

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
  let isMouseDown = false;

  container.addEventListener('touchstart', (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!startX || !startY || isAnimating) return;

    let endX = e.changedTouches[0].clientX;
    let endY = e.changedTouches[0].clientY;
    handleSwipeGesture(startX, startY, endX, endY);

    startX = 0;
    startY = 0;
  }, { passive: true });

  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.closest("button")) return;
    isMouseDown = true;
    startX = e.clientX;
    startY = e.clientY;
    container.style.cursor = "grabbing";
  });

  window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    container.style.cursor = "default";

    if (!startX || !startY || isAnimating) return;

    let endX = e.clientX;
    let endY = e.clientY;
    handleSwipeGesture(startX, startY, endX, endY);

    startX = 0;
    startY = 0;
  });

  window.addEventListener('keydown', (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    if (e.key === "ArrowLeft") {
      prevCustomer();
    } else if (e.key === "ArrowRight") {
      nextCustomer();
    }
  });
}

function handleSwipeGesture(startX, startY, endX, endY) {
  let diffX = startX - endX;
  let diffY = startY - endY;

  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
    if (diffX > 0) {
      nextCustomer();
    } else {
      prevCustomer();
    }
  }
}

async function calculateRow(maKhang, bcs, rowIndex, csCu, hsn, sluongThao) {
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
  if (btnCancel) btnCancel.disabled = !hasNewCS && !cust.hinh_cto && !currentCapturedFiles[maKhang];
}

function filterDaCS() {
  document.getElementById("searchInput").value = "";
  const recordedKeys = [];

  Object.keys(groupedData).forEach(makh => {
    const cust = groupedData[makh];
    const hasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (hasCS) recordedKeys.push(makh);
  });

  if (recordedKeys.length > 0) {
    customerKeys = recordedKeys;
    currentCardIndex = 0;
    updateSummaryBar();
    renderCurrentCustomerCard();
  } else {
    showToast("⚠️ Chưa có khách hàng nào được ghi chỉ số!");
  }
}

function filterChuaGhi() {
  document.getElementById("searchInput").value = "";
  const unrecordedKeys = [];

  Object.keys(groupedData).forEach(makh => {
    const cust = groupedData[makh];
    const hasCS = cust.items.some(i => i.chiso_moi !== "" && i.chiso_moi !== undefined && i.chiso_moi !== null);
    if (!hasCS) unrecordedKeys.push(makh);
  });

  if (unrecordedKeys.length > 0) {
    customerKeys = unrecordedKeys;
    currentCardIndex = 0;
    updateSummaryBar();
    renderCurrentCustomerCard();
  } else {
    showToast("Tất cả khách hàng đã được ghi xong.");
  }
}

function showAllData() {
  document.getElementById("searchInput").value = "";
  
  customerKeys = Object.keys(groupedData).sort((a, b) => {
    const custA = groupedData[a];
    const custB = groupedData[b];

    const sogcsCompare = String(custA.ma_sogcs).localeCompare(String(custB.ma_sogcs), undefined, { numeric: true, sensitivity: 'base' });
    if (sogcsCompare !== 0) return sogcsCompare;

    const danhSoCompare = String(custA.danh_so).localeCompare(String(custB.danh_so), undefined, { numeric: true, sensitivity: 'base' });
    if (danhSoCompare !== 0) return danhSoCompare;

    return String(custA.ma_khang).localeCompare(String(custB.ma_khang), undefined, { numeric: true, sensitivity: 'base' });
  });

  currentCardIndex = 0;
  updateSummaryBar();
  renderCurrentCustomerCard();
  showToast("📋 Danh sách tất cả khách hàng.");
}

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
  } else {
    showToast("❌ Không tìm thấy khách hàng theo yêu cầu.");
  }
}

// Lưu dữ liệu: Nén và tải ảnh lên Cloudinary -> Ghi vào chiso.txt -> Cập nhật Google Sheet (cột hinh_cto)
async function saveCustomerData(maKhang) {
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
      `Chưa nhập đủ chỉ số cho các BCS (${emptyItem.item.bcs})!\nVui lòng kiểm tra lại trước khi lưu.`, 
      true
    );
    if (emptyItem.inputEl) {
      setTimeout(() => emptyItem.inputEl.focus(), 100);
    }
    return;
  }

  const abnormalList = [];
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    const csMoi = inputEl ? Number(inputEl.value.trim()) : 0;
    const csCu = Number(item.chiso_cu) || 0;
    const hsn = Number(item.hsn) || 1;
    const slThao = Number(item.sluong_thao) || 0;
    const sluongKtVal = Number(item.sluong_kt) || 0;

    const sanLuong = Math.round((csMoi - csCu) * hsn);
    const tongSluong = sanLuong + slThao;

    if (sluongKtVal > 0) {
      const diffPercent = ((tongSluong - sluongKtVal) / sluongKtVal) * 100;
      if (diffPercent > 50 || diffPercent < -50) {
        const phanTramText = diffPercent > 0 ? `tăng +${diffPercent.toFixed(1)}%` : `giảm ${diffPercent.toFixed(1)}%`;
        abnormalList.push(`• BCS ${item.bcs}: ${tongSluong} kW (${phanTramText} so với kỳ trước ${sluongKtVal} kW)`);
      }
    }
  });

  if (abnormalList.length > 0) {
    const abnormalMsg = "Phát hiện sản lượng biến động bất thường:\n" + 
                        abnormalList.join("\n") + 
                        "\n\nBạn có chắc chắn muốn lưu chỉ số này không?";
    const confirmAbnormal = await showCustomConfirm("⚠️ CẢNH BÁO BẤT THƯỜNG", abnormalMsg, true);
    if (!confirmAbnormal) return;
  } else {
    const confirmSave = await showCustomConfirm("XÁC NHẬN GHI DỮ LIỆU", "Lưu chỉ số và ghi chú cho khách hàng này?");
    if (!confirmSave) return;
  }

  let imageUrl = cust.hinh_cto || "";

  // Upload ảnh lên Cloudinary nếu có ảnh chụp mới
  if (currentCapturedFiles[maKhang]) {
    try {
      showToast("⏳ Đang nén và tải ảnh lên Cloudinary...");
      imageUrl = await uploadToCloudinary(currentCapturedFiles[maKhang]);
      cust.hinh_cto = imageUrl;
    } catch (e) {
      showToast("❌ Lỗi tải ảnh lên Cloudinary: " + e.message);
      return;
    }
  }

  const ghiChuInput = document.getElementById(`ghi_chu_${maKhang}`);
  const newGhiChu = ghiChuInput ? ghiChuInput.value.trim() : (cust.ghi_chu || "");

  const payload = [];
  const nowStr = new Date().toLocaleString("vi-VN");

  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    if (inputEl) {
      const itemRecord = {
        id_chiso: item.id_chiso,
        ma_khang: cust.ma_khang,
        ten_khang: cust.ten_khang,
        dia_chi: cust.dia_chi,
        ma_sogcs: cust.ma_sogcs,
        danh_so: cust.danh_so,
        so_cot: cust.so_cot,
        ma_tram: item.ma_tram,
        ten_tram: cust.ten_tram,
        so_cto: cust.so_cto,
        ten_ndung: currentUser.ten_ndung,
        ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung,
        hsn: item.hsn,
        bcs: item.bcs,
        chiso_cu: item.chiso_cu,
        chiso_moi: inputEl.value !== "" ? Number(inputEl.value) : "",
        ghi_chu: newGhiChu,
        sluong_thao: item.sluong_thao,
        sluong_kt: item.sluong_kt,
        lat: item.lat || "",
        lng: item.lng || "",
        so_dthoai: cust.so_dthoai,
        time: nowStr,
        nguoi_nhap: currentUser.ten_nvien || currentUser.ten_ndung,
        type: "SAVE",
        hinh_cto: imageUrl
      };

      appendToTextFile(FILE_CHISO_TXT, itemRecord);

      payload.push({
        id_chiso: item.id_chiso,
        rowIndex: item.rowIndex,
        chiso_cu: item.chiso_cu,
        chiso_moi: inputEl.value !== "" ? Number(inputEl.value) : "",
        ghi_chu: newGhiChu,
        hsn: item.hsn,
        sluong_thao: item.sluong_thao,
        sluong_kt: item.sluong_kt,
        lat: item.lat || "",
        lng: item.lng || "",
        hinh_cto: imageUrl
      });
    }
  });

  const applyLocalChanges = () => {
    cust.ghi_chu = newGhiChu;
    cust.items.forEach(item => {
      const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
      if (inputEl && inputEl.value !== "") {
        item.chiso_moi = Number(inputEl.value);
        const csCu = Number(item.chiso_cu) || 0;
        const hsn = Number(item.hsn) || 1;
        const slThao = Number(item.sluong_thao) || 0;
        item.san_luong = Math.round((item.chiso_moi - csCu) * hsn);
        item.tong_sluong = item.san_luong + slThao;
        item.hinh_cto = imageUrl;
      }
    });

    delete currentCapturedFiles[maKhang];
    updateSummaryBar();

    const cacheKey = getClientCacheKey();
    const currentCache = localStorage.getItem(cacheKey);
    if (currentCache) {
      try {
        const obj = JSON.parse(currentCache);
        obj.list.forEach(flatItem => {
          if (flatItem.ma_khang === maKhang) {
            const matchedInRam = cust.items.find(i => i.id_chiso === flatItem.id_chiso);
            if (matchedInRam && matchedInRam.chiso_moi !== "") {
              flatItem.chiso_moi = matchedInRam.chiso_moi;
              flatItem.san_luong = matchedInRam.san_luong;
              flatItem.tong_sluong = matchedInRam.tong_sluong;
              flatItem.ghi_chu = newGhiChu;
              flatItem.hinh_cto = imageUrl;
            }
          }
        });
        localStorage.setItem(cacheKey, JSON.stringify(obj));
      } catch(e) {}
    }
  };

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
    applyLocalChanges();
    if (res.status === "success") {
      showToast("✅ " + res.message);
    } else {
      showToast("⚠️ Đã lưu vào file text thiết bị (Chờ đồng bộ)!");
    }
  })
  .catch(() => {
    applyLocalChanges();
    showToast("⚠️ Đã lưu vào file text thiết bị (Chờ đồng bộ)!");
  });
}

// Hủy dữ liệu: Xóa link hinh_cto, xóa ảnh trên Cloudinary và xóa chỉ số
async function cancelCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const confirmCancel = await showCustomConfirm(
    "XÁC NHẬN HỦY DỮ LIỆU", 
    "Bạn có chắc chắn muốn hủy chỉ số và xóa ảnh đã lưu của khách hàng này?", 
    true
  );
  if (!confirmCancel) return;

  const oldImageUrl = cust.hinh_cto || "";

  const payload = [];
  const nowStr = new Date().toLocaleString("vi-VN");

  cust.items.forEach(item => {
    const itemRecord = {
      id_chiso: item.id_chiso,
      ma_khang: cust.ma_khang,
      bcs: item.bcs,
      chiso_moi: "",
      time: nowStr,
      ten_ndung: currentUser.ten_ndung,
      ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung,
      type: "CANCEL",
      hinh_cto: ""
    };

    appendToTextFile(FILE_CHISO_TXT, itemRecord);

    payload.push({
      id_chiso: item.id_chiso,
      rowIndex: item.rowIndex
    });
  });

  const applyCancelLocalChanges = () => {
    cust.hinh_cto = "";
    delete currentCapturedFiles[maKhang];

    cust.items.forEach(item => {
      item.chiso_moi = "";
      item.san_luong = "";
      item.tong_sluong = "";
      item.hinh_cto = "";
      const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
      if (inputEl) inputEl.value = "";
      const slHiddenEl = document.getElementById(`sl_val_${item.rowIndex}`);
      if (slHiddenEl) slHiddenEl.value = "-";
      const tongSlCell = document.getElementById(`tong_sl_${item.rowIndex}`);
      if (tongSlCell) tongSlCell.innerText = "-";
    });

    const previewContainer = document.getElementById(`img_preview_container_${maKhang}`);
    if (previewContainer) {
      previewContainer.innerHTML = `<span style="font-size: 12px; color: #888;">Khung ảnh</span>`;
    }

    checkCancelButtonStatus(maKhang);
    updateSummaryBar();

    const cacheKey = getClientCacheKey();
    const currentCache = localStorage.getItem(cacheKey);
    if (currentCache) {
      try {
        const obj = JSON.parse(currentCache);
        obj.list.forEach(flatItem => {
          if (flatItem.ma_khang === maKhang) {
            flatItem.chiso_moi = "";
            flatItem.san_luong = "";
            flatItem.tong_sluong = "";
            flatItem.hinh_cto = "";
          }
        });
        localStorage.setItem(cacheKey, JSON.stringify(obj));
      } catch(e) {}
    }
  };

  showToast(`⏳ Đang hủy chỉ số và xóa ảnh...`);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "CANCEL_CHISO",
      ten_ndung: currentUser.ten_ndung,
      items: payload,
      old_image_url: oldImageUrl
    })
  })
  .then(res => res.json())
  .then(res => {
    applyCancelLocalChanges();
    if (res.status === "success") {
      showToast("✅ " + res.message);
    } else {
      showToast("⚠️ Đã ghi nhận hủy vào file text thiết bị (Chờ đồng bộ)!");
    }
  })
  .catch(() => {
    applyCancelLocalChanges();
    showToast("⚠️ Đã ghi nhận hủy vào file text thiết bị (Chờ đồng bộ)!");
  });
}

function downloadAllTextFiles() {
  const files = ['chiso.txt', 'dinhvi.txt'];
  let count = 0;

  files.forEach((fileName, index) => {
    const content = localStorage.getItem(fileName) || "";
    
    setTimeout(() => {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      count++;
      if (count === files.length && typeof showToast === "function") {
        showToast("📥 Đã tải 2 file text về thư mục Download!");
      }
    }, index * 300);
  });
}
