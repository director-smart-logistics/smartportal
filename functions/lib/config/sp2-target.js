"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SP2_PRODUCTION_PROJECT_ID = void 0;
exports.sp2ProjectId = sp2ProjectId;
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
exports.SP2_PRODUCTION_PROJECT_ID = "smart-portal-2";
function sp2ProjectId(env = process.env) {
    const inEmulator = env.FUNCTIONS_EMULATOR === "true";
    const override = (env.SP2_PROJECT_ID || "").trim();
    return inEmulator && override ? override : exports.SP2_PRODUCTION_PROJECT_ID;
}
//# sourceMappingURL=sp2-target.js.map