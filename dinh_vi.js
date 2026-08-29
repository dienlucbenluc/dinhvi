const API_URL = "https://script.google.com/macros/s/AKfycbzKm3QsCZeO8Ps8EOtujg9GkiZlVHVISHlwEqAajBysbSforCgJaDKMyc5j35MUpO91/exec";

let allLocations = [];
let currentId = null;
let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
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
    setCurrentUserAvatar(currentUser.avatar);
  }

  loadCurrentUserAvatar();

  restoreLocalSettings();
  loadInitData();
  
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    // Hỗ trợ bấm Enter trong ô tìm kiếm để thực hiện tìm
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === 'Enter') {
        saveLocalSettings();
        filterLocations();
      }
    });
  }

  ['loai_tim', 'jobSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveLocalSettings);
  });

  window.addEventListener('click', function(e) {
    if (!e.target.matches('.menu-btn')) {
      const dropdown = document.getElementById("menuDropdown");
      if (dropdown && dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
      }
    }
  });
});

function normalizeAvatarUrl(url) {
  if (!url) return "https://via.placeholder.com/40";
  url = String(url).trim();
  if (!url) return "https://via.placeholder.com/40";

  let m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (m && m[1]) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w100";

  m = url.match(/[?&]id=([^&#]+)/i);
  if (url.includes("drive.google.com") && m && m[1]) {
    return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w100";
  }

  m = url.match(/lh3\.googleusercontent\.com\/d\/([^/?#]+)/i);
  if (m && m[1]) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w100";

  return url;
}

function setCurrentUserAvatar(avatar) {
  const img = document.getElementById("userAvatarHeader");
  if (!img) return;
  img.onerror = function() {
    this.onerror = null;
    this.src = "https://via.placeholder.com/40";
  };
  img.src = normalizeAvatarUrl(avatar);
}

function loadCurrentUserAvatar() {
  if (!currentUser || !currentUser.ten_ndung) return;

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      action: "GET_USER_AVATAR",
      ten_ndung: currentUser.ten_ndung
    })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "success" && res.avatar) {
      if (currentUser.avatar !== res.avatar) {
        currentUser.avatar = res.avatar;
        localStorage.setItem("cmis_user_session", JSON.stringify(currentUser));
        setCurrentUserAvatar(res.avatar);
      }
    }
  })
  .catch(err => {
    console.error("Không lấy được avatar nhân viên:", err);
  });
}

function toggleMenu() {
  const dropdown = document.getElementById("menuDropdown");
  if (dropdown) dropdown.classList.toggle("show");
}

function saveLocalSettings() {
  localStorage.setItem("cmis_loai_tim", document.getElementById("loai_tim")?.value || "MKH");
  localStorage.setItem("cmis_jobSelect", document.getElementById("jobSelect")?.value || "");
  localStorage.setItem("cmis_searchInput", document.getElementById("searchInput")?.value || "");
}

function restoreLocalSettings() {
  const loai_tim = localStorage.getItem("cmis_loai_tim");
  if (loai_tim) {
    const el = document.getElementById("loai_tim");
    if(el) {
      el.value = loai_tim;
      el.dispatchEvent(new Event('change'));
    }
  }
  
  const searchInput = localStorage.getItem("cmis_searchInput");
  if (searchInput) {
    const el = document.getElementById("searchInput");
    if(el) el.value = searchInput;
  }
}

function populateDropdown(id1, id2, dataArray, defaultText) {
  let html = `<option value="">${defaultText}</option>`;
  dataArray.forEach(item => {
    html += `<option value="${item}">${item}</option>`;
  });
  const el1 = document.getElementById(id1);
  const el2 = document.getElementById(id2);
  if (el1) el1.innerHTML = html;
  if (el2) el2.innerHTML = html;
}

function applyInitData(res) {
  populateDropdown("jobSelect", "editJobSelect", res.cong_viec || [], "Chọn công việc");
  
  const savedJob = localStorage.getItem("cmis_jobSelect");
  if (savedJob) document.getElementById("jobSelect").value = savedJob;

  allLocations = res.locations || [];
  filterLocations();
}

function loadInitData() {
  const listElement = document.getElementById("locationList");

  const cachedData = localStorage.getItem("cmis_full_init_data");
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      applyInitData(parsed);
    } catch(e) {
      console.error(e);
    }
  } else if (listElement) {
    listElement.innerHTML = `
      <li style="text-align: center; padding: 20px;">
        <span class="spinner"></span>
        <span style="font-weight: bold; color: #007bff; vertical-align: middle; font-size: 15px;">Đang lấy danh sách...</span>
      </li>
    `;
  }

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({ action: "GET_INIT_DATA" })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "success") {
      localStorage.setItem("cmis_full_init_data", JSON.stringify(res));
      applyInitData(res);
    } else {
      if (listElement && !cachedData) listElement.innerHTML = `<li>Lỗi: ${res.message}</li>`;
    }
  })
  .catch(err => {
    console.error(err);
    if (listElement && !cachedData) listElement.innerHTML = `<li>Lỗi kết nối máy chủ! Vui lòng tải lại trang.</li>`;
  });
}

function parseTimeString(timeStr) {
  if (!timeStr) return 0;
  const str = String(timeStr).trim();
  const parts = str.split(/[\s,]+/);
  if (parts.length >= 2) {
    const datePart = parts.find(p => p.includes("/"));
    const timePart = parts.find(p => p.includes(":"));
    if (datePart && timePart) {
      const [day, month, year] = datePart.split("/").map(Number);
      const [hours, minutes, seconds] = timePart.split(":").map(Number);
      return new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0).getTime();
    }
  }
  const t = Date.parse(str);
  return isNaN(t) ? 0 : t;
}

function formatDateKey(timeStr) {
  const timestamp = parseTimeString(timeStr);
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function removeAccents(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

// LẤY DANH SÁCH KHÁCH HÀNG 2 NGÀY GẦN NHẤT CÓ DỮ LIỆU
function getRecentTwoDaysLocations(locations) {
  if (!locations || locations.length === 0) return [];

  // Lấy tập hợp các ngày duy nhất có dữ liệu nhập
  const uniqueDates = Array.from(
    new Set(locations.map(loc => formatDateKey(loc.time)).filter(d => d !== ""))
  ).sort().reverse(); // Sắp xếp giảm dần (ngày mới nhất đứng đầu)

  // Lấy 2 ngày gần nhất
  const recentTwoDates = uniqueDates.slice(0, 2);

  // Lọc danh sách thuộc 2 ngày đó
  const result = locations.filter(loc => recentTwoDates.includes(formatDateKey(loc.time)));
  result.sort((a, b) => parseTimeString(b.time) - parseTimeString(a.time));
  return result;
}

// TÌM KIẾM VÀ TỐI ƯU HÓA TÌM KIẾM
function filterLocations() {
  saveLocalSettings();
  const searchInput = document.getElementById("searchInput");
  const rawQuery = searchInput ? searchInput.value.trim() : "";
  
  // TRƯỜNG HỢP 1: Bỏ trống ô tìm kiếm -> Hiển thị danh sách 2 ngày liền kề
  if (!rawQuery) {
    const recentLocations = getRecentTwoDaysLocations(allLocations);
    renderList(recentLocations, false);
    return;
  }

  // TRƯỜNG HỢP 2: Bấm tìm kiếm -> Tìm tất cả khách hàng trong bảng dinh_vi
  const query = removeAccents(rawQuery.toLowerCase());

  const matchedLocations = allLocations.filter(loc => {
    const targetText = String(loc.ma_khang || "") + " " + 
                       String(loc.ten_khang || "") + " " + 
                       String(loc.so_cto || "") + " " +
                       String(loc.ten_tram || "") + " " +
                       String(loc.so_cot || "");
    const normalizedText = removeAccents(targetText.toLowerCase());
    return normalizedText.includes(query);
  });

  // Tính điểm ưu tiên hiển thị gần đúng nhất lên trên cùng
  function getMatchScore(loc) {
    const mk = removeAccents(String(loc.ma_khang || "").toLowerCase());
    const tk = removeAccents(String(loc.ten_khang || "").toLowerCase());
    const sc = removeAccents(String(loc.so_cto || "").toLowerCase());
    
    if (mk === query || sc === query) return 1; // Khớp chính xác Mã KH / Số CTơ
    if (mk.startsWith(query) || sc.startsWith(query) || tk.startsWith(query)) return 2; // Bắt đầu bằng từ khóa
    const words = tk.split(/\s+/);
    if (words.some(w => w.startsWith(query))) return 3; // Có từ bắt đầu bằng từ khóa
    return 4; // Khớp chứa bên trong
  }

  matchedLocations.sort((a, b) => {
    const scoreA = getMatchScore(a);
    const scoreB = getMatchScore(b);
    if (scoreA !== scoreB) {
      return scoreA - scoreB; // Điểm nhỏ hơn đứng trước
    }
    return parseTimeString(b.time) - parseTimeString(a.time); // Cùng điểm thì thời gian mới hơn đứng trước
  });

  renderList(matchedLocations, true);
}

function renderList(locations, isSearching) {
  const listElement = document.getElementById("locationList");
  const countElement = document.getElementById("locationCount");
  if(!listElement) return;

  // Hiển thị số lượng KH
  if(countElement) {
    if (isSearching) {
      countElement.innerText = `(${locations.length}/${allLocations.length})`;
    } else {
      countElement.innerText = `(${locations.length}/${allLocations.length})`;
    }
  }

  listElement.innerHTML = "";
  if (locations.length === 0) {
    listElement.innerHTML = "<li style='text-align: center; color: #777; padding: 15px;'>Không tìm thấy khách hàng phù hợp.</li>";
    return;
  }

  const fragment = document.createDocumentFragment();
  locations.forEach(loc => {
    const li = document.createElement("li");
    li.onclick = function() {
      const isAlreadySelected = this.classList.contains("selected");
      const allItems = listElement.querySelectorAll("li");
      allItems.forEach(item => item.classList.remove("selected"));
      if (!isAlreadySelected) {
        this.classList.add("selected");
      }
    };

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=$${loc.lat},${loc.lng}`;
    let dateOnly = "---";
    if (loc.time) {
      const strTime = String(loc.time).trim();
      const dateMatch = strTime.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (dateMatch) {
        dateOnly = dateMatch[0];
        let parts = dateOnly.split('/');
        if(parts.length === 3) {
          dateOnly = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
      } else {
        const d = new Date(strTime);
        if (!isNaN(d.getTime())) {
          const day = d.getDate().toString().padStart(2, '0');
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          dateOnly = `${day}/${month}/${d.getFullYear()}`;
        } else {
          dateOnly = strTime.split(/[ T]/)[0];
        }
      }
    }

    li.innerHTML = `
      <div class="loc-name">${loc.ma_khang} ${loc.ten_khang ? `- ${loc.ten_khang}` : ""}</div>
      <div class="loc-job" style="color: #d9534f; font-weight: bold; font-size: 12px; margin-bottom: 4px;">
        No: ${loc.so_cto ? loc.so_cto : "Chưa có"} | Trạm: ${loc.ten_tram ? loc.ten_tram : "Chưa có"} | Cột: ${loc.so_cot ? loc.so_cot : "Chưa có"}
      </div>
      <div class="loc-employee">👷 NV lấy tọa độ: ${loc.ten_nvien || "Chưa rõ"} - 🕒 ${dateOnly}</div>
      <div class="loc-job">📌 Công việc: ${loc.ten_cviec || "Chưa chọn"}</div>
      ${loc.note ? `<div class="loc-note">📝 Ghi chú: ${loc.note}</div>` : ""}
      <div class="coords">📍 Tọa độ: ${loc.lat}, ${loc.lng}</div>
      <div class="maps-row">
        <a class="maps-link" href="${mapsUrl}" target="_blank" onclick="event.stopPropagation();">🗺️ Xem Google Maps</a>
      </div>
      <div class="action-bar">
        <button class="btn-edit" onclick="event.stopPropagation(); openEditModal('${loc.id}')">✏️ Sửa</button>
        <button class="btn-delete" onclick="event.stopPropagation(); deleteLocation('${loc.id}')">🗑️ Xóa</button>
      </div>
    `;
    fragment.appendChild(li);
  });

  listElement.appendChild(fragment);
}

function showToast(msg, isPersistent = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerHTML = msg;
  toast.style.display = "block";
  if (!isPersistent) {
    setTimeout(() => { toast.style.display = "none"; }, 2500);
  }
}

function hideToast() {
  const toast = document.getElementById("toast");
  if (toast) toast.style.display = "none";
}

function getLocationAndSave() {
  const loaiTim = document.getElementById("loai_tim").value;
  const valInput = document.getElementById("locName").value.trim();
  const jobVal = document.getElementById("jobSelect").value;
  const noteVal = document.getElementById("noteInput").value.trim();

  if (!valInput) {
    showToast("Vui lòng nhập Mã KH hoặc 8 số cuối Số công tơ!");
    return;
  }

  showToast("⏳ Đang kiểm tra dữ liệu...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      action: "CHECK_EXISTS",
      search_type: loaiTim,
      search_value: valInput
    })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "exists") {
      showToast(res.message);
      return;
    }

    if (res.status === "not_found") {
      showToast(res.message);
      return;
    }

    if (res.status === "success") {
      getGPSAndSave(res.customerInfo, jobVal, noteVal);
    }
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối kiểm tra dữ liệu!");
  });
}

function getGPSAndSave(customerInfo, jobVal, noteVal) {
  if (!navigator.geolocation) {
    showToast("Trình duyệt không hỗ trợ định vị GPS!");
    return;
  }

  showToast("📡 Đang lấy vị trí GPS chính xác...", true);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const nowStr = new Date().toLocaleString("vi-VN");

      const payload = {
        action: "ADD",
        location: {
          ma_khang: customerInfo.ma_khang,
          ten_khang: customerInfo.ten_khang,
          so_cto: customerInfo.so_cto,
          ma_tram: customerInfo.ma_tram,
          ten_tram: customerInfo.ten_tram,
          so_cot: customerInfo.so_cot,
          ten_ndung: currentUser.ten_ndung,
          ten_nvien: currentUser.ten_nvien,
          ten_cviec: jobVal,
          note: noteVal,
          lat: lat,
          lng: lng,
          time: nowStr,
          trang_thai: 1
        }
      };

      showToast("💾 Đang lưu dữ liệu lên hệ thống...", true);

      fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify(payload)
      })
      .then(res => res.text())
      .then(text => JSON.parse(text))
      .then(res => {
        if (res.status === "success") {
          showToast("✅ Đã lưu định vị thành công!");
          document.getElementById("noteInput").value = "";
          
          allLocations.unshift(res.data);
          
          const cacheData = localStorage.getItem("cmis_full_init_data");
          if (cacheData) {
            try {
              let parsed = JSON.parse(cacheData);
              parsed.locations.unshift(res.data);
              localStorage.setItem("cmis_full_init_data", JSON.stringify(parsed));
            } catch(e) {}
          }
          
          filterLocations();
        } else {
          showToast("Lỗi: " + res.message);
        }
      })
      .catch(err => {
        console.error(err);
        showToast("Lỗi kết nối khi lưu dữ liệu!");
      });
    },
    (err) => {
      showToast("Không lấy được tọa độ GPS: " + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function openEditModal(id) {
  const loc = allLocations.find(item => item.id === id);
  if (!loc) return;

  currentId = id;
  document.getElementById("editLoaiTim").value = "MKH";
  document.getElementById("editNameInput").value = loc.ma_khang;
  document.getElementById("editJobSelect").value = loc.ten_cviec || "";
  document.getElementById("editNoteInput").value = loc.note || "";

  document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  currentId = null;
}

function saveEditLocation() {
  if (!currentId) return;

  const searchType = document.getElementById("editLoaiTim").value;
  const searchValue = document.getElementById("editNameInput").value.trim();
  const jobVal = document.getElementById("editJobSelect").value;
  const noteVal = document.getElementById("editNoteInput").value.trim();

  if (!searchValue) {
    showToast("Vui lòng nhập Mã KH hoặc Số công tơ!");
    return;
  }

  showToast("⏳ Đang cập nhật dữ liệu...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      action: "EDIT",
      id: currentId,
      search_type: searchType,
      search_value: searchValue,
      ten_cviec: jobVal,
      note: noteVal,
      ten_ndung: currentUser.ten_ndung,
      ten_nvien: currentUser.ten_nvien
    })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "success") {
      showToast("✅ Cập nhật thành công!");
      closeEditModal();

      const index = allLocations.findIndex(item => item.id === currentId);
      if (index !== -1) {
        allLocations[index] = res.data;
      }

      const cacheData = localStorage.getItem("cmis_full_init_data");
      if (cacheData) {
        try {
          let parsed = JSON.parse(cacheData);
          const cIndex = parsed.locations.findIndex(item => item.id === currentId);
          if (cIndex !== -1) parsed.locations[cIndex] = res.data;
          localStorage.setItem("cmis_full_init_data", JSON.stringify(parsed));
        } catch(e) {}
      }

      filterLocations();
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối khi cập nhật!");
  });
}

function deleteLocation(id) {
  if (!confirm("Bạn có chắc chắn muốn xóa vị trí định vị này?")) return;

  showToast("⏳ Đang xóa...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({ action: "DELETE", id: id })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "success") {
      showToast("🗑️ Đã xóa thành công!");
      allLocations = allLocations.filter(item => item.id !== id);

      const cacheData = localStorage.getItem("cmis_full_init_data");
      if (cacheData) {
        try {
          let parsed = JSON.parse(cacheData);
          parsed.locations = parsed.locations.filter(item => item.id !== id);
          localStorage.setItem("cmis_full_init_data", JSON.stringify(parsed));
        } catch(e) {}
      }

      filterLocations();
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối khi xóa!");
  });
}

function openPassModal() {
  document.getElementById("oldPassInput").value = "";
  document.getElementById("newPassInput").value = "";
  document.getElementById("passModal").style.display = "flex";
}

function closePassModal() {
  document.getElementById("passModal").style.display = "none";
}

function saveNewPassword() {
  const oldPass = document.getElementById("oldPassInput").value.trim();
  const newPass = document.getElementById("newPassInput").value.trim();

  if (!oldPass || !newPass) {
    showToast("Vui lòng nhập đầy đủ mật khẩu cũ và mới!");
    return;
  }

  showToast("⏳ Đang đổi mật khẩu...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      action: "CHANGE_PASSWORD",
      ten_ndung: currentUser.ten_ndung,
      mat_khau_cu: oldPass,
      mat_khau_moi: newPass
    })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
  .then(res => {
    if (res.status === "success") {
      showToast("🔑 Đổi mật khẩu thành công!");
      closePassModal();
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối máy chủ!");
  });
}
