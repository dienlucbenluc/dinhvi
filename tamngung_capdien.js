const API_URL = "https://script.google.com/macros/s/AKfycbypH-vE7ctJxQObLPLvRrG71zbVx6_6E40foxkb4SS7e38kCmnyuj-09kuUGyFxcGhW/exec";
const IMGUR_CLIENT_ID = "1c0n1NK2RSskmev3mPVKZWUPYmJ_vaxjYIX_MkEVWYz0";

let currentUser = null;
let currentCustomers = [];
let activeCustomerIndex = null;
let selectedImageData = {}; // Lưu dữ liệu ảnh tạm thời theo từng dòng khách hàng

document.addEventListener("DOMContentLoaded", () => {
  // 1. Kiểm tra phiên đăng nhập người dùng[cite: 1]
  const sessionStr = localStorage.getItem("cmis_user_session");
  if (!sessionStr) {
    window.location.href = "login.html";
    return;
  }
  
  currentUser = JSON.parse(sessionStr);
  const userDisplay = document.getElementById("currentUserDisplay");
  if (userDisplay) {
    userDisplay.innerText = `${currentUser.ten_nvien || currentUser.ten_ndung || ""}`;
  }

  if (currentUser && currentUser.avatar) {
    const avatarImg = document.getElementById("userAvatarHeader");
    if (avatarImg) avatarImg.src = currentUser.avatar;
  }

  // Đặt ngày chọn mặc định là ngày hôm nay (YYYY-MM-DD)
  const dateInput = document.getElementById("dateSelect");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  // Lắng nghe sự kiện chọn file từ thiết bị
  const fileInput = document.getElementById("globalFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelect);
  }
});

// 2. Load danh sách ID_LENH theo NGAY_CAT và TEN_NDUNG
function loadIdLenhByDate() {
  const dateVal = document.getElementById("dateSelect").value;
  if (!dateVal) {
    alert("Vui lòng chọn ngày!");
    return;
  }

  const select = document.getElementById("idLenhSelect");
  select.innerHTML = '<option value="">-- Đang tải ID Lệnh... --</option>';

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "GET_ID_LENH_BY_DATE",
      ten_ndung: currentUser.ten_ndung,
      ngay: dateVal
    })
  })
  .then(res => res.json())
  .then(res => {
    select.innerHTML = '<option value="">-- Chọn ID Lệnh --</option>';
    if (res.status === "success" && res.data && res.data.length > 0) {
      res.data.forEach(idLenh => {
        const opt = document.createElement("option");
        opt.value = idLenh;
        opt.innerText = idLenh;
        select.appendChild(opt);
      });
    } else {
      alert("Không tìm thấy ID Lệnh nào thuộc ngày chọn!");
    }
  })
  .catch(err => {
    console.error("Lỗi tải ID Lệnh:", err);
    select.innerHTML = '<option value="">-- Lỗi tải dữ liệu --</option>';
  });
}

// 3. Load danh sách Khách hàng theo NGAY_CAT, ID_LENH và TEN_NDUNG
function loadCustomersByLenh() {
  const dateVal = document.getElementById("dateSelect").value;
  const idLenh = document.getElementById("idLenhSelect").value;

  if (!dateVal) {
    alert("Vui lòng chọn ngày!");
    return;
  }

  if (!idLenh) {
    alert("Vui lòng chọn ID Lệnh!");
    return;
  }

  const listEl = document.getElementById("customerList");
  listEl.innerHTML = "<li style='text-align:center; padding: 20px;'>Đang tải danh sách khách hàng...</li>";

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "GET_CUSTOMERS_BY_LENH",
      ten_ndung: currentUser.ten_ndung,
      ngay: dateVal,
      id_lenh: idLenh
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success" && res.data && res.data.length > 0) {
      currentCustomers = res.data;
      selectedImageData = {}; // Reset dữ liệu ảnh cũ
      renderCustomerList(currentCustomers);
    } else {
      listEl.innerHTML = "<li style='text-align:center; padding: 20px;'>Không tìm thấy khách hàng nào.</li>";
    }
  })
  .catch(err => {
    console.error("Lỗi:", err);
    listEl.innerHTML = "<li style='text-align:center; padding: 20px; color: red;'>Lỗi kết nối máy chủ!</li>";
  });
}

// 4. Hiển thị danh sách khách hàng dạng Box Card
function renderCustomerList(customers) {
  const listEl = document.getElementById("customerList");
  listEl.innerHTML = "";

  customers.forEach((cust, index) => {
    const li = document.createElement("li");
    li.className = "card-item";

    const mapsUrl = (cust.LAT && cust.LNG) 
      ? `https://www.google.com/maps/search/?api=1&query=${cust.LAT},${cust.LNG}` 
      : "#";

    const imgDisplay = cust.HINH_ANH 
      ? `<img src="${cust.HINH_ANH}" class="preview-img" alt="Hình ảnh cắt điện">` 
      : "";

    li.innerHTML = `
      <div class="card-header">${cust.MA_KHANG || ""} - ${cust.TEN_KHANG || ""}</div>
      <div class="card-info"><b>Sổ GCS:</b> ${cust.MA_SOGCS || ""} | <b>Danh số:</b> ${cust.DANH_SO || ""}</div>
      <div class="card-info"><b>Vị trí ĐN:</b> ${cust.VTRI_DNOI || ""}</div>
      <div class="card-info"><b>Tên trạm:</b> ${cust.TEN_TRAM || ""}</div>
      <div>
        ${(cust.LAT && cust.LNG) 
          ? `<a href="${mapsUrl}" target="_blank" class="maps-link">📍 Xem trên Google Maps</a>` 
          : `<span style="color:#888; font-size:12px;">Chưa có tọa độ</span>`}
      </div>
      
      <div class="image-section">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <button type="button" class="btn-photo" onclick="triggerFileInput(${index})" style="flex: 1;">📷 Chụp / Chọn ảnh</button>
          <button type="button" id="btn-save-${index}" class="btn-save" disabled onclick="saveImageData(${index})" style="flex: 1;">💾 Lưu</button>
        </div>
        <div class="preview-box" id="box-img-${index}">
          ${imgDisplay}
        </div>
      </div>
    `;

    listEl.appendChild(li);
  });
}

// Gọi mở bộ chọn ảnh/chụp ảnh trên thiết bị
function triggerFileInput(index) {
  activeCustomerIndex = index;
  const fileInput = document.getElementById("globalFileInput");
  if (fileInput) {
    fileInput.value = ""; // Clear để nhận chọn lại cùng 1 file nếu muốn
    fileInput.click();
  }
}

// Xử lý đọc file ảnh khi người dùng chọn/chụp xong
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file || activeCustomerIndex === null) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const base64Data = event.target.result.split(',')[1];
    selectedImageData[activeCustomerIndex] = {
      file: file,
      base64: base64Data
    };

    // Hiển thị xem trước ảnh trên khung card
    const boxImg = document.getElementById(`box-img-${activeCustomerIndex}`);
    if (boxImg) {
      boxImg.innerHTML = `<img src="${event.target.result}" class="preview-img" alt="Preview Image" />`;
    }

    // Kích hoạt sáng nút Lưu
    const btnSave = document.getElementById(`btn-save-${activeCustomerIndex}`);
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.style.background = "#28a745";
    }
  };
  reader.readAsDataURL(file);
}

// 5. Tải ảnh lên Imgur và ghi nhận đường dẫn, NGAY_SUA, NGUOI_SUA vào Google Sheet
async function saveImageData(index) {
  const cust = currentCustomers[index];
  const imgData = selectedImageData[index];

  if (!imgData) {
    alert("Vui lòng chụp hoặc chọn hình ảnh trước khi lưu!");
    return;
  }

  const btnSave = document.getElementById(`btn-save-${index}`);
  btnSave.disabled = true;
  btnSave.innerText = "⏳ Đang tải ảnh...";

  try {
    // Bước 1: Upload hình ảnh lên Imgur
    const formData = new FormData();
    formData.append("image", imgData.base64);

    const imgurRes = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
      },
      body: formData
    });

    const imgurJson = await imgurRes.json();

    if (!imgurJson.success) {
      throw new Error("Không thể tải ảnh lên Imgur");
    }

    const imageUrl = imgurJson.data.link;
    btnSave.innerText = "⏳ Đang lưu Sheet...";

    // Bước 2: Tạo mốc thời gian NGAY_SUA theo dạng DD/MM/YYYY HH:mm
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ngaySua = `${day}/${month}/${year} ${hours}:${minutes}`;

    // Bước 3: Gửi dữ liệu cập nhật về Apps Script
    const sheetRes = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "UPDATE_TAMNGUNG_CAPDIEN",
        id_hdon: cust.ID_HDON,
        hinh_anh: imageUrl,
        ngay_sua: ngaySua,
        nguoi_sua: currentUser.ten_ndung
      })
    });

    const sheetJson = await sheetRes.json();

    if (sheetJson.status === "success") {
      alert("Lưu hình ảnh và dữ liệu thành công!");
      cust.HINH_ANH = imageUrl;
      btnSave.innerText = "✔ Đã lưu";
      btnSave.style.background = "#6c757d";
    } else {
      alert("Lỗi lưu dữ liệu Sheet: " + sheetJson.message);
      btnSave.disabled = false;
      btnSave.innerText = "💾 Lưu";
    }
  } catch (err) {
    console.error(err);
    alert("Có lỗi xảy ra trong quá trình lưu dữ liệu. Vui lòng thử lại!");
    btnSave.disabled = false;
    btnSave.innerText = "💾 Lưu";
  }
}
