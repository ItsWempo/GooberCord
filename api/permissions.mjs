// Phase-3 role foundation: the server-role permission bitmask and the
// hierarchy helpers it feeds. GC's permission model is DELIBERATELY additive:
// a plain member's base set (view channels, send, connect voice) stays
// implicit and is never gated by this module — roles only layer EXTRA
// moderation powers. A server with no roles row behaves exactly like the
// pre-roles server (the string membership tiers owner/moderator/member), so
// nothing existing is gated until the owner adds a role.
//
// Everything here is pure: the route module (api/servers.mjs) keeps its
// authorization inside the SQL itself, and these helpers feed both the bind
// ordering there and the roster payload the UI gates its affordances on.

// Bit positions, least-significant first. The stored value is a plain
// INTEGER column (gc_roles.permissions), so the set is stable file-wide.
export const SERVER_PERMISSIONS = Object.freeze({
  MANAGE_CHANNELS: 1 << 0,
  MANAGE_ROLES: 1 << 1,
  KICK_MEMBERS: 1 << 2,
  MANAGE_INVITES: 1 << 3,
  DELETE_MESSAGES: 1 << 4,
  VIEW: 1 << 5,
});

// The owner's effective set: every bit OR'd together, the single truth for
// what "owner bypasses everything" means.
export const ALL_SERVER_PERMISSIONS = Object.values(SERVER_PERMISSIONS).reduce(
  (all, bit) => all | bit,
  0,
);

const PERMISSION_NAMES = Object.entries(SERVER_PERMISSIONS).reduce(
  (names, [name, bit]) => {
    names[bit] = name;
    return names;
  },
  {},
);

// Owner check over a gc_server_members.role string (the pre-roles tier).
export function isMembershipOwner(role) {
  return role === "owner";
}

// hasPermission(role, permissions, bit): the single gate every caller passes
// through — the owner tier (or an explicit ALL-bit role) satisfies any bit,
// everyone else needs the bit set in their merged role mask.
export function hasPermission(role, permissions, bit) {
  if (isMembershipOwner(role)) return true;
  return ((Number(permissions) || 0) & (bit | 0)) !== 0;
}

// hasAllPermissions(role, permissions, bits): AND over a bit list, for the
// routes whose tool needs two powers at once (Manage-Nickname
// = KICK_MEMBERS + MANAGE_ROLES per the filed split).
export function hasAllPermissions(role, permissions, bits) {
  return bits.every((bit) => hasPermission(role, permissions, bit));
}

// permissionNames(permissions) -> ["MANAGE_CHANNELS", ...] in bit order: the
// wire form the roster's viewer payload carries (named bits survive a schema
// re-order; raw integers would not).
export function permissionNames(permissions) {
  const mask = Number(permissions) || 0;
  return Object.entries(SERVER_PERMISSIONS)
    .filter(([, bit]) => (mask & bit) !== 0)
    .map(([name]) => name);
}

// highestPosition(roleRows) -> the member's strongest position, or -1 when
// they hold no role (the sentinel EVERY hierarchy rule compares against).
// roleRows: [{ position }] in any order.
export function highestPosition(roleRows) {
  let top = -1;
  for (const row of Array.isArray(roleRows) ? roleRows : []) {
    const position = Number(row?.position);
    if (Number.isInteger(position) && position > top) top = position;
  }
  return top;
}

// canManageRoleAt(actorIsOwner, actorTopPosition, position): the role
// hierarchy rule — a member cannot assign/modify/delete a role whose position
// is GREATER OR EQUAL to their own highest (the owner bypasses everything).
export function canManageRoleAt(actorIsOwner, actorTopPosition, position) {
  if (actorIsOwner) return true;
  return Number(actorTopPosition) > Number(position);
}

// canActOnMember(actorIsOwner, actorTopPosition, targetTopPosition): the
// KICK/MANAGE rule — acting on a member is allowed only when the target's
// strongest position is STRICTLY LOWER than the actor's own (the owner
// bypasses; members with no roles sit at the -1 sentinel, so a roleless actor
// can act on nobody, only fellow roleless can act on them, and a positioned
// moderator outranks them).
export function canActOnMember(actorIsOwner, actorTopPosition, targetTopPosition) {
  if (actorIsOwner) return true;
  return Number(actorTopPosition) > Number(targetTopPosition);
}
