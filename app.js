const API_URL = "https://script.google.com/macros/s/AKfycbxJZHenN4zoxZR7wOk4SiBnUx071LKLdAWOdJLToJPScSdBIj8Qn_pOeTDAABlN_UAF/exec"; 

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
    userDisplay.innerText = `👤 ${currentUser.ten_nvien}`;
  }

  restoreLocalSettings(); 
  loadInitData(); 
  
  const searchInput = document.getElementById("searchInput");
  if(searchInput) {
    searchInput.addEventListener("input", () => {
      saveLocalSettings();
      filterLocations();
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

function syncLocalCache() {
  const cachePayload = {
    status: "success",
    locations: allLocations,
    cong_viec: Array.from(document.getElementById("jobSelect")?.options || [])
                  .map(opt => opt.value).filter(v => v !== "")
  };
  localStorage.setItem("cmis_full_init_data", JSON.stringify(cachePayload));
}

// TỐI ƯU TỐC ĐỘ: BẬT NAY CACHE TỪ LOCALSTORAGE
function loadInitData() {
  const listElement = document.getElementById("locationList");

  // 1. Đọc dữ liệu từ Cache bộ nhớ trước (Mở app trong 0.1 giây)
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

  // 2. Tải dữ liệu mới nhất ngầm từ Server về để cập nhật
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

function removeAccents(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

function filterLocations() {
  const searchInput = document.getElementById("searchInput");
  const rawQuery = searchInput ? searchInput.value.trim() : "";
  
  if (!rawQuery) {
    renderList(allLocations);
    return;
  }

  const query = removeAccents(rawQuery.toLowerCase());

  const filtered = allLocations.filter(loc => {
    const fullText = String(loc.ma_khang || "") + " " + 
                     String(loc.ten_khang || "") + " " + 
                     String(loc.so_cto || "") + " " + 
                     String(loc.ten_nvien || "") + " " + 
                     String(loc.ten_cviec || "") + " " + 
                     String(loc.note || "");
                     
    const normalizedText = removeAccents(fullText.toLowerCase());
    return normalizedText.includes(query);
  });
  
  renderList(filtered);
}

function renderList(locations) {
  const listElement = document.getElementById("locationList");
  const countElement = document.getElementById("locationCount");
  
  if(!listElement) return;
  if(countElement) countElement.innerText = `(${locations.length}/${allLocations.length})`;
  
  listElement.innerHTML = "";
  if (locations.length === 0) {
    listElement.innerHTML = "<li>Không có dữ liệu.</li>";
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  locations.forEach(loc => {
    const li = document.createElement("li");
    li.onclick = function() {
        this.classList.toggle("selected");
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
      <div class="loc-employee">👤 NV lấy tọa độ: ${loc.ten_nvien ? loc.ten_nvien : "Chưa cập nhật"} (${loc.ten_cviec ? loc.ten_cviec : "Chưa cập nhật"})</div>
      <div class="loc-note">📝 Ghi chú: ${loc.note ? loc.note : "Không có ghi chú"}</div>
      <div class="coords">📍 Tọa độ: ${loc.lat || "Chưa có"}, ${loc.lng || "Chưa có"}</div>
      
      <div class="maps-row">
        ${(loc.lat && loc.lng) ? `<a href="${mapsUrl}" target="_blank" class="maps-link">Xem trên Google Maps</a>` : `<span style="color:#888; font-size: 13px;">Không có tọa độ</span>`}
        
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

function getLocation() {
  const searchType = document.getElementById("loai_tim").value;
  const searchValueInput = document.getElementById("locName").value.trim();
  const jobTitle = document.getElementById("jobSelect").value;
  const noteContent = document.getElementById("locNote").value.trim();

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

  showToast("⏳ Đang kiểm tra bảng định vị...", true);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      action: "CHECK_EXISTS",
      search_type: searchType,
      search_value: searchValueInput
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "exists") {
      showToast(`⚠️ Mã KH ${res.ma_khang} ĐÃ TỒN TẠI trong bảng định vị!`);
      
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        searchInput.value = res.ma_khang;
        saveLocalSettings();
        filterLocations();
      }
      return;
    }

    if (res.status === "not_found") {
      showToast(`❌ ${res.message}`);
      return;
    }

    showToast("⏳ Đang lấy tọa độ GPS...", true);

    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị GPS");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        saveToServer(position.coords.latitude, position.coords.longitude);
      },
      error => {
        console.error(error);
        showToast("Vui lòng bật định vị GPS trên thiết bị.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  })
  .catch(err => {
    console.error(err);
    showToast("Lỗi kết nối máy chủ khi kiểm tra!");
  });

  const saveToServer = (lat, lng) => {
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
      note: noteContent,
      lat: lat, 
      lng: lng, 
      time: timeStr,
      trang_thai: 1
    };

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({ action: "ADD", location: locData })
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
        filterLocations();

        showToast(`Đã lưu vị trí công tơ: \n${res.ma_khang} - ${res.ten_khang}`);
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
  };
}

function checkAndOpenEditModal(id) {
  const loc = allLocations.find(item => String(item.id) === String(id));
  if (!loc) return;

  if (loc.ten_ndung && loc.ten_ndung.toLowerCase() !== currentUser.ten_ndung.toLowerCase()) {
    showToast("Không thể sửa dữ liệu người khác nhập");
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
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        action: "EDIT", id: currentId, search_type: newSearchType, search_value: newSearchValue,
        ten_nvien: currentUser.ten_nvien, ten_ndung: currentUser.ten_ndung, ten_cviec: newJob, note: newNote,
        lat: lat, lng: lng, time: time
      })
    })
    .then(res => res.text())
    .then(text => JSON.parse(text))
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
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({ action: "DELETE", id: currentId, ten_ndung: currentUser.ten_ndung })
  })
  .then(res => res.text())
  .then(text => JSON.parse(text))
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
