import {
  removeDevicePrivateStorageItem as removeWebPrivateStorageItem,
  setDevicePrivateStorageItem as setWebPrivateStorageItem,
  devicePrivateStorageReadAllowed as webPrivateStorageReadAllowed,
} from "@/lib/storage/device-private-write";
import {
  DEVICE_ARCADE_BOOST_STORAGE_KEY as LEGACY_ARCADE_BOOST_STORAGE_KEY,
  PROTECTED_ARCADE_BOOST_STORAGE_KEY as WEB_V2_ARCADE_BOOST_STORAGE_KEY,
  selectDevicePrivateStorageKey as selectedWebPrivateStorageKey,
} from "@/lib/storage/device-private-storage";

/**
 * Board helps a reader can hold and spend.
 *
 * Three rules shape what is allowed to exist here.
 *
 * A boost may change the *board* and never the *Scripture*. Extra moves, a
 * nudge toward a move that exists, clearing one kind of tile — these are all
 * about the puzzle. There is deliberately no boost that skips a level, answers
 * a question, or buys an explanation: the passage and its answers are the one
 * thing this game is actually for, and they stay free and unbought.
 *
 * A boost is a shortcut, never a gate. Every level is finishable with none of
 * them, and running out of moves already costs nothing but another go.
 *
 * And they are earned as well as sold, so the mechanic is real for someone who
 * never spends anything.
 */
export const BOOST_IDS = ["extra-moves", "hint", "gather"] as const;
export type BoostId = (typeof BOOST_IDS)[number];

export interface BoostDefinition {
  readonly id: BoostId;
  readonly name: string;
  /** What it does, in the terms the reader sees. */
  readonly description: string;
  /** The sprite that stands for it. */
  readonly sprite: "compass" | "lantern" | "wheat";
}

export const BOOSTS: Readonly<Record<BoostId, BoostDefinition>> = {
  "extra-moves": {
    id: "extra-moves",
    name: "Five more moves",
    description: "Adds five moves to the level you are playing.",
    sprite: "wheat",
  },
  hint: {
    id: "hint",
    name: "A place to look",
    description: "Points out one trade that gathers something.",
    sprite: "lantern",
  },
  gather: {
    id: "gather",
    name: "Gather a kind",
    description: "Clears every tile of one kind from the board at once.",
    sprite: "compass",
  },
};

/** How many extra moves the move boost is worth. */
export const EXTRA_MOVES = 5;

export type BoostInventory = Readonly<Record<BoostId, number>>;

export const EMPTY_INVENTORY: BoostInventory = Object.freeze({
  "extra-moves": 0,
  hint: 0,
  gather: 0,
});

export const BOOST_STORAGE_KEY = LEGACY_ARCADE_BOOST_STORAGE_KEY;
const MAX_PER_BOOST = 99;

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Resolves the atomically selected guest or installed-account namespace. */
export function arcadeBoostStorageKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_ARCADE_BOOST_STORAGE_KEY,
    WEB_V2_ARCADE_BOOST_STORAGE_KEY,
  );
}

/** Rejects anything that is not a plain count of a boost this build knows. */
export function sanitizeInventory(value: unknown): BoostInventory | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const next: Record<BoostId, number> = { ...EMPTY_INVENTORY };
  for (const key of Object.keys(entry)) {
    if (!(BOOST_IDS as readonly string[]).includes(key)) return null;
    const count = entry[key];
    if (
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > MAX_PER_BOOST
    ) {
      return null;
    }
    next[key as BoostId] = count;
  }
  return next;
}

export function readInventory(storage?: Storage): BoostInventory {
  const target = storage ?? browserStorage();
  if (!target) return EMPTY_INVENTORY;
  try {
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return EMPTY_INVENTORY;
    }
    const key = arcadeBoostStorageKey(target);
    if (!key) return EMPTY_INVENTORY;
    const raw = target.getItem(key);
    if (
      !webPrivateStorageReadAllowed(target, storage !== undefined) ||
      !raw
    ) {
      return EMPTY_INVENTORY;
    }
    const parsed = sanitizeInventory(JSON.parse(raw));
    if (
      parsed &&
      webPrivateStorageReadAllowed(target, storage !== undefined)
    ) {
      return parsed;
    }
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return EMPTY_INVENTORY;
    }
    void removeWebPrivateStorageItem(target, key, storage !== undefined, raw);
  } catch {
    // A device that will not remember simply starts each visit with none.
  }
  return EMPTY_INVENTORY;
}

export function writeInventory(
  inventory: BoostInventory,
  storage?: Storage,
): Promise<boolean> {
  const safe = sanitizeInventory(inventory);
  const target = storage ?? browserStorage();
  if (!safe || !target) return Promise.resolve(false);
  const key = arcadeBoostStorageKey(target);
  if (!key) return Promise.resolve(false);
  return setWebPrivateStorageItem(
    target,
    key,
    JSON.stringify(safe),
    storage !== undefined,
  );
}

export function grantBoost(
  inventory: BoostInventory,
  id: BoostId,
  count = 1,
): BoostInventory {
  return {
    ...inventory,
    [id]: Math.min(MAX_PER_BOOST, inventory[id] + Math.max(0, count)),
  };
}

export function spendBoost(
  inventory: BoostInventory,
  id: BoostId,
): BoostInventory | null {
  if (inventory[id] <= 0) return null;
  return { ...inventory, [id]: inventory[id] - 1 };
}

export function hasAnyBoost(inventory: BoostInventory): boolean {
  return BOOST_IDS.some((id) => inventory[id] > 0);
}

/**
 * What a finished question round is worth.
 *
 * Answering all seven first time earns a boost; answering most of them earns
 * one too, a little later. This is the part of the economy that never asks for
 * money, and it is deliberately tied to the Scripture round rather than to
 * board score — the game would rather reward reading than grinding.
 */
export function boostsEarnedForRound(
  firstTryCount: number,
  total: number,
): { id: BoostId; count: number }[] {
  if (total <= 0) return [];
  if (firstTryCount === total) {
    return [
      { id: "extra-moves", count: 1 },
      { id: "hint", count: 1 },
    ];
  }
  if (firstTryCount * 2 >= total) return [{ id: "hint", count: 1 }];
  return [];
}
