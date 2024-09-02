import { Box, ChakraProvider } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
// import { useActorRef } from '@xstate/react';
import { AppHead } from './AppHead';
// import { CanvasProvider } from './CanvasContext';
import { CanvasContext } from './useInterpretCanvas';
import { EmbedProvider } from './embedContext';
import { CanvasViewMachine } from './SingleCanvas';
import { isOnClientSide } from './isOnClientSide';
// import { MachineNameChooserModal } from './MachineNameChooserModal';
// import { PaletteProvider } from './PaletteContext';
// import { paletteMachine } from './paletteMachine';
// import { PanelsView } from './PanelsView';
import { SimulationContext } from './SimulationContext';
import { SimMachineEventType } from './simulationMachine';
import { theme } from './theme';
import { EditorThemeProvider } from './themeContext';
import { EmbedContext, EmbedMode } from './types';
import { AnyStateMachine } from 'xstate';
// import { useInterpretCanvas } from './useInterpretCanvas';
import { getTaskMachineForVisualization } from "./definition"
// import { parseEmbedQuery, withoutEmbedQueryParams } from './utils';
import "./base.scss"

const defaultHeadProps = {
  title: 'XState Visualizer',
  ogTitle: 'XState Visualizer',
  description: 'Visualizer for XState state machines and statecharts',
  // TODO - get an OG image for the home page
  ogImageUrl: null,
};

const VizHead = () => {
//   const sourceRegistryData = useSourceRegistryData();

//   if (!sourceRegistryData) {
//     return <AppHead {...defaultHeadProps} />;
//   }

  return (
    <AppHead {...defaultHeadProps} />
  );
};

const useReceiveMessage = (
  eventHandlers?: Record<string, (data: any) => void>,
) => {
  useEffect(() => {
    window.onmessage = async (message) => {
      const { data } = message;
      eventHandlers && eventHandlers[data.type]?.(data);
    };
  }, []);
};

const getGridArea = (embed?: EmbedContext) => {
  if (embed?.isEmbedded && embed.mode === EmbedMode.Viz) {
    return 'canvas';
  }

  if (embed?.isEmbedded && embed.mode === EmbedMode.Panels) {
    return 'panels';
  }

  return 'canvas panels';
};

export function SingleViz({ isEmbedded = true, ...props }: { isEmbedded?: boolean, machine?: AnyStateMachine }) {
  // const { query, asPath } = useRouter();

  const machine = props.machine ?? getTaskMachineForVisualization()
  const embed = useMemo(
    (): EmbedContext => ({
      // ...parseEmbedQuery(query),
      isEmbedded: false,
      mode: EmbedMode.Viz,
      // originalUrl: withoutEmbedQueryParams(query),
    }),
    [],
  );

  // const paletteService = useActorRef(paletteMachine);
  // don't use `devTools: true` here as it would freeze your browser
  // const simService = SimulationContext.useActorRef()

  // simService.start()

  // simService.send({
  //   type: SimMachineEventType.RegisterService,
  //   machine,
  //   parent: undefined,
  //   sessionId: simService.sessionId,
  //   source: "inspector",
  //   state: simService.getSnapshot(),
  //   status: "active"
  // })

  // const currentMachine = useSelector(simService, (state) => {
  //   return state.context.currentSessionId
  //     ? state.context.serviceDataMap[state.context.currentSessionId!]?.machine
  //     : undefined;
  // });

  // const sourceService = useSelector(useAuth(), getSourceActor);
  // const [sourceState, sendToSourceService] = useActor(sourceService!);

  useReceiveMessage({
    // used to receive messages from the iframe in embed preview
    EMBED_PARAMS_CHANGED: (data) => {
      console.log("EMBED PARAMS CHANGED!")
      // router.replace(data.url, data.url);
    },
  });

  // useEffect(() => {
  //   sendToSourceService({
  //     type: 'MACHINE_ID_CHANGED',
  //     id: machine?.id || '',
  //   });
  // }, [machine?.id, sendToSourceService]);

  // TODO: Subject to refactor into embedActor

  // const sourceID = sourceState!.context.sourceID;

  // const canvasService = useInterpretCanvas({
  //   // sourceID,
  //   // embed,
  // });

  // This is because we're doing loads of things on client side anyway
  if (!isOnClientSide()) return <VizHead />;

  // const embed = {
  //   mode: null
  // }

  return (
    <>
      <VizHead />
      <EmbedProvider value={embed}>
        <ChakraProvider theme={theme}>
          <EditorThemeProvider>
            {/* <PaletteProvider value={paletteService}> */}
              <SimulationContext.Provider>
                <SimulationInit machine={machine}>
                  <Box
                    data-testid="app"
                    data-viz-theme="dark"
                    as="main"
                    display="grid"
                    gridTemplateColumns="1fr auto"
                    gridTemplateAreas={`"${getGridArea(embed)}"`}
                    height="100vh"
                  >
                    {!(embed?.isEmbedded && embed.mode === EmbedMode.Panels) && (
                      <CanvasContext.Provider>
                        <CanvasViewMachine machine={machine} />
                      </CanvasContext.Provider>
                    )}
                    {/* <PanelsView /> */}
                    {/* <MachineNameChooserModal /> */}
                  </Box>
                </SimulationInit>
              </SimulationContext.Provider>
            {/* </PaletteProvider> */}
          </EditorThemeProvider>
        </ChakraProvider>
      </EmbedProvider>
    </>
  );
}

function SimulationInit(props: { children?: React.ReactNode | React.ReactNode[]; machine: AnyStateMachine }) {
  const simService = SimulationContext.useActorRef()

  simService.start()

  console.log("SEND SERVICE REGISTER TO SIM", props.machine)
  simService.send({
    type: SimMachineEventType.RegisterService,
    machine: props.machine,
    parent: undefined,
    sessionId: simService.sessionId,
    source: "inspector",
    state: simService.getSnapshot(),
    status: "active"
  })

  return (
    <>
      {props.children}
    </>
  )
}

export default SingleViz;
