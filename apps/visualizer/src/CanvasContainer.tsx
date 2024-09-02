import React, { CSSProperties, useEffect, useRef } from 'react';
import { ZoomFactor } from './canvasMachine';
// import { useCanvas } from './CanvasContext';
import { CanvasContext } from './useInterpretCanvas';
import { canvasMachine } from "./canvasMachine"
import { useMachine } from '@xstate/react';
import { AnyState, setup, assign, raise, fromCallback, ActorRef, EventObject, ContextFrom, Actor } from 'xstate';
import { Point } from './pathUtils';
import {
  isAcceptingArrowKey,
  isAcceptingSpaceNatively,
  isTextInputLikeElement,
  isWithPlatformMetaKey,
} from './utils';
import { useEmbed } from './embedContext';
import {
  dragSessionModel,
  dragSessionTracker,
  DragSession,
  PointDelta,
} from './dragSessionTracker';

type DragContext = {
  ref: React.MutableRefObject<HTMLElement> | null
}

const dragModel = setup(
  {
    types: {
      input: {} as DragContext,
      context: {} as DragContext,
      events: {} as 
        (| { type: "LOCK" }
        | { type: "RELEASE" }
        | { type: "ENABLE_PANNING", sessionSeed: DragSession | null }
        | { type: "DISABLE_PANNING" }
        | { type: "ENABLE_PAN_MODE" }
        | { type: "DISABLE_PAN_MODE" }
        | { type: "DRAG_SESSION_STARTED", point: Point }
        | { type: "DRAG_SESSION_STOPPED" }
        | { type: "POINTER_MOVED_BY", delta: PointDelta }
        | { type: "WHEEL_PRESSED", data: DragSession }
        | { type: "WHEEL_RELEASED" })
    },
    actions: {
      disableTextSelection: assign(({ context: ctx }) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'none';

        return ctx
      }),
      enableTextSelection: assign(({ context: ctx }) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'unset';

        return ctx
      }),
      sendPanChange: ({ event }) => {
        // if (event.type === "POINTER_MOVED_BY") {
        //   canvasModel.send({
        //     type: "PAN",
        //     // we need to translate a pointer move to the viewbox move
        //     // and that is going into the opposite direction than the pointer
        //     dx: -event.delta.x,
        //     dy: -event.delta.y,
        //   })
        // }
      },
    },
    actors: {
      wheelPressListener: fromCallback<EventObject, { context: DragContext }>(({ sendBack, input }) => {
        const { context: ctx } = input
        const node = ctx.ref!.current!;
        const listener = (ev: PointerEvent) => {
          if (ev.button === 1) {
            sendBack(
              {
                type: "WHEEL_PRESSED",
                data: {
                  pointerId: ev.pointerId,
                  point: {
                    x: ev.pageX,
                    y: ev.pageY,
                  },
                }
              }
            );
          }
        };
        node.addEventListener('pointerdown', listener);
        return () => node.removeEventListener('pointerdown', listener);
      }),
      invokeDetectLock: fromCallback(({ sendBack }) => {
        function keydownListener(e: KeyboardEvent) {
          const target = e.target as HTMLElement;

          if (e.code === 'Space' && !isAcceptingSpaceNatively(target)) {
            e.preventDefault();
            sendBack({ type: 'LOCK' });
          }
        }

        window.addEventListener('keydown', keydownListener);
        return () => {
          window.removeEventListener('keydown', keydownListener);
        };
      }),
      invokeDetectRelease: fromCallback(({ sendBack }) => {
        // TODO: we should release in more scenarios
        // e.g.:
        // - when the window blurs (without this we might get stuck in the locked state without Space actually being held down)
        // - when unrelated keyboard keys get pressed (without this other actions might be executed while dragging which often might not be desired)
        function keyupListener(e: KeyboardEvent) {
          if (e.code === 'Space') {
            e.preventDefault();
            sendBack({ type: 'RELEASE' });
          }
        }

        window.addEventListener('keyup', keyupListener);
        return () => {
          window.removeEventListener('keyup', keyupListener);
        };
      }),
    }
  }
);

const dragMachine = dragModel.createMachine(
  {
    context: ({ input }) => ({ ref: input.ref }),
    preserveActionOrder: true,
    initial: 'checking_if_disabled',
    actions: {
      disableTextSelection: assign(({ context: ctx }) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'none';
      }),
      enableTextSelection: assign(({ context: ctx }) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'unset';
      }),
    },
    states: {
      checking_if_disabled: {
        always: [
          {
            target: 'permanently_disabled',
            guard: 'isPanDisabled',
          },
          'enabled',
        ],
      },
      permanently_disabled: {},
      enabled: {
        type: 'parallel',
        states: {
          mode: {
            initial: 'lockable',
            states: {
              lockable: {
                initial: 'released',
                states: {
                  released: {
                    invoke: [
                      {
                        src: 'invokeDetectLock',
                      },
                      {
                        src: 'wheelPressListener',
                        input: ({ context }) => ({ context }),
                      },
                    ],
                    on: {
                      LOCK: 'locked',
                      WHEEL_PRESSED: 'wheelPressed',
                    },
                  },
                  locked: {
                    entry: raise({
                      type: "ENABLE_PANNING",
                      sessionSeed: null,
                    }),
                    exit: raise({
                      type: "DISABLE_PANNING",
                    }),
                    on: { RELEASE: 'released' },
                    invoke: {
                      src: 'invokeDetectRelease',
                    },
                  },
                  wheelPressed: {
                    entry: raise((({ context: ctx, event: ev }) => ({
                      type: "ENABLE_PANNING",
                      sessionSeed: ev.sessionSeed
                    }))),
                    exit: raise({
                      type: "DISABLE_PANNING",
                    }),
                    on: {
                      DRAG_SESSION_STOPPED: 'released',
                    },
                  },
                },
                on: {
                  ENABLE_PAN_MODE: 'pan',
                },
              },
              pan: {
                entry: raise({
                  type: "ENABLE_PANNING",
                  sessionSeed: null,
                }),
                exit: raise({
                  type: "DISABLE_PANNING",
                }),
                on: {
                  DISABLE_PAN_MODE: 'lockable',
                },
              },
            },
          },
          panning: {
            initial: 'disabled',
            states: {
              disabled: {
                on: {
                  ENABLE_PANNING: 'enabled',
                },
              },
              enabled: {
                entry: 'disableTextSelection',
                exit: 'enableTextSelection',
                invoke: {
                  id: 'dragSessionTracker',
                  src: ({ context: ctx, event: ev }) =>
                    dragSessionTracker.withContext({
                      // ...dragSessionModel.initialContext,
                      ref: ctx.ref,
                      session:
                        // this is just defensive programming
                        // this really should receive ENABLE_PANNING at all times as this is the event that is making this state to be entered
                        // however, raised events are not given to invoke creators so we have to fallback handling WHEEL_PRESSED event
                        // in reality, because of this issue, ENABLE_PANNING that we can receive here won't ever hold any `sessionSeed` (as that is only coming from the wheel-oriented interaction)
                        ev.type === 'ENABLE_PANNING'
                          ? ev.sessionSeed
                          : (
                              ev as Extract<
                                typeof ev,
                                { type: 'WHEEL_PRESSED' }
                              >
                            ).data,
                    }),
                },
                on: {
                  DISABLE_PANNING: 'disabled',
                },
                initial: 'idle',
                states: {
                  idle: {
                    meta: {
                      cursor: 'grab',
                    },
                    on: {
                      DRAG_SESSION_STARTED: 'active',
                    },
                  },
                  active: {
                    initial: 'grabbed',
                    on: {
                      DRAG_SESSION_STOPPED: '.done',
                    },
                    states: {
                      grabbed: {
                        meta: {
                          cursor: 'grabbing',
                        },
                        on: {
                          POINTER_MOVED_BY: {
                            target: 'dragging',
                            actions: 'sendPanChange',
                          },
                        },
                      },
                      dragging: {
                        meta: {
                          cursor: 'grabbing',
                        },
                        on: {
                          POINTER_MOVED_BY: { 
                            actions: 'sendPanChange',
                          },
                        },
                      },
                      done: {
                        type: 'final',
                      },
                    },
                    onDone: 'idle',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
);

const getCursorByState = (state: AnyState) => {
  const meta = state.getMeta()
  return (
    Object.values(meta).find((m) =>
      Boolean((m as { cursor?: CSSProperties['cursor'] }).cursor),
    ) as { cursor?: CSSProperties['cursor'] }
  )?.cursor;
}

export const CanvasContainer: React.FC<{ panModeEnabled: boolean; children: React.ReactNode; canvasModel: Actor<typeof canvasMachine> }> = ({
  children,
  panModeEnabled,
  canvasModel,
}) => {
  const canvasService = CanvasContext.useActorRef();
  const embed = useEmbed();
  const canvasRef = useRef<HTMLDivElement>(null!);

  const [state, send] = useMachine(dragMachine.provide({
    actions: {
      sendPanChange: ({ event }) => {
        if (event.type === "POINTER_MOVED_BY") {
          canvasModel.send({
            type: "PAN",
            // we need to translate a pointer move to the viewbox move
            // and that is going into the opposite direction than the pointer
            dx: -event.delta.x,
            dy: -event.delta.y,
          })
        }
      },
    },
    guards: {
      isPanDisabled: () => !!embed?.isEmbedded && !embed.pan,
    },
  }), {
    input: {
      // ...dragModel.initialContext,
      ref: canvasRef,
    }
  });

  React.useEffect(() => {
    if (panModeEnabled) {
      send({ type: "ENABLE_PAN_MODE" });
    } else {
      send({ type: "DISABLE_PAN_MODE" });
    }
  }, [panModeEnabled]);

  /**
   * Observes the canvas's size and reports it to the canvasService
   */
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      // entry contains `contentRect` but we are interested in the `clientRect`
      // height/width are going to be the same but not the offsets
      const clientRect = entry.target.getBoundingClientRect();

      canvasService.send({
        type: 'CANVAS_RECT_CHANGED',
        height: clientRect.height,
        width: clientRect.width,
        offsetX: clientRect.left,
        offsetY: clientRect.top,
      });
    });

    resizeObserver.observe(canvasRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasService]);

  useEffect(() => {
    function keydownListener(e: KeyboardEvent) {
      const target = e.target as HTMLElement | SVGElement;

      if (isTextInputLikeElement(target)) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          if (isAcceptingArrowKey(target)) {
            return;
          }
          e.preventDefault();
          canvasService.send(canvasModel.events['PAN.DOWN'](e.shiftKey));
          return;
        case 'ArrowLeft':
          if (isAcceptingArrowKey(target)) {
            return;
          }
          e.preventDefault();
          canvasService.send(canvasModel.events['PAN.RIGHT'](e.shiftKey));
          return;
        case 'ArrowDown':
          if (isAcceptingArrowKey(target)) {
            return;
          }
          e.preventDefault();
          canvasService.send(canvasModel.events['PAN.UP'](e.shiftKey));
          return;
        case 'ArrowRight':
          if (isAcceptingArrowKey(target)) {
            return;
          }
          e.preventDefault();
          canvasService.send(canvasModel.events['PAN.LEFT'](e.shiftKey));
          return;
        // can come from numpad
        case '+':
        // this corresponds to the =/+ key, we expect it to be pressed without a Shift
        case '=':
          // allow to zoom the whole page
          if (isWithPlatformMetaKey(e)) {
            return;
          }
          if (e.shiftKey) {
            return;
          }
          e.preventDefault();
          canvasService.send({
            type: "ZOOM.IN"
          });
          return;
        // this corresponds to the -/_ key, we expect it to be pressed without a Shift
        // it apparently also corresponds to the minus sign on the numpad, even though it inputs the actual minus sign (char code 8722)
        case '-':
          // allow to zoom the whole page
          if (isWithPlatformMetaKey(e)) {
            return;
          }
          if (e.shiftKey) {
            return;
          }
          e.preventDefault();

          canvasService.send({
            type: "ZOOM.OUT",
          });
          return;
        // can come from numpad
        case '1':
        // this corresponds to the 1/! key
        case '!':
          if (!e.shiftKey) {
            return;
          }
          e.preventDefault();
          canvasService.send({
            type: "FIT_TO_CONTENT",
          });
          return;
      }
    }

    window.addEventListener('keydown', keydownListener);
    return () => {
      window.removeEventListener('keydown', keydownListener);
    };
  }, []);

  /**
   * Tracks Wheel Event on canvas
   */
  useEffect(() => {
    const onCanvasWheel = (e: WheelEvent) => {
      const isZoomEnabled = !embed?.isEmbedded || embed.zoom;
      const isPanEnabled = !embed?.isEmbedded || embed.pan;

      if (isZoomEnabled && isWithPlatformMetaKey(e)) {
        e.preventDefault();
        if (e.deltaY > 0) {
          canvasService.send(
            canvasModel.events['ZOOM.OUT'](
              { x: e.clientX, y: e.clientY },
              ZoomFactor.slow,
            ),
          );
        } else if (e.deltaY < 0) {
          canvasService.send(
            canvasModel.events['ZOOM.IN'](
              { x: e.clientX, y: e.clientY },
              ZoomFactor.slow,
            ),
          );
        }
      } else if (isPanEnabled && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        canvasService.send(canvasModel.events.PAN(e.deltaX, e.deltaY));
      }
    };

    const canvasEl = canvasRef.current;
    canvasEl.addEventListener('wheel', onCanvasWheel);
    return () => {
      canvasEl.removeEventListener('wheel', onCanvasWheel);
    };
  }, [canvasService, embed]);

  return (
    <div
      ref={canvasRef}
      style={{
        cursor: getCursorByState(state),
        WebkitFontSmoothing: 'auto',
      }}
    >
      {children}
    </div>
  );
};
