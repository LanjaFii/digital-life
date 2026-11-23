import type { DigitalLifeApi } from '../../shared/ipc';

declare global {
  interface Window {
    digitalLife: DigitalLifeApi;
  }
}

export {};
