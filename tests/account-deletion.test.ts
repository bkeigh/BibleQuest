import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountDeletionError,
  deleteOwnAccount,
} from "@/lib/auth/account-deletion";

/** Build the narrow authenticated client surface used by account deletion. */
function client(error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  return {
    client: { rpc, auth: { signOut } } as unknown as SupabaseClient,
    rpc,
    signOut,
  };
}

describe("self-service account deletion", () => {
  it("calls the zero-argument owner RPC then clears the local session", async () => {
    const fixture = client();

    await deleteOwnAccount(fixture.client);

    expect(fixture.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the session and device journey untouched when deletion fails", async () => {
    const fixture = client({ code: "42501", message: "private fixture" });

    await expect(deleteOwnAccount(fixture.client)).rejects.toBeInstanceOf(
      AccountDeletionError,
    );
    expect(fixture.signOut).not.toHaveBeenCalled();
  });
});
