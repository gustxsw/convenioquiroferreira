// Read-only schema audit: compares the live database against the schema
// expected by server/index.js initializeDatabase(). Reports missing tables
// and missing columns. Does NOT modify anything.
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Expected schema derived from server/index.js initializeDatabase().
// table -> array of column names that must exist.
const expected = {
  users: [
    "id", "name", "cpf", "email", "phone", "birth_date", "address",
    "address_number", "address_complement", "neighborhood", "city", "state",
    "zip_code", "password", "roles", "subscription_status", "subscription_expiry",
    "photo_url", "signature_url", "clinic_logo_url", "category_name", "percentage",
    "crm", "professional_type", "professional_registration_number",
    "reset_password_token", "reset_password_expires_at", "agenda_start_time",
    "agenda_end_time", "primary_specialty_code", "onboarding_status",
    "onboarding_completed_at", "linked_professional_id", "affiliate_code",
    "referred_by_affiliate_id", "affiliate_referral_id", "created_at", "updated_at",
  ],
  service_categories: ["id", "name", "description", "created_at"],
  services: [
    "id", "name", "description", "base_price", "category_id", "professional_id",
    "is_base_service", "created_at",
  ],
  dependents: [
    "id", "user_id", "name", "cpf", "phone", "birth_date", "subscription_status",
    "subscription_expiry", "billing_amount", "payment_reference", "activated_at",
    "created_at", "updated_at",
  ],
  private_patients: [
    "id", "professional_id", "name", "cpf", "email", "phone", "birth_date",
    "address", "address_number", "address_complement", "neighborhood", "city",
    "state", "zip_code", "convenio", "is_active", "created_at", "updated_at",
  ],
  attendance_locations: [
    "id", "professional_id", "name", "address", "address_number",
    "address_complement", "neighborhood", "city", "state", "zip_code", "phone",
    "is_default", "created_at",
  ],
  consultations: [
    "id", "user_id", "dependent_id", "private_patient_id", "professional_id",
    "service_id", "location_id", "value", "date", "status", "notes",
    "payment_method", "convenio", "cancelled_at", "cancelled_by",
    "cancellation_reason", "created_at", "updated_at", "settled_at",
  ],
  blocked_slots: ["id", "professional_id", "date", "time_slot", "reason", "created_at"],
  saved_documents: [
    "id", "title", "document_type", "patient_name", "patient_cpf",
    "professional_id", "document_url", "document_metadata", "created_at",
  ],
  medical_records: [
    "id", "professional_id", "private_patient_id", "patient_name", "patient_cpf",
    "patient_type", "chief_complaint", "history_present_illness",
    "past_medical_history", "medications", "allergies", "physical_examination",
    "diagnosis", "treatment_plan", "notes", "vital_signs", "pdf_url",
    "pdf_generated_at", "specialty_code", "specialty_fields", "created_at",
    "updated_at",
  ],
  medical_record_evolutions: [
    "id", "medical_record_id", "professional_id", "evolution_date", "content",
    "created_at", "updated_at",
  ],
  medical_documents: [
    "id", "professional_id", "private_patient_id", "patient_name", "patient_cpf",
    "title", "document_type", "document_url", "template_data", "created_at",
  ],
  // NB: the CREATE TABLE in index.js declares starts_at, but the live schema
  // and all queries use granted_at. Same drift on notifications (read_at, not
  // is_read). We audit against the names the code actually queries.
  scheduling_access: [
    "id", "professional_id", "granted_by", "granted_at", "expires_at", "reason",
    "is_active", "schedule_balance", "created_at", "updated_at",
  ],
  client_payments: [
    "id", "user_id", "amount", "payment_method", "status", "payment_reference",
    "mp_preference_id", "mp_payment_id", "processed_at", "created_at",
  ],
  dependent_payments: [
    "id", "dependent_id", "amount", "payment_method", "status",
    "payment_reference", "mp_preference_id", "mp_payment_id", "processed_at",
    "created_at",
  ],
  professional_payments: [
    "id", "professional_id", "amount", "payment_method", "status",
    "payment_reference", "mp_preference_id", "mp_payment_id", "processed_at",
    "created_at",
  ],
  agenda_payments: [
    "id", "professional_id", "duration_days", "amount", "payment_method",
    "status", "payment_reference", "mp_preference_id", "mp_payment_id",
    "processed_at", "created_at",
  ],
  professional_statements: [
    "id", "professional_id", "payment_id", "mp_payment_id", "period_start",
    "period_end", "amount", "consultations_count", "created_at",
  ],
  notifications: ["id", "user_id", "title", "message", "type", "read_at", "created_at"],
  audit_logs: [
    "id", "user_id", "action", "table_name", "record_id", "old_values",
    "new_values", "ip_address", "user_agent", "created_at",
  ],
  system_settings: ["id", "key", "value", "description", "updated_by", "updated_at"],
  coupons: [
    "id", "code", "discount_type", "discount_value", "is_active", "description",
    "created_at", "created_by", "coupon_type", "unlimited_use", "valid_from",
    "valid_until", "final_price",
  ],
  coupon_usage: [
    "id", "coupon_id", "user_id", "payment_reference", "discount_applied", "used_at",
  ],
  refresh_tokens: ["id", "user_id", "token_hash", "expires_at", "created_at", "revoked"],
  affiliates: [
    "id", "name", "code", "status", "user_id", "created_at", "pix_key",
    "leader_affiliate_id", "leadership_enabled", "leader_limit", "override_amount",
    "leader_downline_commission_amount", "commission_amount",
  ],
  affiliate_commissions: [
    "id", "affiliate_id", "commission_type", "source_affiliate_id", "client_id",
    "amount", "status", "created_at", "paid_at", "paid_by_user_id", "paid_method",
    "paid_receipt_url", "paid_receipt_public_id", "mp_payment_id", "payment_reference",
  ],
  affiliate_referrals: [
    "id", "affiliate_id", "visitor_identifier", "user_id", "converted",
    "converted_at", "referral_code", "metadata", "created_at", "updated_at",
  ],
};

const run = async () => {
  const { rows: tableRows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existingTables = new Set(tableRows.map((r) => r.table_name));

  const { rows: colRows } = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const colsByTable = {};
  for (const r of colRows) {
    (colsByTable[r.table_name] ||= new Set()).add(r.column_name);
  }

  let problems = 0;
  const missingTables = [];
  const missingColumns = {};

  for (const [table, cols] of Object.entries(expected)) {
    if (!existingTables.has(table)) {
      missingTables.push(table);
      problems++;
      continue;
    }
    const present = colsByTable[table] || new Set();
    const missing = cols.filter((c) => !present.has(c));
    if (missing.length) {
      missingColumns[table] = missing;
      problems += missing.length;
    }
  }

  console.log("=== AUDITORIA DE SCHEMA ===");
  console.log(`Banco: ${(process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":****@")}`);
  console.log(`Tabelas esperadas: ${Object.keys(expected).length}`);
  console.log(`Tabelas no banco (public): ${existingTables.size}`);
  console.log("");

  if (missingTables.length) {
    console.log("❌ TABELAS FALTANDO:");
    for (const t of missingTables) console.log(`   - ${t}`);
  } else {
    console.log("✅ Todas as tabelas esperadas existem.");
  }
  console.log("");

  if (Object.keys(missingColumns).length) {
    console.log("❌ COLUNAS FALTANDO:");
    for (const [t, cols] of Object.entries(missingColumns)) {
      console.log(`   ${t}: ${cols.join(", ")}`);
    }
  } else {
    console.log("✅ Todas as colunas esperadas existem.");
  }
  console.log("");

  // Extra tables present in DB but not in expected (informational only)
  const extra = [...existingTables].filter(
    (t) => !expected[t] && !t.startsWith("pg_") && t !== "_prisma_migrations"
  );
  if (extra.length) {
    console.log("ℹ️  Tabelas extras no banco (não definidas no init):");
    console.log(`   ${extra.join(", ")}`);
    console.log("");
  }

  console.log(problems === 0
    ? "🎉 RESULTADO: schema OK, nada faltando."
    : `⚠️  RESULTADO: ${problems} discrepância(s) encontrada(s).`);

  await pool.end();
  process.exit(problems === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error("Erro na auditoria:", err.message);
  process.exit(2);
});
