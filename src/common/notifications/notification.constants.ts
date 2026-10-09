export const NotificationType = {
  INVOICE_CLEARING_REMINDER: 'INVOICE_CLEARING_REMINDER',
  ATTENDANCE_UPDATE: 'ATTENDANCE_UPDATE',
  LEAVE_MARKED: 'LEAVE_MARKED',
  EXPORT_COMPLETED: 'EXPORT_COMPLETED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  DOCUMENT_EXPIRY_ALERT: 'DOCUMENT_EXPIRY_ALERT',
} as const;

export type NotificationTypeCode =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationModuleCode = {
  BILLING: 'BILLING',
  TRIP: 'TRIP',
  VEHICLE: 'VEHICLE',
  DRIVER: 'DRIVER',
  CLIENT: 'CLIENT',
  TRANSPORTER: 'TRANSPORTER',
  BROKER: 'BROKER',
  HR: 'HR',
  SYSTEM: 'SYSTEM',
  EXPORT: 'EXPORT',
} as const;

export type NotificationModuleCodeValue =
  (typeof NotificationModuleCode)[keyof typeof NotificationModuleCode];

export const NotificationEntityType = {
  CLIENT_INVOICE: 'CLIENT_INVOICE',
  TRIP: 'TRIP',
  VEHICLE: 'VEHICLE',
  ATTENDANCE: 'ATTENDANCE',
  LEAVE_REQUEST: 'LEAVE_REQUEST',
  EXPORT_JOB: 'EXPORT_JOB',
  ALERT: 'ALERT',
} as const;

/** Users with any of these permissions receive invoice clearing reminders. */
export const INVOICE_CLEARING_RECIPIENT_PERMISSIONS = [
  'VIEW_CLIENT_INVOICE',
  'VIEW_ACCOUNTS_RECEIVABLE',
] as const;

/** Users with any of these permissions receive document-expiry alert notifications. */
export const DOCUMENT_EXPIRY_ALERT_RECIPIENT_PERMISSIONS = [
  'VIEW_ALERT',
] as const;
