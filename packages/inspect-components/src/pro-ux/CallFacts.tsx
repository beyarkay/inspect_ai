import "./callFacts.css";

import { FC, useMemo } from "react";

import type { ModelEvent } from "@tsmono/inspect-common/types";
import { CopyButton } from "@tsmono/react/components";

import { callFacts } from "./modelCallFacts";

const kHint =
  "This call's token usage, stop reason, timing and generation settings.";

/** The model call's usage and settings in one muted line, in place of
 *  upstream's Info tab. */
export const CallFacts: FC<{ event: ModelEvent }> = ({ event }) => {
  const { facts, providerIds } = useMemo(() => callFacts(event), [event]);
  if (facts.length === 0 && providerIds.length === 0) return null;
  return (
    <div className="pro-call-facts" title={kHint}>
      {facts.length > 0 && (
        <div className="pro-call-facts-row">
          {facts.map((fact, i) => (
            <span key={`${i}-${fact.label}`} className="pro-call-fact">
              <span className="pro-call-fact-label">{fact.label}</span>{" "}
              <b>{fact.value}</b>
            </span>
          ))}
        </div>
      )}
      {providerIds.length > 0 && (
        <div className="pro-call-facts-row">
          {providerIds.map((p, i) => (
            <span key={`${p.label}-${i}`} className="pro-call-fact">
              <span className="pro-call-fact-label">{p.label}</span>{" "}
              <code>{p.id}</code>
              {p.status !== undefined && (
                <span
                  className={
                    p.status >= 400
                      ? "pro-call-fact-status pro-call-fact-failed"
                      : "pro-call-fact-status"
                  }
                >
                  {p.status}
                </span>
              )}
              <CopyButton value={p.id} ariaLabel={`Copy ${p.label}`} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
