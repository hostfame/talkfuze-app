UPDATE whatsapp_templates SET template = 'Hi {firstname}, a new invoice (#{invoiceid}) for {total} is ready. It''s due on {duedate}.

Whenever you have a moment, please check your invoice to pay. Let us know if you need any help!

Pay here: {invoiceurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoiceCreated';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, just a quick reminder that invoice #{invoiceid} for {total} is due on {duedate}.

Please settle it when you get a chance to keep everything running smoothly!

Pay here: {invoiceurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoicePaymentReminder';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, looks like invoice #{invoiceid} for {total} is now overdue.

Please clear the balance soon so your services aren''t interrupted!

Pay here: {invoiceurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoiceFirstOverdueReminder';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, this is our second reminder about your overdue invoice #{invoiceid} for {total}.

Please settle it as soon as possible to avoid any disruptions.

Pay here: {invoiceurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoiceSecondOverdueReminder';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, your service is pending suspension due to unpaid invoice #{invoiceid} ({total}).

Please pay immediately to keep your services active.

Pay here: {invoiceurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoiceThirdOverdueReminder';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, thank you! We received your payment of {total} for invoice #{invoiceid}. Your services are fully updated and active.

Any questions? just reply!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoicePaid';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, your invoice #{invoiceid} for {total} has been successfully refunded to your account.

Let us know if you need anything else!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'InvoiceRefunded';
UPDATE whatsapp_templates SET template = 'Welcome aboard, {firstname}! Your new service ''{productname}'' for ''{domain}'' is now up and running.

We''ve emailed you the setup details. Let us know if you need a hand getting started!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'AfterModuleCreate';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, your service ''{productname}'' ({domain}) has been suspended. Reason: {suspendreason}.

Please resolve any outstanding invoices to get it back online.' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'AfterModuleSuspend';
UPDATE whatsapp_templates SET template = 'Great news, {firstname}! Your service ''{productname}'' ({domain}) is back online and fully active.

Thanks for your payment, and let us know if you need any help!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'AfterModuleUnsuspend';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, unfortunately your service ''{productname}'' for ''{domain}'' has been terminated due to non-payment.

If this was a mistake, please reach out to us right away.' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'AfterModuleTerminate';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, we''ve got your message! Ticket #{ticketid} (''{ticketsubject}'') is now open with our {ticketdept} team.

We''ll get back to you shortly!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'TicketOpen';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, our team just replied to your ticket #{ticketid} (''{ticketsubject}'').

You can view the response here: {ticketurl}' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'TicketReply';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, we''ve closed your ticket #{ticketid} (''{ticketsubject}'').

Thanks for reaching out, and let us know if you ever need help again!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'TicketClose';
UPDATE whatsapp_templates SET template = 'Security Alert: A new login was detected for your account from IP {ipaddr} at {timestamp}.

If this wasn''t you, please change your password immediately.' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'ClientLoginShare';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, just letting you know your client area password was successfully updated.

If you didn''t do this, please contact us immediately!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'ClientPasswordChange';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, the password for your service user {username} ({domain}) was just updated.

If you didn''t request this, please let us know!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'ServicePasswordChange';
UPDATE whatsapp_templates SET template = 'Woohoo! {firstname}, your domain {domain} is now officially registered until {expirydate}.

Thanks for choosing us for your web journey!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'DomainRegistration';
UPDATE whatsapp_templates SET template = 'Great news, {firstname}! Your domain {domain} transfer is complete and now fully active in your account.' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'DomainTransfer';
UPDATE whatsapp_templates SET template = 'Awesome! {firstname}, your domain {domain} has been successfully renewed until {expirydate}.

Thanks for sticking with us!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'DomainRenewal';
UPDATE whatsapp_templates SET template = 'Hi {firstname}, heads up! Your domain {domain} has expired.

Please renew it right away so you don''t lose it.' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'DomainExpiration';
UPDATE whatsapp_templates SET template = 'Welcome to Hostnin, {firstname}! We''re thrilled to have you on board.

Your account is all set up. Let us know if you need any help getting started!' WHERE org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e' AND name = 'ClientRegistration';
