/**
 * tamngung_capdien.gs
 * Backend Google Apps Script cho trang tamngung_capdien.html
 */
function doGet() {
  return HtmlService
    .createTemplateFromFile('tamngung_capdien')
    .evaluate()
    .setTitle('Tạm ngừng cấp điện')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const TAMNGUNG_SHEET_NAME = 'tamngung_capdien';

/**
 * Lấy danh sách khách hàng cho frontend.
 */
function getTamNgungCapDienList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TAMNGUNG_SHEET_NAME);

  if (!sh) {
    throw new Error('Không tìm thấy sheet: ' + TAMNGUNG_SHEET_NAME);
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => {
    map[normalizeHeader_(h)] = i;
  });

  const idx = name => {
    const i = map[normalizeHeader_(name)];
    return i === undefined ? -1 : i;
  };

  const iMaKhang = firstIndex_(idx, ['MA_KHANG', 'ma_khang']);
  const iTenKhang = firstIndex_(idx, ['TEN_KHANG', 'ten_khang']);
  const iMaSogcs = firstIndex_(idx, ['MA_SOGCS', 'ma_sogcs']);
  const iDanhSo = firstIndex_(idx, ['DANH_SO', 'danh_so']);
  const iSoCto = firstIndex_(idx, ['SO_CTO', 'so_cto']);
  const iVtri = firstIndex_(idx, ['VTRI_DNOI', 'vtri_dnoi', 'SO_COT', 'so_cot']);
  const iTenTram = firstIndex_(idx, ['TEN_TRAM', 'ten_tram']);
  const iLat = firstIndex_(idx, ['LAT', 'lat']);
  const iLng = firstIndex_(idx, ['LNG', 'lng']);
  const iHinhAnh = firstIndex_(idx, ['HINH_ANH', 'hinh_anh']);
  const iTinhTrang = firstIndex_(idx, ['TINH_TRANG', 'tinh_trang']);

  if (iMaKhang < 0) {
    throw new Error('Sheet tamngung_capdien chưa có cột MA_KHANG.');
  }

  const result = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    // Bỏ qua dòng hoàn toàn trống.
    if (row.every(v => v === '' || v === null)) continue;

    result.push({
      MA_KHANG: getCell_(row, iMaKhang),
      TEN_KHANG: getCell_(row, iTenKhang),
      MA_SOGCS: getCell_(row, iMaSogcs),
      DANH_SO: getCell_(row, iDanhSo),
      SO_CTO: getCell_(row, iSoCto),
      VTRI_DNOI: getCell_(row, iVtri),
      TEN_TRAM: getCell_(row, iTenTram),
      LAT: getCell_(row, iLat),
      LNG: getCell_(row, iLng),
      HINH_ANH: getCell_(row, iHinhAnh),
      PICTUREBOX: getCell_(row, iHinhAnh),
      TINH_TRANG: getCell_(row, iTinhTrang)
    });
  }

  return result;
}

/**
 * Lưu thông tin tạm ngừng cấp điện.
 */
function saveTamNgungCapDien(payload) {
  if (!payload) throw new Error('Thiếu dữ liệu lưu.');

  const maKhang = String(payload.MA_KHANG || '').trim();
  if (!maKhang) throw new Error('Thiếu MA_KHANG.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TAMNGUNG_SHEET_NAME);

  if (!sh) {
    throw new Error('Không tìm thấy sheet: ' + TAMNGUNG_SHEET_NAME);
  }

  const data = sh.getDataRange().getValues();
  if (data.length < 2) {
    throw new Error('Sheet chưa có dữ liệu khách hàng.');
  }

  const headers = data[0].map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => {
    map[normalizeHeader_(h)] = i;
  });

  const maIndex = findHeader_(map, ['MA_KHANG']);
  if (maIndex < 0) throw new Error('Không tìm thấy cột MA_KHANG.');

  const hinhIndex = findHeader_(map, ['HINH_ANH']);
  const tinhIndex = findHeader_(map, ['TINH_TRANG']);
  const ngaySuaIndex = findHeader_(map, ['NGAY_SUA']);
  const nguoiSuaIndex = findHeader_(map, ['NGUOI_SUA']);

  if (tinhIndex < 0) throw new Error('Không tìm thấy cột TINH_TRANG.');

  // Chuẩn hóa trạng thái: chỉ nhận 0 hoặc 1.
  const tinhTrang = Number(payload.TINH_TRANG) === 1 ? 1 : 0;

  let nguoiSua = String(payload.NGUOI_SUA || '').trim();

  if (!nguoiSua) {
    try {
      nguoiSua = Session.getActiveUser().getEmail() || '';
    } catch (e) {}
  }

  if (!nguoiSua) {
    try {
      nguoiSua = Session.getEffectiveUser().getEmail() || '';
    } catch (e) {}
  }

  if (!nguoiSua) nguoiSua = 'UNKNOWN';

  const now = new Date();
  let updated = 0;

  for (let r = 1; r < data.length; r++) {
    const currentMa = String(data[r][maIndex] ?? '').trim();

    if (currentMa !== maKhang) continue;

    const rowNumber = r + 1;

    // TINH_TRANG
    sh.getRange(rowNumber, tinhIndex + 1).setValue(tinhTrang);

    // HINH_ANH
    const imageUrl = String(payload.HINH_ANH || payload.PICTUREBOX || '').trim();
    if (hinhIndex >= 0 && imageUrl) {
      sh.getRange(rowNumber, hinhIndex + 1).setValue(imageUrl);
    }

    // NGAY_SUA
    if (ngaySuaIndex >= 0) {
      sh.getRange(rowNumber, ngaySuaIndex + 1).setValue(now);
    }

    // NGUOI_SUA
    if (nguoiSuaIndex >= 0) {
      sh.getRange(rowNumber, nguoiSuaIndex + 1).setValue(nguoiSua);
    }

    updated++;
  }

  if (updated === 0) {
    throw new Error('Không tìm thấy MA_KHANG: ' + maKhang);
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    MA_KHANG: maKhang,
    TINH_TRANG: tinhTrang,
    updatedRows: updated,
    NGAY_SUA: now,
    NGUOI_SUA: nguoiSua
  };
}

/**
 * Các hàm helper.
 */
function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function findHeader_(map, names) {
  for (const name of names) {
    const key = normalizeHeader_(name);
    if (map[key] !== undefined) return map[key];
  }
  return -1;
}

function firstIndex_(idxFn, names) {
  for (const name of names) {
    const i = idxFn(name);
    if (i >= 0) return i;
  }
  return -1;
}

function getCell_(row, index) {
  if (index < 0 || index >= row.length) return '';
  const value = row[index];

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  return value === null || value === undefined ? '' : value;
}

function testTamNgungCapDien() {
  const list = getTamNgungCapDienList();
  Logger.log('Tổng số khách hàng: ' + list.length);
  if (list.length) Logger.log(JSON.stringify(list[0]));
}
