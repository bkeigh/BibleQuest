import { describe, expect, it } from "vitest";
import {
  acknowledgeMutableWrites,
  advanceMutableRevisionGeneration,
  createMutableRevisionContext,
  prepareMutableWrites,
  reconcileMutableRows,
  restoreMutableRevisionContext,
} from "@/lib/sync/mutable-revisions";

const USER_ID = "7bbfc4ec-ed55-4bf8-a07f-e0f8d4c40527";

/** Minimal memory storage exercises reload behavior without browser globals. */
class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  dump() {
    return [...this.values.values()].join("\n");
  }
}

/** Persist one canonical ledger, then emulate a browser storage write fault. */
class FailAfterOneWriteStorage extends MemoryStorage {
  private writesRemaining = 1;

  override setItem(key: string, value: string) {
    if (this.writesRemaining-- === 0) throw new Error("storage unavailable");
    super.setItem(key, value);
  }
}

/** Build one profile row with a caller clock that is ordinary payload only. */
function profile(displayName: string, updatedAt: string, revision = 0) {
  return {
    id: USER_ID,
    display_name: displayName,
    tradition: null,
    primary_goal: null,
    calling: null,
    daily_rhythm: null,
    quest_style: null,
    onboarding_completed: true,
    created_at: "2026-07-22T12:00:00.000Z",
    updated_at: updatedAt,
    sync_revision: revision,
  };
}

/** Pull a shared canonical profile into one isolated device context. */
async function device(base: ReturnType<typeof profile>, storage = new MemoryStorage()) {
  const context = createMutableRevisionContext();
  restoreMutableRevisionContext(context, USER_ID, 0, false, storage);
  await reconcileMutableRows(context, "profiles", [base], [base], {
    expectedUserId: USER_ID,
  });
  return { context, storage };
}

/** Apply one prepared write to its local context as a simulated server ack. */
function apply(
  context: ReturnType<typeof createMutableRevisionContext>,
  prepared: Awaited<ReturnType<typeof prepareMutableWrites>>,
  revision: number,
) {
  acknowledgeMutableWrites(
    context,
    "profiles",
    prepared,
    prepared.map((row) => ({
      key: row.key,
      revision,
      status: "applied" as const,
    })),
  );
}

describe("mutable revision reconciliation", () => {
  it("orders ahead and behind clocks only by server CAS", async () => {
    const base = profile("Base", "2026-07-22T12:00:00.000Z", 1);
    const ahead = profile("Ahead device", "2026-07-23T12:00:00.000Z");
    const behind = profile("Behind device", "2026-07-21T12:00:00.000Z");
    const a = await device(base);
    const b = await device(base);

    const aWrite = await prepareMutableWrites(
      a.context,
      "profiles",
      [ahead],
      USER_ID,
    );
    expect(aWrite[0].envelope.expected_revision).toBe(1);
    apply(a.context, aWrite, 2);

    const staleB = await prepareMutableWrites(
      b.context,
      "profiles",
      [behind],
      USER_ID,
    );
    expect(staleB[0].envelope.expected_revision).toBe(1);
    expect(
      acknowledgeMutableWrites(b.context, "profiles", staleB, [
        { key: staleB[0].key, revision: 2, status: "conflict" },
      ]),
    ).toBe(1);

    const rebased = await reconcileMutableRows(
      b.context,
      "profiles",
      [behind],
      [{ ...ahead, sync_revision: 2 }],
      { expectedUserId: USER_ID },
    );
    expect(rebased[0].row.display_name).toBe("Behind device");
    expect(rebased[0].localIntent).toBe(true);
    const bWrite = await prepareMutableWrites(
      b.context,
      "profiles",
      [behind],
      USER_ID,
    );
    expect(bWrite[0].envelope.expected_revision).toBe(2);
    apply(b.context, bWrite, 3);

    const converged = await reconcileMutableRows(
      a.context,
      "profiles",
      [ahead],
      [{ ...behind, sync_revision: 3 }],
      { expectedUserId: USER_ID },
    );
    expect(converged[0].row.display_name).toBe("Behind device");
    expect(converged[0].localIntent).toBe(false);
    expect(
      await prepareMutableWrites(
        a.context,
        "profiles",
        [converged[0].row],
        USER_ID,
      ),
    ).toEqual([]);
  });

  it("treats equal timestamps with different content as a real CAS conflict", async () => {
    const at = "2026-07-22T12:00:00.000Z";
    const base = profile("Base", at, 1);
    const a = await device(base);
    const b = await device(base);
    const aRow = profile("A", at);
    const bRow = profile("B", at);
    const aWrite = await prepareMutableWrites(a.context, "profiles", [aRow], USER_ID);
    const bWrite = await prepareMutableWrites(b.context, "profiles", [bRow], USER_ID);

    expect(aWrite[0].envelope.expected_revision).toBe(1);
    expect(bWrite[0].envelope.expected_revision).toBe(1);
    apply(a.context, aWrite, 2);
    expect(
      acknowledgeMutableWrites(b.context, "profiles", bWrite, [
        { key: bWrite[0].key, revision: 2, status: "conflict" },
      ]),
    ).toBe(1);
  });

  it("restores an offline edit after reload without storing private row data", async () => {
    const storage = new MemoryStorage();
    const base = profile("Base", "2026-07-22T12:00:00.000Z", 7);
    await device(base, storage);
    const reopened = createMutableRevisionContext();
    restoreMutableRevisionContext(reopened, USER_ID, 0, true, storage);
    const offline = profile("Private offline prayer-like text", "2026-07-21T12:00:00.000Z");

    const merged = await reconcileMutableRows(
      reopened,
      "profiles",
      [offline],
      [base],
      { expectedUserId: USER_ID },
    );
    expect(merged[0].localIntent).toBe(true);
    expect(storage.dump()).not.toContain("Private offline prayer-like text");
    expect(
      (await prepareMutableWrites(reopened, "profiles", [offline], USER_ID))[0]
        .envelope.expected_revision,
    ).toBe(7);
  });

  it("invalidates an older ledger when a canonical rewrite cannot persist", async () => {
    const storage = new FailAfterOneWriteStorage();
    const base = profile("A", "2026-07-22T12:00:00.000Z", 1);
    const canonical = profile("B", "2026-07-22T13:00:00.000Z", 2);
    const newest = profile("C", "2026-07-22T14:00:00.000Z", 3);
    const active = await device(base, storage);

    const imported = await reconcileMutableRows(
      active.context,
      "profiles",
      [base],
      [canonical],
      { expectedUserId: USER_ID },
    );
    expect(imported[0].row.display_name).toBe("B");

    const reopened = createMutableRevisionContext();
    restoreMutableRevisionContext(reopened, USER_ID, 0, true, storage);
    const merged = await reconcileMutableRows(
      reopened,
      "profiles",
      [canonical],
      [newest],
      { expectedUserId: USER_ID },
    );

    expect(merged[0].localIntent).toBe(false);
    expect(merged[0].row.display_name).toBe("C");
  });

  it("uses server authority without context and local authority for an explicit claim", async () => {
    const local = profile("Local", "2026-07-23T12:00:00.000Z");
    const remote = profile("Remote", "2026-07-21T12:00:00.000Z", 4);
    const ordinary = createMutableRevisionContext();
    restoreMutableRevisionContext(ordinary, USER_ID, 0, false, null);
    const serverWinner = await reconcileMutableRows(
      ordinary,
      "profiles",
      [local],
      [remote],
      { expectedUserId: USER_ID },
    );
    expect(serverWinner[0].row.display_name).toBe("Remote");

    const claim = createMutableRevisionContext();
    restoreMutableRevisionContext(claim, USER_ID, 0, false, null);
    const localWinner = await reconcileMutableRows(
      claim,
      "profiles",
      [local],
      [remote],
      { allowLocalWithoutBaseline: true, expectedUserId: USER_ID },
    );
    expect(localWinner[0].row.display_name).toBe("Local");
    expect(
      (await prepareMutableWrites(claim, "profiles", [local], USER_ID))[0]
        .envelope.expected_revision,
    ).toBe(4);
  });

  it("does not reuse observations across destructive generations", async () => {
    const storage = new MemoryStorage();
    const base = profile("Generation zero", "2026-07-22T12:00:00.000Z", 2);
    await device(base, storage);
    const next = createMutableRevisionContext();
    restoreMutableRevisionContext(next, USER_ID, 1, true, storage);
    const remote = profile("Generation one", "2026-07-21T12:00:00.000Z", 0);
    const merged = await reconcileMutableRows(next, "profiles", [base], [remote], {
      expectedUserId: USER_ID,
    });
    expect(merged[0].row.display_name).toBe("Generation one");
    expect(merged[0].localIntent).toBe(false);
  });

  it("carries surviving baselines across a partial-delete generation", async () => {
    const base = profile("Before sibling delete", "2026-07-22T12:00:00.000Z", 1);
    const remote = profile("Other device update", "2026-07-23T12:00:00.000Z", 2);
    const current = await device(base);

    advanceMutableRevisionGeneration(current.context, USER_ID, 1, []);
    const merged = await reconcileMutableRows(
      current.context,
      "profiles",
      [base],
      [remote],
      { expectedUserId: USER_ID },
    );

    expect(merged[0].localIntent).toBe(false);
    expect(merged[0].row.display_name).toBe("Other device update");
  });
});
