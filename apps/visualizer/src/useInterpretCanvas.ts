import { useActorRef, createActorContext } from '@xstate/react';
import { useEffect } from 'react';
import { canvasMachine, canvasMachineInitialContext } from './canvasMachine';
import './Graph';
import { localCache } from './localCache';
import { EmbedContext } from './types';

export const CanvasContext = createActorContext(canvasMachine)

export const useInterpretCanvas = ({
  // sourceID,
  // embed,
}: {
  // sourceID: string | null;
  // embed?: EmbedContext;
}) => {
  const canvasService = useActorRef(canvasMachine);

  useEffect(() => {
    canvasService.send({
      type: 'SOURCE_CHANGED',
      // id: sourceID,
    });
  }, [canvasService]);

  return canvasService;
};
