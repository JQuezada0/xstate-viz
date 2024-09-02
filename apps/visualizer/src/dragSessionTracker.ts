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

export const dragSessionModel = setup({
  types: {
    context: {
      session: null as DragSession | null,
      ref: null as React.MutableRefObject<HTMLElement> | null,
    },
    events: {} as
      | ({ type: "DRAG_SESSION_STARTED" } & Pick<
          DragSession,
          "pointerId" | "point"
        >)
      | { type: "DRAG_SESSION_STOPPED" }
      | ({ type: "DRAG_POINT_MOVED" } & Pick<DragSession, "point">),
  },
});

export const dragSessionTracker = dragSessionModel.createMachine(
  {
    preserveActionOrder: true,
    initial: "check_session_data",
    actions: {
      capturePointer: ({ ref, session }) =>
        ref!.current!.setPointerCapture(ev!.pointerId || session?.pointerId),
      releasePointer: ({ ref, session }) =>
        ref!.current!.releasePointerCapture(session!.pointerId),
      setSessionData: assign({
        session: ({ context: ctx, event: ev }) => {
          if ("pointerId" in ev && ev.point)
            return {
              pointerId: ev.pointerId,
              point: ev.point,
            };
          return ctx.session;
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
      sendPointDelta: sendParent(
        (
          ctx: ContextFrom<typeof dragSessionModel>,
          ev: ReturnType<typeof dragSessionModel.events.DRAG_POINT_MOVED>,
        ) => ({
          type: "POINTER_MOVED_BY",
          delta: {
            x: ev.point.x - ctx.session!.point.x,
            y: ev.point.y - ctx.session!.point.y,
          },
        }),
      ) as any,
    },
    states: {
      check_session_data: {
        always: [
          {
            guard: ({ context: ctx }) => !!ctx.session,
            target: "active",
            actions: sendParent((ctx) => ({
              type: "DRAG_SESSION_STARTED",
              pointerId: ctx.session.pointerId,
              point: ctz.session.point,
            })),
          },
          "idle",
        ],
      },
      idle: {
        invoke: {
          id: "dragSessionStartedListener",
          src: fromCallback(({ sendBack, ref }) => {
            const node = ref!.current!;
            const listener = (ev: PointerEvent) => {
              const isMouseLeftButton = ev.button === 0;
              if (isMouseLeftButton) {
                sendBack(
                  dragSessionModel.events.DRAG_SESSION_STARTED({
                    pointerId: ev.pointerId,
                    point: {
                      x: ev.pageX,
                      y: ev.pageY,
                    },
                  }),
                );
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
        entry: ["capturePointer", "setSessionData"],
        exit: ["releasePointer", "clearSessionData"],
        invoke: {
          id: "dragSessionListeners",
          src: fromCallback(({ sendBack, ref, session }) => {
            const node = ref!.current!;

            const moveListener = (ev: PointerEvent) => {
              if (ev.pointerId !== session!.pointerId) {
                return;
              }
              sendBack(
                dragSessionModel.events.DRAG_POINT_MOVED({
                  point: { x: ev.pageX, y: ev.pageY },
                }),
              );
            };
            const stopListener = (ev: PointerEvent) => {
              if (ev.pointerId !== session!.pointerId) {
                return;
              }
              sendBack(dragSessionModel.events.DRAG_SESSION_STOPPED());
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
  }
);
