<?php
/**
 * Endpoint pour récupérer l'adresse IP du client
 * Utilisé pour localiser automatiquement les ostéos dans leurs salles
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// Récupérer l'IP réelle du client (en tenant compte des proxies)
function getClientIp() {
    $ipKeys = [
        'HTTP_CLIENT_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_FORWARDED',
        'HTTP_X_CLUSTER_CLIENT_IP',
        'HTTP_FORWARDED_FOR',
        'HTTP_FORWARDED',
        'REMOTE_ADDR'
    ];
    
    foreach ($ipKeys as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = $_SERVER[$key];
            // Si plusieurs IPs (cas de X-Forwarded-For), prendre la première
            if (strpos($ip, ',') !== false) {
                $ips = explode(',', $ip);
                $ip = trim($ips[0]);
            }
            // Valider que c'est une IP valide
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    
    return 'unknown';
}

$ip = getClientIp();

echo json_encode([
    'success' => true,
    'ip' => $ip,
    'timestamp' => date('Y-m-d H:i:s')
]);
