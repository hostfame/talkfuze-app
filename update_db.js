const fs = require('fs');
const { execSync } = require('child_process');

const DEFAULT_TEMPLATES = [
  {
    name: "InvoiceCreated",
    description: "Fires when a new invoice is generated in WHMCS.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, a new invoice (#{invoiceid}) for {total} is ready. It's due on {duedate}.\n\nWhenever you have a moment, please check your invoice to pay. Let us know if you need any help!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoicePaymentReminder",
    description: "Fires for standard unpaid invoice payment reminders.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, just a quick reminder that invoice #{invoiceid} for {total} is due on {duedate}.\n\nPlease settle it when you get a chance to keep everything running smoothly!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceFirstOverdueReminder",
    description: "Fires when an invoice becomes 1 day overdue.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, looks like invoice #{invoiceid} for {total} is now overdue.\n\nPlease clear the balance soon so your services aren't interrupted!\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceSecondOverdueReminder",
    description: "Fires when an invoice becomes 3 days overdue.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, this is our second reminder about your overdue invoice #{invoiceid} for {total}.\n\nPlease settle it as soon as possible to avoid any disruptions.\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoiceThirdOverdueReminder",
    description: "Fires when an invoice becomes 5 days overdue (final warning).",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {duedate}, {invoiceurl}",
    template: "Hi {firstname}, your service is pending suspension due to unpaid invoice #{invoiceid} ({total}).\n\nPlease pay immediately to keep your services active.\n\nPay here: {invoiceurl}"
  },
  {
    name: "InvoicePaid",
    description: "Fires instantly when an invoice is fully paid.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}, {transid}",
    template: "Hi {firstname}, thank you! We received your payment of {total} for invoice #{invoiceid}. Your services are fully updated and active.\n\nAny questions? just reply!"
  },
  {
    name: "InvoiceRefunded",
    description: "Fires when an invoice is refunded.",
    variables: "{firstname}, {lastname}, {invoiceid}, {total}",
    template: "Hi {firstname}, your invoice #{invoiceid} for {total} has been successfully refunded to your account.\n\nLet us know if you need anything else!"
  },
  {
    name: "AfterModuleCreate",
    description: "Fires when a hosting plan or service is successfully activated.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Welcome aboard, {firstname}! Your new service '{productname}' for '{domain}' is now up and running.\n\nWe've emailed you the setup details. Let us know if you need a hand getting started!"
  },
  {
    name: "AfterModuleSuspend",
    description: "Fires when a service is automatically suspended due to overdue invoices.",
    variables: "{firstname}, {lastname}, {domain}, {productname}, {suspendreason}",
    template: "Hi {firstname}, your service '{productname}' ({domain}) has been suspended. Reason: {suspendreason}.\n\nPlease resolve any outstanding invoices to get it back online."
  },
  {
    name: "AfterModuleUnsuspend",
    description: "Fires when a service is automatically unsuspended post-payment.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Great news, {firstname}! Your service '{productname}' ({domain}) is back online and fully active.\n\nThanks for your payment, and let us know if you need any help!"
  },
  {
    name: "AfterModuleTerminate",
    description: "Fires when a suspended service is terminated and files deleted.",
    variables: "{firstname}, {lastname}, {domain}, {productname}",
    template: "Hi {firstname}, unfortunately your service '{productname}' for '{domain}' has been terminated due to non-payment.\n\nIf this was a mistake, please reach out to us right away."
  },
  {
    name: "TicketOpen",
    description: "Fires when a client opens a new support ticket.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}, {ticketdept}",
    template: "Hi {firstname}, we've got your message! Ticket #{ticketid} ('{ticketsubject}') is now open with our {ticketdept} team.\n\nWe'll get back to you shortly!"
  },
  {
    name: "TicketReply",
    description: "Fires when a staff member replies to a support ticket.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}, {ticketurl}",
    template: "Hi {firstname}, our team just replied to your ticket #{ticketid} ('{ticketsubject}').\n\nYou can view the response here: {ticketurl}"
  },
  {
    name: "TicketClose",
    description: "Fires when a support ticket is marked as closed.",
    variables: "{firstname}, {lastname}, {ticketid}, {ticketsubject}",
    template: "Hi {firstname}, we've closed your ticket #{ticketid} ('{ticketsubject}').\n\nThanks for reaching out, and let us know if you ever need help again!"
  },
  {
    name: "ClientLoginShare",
    description: "Fires upon successful client portal login.",
    variables: "{firstname}, {lastname}, {ipaddr}, {timestamp}",
    template: "Security Alert: A new login was detected for your account from IP {ipaddr} at {timestamp}.\n\nIf this wasn't you, please change your password immediately."
  },
  {
    name: "ClientPasswordChange",
    description: "Fires when a client portal password is reset or updated.",
    variables: "{firstname}, {lastname}",
    template: "Hi {firstname}, just letting you know your client area password was successfully updated.\n\nIf you didn't do this, please contact us immediately!"
  },
  {
    name: "ServicePasswordChange",
    description: "Fires when a service (e.g. cPanel/Virtualizor) password is changed.",
    variables: "{firstname}, {lastname}, {domain}, {username}",
    template: "Hi {firstname}, the password for your service user {username} ({domain}) was just updated.\n\nIf you didn't request this, please let us know!"
  },
  {
    name: "DomainRegistration",
    description: "Fires when a domain registration is completed.",
    variables: "{firstname}, {lastname}, {domain}, {expirydate}",
    template: "Woohoo! {firstname}, your domain {domain} is now officially registered until {expirydate}.\n\nThanks for choosing us for your web journey!"
  },
  {
    name: "DomainTransfer",
    description: "Fires when a domain transfer is successfully completed.",
    variables: "{firstname}, {lastname}, {domain}",
    template: "Great news, {firstname}! Your domain {domain} transfer is complete and now fully active in your account."
  },
  {
    name: "DomainRenewal",
    description: "Fires when a domain is renewed.",
    variables: "{firstname}, {lastname}, {domain}, {expirydate}",
    template: "Awesome! {firstname}, your domain {domain} has been successfully renewed until {expirydate}.\n\nThanks for sticking with us!"
  },
  {
    name: "DomainExpiration",
    description: "Fires when a domain registration expires.",
    variables: "{firstname}, {lastname}, {domain}",
    template: "Hi {firstname}, heads up! Your domain {domain} has expired.\n\nPlease renew it right away so you don't lose it."
  },
  {
    name: "ClientRegistration",
    description: "Fires when a new user signs up on your WHMCS portal.",
    variables: "{firstname}, {lastname}, {email}",
    template: "Welcome to Hostnin, {firstname}! We're thrilled to have you on board.\n\nYour account is all set up. Let us know if you need any help getting started!"
  }
];

const ORG_ID = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';
let sql = '';
DEFAULT_TEMPLATES.forEach(t => {
  const name = t.name.replace(/'/g, "''");
  const template = t.template.replace(/'/g, "''");
  sql += `UPDATE whatsapp_templates SET template = '${template}' WHERE org_id = '${ORG_ID}' AND name = '${name}';\n`;
});

fs.writeFileSync('update_templates.sql', sql);
console.log('SQL file created. Executing...');

try {
  const result = execSync('npx supabase db query --linked -f update_templates.sql').toString();
  console.log(result);
} catch (e) {
  console.error(e.stdout.toString());
  console.error(e.stderr.toString());
}
