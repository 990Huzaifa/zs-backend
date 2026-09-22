export const NotificationType = {
  INVOICE_CLEARING_REMINDER: 'INVOICE_CLEARING_REMINDER',
} as const;

export type NotificationTypeCode =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationModuleCode = {
  BILLING: 'BILLING',
  TRIP: 'TRIP',
  VEHICLE: 'VEHICLE',
  HR: 'HR',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationModuleCodeValue =
  (typeof NotificationModuleCode)[keyof typeof NotificationModuleCode];

export const NotificationEntityType = {
  CLIENT_INVOICE: 'CLIENT_INVOICE',
  TRIP: 'TRIP',
  VEHICLE: 'VEHICLE',
} as const;

/** Users with any of these permissions receive invoice clearing reminders. */
export const INVOICE_CLEARING_RECIPIENT_PERMISSIONS = [
  'VIEW_CLIENT_INVOICE',
  'VIEW_ACCOUNTS_RECEIVABLE',
] as const;
