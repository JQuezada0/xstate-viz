import React, { CSSProperties, useEffect, useRef } from 'react';
import { canvasModel, ZoomFactor } from './canvasMachine';
import { useCanvas } from './CanvasContext';
import { useMachine } from '@xstate/react';
import { actions } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { Point } from './pathUtils';
import {
  isAcceptingSpaceNatively,
  isWithPlatformMetaKey,
  isTabLikeElement,
  isTextInputLikeElement,
} from './utils';
import { useEmbed } from './embedContext';
import {
  dragSessionModel,
  dragSessionTracker,
  DragSession,
  PointDelta,
} from './dragSessionTracker';
import { AnyState } from './types';

const dragModel = createModel(
  {
    ref: null as React.MutableRefObject<HTMLElement> | null,
  },
  {
    events: {
      LOCK: () => ({}),
      RELEASE: () => ({}),
      ENABLE_PANNING: (sessionSeed: DragSession | null = null) => ({
        sessionSeed,
      }),
      DISABLE_PANNING: () => ({}),
      ENABLE_PAN_MODE: () => ({}),
      DISABLE_PAN_MODE: () => ({}),
      DRAG_SESSION_STARTED: ({ point }: { point: Point }) => ({
        point,
      }),
      DRAG_SESSION_STOPPED: () => ({}),
      POINTER_MOVED_BY: ({ delta }: { delta: PointDelta }) => ({
        delta,
      }),
      WHEEL_PRESSED: (data: DragSession) => ({ data }),
      WHEEL_RELEASED: () => ({}),
    },
  },
);

const dragMachine = dragModel.createMachine(
  {
    preserveActionOrder: true,
    initial: 'checking_if_disabled',
    states: {
      checking_if_disabled: {
        always: [
          {
            target: 'permanently_disabled',
            cond: 'isPanDisabled',
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
                      },
                    ],
                    on: {
                      LOCK: 'locked',
                      WHEEL_PRESSED: 'wheelPressed',
                    },
                  },
                  locked: {
                    entry: actions.raise(dragModel.events.ENABLE_PANNING()),
                    exit: actions.raise(dragModel.events.DISABLE_PANNING()),
                    on: { RELEASE: 'released' },
                    invoke: {
                      src: 'invokeDetectRelease',
                    },
                  },
                  wheelPressed: {
                    entry: actions.raise(((_ctx: any, ev: any) =>
                      dragModel.events.ENABLE_PANNING(ev.data)) as any),
                    exit: actions.raise(dragModel.events.DISABLE_PANNING()),
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
                entry: actions.raise(dragModel.events.ENABLE_PANNING()),
                exit: actions.raise(dragModel.events.DISABLE_PANNING()),
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
                  src: (ctx, ev) =>
                    dragSessionTracker.withContext({
                      ...dragSessionModel.initialContext,
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
                          POINTER_MOVED_BY: { actions: 'sendPanChange' },
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
  {
    actions: {
      disableTextSelection: (ctx) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'none';
      },
      enableTextSelection: (ctx) => {
        const node = ctx.ref!.current!;
        node.style.userSelect = 'unset';
      },
    },
    services: {
      wheelPressListener: (ctx) => (sendBack) => {
        const node = ctx.ref!.current!;
        const listener = (ev: PointerEvent) => {
          if (ev.button === 1) {
            sendBack(
              dragModel.events.WHEEL_PRESSED({
                pointerId: ev.pointerId,
                point: {
                  x: ev.pageX,
                  y: ev.pageY,
                },
              }),
            );
          }
        };
        node.addEventListener('pointerdown', listener);
        return () => node.removeEventListener('pointerdown', listener);
      },
      invokeDetectLock: () => (sendBack) => {
        function keydownListener(e: KeyboardEvent) {
          const target = e.target as HTMLElement;

          if (e.code === 'Space' && !isAcceptingSpaceNatively(target)) {
            e.preventDefault();
            sendBack('LOCK');
          }
        }

        window.addEventListener('keydown', keydownListener);
        return () => {
          window.removeEventListener('keydown', keydownListener);
        };
      },
      invokeDetectRelease: () => (sendBack) => {
        // TODO: we should release in more scenarios
        // e.g.:
        // - when the window blurs (without this we might get stuck in the locked state without Space actually being held down)
        // - when unrelated keyboard keys get pressed (without this other actions might be executed while dragging which often might not be desired)
        function keyupListener(e: KeyboardEvent) {
          if (e.code === 'Space') {
            e.preventDefault();
            sendBack('RELEASE');
          }
        }

        window.addEventListener('keyup', keyupListener);
        return () => {
          window.removeEventListener('keyup', keyupListener);
        };
      },
    },
  },
);

const getCursorByState = (state: AnyState) =>
  (
    Object.values(state.meta).find((m) =>
      Boolean((m as { cursor?: CSSProperties['cursor'] }).cursor),
    ) as { cursor?: CSSProperties['cursor'] }
  )?.cursor;

export const CanvasContainer: React.FC<{ panModeEnabled: boolean }> = ({
  children,
  panModeEnabled,
}) => {
  const canvasService = useCanvas();
  const embed = useEmbed();
  const canvasRef = useRef<HTMLDivElement>(null!);
  const [state, send] = useMachine(dragMachine, {
    actions: {
      sendPanChange: actions.send(
        (_, ev: any) => {
          return canvasModel.events.PAN(ev.delta.x, ev.delta.y);
        },
        { to: canvasService as any },
      ),
    },
    guards: {
      isPanDisabled: () => !!embed?.isEmbedded && !embed.pan,
    },
    context: {
      ...dragModel.initialContext,
      ref: canvasRef,
    },
  });

  React.useEffect(() => {
    if (panModeEnabled) {
      send(dragModel.events.ENABLE_PAN_MODE());
    } else {
      send(dragModel.events.DISABLE_PAN_MODE());
    }
  }, [panModeEnabled]);

  /**
   * Observes the canvas's size and reports it to the canvasService
   */
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) return;

      canvasService.send({
        type: 'CANVAS_RECT_CHANGED',
        height: entry.contentRect.height,
        width: entry.contentRect.width,
        offsetX: entry.contentRect.left,
        offsetY: entry.contentRect.top,
      });
    });

    resizeObserver.observe(canvasRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasService]);

  useEffect(() => {
    function keydownListener(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      if (isTextInputLikeElement(target) || isTabLikeElement(target)) {
        return;
      }

      switch (e.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          canvasService.send(canvasModel.events['PAN.UP'](e.shiftKey));
          break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
          canvasService.send(canvasModel.events['PAN.LEFT'](e.shiftKey));
          break;
        case 's':
        case 'S':
        case 'ArrowDown':
          canvasService.send(canvasModel.events['PAN.DOWN'](e.shiftKey));
          break;
        case 'd':
        case 'D':
        case 'ArrowRight':
          canvasService.send(canvasModel.events['PAN.RIGHT'](e.shiftKey));
          break;
        case '+':
          canvasService.send('ZOOM.IN');
          break;
        case '-':
          canvasService.send('ZOOM.OUT');
          break;
        case 'r':
          canvasService.send('POSITION.RESET');
          break;
        case 'f':
          canvasService.send('FIT_TO_VIEW');
          break;
        default:
          // Returning here to retain other keyboard events as intended.
          return;
      }

      e.preventDefault();
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
              e.clientX,
              e.clientY,
              ZoomFactor.slow,
            ),
          );
        } else if (e.deltaY < 0) {
          canvasService.send(
            canvasModel.events['ZOOM.IN'](
              e.clientX,
              e.clientY,
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
