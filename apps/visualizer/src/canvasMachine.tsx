import { sendTo, setup, assign, EventFromLogic, raise } from "xstate";
// import { createModel } from 'xstate/lib/model';
// import { ModelEventsFrom } from 'xstate/lib/model.types';
import { StateElkNode } from "./graphUtils";
// import { localCache } from './localCache';
import { EmbedContext, Point } from "./types";

export enum ZoomFactor {
  slow = 1.09,
  normal = 1.15,
}

const initialPosition = {
  zoom: 1,
  viewbox: {
    minX: 0,
    minY: 0,
  },
  canvasPanelPosition: {
    offsetY: 50,
    offsetX: 0,
    width: 0,
    height: 0,
  },
};

export const canvasMachineInitialContext = {
  ...initialPosition,
  elkGraph: undefined as StateElkNode | undefined,
  embed: undefined as EmbedContext | undefined,
};

export interface Viewbox {
  minX: number;
  minY: number;
}

const LONG_PAN = 50;
const SHORT_PAN = 10;

export type CanvasMachineEvent =
  | {
      type: "ZOOM.OUT";
      zoomFactor?: number
      point?: Point
    }
  | {
      type: "ZOOM.IN";
      zoomFactor?: number
      point?: Point
    }
  | {
      type: "POSITION.RESET";
    }
  | { type: "PAN"; dx: number, dy: number }
  | {
      type: "PAN.LEFT";
      isLongPan: boolean
    }
  | {
      type: "PAN.RIGHT";
      isLongPan: boolean
    }
  | {
      type: "PAN.UP";
      isLongPan: boolean
    }
  | {
      type: "PAN.DOWN";
      isLongPan: boolean
    }
  | {
      type: "SOURCE_CHANGED";
    }
  | {
      type: "CANVAS_RECT_CHANGED";
      offsetY: number;
      offsetX: number;
      width: number;
      height: number;
    }
  | {
      type: "elkGraph.UPDATE";
      elkGraph: StateElkNode | undefined;
    }
  | {
      type: "FIT_TO_CONTENT";
    };

export const canvasModel = setup({
  types: {
    events: {} as CanvasMachineEvent,
    context: {} as typeof canvasMachineInitialContext
  },
  // events: {
  //   'ZOOM.OUT': (point?: Point, zoomFactor?: ZoomFactor) => ({
  //     zoomFactor,
  //     point,
  //   }),
  //   'ZOOM.IN': (point?: Point, zoomFactor?: ZoomFactor) => ({
  //     zoomFactor,
  //     point,
  //   }),
  //   'POSITION.RESET': () => ({}),
  //   PAN: (dx: number, dy: number) => ({ dx, dy }),
  //   'PAN.LEFT': (isLongPan?: boolean) => ({ isLongPan }),
  //   'PAN.RIGHT': (isLongPan?: boolean) => ({ isLongPan }),
  //   'PAN.UP': (isLongPan?: boolean) => ({ isLongPan }),
  //   'PAN.DOWN': (isLongPan?: boolean) => ({ isLongPan }),
  //   /**
  //    * Occurs when a source changed id
  //    */
  //   SOURCE_CHANGED: (id: string | null) => ({
  //     id,
  //   }),
  //   CANVAS_RECT_CHANGED: (
  //     offsetY: number,
  //     offsetX: number,
  //     width: number,
  //     height: number,
  //   ) => ({
  //     offsetX,
  //     offsetY,
  //     width,
  //     height,
  //   }),
  //   'elkGraph.UPDATE': (elkGraph: StateElkNode) => ({ elkGraph }),
  //   FIT_TO_CONTENT: () => ({}),
  // },
});

const DEFAULT_ZOOM_IN_FACTOR = ZoomFactor.normal;
// exactly reversed factor so zooming in & out results in the same zoom values
const calculateZoomOutFactor = (zoomInFactor: ZoomFactor = ZoomFactor.normal) =>
  1 / zoomInFactor;
const MAX_ZOOM_OUT_FACTOR = 0.1;

const MAX_ZOOM_IN_FACTOR = 2;

export const canZoom = (embed?: EmbedContext) => {
  return !embed?.isEmbedded || embed.zoom;
};

export const canZoomOut = (ctx: typeof canvasMachineInitialContext) => {
  return ctx.zoom > MAX_ZOOM_OUT_FACTOR;
};

export const canZoomIn = (ctx: typeof canvasMachineInitialContext) => {
  return ctx.zoom < MAX_ZOOM_IN_FACTOR;
};

export const canPan = (ctx: typeof canvasMachineInitialContext) => {
  return !ctx.embed?.isEmbedded || (ctx.embed.isEmbedded && ctx.embed.pan);
};

const getCanvasCenterPoint = ({
  canvasPanelPosition,
}: typeof canvasMachineInitialContext): Point => ({
  x: canvasPanelPosition.offsetX + canvasPanelPosition.width / 2,
  y: canvasPanelPosition.offsetY + canvasPanelPosition.height / 2,
});

const getNewZoomAndViewbox = (
  ctx: typeof canvasMachineInitialContext,
  {
    translationPoint = getCanvasCenterPoint(ctx),
    zoomFactor,
  }: { translationPoint?: Point; zoomFactor: number },
): { zoom: number; viewbox: Viewbox } => {
  const prevZoomValue = ctx.zoom;
  const prevViewbox = ctx.viewbox;
  const newZoomValue = ctx.zoom * zoomFactor;

  const canvasPoint = {
    x: translationPoint.x - ctx.canvasPanelPosition.offsetX,
    y: translationPoint.y - ctx.canvasPanelPosition.offsetY,
  };

  /**
   * based on the implementation from:
   *
   * https://github.com/excalidraw/excalidraw/blob/10cd6a24b0d5715d25ad413784a4b5b57f500b79/src/scene/zoom.ts
   */
  return {
    zoom: newZoomValue,
    viewbox: {
      minX:
        (canvasPoint.x + prevViewbox.minX) * (newZoomValue / prevZoomValue) -
        canvasPoint.x,
      minY:
        (canvasPoint.y + prevViewbox.minY) * (newZoomValue / prevZoomValue) -
        canvasPoint.y,
    },
  };
};

export const canvasMachine = canvasModel.createMachine({
  context: canvasMachineInitialContext,
  actions: {
    persistPositionToLocalStorage: assign(({ context }) => {
      // TODO: This can be more elegant when we have system actor
      const { zoom, viewbox, embed } = context.context;
      if (!embed?.isEmbedded) {
        // localCache.savePosition(sourceID, { zoom, viewbox });
      }
    }),
  },
  on: {
    CANVAS_RECT_CHANGED: {
      actions: assign(({ context: ctx, event: e }) => {
        return {
          canvasPanelPosition: {
            offsetY: e.offsetY,
            offsetX: e.offsetX,
            height: e.height,
            width: e.width,
          },
        };
      }),
    },
    "ZOOM.OUT": {
      actions: assign(({ context: ctx, event: e }) => {
        return getNewZoomAndViewbox(ctx, {
          translationPoint: e.point,
          zoomFactor: calculateZoomOutFactor(e.zoomFactor),
        });
      }),
      guard: ({ context }) =>
        canZoom(context.embed) && canZoomOut(context),
      target: ".throttling",
      // internal: false,
    },
    "ZOOM.IN": {
      actions: assign(({ context: ctx, event: e }) => {
        return getNewZoomAndViewbox(ctx, {
          translationPoint: e.point,
          zoomFactor: e.zoomFactor || DEFAULT_ZOOM_IN_FACTOR,
        });
      }),
      guard: ({ context: ctx }) => canZoom(ctx.embed) && canZoomIn(ctx),
      target: ".throttling",
      // internal: false,
    },
    PAN: {
      actions: assign({
        viewbox: ({ context: ctx, event: e }) => {
          return {
            minX: ctx.viewbox.minX + e.dx,
            minY: ctx.viewbox.minY + e.dy,
          };
        },
      }),
      guard: ({ context: ctx }) => canPan(ctx),
      target: ".throttling",
      // internal: false,
    },
    "PAN.LEFT": {
      actions: assign({
        viewbox: ({ context: ctx, event: e }) => ({
          minX: ctx.viewbox.minX - (e.isLongPan ? LONG_PAN : SHORT_PAN),
          minY: ctx.viewbox.minY,
        }),
      }),
      target: ".throttling",
      // internal: false,
    },
    "PAN.RIGHT": {
      actions: assign({
        viewbox: ({ context: ctx, event: e }) => ({
          minX: ctx.viewbox.minX + (e.isLongPan ? LONG_PAN : SHORT_PAN),
          minY: ctx.viewbox.minY,
        }),
      }),
      target: ".throttling",
      // internal: false,
    },
    "PAN.UP": {
      actions: assign({
        viewbox: ({ context: ctx, event: e }) => ({
          minX: ctx.viewbox.minX,
          minY: ctx.viewbox.minY - (e.isLongPan ? LONG_PAN : SHORT_PAN),
        }),
      }),
      target: ".throttling",
      // internal: false,
    },
    "PAN.DOWN": {
      actions: assign({
        viewbox: ({ context: ctx, event: e }) => ({
          minX: ctx.viewbox.minX,
          minY: ctx.viewbox.minY + (e.isLongPan ? LONG_PAN : SHORT_PAN),
        }),
      }),
      target: ".throttling",
      // internal: false,
    },
    "POSITION.RESET": {
      actions: assign({
        zoom: canvasMachineInitialContext.zoom,
        viewbox: canvasMachineInitialContext.viewbox,
      }),
      target: ".throttling",
      // internal: false,
    },
    SOURCE_CHANGED: {
      target: ".throttling",
      // internal: false,
      actions: assign(({ context, event }) => {
        // TODO: This can be more elegant when we have system actor
        if (!context.embed?.isEmbedded) {
          const position = getPositionFromEvent(event);

          if (!position) return {};

          return position;
        }
        return {};
      }),
    },
    "elkGraph.UPDATE": {
      actions: [
        assign({
          elkGraph: ({ context, event: e }) => e.elkGraph,
        }),
        raise({
          type: "FIT_TO_CONTENT"
        }),
      ],
    },
    FIT_TO_CONTENT: {
      actions: [
        assign({
          zoom: ({ context: ctx }) => {
            if (!ctx.elkGraph) return ctx.zoom;
            return (
              Math.min(
                ctx.canvasPanelPosition.width / ctx.elkGraph.width!,
                ctx.canvasPanelPosition.height / ctx.elkGraph.height!,
                MAX_ZOOM_IN_FACTOR,
              ) * 0.9 // Ensure machine does not touch sides
            );
          },
        }),
        assign({
          viewbox: ({ context: ctx, event: e }) => {
            if (!ctx.elkGraph) return ctx.viewbox;
            return {
              minX:
                (ctx.elkGraph.width! * ctx.zoom) / 2 -
                ctx.canvasPanelPosition.width / 2,
              minY:
                (ctx.elkGraph.height! * ctx.zoom) / 2 -
                ctx.canvasPanelPosition.height / 2,
            };
          },
        }),
      ],
    },
  },
  initial: "idle",
  states: {
    idle: {},
    throttling: {
      after: {
        300: "saving",
      },
      meta: {
        description: `
          Throttling a moment before saving to ensure
          we don't do too much saving to localStorage
        `,
      },
    },
    saving: {
      always: {
        actions: "persistPositionToLocalStorage",
        target: "idle",
      },
    },
  },
});

// const getPositionFromEvent = (event: ModelEventsFrom<typeof canvasModel>) => {
//   if (event.type !== 'SOURCE_CHANGED') return null;

//   const position = localCache.getPosition(event.id);
//   return position;
// };

const getPositionFromEvent = (event: EventFromLogic<typeof canvasMachine>) => {
  return initialPosition;
};
