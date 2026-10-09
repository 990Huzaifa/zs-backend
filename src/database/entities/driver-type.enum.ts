/** Shared to avoid circular imports between driver / vehicle / assigned-driver entities. */
export enum DriverType {
  HELPER = 'HELPER',
  FIRST_DRIVER = '1ST_DRIVER',
  SECOND_DRIVER = '2ND_DRIVER',
}
