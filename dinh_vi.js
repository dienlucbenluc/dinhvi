// ==================== CẤU HÌNH & BIẾN TOÀN CỤC ====================
const API_URL = "https://script.google.com/macros/s/AKfycbzQ43Xn_EshfAtY1Q5IeUpHUpv2kOBy3eH_k6Y6B3I-xI5B0T4Q5X8n8O5X8n8O5X8n/exec"; // Thay URL web app thực tế của bạn tại đây

let currentUser = null;
let allLocations = [];
let allJobs = [];
let selectedLocationId = null;
let isExistingCustomer = false;
let existingCustomerData = null;

// ==================== KHỞI TẠO ỨNG DỤNG ====================
document.addEventListener('DOMContentLoaded', () => {
    checkUserSession();
    initEventListeners();
    loadInitData();
});

function checkUserSession() {
    const sessionStr = localStorage.getItem("cmis_user_session");
    if (!sessionStr) {
        window.location.href = "login.html";
        return;
    }
    try {
        currentUser = JSON.parse(sessionStr);
        const userDisplayEl = document.getElementById("currentUserDisplay");
        if (userDisplayEl) {
            userDisplayEl.innerText = currentUser.ten_nvien || currentUser.ten_ndung || currentUser.username || "Nhân viên";
        }
        if (currentUser.avatar && document.getElementById("userAvatarHeader")) {
            document.getElementById("userAvatarHeader").src = currentUser.avatar;
        }
    } catch (e) {
        window.location.href = "login.html";
    }
}

function initEventListeners() {
    const loaiTimSelect = document.getElementById('loai_tim');
    const locNameInput = document.getElementById('locName');

    function updateInputState(selectEl, inputEl) {
        if (!selectEl || !inputEl) return;
        if (selectEl.value === 'MKH') { 
            inputEl.value = 'PB060600'; 
            inputEl.placeholder = '';
        } else { 
            inputEl.value = ''; 
            inputEl.placeholder = 'Nhập 8 số cuối'; 
        }
        resetGetLocationBtn();
    }

    if (loaiTimSelect && locNameInput) {
        loaiTimSelect.addEventListener('change', function() {
            updateInputState(this, locNameInput);
        });
        setTimeout(() => {
            updateInputState(loaiTimSelect, locNameInput);
        }, 150);
    }

    if (locNameInput) {
        locNameInput.addEventListener('input', resetGetLocationBtn);
    }

    const editLoaiTimSelect = document.getElementById('editLoaiTim');
    const editNameInput = document.getElementById('editNameInput');
    if (editLoaiTimSelect && editNameInput) {
        editLoaiTimSelect.addEventListener('change', function() {
            updateInputState(this, editNameInput);
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') searchLocations();
            else filterLocations();
        });
    }
}

// ==================== XỬ LÝ NÚT VÀ TRẠNG THÁI TỒN TẠI ====================
function resetGetLocationBtn() {
    isExistingCustomer = false;
    existingCustomerData = null;
    const btn = document.getElementById("btnGetLocation");
    if (btn) {
        btn.innerText = "📍 Lấy tọa độ vị trí treo công tơ";
        btn.className = "btn-get";
    }
}

function setRegetBtnState(data) {
    isExistingCustomer = true;
    existingCustomerData = data;
    const btn = document.getElementById("btnGetLocation");
    if (btn) {
        btn.innerText = "📍 Lấy lại tọa độ công tơ";
        btn.className = "btn-get btn-reget";
    }
}

function openRegetLocationModal() {
    const modal = document.getElementById("regetLocationModal");
    if (modal) modal.style.display = "flex";
}

function closeRegetLocationModal() {
    const modal = document.getElementById("regetLocationModal");
    if (modal) modal.style.display = "none";
}

function confirmRegetLocation() {
    closeRegetLocationModal();
    proceedGetGPS(true);
}

// ==================== ĐỊNH VỊ GPS VÀ TÌM KIẾM ====================
function getLocation() {
    if (isExistingCustomer) {
        openRegetLocationModal();
        return;
    }

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
            setRegetBtnState(res);
            const searchInput = document.getElementById("searchInput");
            if (searchInput) {
                searchInput.value = res.ma_khang;
                filterLocations();
            }
            return;
        }
        if (res.status === "not_found") {
            showToast(`❌ ${res.message}`);
            return;
        }
        proceedGetGPS(false);
    })
    .catch(err => {
        console.error(err);
        showToast("Lỗi kết nối máy chủ khi kiểm tra!");
    });
}

function proceedGetGPS(isReget) {
    showToast("⏳ Đang lấy tọa độ GPS...", true);
    if (!navigator.geolocation) {
        showToast("Trình duyệt không hỗ trợ định vị GPS");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        position => {
            executeSaveToServer(position.coords.latitude, position.coords.longitude, isReget);
        },
        error => {
            console.error(error);
            showToast("Vui lòng bật định vị GPS trên thiết bị.");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

function executeSaveToServer(lat, lng, isReget) {
    showToast("⏳ Đang xử lý lưu dữ liệu...", true);
    const searchType = document.getElementById("loai_tim").value;
    const searchValueInput = document.getElementById("locName").value.trim();
    const jobTitle = document.getElementById("jobSelect").value;
    let noteContent = document.getElementById("locNote").value.trim();

    if (isReget) {
        const oldNoteAppend = "tọa độ không chính xác";
        const regetNoteAppend = "Lấy lại tọa độ do tọa độ cũ không chính xác";

        if (existingCustomerData && existingCustomerData.ma_khang) {
            const existingLoc = allLocations.find(loc => loc.ma_khang === existingCustomerData.ma_khang);
            if (existingLoc) {
                if (!existingLoc.note) {
                    existingLoc.note = oldNoteAppend;
                } else if (!existingLoc.note.includes(oldNoteAppend)) {
                    existingLoc.note = existingLoc.note + " - " + oldNoteAppend;
                }
            }
        }

        if (!noteContent) {
            noteContent = regetNoteAppend;
        } else if (!noteContent.includes(regetNoteAppend)) {
            noteContent = noteContent + " - " + regetNoteAppend;
        }
    }

    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const payload = {
        action: "ADD",
        location: {
            search_type: searchType,
            search_value: searchValueInput,
            ten_ndung: currentUser.ten_ndung || "",
            ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung || "",
            ten_cviec: jobTitle,
            note: noteContent,
            lat: lat,
            lng: lng,
            time: timeStr
        }
    };

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
            showToast("🎉 Lưu vị trí định vị thành công!");
            
            const newLocation = {
                id: res.id,
                ma_khang: res.ma_khang,
                ten_khang: res.ten_khang,
                so_cto: res.so_cto,
                ma_tram: res.ma_tram,
                ten_tram: res.ten_tram,
                so_cot: res.so_cot,
                ten_ndung: currentUser.ten_ndung || "",
                ten_nvien: currentUser.ten_nvien || currentUser.ten_ndung || "",
                ten_cviec: jobTitle,
                note: noteContent,
                lat: lat,
                lng: lng,
                time: timeStr,
                trang_thai: 1
            };

            allLocations.unshift(newLocation);
            filterLocations();

            document.getElementById("locName").value = searchType === 'MKH' ? 'PB060600' : '';
            document.getElementById("locNote").value = "";
            resetGetLocationBtn();
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

// ==================== TẢI DỮ LIỆU BAN ĐẦU & HIỂN THỊ ====================
function loadInitData() {
    showToast("⏳ Đang tải danh sách...", true);
    fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify({ action: "GET_INITIAL_DATA" })
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === "success") {
            allLocations = res.locations || [];
            allJobs = res.jobs || [];
            renderJobs();
            filterLocations();
        } else {
            showToast("Tải dữ liệu thất bại!");
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Lỗi kết nối tải dữ liệu!");
    });
}

function renderJobs() {
    const jobSelect = document.getElementById("jobSelect");
    const editJobSelect = document.getElementById("editJobSelect");
    
    let html = `<option value="">--- Chọn công việc ---</option>`;
    allJobs.forEach(job => {
        html += `<option value="${job}">${job}</option>`;
    });

    if (jobSelect) jobSelect.innerHTML = html;
    if (editJobSelect) editJobSelect.innerHTML = html;
}

function filterLocations() {
    const query = (document.getElementById("searchInput") ? document.getElementById("searchInput").value : "").toLowerCase().trim();
    const filtered = allLocations.filter(loc => {
        return (loc.ma_khang || "").toLowerCase().includes(query) ||
               (loc.ten_khang || "").toLowerCase().includes(query) ||
               (loc.so_cto || "").toLowerCase().includes(query) ||
               (loc.ten_nvien || "").toLowerCase().includes(query) ||
               (loc.ten_cviec || "").toLowerCase().includes(query) ||
               (loc.note || "").toLowerCase().includes(query);
    });
    renderLocations(filtered);
}

function searchLocations() {
    filterLocations();
}

function renderLocations(locations) {
    const listEl = document.getElementById("locationList");
    if (!listEl) return;

    if (locations.length === 0) {
        listEl.innerHTML = `<li style="text-align:center; color:#888;">Không có dữ liệu định vị nào.</li>`;
        return;
    }

    let html = "";
    locations.forEach(loc => {
        const isSelected = selectedLocationId === loc.id;
        html += `
            <li class="${isSelected ? 'selected' : ''}" onclick="toggleSelectLocation('${loc.id}')">
                <div class="loc-name">${loc.ten_khang || 'Khách hàng'} - ${loc.ma_khang || ''}</div>
                <div class="loc-employee">👤 NV: ${loc.ten_nvien || loc.ten_ndung || 'N/A'} - 🗓 ${loc.time || ''}</div>
                <div class="loc-job">💼 CV: ${loc.ten_cviec || 'Chưa rõ'}</div>
                <div class="loc-note">📝 ${loc.note || 'Không có ghi chú'}</div>
                <div class="coords">📍 Tọa độ: ${loc.lat}, ${loc.lng}</div>
                <div class="maps-row">
                    <a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}" target="_blank" onclick="event.stopPropagation();">🗺 Xem trên Google Maps</a>
                </div>
                <div class="action-bar" onclick="event.stopPropagation();">
                    <button class="btn-edit" onclick="openEditModal('${loc.id}')">✏️ Sửa</button>
                    <button class="btn-delete" onclick="openConfirmModal('${loc.id}')">🗑️ Xóa</button>
                </div>
            </li>
        `;
    });
    listEl.innerHTML = html;
}

function toggleSelectLocation(id) {
    selectedLocationId = (selectedLocationId === id) ? null : id;
    filterLocations();
}

// ==================== CHỈNH SỬA & XÓA ====================
function openEditModal(id) {
    const loc = allLocations.find(item => item.id === id);
    if (!loc) return;
    selectedLocationId = id;

    document.getElementById("editLoaiTim").value = "MKH";
    document.getElementById("editNameInput").value = loc.ma_khang || "";
    document.getElementById("editJobSelect").value = loc.ten_cviec || "";
    document.getElementById("editNoteInput").value = loc.note || "";
    document.getElementById("editUpdateCoords").checked = false;

    document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("editModal").style.display = "none";
}

function saveEditLocation() {
    const searchType = document.getElementById("editLoaiTim").value;
    const searchValueInput = document.getElementById("editNameInput").value.trim();
    const jobTitle = document.getElementById("editJobSelect").value;
    const noteContent = document.getElementById("editNoteInput").value.trim();
    const isUpdateCoords = document.getElementById("editUpdateCoords").checked;

    if (!searchValueInput || !jobTitle) {
        showToast("Vui lòng điền đủ thông tin!");
        return;
    }

    if (isUpdateCoords) {
        if (!navigator.geolocation) {
            showToast("Trình duyệt không hỗ trợ GPS");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                executeEditSave(position.coords.latitude, position.coords.longitude);
            },
            error => {
                showToast("Lỗi lấy tọa độ mới khi cập nhật.");
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    } else {
        const loc = allLocations.find(item => item.id === selectedLocationId);
        executeEditSave(loc ? loc.lat : "", loc ? loc.lng : "");
    }
}

function executeEditSave(lat, lng) {
    showToast("⏳ Đang cập nhật...", true);
    const payload = {
        action: "UPDATE",
        id: selectedLocationId,
        location: {
            search_type: document.getElementById("editLoaiTim").value,
            search_value: document.getElementById("editNameInput").value.trim(),
            ten_cviec: document.getElementById("editJobSelect").value,
            note: document.getElementById("editNoteInput").value.trim(),
            lat: lat,
            lng: lng
        }
    };

    fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === "success") {
            showToast("Cập nhật thành công!");
            closeEditModal();
            loadInitData();
        } else {
            showToast(res.message);
        }
    })
    .catch(err => {
        showToast("Lỗi khi cập nhật!");
    });
}

function openConfirmModal(id) {
    selectedLocationId = id;
    document.getElementById("confirmModal").style.display = "flex";
}

function closeConfirmModal() {
    document.getElementById("confirmModal").style.display = "none";
}

function deleteLocation() {
    showToast("⏳ Đang xóa...", true);
    fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify({ action: "DELETE", id: selectedLocationId })
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === "success") {
            showToast("Xóa thành công!");
            closeConfirmModal();
            allLocations = allLocations.filter(loc => loc.id !== selectedLocationId);
            filterLocations();
        } else {
            showToast(res.message);
        }
    })
    .catch(err => {
        showToast("Lỗi kết nối khi xóa!");
    });
}

// ==================== CÁC HÀM BỔ TRỢ / THÔNG BÁO ====================
function openPageHome() {
    window.location.href = "login.html";
}

function closeDevModal() {
    const devModal = document.getElementById('devModal');
    if (devModal) devModal.style.display = 'none';
}

function handleLogout() {
    const menu = document.getElementById('menuDropdown');
    if (menu) menu.classList.remove('show');
    
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

function showToast(message, isKeep = false) {
    let toast = document.getElementById("customToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "customToast";
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            color: #fff;
            padding: 10px 18px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 99999;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 90%;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.display = "block";

    if (!isKeep) {
        setTimeout(() => {
            toast.style.display = "none";
        }, 3000);
    }
}
