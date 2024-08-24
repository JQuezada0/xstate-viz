import { getSimplePaths } from "~/simplePaths";
import { getShortestPaths } from "~/shortestPaths";
import { EventObject, Snapshot } from "xstate";
import { PathGenerator } from "~/types";

export const createShortestPathsGen =
  <
    TSnapshot extends Snapshot<unknown>,
    TEvent extends EventObject,
    TInput,
  >(): PathGenerator<TSnapshot, TEvent, TInput> =>
  (logic, defaultOptions) => {
    const paths = getShortestPaths(logic, defaultOptions);

    return paths;
  };

export const createSimplePathsGen =
  <
    TSnapshot extends Snapshot<unknown>,
    TEvent extends EventObject,
    TInput,
  >(): PathGenerator<TSnapshot, TEvent, TInput> =>
  (logic, defaultOptions) => {
    const paths = getSimplePaths(logic, defaultOptions);

    return paths;
  };
