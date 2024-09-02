import { AnyActorRef, assign, fromPromise, setup, Actor } from 'xstate';
import { DirectedGraphNode } from './directedGraph';
import { getElkGraph, StateElkNode } from './graphUtils';
// import { useSimulation } from './SimulationContext';
import { SimMachineEventType, simulationMachine } from './simulationMachine';
import { ElkNode } from 'elkjs';

export const elkMachine = setup(
    {
      types: {
        input: {} as {
          digraph: DirectedGraphNode,
          sim: Actor<typeof simulationMachine>
        },
        context: {} as {
          digraph: DirectedGraphNode,
          elkGraph: StateElkNode | undefined,
          sim: Actor<typeof simulationMachine>
        },
        events: {} as {
          type: "GRAPH_UPDATED",
          digraph: DirectedGraphNode
        }
      },
      actions: {
        notifyLayoutPending: ({ context }) => {
          console.log("NOTIFY LAYOUT PENDING")

          context.sim.send({
            type: SimMachineEventType.LayoutPending
          });
        },
        notifyLayoutReady: ({ context }) => {
          console.log("NOTIFY LAYOUT READY")
          context.sim.send({
            type: SimMachineEventType.LayoutReady
          });
        },
      },
      actors: {
        buildElkGraph: fromPromise<ElkNode, DirectedGraphNode>(async ({ input }) => {
          console.log("BUILD GRAPH!")
          const elkGraph = await getElkGraph(input)

          console.log("CONSTRUCTED ELK GRAPH!", elkGraph)

          return elkGraph
        })
      },
    }
  ).createMachine({
    context: ({ input }) => ({
      digraph: input.digraph,
      sim: input.sim,
      elkGraph: undefined,
    }),
    initial: 'loading',
    states: {
      loading: {
        entry: 'notifyLayoutPending',
        invoke: {
          src: "buildElkGraph",
          input: ({ context }) => context.digraph,
          onDone: {
            target: 'success',
            actions: [
              assign({
                elkGraph: ({ event: e, context }) => (e.output.children[0] as StateElkNode),
              }),
              'notifyLayoutReady',
            ],
          },
        },
      },
      success: {
        on: {
          GRAPH_UPDATED: {
            target: 'loading',
            actions: [
              ({ event }) => {
                console.log("GOT GRAOH UPDATED EVENT!", event.digraph)
              },
              assign({
                digraph: ({ event: e }) => e.digraph,
              }),
            ],
          },
        },
      },
    },
  });
