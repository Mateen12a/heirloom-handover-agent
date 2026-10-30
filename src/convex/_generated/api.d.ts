/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as crons from "../crons.js";
import type * as deps from "../deps.js";
import type * as engine from "../engine.js";
import type * as fixCommand from "../fixCommand.js";
import type * as http from "../http.js";
import type * as live from "../live.js";
import type * as liveWrite from "../liveWrite.js";
import type * as runner from "../runner.js";
import type * as runs from "../runs.js";
import type * as scenarios from "../scenarios.js";
import type * as seed from "../seed.js";
import type * as strategy from "../strategy.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  crons: typeof crons;
  deps: typeof deps;
  engine: typeof engine;
  fixCommand: typeof fixCommand;
  http: typeof http;
  live: typeof live;
  liveWrite: typeof liveWrite;
  runner: typeof runner;
  runs: typeof runs;
  scenarios: typeof scenarios;
  seed: typeof seed;
  strategy: typeof strategy;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
