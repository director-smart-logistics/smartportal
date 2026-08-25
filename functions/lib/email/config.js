"use strict";
/**
 * Email Configuration
 *
 * Resend API configuration for sending transactional emails
 * Matching smart-portal-2 configuration
 *
 * Setup: https://resend.com/docs/send-with-nodejs
 * Domain verification required for smartlogisticscr.com
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_DEFAULTS = exports.RESEND_CONFIG = exports.EMAIL_CONFIG = void 0;
/**
 * Google Workspace Email Configuration (Primary)
 * Used for mass sending (2000 emails/day limit per user)
 */
exports.EMAIL_CONFIG = {
    authEmail: process.env.GOOGLE_WORKSPACE_AUTH_EMAIL || 'director@smartlogisticscr.com',
    senderEmail: process.env.GOOGLE_WORKSPACE_SENDER_EMAIL || 'no-reply@smartlogisticscr.com',
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN || '',
};
/**
 * Resend Email Configuration (Fallback when Google Workspace limit is reached)
 *
 * Used automatically when Google Workspace returns:
 * - 550-5.4.5 Daily user sending limit exceeded
 */
exports.RESEND_CONFIG = {
    apiKey: process.env.RESEND_API_KEY || '',
    senderEmail: process.env.RESEND_SENDER_EMAIL || 'no-reply@smartlogisticscr.com',
    senderName: 'DA SmartLogistics Costa Rica - Servicios Comerciales',
    replyTo: 'soporte@smartlogisticscr.com',
    invoiceSenderEmail: 'facturacion@smartlogisticscr.com',
    invoiceSenderName: 'DA SmartLogistics Facturación',
    audienceId: process.env.RESEND_AUDIENCE_ID || '',
    segmentId: process.env.RESEND_SEGMENT_ID || '',
};
exports.EMAIL_DEFAULTS = {
    companyName: 'DA SMART LOGISTICS',
    companyId: 'Ced. Jur. 3102843818',
    bankAccountColones: 'CR17010200009534930951',
    bankAccountDollars: 'CR75010200009534930877',
    sinpeMobile: '7105-7790',
    website: 'www.smartlogisticscr.com',
    supportEmail: 'soporte@smartlogisticscr.com',
};
//# sourceMappingURL=config.js.map