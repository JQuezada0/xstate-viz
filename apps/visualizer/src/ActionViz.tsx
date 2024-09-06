import { useEffect, useRef, useState } from "react";
import {
  UnknownAction,
  AssignAction,
  CancelAction,
  EventObject,
  LogAction,
  RaiseAction,
  SpecialTargets,
  StopAction,
  Action,
} from "xstate";
import { isDelayedTransitionAction, isStringifiedFunction } from "./utils";
import "./ActionViz.scss";

type AnyFunction = (...args: any[]) => any;

// atm inspected machines (their configs) are sent through postMessage
// that might, unfortunatelly, lose some information on our action objects
// this helper type ain't deep/recursive because we don't need it, our actions define properties only on the top-level of an object
type PotentiallyStructurallyCloned<T> = {
  [K in keyof T]: AnyFunction extends T[K] ? T[K] | undefined : T[K];
};

// at the moment a lot of invalid values can be passed through `createMachine` and reach lines like here
// so we need to be defensive about this before we implement some kind of a validation so we could raise such problems early and discard the invalid values
export function getActionLabel(action: UnknownAction): string | null {
  if (!action) {
    return null;
  }
  if (typeof action === "function") {
    return action.name ?? "anonymous";
    // return isStringifiedFunction(action) ? 'anonymous' : action.name;
  }

  if (typeof action === "string") {
    return action;
  }

  if (!action.type) {
    return null;
  }
  if (action.type.startsWith("xstate.")) {
    return action.type.match(/^xstate\.(.+)$/)![1];
  }
  return action.type;
}

export const ActionType: React.FC<{
  title?: string;
  children?: React.ReactNode | React.ReactNode[];
}> = ({ children, title }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [resolvedTitle, setTitle] = useState(title || "");

  useEffect(() => {
    if (ref.current && !title) {
      setTitle(ref.current.textContent!);
    }
  }, [title]);

  return (
    <div data-viz="action-type" title={resolvedTitle} ref={ref}>
      {children}
    </div>
  );
};

export const CustomActionLabel: React.FC<{
  action: PotentiallyStructurallyCloned<UnknownAction>;
}> = ({ action }) => {
  const label = getActionLabel(action as UnknownAction);

  if (label === null) {
    return null;
  }

  return (
    <ActionType>
      {label === "anonymous" ? <em>anonymous</em> : <strong>{label}</strong>}
    </ActionType>
  );
};

export const ActionViz: React.FC<{
  action: UnknownAction;
  kind: "entry" | "exit" | "do";
}> = ({ action, kind }) => {
  if (isDelayedTransitionAction(action)) {
    // Don't show implicit actions for delayed transitions
    return null;
  }

  // return (<CustomActionLabel action={action} />)

  // const actionType = {
  //   [ActionTypes.Assign]: (
  //     <AssignActionLabel action={action as AssignAction<any, any>} />
  //   ),
  //   [ActionTypes.Raise]: (
  //     <RaiseActionLabel action={action as RaiseAction<any>} />
  //   ),
  //   [ActionTypes.Send]: (
  //     <SendActionLabel action={action as SendActionObject<any, any>} />
  //   ),
  //   [ActionTypes.Log]: (
  //     <LogActionLabel action={action as LogAction<any, any>} />
  //   ),
  //   [ActionTypes.Cancel]: <CancelActionLabel action={action as CancelAction} />,
  //   [ActionTypes.Stop]: (
  //     <StopActionLabel action={action as StopAction<any, any>} />
  //   ),
  //   [ActionTypes.Choose]: (
  //     <ChooseActionLabel action={action as ChooseAction<any, any>} />
  //   ),
  // }[action.type] ?? <CustomActionLabel action={action} />;

  return (
    <div data-viz="action" data-viz-action={kind}>
      <CustomActionLabel action={action} />
    </div>
  );
};
