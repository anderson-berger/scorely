export const generateId = () => crypto.randomUUID();

export const generateTimestamp = () => new Date().toISOString();
