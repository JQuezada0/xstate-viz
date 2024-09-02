import { Actor } from "xstate";
import { createActorContext } from "@xstate/react";
import { simulationMachine } from "./simulationMachine";
import { createInterpreterContext } from "./utils";
import { SimulationMode } from "./types";

const [SimulationProvider, useSimulation, createSimulationSelector] =
  createInterpreterContext<Actor<typeof simulationMachine>>("Simulation");

const SimulationContext = createActorContext(simulationMachine);

export { SimulationProvider, useSimulation, SimulationContext };

export const useSimulationMode = createSimulationSelector<SimulationMode>(
  (state) => (state.hasTag("inspecting") ? "inspecting" : "visualizing"),
);

export const useSimulationMode2 = () =>
  SimulationContext.useSelector(
    (state): SimulationMode =>
      state.hasTag("inspecting") ? "inspecting" : "visualizing",
  );
