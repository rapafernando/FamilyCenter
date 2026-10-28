'use client';
// One place that decides which data layer the screens use. Set NEXT_PUBLIC_DATA_MODE=fake to run the practice mode
// (everything pretend, kept in the browser) for design work and screenshots. Anything else uses the real server.
import { data as fakeData, type Data } from './fake';
import { data as realData, startLive as realLive } from './real';

export const IS_FAKE = process.env.NEXT_PUBLIC_DATA_MODE === 'fake';
export const data: Data = IS_FAKE ? fakeData : realData;
export const startLive: () => () => void = IS_FAKE ? () => () => {} : realLive;
export type { Data };
