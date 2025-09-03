import express from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all consultations for admin
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('🔄 [CONSULTATIONS] Fetching all consultations for admin');

    const result = await pool.query(`
      SELECT 
        c.*,
        u.name as client_name,
        d.name as dependent_name,
        pp.name as private_patient_name,
        s.name as service_name,
        prof.name as professional_name,
        al.name as location_name,
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
      WHERE c.status != 'cancelled'
      ORDER BY c.date DESC
    `);

    console.log('✅ [CONSULTATIONS] All consultations loaded:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error fetching consultations:', error);
    res.status(500).json({ message: 'Erro ao carregar consultas' });
  }
});

// Get consultations for specific client
router.get('/client/:clientId', authenticate, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    console.log('🔄 [CONSULTATIONS] Fetching consultations for client:', clientId);

    const result = await pool.query(`
      SELECT 
        c.*,
        u.name as client_name,
        d.name as dependent_name,
        s.name as service_name,
        prof.name as professional_name,
        al.name as location_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN d.name
          ELSE u.name
        END as patient_name,
        CASE 
          WHEN c.dependent_id IS NOT NULL THEN true
          ELSE false
        END as is_dependent
      FROM consultations c
      LEFT JOIN users u ON c.client_id = u.id
      LEFT JOIN dependents d ON c.dependent_id = d.id
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN users prof ON c.professional_id = prof.id
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE (c.client_id = $1 OR d.client_id = $1) 
        AND c.status != 'cancelled'
      ORDER BY c.date DESC
    `, [clientId]);

    console.log('✅ [CONSULTATIONS] Client consultations loaded:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error fetching client consultations:', error);
    res.status(500).json({ message: 'Erro ao carregar consultas do cliente' });
  }
});

// Get consultations for specific professional
router.get('/professional/:professionalId', authenticate, async (req, res) => {
  try {
    const professionalId = req.params.professionalId;
    console.log('🔄 [CONSULTATIONS] Fetching consultations for professional:', professionalId);

    const result = await pool.query(`
      SELECT 
        c.*,
        u.name as client_name,
        d.name as dependent_name,
        pp.name as private_patient_name,
        s.name as service_name,
        al.name as location_name,
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
      LEFT JOIN attendance_locations al ON c.location_id = al.id
      WHERE c.professional_id = $1 AND c.status != 'cancelled'
      ORDER BY c.date DESC
    `, [professionalId]);

    console.log('✅ [CONSULTATIONS] Professional consultations loaded:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error fetching professional consultations:', error);
    res.status(500).json({ message: 'Erro ao carregar consultas do profissional' });
  }
});

// Create new consultation
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      value,
      date,
      appointment_date,
      appointment_time,
      create_appointment,
      notes
    } = req.body;

    console.log('🔄 [CONSULTATIONS] Creating consultation:', {
      client_id,
      dependent_id,
      private_patient_id,
      service_id,
      professional_id: req.user.id,
      value,
      date
    });

    // Validate required fields
    if (!service_id || !value || !date) {
      return res.status(400).json({ 
        message: 'Serviço, valor e data são obrigatórios' 
      });
    }

    // Validate patient selection
    if (!client_id && !dependent_id && !private_patient_id) {
      return res.status(400).json({ 
        message: 'É necessário selecionar um cliente, dependente ou paciente particular' 
      });
    }

    // Insert consultation
    const result = await pool.query(`
      INSERT INTO consultations (
        client_id, dependent_id, private_patient_id, professional_id, 
        service_id, location_id, value, date, notes, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', NOW())
      RETURNING *
    `, [
      client_id || null,
      dependent_id || null,
      private_patient_id || null,
      req.user.id,
      service_id,
      location_id || null,
      value,
      date,
      notes || null
    ]);

    console.log('✅ [CONSULTATIONS] Consultation created:', result.rows[0].id);

    let appointmentResult = null;

    // Create appointment if requested
    if (create_appointment && appointment_date && appointment_time) {
      try {
        console.log('🔄 [CONSULTATIONS] Creating associated appointment');

        const appointmentResponse = await fetch(`${req.protocol}://${req.get('host')}/api/appointments`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.authorization,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id,
            dependent_id,
            private_patient_id,
            service_id,
            location_id,
            value,
            date: appointment_date,
            time: appointment_time,
            consultation_id: result.rows[0].id
          })
        });

        if (appointmentResponse.ok) {
          appointmentResult = await appointmentResponse.json();
          console.log('✅ [CONSULTATIONS] Associated appointment created');
        } else {
          console.warn('⚠️ [CONSULTATIONS] Could not create associated appointment');
        }
      } catch (appointmentError) {
        console.warn('⚠️ [CONSULTATIONS] Appointment creation failed:', appointmentError);
      }
    }

    res.json({
      message: 'Consulta registrada com sucesso',
      consultation: result.rows[0],
      appointment: appointmentResult
    });
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error creating consultation:', error);
    res.status(500).json({ message: 'Erro ao registrar consulta' });
  }
});

// Create recurring consultations
router.post('/recurring', authenticate, async (req, res) => {
  try {
    const {
      user_id,
      dependent_id,
      private_patient_id,
      service_id,
      location_id,
      value,
      start_date,
      start_time,
      recurrence_type,
      recurrence_interval,
      end_date,
      occurrences,
      notes,
      timezone_offset
    } = req.body;

    console.log('🔄 [CONSULTATIONS] Creating recurring consultations');

    // Validate required fields
    if (!service_id || !value || !start_date || !start_time) {
      return res.status(400).json({ 
        message: 'Serviço, valor, data e horário são obrigatórios' 
      });
    }

    // Generate consultation dates
    const consultationDates = [];
    let currentDate = new Date(`${start_date}T${start_time}`);
    const endDateTime = end_date ? new Date(end_date) : null;
    
    for (let i = 0; i < occurrences; i++) {
      if (endDateTime && currentDate > endDateTime) break;
      
      consultationDates.push(new Date(currentDate));
      
      // Calculate next date based on recurrence
      switch (recurrence_type) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + recurrence_interval);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + (7 * recurrence_interval));
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + recurrence_interval);
          break;
      }
    }

    // Create consultations
    const createdConsultations = [];
    
    for (const consultationDate of consultationDates) {
      // Adjust for timezone if provided
      const adjustedDate = timezone_offset 
        ? new Date(consultationDate.getTime() - (timezone_offset * 60 * 60 * 1000))
        : consultationDate;

      const result = await pool.query(`
        INSERT INTO consultations (
          client_id, dependent_id, private_patient_id, professional_id, 
          service_id, location_id, value, date, notes, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', NOW())
        RETURNING *
      `, [
        user_id || null,
        dependent_id || null,
        private_patient_id || null,
        req.user.id,
        service_id,
        location_id || null,
        value,
        adjustedDate.toISOString(),
        notes || null
      ]);

      createdConsultations.push(result.rows[0]);
    }

    console.log('✅ [CONSULTATIONS] Recurring consultations created:', createdConsultations.length);

    res.json({
      message: 'Consultas recorrentes criadas com sucesso',
      created_count: createdConsultations.length,
      consultations: createdConsultations
    });
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error creating recurring consultations:', error);
    res.status(500).json({ message: 'Erro ao criar consultas recorrentes' });
  }
});

// Update consultation
router.put('/:id', authenticate, async (req, res) => {
  try {
    const consultationId = req.params.id;
    const { date, value, location_id, notes, status } = req.body;

    console.log('🔄 [CONSULTATIONS] Updating consultation:', consultationId);

    // Validate required fields
    if (!date || !value) {
      return res.status(400).json({ 
        message: 'Data e valor são obrigatórios' 
      });
    }

    const result = await pool.query(`
      UPDATE consultations 
      SET date = $1, value = $2, location_id = $3, notes = $4, status = $5, updated_at = NOW()
      WHERE id = $6 AND professional_id = $7
      RETURNING *
    `, [date, value, location_id || null, notes || null, status || 'completed', consultationId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    console.log('✅ [CONSULTATIONS] Consultation updated successfully');
    res.json({
      message: 'Consulta atualizada com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error updating consultation:', error);
    res.status(500).json({ message: 'Erro ao atualizar consulta' });
  }
});

// Cancel consultation
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const consultationId = req.params.id;
    const { cancellation_reason } = req.body;

    console.log('🔄 [CONSULTATIONS] Cancelling consultation:', consultationId);

    // Update consultation status to cancelled
    const result = await pool.query(`
      UPDATE consultations 
      SET 
        status = 'cancelled',
        cancellation_reason = $1,
        cancelled_at = NOW(),
        cancelled_by = $2,
        updated_at = NOW()
      WHERE id = $3 AND professional_id = $4
      RETURNING *
    `, [
      cancellation_reason || null,
      req.user.id,
      consultationId,
      req.user.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    console.log('✅ [CONSULTATIONS] Consultation cancelled successfully');

    // Try to cancel related appointment if exists
    try {
      await pool.query(`
        UPDATE appointments 
        SET status = 'cancelled', updated_at = NOW()
        WHERE consultation_id = $1
      `, [consultationId]);
      
      console.log('✅ [CONSULTATIONS] Related appointment also cancelled');
    } catch (appointmentError) {
      console.warn('⚠️ [CONSULTATIONS] Could not cancel related appointment:', appointmentError);
    }

    res.json({
      message: 'Consulta cancelada com sucesso',
      consultation: result.rows[0]
    });
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error cancelling consultation:', error);
    res.status(500).json({ message: 'Erro ao cancelar consulta' });
  }
});

// Delete consultation (admin only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const consultationId = req.params.id;

    console.log('🔄 [CONSULTATIONS] Deleting consultation:', consultationId);

    // Check if user is admin
    if (!req.user.currentRole || req.user.currentRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administradores podem excluir consultas' });
    }

    const result = await pool.query(
      'DELETE FROM consultations WHERE id = $1 RETURNING *',
      [consultationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Consulta não encontrada' });
    }

    console.log('✅ [CONSULTATIONS] Consultation deleted successfully');
    res.json({ message: 'Consulta excluída com sucesso' });
  } catch (error) {
    console.error('❌ [CONSULTATIONS] Error deleting consultation:', error);
    res.status(500).json({ message: 'Erro ao excluir consulta' });
  }
});

export default router;