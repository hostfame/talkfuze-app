/**
 * WHMCS Bridge Client
 * 
 * Server-side client for communicating with WHMCS via the secure bridge
 */

const WHMCS_BRIDGE_URL = process.env.WHMCS_BRIDGE_URL || 'https://my.hostnin.com/hostnin_bridge.php';
const WHMCS_BRIDGE_SECRET = process.env.WHMCS_BRIDGE_SECRET || '';

// Log environment status on cold start (useful for debugging, dev only)
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[WHMCS] Bridge URL configured:', WHMCS_BRIDGE_URL);
    console.log('[WHMCS] Bridge secret configured:', WHMCS_BRIDGE_SECRET ? 'YES' : 'NO');
}

interface WHMCSResponse {
    result: 'success' | 'error';
    message?: string;
    [key: string]: unknown;
}

export async function whmcsRequest<T extends WHMCSResponse>(
    action: string,
    params: Record<string, string | number> = {},
    timeoutMs: number = 30000, // 30 second default timeout
    maxRetries: number = 3, // Retry up to 3 times for rate limit errors
    isMutation: boolean = false, // Prevent retries on 500s/timeouts to avoid duplicates
    userIp?: string // Real end-user IP - passed as X-User-IP for per-user rate limiting on bridge
): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[WHMCS] Starting ${action} request (attempt ${attempt + 1}/${maxRetries + 1})...`);
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const formData = new URLSearchParams({
                bridge_secret: WHMCS_BRIDGE_SECRET,
                action,
                ...Object.fromEntries(
                    Object.entries(params).map(([k, v]) => [k, String(v)])
                ),
            });

            const requestHeaders: Record<string, string> = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'HostninPortal/1.0',
                // Domain identity header - validated by bridge's ALLOWED_ORIGINS check.
                // This ensures the bridge only accepts calls from our own infrastructure,
                // even if the bridge_secret were ever compromised.
                'X-Origin-Domain': 'talkfuze.com',
            };

            // Pass real user IP so bridge can do per-user rate limiting
            // Without this, bridge sees Vercel's shared server IP for all users
            if (userIp && userIp !== 'unknown') {
                requestHeaders['X-User-IP'] = userIp;
            }

            const response = await fetch(WHMCS_BRIDGE_URL, {
                method: 'POST',
                headers: requestHeaders,
                body: formData.toString(),
                cache: 'no-store',
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (process.env.NODE_ENV === 'development') {
                console.log(`[WHMCS] ${action} response status: ${response.status} in ${Date.now() - startTime}ms`);
            }

            // Handle rate limiting (429) with retry
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 10000);

                console.warn(`[WHMCS] Rate limited (429). Waiting ${waitTime}ms before retry...`);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue; // Retry
                }

                throw new Error('WHMCS API rate limit exceeded. Please try again in a moment.');
            }

            // Handle other server errors with retry
            if (response.status >= 500 && attempt < maxRetries) {
                if (isMutation) {
                    console.warn(`[WHMCS] Server error (${response.status}) on mutation. Not retrying to prevent duplicates.`);
                    throw new Error(`WHMCS API error: ${response.status}`);
                }
                const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
                console.warn(`[WHMCS] Server error (${response.status}). Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // Retry
            }

            if (!response.ok) {
                throw new Error(`WHMCS API error: ${response.status}`);
            }

            // Get response as text first to handle non-JSON errors
            const responseText = await response.text();

            let data: T;
            try {
                data = JSON.parse(responseText);
            } catch {
                // Log the raw response for debugging
                console.error('[WHMCS] Non-JSON response:', responseText.substring(0, 500));
                throw new Error(`WHMCS returned invalid response: ${responseText.substring(0, 100)}`);
            }

            if (data.result === 'error') {
                console.error(`[WHMCS] ${action} error:`, data.message);
                throw new Error(data.message || 'Unknown WHMCS error');
            }

            if (process.env.NODE_ENV === 'development') {
                console.log(`[WHMCS] ${action} completed successfully in ${Date.now() - startTime}ms`);
            }
            return data;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                console.error(`[WHMCS] ${action} timed out after ${timeoutMs}ms`);
                lastError = new Error(`WHMCS request timeout after ${timeoutMs}ms`);

                // Retry on timeout if attempts remaining
                if (attempt < maxRetries) {
                    if (isMutation) {
                        console.warn(`[WHMCS] Timeout on mutation. Not retrying to prevent duplicates.`);
                        throw lastError;
                    }
                    console.warn(`[WHMCS] Retrying after timeout...`);
                    continue;
                }
                throw lastError;
            }

            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`[WHMCS] ${action} failed after ${Date.now() - startTime}ms:`, error);

            // Retry on network-level errors (fetch failed, ECONNREFUSED, ENOTFOUND, etc.)
            const isNetworkError = lastError.message === 'fetch failed' ||
                lastError.message.includes('ECONNREFUSED') ||
                lastError.message.includes('ENOTFOUND') ||
                lastError.message.includes('ETIMEDOUT') ||
                lastError.message.includes('ECONNRESET') ||
                lastError.cause !== undefined; // Node.js fetch wraps network errors in cause

            if (isNetworkError && attempt < maxRetries) {
                if (isMutation) {
                    console.warn(`[WHMCS] Network error on mutation. Not retrying to prevent duplicates.`);
                    const friendlyMessage = 'Unable to connect to our server. Please check your connection and try again.';
                    throw new Error(friendlyMessage);
                }
                const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
                console.warn(`[WHMCS] Network error "${lastError.message}". Retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
                if (lastError.cause) {
                    console.warn(`[WHMCS] Underlying cause:`, lastError.cause);
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // Retry
            }

            // Non-retryable or all retries exhausted - throw with user-friendly message
            const friendlyMessage = isNetworkError
                ? 'Unable to connect to our authentication server. Please try again in a moment.'
                : lastError.message;
            throw new Error(friendlyMessage);
        }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('WHMCS request failed after all retries');
}


// ============================================
// AUTH
// ============================================

export async function validateLogin(email: string, password: string) {
    return whmcsRequest<{
        result: 'success' | 'error';
        userid?: number;
        passwordhash?: string;
        message?: string;
    }>('ValidateLogin', {
        email,
        password2: password,
    });
}

/**
 * Fast variant of validateLogin for auth flows.
 * Uses 10s timeout and 1 retry to prevent login from hanging
 * when WHMCS is slow or unresponsive.
 */
export async function validateLoginFast(email: string, password: string) {
    return whmcsRequest<{
        result: 'success' | 'error';
        userid?: number;
        passwordhash?: string;
        message?: string;
    }>('ValidateLogin', {
        email,
        password2: password,
    }, 10000, 1); // 10s timeout, 1 retry (max ~20s vs ~120s)
}

/**
 * Register a new client
 * currency: WHMCS numeric currency ID (1=BDT, 2=USD)
 */
export async function addClient(data: {
    firstname: string;
    lastname: string;
    email: string;
    password2: string;
    phonenumber?: string;
    address1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    currency?: number; // 1=BDT, 2=USD
}, userIp?: string) {
    return whmcsRequest<{
        result: 'success' | 'error';
        clientid?: number;
        message?: string;
    }>('AddClient', {
        ...data,
        // Optional fields with defaults
        address1: data.address1 || 'Not provided',
        city: data.city || 'Not provided',
        state: data.state || 'Not provided',
        postcode: data.postcode || '00000',
        country: data.country || 'BD',
        currency: data.currency || 1, // Default to BDT
    }, 30000, 3, true, userIp);
}

/**
 * Request password reset email
 */
export async function resetPassword(email: string) {
    return whmcsRequest<{
        result: 'success' | 'error';
        message?: string;
    }>('ResetPassword', {
        email,
    }, 30000, 3, true);
}

/**
 * Create SSO Token for auto-login to WHMCS
 * This allows users logged into Next.js to be automatically logged into WHMCS
 * 
 * @param clientId - The WHMCS client ID
 * @param destination - Optional destination (e.g., 'clientarea:invoices', 'sso:custom_redirect')
 * @param ssoRedirectPath - Optional custom redirect path (e.g., '/viewinvoice.php?id=123')
 */
export async function createSsoToken(
    clientId: number,
    destination?: string,
    ssoRedirectPath?: string
) {
    const params: Record<string, string | number> = {
        client_id: clientId,
        destination: destination || 'clientarea:invoices',
    };

    // For custom redirects, add the sso_redirect_path
    if (ssoRedirectPath) {
        params.sso_redirect_path = ssoRedirectPath;
    }

    return whmcsRequest<{
        result: 'success' | 'error';
        access_token?: string;
        redirect_url?: string;
        message?: string;
    }>('CreateSsoToken', params);
}

/**
 * Fast variant of createSsoToken for auth flows.
 * Uses 8s timeout and 1 retry. SSO token creation is non-critical ,
 * if it fails, we can still redirect to WHMCS without auto-login.
 */
export async function createSsoTokenFast(
    clientId: number,
    destination?: string,
    ssoRedirectPath?: string
) {
    const params: Record<string, string | number> = {
        client_id: clientId,
        destination: destination || 'clientarea:invoices',
    };

    if (ssoRedirectPath) {
        params.sso_redirect_path = ssoRedirectPath;
    }

    return whmcsRequest<{
        result: 'success' | 'error';
        access_token?: string;
        redirect_url?: string;
        message?: string;
    }>('CreateSsoToken', params, 8000, 1); // 8s timeout, 1 retry
}


export async function getClientDetails(clientId: number) {
    return whmcsRequest<{
        result: 'success';
        id: number;
        firstname: string;
        lastname: string;
        email: string;
        companyname?: string;
        address1?: string;
        address2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
        phonenumber?: string;
        datecreated?: string;
        credit?: string;
        currencyprefix?: string;
        currency?: number;
        [key: string]: unknown;
    }>('GetClientsDetails', {
        clientid: clientId,
        stats: 1,
    });
}

/**
 * Get client details by email (for Google login)
 */
export async function getClientDetailsByEmail(email: string) {
    try {
        const result = await whmcsRequest<{
            result: 'success';
            id: number;
            firstname: string;
            lastname: string;
            email: string;
            [key: string]: unknown;
        }>('GetClientsDetails', {
            email: email,
        });
        return result;
    } catch {
        return null;
    }
}

/**
 * Fast variant of getClientDetailsByEmail for auth flows.
 * Uses 8s timeout and 1 retry to prevent Google Sign-In from hanging
 * when WHMCS is slow or unresponsive.
 */
export async function getClientDetailsByEmailFast(email: string) {
    try {
        const result = await whmcsRequest<{
            result: 'success';
            id: number;
            firstname: string;
            lastname: string;
            email: string;
            credit?: string;
            [key: string]: unknown;
        }>('GetClientsDetails', {
            email: email,
            stats: 1,
        }, 8000, 1); // 8s timeout, 1 retry (max ~16s vs ~120s)
        return result;
    } catch {
        return null;
    }
}

// ============================================
// SERVICES
// ============================================

export async function getClientsProducts(clientId: number, limitStart = 0, limitNum = 25) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        products?: {
            product: Array<{
                id: number;
                name: string;
                domain?: string;
                status: string;
                billingcycle: string;
                nextduedate: string;
                regdate?: string;
                [key: string]: unknown;
            }>;
        };
    }>('GetClientsProducts', {
        clientid: clientId,
        limitstart: limitStart,
        limitnum: limitNum,
    });

    return {
        totalResults: result.totalresults || 0,
        products: result.products?.product || [],
    };
}

export async function getClientsAddons(clientId: number) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        addons?: {
            addon: Array<{
                id: number;
                addonid: number;
                name: string;
                status: string;
                [key: string]: unknown;
            }>;
        };
    }>('GetClientsAddons', {
        clientid: clientId,
    });

    return {
        totalResults: result.totalresults || 0,
        addons: result.addons?.addon || [],
    };
}

export async function getClientsDomains(clientId: number, limitStart = 0, limitNum = 25) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        domains?: {
            domain: Array<{
                id: number;
                domainname: string;
                status: string;
                regdate: string;
                expirydate: string;
                [key: string]: unknown;
            }>;
        };
    }>('GetClientsDomains', {
        clientid: clientId,
        limitstart: limitStart,
        limitnum: limitNum,
    });

    return {
        totalResults: result.totalresults || 0,
        domains: result.domains?.domain || [],
    };
}

export async function getDomainNameservers(domainId: number) {
    return whmcsRequest<{
        result: 'success';
        ns1?: string;
        ns2?: string;
        ns3?: string;
        ns4?: string;
        ns5?: string;
    }>('DomainGetNameservers', {
        domainid: domainId,
    });
}

export async function updateDomainNameservers(
    domainId: number,
    ns1: string,
    ns2: string,
    ns3?: string,
    ns4?: string,
    ns5?: string
) {
    const params: Record<string, string | number> = {
        domainid: domainId,
        ns1,
        ns2,
    };
    if (ns3) params.ns3 = ns3;
    if (ns4) params.ns4 = ns4;
    if (ns5) params.ns5 = ns5;

    return whmcsRequest<{
        result: 'success';
    }>('DomainUpdateNameservers', params, 30000, 3, true);
}

/**
 * Update nameservers for domains with empty/no registrar using the DomainRelay custom bridge action.
 * This replicates the domainrelay module behavior, queues NS in additionalnotes and sends admin notification.
 */
export async function domainRelayUpdateNS(
    domainId: number,
    clientId: number,
    ns1: string,
    ns2: string,
    ns3?: string,
    ns4?: string,
    ns5?: string
) {
    const params: Record<string, string | number> = {
        domainid: domainId,
        clientid: clientId,
        ns1,
        ns2,
    };
    if (ns3) params.ns3 = ns3;
    if (ns4) params.ns4 = ns4;
    if (ns5) params.ns5 = ns5;

    return whmcsRequest<{
        result: 'success';
        message: string;
    }>('DomainRelayUpdateNS', params, 30000, 3, true);
}

export async function getDomainLockStatus(domainId: number) {
    return whmcsRequest<{
        result: 'success';
        lockstatus: 'locked' | 'unlocked';
    }>('DomainGetLockingStatus', {
        domainid: domainId,
    });
}

export async function updateDomainLockStatus(domainId: number, lockstatus: boolean) {
    return whmcsRequest<{
        result: 'success';
    }>('DomainUpdateLockingStatus', {
        domainid: domainId,
        lockstatus: lockstatus ? 1 : 0,
    }, 30000, 3, true);
}

// ============================================
// INVOICES
// ============================================

export async function getInvoices(clientId: number, limitStart = 0, limitNum = 25, status?: string) {
    const params: Record<string, string | number> = {
        userid: clientId,
        limitstart: limitStart,
        limitnum: limitNum,
    };

    if (status) {
        params.status = status;
    }

    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        invoices?: {
            invoice: Array<{
                id: number;
                date: string;
                duedate: string;
                total: string;
                status: string;
                currencycode?: string;
                currencyprefix?: string;
                currencysuffix?: string;
                [key: string]: unknown;
            }>;
        };
    }>('GetInvoices', params);

    return {
        totalResults: result.totalresults || 0,
        invoices: result.invoices?.invoice || [],
    };
}

export async function getInvoice(invoiceId: number) {
    return whmcsRequest<{
        result: 'success';
        invoiceid: number;
        userid: number;
        currencycode?: string; // e.g. "USD", "BDT"
        date: string;
        duedate: string;
        datepaid?: string;
        subtotal: string;
        credit: string;
        tax: string;
        total: string;
        balance: string;
        status: string;
        paymentmethod: string;
        items?: {
            item: Array<{
                id: number;
                description: string;
                amount: string;
            }>;
        };
        [key: string]: unknown;
    }>('GetInvoice', {
        invoiceid: invoiceId,
    });
}

/**
 * Add payment to an invoice (marks invoice as paid)
 * This triggers WHMCS automation and GTM tracking
 */
export async function addInvoicePayment(params: {
    invoiceid: number;
    transid: string;
    amount?: number;
    gateway: string;
    date?: string; // YYYY-MM-DD format, defaults to today
    bkash_payment_id?: string; // bKash internal payment ID for refund support
}) {
    const payload: Record<string, string | number> = {
        invoiceid: params.invoiceid,
        transid: params.transid,
        gateway: params.gateway,
        date: params.date || new Date().toISOString().split('T')[0],
    };

    if (params.amount !== undefined) {
        payload.amount = params.amount;
    }

    // Pass bKash payment ID so the bridge can store it in Bkash_refund table
    if (params.bkash_payment_id) {
        payload.bkash_payment_id = params.bkash_payment_id;
    }

    return whmcsRequest<{
        result: 'success' | 'error';
        message?: string;
    }>('AddInvoicePayment', payload, 30000, 3, true);
}

// ============================================
// ADD FUNDS & CREDIT
// ============================================

/**
 * Apply a specific credit amount to an existing invoice.
 * If the amount surpasses the invoice total, WHMCS auto-caps it.
 */
export async function applyCreditToInvoice(invoiceId: number, amount: number | string) {
    return whmcsRequest<{
        result: 'success' | 'error';
        invoiceid?: string;
        amount?: string;
        message?: string;
    }>('ApplyCredit', {
        invoiceid: invoiceId,
        amount: amount,
    }, 30000, 3, true);
}

/**
 * Create an invoice for adding funds (credit deposit).
 * Creates a single-item invoice with "Add Funds" as the description.
 * After creation, redirect the user to the payment page with the new invoice ID.
 */
export async function createAddFundsInvoice(clientId: number, amount: number, paymentMethod: string = 'bkash') {
    return whmcsRequest<{
        result: 'success' | 'error';
        invoiceid?: number;
        status?: string;
        message?: string;
    }>('CreateInvoice', {
        userid: clientId,
        status: 'Unpaid',
        sendinvoice: 0,
        paymentmethod: paymentMethod,
        'itemdescription1': 'Add Funds',
        'itemamount1': amount,
        'itemtaxed1': 0,
        autoapplycredit: 0,
    }, 30000, 3, true);
}

// ============================================
// TICKETS
// ============================================

export async function getTickets(clientId: number, limitStart = 0, limitNum = 25, status?: string) {
    const params: Record<string, string | number> = {
        clientid: clientId,
        limitstart: limitStart,
        limitnum: limitNum,
    };

    if (status) {
        params.status = status;
    }

    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        tickets?: {
            ticket: Array<{
                id: number;
                tid: string;
                subject: string;
                status: string;
                deptname: string;
                lastreply: string;
                [key: string]: unknown;
            }>;
        };
    }>('GetTickets', params);

    return {
        totalResults: result.totalresults || 0,
        tickets: result.tickets?.ticket || [],
    };
}

export async function getTicket(ticketId: number) {
    return whmcsRequest<{
        result: 'success';
        id: number;
        tid: string;
        userid: number;
        subject: string;
        message: string;
        status: string;
        deptname: string;
        date: string;
        name: string;
        replies?: {
            reply: Array<{
                name?: string;
                admin?: string;
                date: string;
                message: string;
            }>;
        };
        [key: string]: unknown;
    }>('GetTicket', {
        ticketid: ticketId,
    });
}

export async function openTicket(
    clientId: number,
    deptId: number,
    subject: string,
    message: string,
    serviceId?: number,
    attachments?: Array<{ filename?: string; name?: string; data: string }>, // base64 file data
    noemail?: boolean
) {
    const params: Record<string, string | number> = {
        clientid: clientId,
        deptid: deptId,
        subject,
        message,
    };

    if (serviceId) {
        params.serviceid = serviceId;
    }

    if (noemail !== undefined) {
        params.noemail = noemail ? 'true' : 'false';
    }

    // WHMCS expects attachments as base64-encoded JSON array of {name, data}
    if (attachments && attachments.length > 0) {
        const formatted = attachments.map(att => ({
            name: att.filename || att.name || 'attachment.jpg',
            data: att.data
        }));
        params.attachments = Buffer.from(JSON.stringify(formatted)).toString('base64');
    }

    return whmcsRequest<{
        result: 'success';
        id: number;
        tid: string;
    }>('OpenTicket', params, 30000, 3, true);
}

export async function addTicketReply(
    ticketId: number, 
    message: string, 
    clientId: number,
    attachments?: Array<{ filename?: string; name?: string; data: string }>,
    noemail?: boolean
) {
    const params: Record<string, string | number> = {
        ticketid: ticketId,
        message,
        clientid: clientId,
    };

    if (noemail !== undefined) {
        params.noemail = noemail ? 'true' : 'false';
    }

    if (attachments && attachments.length > 0) {
        const formatted = attachments.map(att => ({
            name: att.filename || att.name || 'attachment.jpg',
            data: att.data
        }));
        params.attachments = Buffer.from(JSON.stringify(formatted)).toString('base64');
    }

    return whmcsRequest<{
        result: 'success';
    }>('AddTicketReply', params, 30000, 3, true);
}

// ============================================
// TICKET LEADERBOARD STATS
// ============================================

export async function getTicketStatsForLeaderboard(days: number = 14) {
    const result = await whmcsRequest<{
        result: 'success';
        admin_stats: Array<{
            name: string;
            replies: number;
            tickets_handled: number;
            avg_rating: number | null;
            feedback_count: number;
            hourly_activity: number[];
        }>;
        tickets_by_status: Record<string, number>;
        period_days: number;
    }>('GetTicketStatsForLeaderboard', {
        days: days,
    }, 30000, 2);

    return result;
}

export async function getSupportDepartments() {
    const result = await whmcsRequest<{
        result: 'success';
        departments?: {
            department: Array<{
                id: number;
                name: string;
            }>;
        };
    }>('GetSupportDepartments', {});

    return result.departments?.department || [];
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

export async function getDashboardSummary(clientId: number) {
    const [products, invoices, tickets] = await Promise.all([
        getClientsProducts(clientId, 0, 100),
        getInvoices(clientId, 0, 100, 'Unpaid'),
        getTickets(clientId, 0, 100, 'Open'),
    ]);

    const activeServices = products.products.filter(
        (p) => p.status?.toLowerCase() === 'active'
    );

    const unpaidAmount = invoices.invoices.reduce(
        (sum, inv) => sum + parseFloat(inv.total || '0'),
        0
    );

    return {
        activeServices: activeServices.length,
        totalServices: products.totalResults,
        unpaidInvoices: invoices.totalResults,
        unpaidAmount,
        openTickets: tickets.totalResults,
        recentServices: products.products.slice(0, 5),
        recentInvoices: invoices.invoices.slice(0, 5),
        recentTickets: tickets.tickets.slice(0, 5),
    };
}

// ============================================
// ORDERS
// ============================================

export interface OrderItem {
    productId: number;
    domain?: string;
    billingcycle: string;
    configoptions?: Record<string | number, string | number> | string;
    customfields?: string; // Base64 encoded custom fields
}

export interface DomainInfo {
    action: 'register' | 'transfer' | 'owndomain';
    domain: string;
    regperiod?: number; // Years to register (default: 1)
    eppcode?: string; // For transfers
}

export async function addOrder(
    clientId: number,
    paymentMethod: string,
    items: OrderItem[],
    promocode?: string,
    domainInfo?: DomainInfo | DomainInfo[],
    addons?: number[]
) {
    const params: Record<string, string | number> = {
        clientid: clientId,
        paymentmethod: paymentMethod,
    };

    // Add products
    let productIndex = 0;
    items.forEach((item) => {
        // Only add product parameters if it's a real product (ID > 0)
        if (item.productId && item.productId > 0) {
            params[`pid[${productIndex}]`] = item.productId;
            if (item.domain) params[`domain[${productIndex}]`] = item.domain;
            params[`billingcycle[${productIndex}]`] = item.billingcycle;
            if (item.configoptions) {
                // Handle object structure: configoptions[0][123] = 456
                if (typeof item.configoptions === 'object') {
                    Object.entries(item.configoptions).forEach(([k, v]) => {
                        params[`configoptions[${productIndex}][${k}]`] = v;
                    });
                } else {
                    params[`configoptions[${productIndex}]`] = item.configoptions;
                }
            }
            if (item.customfields) params[`customfields[${productIndex}]`] = item.customfields;
            productIndex++;
        }
    });

    // Add domain registrations/transfers (supports single or multiple domains)
    // WHMCS AddOrder accepts domainname[N], domaintype[N], regperiod[N] for each domain
    const domainList = domainInfo ? (Array.isArray(domainInfo) ? domainInfo : [domainInfo]) : [];
    const registrableDomains = domainList.filter(d => d.domain && (d.action === 'register' || d.action === 'transfer'));

    registrableDomains.forEach((d, idx) => {
        params[`domain[${idx}]`] = d.domain;
        params[`domaintype[${idx}]`] = d.action; // 'register' or 'transfer'
        params[`regperiod[${idx}]`] = d.regperiod || 1;
        if (d.action === 'transfer' && d.eppcode) {
            params[`eppcode[${idx}]`] = d.eppcode;
        }
    });

    if (registrableDomains.length > 0) {
        console.log(`[WHMCS AddOrder] Adding ${registrableDomains.length} domain(s):`, registrableDomains.map(d => d.domain));
    }

    if (promocode) {
        params.promocode = promocode;
    }

    // Add addons if specified
    // WHMCS accepts addons as: addons[productIndex]=addonId1,addonId2,...
    if (addons && addons.length > 0) {
        params['addons[0]'] = addons.join(',');
        console.log('[WHMCS AddOrder] Sending addons:', addons.join(','));
    }

    console.log('[WHMCS AddOrder] Request params:', JSON.stringify(params, null, 2));

    const result = await whmcsRequest<{
        result: 'success';
        orderid: number;
        invoiceid: number;
        productids: string;
        addonids: string;
        domainids: string;
    }>('AddOrder', params, 60000, 1); // 60s timeout, 1 retry, AddOrder is inherently slow (SMTP emails sent synchronously)

    // Check if addons were actually added
    if (addons && addons.length > 0) {
        const addonIdsResponse = result.addonids || '';
        if (!addonIdsResponse || addonIdsResponse === '') {
            console.warn('[WHMCS AddOrder] WARNING: Addons were requested but none were added to the order!');
            console.warn('[WHMCS AddOrder] Requested addon IDs:', addons);
            console.warn('[WHMCS AddOrder] Response addonids:', addonIdsResponse);
            console.warn('[WHMCS AddOrder] This may indicate the addon IDs do not exist in WHMCS or are not assigned to this product.');
        } else {
            console.log('[WHMCS AddOrder] Addons added successfully:', addonIdsResponse);
        }
    }

    return result;
}

export async function getOrder(orderId: number) {
    return whmcsRequest<{
        result: 'success';
        id: number;
        ordernum: string;
        date: string;
        amount: string;
        status: string;
        invoiceid: number;
        [key: string]: unknown;
    }>('GetOrder', {
        orderid: orderId,
    });
}

// ============================================
// DOMAIN AVAILABILITY
// ============================================

export async function checkDomain(domain: string) {
    const result = await whmcsRequest<{
        result: 'success';
        status: 'available' | 'unavailable' | 'error';
        whois?: string;
    }>('DomainWhois', {
        domain,
    });

    // Parse WHOIS to determine availability
    const isAvailable = result.whois?.toLowerCase().includes('no match') ||
        result.whois?.toLowerCase().includes('not found') ||
        result.whois?.toLowerCase().includes('no data found');

    return {
        domain,
        available: isAvailable,
        whois: result.whois,
    };
}

export async function getTLDPricing(currencyId?: number) {
    return whmcsRequest<{
        result: 'success';
        pricing: Record<string, {
            register: Record<string, string>;
            renew: Record<string, string>;
            transfer: Record<string, string>;
        }>;
        currency: {
            id: number;
            code: string;
            prefix: string;
            suffix: string;
        };
    }>('GetTLDPricing', currencyId ? { currencyid: currencyId } : {});
}

export async function getPaymentMethods() {
    const result = await whmcsRequest<{
        result: 'success';
        paymentmethods?: {
            paymentmethod: Array<{
                module: string;
                displayname: string;
            }>;
        };
    }>('GetPaymentMethods', {});

    return result.paymentmethods?.paymentmethod || [];
}

export async function getProductConfigurableOptions(productId: number) {
    return whmcsRequest<{
        result: 'success';
        configoptions: {
            configoption: Array<{
                id: number;
                name: string;
                type: number;
                options: {
                    option: Array<{
                        id: number;
                        name: string;
                        recurring: number; // Base price
                        pricing: {
                            monthly: number;
                            quarterly: number;
                            semiannually: number;
                            annually: number;
                            biennially: number;
                            triennially: number;
                        };
                    }>;
                };
            }>;
        };
    }>('GetProductConfigurableOptions', {
        productid: productId
    });
}

// Update client profile details
export async function updateClient(clientId: number, data: {
    firstname?: string;
    lastname?: string;
    companyname?: string;
    email?: string;
    phonenumber?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
}) {
    return whmcsRequest<{
        result: 'success';
        clientid: number;
    }>('UpdateClient', {
        clientid: clientId,
        ...data,
    });
}

// Change cPanel/hosting password
export async function moduleChangePw(serviceId: number) {
    return whmcsRequest<{
        result: 'success';
    }>('ModuleChangePw', {
        serviceid: serviceId,
    });
}

// Request service cancellation
export async function addCancelRequest(serviceId: number, reason: string, type: 'Immediate' | 'End of Billing Period' = 'End of Billing Period') {
    return whmcsRequest<{
        result: 'success';
    }>('AddCancelRequest', {
        serviceid: serviceId,
        reason,
        type,
    });
}

// Get a single product/service by service ID
export async function getProduct(serviceId: number) {
    const result = await whmcsRequest<{
        result: 'success';
        products: {
            product: Array<{
                id: number;
                clientid: number;
                name: string;
                domain: string;
                status: string;
                billingcycle: string;
                nextduedate: string;
                regdate: string;
                dedicatedip: string;
                assignedips: string;
                servername: string;
                serverip: string;
                username: string;
                firstpaymentamount: string;
                recurringamount: string;
                groupname: string;
                diskusage: number;
                disklimit: number;
                bwusage: number;
                bwlimit: number;
                lastupdate: string;
            }>;
        };
    }>('GetClientsProducts', {
        serviceid: serviceId,
    });
    const products = result.products?.product || [];
    return products.length > 0 ? products[0] : null;
}

// Get email history for a client
export async function getEmails(clientId: number, limitStart = 0, limitNum = 25) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        emails: {
            email: Array<{
                id: number;
                userid: number;
                subject: string;
                message: string;
                date: string;
                to: string;
            }>;
        };
    }>('GetEmails', {
        clientid: clientId,
        limitstart: limitStart,
        limitnum: limitNum,
    });
    return {
        emails: result.emails?.email || [],
        totalResults: result.totalresults || 0,
    };
}

// Get contacts for a client
export async function getContacts(clientId: number) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        contacts: {
            contact: Array<{
                id: number;
                userid: number;
                firstname: string;
                lastname: string;
                companyname: string;
                email: string;
                phonenumber: string;
                address1: string;
                city: string;
                state: string;
                postcode: string;
                country: string;
                subaccount: number;
                permissions: string;
            }>;
        };
    }>('GetContacts', {
        userid: clientId,
    });
    return {
        contacts: result.contacts?.contact || [],
        totalResults: result.totalresults || 0,
    };
}

// Add a contact for a client
export async function addContact(clientId: number, data: {
    firstname: string;
    lastname: string;
    email: string;
    phonenumber?: string;
    address1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    permissions?: string;
    password2?: string;
}) {
    return whmcsRequest<{
        result: 'success';
        contactid: number;
    }>('AddContact', {
        clientid: clientId,
        ...data,
    });
}

// Delete a contact
export async function deleteContact(contactId: number) {
    return whmcsRequest<{
        result: 'success';
    }>('DeleteContact', {
        contactid: contactId,
    });
}

// Toggle domain ID protection
export async function domainToggleIdProtect(domainId: number, enable: boolean) {
    return whmcsRequest<{
        result: 'success';
    }>('DomainToggleIdProtect', {
        domainid: domainId,
        idprotect: enable ? 1 : 0,
    });
}

// Get client credits
export async function getCredits(clientId: number) {
    const result = await whmcsRequest<{
        result: 'success';
        credits: {
            credit: Array<{
                id: number;
                date: string;
                description: string;
                amount: string;
            }>;
        };
        totalresults: number;
    }>('GetCredits', {
        clientid: clientId,
    });
    return {
        credits: result.credits?.credit || [],
        totalResults: result.totalresults || 0,
    };
}

// Change WHMCS account password
export async function changeAccountPassword(clientId: number, newPassword: string) {
    return whmcsRequest<{
        result: 'success';
        clientid: number;
    }>('UpdateClient', {
        clientid: clientId,
        password2: newPassword,
    });
}

export async function getClients(searchStr: string) {
    const result = await whmcsRequest<{
        result: 'success';
        totalresults: number;
        clients?: {
            client: Array<{
                id: number;
                firstname: string;
                lastname: string;
                companyname: string;
                email: string;
                phonenumber: string;
                status: string;
            }>;
        };
    }>('GetClients', {
        search: searchStr,
        limitnum: 25,
    });

    return {
        totalResults: result.totalresults || 0,
        clients: result.clients?.client || [],
    };
}

export async function getClientByPhone(phoneStr: string) {
    const result = await whmcsRequest<{
        result: 'success' | 'error';
        clients?: Array<{
            id: number;
            firstname: string;
            lastname: string;
            companyname: string;
            email: string;
            phonenumber: string;
            status: string;
        }>;
    }>('GetClientByPhone', {
        phone: phoneStr,
    });

    return {
        clients: result.clients || [],
    };
}

export async function getClientDashboardData(clientId: number) {
    const result = await whmcsRequest<{
        result: 'success' | 'error';
        services?: { products: any[], domains: any[] };
        tickets?: any[];
        invoices?: any[];
    }>('GetClientDashboardData', {
        clientid: clientId,
    });

    return result;
}

export async function getClientDashboardDataByPhoneOrEmail(searchQuery: string) {
    const result = await whmcsRequest<{
        result: 'success' | 'error';
        client?: any;
        services?: { products: any[], domains: any[] };
        tickets?: any[];
        invoices?: any[];
    }>('GetClientDashboardDataByPhoneOrEmail', {
        search: searchQuery,
    });

    return result;
}

export async function unblockWhmcsIP(ip: string, clientId: number) {
    return whmcsRequest<{
        result: 'success' | 'error';
        message?: string;
        details?: Record<string, string>;
    }>('UnblockIP', {
        ip: ip,
        clientid: clientId,
    }, 90000, 1, true);
}
