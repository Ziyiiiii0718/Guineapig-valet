export function isOwnedByAuthenticatedUser(
  recordUserId: string | null | undefined,
  authenticatedUserId: string | null | undefined,
) {
  return (
    Boolean(recordUserId && authenticatedUserId) &&
    recordUserId === authenticatedUserId
  );
}
