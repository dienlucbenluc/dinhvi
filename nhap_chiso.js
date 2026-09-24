const API_URL = "https://script.google.com/macros/s/AKfycbwjw5x47mNLBpC3Ar4beIIM20XzZJAVXMLusNZV2rHbyCvls7pICldt7UAkM6htgqpa/exec";
const CLOUDINARY_CLOUD_NAME = "jokzcdxt";  
const CLOUDINARY_UPLOAD_PRESET = "image_chiso";

let currentUser = null;
let groupedData = {};
let customerKeys = []; 
let currentCardIndex = 0; 
let isAnimating = false; 

// Lưu trữ ảnh tạm dạng File/Blob theo ma_khang
const currentCapturedFiles = {};

const BCS_ORDER = ["BT", "CD", "TD", "SG", "VC", "BN", "CN", "TN", "SN", "VN"];

// Hàm sinh key lưu trữ theo từng người dùng
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

// ----------------------------------------------------
// TẠO CHUỖI ĐỊNH DANH KIỂM TRA FILE EXCEL (KHÔNG CHỨA ĐUÔI .XLSX)
// ten_ndung + thang + nam + count(id_chiso)
// ----------------------------------------------------
function buildExcelFileKey(dataList) {
  if (!Array.isArray(dataList) || dataList.length === 0) return "";
  
  const sample = dataList[0] || {};
  const user = String(sample.ten_ndung || sample.nguoi_nhap || currentUser?.ten_ndung || "").trim().toLowerCase().replace(/\s+/g, "_");
  const thang = String(sample.thang || "").padStart(2, '0');
  const nam = String(sample.nam || "");
  
  // Đếm tổng số dòng có id_chiso hợp lệ
  const validRowsCount = dataList.filter(item => item.id_chiso !== undefined && item.id_chiso !== null && item.id_chiso !== "").length;

  return `${user}_thang${thang}_${nam}_${validRowsCount}dong`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) { window.location.href = "login.html"; return; }
  currentUser = JSON.parse(sessionStr);

  initLocalExcelStore();

  // Kiểm tra file trên thiết bị và đối chiếu Google Sheet ngay khi bắt đầu
  await checkAndLoadInitialData();

  setupSwipeEvents();

  // Tự động kiểm tra đẩy ảnh và đồng bộ khi khôi phục kết nối mạng
  window.addEventListener("online", async () => {
    showToast("📶 Đã kết nối mạng. Đang xử lý đồng bộ...");
    await syncLocalExcelToSheet();
  });
});

// ----------------------------------------------------
// KHỞI TẠO VÀ XỬ LÝ DỮ LIỆU BẢNG EXCEL TRÊN THIẾT BỊ
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

// Kiểm tra đối chiếu file Excel gần nhất trên thiết bị với Google Sheet
async function checkAndLoadInitialData() {
  const csKey = getExcelKeyChiSo();
  const localExcelList = JSON.parse(localStorage.getItem(csKey) || "[]");
  const localFileKey = buildExcelFileKey(localExcelList);

  // Ngoại tuyến: Ưu tiên load file gần nhất trên thiết bị
  if (!navigator.onLine) {
    if (localExcelList.length > 0) {
      showToast("📶 Ngoại tuyến: Tải danh sách từ File Excel gần nhất trên thiết bị...");
      loadDataFromLocalExcel();
    } else {
      showToast("❌ Không có dữ liệu file Excel trên thiết bị và chưa kết nối mạng!");
      document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Chưa có dữ liệu Excel trên thiết bị. Vui lòng bật mạng để tải mới.</p>";
    }
    return;
  }

  showToast("⏳ Đang lấy dữ liệu chỉ số...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "GET_CHISO_DATA", ten_ndung: currentUser.ten_ndung })
    });
    
    const data = await res.json();

    if (data.status === "success" && Array.isArray(data.list) && data.list.length > 0) {
      const serverList = data.list;
      const serverFileKey = buildExcelFileKey(serverList);

      // ĐỐI CHIẾU TRÙNG KHỚP: ten_ndung+thang+nam+count(id_chiso)
      if (localExcelList.length > 0 && localFileKey === serverFileKey) {
        loadDataFromLocalExcel();
      } else {
        localStorage.setItem(csKey, JSON.stringify(serverList));
        localStorage.setItem(getClientCacheKey(), JSON.stringify({ time: Date.now(), list: serverList }));
        
        loadDataFromLocalExcel();
        showToast(`✅ Lấy dữ liệu chỉ số thành công!`);
      }
    } else {
      if (localExcelList.length > 0) {
        loadDataFromLocalExcel();
        showToast("⚠️ Máy chủ chưa có đợt dữ liệu mới. Sử dụng dữ liệu hiện tại trên thiết bị.");
      } else {
        showToast("❌ Không tìm thấy dữ liệu trên Google Sheet: " + (data.message || "Danh sách rỗng"));
      }
    }
  } catch (err) {
    console.error(err);
    if (localExcelList.length > 0) {
      loadDataFromLocalExcel();
      showToast("⚠️ Lỗi kết nối Server. Mở dữ liệu Excel gần nhất từ thiết bị.");
    } else {
      showToast("❌ Lỗi kết nối máy chủ!");
    }
  }
}

function handleFetchDataBtn() {
  checkAndLoadInitialData();
}

// Đọc dữ liệu trực tiếp từ Bảng Excel bộ nhớ thiết bị
function loadDataFromLocalExcel() {
  const csKey = getExcelKeyChiSo();
  const localData = JSON.parse(localStorage.getItem(csKey) || "[]");

  if (localData.length > 0) {
    groupAndRender(localData);
  } else {
    document.getElementById("listContainer").innerHTML = "<p style='text-align:center; padding-top:20px; font-weight:bold; color:red;'>Chưa có dữ liệu Excel trên thiết bị.</p>";
  }
}

// ----------------------------------------------------
// TẢI FILE EXCEL RA THIẾT BỊ BẰNG TÊN FILE QUY ĐỊNH
// ----------------------------------------------------
function downloadAllExcelFiles() {
  const csKey = getExcelKeyChiSo();
  const dvKey = getExcelKeyDinhVi();

  const chisoData = JSON.parse(localStorage.getItem(csKey) || "[]");
  const dinhviData = JSON.parse(localStorage.getItem(dvKey) || "[]");

  if (typeof XLSX === "undefined") {
    showToast("❌ Thư viện Excel chưa sẵn sàng!");
    return;
  }

  if (chisoData.length === 0) {
    showToast("⚠️ Chưa có dữ liệu chỉ số để tải về!");
    return;
  }

  const wb = XLSX.utils.book_new();
  const wsChiSo = XLSX.utils.json_to_sheet(chisoData);
  XLSX.utils.book_append_sheet(wb, wsChiSo, "chi_so");

  const wsDinhVi = XLSX.utils.json_to_sheet(dinhviData.length > 0 ? dinhviData : [{}]);
  XLSX.utils.book_append_sheet(wb, wsDinhVi, "dinh_vi");

  const fileKey = buildExcelFileKey(chisoData);
  const fileName = `${fileKey}.xlsx`;
  
  XLSX.writeFile(wb, fileName);
  showToast(`📊 Đã tải file Excel: ${fileName}`);
}

// ----------------------------------------------------
// XỬ LÝ LƯU & HỦY DỮ LIỆU
// ----------------------------------------------------
async function saveCustomerData(maKhang) {
  const cust = groupedData[maKhang];
  if (!cust) return;

  let offlineImgBase64 = null;
  try {
    const offlineImgs = JSON.parse(localStorage.getItem(getOfflineImagesKey()) || "{}");
    offlineImgBase64 = offlineImgs[maKhang] || null;
  } catch(e) {}

  const hasNewPhoto = Boolean(currentCapturedFiles[maKhang] || offlineImgBase64);

  let needPhoto = false;
  let warnMessage = "";

  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    const val = inputEl ? inputEl.value.trim() : "";

    if (val !== "" && !isNaN(Number(val))) {
      const csMoi = Number(val);
      const csCu = Number(item.chiso_cu) || 0;
      const hsn = Number(item.hsn) || 1;
      const sluongThao = Number(item.sluong_thao) || 0;
      const sluongKt = Number(item.sluong_kt) || 0;

      // --- SỬA TẠI ĐÂY: Xử lý tính qua vòng 5 số nếu csMoi < csCu ---
      let sanLuong = 0;
      if (csMoi < csCu) {
        sanLuong = Math.round((csMoi + 100000 - csCu) * hsn);
      } else {
        sanLuong = Math.round((csMoi - csCu) * hsn);
      }
      
      const tongSluong = sanLuong + sluongThao;

      if (sluongKt > 0) {
        const percentChange = ((tongSluong - sluongKt) / sluongKt) * 100;

        if (Math.abs(percentChange) >= 50) {
          needPhoto = true;
          const sign = percentChange > 0 ? "+" : "";
          warnMessage += `• BCS [${item.bcs}]: Sản lượng ${tongSluong} kW (Kỳ trước ${sluongKt} kW, biến động ${sign}${percentChange.toFixed(1)}%)\n`;
        }
      } else if (tongSluong > 0) {
        needPhoto = true;
        warnMessage += `• BCS [${item.bcs}]: Sản lượng ${tongSluong} kW (Kỳ trước 0 kW)\n`;
      }
    }
  });

  if (needPhoto && !hasNewPhoto) {
    const confirm = await showCustomConfirm(
      "⚠️ BẮT BUỘC CHỤP ẢNH", 
      `Sản lượng biến động vượt ngưỡng +/- 50%:\n${warnMessage}\nBắt buộc phải chụp ảnh công tơ trước khi lưu!\nBấm 'Chấp nhận' để mở NGUỒN ẢNH.`, 
      true
    );

    if (confirm) {
      promptImageSource(maKhang);
    }
    return;
  }

  const ghiChuEl = document.getElementById(`ghi_chu_${maKhang}`);
  if (ghiChuEl) cust.ghi_chu = ghiChuEl.value.trim();

  if (currentCapturedFiles[maKhang]) {
    await saveOfflineImage(maKhang, currentCapturedFiles[maKhang]);
  }

  const csKey = getExcelKeyChiSo();
  const localExcelList = JSON.parse(localStorage.getItem(csKey) || "[]");

  cust.items.forEach(item => {
    const inputEl = document.getElementById(`cs_moi_${item.rowIndex}`);
    const val = inputEl ? inputEl.value.trim() : "";

    const excelItemIndex = localExcelList.findIndex(e => String(e.id_chiso) === String(item.id_chiso));

    if (val !== "" && !isNaN(Number(val))) {
      const csMoi = Number(val);
      const csCu = Number(item.chiso_cu) || 0;
      const hsn = Number(item.hsn) || 1;
      const sluongThao = Number(item.sluong_thao) || 0;
      const sluongKt = Number(item.sluong_kt) || 0;

      // --- SỬA TẠI ĐÂY: Xử lý tính qua vòng 5 số đồng bộ khi lưu vào LocalStorage ---
      let sanLuong = 0;
      if (csMoi < csCu) {
        sanLuong = Math.round((csMoi + 100000 - csCu) * hsn);
      } else {
        sanLuong = Math.round((csMoi - csCu) * hsn);
      }

      const tongSluong = sanLuong + sluongThao;
      const chenhLech = tongSluong - sluongKt;
      const tyleClech = sluongKt !== 0 ? ((tongSluong / sluongKt) * 100).toFixed(2) + "%" : "0%";
      const nowStr = new Date().toLocaleString("vi-VN");

      item.chiso_moi = csMoi;
      item.san_luong = sanLuong;
      item.tong_sluong = tongSluong;
      item.chenh_lech = chenhLech;
      item.tyle_clech = tyleClech;
      item.ghi_chu = cust.ghi_chu;
      item.ngay_nhap = nowStr;
      item.nguoi_nhap = currentUser.ten_nvien || currentUser.ten_ndung;

      if (excelItemIndex !== -1) {
        localExcelList[excelItemIndex].chiso_moi = csMoi;
        localExcelList[excelItemIndex].san_luong = sanLuong;
        localExcelList[excelItemIndex].tong_sluong = tongSluong;
        localExcelList[excelItemIndex].chenh_lech = chenhLech;
        localExcelList[excelItemIndex].tyle_clech = tyleClech;
        localExcelList[excelItemIndex].ghi_chu = cust.ghi_chu;
        localExcelList[excelItemIndex].ngay_nhap = nowStr;
        localExcelList[excelItemIndex].nguoi_nhap = currentUser.ten_nvien || currentUser.ten_ndung;
        localExcelList[excelItemIndex].lat = item.lat || "";
        localExcelList[excelItemIndex].lng = item.lng || "";
      }
    }
  });

  localStorage.setItem(csKey, JSON.stringify(localExcelList));
  showToast("💾 Đã lưu dữ liệu vào Excel thiết bị!");
  updateSummaryBar();
  renderCurrentCustomerCard();

  checkAndAutoSync();
}

async function cancelCustomerData(maKhang) {
  const confirm = await showCustomConfirm("HỦY DỮ LIỆU", "Bạn có chắc chắn muốn hủy chỉ số của khách hàng này trên Excel thiết bị?", true);
  if (!confirm) return;

  const cust = groupedData[maKhang];
  if (!cust) return;

  const csKey = getExcelKeyChiSo();
  const imgKey = getOfflineImagesKey();
  const localExcelList = JSON.parse(localStorage.getItem(csKey) || "[]");
  const offlineImgs = JSON.parse(localStorage.getItem(imgKey) || "{}");

  delete offlineImgs[maKhang];
  delete currentCapturedFiles[maKhang];
  localStorage.setItem(imgKey, JSON.stringify(offlineImgs));

  cust.hinh_cto = "";
  cust.items.forEach(item => {
    item.chiso_moi = "";
    item.san_luong = "";
    item.tong_sluong = "";
    item.chenh_lech = "";
    item.tyle_clech = "";
    item.ngay_nhap = "";
    item.nguoi_nhap = "";
    item.hinh_cto = "";

    const excelItemIndex = localExcelList.findIndex(e => String(e.id_chiso) === String(item.id_chiso));
    if (excelItemIndex !== -1) {
      localExcelList[excelItemIndex].chiso_moi = "";
      localExcelList[excelItemIndex].san_luong = "";
      localExcelList[excelItemIndex].tong_sluong = "";
      localExcelList[excelItemIndex].chenh_lech = "";
      localExcelList[excelItemIndex].tyle_clech = "";
      localExcelList[excelItemIndex].ngay_nhap = "";
      localExcelList[excelItemIndex].nguoi_nhap = "";
      localExcelList[excelItemIndex].hinh_cto = "";
    }
  });

  localStorage.setItem(csKey, JSON.stringify(localExcelList));
  showToast("✂ Đã hủy dữ liệu chỉ số trên Excel thiết bị!");
  updateSummaryBar();
  renderCurrentCustomerCard();
}

// ----------------------------------------------------
// QUẢN LÝ HÌNH ẢNH & ĐỒNG BỘ
// ----------------------------------------------------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

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

async function saveOfflineImage(maKhang, file) {
  try {
    const base64 = await fileToBase64(file);
    const imgKey = getOfflineImagesKey();
    const imgs = JSON.parse(localStorage.getItem(imgKey) || "{}");
    imgs[maKhang] = base64;
    localStorage.setItem(imgKey, JSON.stringify(imgs));
  } catch (e) {
    console.error("Lỗi lưu ảnh thiết bị:", e);
  }
}

async function processOfflineImagesToCloudinary() {
  const imgKey = getOfflineImagesKey();
  let imgs = JSON.parse(localStorage.getItem(imgKey) || "{}");
  const keys = Object.keys(imgs);
  if (keys.length === 0) return;

  for (const makh of keys) {
    try {
      const base64Str = imgs[makh];
      if (!base64Str) continue;

      const file = base64ToFile(base64Str, `${makh}_device.jpg`);
      const cloudUrl = await uploadToCloudinary(file, makh);

      const csKey = getExcelKeyChiSo();
      const logs = JSON.parse(localStorage.getItem(csKey) || "[]");
      logs.forEach(item => {
        if (item.ma_khang === makh) {
          item.hinh_cto = cloudUrl;
        }
      });
      localStorage.setItem(csKey, JSON.stringify(logs));

      if (groupedData[makh]) {
        groupedData[makh].hinh_cto = cloudUrl;
        groupedData[makh].items.forEach(item => { item.hinh_cto = cloudUrl; });
      }

      delete imgs[makh];
      localStorage.setItem(imgKey, JSON.stringify(imgs));
    } catch (e) {
      console.error("Lỗi tải ảnh Cloudinary makh: " + makh, e);
    }
  }
}

async function handleSendDataBtn() {
  if (!navigator.onLine) {
    showToast("❌ Không có kết nối mạng để đồng bộ lên Google Sheet!");
    return;
  }
  const confirm = await showCustomConfirm("GỬI DỮ LIỆU", "Bạn muốn gửi toàn bộ dữ liệu chỉ số từ Excel thiết bị lên Google Sheet?");
  if (!confirm) return;

  await syncLocalExcelToSheet(true);
}

async function checkAndAutoSync() {
  const csKey = getExcelKeyChiSo();
  const localExcelList = JSON.parse(localStorage.getItem(csKey) || "[]");
  
  const validRowsCount = localExcelList.filter(item => 
    item.chiso_moi !== "" && item.chiso_moi !== null && item.chiso_moi !== undefined
  ).length;

  if (validRowsCount >= 20 && validRowsCount % 20 === 0 && navigator.onLine) {
    await syncLocalExcelToSheet(false);
  }
}

async function syncLocalExcelToSheet(isManual = false) {
  if (!navigator.onLine) return false;

  showToast("⏳ Đang đẩy ảnh lên Cloudinary...");
  await processOfflineImagesToCloudinary();

  const csKey = getExcelKeyChiSo();
  const dvKey = getExcelKeyDinhVi();

  const chisoLogs = JSON.parse(localStorage.getItem(csKey) || "[]");
  const dinhviLogs = JSON.parse(localStorage.getItem(dvKey) || "[]");

  const chisoToSend = chisoLogs.filter(i => i.chiso_moi !== "" && i.chiso_moi !== null && i.chiso_moi !== undefined);

  if (chisoToSend.length === 0 && dinhviLogs.length === 0) {
    if (isManual) showToast("ℹ️ Không có dữ liệu chỉ số mới cần đồng bộ!");
    return false;
  }

  showToast("⏳ Đang đồng bộ từ Excel thiết bị lên Google Sheet...");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "SYNC_BATCH_DATA",
        chiso_logs: chisoToSend,
        dinhvi_logs: dinhviLogs
      })
    });
    const result = await res.json();

    if (result.status === "success") {
      localStorage.setItem(dvKey, JSON.stringify([]));
      showToast("🚀 Đồng bộ dữ liệu lên Google Sheet thành công!");
      return true;
    } else {
      showToast("❌ Lỗi đồng bộ Google Sheet: " + result.message);
      return false;
    }
  } catch (e) {
    showToast("❌ Lỗi kết nối đồng bộ Google Sheet!");
    return false;
  }
}

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
  throw new Error(data.error?.message || "Lỗi tải ảnh Cloudinary!");
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
  msgEl.innerText = "Bạn muốn chụp ảnh trực tiếp hay chọn ảnh sẵn từ bộ sưu tập?";
  
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

async function handleImageSelected(event, maKhang) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  currentCapturedFiles[maKhang] = file;

  await saveOfflineImage(maKhang, file);

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewContainer = document.getElementById(`img_preview_container_${maKhang}`);
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`;
    }
  };
  reader.readAsDataURL(file);

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
  } else if (cust.hinh_cto) {
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
              <th style="width: 12%;">BCS</th>
              <th style="width: 22%;">CS cũ</th>
              <th style="width: 31%;">CS mới</th>
              <th style="width: 20%;">Tổng kW</th>
              <th style="width: 15%;">Loại</th>
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
        <td class="text-center">
          <select class="select-loai" id="select_loai_${item.rowIndex}" onchange="handleComboboxChange('${cust.ma_khang}', '${item.bcs}', ${item.rowIndex}, ${item.chiso_cu || 0}, ${item.hsn}, ${item.sluong_thao || 0}, ${item.sluong_kt || 0})">
            <option value="">--</option>
            <option value="U">U : Không xài</option>
            <option value="V">V : Tạm tính</option>
            <option value="Q">Q : Qua vòng</option>
            <option value="H">H : Hư hỏng</option>
            <option value="M">M : Mất công tơ</option>
          </select>
        </td>
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

      const dvKey = getExcelKeyDinhVi();
      const dinhViList = JSON.parse(localStorage.getItem(dvKey) || "[]");
      dinhViList.push({
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
      });
      localStorage.setItem(dvKey, JSON.stringify(dinhViList));

      if (groupedData[maKhang]) {
        groupedData[maKhang].items.forEach(item => {
          item.lat = lat;
          item.lng = lng;
        });
        renderCurrentCustomerCard();
      }
      showToast("📍 Đã lưu tọa độ vị trí vào Excel thiết bị!");
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
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!startX || !startY || isAnimating) return;
    handleSwipeGesture(startX, startY, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    startX = 0; startY = 0;
  }, { passive: true });

  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.closest("button")) return;
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
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
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

// ----------------------------------------------------
// XỬ LÝ SỰ KIỆN KHI CHỌN LOẠI CÔNG TƠ TỪ COMBOBOX
// ----------------------------------------------------
async function handleComboboxChange(maKhang, bcs, rowIndex, csCu, hsn, sluongThao, sluongKt) {
  const selectEl = document.getElementById(`select_loai_${rowIndex}`);
  const valType = selectEl ? selectEl.value : "";
  const inputEl = document.getElementById(`cs_moi_${rowIndex}`);
  const ghiChuEl = document.getElementById(`ghi_chu_${maKhang}`);

  if (!valType) return;

  const csCuVal = Number(csCu) || 0;
  const hsnVal = Number(hsn) || 1;
  const slThao = Number(sluongThao) || 0;
  const slKt = Number(sluongKt) || 0;

  if (valType === "U") {
    // U: Không xài => tự gán chiso_moi = chiso_cu và gọi calc
    if (inputEl) inputEl.value = csCuVal;
    await calculateRow(maKhang, bcs, rowIndex, csCuVal, hsnVal, slThao);
  } else if (valType === "V") {
    // V: Tạm tính => tự gán tong_sluong = sluong_kt, tính toán nội suy ra chiso_moi
    let tongSluongTarget = slKt;
    let sanLuongTarget = tongSluongTarget - slThao;
    let calculatedCsMoi = Math.round(csCuVal + (sanLuongTarget / hsnVal));
    
    if (inputEl) inputEl.value = calculatedCsMoi;
    await calculateRow(maKhang, bcs, rowIndex, csCuVal, hsnVal, slThao);
  } else if (valType === "Q") {
    // Q: Qua vòng => Cho phép nhập chiso_moi < chiso_cu và tính toán qua vòng chỉ số 5 số (100000)
    if (inputEl && inputEl.value !== "") {
      await calculateRow(maKhang, bcs, rowIndex, csCuVal, hsnVal, slThao);
    } else {
      showToast("ℹ️ Vui lòng nhập chỉ số mới nhỏ hơn chỉ số cũ cho trường hợp Qua vòng.");
      if (inputEl) inputEl.focus();
    }
  } else if (valType === "H") {
    // H: Hư hỏng => Cập nhật ghi_chu = Công tơ hư hỏng
    if (ghiChuEl) {
      ghiChuEl.value = "Công tơ hư hỏng";
      groupedData[maKhang].ghi_chu = "Công tơ hư hỏng";
    }
  } else if (valType === "M") {
    // M: Mất công tơ => Cập nhật ghi_chu = Mất công tơ
    if (ghiChuEl) {
      ghiChuEl.value = "Mất công tơ";
      groupedData[maKhang].ghi_chu = "Mất công tơ";
    }
  }
}

async function calculateRow(maKhang, bcs, rowIndex, csCu, hsn, sluongThao) {
  const inputEl = document.getElementById(`cs_moi_${rowIndex}`);
  const val = inputEl ? inputEl.value.trim() : "";
  const slHiddenEl = document.getElementById(`sl_val_${rowIndex}`);
  const tongSlCell = document.getElementById(`tong_sl_${rowIndex}`);
  const selectEl = document.getElementById(`select_loai_${rowIndex}`);
  const selectedType = selectEl ? selectEl.value : "";

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

  let sanLuong = 0;

  if (csMoi < csCuVal) {
    if (selectedType === "Q") {
      // Xử lý tính toán qua vòng đối với đồng hồ chỉ số 5 số (Max = 100000)
      sanLuong = Math.round((csMoi + 100000 - csCuVal) * hsnVal);
    } else {
      await showCustomConfirm("⚠️ CẢNH BÁO CHỈ SỐ LỖI", `Chỉ số mới (${csMoi}) nhỏ hơn chỉ số cũ (${csCuVal})!\nVui lòng kiểm tra và nhập lại.`, true);
      inputEl.value = "";
      if (slHiddenEl) slHiddenEl.value = "-";
      if (tongSlCell) tongSlCell.innerText = "-";
      checkCancelButtonStatus(maKhang);
      setTimeout(() => inputEl.focus(), 100);
      return;
    }
  } else {
    sanLuong = Math.round((csMoi - csCuVal) * hsnVal);
  }

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

  if (targetIndex !== -1) {
    currentCardIndex = targetIndex;
    renderCurrentCustomerCard();
    showToast(`🔍 Tìm thấy KH tại vị trí ${targetIndex + 1}`);
  } else {
    showToast("❌ Không tìm thấy thông tin phù hợp!");
  }
}
