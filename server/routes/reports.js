import express from 'express';
import { pool } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Revenue report for admin
router.get('/revenue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log('🔄 [REPORTS] Generating revenue report:', { start_date, end_date });

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get revenue by professional (excluding cancelled consultations)
    const professionalRevenueResult = await pool.query(`
      SELECT 
        u.name as professional_name,
        u.professional_percentage,
        COUNT(c.id) as consultation_count,
        SUM(c.value) as revenue,
        SUM(c.value * (u.professional_percentage / 100.0)) as professional_payment,
        SUM(c.value * ((100 - u.professional_percentage) / 100.0)) as clinic_revenue
      FROM consultations c
      JOIN users u ON c.professional_id = u.id
      WHERE c.date >= $1 AND c.date <= $2 
        AND c.status != 'cancelled'
      GROUP BY u.id, u.name, u.professional_percentage
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Get revenue by service (excluding cancelled consultations)
    const serviceRevenueResult = await pool.query(`
      SELECT 
        s.name as service_name,
        COUNT(c.id) as consultation_count,
        SUM(c.value) as revenue
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE c.date >= $1 AND c.date <= $2 
        AND c.status != 'cancelled'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, [start_date, end_date]);

    // Calculate total revenue (excluding cancelled consultations)
    const totalRevenueResult = await pool.query(`
      SELECT COALESCE(SUM(value), 0) as total_revenue
      FROM consultations
      WHERE date >= $1 AND date <= $2 
        AND status != 'cancelled'
    `, [start_date, end_date]);

    const report = {
      total_revenue: Number(totalRevenueResult.rows[0].total_revenue) || 0,
      revenue_by_professional: professionalRevenueResult.rows.map(row => ({
        professional_name: row.professional_name,
        professional_percentage: Number(row.professional_percentage) || 50,
        revenue: Number(row.revenue) || 0,
        consultation_count: Number(row.consultation_count) || 0,
        professional_payment: Number(row.professional_payment) || 0,
        clinic_revenue: Number(row.clinic_revenue) || 0
      })),
      revenue_by_service: serviceRevenueResult.rows.map(row => ({
        service_name: row.service_name,
        revenue: Number(row.revenue) || 0,
        consultation_count: Number(row.consultation_count) || 0
      }))
    };

    console.log('✅ [REPORTS] Revenue report generated successfully');
    res.json(report);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita' });
  }
});

// Professional revenue report
router.get('/professional-revenue', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const professionalId = req.user.id;

    console.log('🔄 [REPORTS] Generating professional revenue report:', { 
      professional_id: professionalId, 
      start_date, 
      end_date 
    });

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get professional percentage
    const professionalResult = await pool.query(
      'SELECT professional_percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = professionalResult.rows[0]?.professional_percentage || 50;

    // Get consultations for the period (excluding cancelled consultations)
    const consultationsResult = await pool.query(`
      SELECT 
        c.date,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE u.name
        END as client_name,
        s.name as service_name,
        c.value as total_value,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 0
          ELSE c.value * ((100 - $3) / 100.0)
        END as amount_to_pay
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
        AND c.status != 'cancelled'
      ORDER BY c.date DESC
    `, [professionalId, start_date, professionalPercentage, end_date]);

    // Calculate summary (excluding cancelled consultations)
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(c.id) as consultation_count,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN 0 ELSE c.value * ((100 - $3) / 100.0) END), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
        AND c.status != 'cancelled'
    `, [professionalId, start_date, professionalPercentage, end_date]);

    const summary = summaryResult.rows[0];

    const report = {
      summary: {
        professional_percentage: professionalPercentage,
        total_revenue: Number(summary.total_revenue) || 0,
        consultation_count: Number(summary.consultation_count) || 0,
        amount_to_pay: Number(summary.amount_to_pay) || 0
      },
      consultations: consultationsResult.rows.map(row => ({
        date: row.date,
        client_name: row.client_name,
        service_name: row.service_name,
        total_value: Number(row.total_value) || 0,
        amount_to_pay: Number(row.amount_to_pay) || 0
      }))
    };

    console.log('✅ [REPORTS] Professional revenue report generated');
    res.json(report);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating professional revenue report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de receita do profissional' });
  }
});

// Professional detailed report
router.get('/professional-detailed', authenticate, authorize(['professional']), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const professionalId = req.user.id;

    console.log('🔄 [REPORTS] Generating detailed professional report:', { 
      professional_id: professionalId, 
      start_date, 
      end_date 
    });

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Data inicial e final são obrigatórias' });
    }

    // Get professional percentage
    const professionalResult = await pool.query(
      'SELECT professional_percentage FROM users WHERE id = $1',
      [professionalId]
    );

    const professionalPercentage = professionalResult.rows[0]?.professional_percentage || 50;

    // Get detailed statistics (excluding cancelled consultations)
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NOT NULL THEN 1 END) as private_consultations,
        COUNT(CASE WHEN c.private_patient_id IS NULL THEN 1 END) as convenio_consultations,
        COALESCE(SUM(c.value), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NOT NULL THEN c.value ELSE 0 END), 0) as private_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NULL THEN c.value ELSE 0 END), 0) as convenio_revenue,
        COALESCE(SUM(CASE WHEN c.private_patient_id IS NULL THEN c.value * ((100 - $3) / 100.0) ELSE 0 END), 0) as amount_to_pay
      FROM consultations c
      WHERE c.professional_id = $1 
        AND c.date >= $2 AND c.date <= $4
        AND c.status != 'cancelled'
    `, [professionalId, start_date, professionalPercentage, end_date]);

    const stats = statsResult.rows[0];

    const report = {
      summary: {
        total_consultations: Number(stats.total_consultations) || 0,
        convenio_consultations: Number(stats.convenio_consultations) || 0,
        private_consultations: Number(stats.private_consultations) || 0,
        total_revenue: Number(stats.total_revenue) || 0,
        convenio_revenue: Number(stats.convenio_revenue) || 0,
        private_revenue: Number(stats.private_revenue) || 0,
        professional_percentage: professionalPercentage,
        amount_to_pay: Number(stats.amount_to_pay) || 0
      }
    };

    console.log('✅ [REPORTS] Detailed professional report generated');
    res.json(report);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating detailed professional report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório detalhado do profissional' });
  }
});

// Cancelled consultations report
router.get('/cancelled-consultations', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, professional_id } = req.query;

    console.log('🔄 [REPORTS] Generating cancelled consultations report:', { 
      start_date, 
      end_date, 
      professional_id 
    });

    let query = `
      SELECT 
        c.*,
        u.name as client_name,
        d.name as dependent_name,
        pp.name as private_patient_name,
        s.name as service_name,
        prof.name as professional_name,
        al.name as location_name,
        cancelled_by_user.name as cancelled_by_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN d.name
          WHEN c.private_patient_id IS NOT NULL THEN pp.name
          ELSE u.name
        END as patient_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent,
        CASE 
          WHEN c.private_patient_id IS NOT NULL THEN 'private'
          ELSE 'convenio'
        END as patient_type
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users prof ON c.professional_id = prof.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      LEFT JOIN users cancelled_by_user ON c.cancelled_by = cancelled_by_user.id
      WHERE c.status = 'cancelled'
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Add date filters if provided
    if (start_date) {
      query += ` AND c.date >= $${paramIndex}`;
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND c.date <= $${paramIndex}`;
      queryParams.push(end_date);
      paramIndex++;
    }

    // Add professional filter if provided and user is admin
    if (professional_id && req.user.currentRole === 'admin') {
      query += ` AND c.professional_id = $${paramIndex}`;
      queryParams.push(professional_id);
      paramIndex++;
    } else if (req.user.currentRole === 'professional') {
      // If user is professional, only show their own cancelled consultations
      query += ` AND c.professional_id = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    query += ' ORDER BY c.cancelled_at DESC, c.date DESC';

    const result = await pool.query(query, queryParams);

    console.log('✅ [REPORTS] Cancelled consultations report generated:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating cancelled consultations report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de consultas canceladas' });
  }
});

// Clients by city report
router.get('/clients-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    console.log('🔄 [REPORTS] Generating clients by city report');

    const result = await pool.query(`
      SELECT 
        city,
        state,
        COUNT(*) as client_count,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_clients,
        COUNT(CASE WHEN subscription_status = 'pending' THEN 1 END) as pending_clients,
        COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END) as expired_clients
      FROM users 
      WHERE roles::jsonb ? 'client' 
        AND city IS NOT NULL 
        AND city != ''
      GROUP BY city, state
      ORDER BY client_count DESC, city
    `);

    console.log('✅ [REPORTS] Clients by city report generated:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating clients by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de clientes por cidade' });
  }
});

// Professionals by city report
router.get('/professionals-by-city', authenticate, authorize(['admin']), async (req, res) => {
  try {
    console.log('🔄 [REPORTS] Generating professionals by city report');

    const result = await pool.query(`
      SELECT 
        city,
        state,
        COUNT(*) as total_professionals,
        json_agg(
          json_build_object(
            'category_name', COALESCE(category_name, 'Sem categoria'),
            'count', 1
          )
        ) as categories
      FROM users 
      WHERE roles::jsonb ? 'professional' 
        AND city IS NOT NULL 
        AND city != ''
      GROUP BY city, state
      ORDER BY total_professionals DESC, city
    `);

    // Process the categories to group by category_name
    const processedResult = result.rows.map(row => {
      const categoryMap = new Map();
      
      row.categories.forEach(cat => {
        const categoryName = cat.category_name;
        if (categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, categoryMap.get(categoryName) + cat.count);
        } else {
          categoryMap.set(categoryName, cat.count);
        }
      });

      return {
        city: row.city,
        state: row.state,
        total_professionals: Number(row.total_professionals),
        categories: Array.from(categoryMap.entries()).map(([category_name, count]) => ({
          category_name,
          count
        }))
      };
    });

    console.log('✅ [REPORTS] Professionals by city report generated:', processedResult.length);
    res.json(processedResult);
  } catch (error) {
    console.error('❌ [REPORTS] Error generating professionals by city report:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório de profissionais por cidade' });
  }
});

export default router;