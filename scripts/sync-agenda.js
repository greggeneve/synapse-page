// Script de synchronisation agenda.ch -> DB locale
//
// Usage:
//   node sync-agenda.js                    # Sync incrementale (depuis derniere sync)
//   node sync-agenda.js --full             # Sync complete (derniers 7 jours)
//   node sync-agenda.js --since 2025-01-01 # Sync depuis une date specifique
//   node sync-agenda.js --appointments     # Sync uniquement les RDV (annee en cours)

import mysql from 'mysql2/promise';

// === CONFIGURATION ===
const CONFIG = {
  agenda: {
    customersUrl: 'https://pro.agenda.ch/api/customers_v3',
    appointmentsUrl: 'https://pro.agenda.ch/api/appointments',
    token: process.env.AGENDA_API_TOKEN || 'b3a1f075-a36f-4a23-a3f9-dc7374544a30',
    rateLimit: 100, // requêtes par heure
  },
  db: {
    host: process.env.DB_HOST || '10.10.10.140',
    user: process.env.DB_USER || 'poge_user',
    password: process.env.DB_PASSWORD || 'Griotte24!@#',
    database: process.env.DB_NAME || 'poge_agenda',
  },
  sync: {
    fullSyncDays: 7,        // Pour sync complète, remonter X jours
    batchSize: 500,         // Patients par batch d'insertion
  }
};

// === HELPERS ===

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    full: args.includes('--full'),
    since: args.find((a, i) => args[i-1] === '--since'),
    appointments: args.includes('--appointments'),
    invoicesToday: args.includes('--invoices-today'),
    agendaId: args.find((a, i) => args[i-1] === '--agenda') || '1525',
    all: args.includes('--all'),
  };
}

// === FONCTIONS PRINCIPALES ===

async function getLastSyncDate(connection) {
  const [rows] = await connection.execute(`
    SELECT updated_after 
    FROM agenda_sync_log 
    WHERE entity = 'customers' AND status = 'success'
    ORDER BY finished_at DESC 
    LIMIT 1
  `);
  
  if (rows.length > 0 && rows[0].updated_after) {
    return new Date(rows[0].updated_after);
  }
  
  // Première sync : remonter 30 jours
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}

async function fetchCustomersFromAgenda(updatedAfter) {
  const url = `${CONFIG.agenda.customersUrl}?token=${CONFIG.agenda.token}&updated_after=${updatedAfter.toISOString()}`;
  
  log(`Fetching customers from agenda.ch: ${url.replace(CONFIG.agenda.token, '***')}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  log(`Fetched ${data.length} customers from agenda.ch`);
  
  return data;
}

async function fetchAppointmentsFromAgenda(dateFrom, dateTo, updatedAfter) {
  let url = `${CONFIG.agenda.appointmentsUrl}?token=${CONFIG.agenda.token}`;
  url += `&date_from=${dateFrom.toISOString()}`;
  url += `&date_to=${dateTo.toISOString()}`;
  if (updatedAfter) {
    url += `&updated_after=${updatedAfter.toISOString()}`;
  }
  
  log(`Fetching appointments from agenda.ch: ${url.replace(CONFIG.agenda.token, '***')}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  log(`Fetched ${data.length} appointments from agenda.ch`);
  
  return data;
}

async function fetchInvoicesForCustomer(customerId) {
  const url = `https://pro.agenda.ch/api/invoices?token=${CONFIG.agenda.token}&customer_id=${customerId}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

function convertBoolean(value) {
  if (value === 't' || value === true) return 1;
  if (value === 'f' || value === false) return 0;
  return null;
}

async function upsertCustomers(connection, customers) {
  if (customers.length === 0) return { created: 0, updated: 0 };
  
  let created = 0;
  let updated = 0;
  
  const upsertQuery = `
    INSERT INTO agenda_customers (
      id, firstname, lastname, sex, gender, birthdate, locale,
      email, mobile, phone,
      address, zip, city, country,
      avs_no, insurance_number, insurance_company,
      blocked, verified, disabled, send_email, send_sms,
      comment, custom_attributes,
      last_appointment, next_appointment,
      created_at_agenda, updated_at_agenda
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      firstname = VALUES(firstname),
      lastname = VALUES(lastname),
      sex = VALUES(sex),
      gender = VALUES(gender),
      birthdate = VALUES(birthdate),
      locale = VALUES(locale),
      email = VALUES(email),
      mobile = VALUES(mobile),
      phone = VALUES(phone),
      address = VALUES(address),
      zip = VALUES(zip),
      city = VALUES(city),
      country = VALUES(country),
      avs_no = VALUES(avs_no),
      insurance_number = VALUES(insurance_number),
      insurance_company = VALUES(insurance_company),
      blocked = VALUES(blocked),
      verified = VALUES(verified),
      disabled = VALUES(disabled),
      send_email = VALUES(send_email),
      send_sms = VALUES(send_sms),
      comment = VALUES(comment),
      custom_attributes = VALUES(custom_attributes),
      last_appointment = VALUES(last_appointment),
      next_appointment = VALUES(next_appointment),
      updated_at_agenda = VALUES(updated_at_agenda)
  `;
  
  for (const customer of customers) {
    try {
      const values = [
        parseInt(customer.id, 10),
        customer.firstname,
        customer.lastname,
        customer.sex || null,
        customer.gender || null,
        customer.birthdate || null,
        customer.locale || 'fr',
        customer.email,
        customer.mobile,
        customer.phone,
        customer.address,
        customer.zip,
        customer.city,
        customer.country || 'CH',
        customer.avs_no,
        customer.insurance_number,
        customer.insurance_company,
        convertBoolean(customer.blocked),
        convertBoolean(customer.verified),
        convertBoolean(customer.disabled),
        convertBoolean(customer.send_email),
        convertBoolean(customer.send_sms),
        customer.comment,
        customer.custom_attributes ? JSON.stringify(customer.custom_attributes) : null,
        customer.last_appointment || null,
        customer.next_appointment || null,
        customer.created_at,
        customer.updated_at,
      ];
      
      const [result] = await connection.execute(upsertQuery, values);
      
      if (result.affectedRows === 1) {
        created++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (err) {
      log(`Error upserting customer ${customer.id}: ${err.message}`, 'ERROR');
    }
  }
  
  return { created, updated };
}

async function upsertAppointments(connection, appointments) {
  if (appointments.length === 0) return { created: 0, updated: 0 };
  
  let created = 0;
  let updated = 0;
  
  const upsertQuery = `
    INSERT INTO agenda_appointments (
      id, start_at, end_at, duration, title, comment, enabled,
      agenda_id, location_id, resource_id,
      customer_id, customer_confirmed, customer_booked_online, customer_no_show,
      customer_comment, price, currency, customers_json,
      created_at_agenda, updated_at_agenda
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      start_at = VALUES(start_at),
      end_at = VALUES(end_at),
      duration = VALUES(duration),
      title = VALUES(title),
      comment = VALUES(comment),
      enabled = VALUES(enabled),
      agenda_id = VALUES(agenda_id),
      location_id = VALUES(location_id),
      resource_id = VALUES(resource_id),
      customer_id = VALUES(customer_id),
      customer_confirmed = VALUES(customer_confirmed),
      customer_booked_online = VALUES(customer_booked_online),
      customer_no_show = VALUES(customer_no_show),
      customer_comment = VALUES(customer_comment),
      price = VALUES(price),
      currency = VALUES(currency),
      customers_json = VALUES(customers_json),
      updated_at_agenda = VALUES(updated_at_agenda)
  `;
  
  for (const appt of appointments) {
    try {
      // Extraire le premier customer
      const customer = appt.customers && appt.customers.length > 0 ? appt.customers[0] : null;
      
      const values = [
        appt.id,
        appt.start_at ? new Date(appt.start_at) : null,
        appt.end_at ? new Date(appt.end_at) : null,
        appt.duration || 0,
        appt.title,
        appt.comment,
        appt.enabled === 't' || appt.enabled === true ? 1 : 0,
        appt.agenda_id,
        appt.location_id,
        appt.resource_id,
        customer ? parseInt(customer.id, 10) : null,
        customer ? (customer.confirmed ? 1 : 0) : 0,
        customer ? (customer.booked_online ? 1 : 0) : 0,
        customer ? (customer.no_show ? 1 : 0) : 0,
        customer ? customer.comment : null,
        customer ? customer.price : null,
        customer ? customer.currency : 'CHF',
        appt.customers ? JSON.stringify(appt.customers) : null,
        appt.created_at ? new Date(appt.created_at) : null,
        appt.updated_at ? new Date(appt.updated_at) : null,
      ];
      
      const [result] = await connection.execute(upsertQuery, values);
      
      if (result.affectedRows === 1) {
        created++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (err) {
      log(`Error upserting appointment ${appt.id}: ${err.message}`, 'ERROR');
    }
  }
  
  return { created, updated };
}

async function upsertInvoices(connection, invoices, customerId) {
  if (invoices.length === 0) return { created: 0, updated: 0 };
  
  let created = 0;
  let updated = 0;
  
  const upsertQuery = `
    INSERT INTO agenda_invoices (
      id, type, invoiceno, invoice_date, due_date,
      paid, amount, amount_paid, currency,
      customer_id, customer_firstname, customer_lastname,
      appointment_dates, agendas, transmissions, locale,
      created_at_agenda, updated_at_agenda
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      type = VALUES(type),
      invoiceno = VALUES(invoiceno),
      invoice_date = VALUES(invoice_date),
      due_date = VALUES(due_date),
      paid = VALUES(paid),
      amount = VALUES(amount),
      amount_paid = VALUES(amount_paid),
      currency = VALUES(currency),
      customer_firstname = VALUES(customer_firstname),
      customer_lastname = VALUES(customer_lastname),
      appointment_dates = VALUES(appointment_dates),
      agendas = VALUES(agendas),
      transmissions = VALUES(transmissions),
      locale = VALUES(locale),
      updated_at_agenda = VALUES(updated_at_agenda)
  `;
  
  for (const inv of invoices) {
    try {
      const values = [
        inv.id,
        inv.type,
        inv.invoiceno,
        inv.date,
        inv.due_date,
        inv.paid ? 1 : 0,
        parseFloat(inv.amount) || 0,
        parseFloat(inv.amount_paid) || 0,
        inv.currency || 'CHF',
        customerId,
        inv.customer_firstname,
        inv.customer_lastname,
        inv.appointment_dates ? JSON.stringify(inv.appointment_dates) : null,
        inv.agendas ? JSON.stringify(inv.agendas) : null,
        inv.transmissions ? JSON.stringify(inv.transmissions) : null,
        inv.locale,
        inv.created_at ? new Date(inv.created_at) : null,
        inv.updated_at ? new Date(inv.updated_at) : null,
      ];
      
      const [result] = await connection.execute(upsertQuery, values);
      
      if (result.affectedRows === 1) {
        created++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (err) {
      log(`Error upserting invoice ${inv.id}: ${err.message}`, 'ERROR');
    }
  }
  
  return { created, updated };
}

async function createSyncLog(connection, syncType, updatedAfter) {
  const [result] = await connection.execute(`
    INSERT INTO agenda_sync_log (sync_type, entity, started_at, updated_after, status)
    VALUES (?, 'customers', NOW(), ?, 'running')
  `, [syncType, updatedAfter]);
  
  return result.insertId;
}

async function updateSyncLog(connection, logId, stats, status, errorMessage = null) {
  await connection.execute(`
    UPDATE agenda_sync_log SET
      finished_at = NOW(),
      duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()),
      records_fetched = ?,
      records_created = ?,
      records_updated = ?,
      records_unchanged = ?,
      status = ?,
      error_message = ?
    WHERE id = ?
  `, [
    stats.fetched,
    stats.created,
    stats.updated,
    stats.fetched - stats.created - stats.updated,
    status,
    errorMessage,
    logId,
  ]);
}

// === MAIN ===

async function syncCustomers(connection, args) {
  // Déterminer la date de départ
  let updatedAfter;
  
  if (args.since) {
    updatedAfter = new Date(args.since);
  } else if (args.full) {
    updatedAfter = new Date();
    updatedAfter.setDate(updatedAfter.getDate() - CONFIG.sync.fullSyncDays);
  } else {
    updatedAfter = await getLastSyncDate(connection);
  }
  
  log(`Syncing customers updated after: ${updatedAfter.toISOString()}`);
  
  const syncType = args.full ? 'full' : 'incremental';
  const logId = await createSyncLog(connection, syncType, updatedAfter);
  
  try {
    const customers = await fetchCustomersFromAgenda(updatedAfter);
    const { created, updated } = await upsertCustomers(connection, customers);
    
    const stats = { fetched: customers.length, created, updated };
    log(`Customers sync: ${stats.fetched} fetched, ${stats.created} created, ${stats.updated} updated`);
    
    await updateSyncLog(connection, logId, stats, 'success');
    return stats;
  } catch (error) {
    await updateSyncLog(connection, logId, { fetched: 0, created: 0, updated: 0 }, 'error', error.message);
    throw error;
  }
}

async function syncAppointments(connection, args) {
  // Date range pour les RDV : année en cours
  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), 0, 1); // 1er janvier
  const dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59); // 31 décembre
  
  // Updated after pour sync incrémentale
  let updatedAfter = null;
  if (!args.full && !args.since) {
    // Dernière sync des appointments
    const [rows] = await connection.execute(`
      SELECT updated_after FROM agenda_sync_log 
      WHERE entity = 'appointments' AND status = 'success'
      ORDER BY finished_at DESC LIMIT 1
    `);
    if (rows.length > 0 && rows[0].updated_after) {
      updatedAfter = new Date(rows[0].updated_after);
    }
  } else if (args.since) {
    updatedAfter = new Date(args.since);
  }
  
  log(`Syncing appointments from ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);
  if (updatedAfter) {
    log(`  (updated after: ${updatedAfter.toISOString()})`);
  }
  
  // Log de sync
  const [logResult] = await connection.execute(`
    INSERT INTO agenda_sync_log (sync_type, entity, started_at, updated_after, status)
    VALUES (?, 'appointments', NOW(), ?, 'running')
  `, [args.full ? 'full' : 'incremental', updatedAfter]);
  const logId = logResult.insertId;
  
  try {
    const appointments = await fetchAppointmentsFromAgenda(dateFrom, dateTo, updatedAfter);
    const { created, updated } = await upsertAppointments(connection, appointments);
    
    const stats = { fetched: appointments.length, created, updated };
    log(`Appointments sync: ${stats.fetched} fetched, ${stats.created} created, ${stats.updated} updated`);
    
    await updateSyncLog(connection, logId, stats, 'success');
    return stats;
  } catch (error) {
    await updateSyncLog(connection, logId, { fetched: 0, created: 0, updated: 0 }, 'error', error.message);
    throw error;
  }
}

async function syncInvoicesToday(connection, agendaId) {
  log(`Syncing invoices for today's patients (agenda_id: ${agendaId})...`);
  
  // Récupérer les customer_ids des patients du jour
  const [patients] = await connection.execute(`
    SELECT DISTINCT customer_id 
    FROM agenda_appointments 
    WHERE DATE(start_at) = CURDATE() 
      AND agenda_id = ? 
      AND enabled = 1
      AND customer_id IS NOT NULL
  `, [agendaId]);
  
  log(`Found ${patients.length} patients today`);
  
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFetched = 0;
  
  for (const patient of patients) {
    const customerId = patient.customer_id;
    
    try {
      // Petite pause pour respecter le rate limit (100/h = 1 toutes les 36 sec, on fait 1/sec pour être safe)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const invoices = await fetchInvoicesForCustomer(customerId);
      totalFetched += invoices.length;
      
      if (invoices.length > 0) {
        const { created, updated } = await upsertInvoices(connection, invoices, customerId);
        totalCreated += created;
        totalUpdated += updated;
        log(`  Customer ${customerId}: ${invoices.length} invoices (${created} new, ${updated} updated)`);
      }
    } catch (err) {
      log(`  Error for customer ${customerId}: ${err.message}`, 'ERROR');
    }
  }
  
  log(`Invoices sync: ${totalFetched} fetched, ${totalCreated} created, ${totalUpdated} updated`);
  
  return { fetched: totalFetched, created: totalCreated, updated: totalUpdated };
}

async function main() {
  const args = parseArgs();
  
  log(`=== Starting sync ===`);
  if (args.full) log('Mode: FULL');
  if (args.appointments) log('Mode: APPOINTMENTS ONLY');
  if (args.invoicesToday) log('Mode: INVOICES TODAY');
  if (args.all) log('Mode: ALL (customers + appointments)');
  
  let connection;
  
  try {
    connection = await mysql.createConnection(CONFIG.db);
    log('Connected to database');
    
    // Sync customers (sauf si --appointments ou --invoices-today seul)
    if (!args.appointments && !args.invoicesToday) {
      await syncCustomers(connection, args);
    }
    
    // Sync appointments (si --appointments ou --all)
    if (args.appointments || args.all) {
      await syncAppointments(connection, args);
    }
    
    // Sync invoices today (si --invoices-today)
    if (args.invoicesToday) {
      await syncInvoicesToday(connection, args.agendaId);
    }
    
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'ERROR');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      log('Database connection closed');
    }
  }
  
  log('=== Sync finished ===');
}

main();

