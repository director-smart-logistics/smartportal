/**
 * Which Firebase project SP1 functions use to reach SP2 (SmartWeb).
 *
 * Production: always "smart-portal-2" (unchanged behavior).
 *
 * Local QA only: inside the Firebase emulator (FUNCTIONS_EMULATOR === "true"),
 * SP2_PROJECT_ID from the QA env file points SP1 at the emulated SP2, so the
 * cross-system syncs can be tested without touching production data.
 * Outside the emulator the variable is ignored, even if it is set.
 */
export declare const SP2_PRODUCTION_PROJECT_ID = "smart-portal-2";
export declare function sp2ProjectId(env?: NodeJS.ProcessEnv): string;
//# sourceMappingURL=sp2-target.d.ts.map