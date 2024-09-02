import { createDevTools } from '@xstate/inspect';
import { XStateDevInterface } from 'xstate/dev';

const devTools: XStateDevInterface = createDevTools();

// @ts-ignore
globalThis.__xstate__ = devTools;

export { devTools };
