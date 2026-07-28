"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  grantOperatorPlusAction,
  revokeOperatorPlusAction,
} from "@/app/console/(protected)/actions";
import {
  OPERATOR_PLUS_DURATIONS,
  type OperatorPlusActionState,
} from "@/lib/console/plus-grants";

const INITIAL_STATE: OperatorPlusActionState = {
  status: "idle",
  message: "",
};

/** Shows the latest mutation result without relying on redirect query strings. */
function ActionMessage({ state }: { state: OperatorPlusActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={
        state.status === "success"
          ? "console-form-success"
          : "console-form-error"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

/** Grants a time-bounded or lifetime entitlement to one exact account. */
export function ConsolePlusGrantForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    grantOperatorPlusAction,
    INITIAL_STATE,
  );

  // Clears sensitive confirmation text after a completed database mutation.
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.completedAt, state.status]);

  return (
    <form ref={formRef} action={action} className="console-entitlement-form">
      <div className="console-entitlement-grid">
        <div>
          <label className="console-field-label" htmlFor="plus-account-email">
            Exact account email
          </label>
          <input
            className="console-input"
            id="plus-account-email"
            name="email"
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            placeholder="member@example.com"
          />
        </div>
        <div>
          <label className="console-field-label" htmlFor="plus-duration">
            Access window
          </label>
          <select
            className="console-filter-select"
            id="plus-duration"
            name="duration"
            defaultValue="30d"
          >
            {OPERATOR_PLUS_DURATIONS.map((duration) => (
              <option key={duration.value} value={duration.value}>
                {duration.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="console-field-label" htmlFor="plus-reason">
        Internal reason
      </label>
      <input
        className="console-input"
        id="plus-reason"
        name="reason"
        required
        minLength={3}
        maxLength={240}
        placeholder="QA access, customer recovery, partnership…"
      />

      <label className="console-field-label" htmlFor="plus-confirmation">
        Confirm by retyping the exact email
      </label>
      <input
        className="console-input"
        id="plus-confirmation"
        name="confirmation"
        type="email"
        autoComplete="off"
        required
        maxLength={254}
        placeholder="member@example.com"
      />

      <button
        className="console-primary-button"
        type="submit"
        disabled={pending}
      >
        {pending ? "Granting Plus…" : "Grant BibleQuest Plus"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

/** Revokes only the selected account's open manual grant. */
export function ConsolePlusRevokeForm({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    revokeOperatorPlusAction,
    INITIAL_STATE,
  );
  const suffix = userId.slice(0, 8);

  // Clears confirmation text while leaving the completed outcome visible.
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.completedAt, state.status]);

  return (
    <details className="console-revoke-details">
      <summary>Revoke manual grant</summary>
      <form ref={formRef} action={action} className="console-revoke-form">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="email" value={email} />
        <label
          className="console-field-label"
          htmlFor={`revoke-reason-${suffix}`}
        >
          Reason
        </label>
        <input
          className="console-input"
          id={`revoke-reason-${suffix}`}
          name="reason"
          required
          minLength={3}
          maxLength={240}
          placeholder="Why access is ending"
        />
        <label
          className="console-field-label"
          htmlFor={`revoke-confirmation-${suffix}`}
        >
          Retype {email}
        </label>
        <input
          className="console-input"
          id={`revoke-confirmation-${suffix}`}
          name="confirmation"
          type="email"
          autoComplete="off"
          required
          maxLength={254}
        />
        <button
          className="console-danger-button"
          type="submit"
          disabled={pending}
        >
          {pending ? "Revoking…" : "Revoke manual Plus"}
        </button>
        <ActionMessage state={state} />
      </form>
    </details>
  );
}
