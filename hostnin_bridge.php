<?php
/**
 * Hostnin Portal Bridge v2.0
 * 
 * Place this file in your WHMCS installation directory.
 * This provides a secure connection between the Hostnin portal and WHMCS.
 * 
 * Installation:
 * 1. Upload this file to: /path/to/whmcs/hostnin_bridge.php
 * 2. Set the BRIDGE_SECRET below to match your portal's .env file
 * 3. Optionally configure ALLOWED_IPS for IP restriction
 * 
 * @author Hostnin
 * @version 2.0.0
 */

// ============================================
// CONFIGURATION
// ============================================

// Bridge secret - loaded from external config file (NOT committed to Git)
// Create a file called 'bridge_secret.php' in the same directory with:
//   <?php return 'your-secret-key-here';
// Or set the HOSTNIN_BRIDGE_SECRET environment variable
$bridgeSecretFile = __DIR__ . '/bridge_secret.php';
if (file_exists($bridgeSecretFile)) {
    define('BRIDGE_SECRET', require $bridgeSecretFile);
} elseif (getenv('HOSTNIN_BRIDGE_SECRET')) {
    define('BRIDGE_SECRET', getenv('HOSTNIN_BRIDGE_SECRET'));
} else {
    http_response_code(500);
    die(json_encode(['result' => 'error', 'message' => 'Bridge secret not configured']));
}

// Allowed IP addresses (add your CapRover server IP for maximum security)
// Example: ['1.2.3.4', '5.6.7.8']
define('ALLOWED_IPS', []);

// Enable logging for debugging (disable in production)
define('BRIDGE_DEBUG', false);

// ============================================
// SECURITY CHECKS - DO NOT MODIFY BELOW
// ============================================

header('Content-Type: application/json');

// Prevent browser access
if (php_sapi_name() !== 'cli' && empty($_POST)) {
    http_response_code(403);
    die(json_encode(['result' => 'error', 'message' => 'Direct access forbidden']));
}

// Log function
function bridgeLog($message)
{
    if (BRIDGE_DEBUG) {
        $logFile = __DIR__ . '/hostnin_bridge.log';
        $timestamp = date('Y-m-d H:i:s');
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        file_put_contents($logFile, "[{$timestamp}] [{$ip}] {$message}\n", FILE_APPEND);
    }
}

// IP Restriction Check
function checkIpAllowed()
{
    if (empty(ALLOWED_IPS)) {
        return true; // No IP restriction
    }

    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

    // Check for proxy headers
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $clientIp = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
    } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $clientIp = $_SERVER['HTTP_X_REAL_IP'];
    }

    $clientIp = trim($clientIp);

    return in_array($clientIp, ALLOWED_IPS);
}

// Verify bridge secret
function verifySecret($providedSecret)
{
    if (empty($providedSecret)) {
        return false;
    }
    return hash_equals(BRIDGE_SECRET, $providedSecret);
}

// Rate limiting with action-specific limits
function checkRateLimit($action)
{
    $cacheDir = sys_get_temp_dir();
    // Use X-User-IP (real end-user IP sent by Next.js) for per-user rate limiting.
    // Falls back to REMOTE_ADDR (CapRover server IP) if header is absent.
    $ip = !empty($_SERVER['HTTP_X_USER_IP']) ? trim($_SERVER['HTTP_X_USER_IP']) : ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $key = md5($action . $ip);
    $cacheFile = $cacheDir . '/hostnin_bridge_rate_' . $key;

    // Different rate limits for different actions
    $rateLimits = [
        'AddClient' => ['max' => 5, 'window' => 300],       // 5 per 5 minutes (anti-spam)
        'ResetPassword' => ['max' => 3, 'window' => 300],   // 3 per 5 minutes (anti-abuse)
        'ValidateLogin' => ['max' => 10, 'window' => 60],   // 10 per minute (brute force protection)
        'default' => ['max' => 100, 'window' => 60],        // 100 per minute for others
    ];

    $limit = $rateLimits[$action] ?? $rateLimits['default'];
    $maxRequests = $limit['max'];
    $window = $limit['window'];

    $data = [];
    if (file_exists($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true) ?? [];
    }

    // Clean old entries
    $now = time();
    $data = array_filter($data, fn($time) => $now - $time < $window);

    if (count($data) >= $maxRequests) {
        return false;
    }

    $data[] = $now;
    file_put_contents($cacheFile, json_encode($data));

    return true;
}

// Validate email format
function isValidEmail($email)
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

// Sanitize input
function sanitizeInput($input)
{
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

// ============================================
// MAIN EXECUTION
// ============================================

try {
    // Check IP restriction
    if (!checkIpAllowed()) {
        bridgeLog('BLOCKED: IP not allowed - ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        http_response_code(403);
        die(json_encode(['result' => 'error', 'message' => 'Access denied']));
    }

    // Verify bridge secret
    $providedSecret = $_POST['bridge_secret'] ?? '';
    if (!verifySecret($providedSecret)) {
        bridgeLog('BLOCKED: Invalid bridge secret');
        http_response_code(401);
        die(json_encode(['result' => 'error', 'message' => 'Invalid credentials']));
    }

    // Get the API action
    $action = $_POST['action'] ?? '';
    if (empty($action)) {
        bridgeLog('ERROR: No action specified');
        http_response_code(400);
        die(json_encode(['result' => 'error', 'message' => 'No action specified']));
    }

    // Check rate limit
    if (!checkRateLimit($action)) {
        bridgeLog('BLOCKED: Rate limit exceeded for action: ' . $action);
        http_response_code(429);
        die(json_encode(['result' => 'error', 'message' => 'Too many requests. Please try again later.']));
    }

    bridgeLog('REQUEST: ' . $action);

    // ============================================
    // ALLOWED ACTIONS WHITELIST
    // ============================================
    // Only these WHMCS API commands are permitted
    $allowedActions = [
        // Authentication
        'ValidateLogin',
        'AddClient',
        'ResetPassword',
        'UpdateClient',
        'CreateSsoToken',  // WHMCS 8+ recommended auth method
        'GetUsers',        // WHMCS 8+ user management
        'GetUser',         // Get single user details

        // Client Info
        'GetClientsDetails',
        'GetClientsAddons',  // Client addon services

        // Services/Products
        'GetClientsProducts',
        'GetProducts',
        'ModuleCreate',
        'ModuleChangePw',   // Change cPanel/service password
        'AddCancelRequest', // Request service cancellation
        'UpgradeProduct',

        // Domains
        'GetClientsDomains',
        'DomainCheck',          // Check domain availability
        'DomainRegister',
        'DomainRenew',
        'DomainTransfer',
        'GetTLDPricing',
        'DomainUpdateNameservers',
        'DomainGetNameservers',
        'DomainUpdateLockingStatus',
        'DomainGetLockingStatus',
        'DomainWhois',
        'DomainToggleIdProtect', // Toggle domain ID protection

        // Invoices & Billing
        'GetInvoices',
        'GetInvoice',
        'CreateInvoice',
        'AddInvoicePayment',    // Record payment against invoice
        'AddCredit',
        'GetCredits',
        'AddTransaction',
        'GetTransactions',
        'GetPaymentMethods',
        'UpdateInvoice',
        'ApplyCredit',

        // Products & Ordering
        'GetProductGroups',     // Product categories
        'GetProductConfigurableOptions', // VPS config options (Location, OS)

        // Support Tickets
        'GetTickets',
        'GetTicket',
        'OpenTicket',
        'AddTicketReply',
        'CloseTicket',
        'UpdateTicket',
        'GetSupportDepartments',
        'GetSupportStatuses',

        // Announcements & KB
        'GetAnnouncements',
        'GetKnowledgebaseCategories',
        'GetKnowledgebaseArticles',

        // Orders
        'AddOrder',
        'GetOrders',
        'GetOrder',
        'CancelOrder',
        'AcceptOrder',
        'PendingOrder',

        // Quotes
        'GetQuotes',
        'CreateQuote',
        'AcceptQuote',

        // Affiliates
        'GetAffiliates',
        'AffiliateActivate',

        // SSL Certificates
        'GetSSLCertificates',

        // System
        'GetCurrencies',
        'GetPromotions',
        'ValidatePromo',

        // Contacts
        'GetContacts',
        'AddContact',
        'UpdateContact',
        'DeleteContact',

        // Email
        'GetEmails',
        'SendEmail',      // Send custom email to client (used for OTP)
        'SendAdminEmail',  // Send notification email to admin

        // Custom API
        'GetClientByPhone', // Custom endpoint for Talkfuze
        'GetClientDashboardData', // Custom endpoint for fast CRM fetching
        'GetClientDashboardDataByPhoneOrEmail', // Custom endpoint for instant 1-trip fetching
        'GetUnpaidInvoicesWithClients', // Custom endpoint to fetch unpaid invoices with phonenumbers
    ];

    if (!in_array($action, $allowedActions) && $action !== 'CheckAffiliatePromoOwner' && $action !== 'DomainRelayUpdateNS' && $action !== 'UnblockIP') {
        bridgeLog('BLOCKED: Action not allowed: ' . $action);
        http_response_code(403);
        die(json_encode(['result' => 'error', 'message' => 'Action not permitted']));
    }

    // NinaChat is paused — return disabled response immediately
    // Removed from bridge to eliminate the session-forgery attack surface
    // ($_SESSION['uid'] manipulation). Re-enable when Nina is relaunched.

    // ============================================
    // CUSTOM ACTION: DomainRelay Nameserver Update
    // ============================================
    // For domains with empty/no registrar, replicate domainrelay_SaveNameservers behavior:
    // - Store NS update in additionalnotes as pending task
    // - Log activity
    // - Send admin notification email
    if ($action === 'DomainRelayUpdateNS') {
        $domainId = (int) ($_POST['domainid'] ?? 0);
        $clientId = (int) ($_POST['clientid'] ?? 0);

        if ($domainId <= 0 || $clientId <= 0) {
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'domainid and clientid are required']));
        }

        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }

        try {
            // Verify domain belongs to client
            $domain = \WHMCS\Database\Capsule::table('tbldomains')
                ->where('id', $domainId)
                ->where('userid', $clientId)
                ->first(['id', 'domain', 'additionalnotes', 'registrar']);

            if (!$domain) {
                http_response_code(404);
                die(json_encode(['result' => 'error', 'message' => 'Domain not found']));
            }

            // Collect nameservers
            $nameservers = [];
            for ($i = 1; $i <= 5; $i++) {
                $ns = trim($_POST["ns{$i}"] ?? '');
                if (!empty($ns)) {
                    $nameservers["ns{$i}"] = $ns;
                }
            }

            if (empty($nameservers)) {
                http_response_code(400);
                die(json_encode(['result' => 'error', 'message' => 'At least one nameserver is required']));
            }

            $timestamp = date('Y-m-d H:i:s');
            $nsListFormatted = implode(', ', $nameservers);

            // Get client info
            $client = \WHMCS\Database\Capsule::table('tblclients')
                ->where('id', $clientId)
                ->first(['firstname', 'lastname', 'email']);

            $clientName = $client
                ? "{$client->firstname} {$client->lastname} ({$client->email})"
                : "Client #{$clientId}";

            // Build pending note entry (same format as domainrelay module)
            $noteEntry = "══════════════════════════════════════════\n";
            $noteEntry .= "⏳ PENDING NS UPDATE, {$timestamp}\n";
            $noteEntry .= "══════════════════════════════════════════\n";
            $noteEntry .= "Domain: {$domain->domain}\n";
            $noteEntry .= "Client: {$clientName}\n";
            $noteEntry .= "Source: Hostnin Portal (/dash)\n";
            $noteEntry .= "Nameservers:\n";
            foreach ($nameservers as $key => $ns) {
                $noteEntry .= "  • " . strtoupper($key) . ": {$ns}\n";
            }
            $noteEntry .= "Status: ⏳ PENDING MANUAL UPDATE\n";
            $noteEntry .= "══════════════════════════════════════════\n\n";

            // Prepend to existing notes
            $existingNotes = $domain->additionalnotes ?? '';
            $updatedNotes = $noteEntry . $existingNotes;

            \WHMCS\Database\Capsule::table('tbldomains')
                ->where('id', $domainId)
                ->update(['additionalnotes' => $updatedNotes]);

            // If no registrar set, assign domainrelay
            if (empty($domain->registrar)) {
                \WHMCS\Database\Capsule::table('tbldomains')
                    ->where('id', $domainId)
                    ->update(['registrar' => 'domainrelay']);
            }

            // Log activity
            logActivity("DomainRelay (Portal): NS update queued for {$domain->domain}, {$nsListFormatted}", $clientId);

            // Send admin notification (load registrar config for email)
            $registrarConfig = \WHMCS\Database\Capsule::table('tblregistrars')
                ->where('registrar', 'domainrelay')
                ->pluck('value', 'setting')
                ->toArray();

            $notifyEmail = $registrarConfig['NotifyEmail'] ?? '';
            $notifyEnabled = $registrarConfig['NotifyOnUpdate'] ?? '';

            if ($notifyEnabled === 'on' && !empty($notifyEmail)) {
                // Send notification email
                $nsItems = '';
                foreach ($nameservers as $key => $ns) {
                    $nsItems .= "<li><strong>" . strtoupper($key) . ":</strong> {$ns}</li>";
                }

                $subject = "🔄 DomainRelay: Pending Nameserver Update, {$domain->domain}";
                $body = "
                <div style='font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);'>
                    <div style='background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); padding: 28px 24px;'>
                        <h2 style='color: white; margin: 0; font-size: 20px; font-weight: 600;'>🔄 Pending Nameserver Update</h2>
                        <p style='color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;'>A customer action requires manual processing (via Hostnin Portal)</p>
                    </div>
                    <div style='padding: 24px;'>
                        <table style='width: 100%; border-collapse: collapse;'>
                            <tr style='border-bottom: 1px solid #f1f5f9;'>
                                <td style='padding: 10px 15px; font-weight: 600; color: #64748b; width: 130px;'>Domain:</td>
                                <td style='padding: 10px 15px; color: #1e293b; font-weight: 600;'>{$domain->domain}</td>
                            </tr>
                            <tr style='border-bottom: 1px solid #f1f5f9;'>
                                <td style='padding: 10px 15px; font-weight: 600; color: #64748b;'>Client:</td>
                                <td style='padding: 10px 15px; color: #1e293b;'>{$clientName}</td>
                            </tr>
                            <tr style='border-bottom: 1px solid #f1f5f9;'>
                                <td style='padding: 10px 15px; font-weight: 600; color: #64748b;'>Requested:</td>
                                <td style='padding: 10px 15px; color: #1e293b;'>{$timestamp}</td>
                            </tr>
                            <tr>
                                <td style='padding: 10px 15px; font-weight: 600; color: #64748b;'>Nameservers:</td>
                                <td style='padding: 10px 15px;'><ul style='margin: 0; padding-left: 18px; color: #1e293b;'>{$nsItems}</ul></td>
                            </tr>
                        </table>
                        <div style='margin-top: 20px; padding: 14px 16px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; font-size: 14px;'>
                            <strong>⚠️ Action Required:</strong> Please process this request manually at the domain registrar.
                        </div>
                    </div>
                    <div style='padding: 16px 24px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8;'>
                        Sent by DomainRelay for WHMCS (via Hostnin Portal)
                    </div>
                </div>";

                $headers = "MIME-Version: 1.0\r\n";
                $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
                mail($notifyEmail, $subject, $body, $headers);
            }

            echo json_encode(['result' => 'success', 'message' => 'Nameserver update queued successfully']);
        } catch (Exception $e) {
            bridgeLog('DomainRelayUpdateNS ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to queue nameserver update']));
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: GetClientByPhone
    // ============================================
    // Fast, robust phone number lookup without regex in SQL
    // Useful for Talkfuze CRM integration
    if ($action === 'GetClientByPhone') {
        $phoneStr = $_POST['phone'] ?? '';
        
        if (empty($phoneStr)) {
            echo json_encode(['result' => 'success', 'clients' => []]);
            exit;
        }

        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }

        try {
            // Fetch all active/inactive clients (small footprint for ~2-5k accounts)
            $clients = \WHMCS\Database\Capsule::table('tblclients')
                ->get(['id', 'firstname', 'lastname', 'companyname', 'email', 'phonenumber', 'status']);
            
            $matches = [];
            $searchDigits = preg_replace('/\D/', '', $phoneStr);
            
            foreach ($clients as $c) {
                if (empty($c->phonenumber)) continue;
                
                $clientDigits = preg_replace('/\D/', '', $c->phonenumber);
                if (empty($clientDigits)) continue;
                
                // Exact match of all digits
                if ($clientDigits === $searchDigits) {
                    $matches[] = $c;
                    continue;
                } 
                
                // Match suffix of at least 9 digits (handles country code mismatches)
                if (strlen($clientDigits) >= 9 && strlen($searchDigits) >= 9) {
                    $clientSuffix = substr($clientDigits, -9);
                    $searchSuffix = substr($searchDigits, -9);
                    if ($clientSuffix === $searchSuffix) {
                        $matches[] = $c;
                    }
                }
            }
            
            echo json_encode(['result' => 'success', 'clients' => $matches]);
        } catch (Exception $e) {
            bridgeLog('GetClientByPhone ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to fetch clients by phone']));
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: Unblock IP on WHM Servers
    // ============================================
    if ($action === 'UnblockIP') {
        $ip = $_POST['ip'] ?? '';
        $clientId = (int) ($_POST['clientid'] ?? 0);
        
        if (empty($ip) || !filter_var($ip, FILTER_VALIDATE_IP)) {
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'Valid IP address required']));
        }
        
        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }
        
        try {
            // Get active cPanel servers
            $servers = \WHMCS\Database\Capsule::table('tblservers')->where('type', 'cpanel')->where('disabled', 0)->get();
            
            $results = [];
            foreach ($servers as $server) {
                try {
                    $ssh = new \phpseclib\Net\SSH2($server->ipaddress, $server->port ?? 22);
                    $password = decrypt($server->password);
                    if ($ssh->login($server->username, $password)) {
                        $cmds = [
                            "csf -dr {$ip}",
                            "csf -a {$ip}",
                            "cpgcli ip --remove-blacklist {$ip}",
                            "cpgcli ip --allow {$ip}"
                        ];
                        foreach ($cmds as $cmd) {
                            $ssh->exec($cmd . ' > /dev/null 2>&1');
                        }
                        $results[$server->name] = 'Success';
                    } else {
                        $results[$server->name] = 'Auth Failed';
                    }
                } catch (Exception $e) {
                    $results[$server->name] = 'Connection Failed';
                }
            }
            
            // Log activity
            logActivity("Portal: IP {$ip} unblocked on servers by CRM", $clientId > 0 ? $clientId : 0);
            
            echo json_encode(['result' => 'success', 'message' => 'IP unblocked on servers', 'details' => $results]);
        } catch (Exception $e) {
            bridgeLog('UnblockIP ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to process IP unblock']));
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: Check Affiliate Promo Owner
    // ============================================
    if ($action === 'CheckAffiliatePromoOwner') {
        $checkCode = $_POST['code'] ?? '';
        $checkClientId = (int) ($_POST['client_id'] ?? 0);

        if (empty($checkCode) || $checkClientId <= 0) {
            echo json_encode(['result' => 'success', 'is_owner' => false]);
            exit;
        }

        // Load WHMCS first
        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }

        try {
            $affCode = \WHMCS\Database\Capsule::table('mod_affiliate_promocodes')
                ->where('promo_code', $checkCode)
                ->where('status', 'active')
                ->first();

            if ($affCode && (int) $affCode->client_id === $checkClientId) {
                echo json_encode(['result' => 'success', 'is_owner' => true]);
            } else {
                echo json_encode(['result' => 'success', 'is_owner' => false]);
            }
        } catch (Exception $e) {
            echo json_encode(['result' => 'success', 'is_owner' => false]);
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: GetClientDashboardData
    // ============================================
    // Fetches Products, Domains, Tickets, and Unpaid Invoices in a single API roundtrip
    // This reduces the 3-5 second load time to milliseconds
    if ($action === 'GetClientDashboardData') {
        $clientId = (int) ($_POST['clientid'] ?? 0);
        
        if ($clientId <= 0) {
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'clientid is required']));
        }

        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }
        
        try {
            $adminUsername = ''; // localAPI will auto-assign if omitted in newer WHMCS, or we might need it. Actually we don't need it if we omit it or WHMCS handles it. Let's just use localAPI.
            
            $products = localAPI('GetClientsProducts', ['clientid' => $clientId, 'limitnum' => 100]);
            $domains = localAPI('GetClientsDomains', ['clientid' => $clientId, 'limitnum' => 100]);
            $tickets = localAPI('GetTickets', ['clientid' => $clientId, 'limitstart' => 0, 'limitnum' => 50]);
            $invoices = localAPI('GetInvoices', ['userid' => $clientId, 'status' => 'Unpaid', 'limitnum' => 100]);
            
            echo json_encode([
                'result' => 'success',
                'services' => [
                    'products' => $products['products']['product'] ?? [],
                    'domains' => $domains['domains']['domain'] ?? []
                ],
                'tickets' => $tickets['tickets']['ticket'] ?? [],
                'invoices' => $invoices['invoices']['invoice'] ?? []
            ]);
        } catch (Exception $e) {
            bridgeLog('GetClientDashboardData ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to fetch dashboard data']));
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: GetClientDashboardDataByPhoneOrEmail
    // ============================================
    // Looks up a client by email or phone and instantly returns all their dashboard data in one request.
    // This is the ultimate "lightning fast" optimization.
    if ($action === 'GetClientDashboardDataByPhoneOrEmail') {
        $search = $_POST['search'] ?? '';
        
        if (empty($search)) {
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'search parameter is required']));
        }

        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }
        
        try {
            $clientId = 0;
            $clientData = null;

            // 1. Try email lookup first
            if (strpos($search, '@') !== false) {
                $client = \WHMCS\Database\Capsule::table('tblclients')
                    ->where('email', $search)
                    ->first(['id', 'firstname', 'lastname', 'companyname', 'email', 'phonenumber', 'status']);
                if ($client) {
                    $clientId = $client->id;
                    $clientData = $client;
                }
            }

            // 2. Try phone lookup if not found
            if ($clientId === 0) {
                $searchDigits = preg_replace('/\D/', '', $search);
                if (!empty($searchDigits)) {
                    $clients = \WHMCS\Database\Capsule::table('tblclients')
                        ->get(['id', 'firstname', 'lastname', 'companyname', 'email', 'phonenumber', 'status']);
                    
                    foreach ($clients as $c) {
                        if (empty($c->phonenumber)) continue;
                        $clientDigits = preg_replace('/\D/', '', $c->phonenumber);
                        if (empty($clientDigits)) continue;
                        
                        if ($clientDigits === $searchDigits) {
                            $clientId = $c->id;
                            $clientData = $c;
                            break;
                        } 
                        
                        if (strlen($clientDigits) >= 9 && strlen($searchDigits) >= 9) {
                            $clientSuffix = substr($clientDigits, -9);
                            $searchSuffix = substr($searchDigits, -9);
                            if ($clientSuffix === $searchSuffix) {
                                $clientId = $c->id;
                                $clientData = $c;
                                break;
                            }
                        }
                    }
                }
            }

            // If still not found, return empty
            if ($clientId === 0) {
                echo json_encode([
                    'result' => 'success',
                    'client' => null,
                    'services' => ['products' => [], 'domains' => []],
                    'tickets' => [],
                    'invoices' => []
                ]);
                exit;
            }

            // 3. We have the client, fetch dashboard data using localAPI
            $products = localAPI('GetClientsProducts', ['clientid' => $clientId, 'limitnum' => 100]);
            $domains = localAPI('GetClientsDomains', ['clientid' => $clientId, 'limitnum' => 100]);
            $tickets = localAPI('GetTickets', ['clientid' => $clientId, 'limitstart' => 0, 'limitnum' => 50]);
            $invoices = localAPI('GetInvoices', ['userid' => $clientId, 'status' => 'Unpaid', 'limitnum' => 100]);
            
            echo json_encode([
                'result' => 'success',
                'client' => $clientData,
                'services' => [
                    'products' => $products['products']['product'] ?? [],
                    'domains' => $domains['domains']['domain'] ?? []
                ],
                'tickets' => $tickets['tickets']['ticket'] ?? [],
                'invoices' => $invoices['invoices']['invoice'] ?? []
            ]);
        } catch (Exception $e) {
            bridgeLog('GetClientDashboardDataByPhoneOrEmail ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to fetch dashboard data']));
        }
        exit;
    }

    // ============================================
    // CUSTOM ACTION: GetUnpaidInvoicesWithClients
    // ============================================
    if ($action === 'GetUnpaidInvoicesWithClients') {
        $whmcsPath = __DIR__;
        if (file_exists($whmcsPath . '/init.php')) {
            require_once $whmcsPath . '/init.php';
        }

        try {
            // Get all unpaid invoices using localAPI, ordered by latest
            $invoicesRes = localAPI('GetInvoices', [
                'status' => 'Unpaid', 
                'limitnum' => 1000,
                'orderby' => 'id',
                'order' => 'DESC'
            ]);
            $invoices = $invoicesRes['invoices']['invoice'] ?? [];

            // Extract unique client IDs
            $clientIds = [];
            foreach ($invoices as $inv) {
                if (!empty($inv['userid'])) {
                    $clientIds[$inv['userid']] = true;
                }
            }
            $clientIds = array_keys($clientIds);

            // Fetch client details for these IDs
            $clientsMap = [];
            if (!empty($clientIds)) {
                $clients = \WHMCS\Database\Capsule::table('tblclients')
                    ->whereIn('id', $clientIds)
                    ->get(['id', 'phonenumber', 'email']);
                
                foreach ($clients as $c) {
                    $clientsMap[$c->id] = $c;
                }
            }

            // Merge phone number into invoices
            foreach ($invoices as &$inv) {
                $uid = $inv['userid'];
                $inv['phonenumber'] = $clientsMap[$uid]->phonenumber ?? '';
                $inv['email'] = $clientsMap[$uid]->email ?? '';
            }

            echo json_encode([
                'result' => 'success',
                'invoices' => $invoices
            ]);
        } catch (Exception $e) {
            bridgeLog('GetUnpaidInvoicesWithClients ERROR: ' . $e->getMessage());
            http_response_code(500);
            die(json_encode(['result' => 'error', 'message' => 'Failed to fetch invoices with clients']));
        }
        exit;
    }

    // ============================================
    // SPECIAL VALIDATION FOR SENSITIVE ACTIONS
    // ============================================

    // AddClient - Extra validation
    if ($action === 'AddClient') {
        $email = $_POST['email'] ?? '';
        $password = $_POST['password2'] ?? '';
        $firstname = $_POST['firstname'] ?? '';
        $lastname = $_POST['lastname'] ?? '';

        if (empty($email) || empty($password) || empty($firstname) || empty($lastname)) {
            bridgeLog('ERROR: AddClient missing required fields');
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'First name, last name, email, and password are required']));
        }

        if (!isValidEmail($email)) {
            bridgeLog('ERROR: AddClient invalid email: ' . $email);
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'Invalid email address']));
        }

        if (strlen($password) < 8) {
            bridgeLog('ERROR: AddClient password too short');
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'Password must be at least 8 characters']));
        }
    }

    // ResetPassword - Extra validation
    if ($action === 'ResetPassword') {
        $email = $_POST['email'] ?? '';

        if (empty($email) || !isValidEmail($email)) {
            bridgeLog('ERROR: ResetPassword invalid email: ' . $email);
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'Valid email address is required']));
        }
    }

    // ValidateLogin - Log failed attempts for security
    if ($action === 'ValidateLogin') {
        $email = $_POST['email'] ?? '';
        if (empty($email) || !isValidEmail($email)) {
            bridgeLog('ERROR: ValidateLogin invalid email format');
            http_response_code(400);
            die(json_encode(['result' => 'error', 'message' => 'Valid email address is required']));
        }
    }

    // ============================================
    // LOAD WHMCS
    // ============================================

    $whmcsPath = __DIR__;

    // Check if we're in the WHMCS directory
    if (!file_exists($whmcsPath . '/init.php') && !file_exists($whmcsPath . '/includes/api.php')) {
        // Try common locations
        $possiblePaths = [
            dirname(__DIR__),
            '/home/hostnin/public_html/my',
            '/var/www/whmcs',
        ];

        foreach ($possiblePaths as $path) {
            if (file_exists($path . '/init.php')) {
                $whmcsPath = $path;
                break;
            }
        }
    }

    // Initialize WHMCS
    if (file_exists($whmcsPath . '/init.php')) {
        require_once $whmcsPath . '/init.php';
    } else {
        bridgeLog('ERROR: WHMCS init.php not found');
        http_response_code(500);
        die(json_encode(['result' => 'error', 'message' => 'WHMCS initialization failed']));
    }

    // ============================================
    // EXECUTE API CALL
    // ============================================

    // Build API parameters (exclude bridge_secret and internal params)
    $params = $_POST;
    unset($params['bridge_secret']);

    // Store password and custom messages before sanitization
    $password2 = $_POST['password2'] ?? null;
    $custommessage = $_POST['custommessage'] ?? null;
    $customsubject = $_POST['customsubject'] ?? null;

    // Extract bkash_payment_id before sanitization (for Bkash_refund table)
    $bkashPaymentId = $_POST['bkash_payment_id'] ?? null;
    unset($params['bkash_payment_id']); // Don't pass to WHMCS API

    // Sanitize inputs (except passwords)
    $params = sanitizeInput($params);

    // Restore original password (don't sanitize passwords as it may contain special chars)
    if ($password2 !== null) {
        $params['password2'] = $password2;
    }
    
    // Restore custom email fields so HTML is not stripped
    if ($custommessage !== null) {
        $params['custommessage'] = $custommessage;
    }
    if ($customsubject !== null) {
        $params['customsubject'] = $customsubject;
    }

    // Use WHMCS Local API
    if (function_exists('localAPI')) {
        $result = localAPI($action, $params);

        // Log success/failure
        if (($result['result'] ?? '') === 'success') {
            bridgeLog('SUCCESS: ' . $action);

            // Store bKash paymentID in Bkash_refund table for refund support
            if ($action === 'AddInvoicePayment' && !empty($bkashPaymentId) && !empty($params['transid'])) {
                try {
                    $trxID = $params['transid'];
                    // Validate paymentID format (starts with TR)
                    if (strpos($bkashPaymentId, 'TR') === 0) {
                        // Check if already exists
                        $exists = \WHMCS\Database\Capsule::table('Bkash_refund')
                            ->where('trxID', $trxID)
                            ->exists();

                        if (!$exists) {
                            \WHMCS\Database\Capsule::table('Bkash_refund')->insert([
                                'trxID' => $trxID,
                                'paymentID' => $bkashPaymentId,
                            ]);
                            bridgeLog("BKASH: Stored paymentID {$bkashPaymentId} for trxID {$trxID}");
                        }
                    }
                } catch (Exception $e) {
                    bridgeLog('BKASH ERROR: Failed to store paymentID - ' . $e->getMessage());
                    // Don't fail the payment - just log the error
                }
            }
        } else {
            bridgeLog('FAILED: ' . $action . ' - ' . ($result['message'] ?? 'Unknown error'));
        }

        echo json_encode($result);
    } else {
        bridgeLog('ERROR: localAPI function not available');
        http_response_code(500);
        die(json_encode(['result' => 'error', 'message' => 'WHMCS API not available']));
    }

} catch (Exception $e) {
    bridgeLog('EXCEPTION: ' . $e->getMessage());
    http_response_code(500);
    die(json_encode(['result' => 'error', 'message' => 'Internal server error']));
}
