import { isNativeTarget } from "@/lib/platform/target";

/** Native Plus and commerce stay sealed unless their own reviewed build opts in. */
export function nativeCommerceContained(
  enabled: string | undefined,
  nativeTarget = isNativeTarget(),
): boolean {
  return nativeTarget && enabled !== "true";
}

export const NATIVE_COMMERCE_CONTAINED = nativeCommerceContained(
  process.env.NEXT_PUBLIC_NATIVE_COMMERCE_ENABLED,
);
