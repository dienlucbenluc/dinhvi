// URL của Web App sau khi Deploy từ Google Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycby_pM4151Q4xksPdnJkFflE3TNVJEO1R-WKuewTwukJZ-8fee26sBH-eHE8pl5EQMLSEQ/exec"; 

let allLocations = [];
let currentId = null;

// Khởi chạy khi load trang
document.addEventListener("DOMContentLoaded", () => {
  restoreLocalSettings(); 
  loadInitData(); 
  
  const searchInput = document.getElementById("searchInput");
  if(searchInput) {
    searchInput.addEventListener("input", () => {
      saveLocalSettings();
      filterLocations();
    });
  }

  ['loai_tim', 'jobSelect', 'employeeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveLocalSettings);
  });
});

function saveLocalSettings() {
  localStorage.setItem("cmis_loai_tim", document.getElementById("loai_tim")?.value || "MKH");
  localStorage.setItem("cmis_jobSelect", document.getElementById("jobSelect")?.value || "");
  localStorage.setItem("cmis_employeeSelect", document.getElementById("employeeSelect")?.value || "");
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

function loadInitData() {
  const listElement = document.getElementById("locationList");
  if(listElement) {
    listElement.innerHTML = `
      <li style="text-align: center; padding: 20px;">
        <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj48Y2lyY2xlIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjQ1IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDdiZmYiIHN0cm9rZS13aWR0aD0iMTAiIHN0cm9rZS1kYXNoYXJyYXk9IjIzMCAxMDAiPjxhbmltYXRlVHJhbnNmb3JtIGF0dHJpYnV0ZU5hbWU9InRyYW5zZm9ybSIgdHlwZT0icm90YXRlIiBmcm9tPSIwIDEwMCAxMDAiIHRvPSIzNjAgMTAwIDEwMCIgZHVyPSIxcyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L2NpcmNsZT48L3N2Zz4=" alt="loading" style="width: 30px; height: 30px; vertical-align: middle; margin-right: 10px;">
        <span style="font-weight: bold; color: #007bff; vertical-align: middle; font-size: 15px;">Đang lấy danh sách...</span>
      </li>
    `;
  }

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "GET_INIT_DATA" })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "success") {
      populateDropdown("jobSelect", "editJobSelect", res.cong_viec, "Công việc");
      populateDropdown("employeeSelect", "editEmployeeSelect", res.nhan_vien, "Chọn nhân viên");
      
      const savedJob = localStorage.getItem("cmis_jobSelect");
      if (savedJob) document.getElementById("jobSelect").value = savedJob;
      
      const savedEmp = localStorage.getItem("cmis_employeeSelect");
      if (savedEmp) document.getElementById("employeeSelect").value = savedEmp;

      allLocations = res.locations || [];
      filterLocations();
    } else {
      if(listElement) listElement.innerHTML = `<li>Lỗi: ${res.message}</li>`;
    }
  })
  .catch(err => {
    console.error(err);
    if(listElement) listElement.innerHTML = `<li>Lỗi kết nối máy chủ!</li>`;
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
  
  locations.forEach(loc => {
    const li = document.createElement("li");
    li.onclick = function() {
        this.classList.toggle("selected");
    };

    const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    
    // --- BẮT ĐẦU ĐOẠN XỬ LÝ LỌC NGÀY ---
    let dateOnly = "---";
    if (loc.time) {
        const strTime = String(loc.time).trim();
        
        // Dùng Regex tìm đúng cụm có dạng số/số/số (vd: 18/8/2026 hoặc 19/08/2026)
        const dateMatch = strTime.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        
        if (dateMatch) {
            // Nếu tìm thấy, lấy đúng ngày tháng năm đó
            dateOnly = dateMatch[0]; 
            
            // Chuẩn hóa luôn (vd: 18/8/2026 -> 18/08/2026) cho đồng bộ và đẹp mắt
            let parts = dateOnly.split('/');
            if(parts.length === 3) {
                dateOnly = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
            }
        } else {
            // Backup nếu dữ liệu dạng ISO chuẩn quốc tế (2026-08-19T...)
            const d = new Date(strTime);
            if (!isNaN(d.getTime())) {
                const day = d.getDate().toString().padStart(2, '0');
                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                dateOnly = `${day}/${month}/${d.getFullYear()}`;
            } else {
                // Bí quá thì cắt bỏ phần T hoặc khoảng trắng
                dateOnly = strTime.split(/[ T]/)[0]; 
            }
        }
    }
    // --- KẾT THÚC ĐOẠN XỬ LÝ LỌC NGÀY ---
    
    li.innerHTML = `
      <div class="loc-name">${loc.ma_khang} ${loc.ten_khang ? `- ${loc.ten_khang}` : ""}</div>
      <div class="loc-job" style="color: #d9534f; font-weight: bold; font-size: 12px; margin-bottom: 4px;">
          No: ${loc.so_cto ? loc.so_cto : "---"} | Trạm: ${loc.ten_tram ? loc.ten_tram : "---"} | Cột: ${loc.so_cot ? loc.so_cot : "---"}
      </div>
      <div class="loc-employee">👤 NV lấy tọa độ: ${loc.ten_nvien ? loc.ten_nvien : "Chưa cập nhật"} (${loc.ten_cviec ? loc.ten_cviec : "Chưa cập nhật"})</div>
      <div class="loc-note">📝 Ghi chú: ${loc.note ? loc.note : "Không có ghi chú"}</div>
      <div class="coords">📍 Tọa độ: ${loc.lat || "Chưa có"}, ${loc.lng || "Chưa có"}</div>
      
      <div class="maps-row">
        ${(loc.lat && loc.lng) ? `<a href="${mapsUrl}" target="_blank" class="maps-link">Xem trên Google Maps</a>` : `<span style="color:#888; font-size: 13px;">Không có tọa độ</span>`}
        
        <span style="font-size: 13px; color: #555; font-weight: bold;">${dateOnly}</span>
      </div>
      
      <div class="action-bar">
        <button class="btn-edit" onclick="event.stopPropagation(); openEditModal('${loc.id}')">Sửa</button>
        <button class="btn-delete" onclick="event.stopPropagation(); openConfirmModal('${loc.id}')">Xóa</button>
      </div>
    `;
    listElement.appendChild(li);
  });
}

function showToast(msg) {
  const oldToast = document.getElementById("custom-toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.id = "custom-toast";
  toast.innerText = msg;

  let bgColor = "#28a745"; 
  let msgLower = msg.toLowerCase();
  if (msgLower.includes("lỗi") || msgLower.includes("vui lòng") || msgLower.includes("không") || msgLower.includes("hủy") || msgLower.includes("sai")) {
    bgColor = "#dc3545"; 
  }

  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",            
    right: "20px",          
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

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(120%)";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function getLocation() {
  const searchType = document.getElementById("loai_tim").value;
  const searchValueInput = document.getElementById("locName").value.trim();
  const employeeName = document.getElementById("employeeSelect").value;
  const jobTitle = document.getElementById("jobSelect").value;
  const noteContent = document.getElementById("locNote").value.trim();

  if (!searchValueInput) {
    showToast("Vui lòng nhập thông tin tìm kiếm!");
    return;
  }
  
  if (searchType === 'MKH' && searchValueInput.length !== 13) {
    showToast("Lỗi: MKH phải nhập đúng 13 ký tự!");
    return;
  }
  
  if (searchType === 'NO' && searchValueInput.length !== 8) {
    showToast("Lỗi: Số công tơ phải nhập đúng 8 ký tự!");
    return;
  }

  if (!employeeName) {
    showToast("Vui lòng chọn Tên nhân viên!");
    return;
  }
  if (!jobTitle) {
    showToast("Vui lòng chọn Tên công việc!");
    return;
  }

  showToast("Đang lấy tọa độ, vui lòng đợi...");

  const saveToServer = (lat, lng) => {
    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const uniqueId = Date.now().toString();

    const locData = {
      id: uniqueId, search_type: searchType, search_value: searchValueInput,
      ten_nvien: employeeName, ten_cviec: jobTitle, note: noteContent,
      lat: lat, lng: lng, time: timeStr
    };

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ADD", location: locData })
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        locData.ma_khang = res.ma_khang; locData.ten_khang = res.ten_khang;
        locData.so_cto = res.so_cto; locData.ma_tram = res.ma_tram;
        locData.ten_tram = res.ten_tram; locData.so_cot = res.so_cot;
        
        allLocations.unshift(locData);
        allLocations.sort((a, b) => parseTimeString(b.time) - parseTimeString(a.time));
        filterLocations();

        showToast(`Đã lưu vị trí: \n${res.ma_khang} - ${res.ten_khang}`);
        document.getElementById("locName").value = searchType === 'MKH' ? 'PB060600' : '';
        document.getElementById("locNote").value = "";
      } else {
        showToast("Lỗi: " + res.message);
      }
    })
    .catch(err => {
      showToast("Lỗi kết nối máy chủ!");
      console.error(err);
    });
  };

  if (!navigator.geolocation) {
    showToast("Lỗi: Trình duyệt của bạn không hỗ trợ định vị GPS!");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      saveToServer(position.coords.latitude, position.coords.longitude);
    },
    error => {
      console.error(error);
      showToast("Lỗi: Vui lòng BẬT ĐỊNH VỊ (GPS) trên máy để lưu!");
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

// ---- CÁC HÀM XỬ LÝ MODAL SỬA & XÓA ----
function openEditModal(id) {
  currentId = id;
  const loc = allLocations.find(item => String(item.id) === String(id));
  if (loc) {
    document.getElementById("editLoaiTim").value = "MKH"; 
    document.getElementById("editNameInput").value = loc.ma_khang || "";
    document.getElementById("editEmployeeSelect").value = loc.ten_nvien || "";
    document.getElementById("editJobSelect").value = loc.ten_cviec || "";
    document.getElementById("editNoteInput").value = loc.note || "";
    
    // Reset checkbox tọa độ và mật khẩu
    document.getElementById("editUpdateCoords").checked = false;
    document.getElementById("editPassword").value = "";

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
  const newEmployee = document.getElementById("editEmployeeSelect").value;
  const newJob = document.getElementById("editJobSelect").value;
  const newNote = document.getElementById("editNoteInput").value.trim();
  const updateCoords = document.getElementById("editUpdateCoords").checked;
  const password = document.getElementById("editPassword").value.trim();

  if (!newSearchValue || !newEmployee || !newJob) {
    showToast("Vui lòng nhập đủ thông tin bắt buộc!");
    return;
  }

  if (!password) {
    showToast("Lỗi: Vui lòng nhập Mật khẩu nhân viên để xác nhận sửa!");
    return;
  }

  showToast("Đang xử lý...");

  const sendEditRequest = (lat = "", lng = "", time = "") => {
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "EDIT", id: currentId, search_type: newSearchType, search_value: newSearchValue,
        ten_nvien: newEmployee, ten_cviec: newJob, note: newNote, mat_khau: password,
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
          loc.ten_nvien = newEmployee; loc.ten_cviec = newJob; loc.note = newNote;
          if (lat && lng) {
            loc.lat = lat; loc.lng = lng; loc.time = time;
          }
        }
        filterLocations();
        closeEditModal();
        showToast("Cập nhật thành công!");
      } else {
        showToast("Lỗi: " + res.message);
      }
    })
    .catch(err => {
      showToast("Lỗi kết nối máy chủ!");
      console.error(err);
    });
  };

  // Nếu muốn cập nhật tọa độ
  if (updateCoords) {
    if (!navigator.geolocation) {
      showToast("Lỗi: Trình duyệt không hỗ trợ GPS!");
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
        showToast("Lỗi: Không lấy được tọa độ GPS, vui lòng BẬT ĐỊNH VỊ!");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  } else {
    // Không cập nhật tọa độ
    sendEditRequest();
  }
}

function openConfirmModal(id) {
  currentId = id;
  document.getElementById("deletePassword").value = ""; // Xóa trắng MK
  document.getElementById("confirmModal").style.display = "flex";
}

function closeConfirmModal() {
  document.getElementById("confirmModal").style.display = "none";
  currentId = null;
}

function deleteLocation() {
  if (!currentId) return;
  const password = document.getElementById("deletePassword").value.trim();
  
  if (!password) {
    showToast("Lỗi: Vui lòng nhập Mật khẩu nhân viên để xác nhận xóa!");
    return;
  }

  const btn = document.getElementById("btnConfirmDelete");
  if(btn) btn.disabled = true;

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "DELETE", id: currentId, mat_khau: password })
  })
  .then(res => res.json())
  .then(res => {
    if(btn) btn.disabled = false;
    if (res.status === "success") {
      allLocations = allLocations.filter(loc => String(loc.id) !== String(currentId));
      filterLocations();
      closeConfirmModal();
      showToast("Xóa thành công!");
    } else {
      showToast("Lỗi: " + res.message);
    }
  })
  .catch(err => {
    if(btn) btn.disabled = false;
    showToast("Lỗi không lấy được dữ liệu...");
    console.error(err);
  });
}
