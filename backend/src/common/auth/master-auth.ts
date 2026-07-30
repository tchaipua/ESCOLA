export const MASTER_LOGIN_USERNAME = "MSINFOR";

export function normalizeMasterIdentifier(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function isMasterLoginIdentifier(value: string) {
  return normalizeMasterIdentifier(value) === MASTER_LOGIN_USERNAME;
}
