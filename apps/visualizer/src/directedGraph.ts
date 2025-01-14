import type { ElkExtendedEdge } from "elkjs";
import { StateNode, TransitionDefinition } from "xstate";
import { Point } from "./pathUtils";
import { getChildren } from "./utils";
import { flatten } from "@xstate/scxml";

export type DirectedGraphLabel = {
  text: string;
  x: number;
  y: number;
};
export type DirectedGraphPort = {
  id: string;
};
export type DirectedGraphEdgeConfig = {
  id: string;
  source: StateNode;
  target: StateNode;
  label: DirectedGraphLabel;
  transition: TransitionDefinition<any, any>;
  sections: ElkExtendedEdge["sections"];
};
export type DirectedGraphNodeConfig = {
  id: string;
  stateNode: StateNode;
  children: DirectedGraphNode[];
  ports: DirectedGraphPort[];
  /**
   * The edges representing all transitions from this `stateNode`.
   */
  edges: DirectedGraphEdge[];
};

export class DirectedGraphNode {
  public id: string;
  public data: StateNode;
  public children: DirectedGraphNode[];
  public ports: DirectedGraphPort[];
  public edges: DirectedGraphEdge[];

  /**
   * The position of the graph node (relative to parent)
   * and its dimensions
   */
  public layout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /**
   * Gets the absolute position of the graph node
   */
  public get absolute(): Point | undefined {
    if (!this.parent) {
      return this.layout;
    }

    if (!this.layout) {
      return undefined;
    }

    return {
      x: this.layout.x + this.parent.absolute!.x,
      y: this.layout.y + this.parent.absolute!.y,
    };
  }

  constructor(
    config: DirectedGraphNodeConfig,
    public parent?: DirectedGraphNode | undefined,
  ) {
    this.id = config.id;
    this.data = config.stateNode;
    this.children = config.children;
    this.children.forEach((child) => {
      child.parent = this;
    });
    this.ports = config.ports;
    this.edges = config.edges.map((edgeConfig) => {
      return new DirectedGraphEdge(edgeConfig);
    });
  }

  public get level(): number {
    return (this.parent?.level ?? -1) + 1;
  }
}

export class DirectedGraphEdge {
  public id: string;
  public source: StateNode;
  public target: StateNode;
  public label: DirectedGraphLabel;
  public transition: TransitionDefinition<any, any>;
  public sections: ElkExtendedEdge["sections"];
  constructor(config: DirectedGraphEdgeConfig) {
    this.id = config.id;
    this.source = config.source;
    this.target = config.target;
    this.label = config.label;
    this.transition = config.transition;
    this.sections = config.sections;
  }
}

export function toDirectedGraph(stateNode: StateNode): DirectedGraphNode {
  const transitions = Array.from(stateNode.transitions.entries())

  console.log("TRANSITIONS FOR!:", {
    node: stateNode,
    transitions,
  })

  

  const edges: DirectedGraphEdge[] = flatten(
    transitions.map(([transitionName, transitionDefinition], transitionIndex) => {
      console.log("GET EDGE FROM TRANSITION!!!", transitionName, transitionDefinition)
      return transitionDefinition.map((t) => {
        const targets = t.target ? t.target : [stateNode];

      return targets.map((target, targetIndex) => {
        const edge = new DirectedGraphEdge({
          id: `${stateNode.id}:${transitionIndex}:${targetIndex}`,
          source: stateNode,
          target,
          transition: t,
          label: {
            text: t.eventType,
            x: 0,
            y: 0,
          },
          sections: [],
        });

        return edge;
      });
      })
    }).flat(),
  );

  if (stateNode.config.type === "final" && !transitions.length) {
    edges.push(new DirectedGraphEdge({
      id: stateNode.id,
      source: stateNode,
      target: stateNode,
      transition: {
        actions: [],
        eventType: "",
        reenter: false,
        source: stateNode,
        target: [],
        toJSON() {
            return {} as any
        },
      },
      label: {
        text: stateNode.id,
        x: 0,
        y: 0
      },
      sections: []
    }))
  }

  console.log("EDGES", edges)

  const graph = new DirectedGraphNode({
    id: stateNode.id,
    stateNode,
    children: getChildren(stateNode).map((sn) => toDirectedGraph(sn)),
    edges,
    ports: [],
  });

  return graph;
}

export function getAllNodes(
  rootNode: DirectedGraphNode,
): Array<DirectedGraphNode> {
  if (!rootNode.children.length) {
    return [rootNode];
  }

  return [rootNode].concat(rootNode.children.map(getAllNodes).flat());
}

export type DigraphBackLinkMap = Map<StateNode, Set<DirectedGraphEdge>>;

export function getBackLinkMap(digraph: DirectedGraphNode): DigraphBackLinkMap {
  const nodes = getAllNodes(digraph);
  const backLinkMap: DigraphBackLinkMap = new Map();

  const addMapping = (node: StateNode, edge: DirectedGraphEdge): void => {
    if (!backLinkMap.get(node)) {
      backLinkMap.set(node, new Set());
    }

    backLinkMap.get(node)!.add(edge);
  };

  nodes.forEach((node) => {
    node.edges.forEach((edge) => {
      addMapping(edge.target, edge);
    });
  });

  return backLinkMap;
}
