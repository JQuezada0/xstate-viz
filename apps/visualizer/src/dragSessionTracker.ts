import {
  assign,
  sendParent,
  ContextFrom,
  SpecialTargets,
  setup,
  forwardTo,
  fromCallback,
} from "xstate";
import { Point } from "./types";

export interface DragSession {
  pointerId: number;
  point: Point;
}

export interface PointDelta {
  x: number;
  y: number;
}

type DragSessionContext = {
  session: DragSession | null;
  ref: React.MutableRefObject<HTMLElement> | null;
};

export const dragSessionModel = setup({
  types: {
    input: {} as DragSessionContext,
    context: {} as DragSessionContext,
    events: {} as
      | ({ type: "DRAG_SESSION_STARTED" } & Pick<
          DragSession,
          "pointerId" | "point"
        >)
      | { type: "DRAG_SESSION_STOPPED" }
      | ({ type: "DRAG_POINT_MOVED" } & Pick<DragSession, "point">),
  },
  actions: {
    capturePointer: ({ event }, { ref, session }: DragSessionContext) => {
      ref!.current!.setPointerCapture(event!.pointerId || session?.pointerId);
    },
    releasePointer: ({ event }, { ref, session }: DragSessionContext) => {
      ref!.current!.releasePointerCapture(session!.pointerId);
    },
    setSessionData: assign({
      session: ({ context, event }) => {
        if ("pointerId" in event && event.point)
          return {
            pointerId: event.pointerId,
            point: event.point,
          };

        return context.session;
      },
    }),
    clearSessionData: assign({
      session: null,
    }) as any,
    updatePoint: assign({
      session: ({ context: ctx, event: ev }) => ({
        ...ctx.session!,
        point: ev.point,
      }),
    }),
    sendPointDelta: sendParent(({ context, event }) => ({
      type: "POINTER_MOVED_BY",
      delta: {
        x: event.point.x - context.session!.point.x,
        y: event.point.y - context.session!.point.y,
      },
    })) as any,
  },
});

export const dragSessionTracker = dragSessionModel.createMachine({
  preserveActionOrder: true,
  initial: "check_session_data",
  states: {
    check_session_data: {
      always: [
        {
          guard: ({ context: ctx }) => !!ctx.session,
          target: "active",
          actions: sendParent((ctx) => ({
            type: "DRAG_SESSION_STARTED",
            pointerId: ctx.session.pointerId,
            point: ctx.session.point,
          })),
        },
        "idle",
      ],
    },
    idle: {
      invoke: {
        id: "dragSessionStartedListener",
        input: ({ context }) => context,
        src: fromCallback(({ sendBack, input }) => {
          console.log("IN", input, i)
          const { ref } = input;
          const node = ref!.current!;
          const listener = (ev: PointerEvent) => {
            const isMouseLeftButton = ev.button === 0;
            if (isMouseLeftButton) {
              sendBack({
                type: "DRAG_SESSION_STARTED",
                data: {
                  pointerId: ev.pointerId,
                  point: {
                    x: ev.pageX,
                    y: ev.pageY,
                  },
                },
              });
            }
          };
          node.addEventListener("pointerdown", listener);
          return () => node.removeEventListener("pointerdown", listener);
        }),
      },
      on: {
        DRAG_SESSION_STARTED: {
          target: "active",
          actions: forwardTo(SpecialTargets.Parent),
        },
      },
    },
    active: {
      entry: [
        "setSessionData",
        {
          name: "capturePointer",
          input: ({ context }) => context,
        },
      ],
      exit: [
        {

          name: "releasePointer",
          input: ({ context }) => context,
        },
        "clearSessionData",
      ],
      invoke: {
        id: "dragSessionListeners",
        src: fromCallback(({ sendBack, self }) => {
          
          const { ref, session } = context
          const node = ref!.current!;

          const moveListener = (ev: PointerEvent) => {
            if (ev.pointerId !== session!.pointerId) {
              return;
            }
            sendBack({
              type: "DRAG_POINT_MOVED",
              point: { x: ev.pageX, y: ev.pageY },
            });
          };
          const stopListener = (ev: PointerEvent) => {
            if (ev.pointerId !== session!.pointerId) {
              return;
            }
            sendBack({
              type: "DRAG_SESSION_STOPPED",
            });
          };
          node.addEventListener("pointermove", moveListener);
          node.addEventListener("pointerup", stopListener);
          node.addEventListener("pointercancel", stopListener);

          return () => {
            node.removeEventListener("pointermove", moveListener);
            node.removeEventListener("pointerup", stopListener);
            node.removeEventListener("pointercancel", stopListener);
          };
        }),
      },
      on: {
        DRAG_POINT_MOVED: {
          actions: ["sendPointDelta", "updatePoint"],
        },
        DRAG_SESSION_STOPPED: {
          target: "idle",
          actions: forwardTo(SpecialTargets.Parent),
        },
      },
    },
  },
});
