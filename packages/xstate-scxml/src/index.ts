import { Attributes, Element as XMLElement, js2xml } from "xml-js";
import {
  AnyStateMachine,
  StateNode,
  TransitionDefinition,
  UnknownAction,
} from "xstate";

export type { SCXML } from "./scxml"

export function flatten<T>(array: Array<T | T[]>): T[] {
  return ([] as T[]).concat(...array);
}

function cleanAttributes(attributes: Attributes): Attributes {
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) {
      delete attributes[key];
    }
  }

  return attributes;
}

// tslint:disable-next-line:ban-types
export function functionToExpr(fn: Function): string {
  return fn.toString();
}

function raiseActionToSCXML(raiseAction: any): XMLElement {
  return {
    type: "element",
    name: "raise",
    attributes: {
      event: raiseAction.event.type,
    },
  };
}

function actionToSCXML(action: UnknownAction): XMLElement {
  if ((action as any).type === "xstate.raise") {
    return raiseActionToSCXML(action);
  }

  return {
    type: "element",
    name: "script",
    elements: [
      {
        type: "text",
        text: JSON.stringify(action),
      },
    ],
  };
}

export function transitionToSCXML(
  transition: TransitionDefinition<any, any>,
): XMLElement {
  const elements = transition.actions.map(actionToSCXML);

  return {
    type: "element",
    name: "transition",
    attributes: cleanAttributes({
      event: transition.eventType,
      guard:
        typeof transition.guard === "function"
          ? functionToExpr(transition.guard)
          : undefined,
      target: (transition.target || [])
        .map((stateNode) => stateNode.id)
        .join(" "),
      type: !transition.reenter ? "internal" : undefined,
    }),
    elements: elements.length ? elements : undefined,
  };
}

function doneDataToSCXML(data: any): XMLElement {
  return {
    type: "element",
    name: "donedata",
    elements: [
      {
        type: "element",
        name: "content",
        attributes: {
          expr: JSON.stringify(data),
        },
      },
    ],
  };
}

function actionsToSCXML(
  name: "onentry" | "onexit",
  actions: Array<UnknownAction>,
): XMLElement {
  return {
    type: "element",
    name,
    elements: actions.map<XMLElement>((action) => {
      return actionToSCXML(action);
    }),
  };
}

function stateNodeToSCXML(stateNode: StateNode<any, any>): XMLElement {
  const childStates = Object.keys(stateNode.states).map((key) => {
    const childStateNode = stateNode.states[key];

    return stateNodeToSCXML(childStateNode);
  });

  const elements: XMLElement[] = [];

  const { entry, exit } = stateNode;

  if (entry.length) {
    elements.push(actionsToSCXML("onentry", entry));
  }

  if (exit.length) {
    elements.push(actionsToSCXML("onexit", exit));
  }

  const transitionElements = flatten(
    Object.keys(stateNode.on).map((event) => {
      const transitions = stateNode.on[event];

      return transitions.map((transition) => transitionToSCXML(transition));
    }),
  );

  elements.push(...transitionElements);
  elements.push(...childStates);

  if (stateNode.type === "final" && stateNode.output) {
    elements.push(doneDataToSCXML(stateNode.output));
  }

  return {
    type: "element",
    name:
      stateNode.type === "parallel"
        ? "parallel"
        : stateNode.type === "final"
        ? "final"
        : "state",
    attributes: {
      id: stateNode.id,
      ...(stateNode.initial.target.length && {
        initial: stateNode.initial.target.map((s) => s.id).join(" "),
      }),
    },
    elements,
  };
}

export function toSCXML(machine: AnyStateMachine): string {
  const { states, initial } = machine.root;

  const elements = Object.keys(states).map<XMLElement>((key) => {
    const stateNode = states[key];

    return stateNodeToSCXML(stateNode);
  });

  return js2xml(
    {
      elements: [
        {
          type: "element",
          name: "scxml",
          attributes: {
            xmlns: "http://www.w3.org/2005/07/scxml",
            initial: initial.target.map((s) => s.id).join(" "),
            // 'xmlns:xi': 'http://www.w3.org/2001/XInclude',
            version: "1.0",
            datamodel: "ecmascript",
          },
          elements,
        },
      ],
    },
    {
      spaces: 2,
    },
  );
}
