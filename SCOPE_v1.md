Project Scope — Quiro Ferreira System (Execution & Scalability)
Objective
Enable medical service operations (subscriptions, scheduling, payments, affiliate sales, and admin controls) with clear auditability and scalable monetization.
Optimize for cashflow visibility, affiliate performance, and operational reliability.
User Roles & Permissions
Admin
Full system access: users, affiliates, commissions, payments, coupons, reports.
Can mark commissions paid and attach proof.
Can configure promotions and manage system settings.
Affiliate (Vendedor)
Access to affiliate dashboard: referrals, commissions, receipts, link sharing.
No access to client admin data or payment controls.
Client
Manage subscription, dependents, and appointments.
Uses coupons and referral links.
Professional
Manage agenda, consultations, private patients, documents.
Core Modules (Current + Future-Ready)
Authentication & Roles
JWT-based, multi-role sessions.
Subscriptions & Payments
MercadoPago integration, annual subscription logic, coupon support.
Affiliate Tracking & Commissions
Referral tracking, conversion logic, commission registry, payment control, proof upload.
Admin Finance Reporting
Monthly closing, affiliate payment workflow, export (XLSX).
Scheduling & Consultations
Calendar, blocking, recurring logic, payment for agenda access.
Documents & Signatures
PDF generation + Cloudinary storage.
User Management
Clients, professionals, affiliates.
Future-ready
Auto payout integration (Pix API), billing reconciliation, multi-currency, role-based analytics.
Business Rules (Payments / Affiliates / Commissions)
Coupon
Optional validity range. If valid_from exists, coupon is invalid before that date.
valid_until blocks expiration.
Affiliate Tracking
Referral is tied to user via tracking ID.
Conversion occurs on payment approval, independent of admin commission payment.
Commission
Created per payment (renewals included).
Stored with payment identifiers to prevent duplicates.
Admin can mark as paid with method + proof (Cloudinary).
Affiliate Payment
Pix key is optional but expected; admin can copy and pay.
Batch payment supported via selection (same affiliate only).
Data Entities & Relationships (High Level)
User → roles, subscription status, referral link, affiliate_referral_id
Affiliate → user_id, code, commission_amount, pix_key
AffiliateReferral → affiliate_id, user_id, conversion flags
AffiliateCommission → affiliate_id, client_id, payment identifiers, paid data
Coupon → code, type, discount, optional validity range
Payment → client/dependent/professional, status, payment_reference
IN SCOPE
Stable subscription and scheduling flow with payment support.
Full affiliate lifecycle: tracking → conversion → commission → admin payment.
Finance reporting with monthly closing and XLSX export.
Cloudinary storage for receipts and documents.
OUT OF SCOPE
Real-time payout automation (Pix API direct transfer).
Accounting ledger, invoicing, or tax compliance system.
Full CRM (sales pipeline, marketing automation).
Multi-language/multi-currency across regions.
Non-Functional Requirements
Security
Role-based access everywhere.
Uploaded files stored in Cloudinary with secure URLs.
Performance
Monthly reporting computed with filters to avoid all-time heavy aggregation.
Auditability
Commission payments include who paid, when, method, and receipt.
Reliability
Webhook idempotency enforced by payment identifiers.
Scalability
Avoid duplicated reporting joins; use aggregation by period.
Risks & Technical Debt
Webhook duplication → mitigated by unique payment identifiers.
Coupon validity → ensure valid_from/valid_until always enforced.
Affiliate tracking drift → ensure referral links always map to affiliate code.
Data consistency → backfill scripts needed for legacy data.
Front-end reliance on backend errors → must keep API strict and explicit.
Roadmap (Phased Delivery)
Phase 1 — MVP (Current)
Subscriptions, scheduling, affiliate tracking, commissions, admin payment & proof.
Coupon system with validity control.
Affiliate dashboard + admin reporting.
Phase 2 — Scale
Batch payment optimizations.
Dedicated affiliate financial statements.
Automated audit exports (XLSX reports by month).
Phase 3 — Automation
Pix payout integration (optional).
Automated reconciliation of MercadoPago vs commissions.
Advanced analytics dashboards.
If you want, I can also provide wireframe-level module layout or turn this into a delivery checklist by phase.