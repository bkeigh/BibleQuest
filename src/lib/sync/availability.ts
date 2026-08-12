"use client";

import { useEffect, useSyncExternalStore } from "react";
import { withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";
import { supabasePublishableKey } from "@/lib/supabase/config";
import {
  NATIVE_ACCOUNT_ENABLED,
  accountSyncAvailable,
} from "./containment";
import {
  ACCOUNT_AVAILABILITY_DEADLINE_MS,
  nativeAccountBuildContract,
  NativeAccountBetaUnavailableError,
  parseNativeAccountBetaAvailability,
} from "./native-beta-contract";

export {
  ACCOUNT_AVAILABILITY_DEADLINE_MS,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
  NativeAccountBetaUnavailableError,
  assertNativeAccountBetaAvailability,
  parseNativeAccountBetaAvailability,
} from "./native-beta-contract";
const MAX_AVAILABILITY_RESPONSE_BYTES = 512;
const FOREGROUND_RECHECK_MS = 60_000;

type AvailabilityStatus = "idle" | "checking" | "available" | "unavailable";

interface AvailabilitySnapshot {
  status: AvailabilityStatus;
}

interface AvailabilityRequestOptions {
  fetcher?: typeof fetch;
  publishableKey?: string;
  supabaseOrigin?: string;
}

let snapshot: AvailabilitySnapshot = { status: "idle" };
let pendingProbe: Promise<boolean> | null = null;
let retainedConsumers = 0;
let foregroundTimer: number | null = null;
let foregroundCleanup: (() => void) | null = null;
const listeners = new Set<() => void>();

/** Check public configuration without creating or importing an auth client. */
function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublishableKey(),
  );
}

/** Resolve one bare HTTPS Supabase origin without accepting decorated URLs. */
function availabilityEndpoint(origin: string): URL {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new NativeAccountBetaUnavailableError();
  }
  return new URL("/rest/v1/rpc/native_account_beta_availability", url);
}

/** Consume at most the tiny fixed RPC body, including chunked responses. */
async function boundedAvailabilityBody(response: Response): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_AVAILABILITY_RESPONSE_BYTES
    ) {
      throw new NativeAccountBetaUnavailableError();
    }
  }
  if (!response.body) throw new NativeAccountBetaUnavailableError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_AVAILABILITY_RESPONSE_BYTES) {
      await reader.cancel();
      throw new NativeAccountBetaUnavailableError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new NativeAccountBetaUnavailableError();
  }
}

/** Probe availability anonymously before the Keychain auth owner is created. */
export async function fetchNativeAccountBetaAvailability(
  options: AvailabilityRequestOptions = {},
): Promise<boolean> {
  const origin =
    options.supabaseOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = options.publishableKey ?? supabasePublishableKey() ?? "";
  if (!origin || !key) throw new NativeAccountBetaUnavailableError();
  const contract = nativeAccountBuildContract();
  if (!contract) throw new NativeAccountBetaUnavailableError();

  const response = await withDeadline(
    (async () => {
      const fetched = await (options.fetcher ?? fetch)(
        availabilityEndpoint(origin),
        {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          headers: {
            apikey: key,
            "content-type": "application/json",
            [contract.header]: contract.value,
          },
          body: "{}",
        },
      );
      if (!fetched.ok) {
        throw new NativeAccountBetaUnavailableError();
      }
      return boundedAvailabilityBody(fetched);
    })(),
    ACCOUNT_AVAILABILITY_DEADLINE_MS,
    "Native account availability",
  );

  try {
    const available = parseNativeAccountBetaAvailability(JSON.parse(response));
    if (available === null) throw new NativeAccountBetaUnavailableError();
    return available;
  } catch (error) {
    if (error instanceof NativeAccountBetaUnavailableError) throw error;
    throw new NativeAccountBetaUnavailableError();
  }
}

function updateSnapshot(status: AvailabilityStatus) {
  if (snapshot.status === status) return;
  snapshot = { status };
  listeners.forEach((listener) => listener());
}

/** Refresh the singleton gate and fail closed on every network/contract error. */
export function refreshNativeAccountBetaAvailability(): Promise<boolean> {
  if (
    !accountSyncAvailable(supabaseConfigured()) ||
    !isNativeTarget() ||
    !NATIVE_ACCOUNT_ENABLED
  ) {
    updateSnapshot("unavailable");
    return Promise.resolve(false);
  }
  if (pendingProbe) return pendingProbe;
  if (snapshot.status === "idle") updateSnapshot("checking");

  pendingProbe = fetchNativeAccountBetaAvailability()
    .then((available) => {
      updateSnapshot(available ? "available" : "unavailable");
      return available;
    })
    .catch(() => {
      updateSnapshot("unavailable");
      return false;
    })
    .finally(() => {
      pendingProbe = null;
    });
  return pendingProbe;
}

/** Recheck immediately before an OTP request can touch Supabase Auth. */
export async function requireNativeAccountBetaAvailability(): Promise<void> {
  if (!isNativeTarget() || !NATIVE_ACCOUNT_ENABLED) return;
  if (!(await refreshNativeAccountBetaAvailability())) {
    throw new NativeAccountBetaUnavailableError();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function retainForegroundChecks() {
  retainedConsumers += 1;
  let released = false;
  if (retainedConsumers === 1 && typeof window !== "undefined") {
    const refresh = () => void refreshNativeAccountBetaAvailability();
    const failOffline = () => updateSnapshot("unavailable");
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", failOffline);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    foregroundTimer = window.setInterval(refresh, FOREGROUND_RECHECK_MS);

    foregroundCleanup = () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", failOffline);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (foregroundTimer) window.clearInterval(foregroundTimer);
      foregroundTimer = null;
      foregroundCleanup = null;
    };
  }

  return () => {
    if (released) return;
    released = true;
    retainedConsumers -= 1;
    if (retainedConsumers !== 0) return;
    foregroundCleanup?.();
  };
}

/** Combine build containment with the live native-only availability switch. */
export function useAccountAvailability(): {
  available: boolean;
  loading: boolean;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const buildAvailable = accountSyncAvailable(supabaseConfigured());
  const remoteRequired =
    buildAvailable && isNativeTarget() && NATIVE_ACCOUNT_ENABLED;

  useEffect(() => {
    if (!remoteRequired) return;
    const release = retainForegroundChecks();
    void refreshNativeAccountBetaAvailability();
    return release;
  }, [remoteRequired]);

  if (!buildAvailable) return { available: false, loading: false };
  if (!remoteRequired) return { available: true, loading: false };
  return {
    available: current.status === "available",
    loading: current.status === "idle" || current.status === "checking",
  };
}
