const API_URL = "https://script.google.com/macros/s/AKfycbzKm3QsCZeO8Ps8EOtujg9GkiZlVHVISHlwEqAajBysbSforCgJaDKMyc5j35MUpO91/exec"; // Thay URL Apps Script của bạn[cite: 1]
const IMGUR_CLIENT_ID = "YOUR_IMGUR_CLIENT_ID"; // Thay Client ID của Imgur

let currentUser = null;
let currentCustomers = [];
let activeCustomerIndex = null;
let selectedImageData = {}; // Lưu base64/file hình ảnh tạm thời theo index

document.addEventListener("DOMContentLoaded", () => {
  // 1. Kiểm tra session đăng nhập[cite: 1]
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

  // Set ngày mặc định là hôm nay
  const dateInput = document.getElementById("dateSelect");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  // Lắng nghe sự kiện chọn file từ input
  document.getElementById("globalFileInput").addEventListener("change", handleFileSelect);
});

// 2. Tải ID_LENH theo Ngày và TEN_NDUNG
function loadIdLenhByDate() {
  const dateVal = document.getElementById("dateSelect").value;
  if (!dateVal) {
    alert("Vui lòng chọn ngày!");
    return;
  }

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
    const select = document.getElementById("idLenhSelect");
    select.innerHTML = '<option value="">-- Chọn ID Lệnh --</option>';
    if (res.status === "success" && res.data) {
      res.data.forEach(idLenh => {
        const opt = document.createElement("option");
        opt.value = idLenh;
        opt.innerText = idLenh;
        select.appendChild(opt);
      });
    } else {
      alert("Không tìm thấy ID Lệnh nào!");
    }
  })
  .catch(err => console.error("Lỗi tải ID Lệnh:", err));
}

// 2. Tải danh sách khách hàng theo ID_LENH
function loadCustomersByLenh() {
  const idLenh = document.getElementById("idLenhSelect").value;
  if (!idLenh) {
    alert("Vui lòng chọn ID Lệnh!");
    return;
  }

  const listEl = document.getElementById("customerList");
  listEl.innerHTML = "<li style='text-align:center; padding: 20px;'>Đang tải dữ liệu...</li>";

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "GET_CUSTOMERS_BY_LENH",
      ten_ndung: currentUser.ten_ndung,
      id_lenh: idLenh
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success" && res.data) {
      currentCustomers = res.data;
      renderCustomerList(currentCustomers);
    } else {
      listEl.innerHTML = "<li>Không tìm thấy khách hàng nào.</li>";
    }
  })
  .catch(err => {
    console.error("Lỗi:", err);
    listEl.innerHTML = "<li>Lỗi kết nối máy chủ!</li>";
  });
}

// 3. Render danh sách Khách hàng dạng Box Card
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
      ? `<img src="${cust.HINH_ANH}" class="preview-img" alt="Hình ảnh">` 
      : `<div id="preview-container-${index}" class="preview-box"></div>`;

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
        <button type="button" class="btn-photo" onclick="triggerFileInput(${index})">📷 Chọn / Chụp ảnh</button>
        <button type="button" id="btn-save-${index}" class="btn-save" disabled onclick="saveImageData(${index})">💾 Lưu</button>
        <div class="preview-box" id="box-img-${index}">
          ${imgDisplay}
        </div>
      </div>
    `;

    listEl.appendChild(li);
  });
}

// Kích hoạt nút bấm chọn / chụp ảnh
function triggerFileInput(index) {
  activeCustomerIndex = index;
  document.getElementById("globalFileInput").click();
}

// Xử lý xem trước ảnh khi chọn từ điện thoại
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

    // Hiển thị ảnh preview
    const boxImg = document.getElementById(`box-img-${activeCustomerIndex}`);
    boxImg.innerHTML = `<img src="${event.target.result}" class="preview-img" />`;

    // Sáng nút lưu
    const btnSave = document.getElementById(`btn-save-${activeCustomerIndex}`);
    if (btnSave) btnSave.disabled = false;
  };
  reader.readAsDataURL(file);
}

// 4. Tải ảnh lên Imgur & Lưu thông tin vào Sheet Google
async function saveImageData(index) {
  const cust = currentCustomers[index];
  const imgData = selectedImageData[index];

  if (!imgData) {
    alert("Vui lòng chọn hình ảnh trước khi lưu!");
    return;
  }

  const btnSave = document.getElementById(`btn-save-${index}`);
  btnSave.disabled = true;
  btnSave.innerText = "⏳ Đang tải ảnh...";

  try {
    // 1. Upload ảnh lên Imgur
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
      throw new Error("Lỗi tải ảnh lên Imgur");
    }

    const imageUrl = imgurJson.data.link;
    btnSave.innerText = "⏳ Đang lưu dữ liệu...";

    // 2. Ghi nhận link, NGAY_SUA, NGUOI_SUA vào Sheet
    const now = new Date();
    const ngaySua = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

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
      alert("Cập nhật thành công!");
      cust.HINH_ANH = imageUrl;
      btnSave.innerText = "✔ Đã lưu";
    } else {
      alert("Lỗi ghi dữ liệu Sheet: " + sheetJson.message);
      btnSave.disabled = false;
      btnSave.innerText = "💾 Lưu";
    }
  } catch (err) {
    console.error(err);
    alert("Thao tác thất bại, vui lòng thử lại!");
    btnSave.disabled = false;
    btnSave.innerText = "💾 Lưu";
  }
}