import { Actor } from 'xstate';
import { canvasMachine } from './canvasMachine';
import { createRequiredContext } from './utils';

export const [CanvasProvider, useCanvas] = createRequiredContext<
  Actor<typeof canvasMachine>
>('Canvas');
