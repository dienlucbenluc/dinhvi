const SPREADSHEET_ID = "1YjitfjIz9V7Uiprc989O5Z2155ARp36toiUQR0TKo_Q";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "LOGIN") return loginUser(data);
    if (action === "CHECK_EXISTS") return checkExistsDinhVi(data);
    if (action === "GET_INIT_DATA") return getInitData();
    if (action === "ADD") return addDinhVi(data.location);
    if (action === "EDIT") return editDinhVi(data);
    if (action === "DELETE") return deleteDinhVi(data);
    if (action === "CHANGE_PASSWORD") return changePassword(data);

    if (action === "GET_CHISO_DATA") return getChiSoData(data);
    if (action === "SAVE_CHISO") return saveChiSo(data);
    if (action === "CANCEL_CHISO") return cancelChiSo(data);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function checkExistsDinhVi(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const searchType = data.search_type || "MKH";
  const searchValue = String(data.search_value || "").trim().toUpperCase();

  const sheetDV = ss.getSheetByName("dinh_vi");
  if (sheetDV && sheetDV.getLastRow() >= 2) {
    const valuesDV = sheetDV.getRange(2, 1, sheetDV.getLastRow() - 1, 15).getValues();
    
    for (let i = 0; i < valuesDV.length; i++) {
      const maKh = String(valuesDV[i][1] || "").trim().toUpperCase();
      const soCto = String(valuesDV[i][3] || "").trim().toUpperCase();
      const trangThai = Number(valuesDV[i][14]);

      let isMatch = false;
      if (searchType === "MKH" && maKh === searchValue) {
        isMatch = true;
      } else if (searchType === "NO") {
        const soCto8 = soCto.length >= 8 ? soCto.slice(-8) : soCto;
        if (soCto8 === searchValue) isMatch = true;
      }

      if (isMatch && trangThai === 1) {
        return responseJSON({ 
          status: "exists", 
          message: `Mã/Số CTơ đã tồn tại trong bảng định vị!`,
          ma_khang: maKh
        });
      }
    }
  }

  const customerInfo = getCustomerInfoFast(ss, searchValue, searchType);
  if (!customerInfo) {
    return responseJSON({ 
      status: "not_found", 
      message: `Không tìm thấy khách hàng với ${searchType === "MKH" ? "Mã KH" : "Số công tơ"}: ${searchValue}` 
    });
  }

  return responseJSON({ status: "success", customerInfo: customerInfo });
}

function getCustomerInfoFast(ss, searchValue, searchType) {
  if (!searchValue) return null;
  const sheet = ss.getSheetByName("khach_hang");
  if (!sheet || sheet.getLastRow() < 2) return null;

  const searchStr = String(searchValue).trim().toUpperCase();
  const colIndex = searchType === "MKH" ? 1 : 3;
  const range = sheet.getRange(2, colIndex, sheet.getLastRow() - 1, 1);

  const finder = range.createTextFinder(searchStr);
  if (searchType === "MKH") {
    finder.matchEntireCell(true);
  } else {
    finder.matchEntireCell(false);
  }

  const results = finder.findAll();
  if (!results || results.length === 0) return null;

  for (let cell of results) {
    const row = cell.getRow();
    const rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
    const maKh = String(rowData[0] || "").trim().toUpperCase();
    const soCtoFull = String(rowData[2] || "").trim();

    let isMatch = false;
    if (searchType === "MKH" && maKh === searchStr) {
      isMatch = true;
    } else if (searchType === "NO") {
      const soCto8 = soCtoFull.length >= 8 ? soCtoFull.slice(-8).toUpperCase() : soCtoFull.toUpperCase();
      if (soCto8 === searchStr) isMatch = true;
    }

    if (isMatch) {
      return {
        ma_khang: maKh,
        ten_khang: String(rowData[1] || "").trim(),
        so_cto: soCtoFull,
        ma_tram: String(rowData[3] || "").trim(),
        ten_tram: String(rowData[4] || "").trim(),
        so_cot: String(rowData[5] || "").trim()
      };
    }
  }
  return null;
}

function loginUser(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetNV = ss.getSheetByName("nhan_vien");
  if (!sheetNV || sheetNV.getLastRow() < 2) return responseJSON({ status: "error", message: "Không tìm thấy dữ liệu" });

  const targetUser = String(data.ten_ndung || "").trim().toLowerCase();
  const targetPass = String(data.mat_khau || "").trim();

  const range = sheetNV.getRange(2, 1, sheetNV.getLastRow() - 1, 1);
  const finder = range.createTextFinder(targetUser).matchEntireCell(true);
  const result = finder.findNext();

  if (!result) {
    return responseJSON({ status: "error", message: "Tên người dùng không tồn tại!" });
  }

  const row = result.getRow();
  const rowData = sheetNV.getRange(row, 1, 1, 3).getValues()[0];
  const actualUser = String(rowData[0]).trim();
  const nameInSheet = String(rowData[1]).trim();
  const passInSheet = String(rowData[2]).trim();

  if (passInSheet !== targetPass) {
    return responseJSON({ status: "error", message: "Mật khẩu không chính xác!" });
  }

  const sheetLog = ss.getSheetByName("log_dangnhap");
  if (sheetLog) {
    const timeLog = data.time_log || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    sheetLog.appendRow([actualUser, timeLog]);
  }

  return responseJSON({ status: "success", ten_ndung: actualUser, ten_nvien: nameInSheet });
}

function changePassword(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetNV = ss.getSheetByName("nhan_vien");
  if (!sheetNV) return responseJSON({ status: "error", message: "Không tìm thấy sheet nhan_vien" });

  const values = sheetNV.getDataRange().getValues();
  const targetUser = String(data.ten_ndung || "").trim().toLowerCase();
  const oldPass = String(data.mat_khau_cu || "").trim();
  const newPass = String(data.mat_khau_moi || "").trim();

  for (let i = 1; i < values.length; i++) {
    const userInSheet = String(values[i][0] || "").trim().toLowerCase();
    const passInSheet = String(values[i][2] || "").trim();

    if (userInSheet === targetUser) {
      if (passInSheet !== oldPass) return responseJSON({ status: "error", message: "Mật khẩu cũ không đúng!" });
      sheetNV.getRange(i + 1, 3).setValue(newPass);
      return responseJSON({ status: "success", message: "Đổi mật khẩu thành công!" });
    }
  }
  return responseJSON({ status: "error", message: "Không tìm thấy thông tin tài khoản!" });
}

function getInitData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetDinhVi = ss.getSheetByName("dinh_vi");
  let locations = [];
  
  if (sheetDinhVi && sheetDinhVi.getLastRow() >= 2) {
    const values = sheetDinhVi.getRange(2, 1, sheetDinhVi.getLastRow() - 1, 15).getValues();
    locations = values
      .filter(row => String(row[14]) === "1")
      .reverse()
      .map(row => ({
        id: String(row[0]).trim(),
        ma_khang: row[1],
        ten_khang: row[2],
        so_cto: row[3],
        ma_tram: row[4],
        ten_tram: row[5],
        so_cot: row[6],
        ten_ndung: String(row[7] || "").trim(),
        ten_nvien: row[8],
        ten_cviec: row[9],
        note: row[10],
        lat: row[11],
        lng: row[12],
        time: row[13],
        trang_thai: Number(row[14])
      }));
  }

  const sheetCV = ss.getSheetByName("cong_viec");
  let cong_viec = [];
  if (sheetCV && sheetCV.getLastRow() >= 2) {
    cong_viec = sheetCV.getRange(2, 1, sheetCV.getLastRow() - 1, 1).getValues()
      .map(r => String(r[0]).trim()).filter(v => v !== "");
  }

  return responseJSON({ status: "success", locations: locations, cong_viec: cong_viec });
}

function addDinhVi(loc) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Chờ tối đa 30s nếu có máy khác đang lưu
  } catch (e) {
    return responseJSON({ status: "error", message: "Hệ thống đang quá tải, vui lòng thử lại sau vài giây!" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("dinh_vi");
    if (!sheet) return responseJSON({ status: "error", message: "Không tìm thấy sheet dinh_vi" });

    const customerInfo = getCustomerInfoFast(ss, loc.search_value || loc.ma_khang, loc.search_type || "MKH");
    if (!customerInfo) return responseJSON({ status: "error", message: "Không tìm thấy thông tin khách hàng" });

    const lastRow = sheet.getLastRow();
    let rowIndexToUpdate = -1;

    if (lastRow >= 2) {
      const values = sheet.getRange(2, 2, lastRow - 1, 14).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim().toUpperCase() === customerInfo.ma_khang) {
          if (Number(values[i][13]) === 1) {
            return responseJSON({ status: "error", message: `Khách hàng ${customerInfo.ma_khang} đã tồn tại!` });
          } else if (Number(values[i][13]) === 0) {
            rowIndexToUpdate = i + 2;
            break;
          }
        }
      }
    }

    const id = String(loc.id || Date.now()).trim();
    const rowData = [
      id, customerInfo.ma_khang, customerInfo.ten_khang, customerInfo.so_cto,
      customerInfo.ma_tram, customerInfo.ten_tram, customerInfo.so_cot,
      loc.ten_ndung || "", loc.ten_nvien || "", loc.ten_cviec || "",
      loc.note || "", loc.lat || "", loc.lng || "", loc.time || "", 1
    ];

    if (rowIndexToUpdate !== -1) {
      sheet.getRange(rowIndexToUpdate, 1, 1, 15).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    return responseJSON({ 
      status: "success", ten_khang: customerInfo.ten_khang, ma_khang: customerInfo.ma_khang, 
      so_cto: customerInfo.so_cto, ma_tram: customerInfo.ma_tram, ten_tram: customerInfo.ten_tram, 
      so_cot: customerInfo.so_cot, id: id 
    });
  } finally {
    lock.releaseLock();
  }
}

function editDinhVi(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return responseJSON({ status: "error", message: "Hệ thống đang bận, vui lòng thử lại sau!" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("dinh_vi");
    if (!sheet) return responseJSON({ status: "error", message: "Không tìm thấy sheet dinh_vi" });

    const targetId = String(data.id || "").trim();
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === targetId) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) return responseJSON({ status: "error", message: "Không tìm thấy dữ liệu" });

    const customerInfo = getCustomerInfoFast(ss, data.search_value || data.ma_khang, data.search_type || "MKH");
    if (!customerInfo) return responseJSON({ status: "error", message: "Không tìm thấy khách hàng" });

    const rowValues = [
      customerInfo.ma_khang, customerInfo.ten_khang, customerInfo.so_cto,
      customerInfo.ma_tram, customerInfo.ten_tram, customerInfo.so_cot,
      data.ten_ndung, data.ten_nvien || "", data.ten_cviec || "", data.note || ""
    ];
    sheet.getRange(rowIndex, 2, 1, 10).setValues([rowValues]);

    if (data.lat && data.lng) {
      sheet.getRange(rowIndex, 12, 1, 3).setValues([[data.lat, data.lng, data.time || ""]]);
    }

    return responseJSON({ 
      status: "success", ten_khang: customerInfo.ten_khang, ma_khang: customerInfo.ma_khang, 
      so_cto: customerInfo.so_cto, ma_tram: customerInfo.ma_tram, ten_tram: customerInfo.ten_tram, so_cot: customerInfo.so_cot
    });
  } finally {
    lock.releaseLock();
  }
}

function deleteDinhVi(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return responseJSON({ status: "error", message: "Hệ thống đang bận, vui lòng thử lại sau!" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("dinh_vi");
    if (!sheet) return responseJSON({ status: "error", message: "Không tìm thấy sheet dinh_vi" });

    const targetId = String(data.id).trim();
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();

    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === targetId) {
        sheet.getRange(i + 2, 15).setValue(0);
        return responseJSON({ status: "success" });
      }
    }
    return responseJSON({ status: "error", message: "Không tìm thấy id cần xóa" });
  } finally {
    lock.releaseLock();
  }
}

function getChiSoData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("chi_so");
  if (!sheet || sheet.getLastRow() < 2) return responseJSON({ status: "success", list: [] });

  const currentUser = String(data.ten_ndung || "").trim().toLowerCase();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 30).getValues();

  const list = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const tenNdungInRow = String(row[8] || "").trim().toLowerCase();

    if (tenNdungInRow === currentUser) {
      list.push({
        rowIndex: i + 2,
        ma_khang: row[0],
        ten_khang: row[1],
        dia_chi: row[2],
        ma_sogcs: row[3],
        danh_so: row[4],
        so_cot: row[5],
        ten_tram: row[6],
        so_cto: row[7],
        ten_ndung: row[8],
        ten_nvien: row[9],
        hsn: Number(row[10]) || 1,
        bcs: row[11],
        chiso_cu: Number(row[12]) || 0,
        chiso_moi: row[13] !== "" ? Number(row[13]) : "",
        san_luong: row[14],
        sluong_thao: Number(row[15]) || 0,
        tong_sluong: row[16],
        sluong_kt: Number(row[17]) || 0,
        chenh_lech: row[18],
        tyle_clech: row[19],
        ngay_nhap: row[23] ? Utilities.formatDate(new Date(row[23]), "GMT+7", "dd/MM/yyyy HH:mm:ss") : "",
        nguoi_nhap: row[24],
        lat: row[25],
        lng: row[26],
        so_dthoai: row[27] || "",
        ghi_chu: row[28] || "",
        nhap_cmis: row[29] !== undefined ? row[29] : 0
      });
    }
  }

  list.sort((a, b) => {
    const sogcsA = String(a.ma_sogcs || "").toUpperCase();
    const sogcsB = String(b.ma_sogcs || "").toUpperCase();

    if (sogcsA < sogcsB) return -1;
    if (sogcsA > sogcsB) return 1;

    const dsA = isNaN(a.danh_so) ? String(a.danh_so || "") : Number(a.danh_so);
    const dsB = isNaN(b.danh_so) ? String(b.danh_so || "") : Number(b.danh_so);

    if (dsA < dsB) return -1;
    if (dsA > dsB) return 1;
    return 0;
  });

  return responseJSON({ status: "success", list: list });
}

// HÀM SAVE_CHISO ĐÃ ĐƯỢC BỔ SUNG LOCKSERVICE & TỐI ƯU CỰC ĐẠI
function saveChiSo(data) {
  const lock = LockService.getScriptLock();
  try {
    // Chờ tối đa 30 giây để lấy quyền ghi, tránh 25 máy cùng ghi gây đè ô
    lock.waitLock(30000);
  } catch (e) {
    return responseJSON({ status: "error", message: "Hệ thống đang quá tải ghi dữ liệu, vui lòng bấm lưu lại!" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("chi_so");
    if (!sheet) return responseJSON({ status: "error", message: "Không tìm thấy sheet chi_so" });

    const items = data.items || [];
    if (items.length === 0) return responseJSON({ status: "success", message: "Không có dữ liệu cần cập nhật!" });

    const nowStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    const nguoiNhap = data.ten_nvien || data.ten_ndung;

    items.forEach(item => {
      const r = item.rowIndex;

      // 1. Cập nhật Ghi chú vào cột AC (cột 29)
      if (item.ghi_chu !== undefined) {
        sheet.getRange(r, 29).setValue(item.ghi_chu);
      }

      // 2. Cập nhật chỉ số mới và tính toán các cột N, O, Q, S, T, X, Y, AD
      if (item.chiso_moi !== "" && item.chiso_moi !== null && !isNaN(item.chiso_moi)) {
        const csMoi = Number(item.chiso_moi);
        const csCu = Number(item.chiso_cu) || 0;
        const hsn = Number(item.hsn) || 1;
        const sluongThao = Number(item.sluong_thao) || 0;
        const sluongKt = Number(item.sluong_kt) || 0;

        const sanLuong = Math.round((csMoi - csCu) * hsn);
        const tongSluong = sanLuong + sluongThao;
        const chenhLech = tongSluong - sluongKt;
        const tyleClech = sluongKt !== 0 ? ((tongSluong / sluongKt) * 100).toFixed(2) + "%" : "0%";

        // Ghi đồng thời dải cột N (14) đến T (20)
        sheet.getRange(r, 14, 1, 7).setValues([[
          csMoi,      // N (14): CS mới
          sanLuong,   // O (15): Sản lượng
          sluongThao, // P (16): Giữ nguyên
          tongSluong, // Q (17): Tổng SL
          sluongKt,   // R (18): Giữ nguyên
          chenhLech,  // S (19): Chênh lệch
          tyleClech   // T (20): Tỷ lệ chênh lệch
        ]]);

        // Cập nhật Ngày nhập (X), Người nhập (Y)
        sheet.getRange(r, 24, 1, 2).setValues([[nowStr, nguoiNhap]]);

        // Đặt giá trị 0 vào cột AD (cột 30) khi thực hiện LƯU
        sheet.getRange(r, 30).setValue(0);
      }

      // 3. Cập nhật Tọa độ Lat (Z/26), Lng (AA/27)
      if (item.lat !== undefined && item.lat !== "" && item.lng !== undefined && item.lng !== "") {
        sheet.getRange(r, 26, 1, 2).setValues([[item.lat, item.lng]]);
        if (!sheet.getRange(r, 24).getValue()) {
          sheet.getRange(r, 24, 1, 2).setValues([[nowStr, nguoiNhap]]);
        }
      }
    });

    return responseJSON({ status: "success", message: "Cập nhật dữ liệu thành công!" });
  } finally {
    lock.releaseLock(); // Luôn giải phóng khóa sau khi thực hiện xong
  }
}

function cancelChiSo(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return responseJSON({ status: "error", message: "Hệ thống đang quá tải, vui lòng thử lại!" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("chi_so");
    if (!sheet) return responseJSON({ status: "error", message: "Không tìm thấy sheet chi_so" });

    const rowIndices = data.rowIndices || [];

    rowIndices.forEach(r => {
      sheet.getRange(r, 14, 1, 2).clearContent();
      sheet.getRange(r, 17).clearContent();
      sheet.getRange(r, 19, 1, 2).clearContent();
      sheet.getRange(r, 24, 1, 2).clearContent();
    });

    return responseJSON({ status: "success", message: "Đã hủy chỉ số của khách hàng!" });
  } finally {
    lock.releaseLock();
  }
}
