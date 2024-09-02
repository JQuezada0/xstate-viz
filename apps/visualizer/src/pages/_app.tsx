import { useActorRef } from '@xstate/react';
// import { useRouter } from 'next/router';
import '../ActionViz.scss';
import '../DelayViz.scss';
import '../EdgeViz.scss';
import '../EventTypeViz.scss';
import '../InvokeViz.scss';
import '../StateNodeViz.scss';
import '../TransitionViz.scss';
// import { AuthProvider } from '../authContext';
// import { createAuthMachine } from '../authMachine';
import '../base.scss';
import '../monacoPatch';
import { SingleViz } from "../SingleViz"
import { getTaskMachineForVisualization } from "../definition"

// import { isOnClientSide } from '../isOnClientSide';

type AppProps = {
  // pageProps: any
  // children?: (props: any) => React.ReactNode
}

const MyApp: React.FC<AppProps> = () => {
  // const router = useRouter();

  const machine = getTaskMachineForVisualization()

  // const authService = useActorRef(
  //   createAuthMachine({
  //     sourceRegistryData: pageProps.sourceRegistryData,
  //     router,
  //     isEmbbeded: pageProps.isEmbedded,
  //   }),
  // );

  return (
    <div>
      <SingleViz machine={machine} />
    </div>
  );
};

export default MyApp;
