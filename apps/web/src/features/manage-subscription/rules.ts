/** A delivery can be moved only while the kitchen has merely accepted it (once it is being prepared the slot is committed). */
export const canRescheduleStatus = (status?: string): boolean => status === 'accepted';
