export const MASTER_LOGIN_USERNAME = "MSINFOR";
export const MASTER_ROLE = "SOFTHOUSE_ADMIN";
export const MASTER_USER_ID = "MSINFOR-MASTER";
export const MASTER_TENANT_ID = "__MSINFOR_MASTER__";
export const MASTER_PERMISSIONS = ["*"];

export function normalizeMasterIdentifier(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function isMasterLoginIdentifier(value: string) {
  return normalizeMasterIdentifier(value) === MASTER_LOGIN_USERNAME;
}

export function buildMasterPass(date: Date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const hour = date.getHours();
  const minute = date.getMinutes();

  return `S${day + hour}${month + minute}`;
}

export function isValidMasterPass(value: string) {
  const incoming = String(value || "").trim();
  if (!incoming) return false;

  const now = new Date();
  const prevMinute = new Date(now.getTime() - 60_000);
  const nextMinute = new Date(now.getTime() + 60_000);

  return [prevMinute, now, nextMinute]
    .map((date) => buildMasterPass(date))
    .includes(incoming);
}
