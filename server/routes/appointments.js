import express from 'express';
import { pool } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Update appointment endpoint
router.put('/:id', authenticate, authorize(['professional', 'admin']), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { date, time, professional_id, patient_id, notes } = req.body;

    console.log('🔄 Updating appointment:', appointmentId, req.body);

    // Validate required fields
    if (!date || !time) {
      return res.status(400).json({ message: 'Data e hora são obrigatórios' });
    }

    // Combine date and time
    const appointmentDateTime = new Date(`${date}T${time}`);
    
    if (isNaN(appointmentDateTime.getTime())) {
      return res.status(400).json({ message: 'Data ou hora inválida' });
    }

    // Check if appointment exists and belongs to the professional (unless admin)
    const checkQuery = req.user.currentRole === 'admin' 
      ? 'SELECT * FROM consultations WHERE id = $1'
      : 'SELECT * FROM consultations WHERE id = $1 AND professional_id = $2';
    
    const checkParams = req.user.currentRole === 'admin' 
      ? [appointmentId]
      : [appointmentId, req.user.id];

    const existingResult = await pool.query(checkQuery, checkParams);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado ou sem permissão para editar' });
    }

    const existingAppointment = existingResult.rows[0];

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    // Always update date
    updateFields.push(`date = $${paramCount}`);
    updateValues.push(appointmentDateTime.toISOString());
    paramCount++;

    // Update professional_id if provided and user is admin
    if (professional_id && req.user.currentRole === 'admin') {
      updateFields.push(`professional_id = $${paramCount}`);
      updateValues.push(professional_id);
      paramCount++;
    }

    // Update patient_id if provided (this could be client_id, dependent_id, or private_patient_id)
    if (patient_id) {
      // Determine which patient field to update based on existing data
      if (existingAppointment.client_id) {
        updateFields.push(`client_id = $${paramCount}`);
        updateValues.push(patient_id);
        paramCount++;
      } else if (existingAppointment.dependent_id) {
        updateFields.push(`dependent_id = $${paramCount}`);
        updateValues.push(patient_id);
        paramCount++;
      } else if (existingAppointment.private_patient_id) {
        updateFields.push(`private_patient_id = $${paramCount}`);
        updateValues.push(patient_id);
        paramCount++;
      }
    }

    // Update notes
    if (notes !== undefined) {
      updateFields.push(`notes = $${paramCount}`);
      updateValues.push(notes || null);
      paramCount++;
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date().toISOString());
    paramCount++;

    // Add appointment ID for WHERE clause
    updateValues.push(appointmentId);

    const updateQuery = `
      UPDATE consultations 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    console.log('🔄 Update query:', updateQuery);
    console.log('🔄 Update values:', updateValues);

    const result = await pool.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    const updatedAppointment = result.rows[0];
    console.log('✅ Appointment updated successfully:', updatedAppointment.id);

    res.json({
      message: 'Agendamento atualizado com sucesso',
      appointment: updatedAppointment
    });

  } catch (error) {
    console.error('❌ Error updating appointment:', error);
    res.status(500).json({ 
      message: 'Erro interno do servidor ao atualizar agendamento',
      error: error.message 
    });
  }
});

export default router;