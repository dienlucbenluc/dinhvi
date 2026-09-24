const API_URL = "https://script.google.com/macros/s/AKfycbwjw5x47mNLBpC3Ar4beIIM20XzZJAVXMLusNZV2rHbyCvls7pICldt7UAkM6htgqpa/exec";
const CLOUDINARY_CLOUD_NAME = "jokzcdxt";  
const CLOUDINARY_UPLOAD_PRESET = "image_chiso";

let currentUser = null;
let groupedData = {};
let customerKeys = []; 
let currentCardIndex = 0; 
let isAnimating = false; 

// Lưu trữ ảnh dạng File/Blob tạm thời theo ma_khang
const currentCapturedFiles = {};

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

// Các hàm lấy tên Key lưu trữ phân biệt theo ten_ndung người dùng
function getExcelKeyChiSo() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `chiso_excel_data_${user}`;
}

function getExcelKeyDinhVi() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `dinhvi_excel_data_${user}`;
}

function getOfflineImagesKey() {
  const user = String(currentUser?.ten_ndung || "").trim().toLowerCase();
  return `offline_images_${user}`;
}

function getClientCacheKey() {
  return "cmis_chiso_cache_" + String(currentUser?.ten_ndung || "").trim().toLowerCase();
}

document.addEventListener("DOMContentLoaded", () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);
  document.getElementById("userDisplay").innerText = `👷 ${currentUser.ten_nvien || currentUser.ten_ndung}`;
  
  // 1. Khởi tạo danh sách Excel cục bộ phân biệt theo ten_ndung
  initLocalExcelStore();

  // 2. Tải và đồng bộ dữ liệu
  if (navigator.onLine) {
    syncLocalExcelToSheet().then(() => {
      loadChiSoData();
    });
  } else {
    loadChiSoData();
  }

  setupSwipeEvents();

// 3. Tự động đẩy ảnh offline + đồng bộ dữ liệu khi khôi phục mạng
window.addEventListener("online", async () => {
  showToast("📶 Đã kết nối mạng. Đang xử lý ảnh offline và đồng bộ dữ liệu...");
  // Bắt buộc xử lý upload ảnh xong hoàn toàn mới thực hiện đồng bộ Sheet
  await processOfflineImagesToCloudinary();
  await syncLocalExcelToSheet();
  if (currentUser && currentUser.ten_ndung) {
    fetchSilentLatestData(currentUser.ten_ndung, false);
  }
});

setInterval(async () => {
  if (navigator.onLine) {
    await processOfflineImagesToCloudinary();
    await syncLocalExcelToSheet();
  }
}, 30 * 60 * 1000);
  
// ----------------------------------------------------
// QUẢN LÝ DỮ LIỆU EXCEL VÀ HÌNH ẢNH CỤC BỘ (OFFLINE)
// ----------------------------------------------------
function initLocalExcelStore() {
  const csKey = getExcelKeyChiSo();
  const dvKey = getExcelKeyDinhVi();
  const imgKey = getOfflineImagesKey();

  if (!localStorage.getItem(csKey)) {
    localStorage.setItem(csKey, JSON.stringify([]));
  }
  if (!localStorage.getItem(dvKey)) {
    localStorage.setItem(dvKey, JSON.stringify([]));
  }
  if (!localStorage.getItem(imgKey)) {
    localStorage.setItem(imgKey, JSON.stringify({}));
  }
}

// Lưu log dạng Object vào danh sách Excel cục bộ
function appendToExcelStore(storeKey, rowObj) {
  try {
    const list = JSON.parse(localStorage.getItem(storeKey) || "[]");
    list.push(rowObj);
    localStorage.setItem(storeKey, JSON.stringify(list));
  } catch(e) {
    console.error("Lỗi lưu Excel store:", e);
  }
}

// Chuyển File/Blob sang Base64 để lưu offline an toàn không die khi F5
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Chuyển Base64 trở lại File object khi có mạng để upload Cloudinary
function base64ToFile(base64Str, fileName) {
  const arr = base64Str.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
}

// Lưu giữ ảnh offline
async function saveOfflineImage(maKhang, file) {
  try {
    const base64 = await fileToBase64(file);
    const imgKey = getOfflineImagesKey();
    const imgs = JSON.parse(localStorage.getItem(imgKey) || "{}");
    imgs[maKhang] = base64;
    localStorage.setItem(imgKey, JSON.stringify(imgs));
  } catch (e) {
    console.error("Lỗi lưu ảnh offline:", e);
  }
}

// Đẩy ảnh offline lên Cloudinary khi online (SỬA LỖI 2: Đồng bộ triệt để từng KH)
async function processOfflineImagesToCloudinary() {
  const imgKey = getOfflineImagesKey();
  let imgs = JSON.parse(localStorage.getItem(imgKey) || "{}");
  const keys = Object.keys(imgs);
  if (keys.length === 0) return;

  for (const makh of keys) {
    try {
      const base64Str = imgs[makh];
      if (!base64Str) continue;

      const file = base64ToFile(base64Str, `${makh}_offline.jpg`);
      const url = await uploadToCloudinary(file, makh);

      // 1. Cập nhật URL Cloudinary mới vào dữ liệu ghi chép Excel cục bộ (chờ sync)
      const csKey = getExcelKeyChiSo();
      const logs = JSON.parse(localStorage.getItem(csKey) || "[]");
      logs.forEach(item => {
        if (item.ma_khang === makh && (item.hinh_cto === "OFFLINE_IMAGE_PENDING" || !item.hinh_cto || item.hinh_cto.startsWith("data:"))) {
          item.hinh_cto = url;
        }
      });
      localStorage.setItem(csKey, JSON.stringify(logs));

      // 2. Cập nhật URL Cloudinary vào RAM (groupedData)
      if (groupedData[makh]) {
        groupedData[makh].hinh_cto = url;
        groupedData[makh].items.forEach(item => {
          item.hinh_cto = url;
        });
      }

      // 3. CẬP NHẬT BỔ SUNG: Cập nhật trực tiếp vào bộ đệm Cache chính của client
      const cacheKey = getClientCacheKey();
      const currentCache = localStorage.getItem(cacheKey);
      if (currentCache) {
        try {
          const obj = JSON.parse(currentCache);
          obj.list.forEach(flatItem => {
            if (flatItem.ma_khang === makh) {
              flatItem.hinh_cto = url;
            }
          });
          localStorage.setItem(cacheKey, JSON.stringify(obj));
        } catch (e) {
          console.error("Lỗi cập nhật cache ảnh offline:", e);
        }
      }

      // 4. Cập nhật lại bộ đệm ảnh Offline và xóa key đã upload thành công
      delete imgs[makh];
      localStorage.setItem(imgKey, JSON.stringify(imgs));
    } catch (e) {
      console.error("Lỗi đẩy ảnh offline makh: " + makh, e);
    }
  }
}

// ----------------------------------------------------
// ĐỒNG BỘ DỮ LIỆU CỤC BỘ LÊN SHEET
// ----------------------------------------------------
function syncLocalExcelToSheet() {
  return new Promise((resolve) => {
    const csKey = getExcelKeyChiSo();
    const dvKey = getExcelKeyDinhVi();

    const chisoLogs = JSON.parse(localStorage.getItem(csKey) || "[]");
    const dinhviLogs = JSON.parse(localStorage.getItem(dvKey) || "[]");

    if (chisoLogs.length === 0 && dinhviLogs.length === 0) {
      resolve(false);
      return;
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
        localStorage.setItem(csKey, JSON.stringify([]));
        localStorage.setItem(dvKey, JSON.stringify([]));
        showToast("🔄 Đã đồng bộ dữ liệu Excel từ thiết bị lên server.");
        resolve(true);
      } else {
        resolve(false);
      }
    })
    .catch(() => resolve(false));
  });
}

// ----------------------------------------------------
// XUẤT FILE EXCEL (.XLSX) TRỰC TIẾP
// ----------------------------------------------------
function downloadAllExcelFiles() {
  const csKey = getExcelKeyChiSo();
  const dvKey = getExcelKeyDinhVi();

  const chisoData = JSON.parse(localStorage.getItem(csKey) || "[]");
  const dinhviData = JSON.parse(localStorage.getItem(dvKey) || "[]");

  if (typeof XLSX === "undefined") {
    showToast("❌ Thư viện Excel chưa được tải xong!");
    return;
  }

  const wb = XLSX.utils.book_new();

  const wsChiSo = XLSX.utils.json_to_sheet(chisoData.length > 0 ? chisoData : [{}]);
  XLSX.utils.book_append_sheet(wb, wsChiSo, "chi_so");

  const wsDinhVi = XLSX.utils.json_to_sheet(dinhviData.length > 0 ? dinhviData : [{}]);
  XLSX.utils.book_append_sheet(wb, wsDinhVi, "dinh_vi");

  const fileName = `ChiSo_${currentUser?.ten_ndung || 'User'}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast("📊 Đã xuất file Excel dữ liệu về máy!");
}

// ----------------------------------------------------
// NÉN & TẢI ẢNH LÊN CLOUDINARY
// ----------------------------------------------------
function compressImage(file, fileName = "photo.jpg", maxWidth = 1000, quality = 0.7) {
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
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() }));
          } else reject(new Error("Lỗi nén ảnh"));
        }, "image/jpeg", quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadToCloudinary(file, maKhang = "") {
  const customFileName = `${maKhang || 'khachhang'}_${Date.now()}`;
  const compressedFile = await compressImage(file, `${customFileName}.jpg`, 1000, 0.7);
  
  const formData = new FormData();
  formData.append("file", compressedFile);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'chi_so');
  formData.append("public_id", customFileName);
  
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`, {
    method: "POST", body: formData
  });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error(data.error?.message || "Lỗi tải ảnh lên Cloudinary!");
}

function formatNumberText(val) {
  if (val === "" || val === null || val === undefined || isNaN(Number(val))) return "";
  return Number(val).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function parseFormattedNumber(val) {
  if (val === "" || val === null || val === undefined) return "";
  const cleanStr = String(val).replace(/,/g, "").trim();
  return isNaN(Number(cleanStr)) ? "" : Number(cleanStr);
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

function loadChiSoData() {
  let cachedList = null;
  try {
    const raw = localStorage.getItem(getClientCacheKey());
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.list) && obj.list.length > 0) cachedList = obj.list;
    }
  } catch (e) {}

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
  btnConfirm.onclick = () => { modal.style.display = "none"; resetConfirmModalButtons(); if (inputCamera) inputCamera.click(); };
  btnCancel.onclick = () => { modal.style.display = "none"; resetConfirmModalButtons(); if (inputGallery) inputGallery.click(); };
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

// SỬA LỖI 1: Reset giá trị input file để có thể chọn lại ảnh cho các KH tiếp theo
async function handleImageSelected(event, maKhang) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  currentCapturedFiles[maKhang] = file;

  // Nếu offline, lưu ngay bản đệm ảnh vào bộ nhớ thiết bị
  if (!navigator.onLine) {
    await saveOfflineImage(maKhang, file);
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewContainer = document.getElementById(`img_preview_container_${maKhang}`);
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
    }
  };
  reader.readAsDataURL(file);

  // Reset value để lượt chọn sau không bị kẹt sự kiện
  event.target.value = "";
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

  // SỬA LỖI 1: Kiểm tra ảnh trong LocalStorage khi Offline để không bị mất khi vuốt qua lại
  let offlineImgBase64 = null;
  try {
    const offlineImgs = JSON.parse(localStorage.getItem(getOfflineImagesKey()) || "{}");
    offlineImgBase64 = offlineImgs[makh] || null;
  } catch(e) {}

  let imgPreviewHtml = "";
  if (currentCapturedFiles[makh]) {
    const tempUrl = URL.createObjectURL(currentCapturedFiles[makh]);
    imgPreviewHtml = `<img src="${tempUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
  } else if (offlineImgBase64) {
    imgPreviewHtml = `<img src="${offlineImgBase64}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
  } else if (cust.hinh_cto && cust.hinh_cto !== "OFFLINE_IMAGE_PENDING") {
    imgPreviewHtml = `<a href="${cust.hinh_cto}" target="_blank"><img src="${cust.hinh_cto}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" /></a>`;
  } else {
    imgPreviewHtml = `<span style="font-size: 12px; color: #888;">Khung ảnh</span>`;
  }

  let html = `
    <div class="customer-card ${initialClass}" id="activeCustomerCard">
      <div class="cust-header">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#0056b3; font-weight:bold; background:#fff; padding:2px 0px; border-radius:4px;">
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
        <div class="cust-address"> Cột - Trạm: ${cotTramText || ''}</div>

        <div class="cust-row-group">
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

  const cancelDisabledAttr = !alreadyHasCS && !cust.hinh_cto && !currentCapturedFiles[makh] && !offlineImgBase64 ? "disabled" : "";
  const saveDisabledAttr = !hasLocation ? "disabled" : "";

  html += `
          </tbody>
        </table>
      </div>

      <input type="file" id="input_camera_${cust.ma_khang}" accept="image/*" capture="environment" style="display:none;" onchange="handleImageSelected(event, '${cust.ma_khang}')">
      <input type="file" id="input_gallery_${cust.ma_khang}" accept="image/*" style="display:none;" onchange="handleImageSelected(event, '${cust.ma_khang}')">

      <div class="card-btn-group">
        <div id="img_preview_container_${cust.ma_khang}" style="flex: 1; height: 110px; border: 1px dashed #ccc; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafafa;">
          ${imgPreviewHtml}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <button class="btn-card btn-card-save" id="btn_save_${cust.ma_khang}" ${saveDisabledAttr} onclick="saveCustomerData('${cust.ma_khang}')">💾 Lưu dữ liệu</button>
          <button class="btn-card" style="background: #17a2b8;" id="btn_capture_${cust.ma_khang}" onclick="promptImageSource('${cust.ma_khang}')">📷 Chụp ảnh&nbsp;&nbsp;</button>
          <button class="btn-card btn-card-cancel" id="btn_cancel_${cust.ma_khang}" ${cancelDisabledAttr} onclick="cancelCustomerData('${cust.ma_khang}')">✂ Hủy dữ liệu</button>
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
      
      // Ghi vao store Excel dinh vi offline
      appendToExcelStore(getExcelKeyDinhVi(), newDinhViRecord);

      if (groupedData[maKhang]) {
        groupedData[maKhang].items.forEach(item => {
          item.lat = lat;
          item.lng = lng;
        });
        renderCurrentCustomerCard();
      }

      if (!navigator.onLine) {
        showToast("⚠️ Đã lưu tọa độ vào bộ nhớ Excel thiết bị (Offline)!");
        return;
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
    (error) => { showToast("❌ Lỗi định vị GPS. Vui lòng bật vị trí!"); },
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
  let startX = 0, startY = 0, isMouseDown = false;

  container.addEventListener('touchstart', (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!startX || !startY || isAnimating) return;
    handleSwipeGesture(startX, startY, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    startX = 0; startY = 0;
  }, { passive: true });

  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.closest("button")) return;
    isMouseDown = true; startX = e.clientX; startY = e.clientY;
    container.style.cursor = "grabbing";
  });

  window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false; container.style.cursor = "default";
    if (!startX || !startY || isAnimating) return;
    handleSwipeGesture(startX, startY, e.clientX, e.clientY);
    startX = 0; startY = 0;
  });

  window.addEventListener('keydown', (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft") prevCustomer();
    else if (e.key === "ArrowRight") nextCustomer();
  });
}

function handleSwipeGesture(startX, startY, endX, endY) {
  let diffX = startX - endX;
  let diffY = startY - endY;
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
    if (diffX > 0) nextCustomer(); else prevCustomer();
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
    await showCustomConfirm("⚠️ CẢNH BÁO CHỈ SỐ LỖI", `Chỉ số mới (${csMoi}) nhỏ hơn chỉ số cũ (${csCuVal})!\nVui lòng kiểm tra và nhập lại.`, true);
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

  let offlineImgBase64 = null;
  try {
    const offlineImgs = JSON.parse(localStorage.getItem(getOfflineImagesKey()) || "{}");
    offlineImgBase64 = offlineImgs[maKhang] || null;
  } catch(e) {}

  const btnCancel = document.getElementById(`btn_cancel_${maKhang}`);
  if (btnCancel) btnCancel.disabled = !hasNewCS && !cust.hinh_cto && !currentCapturedFiles[maKhang] && !offlineImgBase64;
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
    customerKeys = recordedKeys; currentCardIndex = 0; updateSummaryBar(); renderCurrentCustomerCard();
  } else showToast("⚠️ Chưa có khách hàng nào được ghi chỉ số!");
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
    customerKeys = unrecordedKeys; currentCardIndex = 0; updateSummaryBar(); renderCurrentCustomerCard();
  } else showToast("Tất cả khách hàng đã được ghi xong.");
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
  currentCardIndex = 0; updateSummaryBar(); renderCurrentCustomerCard(); showToast("📋 Danh sách tất cả khách hàng.");
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
  if (targetIndex !== -1) { currentCardIndex = targetIndex; renderCurrentCustomerCard(); } 
  else showToast("❌ Không tìm thấy khách hàng theo yêu cầu.");
}

function checkPhotoRequirement(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return false;
  
  let offlineImgBase64 = null;
  try {
    const offlineImgs = JSON.parse(localStorage.getItem(getOfflineImagesKey()) || "{}");
    offlineImgBase64 = offlineImgs[maKhang] || null;
  } catch(e) {}

  for (let item of cust.items) {
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
      if (Math.abs(diffPercent) >= 70) return true;
    } 
    else if (sluongKtVal === 0 && tongSluong >= 100) return true;
    else if (sluongKtVal >= 100 && tongSluong === 0) return true;
  }
  return false;
}

// SỬA LỖI 2: Xử lý lưu dữ liệu chính xác khi Online & Offline
async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const btnSave = document.getElementById(`btn_save_${maKhang}`);

  let emptyItem = null;
  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    const val = inputEl ? inputEl.value.trim() : "";
    if (!emptyItem && (val === "" || isNaN(Number(val)))) {
      emptyItem = { item, inputEl };
    }
  });

  if (emptyItem) {
    await showCustomConfirm("⚠️ CHƯA NHẬP CHỈ SỐ", `Chưa nhập đủ chỉ số cho các BCS (${emptyItem.item.bcs})!\nVui lòng kiểm tra lại trước khi lưu.`, true);
    if (emptyItem.inputEl) setTimeout(() => emptyItem.inputEl.focus(), 100);
    return;
  }

  let offlineImgBase64 = null;
  try {
    const offlineImgs = JSON.parse(localStorage.getItem(getOfflineImagesKey()) || "{}");
    offlineImgBase64 = offlineImgs[maKhang] || null;
  } catch(e) {}

  const isPhotoRequired = checkPhotoRequirement(maKhang);
  const hasPhoto = Boolean(cust.hinh_cto || currentCapturedFiles[maKhang] || offlineImgBase64);

  if (isPhotoRequired && !hasPhoto) {
    const confirmCapture = await showCustomConfirm("📸 YÊU CẦU CHỤP ẢNH", "Sản lượng biến động ≥ ±70% so với kỳ trước.\nBắt buộc phải chụp ảnh chỉ số trước khi lưu.", true);
    if (confirmCapture) promptImageSource(maKhang);
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
    const confirmAbnormal = await showCustomConfirm("⚠️ CẢNH BÁO BẤT THƯỜNG", "Phát hiện sản lượng biến động bất thường:\n" + abnormalList.join("\n") + "\n\nBạn có chắc chắn muốn lưu chỉ số này không?", true);
    if (!confirmAbnormal) return;
  } else {
    const confirmSave = await showCustomConfirm("XÁC NHẬN GHI DỮ LIỆU", "Lưu chỉ số và ghi chú cho khách hàng này?");
    if (!confirmSave) return;
  }

  if (btnSave) btnSave.disabled = true;

  let imageUrl = cust.hinh_cto || "";

  // Tải ảnh lên Cloudinary nếu đang ONLINE, ngược lại lưu Offline
  if (currentCapturedFiles[maKhang]) {
    if (navigator.onLine) {
      try {
        imageUrl = await uploadToCloudinary(currentCapturedFiles[maKhang], maKhang);
        cust.hinh_cto = imageUrl;
        delete currentCapturedFiles[maKhang];
      } catch (e) {
        showToast("❌ Lỗi tải ảnh lên Cloudinary: " + e.message);
        if (btnSave) btnSave.disabled = false;
        return;
      }
    } else {
      await saveOfflineImage(maKhang, currentCapturedFiles[maKhang]);
      imageUrl = "OFFLINE_IMAGE_PENDING";
      delete currentCapturedFiles[maKhang];
    }
  } else if (offlineImgBase64 && !navigator.onLine) {
    imageUrl = "OFFLINE_IMAGE_PENDING";
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

      // Lưu log vào Store Excel offline
      appendToExcelStore(getExcelKeyChiSo(), itemRecord);

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

  if (!navigator.onLine) {
    applyLocalChanges();
    showToast("⚠️ Đã lưu vào bộ nhớ Excel thiết bị (Đang Offline)!");
    if (btnSave) btnSave.disabled = false;
    return;
  }
  
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
      showToast("⚠️ Đã lưu vào file Excel thiết bị (Chờ đồng bộ)!");
    }
  })
  .catch(() => {
    applyLocalChanges();
    showToast("⚠️ Đã lưu vào file Excel thiết bị (Chờ đồng bộ)!");
  })
  .finally(() => {
    if (btnSave) btnSave.disabled = false;
  });
}

async function cancelCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  const btnCancel = document.getElementById(`btn_cancel_${maKhang}`);

  const confirmCancel = await showCustomConfirm("XÁC NHẬN HỦY DỮ LIỆU", "Bạn có muốn hủy dữ liệu chỉ số của khách hàng này không?", true);
  if (!confirmCancel) return;

  if (btnCancel) btnCancel.disabled = true;

  let oldImageUrl = cust.hinh_cto || "";
  if (!oldImageUrl && cust.items && cust.items.length > 0) {
    const itemWithImg = cust.items.find(i => i.hinh_cto);
    if (itemWithImg) oldImageUrl = itemWithImg.hinh_cto;
  }

  const payload = [];
  const nowStr = new Date().toLocaleString("vi-VN");

  cust.items.forEach(item => {
    payload.push({
      id_chiso: item.id_chiso,
      rowIndex: item.rowIndex
    });

    appendToExcelStore(getExcelKeyChiSo(), {
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
      chiso_moi: "",
      ghi_chu: "",
      sluong_thao: item.sluong_thao,
      sluong_kt: item.sluong_kt,
      lat: item.lat || "",
      lng: item.lng || "",
      so_dthoai: cust.so_dthoai,
      time: nowStr,
      nguoi_nhap: currentUser.ten_nvien || currentUser.ten_ndung,
      type: "CANCEL",
      hinh_cto: oldImageUrl
    });
  });

  const applyCancelLocalChanges = () => {
    cust.hinh_cto = "";
    delete currentCapturedFiles[maKhang];

    // Xóa ảnh đệm offline nếu hủy
    try {
      const imgKey = getOfflineImagesKey();
      const imgs = JSON.parse(localStorage.getItem(imgKey) || "{}");
      delete imgs[maKhang];
      localStorage.setItem(imgKey, JSON.stringify(imgs));
    } catch(e) {}

    cust.items.forEach(item => {
      item.chiso_moi = "";
      item.san_luong = "";
      item.tong_sluong = "";
      item.hinh_cto = "";
    });

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

    updateSummaryBar();
    renderCurrentCustomerCard();
  };

  showToast(`⏳ Đang hủy dữ liệu chỉ số...`);

  if (!navigator.onLine) {
    applyCancelLocalChanges();
    showToast("⚠️ Đã ghi nhận hủy vào bộ nhớ Excel thiết bị (Offline)!");
    if (btnCancel) btnCancel.disabled = false;
    return;
  }

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
      showToast("⚠️ Đã ghi nhận hủy vào file Excel thiết bị!");
    }
  })
  .catch(() => {
    applyCancelLocalChanges();
    showToast("⚠️ Đã ghi nhận hủy vào file Excel thiết bị!");
  })
  .finally(() => {
    if (btnCancel) btnCancel.disabled = false;
  });
}
