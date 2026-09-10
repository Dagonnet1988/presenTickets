/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 *
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import { ImapFlow } from 'imapflow';
import { pool } from '../db.js';
import { sendWhatsAppNotification } from '../routes/whatsapp.js';
import { logger } from '../logger.js';

class EmailMonitorService {
  constructor() {
    const normalizeEnvValue = (value) => {
      if (value === undefined || value === null) return '';
      return String(value).trim().replace(/^['\"]|['\"]$/g, '');
    };

    const monitorUser = normalizeEnvValue(process.env.EMAIL_MONITOR_USER) || 'desarrollo@clinicadelapresentacion.com.co';
    const rawMonitorPassword = normalizeEnvValue(process.env.EMAIL_MONITOR_PASSWORD) || 'hwbc ovsb xvwa sejx';
    const stripSpaces = (process.env.EMAIL_MONITOR_PASSWORD_STRIP_SPACES || 'true').toLowerCase() === 'true';
    const monitorPassword = process.env.EMAIL_MONITOR_PASSWORD;;

    this.client = null;
    this.io = null;
    this.isRunning = false;
    this.isConnected = false;
    // Config gestionable desde el panel admin (tabla email_monitor_settings).
    // Si la fila existe, manda sobre las variables de entorno.
    this.settingsEnabled = true;
    // Ventana de búsqueda hacia atrás (IMAP SINCE es por día). El dedupe por
    // message_id evita reprocesar; conviene una ventana holgada por si el
    // servicio estuvo caído.
    this.lookbackDays = parseInt(process.env.EMAIL_MONITOR_LOOKBACK_DAYS, 10) || 3;
    // Buzones a vigilar: [{ user, password, host, port, label }]. Cada uno se
    // revisa en cada ciclo con una conexión IMAP efímera.
    this.mailboxes = [];
    this.monitorInterval = null;
    this.lastCheckTime = null;
    this.errorCount = 0;
    this.maxErrors = 5; // Máximo de errores consecutivos antes de pausar
    this.connectionRetryDelay = 15000; // Backoff inicial de reconexión IMAP
    this.maxConnectionRetryDelay = 120000; // Backoff máximo
    this.nextConnectionRetryAt = 0;

    // Configuración por defecto (se puede sobrescribir desde variables de entorno)
    this.config = {
      host: process.env.EMAIL_MONITOR_HOST || 'imap.gmail.com',
      port: parseInt(process.env.EMAIL_MONITOR_PORT) || 993,
      secure: true,
      auth: {
        user: process.env.EMAIL_MONITOR_USER || 'desarrollo@clinicadelapresentacion.com.co',
        pass: process.env.EMAIL_MONITOR_PASSWORD || 'bjkz gqkw rwlh ictg'
      },
      // Remitente a filtrar
      filterSender: process.env.EMAIL_FILTER_SENDER || 'soporte@osigu.com',
      // Lista opcional de remitentes permitidos (separados por coma)
      filterSenders: process.env.EMAIL_FILTER_SENDERS || '',
      // Correos tecnicos validos para enrutar notificaciones (separados por coma)
      techRecipients: process.env.EMAIL_TECH_RECIPIENTS || '',
      // Intervalo de revisión en ms (por defecto 2 minutos)
      checkInterval: parseInt(process.env.EMAIL_MONITOR_INTERVAL) || 120000
    };

    // Patrón del ID de ticket externo de Osigu: "TKT-111145" (también "TKT 111145" o "TKT111145")
    this.ticketPattern = /\bTKT[-\s]?(\d+)\b/i;
  }

  /**
   * Establecer referencia a Socket.IO para emitir eventos
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Verificar si la configuración es válida
   */
  isConfigured() {
    return this.config.auth.user && this.config.auth.pass;
  }

  /**
   * Cargar la configuración desde la BD (email_monitor_settings).
   * Si la fila existe, sus valores sobrescriben a los del entorno.
   */
  async loadSettingsFromDB() {
    try {
      const result = await pool.query(
        `SELECT enabled, filter_senders, tech_recipients, check_interval_seconds, mailboxes
         FROM email_monitor_settings WHERE id = 1`
      );
      if (result.rows.length === 0) {
        return { found: false, enabled: this.settingsEnabled };
      }

      const s = result.rows[0];
      this.config.filterSender = '';
      this.config.filterSenders = s.filter_senders || '';
      this.config.techRecipients = s.tech_recipients || '';
      this.config.checkInterval = Math.max(30, parseInt(s.check_interval_seconds, 10) || 120) * 1000;
      this.settingsEnabled = s.enabled !== false;

      // mailboxes viene como JSONB (array ya parseado por pg)
      const rawMailboxes = Array.isArray(s.mailboxes) ? s.mailboxes : [];
      this.mailboxes = rawMailboxes
        .filter((mb) => mb && mb.user)
        .map((mb) => ({
          user: String(mb.user).trim().toLowerCase(),
          password: mb.password || '',
          host: mb.host || this.config.host || 'imap.gmail.com',
          port: parseInt(mb.port, 10) || this.config.port || 993,
          label: mb.label || mb.user
        }));

      return { found: true, enabled: this.settingsEnabled };
    } catch (error) {
      console.error('📧 ⚠️  No se pudo cargar email_monitor_settings, se usa el entorno:', error.message);
      return { found: false, enabled: this.settingsEnabled };
    }
  }

  /**
   * Buzones a vigilar. Si no hay configurados en BD, usa el del entorno.
   */
  getMailboxes() {
    if (this.mailboxes.length > 0) {
      return this.mailboxes;
    }
    if (this.config.auth.user && this.config.auth.pass) {
      return [{
        user: this.config.auth.user.toLowerCase(),
        password: this.config.auth.pass,
        host: this.config.host,
        port: this.config.port,
        label: 'principal (entorno)'
      }];
    }
    return [];
  }

  /**
   * Releer la configuración de la BD y aplicarla en caliente:
   * ajusta el intervalo y arranca/detiene el monitor según "enabled".
   */
  async applySettings() {
    const prevInterval = this.config.checkInterval;
    await this.loadSettingsFromDB();

    if (this.isRunning && this.monitorInterval && this.config.checkInterval !== prevInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = setInterval(async () => {
        if (this.errorCount >= this.maxErrors) {
          await this.stop();
          return;
        }
        await this.checkEmails();
      }, this.config.checkInterval);
      console.log(`📧 Intervalo de revisión actualizado a ${this.config.checkInterval / 1000}s`);
    }

    if (this.settingsEnabled && !this.isRunning) {
      await this.start();
    } else if (!this.settingsEnabled && this.isRunning) {
      await this.stop();
      console.log('📧 Monitor detenido por configuración (enabled = false)');
    }

    return this.getStatus();
  }

  /**
   * Normalizar y obtener lista de remitentes permitidos.
   */
  getAllowedSenders() {
    const senders = [];

    if (this.config.filterSender) {
      senders.push(this.config.filterSender.toLowerCase().trim());
    }

    if (this.config.filterSenders) {
      const multiSenders = this.config.filterSenders
        .split(',')
        .map((s) => s.toLowerCase().trim())
        .filter(Boolean);
      senders.push(...multiSenders);
    }

    return [...new Set(senders)];
  }

  /**
   * Validar si un remitente pertenece a Osigu según configuración.
   * Una entrada con "@" exige coincidencia exacta.
   * Una entrada sin "@" se trata como dominio (coincide help@osigu.com,
   * noreply@osigu.com, x@mail.osigu.com, ...).
   */
  isAllowedSender(fromAddress) {
    const normalizedFrom = (fromAddress || '').toLowerCase().trim();
    if (!normalizedFrom) return false;

    const allowedSenders = this.getAllowedSenders();
    if (allowedSenders.length === 0) return false;

    return allowedSenders.some((sender) => {
      if (sender.includes('@')) {
        return normalizedFrom === sender;
      }
      return normalizedFrom === sender
        || normalizedFrom.endsWith('@' + sender)
        || normalizedFrom.endsWith('.' + sender);
    });
  }

  /**
   * Obtener lista de correos tecnicos permitidos desde variables de entorno.
   */
  getAllowedTechRecipients() {
    return (this.config.techRecipients || '')
      .split(',')
      .map((email) => email.toLowerCase().trim())
      .filter(Boolean);
  }

  /**
   * Extraer el número de ticket externo (TKT-xxxxx) del correo de Osigu.
   * Prioriza el ASUNTO (ej: "Re: TKT-111145 Tu solicitud fue recibida...") porque
   * el cuerpo/MIME crudo puede contener TKT antiguos citados en hilos de respuesta.
   */
  extractExternalTicketId(subject = '', bodyText = '') {
    const subjectMatch = (subject || '').match(this.ticketPattern);
    if (subjectMatch?.[1]) {
      return subjectMatch[1];
    }

    const bodyMatch = (bodyText || '').match(this.ticketPattern);
    if (bodyMatch?.[1]) {
      return bodyMatch[1];
    }

    return null;
  }

  /**
   * Extraer texto del source MIME del correo.
   */
  extractTextFromSource(source) {
    if (!source) return '';
    try {
      if (Buffer.isBuffer(source)) {
        return source.toString('utf8');
      }
      return String(source);
    } catch (error) {
      return '';
    }
  }

  /**
   * Extraer destinatarios del sobre (to/cc).
   */
  extractRecipientEmails(message) {
    const recipients = [];
    const toList = message?.envelope?.to || [];
    const ccList = message?.envelope?.cc || [];

    for (const entry of [...toList, ...ccList]) {
      const email = entry?.address?.toLowerCase()?.trim();
      if (email) recipients.push(email);
    }

    return [...new Set(recipients)];
  }

  /**
   * Inicializar conexión IMAP
   */
  async connect() {
    if (!this.isConfigured()) {
      return false;
    }

    // Asegurarse de desconectar cualquier cliente existente
    await this.disconnect();

    try {
      const maskedUser = this.config.auth.user
        ? this.config.auth.user.replace(/(.{3}).*(@.*)/, '$1***$2')
        : 'no-configurado';

      logger.debug(`📧 Intentando conexión IMAP host=${this.config.host} port=${this.config.port} user=${maskedUser} passLen=${(this.config.auth.pass || '').length}`);

      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
        logger: false,
        // Aumentar timeout para conexiones lentas
        socketTimeout: 60000,
        greetingTimeout: 30000,
        authTimeout: 30000
      });

      // Manejar eventos de error y cierre
      this.client.on('error', (err) => {
        console.error('📧 ❌ IMAP client error:', err.message);
        this.isConnected = false;
        // No propagar - se reintenta en checkEmails
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
      this.errorCount = 0;
      this.connectionRetryDelay = 15000;
      this.nextConnectionRetryAt = 0;

      logger.debug(`📧 ✅ Conexión IMAP establecida con ${this.config.host}:${this.config.port}`);
      
      return true;
    } catch (error) {
      const errorDetails = {
        message: error?.message || 'Error desconocido',
        code: error?.code || null,
        command: error?.command || null,
        responseCode: error?.responseCode || null,
        responseStatus: error?.responseStatus || null,
        serverResponse: error?.serverResponse || null,
        errno: error?.errno || null,
        syscall: error?.syscall || null,
        address: error?.address || null,
        port: error?.port || null
      };

      console.error('❌ Email Monitor: Error de conexión:', errorDetails);
      this.isConnected = false;
      this.errorCount++;
      this.nextConnectionRetryAt = Date.now() + this.connectionRetryDelay;
      this.connectionRetryDelay = Math.min(this.connectionRetryDelay * 2, this.maxConnectionRetryDelay);
      return false;
    }
  }

  /**
   * Desconectar cliente IMAP
   */
  async disconnect() {
    if (this.client) {
      try {
        // Remover listeners para evitar memory leaks
        this.client.removeAllListeners();
        await this.client.logout();
      } catch (error) {
        // Ignorar errores de desconexión - puede ya estar desconectado
      }
      this.client = null;
    }
    this.isConnected = false;
  }

  /**
   * Iniciar monitoreo de correos
   */
  async start() {
    if (this.isRunning) {
      return { success: false, message: 'El monitor ya está en ejecución' };
    }

    // Cargar configuración gestionable antes de arrancar
    await this.loadSettingsFromDB();
    if (!this.settingsEnabled) {
      console.log('📧 Monitor deshabilitado en la configuración (email_monitor_settings.enabled = false)');
      return { success: false, message: 'El monitor está deshabilitado en la configuración' };
    }

    const mailboxes = this.getMailboxes().filter((mb) => mb.user && mb.password);
    if (mailboxes.length === 0) {
      console.log('📧 ❌ Monitor no configurado - no hay buzones con credenciales');
      return {
        success: false,
        message: 'No hay buzones configurados. Agrega al menos un buzón con su contraseña de aplicación.'
      };
    }

    this.isRunning = true;
    console.log(`📧 ✅ Monitor de email activo - ${mailboxes.length} buzón(es), cada ${this.config.checkInterval / 1000}s`);

    // Realizar primera revisión inmediatamente
    await this.checkEmails();

    // Programar revisiones periódicas
    this.monitorInterval = setInterval(async () => {
      if (this.errorCount >= this.maxErrors) {
        console.warn('⚠️ Email Monitor: Demasiados errores consecutivos, pausando servicio');
        await this.stop();
        return;
      }
      await this.checkEmails();
    }, this.config.checkInterval);

    return { success: true, message: 'Monitor de correo iniciado' };
  }

  /**
   * Detener monitoreo de correos
   */
  async stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    await this.disconnect();
    this.isRunning = false;
    this.errorCount = 0;

    return { success: true, message: 'Monitor de correo detenido' };
  }

  /**
   * Revisar todos los buzones configurados.
   */
  async checkEmails() {
    this.lastCheckTime = new Date();

    const mailboxes = this.getMailboxes().filter((mb) => mb.user && mb.password);
    if (mailboxes.length === 0) {
      console.warn('📧 ⚠️  No hay buzones con credenciales para revisar');
      return;
    }

    let anyOk = false;
    for (const mb of mailboxes) {
      const ok = await this.checkOneMailbox(mb);
      anyOk = anyOk || ok;
    }

    this.isConnected = anyOk;
    if (anyOk) {
      this.errorCount = 0;
    }
  }

  /**
   * Revisar un buzón concreto con una conexión IMAP efímera.
   * Devuelve true si la conexión y la lectura fueron correctas.
   */
  async checkOneMailbox(mb) {
    const label = mb.label || mb.user;
    let client = null;
    try {
      client = new ImapFlow({
        host: mb.host || 'imap.gmail.com',
        port: mb.port || 993,
        secure: true,
        auth: { user: mb.user, pass: mb.password },
        logger: false,
        socketTimeout: 60000,
        greetingTimeout: 30000,
        authTimeout: 30000
      });

      await client.connect();

      // Escanear "Todos los mensajes" (\All) si existe — así se ven también los
      // correos que fueron archivados. Si no, INBOX.
      let folder = 'INBOX';
      try {
        const boxes = await client.list();
        const allMail = boxes.find((b) => (b.specialUse || '').toLowerCase() === '\\all');
        if (allMail?.path) folder = allMail.path;
      } catch (e) {
        /* usar INBOX */
      }

      const sinceDate = new Date(Date.now() - this.lookbackDays * 24 * 60 * 60 * 1000);
      const allowedSenders = this.getAllowedSenders();

      let checked = 0;
      let osiguVistos = 0;
      let yaProcesados = 0;
      let nuevos = 0;
      const otrosRemitentes = [];
      const pendientes = []; // { envelope, uid }

      const lock = await client.getMailboxLock(folder);
      try {
        // 1ª pasada: solo envelope (rápido)
        for await (const message of client.fetch({ since: sinceDate }, { envelope: true })) {
          checked++;
          const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase() || '';

          if (!this.isAllowedSender(fromAddress)) {
            if (fromAddress) otrosRemitentes.push(fromAddress);
            continue;
          }

          osiguVistos++;
          const messageId = message.envelope?.messageId;
          if (await this.isEmailProcessed(messageId)) {
            yaProcesados++;
            continue;
          }
          pendientes.push({ envelope: message.envelope, uid: message.uid });
        }

        // 2ª pasada: bajar el cuerpo solo si el asunto no trae el TKT
        for (const item of pendientes) {
          const subject = item.envelope?.subject || '';
          let source = '';
          if (!this.ticketPattern.test(subject)) {
            try {
              const full = await client.fetchOne(item.uid, { source: true }, { uid: true });
              source = this.extractTextFromSource(full?.source);
            } catch (e) {
              /* seguimos solo con el asunto */
            }
          }
          await this.processEmail({ envelope: item.envelope, source }, mb);
          nuevos++;
        }
      } finally {
        try { lock.release(); } catch (e) { /* noop */ }
      }

      logger.debug(`📧 [${label}] carpeta="${folder}" · ${checked} correos (${this.lookbackDays}d) · OSIGU: ${osiguVistos} · nuevos: ${nuevos} · ya procesados: ${yaProcesados} · filtro: [${allowedSenders.join(', ')}]`);
      if (osiguVistos === 0 && checked > 0) {
        const muestra = [...new Set(otrosRemitentes)].slice(0, 10).join(', ');
        logger.debug(`📧 [${label}] ⚠️  Sin correos de OSIGU. Remitentes vistos: ${muestra || '(ninguno)'}`);
      }
      if (nuevos > 0) {
        logger.info(`📧 [${label}] ${nuevos} correo(s) nuevo(s) de OSIGU procesado(s)`);
      }

      await client.logout();
      return true;
    } catch (error) {
      console.error(`📧 ❌ Error revisando buzón ${label}:`, error.message);
      this.errorCount++;
      try { if (client) await client.logout(); } catch (e) { /* noop */ }
      try { if (client) client.close(); } catch (e) { /* noop */ }
      return false;
    }
  }

  /**
   * Verificar si un correo ya fue procesado (en BD)
   */
  async isEmailProcessed(messageId) {
    if (!messageId) return false;
    try {
      const result = await pool.query(
        'SELECT 1 FROM processed_emails WHERE message_id = $1 LIMIT 1',
        [messageId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('⚠️ Error verificando email procesado:', error.message);
      return false;
    }
  }

  /**
   * Marcar correo como procesado (en BD)
   */
  async markEmailAsProcessed(messageId, externalTicketId, subject, fromAddress) {
    if (!messageId) return;
    try {
      await pool.query(
        `INSERT INTO processed_emails (message_id, external_ticket_id, subject, from_address)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId, externalTicketId, subject, fromAddress]
      );
    } catch (error) {
      console.error('⚠️ Error guardando email procesado:', error.message);
    }
  }

  /**
   * Procesar un correo individual encontrado en un buzón vigilado.
   * El correo ya pasó el filtro de remitente permitido, así que se procesa
   * (no se exige que el destinatario coincida con una lista).
   */
  async processEmail(message, mailbox = null) {
    try {
      const messageId = message.envelope?.messageId;

      const subject = message.envelope?.subject || 'Sin asunto';
      const from = message.envelope?.from?.[0];
      const fromAddress = from?.address || 'desconocido';
      const fromName = from?.name || fromAddress;
      const date = message.envelope?.date || new Date();
      const emailSource = this.extractTextFromSource(message.source);
      const recipientEmails = this.extractRecipientEmails(message);

      // Para el enrutado fallback (cuando no hay ticket interno): el buzón que
      // recibió el correo + los destinatarios To/CC + la lista de buzones técnicos.
      const routingHints = [...new Set([
        ...(mailbox?.user ? [mailbox.user.toLowerCase()] : []),
        ...recipientEmails,
        ...this.getAllowedTechRecipients()
      ])];

      const externalTicketId = this.extractExternalTicketId(subject, emailSource);

      logger.debug(`📧 Procesando correo de [${fromAddress}] en buzón [${mailbox?.label || mailbox?.user || '?'}] asunto="${subject.substring(0, 80)}"`);
      logger.debug(`📧   TKT extraído del asunto: ${externalTicketId || '(no encontrado)'}`);

      await this.createNotificationForTechnicians({
        messageId,
        externalTicketId,
        subject,
        fromName,
        fromAddress,
        date,
        recipientEmails: routingHints
      });

      await this.markEmailAsProcessed(messageId, externalTicketId, subject, fromAddress);

    } catch (error) {
      console.error('❌ Error procesando correo:', error.message);
    }
  }

  /**
   * Marcar correo como leído
   */
  async markAsRead(uid) {
    try {
      const lock = await this.client.getMailboxLock('INBOX');
      try {
        await this.client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } catch (error) {
      // Error no crítico - el correo igual se procesa
    }
  }

  /**
   * Crear notificación para técnico destino.
   * Prioriza técnico asignado del ticket y usa destinatario del correo como fallback.
   */
  async createNotificationForTechnicians({ messageId, externalTicketId, subject, fromName, fromAddress, date, recipientEmails = [] }) {
    try {
      const normalizedRecipients = recipientEmails
        .map((email) => (email || '').toLowerCase().trim())
        .filter(Boolean);

      if (normalizedRecipients.length === 0) {
        return;
      }

      // Buscar si existe un ticket interno relacionado con este ticket externo
      let relatedTicketId = null;
      if (externalTicketId) {
        const ticketResult = await pool.query(
          `SELECT id FROM tickets WHERE external_ticket_id = $1 LIMIT 1`,
          [externalTicketId]
        );
        if (ticketResult.rows.length > 0) {
          relatedTicketId = ticketResult.rows[0].id;
          logger.debug(`📧   Ticket interno relacionado: #${relatedTicketId}`);
        } else {
          logger.debug(`📧   Sin ticket interno para external_ticket_id=${externalTicketId}`);
        }
      }

      // Si el ticket existe, notificar al técnico asignado y a los participantes que
      // sean tech/admin y estén activos (los participantes con rol 'user' nunca reciben
      // estas alertas de soporte externo). Si no hay ninguno válido, fallback al
      // destinatario del correo.
      let usersResult;
      let routingMode;
      if (relatedTicketId) {
        usersResult = await pool.query(
          `SELECT DISTINCT u.id, u.username, u.firstname, u.lastname, u.email
           FROM tickets t
           JOIN users u ON (u.id = t.assigned_to OR u.id = ANY(t.participants))
           WHERE t.id = $1
             AND u.role IN ('tech', 'admin')
             AND u.status = true`,
          [relatedTicketId]
        );

        if (usersResult.rows.length > 0) {
          routingMode = 'asignado/participantes del ticket';
        } else {
          // Si no hay asignado/participante válido, fallback a destinatario(s) del correo.
          usersResult = await pool.query(
            `SELECT id, username, firstname, lastname, email
             FROM users
             WHERE role = 'tech'
               AND status = true
               AND lower(email) = ANY($1::text[])`,
            [normalizedRecipients]
          );
          routingMode = 'fallback por destinatario (ticket sin asignado/participantes)';
        }
      } else {
        usersResult = await pool.query(
          `SELECT id, username, firstname, lastname, email
           FROM users
           WHERE role = 'tech'
             AND status = true
             AND lower(email) = ANY($1::text[])`,
          [normalizedRecipients]
        );
        routingMode = 'por destinatario del correo';
      }

      // Fallback final: si no se pudo enrutar a nadie, notificar a TODOS los
      // técnicos/admins activos (así ningún correo de OSIGU se pierde, incluidos
      // los que no traen TKT — reuniones, avisos, etc.).
      if (usersResult.rows.length === 0) {
        usersResult = await pool.query(
          `SELECT id, username, firstname, lastname, email
           FROM users
           WHERE role IN ('tech', 'admin') AND status = true`
        );
        routingMode = 'todos los técnicos/admins (sin enrutado específico)';
      }

      if (usersResult.rows.length === 0) {
        console.warn('📧 ⚠️  No hay técnicos/admins activos para notificar');
        return [];
      }

      const techNames = usersResult.rows.map((u) => `${u.firstname} <${u.email}>`).join(', ');
      logger.debug(`📧   Enrutando notificación a [${techNames}] — modo: ${routingMode}`);

      // Mensaje de notificación
      const message = externalTicketId
        ? `📧 Respuesta de soporte externo - Ticket #${externalTicketId}: ${subject.substring(0, 100)}`
        : `📧 Correo de soporte externo: ${subject.substring(0, 100)}`;

      // Cada correo distinto de OSIGU genera su propia notificación (el dedupe por
      // message_id en processed_emails evita procesar el mismo correo dos veces).

      // Crear notificación para cada técnico (comparten email_message_id)
      const notifications = [];
      for (const user of usersResult.rows) {
        const result = await pool.query(`
          INSERT INTO notifications (user_id, type, message, ticket_id, external_ticket_id, email_subject, email_message_id, is_read, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
          RETURNING id, user_id, type, message, ticket_id, external_ticket_id, email_subject, email_message_id, is_read, created_at
        `, [
          user.id,
          'external_email',
          message,
          relatedTicketId,
          externalTicketId,
          subject,
          messageId  // Compartido entre todos los técnicos
        ]);

        notifications.push({
          ...result.rows[0],
          username: user.username,
          firstname: user.firstname,
          lastname: user.lastname
        });
      }

      // Emitir evento WebSocket a todos los técnicos conectados
      if (this.io) {
        // Emitir evento general
        this.io.emit('external-email-alert', {
          externalTicketId,
          subject,
          fromName,
          fromAddress,
          date,
          relatedTicketId,
          message,
          timestamp: new Date().toISOString()
        });

        // También emitir como notificación normal para que actualice el contador
        for (const notification of notifications) {
          this.io.to(`user-${notification.user_id}`).emit('new-notification', notification);
        }
      }

      // Enviar notificaciones WhatsApp a los técnicos (no bloqueante)
      // El mensaje incluye info del ticket externo
      // Solo los datos; el encabezado y el pie los pone la plantilla de WhatsApp.
      const fecha = new Date(date).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false }).replace(/\//g, '-');
      const whatsappMessage = [
        externalTicketId ? `🎫 Ticket externo: #${externalTicketId}` : null,
        `📝 Asunto: ${subject.substring(0, 120)}`,
        `👤 De: ${fromName}`,
        `🕒 ${fecha}`,
        '',
        '💡 Revisa la bandeja de entrada del sistema para más detalles.'
      ].filter((line) => line !== null).join('\n');

      for (const notification of notifications) {
        // Enviar de forma asíncrona sin bloquear
        setImmediate(async () => {
          try {
            await sendWhatsAppNotification(
              notification.user_id,
              relatedTicketId, // Puede ser null si no hay ticket relacionado
              whatsappMessage,
              'external_email'
            );
          } catch (error) {
            // Error no crítico - la notificación en BD ya fue creada
          }
        });
      }

      return notifications;
    } catch (error) {
      console.error('❌ Error creando notificaciones:', error.message);
      throw error;
    }
  }

  /**
   * Obtener estado del monitor
   */
  async getStatus() {
    // Obtener conteo de correos procesados desde BD
    let processedCount = 0;
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM processed_emails');
      processedCount = parseInt(result.rows[0].count) || 0;
    } catch (error) {
      // Error no crítico - continuar sin conteo
    }

    const mailboxes = this.getMailboxes().map((mb) => ({
      user: mb.user,
      label: mb.label || mb.user,
      host: mb.host,
      port: mb.port,
      hasPassword: !!mb.password
    }));

    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      isConfigured: mailboxes.length > 0,
      enabled: this.settingsEnabled,
      lastCheckTime: this.lastCheckTime,
      errorCount: this.errorCount,
      maxErrors: this.maxErrors,
      mailboxes,
      config: {
        filterSenders: this.getAllowedSenders(),
        checkIntervalSeconds: this.config.checkInterval / 1000
      },
      processedEmailsCount: processedCount
    };
  }

  /**
   * Forzar revisión inmediata
   */
  async forceCheck() {
    if (!this.isRunning) {
      return { success: false, message: 'El monitor no está en ejecución' };
    }

    await this.checkEmails();
    return { 
      success: true, 
      message: 'Revisión completada',
      lastCheckTime: this.lastCheckTime 
    };
  }

  /**
   * Actualizar configuración en caliente
   */
  updateConfig(newConfig) {
    if (newConfig.checkInterval) {
      this.config.checkInterval = parseInt(newConfig.checkInterval);
      
      // Si está corriendo, reiniciar el intervalo
      if (this.isRunning && this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = setInterval(async () => {
          await this.checkEmails();
        }, this.config.checkInterval);
      }
    }

    if (newConfig.filterSender) {
      this.config.filterSender = newConfig.filterSender;
    }

    if (typeof newConfig.filterSenders === 'string') {
      this.config.filterSenders = newConfig.filterSenders;
    }

    return this.getStatus();
  }
}

// Exportar instancia singleton
const emailMonitorService = new EmailMonitorService();
export default emailMonitorService;
