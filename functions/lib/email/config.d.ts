/**
 * Email Configuration
 *
 * Resend API configuration for sending transactional emails
 * Matching smart-portal-2 configuration
 *
 * Setup: https://resend.com/docs/send-with-nodejs
 * Domain verification required for smartlogisticscr.com
 */
/**
 * Google Workspace Email Configuration (Primary)
 * Used for mass sending (2000 emails/day limit per user)
 */
export declare const EMAIL_CONFIG: {
    authEmail: string;
    senderEmail: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
};
/**
 * Resend Email Configuration (Fallback when Google Workspace limit is reached)
 *
 * Used automatically when Google Workspace returns:
 * - 550-5.4.5 Daily user sending limit exceeded
 */
export declare const RESEND_CONFIG: {
    apiKey: string;
    senderEmail: string;
    senderName: string;
    replyTo: string;
    invoiceSenderEmail: string;
    invoiceSenderName: string;
    audienceId: string;
    segmentId: string;
};
export declare const EMAIL_DEFAULTS: {
    companyName: string;
    companyId: string;
    bankAccountColones: string;
    bankAccountDollars: string;
    sinpeMobile: string;
    website: string;
    supportEmail: string;
};
//# sourceMappingURL=config.d.ts.map