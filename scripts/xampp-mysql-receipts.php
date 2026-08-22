<?php
declare(strict_types=1);

function envv(string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false || trim($value) === '' ? $fallback : trim($value);
}
function emit(array $value, int $code = 0): never {
    fwrite($code === 0 ? STDOUT : STDERR, json_encode($value, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL);
    exit($code);
}
function input(): array {
    $raw = stream_get_contents(STDIN);
    if ($raw === false || trim($raw) === '') return [];
    $value = json_decode($raw, true);
    if (!is_array($value)) emit(['ok'=>false,'error'=>'invalid_json_input'], 2);
    return $value;
}
function localHost(string $host): bool {
    return in_array(strtolower($host), ['127.0.0.1','localhost','::1'], true);
}
function pdoConnect(bool $withDatabase): PDO {
    $host = envv('CIEAV_MYSQL_HOST', '127.0.0.1');
    $port = (int)envv('CIEAV_MYSQL_PORT', '3306');
    $user = envv('CIEAV_MYSQL_USER', 'root');
    $password = envv('CIEAV_MYSQL_PASSWORD', '');
    $database = envv('CIEAV_MYSQL_DATABASE', 'cieav');
    if (!localHost($host)) emit(['ok'=>false,'error'=>'xampp_mysql_must_be_loopback','host'=>$host], 2);
    if ($port < 1 || $port > 65535) emit(['ok'=>false,'error'=>'invalid_mysql_port'], 2);
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $database)) emit(['ok'=>false,'error'=>'invalid_mysql_database_name'], 2);
    if (!extension_loaded('pdo_mysql')) emit(['ok'=>false,'error'=>'pdo_mysql_extension_missing','hint'=>'Enable extension=pdo_mysql in the XAMPP php.ini.'], 2);
    $dsn = 'mysql:host=' . $host . ';port=' . $port . ($withDatabase ? ';dbname=' . $database : '') . ';charset=utf8mb4';
    try {
        return new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        emit(['ok'=>false,'error'=>'mysql_connection_failed','message'=>$e->getMessage(),'host'=>$host,'port'=>$port,'database'=>$database,'user'=>$user], 2);
    }
}
function ensureSchema(): void {
    $database = envv('CIEAV_MYSQL_DATABASE', 'cieav');
    $server = pdoConnect(false);
    $server->exec('CREATE DATABASE IF NOT EXISTS `' . $database . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo = pdoConnect(true);
    $pdo->exec('CREATE TABLE IF NOT EXISTS receipts (
        id CHAR(36) NOT NULL PRIMARY KEY,
        device_id VARCHAR(200) NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        receipt_json LONGTEXT NOT NULL,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX receipts_device_created_idx (device_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}
function decodeRows(array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        $receipt = json_decode((string)($row['receipt_json'] ?? ''), true);
        if (!is_array($receipt)) emit(['ok'=>false,'error'=>'corrupt_receipt_json'], 2);
        $out[] = $receipt;
    }
    return $out;
}

$command = $argv[1] ?? '';
try {
    if ($command === 'bootstrap') {
        ensureSchema();
        $pdo = pdoConnect(true);
        $count = (int)$pdo->query('SELECT COUNT(*) FROM receipts')->fetchColumn();
        emit(['ok'=>true,'store'=>'xampp-mysql','database'=>envv('CIEAV_MYSQL_DATABASE','cieav'),'receipts'=>$count]);
    }
    ensureSchema();
    $pdo = pdoConnect(true);
    if ($command === 'status') {
        $count = (int)$pdo->query('SELECT COUNT(*) FROM receipts')->fetchColumn();
        emit(['ok'=>true,'store'=>'xampp-mysql','database'=>envv('CIEAV_MYSQL_DATABASE','cieav'),'receipts'=>$count]);
    }
    $in = input();
    if ($command === 'save') {
        $receipt = $in['receipt'] ?? null;
        if (!is_array($receipt) || !is_string($receipt['id'] ?? null) || !is_string($receipt['deviceId'] ?? null) || !is_string($receipt['createdAt'] ?? null)) emit(['ok'=>false,'error'=>'invalid_receipt'], 2);
        $stmt = $pdo->prepare('INSERT INTO receipts(id,device_id,created_at,receipt_json) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE device_id=VALUES(device_id),created_at=VALUES(created_at),receipt_json=VALUES(receipt_json)');
        $stmt->execute([$receipt['id'],$receipt['deviceId'],$receipt['createdAt'],json_encode($receipt, JSON_UNESCAPED_SLASHES)]);
        emit(['ok'=>true,'saved'=>$receipt['id']]);
    }
    if ($command === 'list') {
        $deviceId = (string)($in['deviceId'] ?? '');
        $limit = max(1, min(200, (int)($in['limit'] ?? 50)));
        if ($deviceId === '') emit(['ok'=>false,'error'=>'device_id_required'], 2);
        $stmt = $pdo->prepare('SELECT receipt_json FROM receipts WHERE device_id=? ORDER BY created_at DESC LIMIT ' . $limit);
        $stmt->execute([$deviceId]);
        emit(['ok'=>true,'receipts'=>decodeRows($stmt->fetchAll())]);
    }
    if ($command === 'get') {
        $deviceId = (string)($in['deviceId'] ?? '');
        $id = (string)($in['id'] ?? '');
        $stmt = $pdo->prepare('SELECT receipt_json FROM receipts WHERE device_id=? AND id=? LIMIT 1');
        $stmt->execute([$deviceId,$id]);
        $row = $stmt->fetch();
        emit(['ok'=>true,'receipt'=>$row ? decodeRows([$row])[0] : null]);
    }
    if ($command === 'all') {
        $limit = max(1, min(10000, (int)($in['limit'] ?? 1000)));
        $rows = $pdo->query('SELECT receipt_json FROM receipts ORDER BY created_at ASC LIMIT ' . $limit)->fetchAll();
        emit(['ok'=>true,'receipts'=>decodeRows($rows)]);
    }
    emit(['ok'=>false,'error'=>'unsupported_command','command'=>$command], 2);
} catch (Throwable $e) {
    emit(['ok'=>false,'error'=>'xampp_mysql_bridge_failed','message'=>$e->getMessage()], 2);
}
