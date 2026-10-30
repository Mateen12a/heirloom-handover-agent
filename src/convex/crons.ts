import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Free hosts put the runner to sleep after ~15 idle minutes; a light health
// ping keeps the first takeover of the day from waiting on a cold start.
crons.interval("keep the runner warm", { minutes: 10 }, internal.runner.ping, {});

export default crons;
