import { Response } from "express";
import { ApiResponse, PaginatedResponse } from "../types";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 400
): void {
  const response: ApiResponse = {
    success: false,
    error,
  };
  res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
): void {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
  res.status(200).json(response);
}

export function handleError(res: Response, error: unknown): void {
  console.error("Error:", error);

  if (error instanceof Error) {
    if (error.message.includes("not found")) {
      sendError(res, error.message, 404);
    } else if (error.message.includes("unauthorized") || error.message.includes("unauthenticated")) {
      sendError(res, error.message, 401);
    } else if (error.message.includes("forbidden") || error.message.includes("permission")) {
      sendError(res, error.message, 403);
    } else if (error.message.includes("validation") || error.message.includes("invalid")) {
      sendError(res, error.message, 400);
    } else {
      sendError(res, "Internal server error", 500);
    }
  } else {
    sendError(res, "An unexpected error occurred", 500);
  }
}
