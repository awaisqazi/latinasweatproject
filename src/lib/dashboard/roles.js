export const ROLE_SUPERUSER = "superuser";
export const ROLE_ADMIN = "admin";
export const ROLE_MEMBER = "member";

export const USER_ROLES = [ROLE_SUPERUSER, ROLE_ADMIN, ROLE_MEMBER];

export function normalizeRole(role) {
  return USER_ROLES.includes(role) ? role : ROLE_MEMBER;
}

export function isSuperuser(profileOrRole) {
  const role =
    typeof profileOrRole === "string" ? profileOrRole : profileOrRole?.role;
  return role === ROLE_SUPERUSER;
}

export function isOperationalAdmin(profileOrRole) {
  const role =
    typeof profileOrRole === "string" ? profileOrRole : profileOrRole?.role;
  return role === ROLE_SUPERUSER || role === ROLE_ADMIN;
}

export function getRoleLabel(role) {
  if (role === ROLE_SUPERUSER) return "Superuser";
  if (role === ROLE_ADMIN) return "Admin";
  return "Member";
}
