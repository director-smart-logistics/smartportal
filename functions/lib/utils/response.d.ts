import { Response } from "express";
export declare function sendSuccess<T>(res: Response, data: T, message?: string, statusCode?: number): void;
export declare function sendError(res: Response, error: string, statusCode?: number): void;
export declare function sendPaginated<T>(res: Response, data: T[], total: number, page: number, limit: number): void;
export declare function handleError(res: Response, error: unknown): void;
//# sourceMappingURL=response.d.ts.map