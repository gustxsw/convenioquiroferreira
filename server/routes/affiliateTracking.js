import express from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Track affiliate referral (public endpoint - no auth required)
router.post("/track", async (req, res) => {
  try {
    const { referralCode, visitorIdentifier, metadata } = req.body;

    if (!referralCode || !visitorIdentifier) {
      return res.status(400).json({
        error: "Missing required fields: referralCode, visitorIdentifier",
      });
    }

    // Find affiliate by referral code (checking if user has vendedor role)
    const affiliateResult = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE id = $1 AND 'vendedor' = ANY(roles)`,
      [referralCode]
    );

    if (affiliateResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid referral code" });
    }

    const affiliate = affiliateResult.rows[0];

    // Check if this visitor already has a referral from this affiliate
    const existingReferral = await pool.query(
      `SELECT id FROM affiliate_referrals
       WHERE visitor_identifier = $1 AND affiliate_id = $2`,
      [visitorIdentifier, affiliate.id]
    );

    if (existingReferral.rows.length > 0) {
      // Referral already exists, just return success
      return res.json({
        success: true,
        referralId: existingReferral.rows[0].id,
        message: "Referral already tracked",
      });
    }

    // Also check for recent referrals from the same browser fingerprint to prevent duplicates
    // if user clears localStorage
    if (metadata && metadata.userAgent) {
      const recentDuplicateCheck = await pool.query(
        `SELECT id FROM affiliate_referrals
         WHERE affiliate_id = $1
         AND metadata->>'userAgent' = $2
         AND created_at > NOW() - INTERVAL '7 days'
         LIMIT 1`,
        [affiliate.id, metadata.userAgent]
      );

      if (recentDuplicateCheck.rows.length > 0) {
        // Found a recent referral with same fingerprint, return that one
        return res.json({
          success: true,
          referralId: recentDuplicateCheck.rows[0].id,
          message: "Referral already tracked (detected by browser fingerprint)",
        });
      }
    }

    // Create new referral
    const result = await pool.query(
      `INSERT INTO affiliate_referrals
       (affiliate_id, visitor_identifier, referral_code, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [affiliate.id, visitorIdentifier, referralCode, JSON.stringify(metadata || {})]
    );

    res.json({
      success: true,
      referralId: result.rows[0].id,
      affiliateName: affiliate.name,
      createdAt: result.rows[0].created_at,
    });
  } catch (error) {
    console.error("Error tracking affiliate referral:", error);
    res.status(500).json({ error: "Failed to track referral" });
  }
});

// Link user to referral (called during registration)
router.post("/link-user", async (req, res) => {
  try {
    const { userId, visitorIdentifier } = req.body;

    if (!userId || !visitorIdentifier) {
      return res.status(400).json({
        error: "Missing required fields: userId, visitorIdentifier",
      });
    }

    // Find the most recent referral for this visitor
    const referralResult = await pool.query(
      `SELECT id, affiliate_id
       FROM affiliate_referrals
       WHERE visitor_identifier = $1
       AND user_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [visitorIdentifier]
    );

    if (referralResult.rows.length === 0) {
      return res.json({
        success: true,
        message: "No referral found for this visitor",
      });
    }

    const referral = referralResult.rows[0];

    // Update referral with user_id
    await pool.query(
      `UPDATE affiliate_referrals
       SET user_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [userId, referral.id]
    );

    // Update user with affiliate information
    await pool.query(
      `UPDATE users
       SET referred_by_affiliate_id = $1,
           affiliate_referral_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [referral.affiliate_id, referral.id, userId]
    );

    res.json({
      success: true,
      referralId: referral.id,
      affiliateId: referral.affiliate_id,
      message: "User linked to affiliate successfully",
    });
  } catch (error) {
    console.error("Error linking user to referral:", error);
    res.status(500).json({ error: "Failed to link user to referral" });
  }
});

// Mark referral as converted (called when user pays)
router.post("/convert", authenticate, async (req, res) => {
  try {
    const { userId } = req.body;
    const actualUserId = userId || req.user.id;

    // Find the referral for this user
    const referralResult = await pool.query(
      `SELECT id, affiliate_id, converted
       FROM affiliate_referrals
       WHERE user_id = $1`,
      [actualUserId]
    );

    if (referralResult.rows.length === 0) {
      return res.json({
        success: true,
        message: "No referral found for this user",
      });
    }

    const referral = referralResult.rows[0];

    if (referral.converted) {
      return res.json({
        success: true,
        message: "Referral already converted",
      });
    }

    // Mark as converted
    await pool.query(
      `UPDATE affiliate_referrals
       SET converted = true,
           converted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [referral.id]
    );

    res.json({
      success: true,
      referralId: referral.id,
      affiliateId: referral.affiliate_id,
      message: "Referral marked as converted",
    });
  } catch (error) {
    console.error("Error converting referral:", error);
    res.status(500).json({ error: "Failed to convert referral" });
  }
});

// Get affiliate's referrals (authenticated)
router.get("/my-referrals", authenticate, async (req, res) => {
  try {
    const affiliateId = req.user.id;

    const result = await pool.query(
      `SELECT
         ar.id,
         ar.visitor_identifier,
         ar.user_id,
         ar.converted,
         ar.converted_at,
         ar.referral_code,
         ar.metadata,
         ar.created_at,
         u.name as user_name,
         u.email as user_email,
         u.cpf as user_cpf,
         u.subscription_status,
         u.subscription_expires_at
       FROM affiliate_referrals ar
       LEFT JOIN users u ON ar.user_id = u.id
       WHERE ar.affiliate_id = $1
       ORDER BY ar.created_at DESC`,
      [affiliateId]
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*) as total_clicks,
         COUNT(user_id) as total_registrations,
         COUNT(CASE WHEN converted = true THEN 1 END) as total_conversions
       FROM affiliate_referrals
       WHERE affiliate_id = $1`,
      [affiliateId]
    );

    res.json({
      referrals: result.rows,
      stats: stats.rows[0],
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
});

// Admin: Get all referrals
router.get("/all", authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.roles || !req.user.roles.includes("admin")) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      `SELECT
         ar.id,
         ar.visitor_identifier,
         ar.user_id,
         ar.converted,
         ar.converted_at,
         ar.referral_code,
         ar.metadata,
         ar.created_at,
         aff.name as affiliate_name,
         aff.email as affiliate_email,
         u.name as user_name,
         u.email as user_email,
         u.subscription_status
       FROM affiliate_referrals ar
       JOIN users aff ON ar.affiliate_id = aff.id
       LEFT JOIN users u ON ar.user_id = u.id
       ORDER BY ar.created_at DESC
       LIMIT 1000`
    );

    res.json({ referrals: result.rows });
  } catch (error) {
    console.error("Error fetching all referrals:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
});

// Get referral info by visitor identifier (for checking existing referrals)
router.get("/check/:visitorIdentifier", async (req, res) => {
  try {
    const { visitorIdentifier } = req.params;

    const result = await pool.query(
      `SELECT
         ar.id,
         ar.affiliate_id,
         ar.referral_code,
         ar.created_at,
         u.name as affiliate_name
       FROM affiliate_referrals ar
       JOIN users u ON ar.affiliate_id = u.id
       WHERE ar.visitor_identifier = $1
       AND ar.user_id IS NULL
       ORDER BY ar.created_at DESC
       LIMIT 1`,
      [visitorIdentifier]
    );

    if (result.rows.length === 0) {
      return res.json({ hasReferral: false });
    }

    res.json({
      hasReferral: true,
      referral: result.rows[0],
    });
  } catch (error) {
    console.error("Error checking referral:", error);
    res.status(500).json({ error: "Failed to check referral" });
  }
});

export default router;
