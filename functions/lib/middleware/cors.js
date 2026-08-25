"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsHandler = void 0;
const cors_1 = __importDefault(require("cors"));
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "https://portal.smartlogisticscr.com",
    "https://smart-portal-admin.web.app",
    "https://smart-portal-admin.firebaseapp.com",
    "https://smartlogisticscr.com",
    "https://www.smartlogisticscr.com",
];
exports.corsHandler = (0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(null, false);
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
});
//# sourceMappingURL=cors.js.map