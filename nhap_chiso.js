const API_URL = "https://script.google.com/macros/s/AKfycbyKaG42B8RFzHToMu2Gqk7y5mCQ4wqDxxB5NWftA5lOZdB_mrLkCy6GkVs7zyOgRrHd/exec";

// Tên các file text lưu trữ cục bộ trên thiết bị
const FILE_CHISO_TXT = "chiso.txt";
const FILE_DINHVI_TXT = "dinhvi.txt";
const FILE_SERVER_BACKUP_TXT = "chiso_server_backup.txt";

// ----------------------------------------------------
// 1. HÀM BỔ TRỢ ĐỊNH DẠNG SỐ (FORMAT & PARSE)
// ----------------------------------------------------
// Định dạng số dạng 999,999.000 để ghi file text
function formatNumberText(val) {
  if (val === "" || val === null || val === undefined) return "";
  const cleanStr = String(val).replace(/,/g, "").trim();
  const num = Number(cleanStr);
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

// Xóa dấu phẩy phân cách ngàn để lấy lại số chuẩn trước khi đồng bộ lên Server
function parseFormattedNumber(val) {
  if (val === "" || val === null || val === undefined) return "";
  const cleanStr = String(val).replace(/,/g, "").trim();
  return isNaN(Number(cleanStr)) ? "" : Number(cleanStr);
}

// ----------------------------------------------------
// 2. QUẢN LÝ TỰ ĐỘNG TẠO VÀ GHI HÀNG VÀO FILE TEXT CỤC BỘ
// ----------------------------------------------------
function initLocalTextFiles() {
  if (!localStorage.getItem(FILE_CHISO_TXT)) {
    const headerChiSo = "id_chiso\tma_khang\tten_khang\tdia_chi\tma_sogcs\tdanh_so\tso_cot\tma_tram\tten_tram\tso_cto\tten_ndung\tten_nvien\thsn\tbcs\tchiso_cu\tchiso_moi\tsan_luong\tsluong_thao\ttong_sluong\tsluong_kt\tchenh_lech\ttyle_clech\tky\tthang\tnam\tngay_nhap\tnguoi_nhap\tlat\tlng\tso_dthoai\tghi_chu\ttype";
    localStorage.setItem(FILE_CHISO_TXT, headerChiSo);
  }

  if (!localStorage.getItem(FILE_DINHVI_TXT)) {
    const headerDinhVi = "id\tma_khang\tten_khang\tso_cto\tma_tram\tten_tram\tso_cot\tten_ndung\tten_nvien\tten_cviec\tnote\tlat\tlng\ttime\ttrang_thai\tnhap_cmis";
    localStorage.setItem(FILE_DINHVI_TXT, headerDinhVi);
  }
}

function appendToTextFile(fileName, rowDataObj) {
  let content = localStorage.getItem(fileName) || "";
  if (fileName === FILE_CHISO_TXT) {
    const line = [
      rowDataObj.id_chiso || "", rowDataObj.ma_khang || "", rowDataObj.ten_khang || "",
      rowDataObj.dia_chi || "", rowDataObj.ma_sogcs || "", rowDataObj.danh_so || "",
      rowDataObj.so_cot || "", rowDataObj.ma_tram || "", rowDataObj.ten_tram || "",
      rowDataObj.so_cto || "", rowDataObj.ten_ndung || "", rowDataObj.ten_nvien || "",
      rowDataObj.hsn || 1, rowDataObj.bcs || "", 
      formatNumberText(rowDataObj.chiso_cu),
      rowDataObj.chiso_moi !== undefined && rowDataObj.chiso_moi !== "" ? formatNumberText(rowDataObj.chiso_moi) : "",
      formatNumberText(rowDataObj.san_luong),
      formatNumberText(rowDataObj.sluong_thao),
      formatNumberText(rowDataObj.tong_sluong),
      formatNumberText(rowDataObj.sluong_kt),
      rowDataObj.chenh_lech || "", rowDataObj.tyle_clech || "",
      rowDataObj.ky || "", rowDataObj.thang || "", rowDataObj.nam || "",
      rowDataObj.time || "", rowDataObj.nguoi_nhap || "", rowDataObj.lat || "",
      rowDataObj.lng || "", rowDataObj.so_dthoai || "", rowDataObj.ghi_chu || "",
      rowDataObj.type || "SAVE"
    ].join("\t");
    content += "\n" + line;
  } else if (fileName === FILE_DINHVI_TXT) {
    const line = [
      rowDataObj.id || "", rowDataObj.ma_khang || "", rowDataObj.ten_khang || "",
      rowDataObj.so_cto || "", rowDataObj.ma_tram || "", rowDataObj.ten_tram || "",
      rowDataObj.so_cot || "", rowDataObj.ten_ndung || "", rowDataObj.ten_nvien || "",
      rowDataObj.ten_cviec || "Ghi điện", rowDataObj.ghi_chu || "", rowDataObj.lat || "",
      rowDataObj.lng || "", rowDataObj.time || "", rowDataObj.trang_thai || "1",
      rowDataObj.nhap_cmis || ""
    ].join("\t");
    content += "\n" + line;
  }
  localStorage.setItem(fileName, content);
}

// ----------------------------------------------------
// 3. ĐỒNG BỘ NỘI DUNG 2 FILE TEXT LÊN GOOGLE SHEET
// ----------------------------------------------------
function syncLocalTextFilesToSheet() {
  return new Promise((resolve) => {
    const chisoRaw = localStorage.getItem(FILE_CHISO_TXT) || "";
    const dinhviRaw = localStorage.getItem(FILE_DINHVI_TXT) || "";

    const chisoLines = chisoRaw.split("\n").filter(l => l.trim().length > 0);
    const dinhviLines = dinhviRaw.split("\n").filter(l => l.trim().length > 0);

    // Không có bản ghi mới -> Kết thúc ngay
    if (chisoLines.length <= 1 && dinhviLines.length <= 1) {
      resolve(false);
      return;
    }

    const chisoLogs = [];
    for (let i = 1; i < chisoLines.length; i++) {
      const cols = chisoLines[i].split("\t");
      chisoLogs.push({
        id_chiso: cols[0], ma_khang: cols[1], ten_khang: cols[2], dia_chi: cols[3],
        ma_sogcs: cols[4], danh_so: cols[5], so_cot: cols[6], ma_tram: cols[7],
        ten_tram: cols[8], so_cto: cols[9], ten_ndung: cols[10], ten_nvien: cols[11],
        hsn: cols[12], bcs: cols[13], 
        chiso_cu: parseFormattedNumber(cols[14]), 
        chiso_moi: parseFormattedNumber(cols[15]),
        san_luong: parseFormattedNumber(cols[16]), 
        sluong_thao: parseFormattedNumber(cols[17]), 
        tong_sluong: parseFormattedNumber(cols[18]), 
        sluong_kt: parseFormattedNumber(cols[19]),
        chenh_lech: cols[20], tyle_clech: cols[21], ky: cols[22], thang: cols[23],
        nam: cols[24], time: cols[25], nguoi_nhap: cols[26], lat: cols[27],
        lng: cols[28], so_dthoai: cols[29], ghi_chu: cols[30], type: cols[31]
      });
    }

    const dinhviLogs = [];
    for (let i = 1; i < dinhviLines.length; i++) {
      const cols = dinhviLines[i].split("\t");
      dinhviLogs.push({
        id: cols[0], ma_khang: cols[1], ten_khang: cols[2], so_cto: cols[3],
        ma_tram: cols[4], ten_tram: cols[5], so_cot: cols[6], ten_ndung: cols[7],
        ten_nvien: cols[8], ten_cviec: cols[9], ghi_chu: cols[10], lat: cols[11],
        lng: cols[12], time: cols[13], trang_thai: cols[14], nhap_cmis: cols[15]
      });
    }

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "SYNC_BATCH_DATA",
        chiso_logs: chisoLogs,
        dinhvi_logs: dinhviLogs
      })
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        localStorage.removeItem(FILE_CHISO_TXT);
        localStorage.removeItem(FILE_DINHVI_TXT);
        initLocalTextFiles();
        if (typeof showToast === "function") showToast("🔄 Đã đồng bộ dữ liệu từ thiết bị lên server.");
        resolve(true);
      } else {
        resolve(false);
      }
    })
    .catch(() => resolve(false));
  });
}

// ----------------------------------------------------
// 4. HÀM TẢI 2 FILE TEXT VỀ THIẾT BỊ (DOWNLOAD)
// ----------------------------------------------------
function downloadAllTextFiles() {
  const files = [FILE_CHISO_TXT, FILE_DINHVI_TXT];
  let count = 0;

  files.forEach((fileName, index) => {
    const content = localStorage.getItem(fileName) || "";
    
    setTimeout(() => {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      count++;
      if (count === files.length && typeof showToast === "function") {
        showToast("📥 Đã tải 2 file text về thư mục Download!");
      }
    }, index * 300);
  });
}
