import { DirectedGraphNode } from './directedGraph';
import { useMachine } from '@xstate/react';
import { useEffect, useMemo, memo } from 'react';
import { Edges } from './Edges';
import { StateNodeViz } from './StateNodeViz';
import { TransitionViz } from './TransitionViz';
import { elkMachine } from './elkMachine';
import { MachineViz } from './MachineViz';
import { SimulationContext } from './SimulationContext';
import { getAllEdges, StateElkNode } from './graphUtils';
import { CanvasContext } from './useInterpretCanvas';

const GraphNode: React.FC<{ elkNode: StateElkNode }> = ({ elkNode }) => {
  return <StateNodeViz stateNode={elkNode.node.data} node={elkNode.node} />;
};

const MemoizedEdges = memo(Edges);
const MemoizedGraphNode = memo(GraphNode);
const MemoizedTransitionViz = memo(TransitionViz);
const MemoizedMachineViz = memo(MachineViz);

export const Graph: React.FC<{ digraph: DirectedGraphNode }> = ({
  digraph,
}) => {
  // console.log("DIGRAPH!!", digraph)
  const sim = SimulationContext.useActorRef() // useSimulation();
  const [state, send, actor] = useMachine(elkMachine, {
    input: {
      digraph,
      sim,
    }
  })

  useEffect(() => {
    sim.start()
    // elkMachine.start()
  }, [])

  // const state = elkMachine.getSnapshot()
  // const [state, send] = useActor(elkMachine);

  // const canvasService = useCanvas();
  const canvasService = CanvasContext.useActorRef();
  const { viewbox, zoom } = CanvasContext.useSelector((s) => s.context);

  useEffect(() => {
    // console.log("SEND GRAPH UPDATED!")
    actor.send({ type: 'GRAPH_UPDATED', digraph });
  }, [digraph]);

  // state.context.

  console.log("STATE!", state)

  useEffect(() => {
    // Let canvas service know that the elk graph updated for zoom-to-fit, centering, etc.
    canvasService.send({
      type: 'elkGraph.UPDATE',
      elkGraph: state.context.elkGraph!,
    });
  }, [state?.context?.elkGraph]);

  const allEdges = useMemo(() => getAllEdges(digraph), [digraph]);

  console.log("STATE!!!", state, {
    isSuccess: state.matches("success")
  })

  if (state.matches("success")) {
    console.log("GRAPH IS IN SUCCESS!")
    return (
      <div
        data-testid="canvas-graph"
        style={{
          transformOrigin: '0 0',
          // Since our layout is LTR, it's more predictable for zoom to happen from top left point
          transform: `translate3d(${-viewbox.minX}px, ${-viewbox.minY}px, 0) scale(${zoom})`,
        }}
      >
        <MemoizedEdges digraph={digraph} />
        <MemoizedGraphNode
          elkNode={
            // Get the machine node, not the root node
            state.context.elkGraph!
          }
        />
        {allEdges.map((edge, i) => {
          return (
            <MemoizedTransitionViz
              edge={edge}
              key={edge.id}
              index={i}
              position={
                edge.label && {
                  x: edge.label.x,
                  y: edge.label.y,
                }
              }
            />
          );
        })}
      </div>
    );
  }

  return <MemoizedMachineViz digraph={digraph} />;
};
