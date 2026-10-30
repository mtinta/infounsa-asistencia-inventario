export const isValidDniFormat = (dni: string): boolean => {
  // Acepta únicamente DNI (8 dígitos numéricos) o Carnet UNSA (8 dígitos numéricos)
  return /^\d{8}$/.test(dni);
};

export const isMinorContingencyDni = (dni: string): boolean => {
  return dni === '00000000';
};