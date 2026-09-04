const API_URL = "http://10.183.45.1/htcmis/php/dd_dinhvi_cto/api.php";

let allLocations = [];
let currentId = null;
let currentUser = null;

// Trạng thái khách hàng đã có định vị: lần bấm đầu kiểm tra, lần bấm tiếp theo cho phép lấy lại.
let isExistingLocation = false;
let existingLocationInfo = null;

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

  // Ưu tiên hiển thị Avatar ngay lập tức từ LocalStorage
  if (currentUser && currentUser.avatar) {
    setCurrentUserAvatar(currentUser.avatar);
  } else {
    setCurrentUserAvatar("");
  }

  // Kiểm tra hoặc cập nhật ngầm avatar từ server nếu cần
  loadCurrentUserAvatar();

  restoreLocalSettings();
  loadInitData();
  
  const searchInput = document.getElementById("searchInput");
  if(searchInput) {
    searchInput.addEventListener("input", () => {
      saveLocalSettings();
      filterLocations();
    });

    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        searchLocations();
      }
    });
  }

  ['loai_tim', 'jobSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveLocalSettings);
  });

  const locNameReset = document.getElementById("locName");
  const jobReset = document.getElementById("jobSelect");
  const loaiTimReset = document.getElementById("loai_tim");
  if (locNameReset) locNameReset.addEventListener("input", resetGetLocationButton);
  if (jobReset) jobReset.addEventListener("change", resetGetLocationButton);
  if (loaiTimReset) loaiTimReset.addEventListener("change", resetGetLocationButton);

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
  if (!url) return "";
  url = String(url).trim();
  if (!url) return "";

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

  // Lấy tên hiển thị: Nguyễn Đức Truyền
  const displayName = currentUser ? (currentUser.ten_nvien || currentUser.ten_ndung || "NT") : "NT";
  
  // Link tạo avatar chữ nổi bật đẹp mắt
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D6EFD&color=fff&bold=true`;

  // Sự kiện khi link Google Drive / Server bị lỗi tải ảnh
  img.onerror = function() {
    this.onerror = null; // Tránh lặp vô tận
    this.src = fallbackAvatar;
  };

  const formattedUrl = normalizeAvatarUrl(avatar);
  
  // Nếu có avatar thì gán, nếu rỗng gán thẳng fallback
  if (formattedUrl) {
    img.src = formattedUrl;
  } else {
    img.src = fallbackAvatar;
  }
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
  // 1. Đổ danh sách công việc vào Combobox
  populateDropdown("jobSelect", "editJobSelect", res.cong_viec || [], "Chọn công việc");
  
  const savedJob = localStorage.getItem("cmis_jobSelect");
  if (savedJob) document.getElementById("jobSelect").value = savedJob;

  // 2. Gán mảng khách hàng và cập nhật giao diện
  allLocations = res.locations || [];
  
  // Cập nhật số lượng trên nút bấm & hiển thị danh sách
  updateGetLocationButtonText();
  filterLocations();
}

function syncLocalCache() {
  const cachePayload = {
    status: "success",
    locations: allLocations,
    cong_viec: Array.from(document.getElementById("jobSelect")?.options || [])
                  .map(opt => opt.value).filter(v => v !== "")
  };
  localStorage.setItem("cmis_full_init_data", JSON.stringify(cachePayload));
}

function loadInitData() {
  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_INIT_DATA' })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      applyInitData(data);
      syncLocalCache();
    } else {
      showToast(data.message || "Không thể tải dữ liệu ban đầu");
    }
  })
  .catch(err => {
    console.error('Lỗi load dữ liệu:', err);
    showToast("Lỗi kết nối máy chủ khi tải dữ liệu!");
  });
}

function parseTimeString(timeStr) {
  if (!timeStr) return 0;
  const str = String(timeStr).trim();

  // Xử lý chuỗi định dạng DD/MM/YYYY HH:mm:ss
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (match) {
    const [, day, month, year, hours, minutes, seconds] = match.map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
  }

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

function isOverOneHour(timeStr) {
  if (!timeStr) return false;
  const recordedTime = parseTimeString(timeStr);
  if (!recordedTime) return false;
  
  const now = Date.now();
  const diffInMs = now - recordedTime;
  const ONE_HOUR_IN_MS = 60 * 60 * 1000;
  
  return diffInMs > ONE_HOUR_IN_MS;
}

function removeAccents(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

function searchLocations() {
  filterLocations();
}

function filterLocations() {
  const searchInput = document.getElementById("searchInput");
  const rawQuery = searchInput ? searchInput.value.trim() : "";

  // Nếu không nhập từ khóa tìm kiếm: Render toàn bộ danh sách khách hàng
  if (!rawQuery) {
    let sortedLocations = [...allLocations];
    // Sắp xếp an toàn: Ưu tiên dữ liệu mới nhất
    sortedLocations.sort((a, b) => {
      const timeA = parseTimeString(a.time) || 0;
      const timeB = parseTimeString(b.time) || 0;
      return timeB - timeA;
    });
    
    // Render tối đa 100 khách hàng đầu tiên
    renderList(sortedLocations.slice(0, 100));
    return;
  }

  const query = removeAccents(rawQuery.toLowerCase());

  function getMatchScore(loc) {
    const mk = removeAccents(String(loc.ma_khang || "").toLowerCase());
    const tk = removeAccents(String(loc.ten_khang || "").toLowerCase());
    const sc = removeAccents(String(loc.so_cto || "").toLowerCase());
    const nv = removeAccents(String(loc.ten_nvien || "").toLowerCase());
    const cv = removeAccents(String(loc.ten_cviec || "").toLowerCase());
    const note = removeAccents(String(loc.note || "").toLowerCase());

    if (mk === query || sc === query) return 1;
    if (mk.startsWith(query) || sc.startsWith(query) || tk.startsWith(query)) return 2;

    const words = tk.split(/\s+/);
    if (words.some(w => w.startsWith(query))) return 3;

    if (nv.startsWith(query) || cv.startsWith(query) || note.startsWith(query)) return 4;

    const targetText = `${mk} ${tk} ${sc} ${nv} ${cv} ${note}`;
    if (targetText.includes(query)) return 5;

    return 99;
  }

  const matchedLocations = allLocations.filter(loc => getMatchScore(loc) < 99);

  if (matchedLocations.length === 0) {
    renderList([]);
    return;
  }

  matchedLocations.sort((a, b) => {
    const scoreA = getMatchScore(a);
    const scoreB = getMatchScore(b);

    if (scoreA !== scoreB) return scoreA - scoreB;
    return parseTimeString(b.time) - parseTimeString(a.time);
  });

  renderList(matchedLocations.slice(0, 100));
}

function renderList(locations) {
  const listElement = document.getElementById("locationList");
  const countElement = document.getElementById("locationCount");
  
  if(!listElement) return;
  
  if(countElement) countElement.innerText = `(${allLocations.length})`;
  
  listElement.innerHTML = "";
  if (locations.length === 0) {
    listElement.innerHTML = "<li>Không có dữ liệu.</li>";
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

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    
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
      <div class="loc-employee">👷 NV lấy tọa độ: ${loc.ten_nvien ? loc.ten_nvien : "Chưa cập nhật"} (${loc.ten_cviec ? loc.ten_cviec : "Chưa cập nhật"})</div>
      <div class="loc-note">📝 Ghi chú: ${loc.note ? loc.note : "Không có ghi chú"}</div>
      <div class="coords">📍 Tọa độ: ${loc.lat || "Chưa có"}, ${loc.lng || "Chưa có"}</div>
      
      <div class="maps-row">
        ${(loc.lat && loc.lng) ? `<a href="${mapsUrl}" target="_blank" class="maps-link">🌏 Xem trên Google Maps</a>` : `<span style="color:#888; font-size: 13px;">Không có tọa độ</span>`}
        <span style="font-size: 13px; color: #555; font-weight: bold;">${dateOnly}</span>
      </div>
      
      <div class="action-bar">
        <button class="btn-edit" onclick="event.stopPropagation(); checkAndOpenEditModal('${loc.id}')">Sửa</button>
        <button class="btn-delete" onclick="event.stopPropagation(); checkAndOpenDeleteModal('${loc.id}')">Xóa</button>
      </div>
    `;
    
    fragment.appendChild(li);
  });
  
  listElement.appendChild(fragment);
}

function showToast(msg, keepOpen = false) {
  const oldToast = document.getElementById("custom-toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.id = "custom-toast";
  toast.innerText = msg;

  let bgColor = "#B22222"; 
  let msgLower = msg.toLowerCase();

  if (
    msgLower.includes("đã lưu vị trí công tơ") || 
    msgLower.includes("cập nhật thành công") || 
    msgLower.includes("xóa khách hàng thành công")
  ) {
    bgColor = "#28a745"; 
  } else if (msgLower.includes("đang")) {
    bgColor = "#007bff";
  }

  Object.assign(toast.style, {
    position: "fixed",
    top: "10px",            
    right: "10px",          
    transform: "translateX(120%)", 
    backgroundColor: bgColor,
    color: "white",
    padding: "12px 20px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    fontSize: "14px",
    fontWeight: "bold",
    zIndex: "10000",
    opacity: "0",
    transition: "all 0.3s ease-in-out",
    whiteSpace: "normal",   
    wordWrap: "break-word", 
    maxWidth: "300px",      
    textAlign: "left",      
    lineHeight: "1.4"
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  }, 10);

  if (!keepOpen) {
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(120%)";
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}

function getDistinctLocatedCustomerCount() {
  const distinctMaKhang = new Set();
  allLocations.forEach(loc => {
    if (String(loc.trang_thai) === "1" && loc.ma_khang !== undefined && loc.ma_khang !== null && String(loc.ma_khang).trim() !== "") {
      distinctMaKhang.add(String(loc.ma_khang).trim());
    }
  });
  return distinctMaKhang.size;
}

function updateGetLocationButtonText() {
  const btn = document.getElementById("btnGetLocation");
  if (!btn || isExistingLocation) return;
  btn.innerHTML = `📍 Lấy mới định vị công tơ (Đã lấy: ${getDistinctLocatedCustomerCount()})`;
}

function resetGetLocationButton() {
  const btn = document.querySelector(".btn-get");
  if (!btn) return;
  btn.classList.remove("btn-reget");
  isExistingLocation = false;
  existingLocationInfo = null;
  updateGetLocationButtonText();
}

function setRegetLocationButton(info) {
  const btn = document.querySelector(".btn-get");
  if (!btn) return;
  btn.classList.add("btn-reget");
  btn.innerHTML = "📍 Lấy lại tọa độ vị trí treo công tơ";
  isExistingLocation = true;
  existingLocationInfo = info || null;
}

function openRegetModal() {
  const modal = document.getElementById("regetModal");
  if (modal) modal.style.display = "flex";
}

function closeRegetModal() {
  const modal = document.getElementById("regetModal");
  if (modal) modal.style.display = "none";
}

function confirmRegetLocation() {
  closeRegetModal();
  getGPSAndSave(true);
}

function getLocation() {
  const searchType = document.getElementById("loai_tim").value;
  const searchValueInput = document.getElementById("locName").value.trim();
  const jobTitle = document.getElementById("jobSelect").value;

  if (!searchValueInput) {
    showToast("Vui lòng nhập thông tin tìm kiếm...");
    return;
  }

  if (searchType === 'MKH' && searchValueInput.length !== 13) {
    showToast("Mã KH phải nhập đúng 13 ký tự");
    return;
  }

  if (searchType === 'NO' && searchValueInput.length !== 8) {
    showToast("Số công tơ phải nhập đúng 8 ký tự cuối");
    return;
  }

  if (!jobTitle) {
    showToast("Vui lòng chọn Tên công việc");
    return;
  }

  if (isExistingLocation) {
    openRegetModal();
    return;
  }

  showToast("⏳ Đang kiểm tra bảng định vị...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({
      action: "CHECK_EXISTS",
      search_type: searchType,
      search_value: searchValueInput
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "exists") {
      setRegetLocationButton(res);

      const existingCustomer = allLocations.find(loc =>
        String(loc.ma_khang || "").trim() === String(res.ma_khang || "").trim() &&
        String(loc.trang_thai) === "1"
      );
      if (existingCustomer) renderList([existingCustomer]);

      showToast(`⚠️ Mã KH ${res.ma_khang} đã có tọa độ, nếu bạn muốn lấy lại tọa độ mới thì bấm lấy lại bên dưới.`);
      return;
    }

    if (res.status === "not_found") {
      showToast(`❌ ${res.message}`);
      return;
    }

    getGPSAndSave(false);
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối máy chủ khi kiểm tra!");
  });
}

function getGPSAndSave(isRelocate) {
  const searchType = document.getElementById("loai_tim").value;
  const searchValueInput = document.getElementById("locName").value.trim();
  const jobTitle = document.getElementById("jobSelect").value;
  const noteContent = document.getElementById("locNote").value.trim();

  showToast("⏳ Đang lấy tọa độ GPS...", true);

  if (!navigator.geolocation) {
    showToast("Trình duyệt không hỗ trợ định vị GPS");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      saveToServer(position.coords.latitude, position.coords.longitude, isRelocate);
    },
    error => {
      console.error(error);
      showToast("Vui lòng bật định vị GPS trên thiết bị.");
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );

  function saveToServer(lat, lng, isRelocate) {
    showToast("⏳ Đang xử lý lưu dữ liệu...", true);

    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const uniqueId = Date.now().toString();

    const locData = {
      id: uniqueId,
      search_type: searchType,
      search_value: searchValueInput,
      ten_ndung: currentUser.ten_ndung,
      ten_nvien: currentUser.ten_nvien,
      ten_cviec: jobTitle,
      note: isRelocate ? "Lấy lại tọa độ do tọa độ cũ không chính xác" : noteContent,
      lat: lat,
      lng: lng,
      time: timeStr,
      trang_thai: 1
    };

    const action = isRelocate ? "RELOCATE" : "ADD";

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({ action: action, location: locData })
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        locData.ma_khang = res.ma_khang;
        locData.ten_khang = res.ten_khang;
        locData.so_cto = res.so_cto;
        locData.ma_tram = res.ma_tram;
        locData.ten_tram = res.ten_tram;
        locData.so_cot = res.so_cot;

        allLocations = allLocations.filter(item => String(item.ma_khang) !== String(res.ma_khang));
        allLocations.unshift(locData);

        syncLocalCache();
        updateGetLocationButtonText();
        filterLocations();

        showToast(
          isRelocate
            ? `Đã lấy lại tọa độ công tơ: \n${res.ma_khang} - ${res.ten_khang}`
            : `Đã lưu vị trí công tơ: \n${res.ma_khang} - ${res.ten_khang}`
        );

        resetGetLocationButton();
        document.getElementById("locName").value = searchType === 'MKH' ? 'PB060600' : '';
        document.getElementById("locNote").value = "";
      } else {
        showToast(res.message);
      }
    })
    .catch(err => {
      showToast("Mạng chậm! Đang đồng bộ lại...");
      console.error(err);
      loadInitData();
    });
  }
}

function checkAndOpenEditModal(id) {
  const loc = allLocations.find(item => String(item.id) === String(id));
  if (!loc) return;

  if (loc.ten_ndung && loc.ten_ndung.toLowerCase() !== currentUser.ten_ndung.toLowerCase()) {
    showToast("Không thể sửa dữ liệu người khác nhập");
    return;
  }

  if (isOverOneHour(loc.time)) {
    showToast("Thông tin lưu quá 1 giờ, không thể sửa.");
    return;
  }

  openEditModal(id);
}

function checkAndOpenDeleteModal(id) {
  const loc = allLocations.find(item => String(item.id) === String(id));
  if (!loc) return;

  if (loc.ten_ndung && loc.ten_ndung.toLowerCase() !== currentUser.ten_ndung.toLowerCase()) {
    showToast("Không thể xóa dữ liệu người khác nhập");
    return;
  }

  if (isOverOneHour(loc.time)) {
    showToast("Thông tin lưu quá 1 giờ, không thể xóa.");
    return;
  }

  openConfirmModal(id);
}

function openEditModal(id) {
  currentId = id;
  const loc = allLocations.find(item => String(item.id) === String(id));
  if (loc) {
    document.getElementById("editLoaiTim").value = "MKH"; 
    document.getElementById("editNameInput").value = loc.ma_khang || "";
    document.getElementById("editJobSelect").value = loc.ten_cviec || "";
    document.getElementById("editNoteInput").value = loc.note || "";
    document.getElementById("editUpdateCoords").checked = false;

    document.getElementById("editModal").style.display = "flex";
  }
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  currentId = null;
}

function saveEditLocation() {
  const newSearchType = document.getElementById("editLoaiTim").value;
  const newSearchValue = document.getElementById("editNameInput").value.trim();
  const newJob = document.getElementById("editJobSelect").value;
  const newNote = document.getElementById("editNoteInput").value.trim();
  const updateCoords = document.getElementById("editUpdateCoords").checked;

  if (!newSearchValue || !newJob) {
    showToast("Vui lòng nhập đủ thông tin bắt buộc");
    return;
  }

  showToast("⏳ Đang xử lý sửa dữ liệu...", true);

  const sendEditRequest = (lat = "", lng = "", time = "") => {
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({
        action: "EDIT", id: currentId, search_type: newSearchType, search_value: newSearchValue,
        ten_nvien: currentUser.ten_nvien, ten_ndung: currentUser.ten_ndung, ten_cviec: newJob, note: newNote,
        lat: lat, lng: lng, time: time
      })
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        const loc = allLocations.find(item => String(item.id) === String(currentId));
        if (loc) {
          loc.ma_khang = res.ma_khang; loc.ten_khang = res.ten_khang;
          loc.so_cto = res.so_cto; loc.ma_tram = res.ma_tram;
          loc.ten_tram = res.ten_tram; loc.so_cot = res.so_cot;
          loc.ten_nvien = currentUser.ten_nvien; loc.ten_cviec = newJob; loc.note = newNote;
          if (lat && lng) {
            loc.lat = lat; loc.lng = lng; loc.time = time;
          }
        }
        syncLocalCache();
        filterLocations();
        closeEditModal();
        showToast("Cập nhật thành công!");
      } else {
        showToast("Lỗi: " + res.message);
      }
    })
    .catch(err => {
      showToast("Lỗi kết nối máy chủ thất bại.");
      console.error(err);
    });
  };

  if (updateCoords) {
    if (!navigator.geolocation) {
      showToast("Lỗi: Trình duyệt không hỗ trợ GPS");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const now = new Date();
        const timeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        sendEditRequest(position.coords.latitude, position.coords.longitude, timeStr);
      },
      error => {
        console.error(error);
        showToast("Không lấy được tọa độ GPS, vui lòng bật định vị");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  } else {
    sendEditRequest();
  }
}

function openConfirmModal(id) {
  currentId = id;
  document.getElementById("confirmModal").style.display = "flex";
}

function closeConfirmModal() {
  document.getElementById("confirmModal").style.display = "none";
  currentId = null;
}

function deleteLocation() {
  if (!currentId) return;

  const btn = document.getElementById("btnConfirmDelete");
  if(btn) btn.disabled = true;

  showToast("⏳ Đang xử lý xóa khách hàng...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({ action: "DELETE", id: currentId, ten_ndung: currentUser.ten_ndung })
  })
  .then(res => res.json())
  .then(res => {
    if(btn) btn.disabled = false;
    if (res.status === "success") {
      allLocations = allLocations.filter(loc => String(loc.id) !== String(currentId));
      syncLocalCache();
      filterLocations();
      closeConfirmModal();
      showToast("Xóa khách hàng thành công!");
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    if(btn) btn.disabled = false;
    showToast("Lỗi kết nối máy chủ...");
    console.error(err);
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
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({
      action: "CHANGE_PASSWORD",
      ten_ndung: currentUser.ten_ndung,
      mat_khau_cu: oldPass,
      mat_khau_moi: newPass
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      showToast("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
      closePassModal();
      setTimeout(() => {
        localStorage.removeItem("cmis_user_session");
        window.location.href = "login.html";
      }, 1500);
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    showToast("Lỗi kết nối máy chủ!");
    console.error(err);
  });
}
