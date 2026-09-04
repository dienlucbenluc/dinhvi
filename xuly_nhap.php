<?php
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

header('Content-Type: application/json; charset=utf-8');

// 1. Cấu hình kết nối Oracle DB
$username = 'HTCMIS_BL';
$password = 'HTCMIS_BL';

$db_connection = '(DESCRIPTION =
    (ADDRESS = (PROTOCOL = TCP)(HOST = 10.183.45.1)(PORT = 1521))
    (CONNECT_DATA =
        (SERVER = DEDICATED)
        (SERVICE_NAME = HTCMIS)
    )
)';

$charset = 'UTF8';
$conn_htcmis = oci_pconnect($username, $password, $db_connection, $charset);

if (!$conn_htcmis) {
    $e = oci_error();
    echo json_encode(['status' => 'error', 'message' => 'Không kết nối được Oracle DB: ' . $e['message']]);
    exit;
}

// 2. Lấy dữ liệu từ POST
$valA = isset($_POST['colA']) ? trim($_POST['colA']) : '';
$valB = isset($_POST['colB']) ? trim($_POST['colB']) : '';

if ($valA === '' || $valB === '') {
    echo json_encode(['status' => 'error', 'message' => 'Vui lòng nhập đầy đủ cột A và B!']);
    exit;
}

// 3. Thực thi SQL INSERT vào bảng A_TAM (Cột A, B)
$sql = "INSERT INTO A_TAM (A, B) VALUES (:valA, :valB)";
$stid = oci_parse($conn_htcmis, $sql);

// Bind tham số để chống SQL Injection
oci_bind_by_name($stid, ':valA', $valA);
oci_bind_by_name($stid, ':valB', $valB);

$result = oci_execute($stid, OCI_COMMIT_ON_SUCCESS);

if ($result) {
    echo json_encode(['status' => 'success', 'message' => 'Lưu dữ liệu vào Oracle DB thành công!']);
} else {
    $e = oci_error($stid);
    echo json_encode(['status' => 'error', 'message' => 'Lỗi lưu dữ liệu: ' . $e['message']]);
}

// 4. Đóng kết nối
oci_free_statement($stid);
oci_close($conn_htcmis);
?>