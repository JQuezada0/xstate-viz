import produce from 'immer';
import {
  ActorLike,
  ActorRefFrom,
  AnyActor,
  AnyInterpreter,
  AnyMachineSnapshot,
  AnyState,
  AnyStateMachine,
  createActor,
  EventFrom,
  fromCallback,
  getInitialSnapshot,
  // InterpreterStatus,
  setup,
} from 'xstate';
import { SCXML } from "@xstate/scxml"
import { assign, sendTo } from 'xstate';
import {
  createWebSocketReceiver,
  createWindowReceiver,
  InspectReceiver,
  ParsedReceiverEvent,
  ReceiverCommand,
} from '@xstate/inspect';

import { devTools } from './devInterface';
// import { notifMachine } from './notificationMachine';
import { MachineStatus, ServiceData } from './types';
import { isOnClientSide } from './isOnClientSide';

export interface SimEvent extends SCXML.Event<any> {
  timestamp: number;
  sessionId: string;
}

export enum SimMachineEventType {
  ServiceSend = "SERVICE.SEND",
  RegisterMachines = "MACHINES.REGISTER",
  ResetMachines = "MACHINES.RESET",
  PreviewEvent = "EVENT.PREVIEW",
  ClearPreview = "PREVIEW.CLEAR",
  RegisterService = "SERVICE.REGISTER",
  ServiceState = "SERVICE.STATE",
  UnregisterAllServices = "SERVICES.UNREGISTER_ALL",
  StopService = "SERVICE.STOP",
  FocusService = "SERVICE.FOCUS",
  Error = "ERROR",
  LayoutPending = "LAYOUT.PENDING",
  LayoutReady = "LAYOUT.READY"
}

type ServiceSendEvent = {
  type: SimMachineEventType.ServiceSend,
  event: SimEvent
}

type MachinesRegisterEvent = {
  type: SimMachineEventType.RegisterMachines;
  machines: Array<AnyStateMachine>
}

type MachinesResetEvent = {
  type: SimMachineEventType.ResetMachines
}

type EventPreviewEvent = {
  type: SimMachineEventType.PreviewEvent
  eventType: string
}

type PreviewClearEvent = {
  type: SimMachineEventType.ClearPreview
}

type ServiceRegisterEvent = {
  type: SimMachineEventType.RegisterService,
  status: MachineStatus
} & Omit<ServiceData, 'status'>

type ServiceStateEvent = {
  type: SimMachineEventType.ServiceState,
  sessionId: string
  state: AnyMachineSnapshot
}

type ServiceUnregisterAllEvent = {
  type: SimMachineEventType.UnregisterAllServices
}

type ServiceStopEvent = {
  type: SimMachineEventType.StopService
  sessionId: string
}

type ServiceFocusEvent = {
  type: SimMachineEventType.FocusService
  sessionId: string
}

type ErrorEvent = {
  type: SimMachineEventType.Error
  message: string
}

type LayoutPendingEvent = {
  type: SimMachineEventType.LayoutPending
}

type LayoutReadyEvent = {
  type: SimMachineEventType.LayoutReady
}

const SimMachineEventsMapper = {
  'SERVICE.SEND': (event: SimEvent): ServiceSendEvent => ({ 
    type: SimMachineEventType.ServiceSend,
    event
   }),
  'MACHINES.REGISTER': (machines: Array<AnyStateMachine>): MachinesRegisterEvent => ({
    type: SimMachineEventType.RegisterMachines,
    machines
  }),
  'MACHINES.RESET': (): MachinesResetEvent => ({
    type: SimMachineEventType.ResetMachines,
  }),
  'EVENT.PREVIEW': (eventType: string): EventPreviewEvent => ({ 
    type: SimMachineEventType.PreviewEvent,
    eventType }),
  'PREVIEW.CLEAR': (): PreviewClearEvent => ({
    type: SimMachineEventType.ClearPreview,
  }),
  'SERVICE.REGISTER': (serviceData: Omit<ServiceData, 'status'>): ServiceRegisterEvent => 
    ({
      type: SimMachineEventType.RegisterService,
      ...serviceData, 
      // machines are always registered from within `.start()` call 
      status: "active",
    }),
  'SERVICE.STATE': (sessionId: string, state: AnyState): ServiceStateEvent => ({ 
    type: SimMachineEventType.ServiceState,
    sessionId, 
    state
  }),
  'SERVICES.UNREGISTER_ALL': (): ServiceUnregisterAllEvent => ({
    type: SimMachineEventType.UnregisterAllServices,
  }),
  'SERVICE.STOP': (sessionId: string): ServiceStopEvent => ({ 
    type: SimMachineEventType.StopService,
    sessionId }),
  'SERVICE.FOCUS': (sessionId: string): ServiceFocusEvent => ({ 
    type: SimMachineEventType.FocusService,
    sessionId }),
  'ERROR': (message: string): ErrorEvent => ({ 
    type: SimMachineEventType.Error,
    message }),
  'LAYOUT.PENDING': (): LayoutPendingEvent => ({
    type: SimMachineEventType.LayoutPending,
  }),
  'LAYOUT.READY': (): LayoutReadyEvent => ({
    type: SimMachineEventType.LayoutReady,
  }),
}

export const simModel = setup(
  {
    actions: {
      resetVisualizationState: assign({
        events: [],
        previewEvent: undefined,
        currentSessionId: null,
      }),
    },
    types: {
      context: {} as {
        state: AnyMachineSnapshot | undefined,
        // notifRef: ActorRefFrom<typeof notifMachine>,
        notifRef: any,
        serviceDataMap: Record<string, ServiceData | undefined>,
        currentSessionId: string | null,
        previewEvent: string | undefined,
        events: SimEvent[]
      },
      events: {} as 
        | ServiceSendEvent
        | MachinesRegisterEvent
        | MachinesResetEvent
        | EventPreviewEvent
        | PreviewClearEvent
        | ServiceRegisterEvent
        | ServiceStateEvent
        | ServiceUnregisterAllEvent
        | ServiceStopEvent
        | ServiceFocusEvent
        | ErrorEvent
        | LayoutPendingEvent
        | LayoutReadyEvent
    },
    actors: {
      captureEventsFromChildServices: fromCallback(({ sendBack }) => {
        devTools.onRegister((service) => {
          console.log("ON REGISTER!", service)
          // Only capture machines that are spawned or invoked
          if (service._parent) {
            sendBack(
              SimMachineEventsMapper[SimMachineEventType.RegisterService]({
                sessionId: service.sessionId,
                machine: service.logic,
                state: service.getSnapshot(),
                // actor: service,
                parent: service._parent?.sessionId,
                source: 'child',
              }),
            );

            service.subscribe((state) => {
              console.log("GOT SERVICE! STATE!", state)
              // `onRegister`'s callback gets called from within `.start()`
              // `subscribe` calls the callback immediately with the current state
              // but the `service.state` state has not yet been set when this gets called for the first time from within `.start()`
              if (!state) {
                return;
              }

              sendBack(
                SimMachineEventsMapper['SERVICE.STATE'](service.sessionId, state),
              );
            });

            // service.subscribe({
               
            // })

            service.onStop(() => {
              sendBack(SimMachineEventsMapper['SERVICE.STOP'](service.sessionId));
            });
          }
        });
      }),
      proxyInspect: fromCallback(({ sendBack, receive }) => {
        console.log("Kicked off proxy inspect!")
        const serverUrl = new URLSearchParams(window.location.search).get(
          'server',
        );

        let receiver: ActorLike<ParsedReceiverEvent, ReceiverCommand>;

        if (serverUrl) {
          const [protocol, ...server] = serverUrl.split('://');
          receiver = createWebSocketReceiver({
            protocol: protocol as 'ws' | 'wss',
            server: server.join('://'),
          });
        } else {
          receiver = createWindowReceiver({
            // for some random reason the `window.top` is being rewritten to `window.self`
            // looks like maybe some webpack replacement plugin (or similar) plays tricks on us
            // this breaks the auto-detection of the correct `targetWindow` in the `createWindowReceiver`
            // so we pass it explicitly here
            targetWindow: window.opener || window.parent,
          });
        }

        receive((_event) => {
          console.log("THE EVENT!", _event)

          if (_event.type === 'xstate.event') {
            const event = _event as ServiceSendEvent
            receiver.send({
              ...event,
              type: 'xstate.event',
              event: JSON.stringify(event.event),
            });
          }
        });

        return receiver.subscribe((event) => {
          console.log("THE EVENT!!!!", event)

          switch (event.type) {
            case 'service.register':
              let state = event.machine.resolveState(event.state);

              sendBack(
                SimMachineEventsMapper['SERVICE.REGISTER']({
                  sessionId: event.sessionId,
                  machine: event.machine,
                  state,
                  parent: event.parent,
                  source: 'inspector',
                }),
              );
              break;
            case 'service.state': {
              sendBack(
                SimMachineEventsMapper['SERVICE.STATE'](
                  event.sessionId,
                  event.state,
                ),
              );
            }
              break;
            case 'service.stop':
              sendBack(SimMachineEventsMapper['SERVICE.STOP'](event.sessionId));
              break;
            default:
              break;
          }
        }).unsubscribe;
      }),
      proxyVisualize: fromCallback(({ sendBack, receive }) => {
        console.log("kicked off proxy visualize")
        const serviceMap: Map<string, AnyActor> = new Map();
        const machines = new Set<AnyStateMachine>();
        const rootServices = new Set<AnyActor>();

        function locallyInterpret(machine: AnyStateMachine) {
          machines.add(machine);

          // const service = createActor(machine, { devTools: true });
          const service = createActor(machine);

          devTools.register(service);

          rootServices.add(service);
          serviceMap.set(service.sessionId, service);

          sendBack(
            SimMachineEventsMapper['SERVICE.REGISTER']({
              sessionId: service.sessionId,
              machine,
              state: getInitialSnapshot(machine),
              parent: service._parent?.sessionId,
              source: 'visualizer',
            }),
          );

          service.subscribe((state) => {
            console.log("SERVICE STATE!!", state)
            sendBack(
              SimMachineEventsMapper['SERVICE.STATE'](service.sessionId, state),
            );
          });
          service.start();
        }

        function stopRootServices() {
          rootServices.forEach((service) => {
            sendBack(SimMachineEventsMapper['SERVICES.UNREGISTER_ALL']());
            service.stop();
          });
          rootServices.clear();
          serviceMap.clear();
        }

        receive((event) => {
          console.log("RECEIVE!!", event)

          if (event.type === 'INTERPRET') {
            const machines = (event as MachinesRegisterEvent).machines

            machines.forEach((machine: AnyStateMachine) => {
              try {
                locallyInterpret(machine);
              } catch (e) {
                sendBack(SimMachineEventsMapper.ERROR((e as Error).message));
              }
            });
          } else if (event.type === 'xstate.event') {
            const e = event as ServiceSendEvent
            const service = serviceMap.get(e.event.sessionId);
            if (service) {
              try {
                service.send(e.event);
              } catch (err) {
                console.error(err);
                sendBack(SimMachineEventsMapper.ERROR((err as Error).message));
              }
            }
          } else if (event.type === 'RESET') {
            stopRootServices();
            machines.forEach((machine) => {
              locallyInterpret(machine);
            });
          } else if (event.type === 'STOP') {
            stopRootServices();
            machines.clear();
          }
        });
      })
    },
  });
  // BUGBUG What do to with this?
  // {
  //   events: {
      // 'SERVICE.SEND': (event: SCXML.Event<AnyEventObject>) => ({ event }),
      // 'MACHINES.REGISTER': (machines: Array<AnyStateMachine>) => ({machines}),
      // 'MACHINES.RESET': () => ({}),
      // 'EVENT.PREVIEW': (eventType: string) => ({ eventType }),
      // 'PREVIEW.CLEAR': () => ({}),
      // 'SERVICE.REGISTER': (serviceData: Omit<ServiceData, 'status'>) => ({...serviceData, // machines are always registered from within `.start()` call status: InterpreterStatus.Running, }),
      // 'SERVICE.STATE': (sessionId: string, state: AnyState) => ({ sessionId, state, }),
      // 'SERVICES.UNREGISTER_ALL': () => ({}),
      // 'SERVICE.STOP': (sessionId: string) => ({ sessionId }),
      // 'SERVICE.FOCUS': (sessionId: string) => ({ sessionId }),
      // 'ERROR': (message: string) => ({ message }),
      // 'LAYOUT.PENDING': () => ({}),
      // 'LAYOUT.READY': () => ({}),
  //   },
  // },

export const simulationMachine = simModel.createMachine(
  {
    // preserveActionOrder: true,
    context: {
      state: undefined,
      notifRef: undefined,
      serviceDataMap: {},
      currentSessionId: null,
      events: [],
      previewEvent: undefined,
    },
    initial:
      isOnClientSide() &&
      new URLSearchParams(window.location.search).has('inspect')
        ? 'inspecting'
        : 'visualizing',
    // entry: assign({ notifRef: () => spawn(notifMachine) }),
    entry: assign({ notifRef: () => {} }),
    invoke: {
      src: 'captureEventsFromChildServices',
    },
    states: {
      inspecting: {
        tags: 'inspecting',
        invoke: {
          id: 'proxy',
          src: "proxyInspect",
        },
      },
      visualizing: {
        tags: 'visualizing',
        invoke: {
          id: 'proxy',
          src: "proxyVisualize",
        },
        initial: 'idle',
        states: {
          idle: {
            tags: 'empty',
          },
          pending: {
            tags: 'layoutPending',
            on: {
              'LAYOUT.READY': {
                actions: [() => {
                  console.log("Moved from pending to ready!")
                }],
                target: 'ready'
              },
            },
          },
          ready: {},
        },
        on: {
          'LAYOUT.PENDING': '.pending',
          'MACHINES.REGISTER': {
            actions: [
              ({ event }) => {
                console.log("REGISTER MACHINE!", event)
              },
              'resetVisualizationState',
              sendTo("proxy", "STOP"),
              sendTo("proxy",
                ({ event }) => ({
                  type: 'INTERPRET',
                  machines: event.machines,
                })
              ),
            ],
          },
          'MACHINES.RESET': {
            actions: [
              'resetVisualizationState',
              sendTo("proxy", 'RESET'),
            ],
          },
        },
      },
    },
    on: {
      "*": {
        actions: [
          ({ event }) => {
            console.log("RECEIVED EVENT IN SIM MACHINE!", event)
          }
        ]
      },
      'SERVICE.STATE': {
        actions: [
          assign({
            serviceDataMap: ({ context: ctx, event: e }) =>
              produce(ctx.serviceDataMap, (draft) => {
                const service = draft[e.sessionId];

                if (!service) {
                  return;
                }

                const serviceActor = createActor(service.machine, {
                  snapshot: e.state
                })

                const machineSnapshot = serviceActor.getSnapshot()

                const serviceData = draft[e.sessionId]

                if (serviceData) {
                  serviceData.state = machineSnapshot
                }


                draft[e.sessionId] = serviceData
              }),
            events: ({ context: ctx, event: e, self, system }) => {
              console.log("EVENTS!", e)
              return ctx.events
              // return produce(ctx.events, (draft) => {
              //   draft.push({
              //     ...e.state._event,
              //     timestamp: Date.now(),
              //     sessionId: e.sessionId,
              //   });
              // });
            },
          }),
        ],
      },
      'SERVICE.SEND': {
        actions: [
          sendTo("proxy",
            ({ context, event }) => {
              return {
                type: 'xstate.event',
                event: event.event,
                sessionId: context.currentSessionId,
              };
            },
          ),
        ],
      },
      'SERVICE.REGISTER': {
        actions: [
          ({ event }) => {
            console.log("RECEIVED SERVICE REGISTER EVENT!", event)
          },
          assign({
            serviceDataMap: ({ context: ctx, event }) => {
              const { type, ...data } = event
  
              return produce(ctx.serviceDataMap, (draft) => {
                // @ts-expect-error BUGBUG Is this fine?
                draft[data.sessionId] = data as ServiceData;

                return draft
              });
            },
            currentSessionId: ({ context, event }) => {
              return context.currentSessionId ?? event.sessionId;
            },
          })
        ],
      },
      'SERVICES.UNREGISTER_ALL': {
        actions: assign({
          serviceDataMap: {},
          currentSessionId: null,
        }),
      },
      'SERVICE.STOP': {
        actions: assign({
          serviceDataMap: ({ context, event }) =>
            produce(context.serviceDataMap, (draft) => {
              const serviceData = draft[event.sessionId];
              if (!serviceData) {
                return;
              }

              serviceData.status = "stopped";
            }),
        }),
      },
      'SERVICE.FOCUS': {
        actions: assign({
          currentSessionId: ({ event }) => event.sessionId,
        }),
      },
      'EVENT.PREVIEW': {
        actions: assign({
          previewEvent: ({ event }) => event.eventType,
        }),
      },
      'PREVIEW.CLEAR': {
        actions: assign({ previewEvent: undefined }),
      },
      ERROR: {
        actions: sendTo(({ context }) => context.notifRef!,
          ({ event }) => ({
            type: 'BROADCAST',
            status: 'error',
            message: event.message,
          }),
        ),
      },
    },
  }
);
