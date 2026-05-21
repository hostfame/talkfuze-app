<?php
$file = "/var/www/whmcs/hostnin_bridge.php";
$content = file_get_contents($file);

$target = <<<'EOT'
    // Use WHMCS Local API
    if (function_exists('localAPI')) {
        $result = localAPI($action, $params);
EOT;

$replacement = <<<'EOT'
    // Use WHMCS Local API
    if (function_exists('localAPI')) {

        // For ticket actions with attachments, decode base64 attachments into $_FILES
        // WHMCS localAPI ignores the base64 "attachments" param and only reads $_FILES
        if (in_array($action, ["OpenTicket", "AddTicketReply"]) && !empty($params["attachments"])) {
            $decoded = json_decode(base64_decode($params["attachments"]), true);
            if (is_array($decoded) && count($decoded) > 0) {
                $names = [];
                $types = [];
                $tmpNames = [];
                $errors = [];
                $sizes = [];
                
                foreach ($decoded as $att) {
                    $fname = $att["filename"] ?? ("attachment_" . count($names) . ".jpg");
                    $fileData = base64_decode($att["data"] ?? "");
                    if (empty($fileData)) continue;
                    
                    $tmpFile = tempnam(sys_get_temp_dir(), "whmcs_att_");
                    file_put_contents($tmpFile, $fileData);
                    
                    // Detect MIME type
                    $finfo = finfo_open(FILEINFO_MIME_TYPE);
                    $mime = finfo_file($finfo, $tmpFile);
                    finfo_close($finfo);
                    
                    $names[] = $fname;
                    $types[] = $mime ?: "application/octet-stream";
                    $tmpNames[] = $tmpFile;
                    $errors[] = 0;
                    $sizes[] = strlen($fileData);
                }
                
                if (count($names) > 0) {
                    $_FILES["attachments"] = [
                        "name" => $names,
                        "type" => $types,
                        "tmp_name" => $tmpNames,
                        "error" => $errors,
                        "size" => $sizes,
                    ];
                }
            }
            // Remove from params so localAPI does not get confused
            unset($params["attachments"]);
        }

        $result = localAPI($action, $params);
EOT;

if (strpos($content, $target) !== false) {
    $content = str_replace($target, $replacement, $content);
    copy($file, $file . ".bak." . date("YmdHis"));
    file_put_contents($file, $content);
    echo "PATCHED SUCCESSFULLY\n";
} else {
    echo "TARGET NOT FOUND\n";
}
