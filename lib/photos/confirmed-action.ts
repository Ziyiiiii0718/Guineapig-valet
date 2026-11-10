"use client";

// Next's production RSC transition can remain suspended after the action has
// succeeded. Refresh from the resolved action, not an effect waiting for that
// transition to commit. Errors keep their existing inline state; never retry a
// mutation whose outcome is uncertain. See docs/RELEASE_PREPARATION.md.
export function withConfirmedPhotoRefresh<State extends { status: string }>(
  action: (previous: State, data: FormData) => Promise<State>,
  refresh: () => void = () => window.location.reload(),
) {
  return async (previous: State, data: FormData): Promise<State> => {
    const result = await action(previous, data);
    if (result.status === "success") refresh();
    return result;
  };
}
