"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
exports.sendPaginated = sendPaginated;
exports.handleError = handleError;
function sendSuccess(res, data, message, statusCode = 200) {
    const response = {
        success: true,
        data,
        message,
    };
    res.status(statusCode).json(response);
}
function sendError(res, error, statusCode = 400) {
    const response = {
        success: false,
        error,
    };
    res.status(statusCode).json(response);
}
function sendPaginated(res, data, total, page, limit) {
    const response = {
        success: true,
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
    res.status(200).json(response);
}
function handleError(res, error) {
    console.error("Error:", error);
    if (error instanceof Error) {
        if (error.message.includes("not found")) {
            sendError(res, error.message, 404);
        }
        else if (error.message.includes("unauthorized") || error.message.includes("unauthenticated")) {
            sendError(res, error.message, 401);
        }
        else if (error.message.includes("forbidden") || error.message.includes("permission")) {
            sendError(res, error.message, 403);
        }
        else if (error.message.includes("validation") || error.message.includes("invalid")) {
            sendError(res, error.message, 400);
        }
        else {
            sendError(res, "Internal server error", 500);
        }
    }
    else {
        sendError(res, "An unexpected error occurred", 500);
    }
}
//# sourceMappingURL=response.js.map