/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 * 
 * Servicio para cálculos de tiempo de trabajo efectivo
 * Diferencia entre tiempo total y tiempo de trabajo real del equipo
 */

/**
 * Configuración de horario laboral real
 * Lunes a Jueves: 7:00 AM - 12:00 PM y 1:30 PM - 6:00 PM
 * Viernes: 7:00 AM - 12:00 PM y 1:30 PM - 4:30 PM
 */
const WORK_SCHEDULE = {
  // Horarios por día de la semana
  // 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes
  dailySchedules: {
    1: { // Lunes
      periods: [
        { start: 7, end: 12 },     // 7:00 AM - 12:00 PM
        { start: 13.5, end: 17.5 } // 1:30 PM - 5:30 PM
      ]
    },
    2: { // Martes
      periods: [
        { start: 7, end: 12 },     // 7:00 AM - 12:00 PM
        { start: 13.5, end: 17.5 } // 1:30 PM - 5:30 PM
      ]
    },
    3: { // Miércoles
      periods: [
        { start: 7, end: 12 },     // 7:00 AM - 12:00 PM
        { start: 13.5, end: 17.5 } // 1:30 PM - 5:30 PM
      ]
    },
    4: { // Jueves
      periods: [
        { start: 7, end: 12 },     // 7:00 AM - 12:00 PM
        { start: 13.5, end: 17.5 } // 1:30 PM - 5:30 PM
      ]
    },
    5: { // Viernes
      periods: [
        { start: 7, end: 12 },     // 7:00 AM - 12:00 PM
        { start: 13.5, end: 16.5 } // 1:30 PM - 4:30 PM
      ]
    }
  },
  
  // Días laborales (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
  workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
  
  // SLA en horas de trabajo efectivo
  slaHours: 10,
  
  // Días festivos (formato YYYY-MM-DD)
  holidays: [
    '2025-01-01', // Año Nuevo
    '2025-01-06', // Reyes Magos
    '2025-03-24', // Día de San José
    '2025-04-17', // Jueves Santo
    '2025-04-18', // Viernes Santo
    '2025-05-01', // Día del Trabajador
    '2025-06-02', // Ascensión del Señor
    '2025-06-23', // Corpus Christi
    '2025-06-30', // Sagrado Corazón de Jesús
    '2025-07-20', // Día de la Independencia
    '2025-08-07', // Batalla de Boyacá
    '2025-08-18', // Asunción de la Virgen
    '2025-10-13', // Día de la Raza
    '2025-11-03', // Todos los Santos
    '2025-11-17', // Independencia de Cartagena
    '2025-12-08', // Inmaculada Concepción
    '2025-12-25', // Navidad
    // Agregar más festivos según necesidad
  ]
};

/**
 * Estados que NO cuentan como tiempo de trabajo del equipo
 */
const NON_WORK_STATES = [
  'Esperando respuesta del usuario',
  'Escalado a externo',
  'Escalado a Tier 3 / Gerente de Cuenta',
  'Cerrado',
  'Resuelto'
];

/**
 * Estados activos de trabajo
 */
const ACTIVE_WORK_STATES = [
  'Creado',
  'En gestión'
];

/**
 * Obtener configuración de horarios desde la BD
 */
async function getWorkScheduleConfig(pool) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT config_key, config_value
      FROM dashboard_config
      WHERE category = 'schedule'
    `);
    
    const config = {};
    result.rows.forEach(row => {
      config[row.config_key] = row.config_value;
    });
    
    // Convertir horarios a formato decimal
    const timeToDecimal = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours + (minutes / 60);
    };
    
    const workStart = config.work_hours_start ? timeToDecimal(config.work_hours_start) : 7;
    const workEnd = config.work_hours_end ? timeToDecimal(config.work_hours_end) : 17.5;
    const workEndFriday = config.work_hours_friday_end ? timeToDecimal(config.work_hours_friday_end) : 16.5;
    const lunchStart = config.lunch_break_start ? timeToDecimal(config.lunch_break_start) : 12;
    const lunchEnd = config.lunch_break_end ? timeToDecimal(config.lunch_break_end) : 13.5;
    
    return {
      dailySchedules: {
        1: { // Lunes
          periods: [
            { start: workStart, end: lunchStart },
            { start: lunchEnd, end: workEnd }
          ]
        },
        2: { // Martes
          periods: [
            { start: workStart, end: lunchStart },
            { start: lunchEnd, end: workEnd }
          ]
        },
        3: { // Miércoles
          periods: [
            { start: workStart, end: lunchStart },
            { start: lunchEnd, end: workEnd }
          ]
        },
        4: { // Jueves
          periods: [
            { start: workStart, end: lunchStart },
            { start: lunchEnd, end: workEnd }
          ]
        },
        5: { // Viernes
          periods: [
            { start: workStart, end: lunchStart },
            { start: lunchEnd, end: workEndFriday }
          ]
        }
      },
      workDays: [1, 2, 3, 4, 5],
      slaHours: 10,
      holidays: WORK_SCHEDULE.holidays // Mantener los festivos estáticos
    };
  } finally {
    client.release();
  }
}

/**
 * Verifica si una fecha es día laboral (con configuración dinámica)
 */
function isWorkDay(date) {
  const dayOfWeek = date.getDay();
  const dateString = date.toISOString().split('T')[0];
  
  return WORK_SCHEDULE.workDays.includes(dayOfWeek) && 
         !WORK_SCHEDULE.holidays.includes(dateString);
}

/**
 * Verifica si una hora específica está dentro del horario laboral
 */
function isWorkHour(date) {
  const dayOfWeek = date.getDay();
  const hour = date.getHours() + (date.getMinutes() / 60); // Convertir a decimal
  
  if (!WORK_SCHEDULE.dailySchedules[dayOfWeek]) {
    return false;
  }
  
  const schedule = WORK_SCHEDULE.dailySchedules[dayOfWeek];
  
  // Verificar si la hora está en alguno de los períodos laborales del día
  return schedule.periods.some(period => 
    hour >= period.start && hour < period.end
  );
}

/**
 * Obtiene los períodos de trabajo para un día específico
 */
function getWorkPeriodsForDay(dayOfWeek) {
  return WORK_SCHEDULE.dailySchedules[dayOfWeek]?.periods || [];
}

/**
 * Calcula el próximo momento de trabajo válido
 */
function getNextWorkMoment(date) {
  const nextDate = new Date(date);
  const dayOfWeek = nextDate.getDay();
  const currentHour = nextDate.getHours() + (nextDate.getMinutes() / 60);
  
  // Si es día laboral, verificar si podemos encontrar el próximo período de trabajo hoy
  if (isWorkDay(nextDate)) {
    const periods = getWorkPeriodsForDay(dayOfWeek);
    
    for (const period of periods) {
      if (currentHour < period.start) {
        // Ir al inicio de este período
        const startHour = Math.floor(period.start);
        const startMinutes = (period.start % 1) * 60;
        nextDate.setHours(startHour, startMinutes, 0, 0);
        return nextDate;
      } else if (currentHour < period.end) {
        // Ya estamos en un período laboral, no cambiar la hora
        return nextDate;
      }
    }
  }
  
  // Si no hay más períodos hoy o no es día laboral, buscar el próximo día laboral
  do {
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(0, 0, 0, 0);
  } while (!isWorkDay(nextDate));
  
  // Ir al primer período del próximo día laboral
  const firstPeriod = getWorkPeriodsForDay(nextDate.getDay())[0];
  if (firstPeriod) {
    const startHour = Math.floor(firstPeriod.start);
    const startMinutes = (firstPeriod.start % 1) * 60;
    nextDate.setHours(startHour, startMinutes, 0, 0);
  }
  
  return nextDate;
}

/**
 * Calcula tiempo de trabajo efectivo entre dos fechas
 */
function calculateWorkingTime(startDate, endDate) {
  if (!startDate || !endDate || endDate <= startDate) {
    return 0;
  }
  
  let totalWorkingMinutes = 0;
  let currentDate = new Date(startDate);
  const finalDate = new Date(endDate);
  
  while (currentDate < finalDate) {
    const dayOfWeek = currentDate.getDay();
    
    if (isWorkDay(currentDate)) {
      const periods = getWorkPeriodsForDay(dayOfWeek);
      
      for (const period of periods) {
        // Calcular inicio y fin del período en este día
        const periodStart = new Date(currentDate);
        periodStart.setHours(Math.floor(period.start), (period.start % 1) * 60, 0, 0);
        
        const periodEnd = new Date(currentDate);
        periodEnd.setHours(Math.floor(period.end), (period.end % 1) * 60, 0, 0);
        
        // Ajustar los límites según las fechas de entrada
        const effectiveStart = new Date(Math.max(currentDate.getTime(), periodStart.getTime()));
        const effectiveEnd = new Date(Math.min(finalDate.getTime(), periodEnd.getTime()));
        
        // Si hay tiempo válido en este período
        if (effectiveStart < effectiveEnd) {
          const minutesInPeriod = Math.floor((effectiveEnd - effectiveStart) / (1000 * 60));
          totalWorkingMinutes += minutesInPeriod;
        }
      }
    }
    
    // Avanzar al siguiente día
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
  }
  
  return totalWorkingMinutes;
}

/**
 * Calcula todas las métricas de tiempo para un ticket
 */
async function calculateTicketTimings(pool, ticketId) {
  const client = await pool.connect();
  try {
    // Obtener datos del ticket
    const ticketQuery = `
      SELECT 
        id, title, status, created_at, closed_at,
        user_id, assigned_to
      FROM tickets 
      WHERE id = $1
    `;
    const ticketResult = await client.query(ticketQuery, [ticketId]);
    
    if (ticketResult.rows.length === 0) {
      throw new Error('Ticket no encontrado');
    }
    
    const ticket = ticketResult.rows[0];
    
    // Obtener historial de comentarios para rastrear cambios de estado
    const commentsQuery = `
      SELECT 
        c.created_at, c.comment, c.user_id,
        u.role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.ticket_id = $1
      ORDER BY c.created_at ASC
    `;
    const commentsResult = await client.query(commentsQuery, [ticketId]);
    
    const now = new Date();
    const createdAt = new Date(ticket.created_at);
    const closedAt = ticket.closed_at ? new Date(ticket.closed_at) : now;
    
    // Tiempo total (calendario)
    const totalTime = Math.floor((closedAt - createdAt) / (1000 * 60)); // en minutos
    
    // Calcular tiempo de trabajo efectivo
    let activeWorkTime = 0;
    let customerWaitTime = 0;
    let externalVendorTime = 0;
    let responseTime = 0;
    let firstResponseGiven = false;
    
    // Analizar períodos de tiempo basados en comentarios y cambios de estado
    let currentPeriodStart = createdAt;
    let currentState = 'Creado';
    
    // Procesar cada comentario para detectar cambios de estado
    for (const comment of commentsResult.rows) {
      const commentDate = new Date(comment.created_at);
      const periodDuration = Math.floor((commentDate - currentPeriodStart) / (1000 * 60));
      
      // Determinar si el período anterior fue tiempo de trabajo
      if (ACTIVE_WORK_STATES.includes(currentState)) {
        activeWorkTime += calculateWorkingTime(currentPeriodStart, commentDate);
      } else if (currentState === 'Esperando respuesta del usuario') {
        customerWaitTime += periodDuration;
      } else if (currentState === 'Escalado a externo') {
        externalVendorTime += periodDuration;
      }
      
      // Detectar primera respuesta del técnico
      if (!firstResponseGiven && comment.role === 'tech') {
        responseTime = calculateWorkingTime(createdAt, commentDate);
        firstResponseGiven = true;
      }
      
      // Actualizar estado actual (simplificado - en producción sería más complejo)
      if (comment.role === 'tech') {
        currentState = 'En gestión';
      } else if (comment.role === 'user') {
        currentState = 'Esperando respuesta del usuario';
      }
      
      currentPeriodStart = commentDate;
    }
    
    // Procesar período final
    const finalPeriodDuration = Math.floor((closedAt - currentPeriodStart) / (1000 * 60));
    if (ACTIVE_WORK_STATES.includes(currentState)) {
      activeWorkTime += calculateWorkingTime(currentPeriodStart, closedAt);
    } else if (currentState === 'Esperando respuesta del usuario') {
      customerWaitTime += finalPeriodDuration;
    } else if (currentState === 'Escalado a externo') {
      externalVendorTime += finalPeriodDuration;
    }
    
    // Calcular tiempo de resolución (solo si está cerrado)
    const resolutionTime = ticket.closed_at ? activeWorkTime : null;
      // Determinar cumplimiento de SLA (10 horas de trabajo efectivo)
    const slaLimitMinutes = WORK_SCHEDULE.slaHours * 60; // 10 horas = 600 minutos
    const slaCompliance = resolutionTime ? resolutionTime <= slaLimitMinutes : null;
    
    return {
      ticketId,
      totalTime,
      activeWorkTime,
      responseTime,
      resolutionTime,
      customerWaitTime,
      externalVendorTime,
      slaCompliance,
      // Métricas adicionales
      totalTimeFormatted: formatMinutes(totalTime),
      activeWorkTimeFormatted: formatMinutes(activeWorkTime),
      responseTimeFormatted: formatMinutes(responseTime),
      resolutionTimeFormatted: resolutionTime ? formatMinutes(resolutionTime) : null,
      workingHoursOnly: true
    };
    
  } finally {
    client.release();
  }
}

/**
 * Formatea minutos en formato legible
 */
function formatMinutes(minutes) {
  if (!minutes || minutes === 0) return '0m';
  
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  
  let result = '';
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (mins > 0) result += `${mins}m`;
  
  return result.trim() || '0m';
}

/**
 * Calcula estadísticas agregadas para el dashboard
 */
async function calculateDashboardMetrics(pool, dateRange = null) {
  const client = await pool.connect();
  try {
    let dateFilter = '';
    let params = [];
    
    if (dateRange) {
      // Asegurar formato correcto de fechas
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [startDate, endDate];
    }
    
    // Obtener tickets para análisis
    const ticketsQuery = `
      SELECT 
        id, status, created_at, closed_at, assigned_to,
        category, area
      FROM tickets 
      ${dateFilter}
      ORDER BY created_at DESC
    `;
    
    const ticketsResult = await client.query(ticketsQuery, params);
    const tickets = ticketsResult.rows;
    
    // Calcular métricas para cada ticket
    const metricsPromises = tickets.map(ticket => 
      calculateTicketTimings(pool, ticket.id).catch(err => {
        console.error(`Error calculating metrics for ticket ${ticket.id}:`, err);
        return null;
      })
    );
    
    const allMetrics = (await Promise.all(metricsPromises)).filter(Boolean);
    
    // Estadísticas agregadas
    const closedTickets = allMetrics.filter(m => m.resolutionTime !== null);
    const avgResolutionTime = closedTickets.length > 0 
      ? Math.round(closedTickets.reduce((sum, m) => sum + m.resolutionTime, 0) / closedTickets.length)
      : 0;
    
    const avgResponseTime = allMetrics.length > 0
      ? Math.round(allMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) / allMetrics.length)
      : 0;
    
    const slaCompliant = closedTickets.filter(m => m.slaCompliance).length;
    const slaComplianceRate = closedTickets.length > 0 
      ? Math.round((slaCompliant / closedTickets.length) * 100)
      : 0;
    
    return {
      totalTickets: tickets.length,
      closedTickets: closedTickets.length,
      openTickets: tickets.length - closedTickets.length,
      avgResolutionTime: formatMinutes(avgResolutionTime),
      avgResponseTime: formatMinutes(avgResponseTime),
      slaComplianceRate,
      rawMetrics: allMetrics
    };
    
  } finally {
    client.release();
  }
}

/**
 * Calcular métricas mejoradas con configuración dinámica
 */
async function calculateEnhancedMetrics(pool, dateRange = null, config = null, userFilter = null) {
  const client = await pool.connect();
  
  try {
    // Si no se proporciona config, obtenerla de la BD
    if (!config) {
      const configResult = await client.query(`
        SELECT config_key, config_value, config_type
        FROM dashboard_config
        WHERE category IN ('targets', 'sla', 'workflow')
      `);
      
      config = {};
      configResult.rows.forEach(row => {
        let value = row.config_value;
        if (row.config_type === 'number') {
          value = parseInt(value);
        } else if (row.config_type === 'array') {
          value = value.split(',');
        }
        config[row.config_key] = value;
      });
    }
    
    // Obtener tickets según rango de fechas y filtro de usuario
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;
    
    // Filtro de fecha
    if (dateRange) {
      // Asegurar que las fechas estén en formato correcto
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      
      whereConditions.push(`t.created_at >= $${paramIndex} AND t.created_at <= $${paramIndex + 1}`);
      params.push(startDate, endDate);
      paramIndex += 2;
    }
    
    // Filtro por técnico (solo para role 'tech')
    if (userFilter && userFilter.role === 'tech') {
      whereConditions.push(`t.assigned_to = $${paramIndex}`);
      params.push(userFilter.userId);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const ticketsQuery = `
      SELECT 
        t.*,
        u.firstname AS user_firstname,
        u.lastname AS user_lastname,
        assigned_u.firstname AS assigned_firstname,
        assigned_u.lastname AS assigned_lastname
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users assigned_u ON t.assigned_to = assigned_u.id
      ${whereClause}
      ORDER BY t.created_at DESC
    `;
    
    const ticketsResult = await client.query(ticketsQuery, params);
    const tickets = ticketsResult.rows;
    
    // Calcular métricas mejoradas
    const metrics = {
      totalTickets: tickets.length,
      openTickets: 0,
      inProgressTickets: 0,
      pausedTickets: 0,
      closedTickets: 0,
      avgRealWorkTime: 0,
      avgResponseTime: 0,
      responseTimeCompliance: 0,
      workTimeCompliance: 0,
      slaBreaches: 0,
      ticketsOverdue: 0,
      detailed: []
    };
    
    const activeStates = config.active_work_states || ['En gestión'];
    const pausedStates = config.paused_states || ['Escalado a externo', 'Esperando respuesta del usuario'];
    const targetResponseTime = config.target_response_time || 240; // 4 horas por defecto
    const targetResolutionTime = config.target_resolution_time || 1440; // 24 horas por defecto
    
    let totalRealWorkTime = 0;
    let totalResponseTime = 0;
    let validResponseTimes = 0;
    let validWorkTimes = 0;
    let responseTimeCompliant = 0;
    let workTimeCompliant = 0;
    
    for (const ticket of tickets) {
      const createdAt = new Date(ticket.created_at);
      const now = new Date();
      const closedAt = ticket.closed_at ? new Date(ticket.closed_at) : null;
      
      // Calcular tiempo real de trabajo (solo estados activos)
      let realWorkTime = 0;
      let responseTime = null;
      let firstTechResponse = null;
      
      // Obtener historial de comentarios y cambios
      const historyQuery = `
        SELECT 
          c.created_at,
          c.comment,
          u.role,
          u.firstname,
          u.lastname
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.ticket_id = $1
        ORDER BY c.created_at ASC
      `;
      
      const historyResult = await client.query(historyQuery, [ticket.id]);
      const history = historyResult.rows;
      
      // Detectar primera respuesta técnica
      for (const entry of history) {
        if (entry.role === 'tech' && !firstTechResponse) {
          firstTechResponse = new Date(entry.created_at);
          responseTime = Math.floor((firstTechResponse - createdAt) / (1000 * 60));
          break;
        }
      }
      
      // Si hay asignación pero no comentarios de tech, usar fecha de asignación
      if (!firstTechResponse && ticket.assigned_to && ticket.assigned_at) {
        firstTechResponse = new Date(ticket.assigned_at);
        responseTime = Math.floor((firstTechResponse - createdAt) / (1000 * 60));
      }
      
      // Simular cálculo de tiempo real (solo estados activos)
      // En una implementación completa, esto requeriría un log de cambios de estado
      if (activeStates.includes(ticket.status)) {
        const workEnd = closedAt || now;
        realWorkTime = calculateWorkingTime(createdAt, workEnd);
        metrics.inProgressTickets++;
      } else if (pausedStates.includes(ticket.status)) {
        metrics.pausedTickets++;
      } else if (ticket.status === 'Cerrado' || ticket.status === 'Resuelto') {
        const workEnd = closedAt || now;
        realWorkTime = calculateWorkingTime(createdAt, workEnd);
        metrics.closedTickets++;
      } else {
        metrics.openTickets++;
      }
      
      // Calcular compliance
      if (responseTime !== null) {
        totalResponseTime += responseTime;
        validResponseTimes++;
        
        if (responseTime <= targetResponseTime) {
          responseTimeCompliant++;
        }
      }
      
      if (realWorkTime > 0) {
        totalRealWorkTime += realWorkTime;
        validWorkTimes++;
        
        if (closedAt && realWorkTime <= targetResolutionTime) {
          workTimeCompliant++;
        }
      }
      
      // Detectar tickets vencidos
      if (!closedAt) {
        const timeSinceCreation = Math.floor((now - createdAt) / (1000 * 60));
        if (timeSinceCreation > targetResponseTime && !responseTime) {
          metrics.ticketsOverdue++;
        }
      }
      
      metrics.detailed.push({
        id: ticket.id,
        subject: ticket.title, // Usar title como subject
        status: ticket.status,
        priority: ticket.priority,
        realWorkTime,
        responseTime,
        createdAt: ticket.created_at,
        closedAt: ticket.closed_at,
        isOverdue: !closedAt && Math.floor((now - createdAt) / (1000 * 60)) > targetResponseTime
      });
    }
    
    // Calcular promedios
    metrics.avgRealWorkTime = validWorkTimes > 0 ? Math.round(totalRealWorkTime / validWorkTimes) : 0;
    metrics.avgResponseTime = validResponseTimes > 0 ? Math.round(totalResponseTime / validResponseTimes) : 0;
    
    // Calcular porcentajes de compliance
    metrics.responseTimeCompliance = validResponseTimes > 0 ? Math.round((responseTimeCompliant / validResponseTimes) * 100) : 0;
    metrics.workTimeCompliance = validWorkTimes > 0 ? Math.round((workTimeCompliant / validWorkTimes) * 100) : 0;
    
    // Agregar metas para comparación
    metrics.targets = {
      responseTime: targetResponseTime,
      resolutionTime: targetResolutionTime,
      responseTimeFormatted: formatMinutes(targetResponseTime),
      resolutionTimeFormatted: formatMinutes(targetResolutionTime)
    };
    
    // Formatear tiempos
    metrics.avgRealWorkTimeFormatted = formatMinutes(metrics.avgRealWorkTime);
    metrics.avgResponseTimeFormatted = formatMinutes(metrics.avgResponseTime);
    
    return metrics;
    
  } finally {
    client.release();
  }
}

/**
 * Calcular tiempo de trabajo con configuración dinámica
 */
async function calculateWorkingTimeWithConfig(pool, startDate, endDate) {
  const workSchedule = await getWorkScheduleConfig(pool);
  return calculateWorkingTimeFromSchedule(startDate, endDate, workSchedule);
}

/**
 * Calcular tiempo de trabajo usando un horario específico
 */
function calculateWorkingTimeFromSchedule(startDate, endDate, schedule) {
  if (startDate >= endDate) return 0;
  
  let totalMinutes = 0;
  const current = new Date(startDate);
  
  while (current < endDate) {
    const dayOfWeek = current.getDay();
    const dateString = current.toISOString().split('T')[0];
    
    // Verificar si es día laboral
    if (!schedule.workDays.includes(dayOfWeek) || schedule.holidays.includes(dateString)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    const daySchedule = schedule.dailySchedules[dayOfWeek];
    if (!daySchedule) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    for (const period of daySchedule.periods) {
      const periodStart = new Date(current);
      periodStart.setHours(Math.floor(period.start), (period.start % 1) * 60, 0, 0);
      
      const periodEnd = new Date(current);
      periodEnd.setHours(Math.floor(period.end), (period.end % 1) * 60, 0, 0);
      
      const workStart = startDate > periodStart ? startDate : periodStart;
      const workEnd = endDate < periodEnd ? endDate : periodEnd;
      
      if (workStart < workEnd) {
        totalMinutes += Math.floor((workEnd - workStart) / (1000 * 60));
      }
    }
    
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  
  return totalMinutes;
}

export {
  calculateTicketTimings,
  calculateDashboardMetrics,
  calculateEnhancedMetrics,
  calculateWorkingTime,
  calculateWorkingTimeWithConfig,
  getWorkScheduleConfig,
  formatMinutes,
  WORK_SCHEDULE,
  ACTIVE_WORK_STATES,
  NON_WORK_STATES
};
