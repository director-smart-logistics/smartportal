import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouteOptions, ROUTE_OPTIONS } from ".././nova-route-options";
import { firebaseApi } from "@/lib/firebase/callable";
// @ts-ignore
import { useQuery, __getCapturedQueryFn } from "@tanstack/react-query";

vi.mock("@/lib/firebase/callable", () => ({
  firebaseApi: {
    routes: {
      list: vi.fn(),
    },
  },
}));

vi.mock("@tanstack/react-query", () => {
  let capturedQueryFn: any = null;
  return {
    useQuery: vi.fn((options: any) => {
      capturedQueryFn = options.queryFn;
      return { data: null };
    }),
    __getCapturedQueryFn: () => capturedQueryFn,
  };
});

describe("useRouteOptions hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters out BB, Mayorista, and Mayoristas routes from the fetched active list", async () => {
    const mockRoutes = [
      { name: "Alajuela", status: "active" },
      { name: "BB", status: "active" },
      { name: "Mayorista", status: "active" },
      { name: "Mayoristas", status: "active" },
      { name: "Heredia", status: "active" },
      { name: "Retira", status: "inactive" },
    ];

    vi.mocked(firebaseApi.routes.list).mockResolvedValue({
      success: true,
      data: mockRoutes,
    } as any);

    // Call the hook to trigger useQuery mock registration
    useRouteOptions();

    // Get the queryFn from react-query mock
    const queryFn = __getCapturedQueryFn();
    expect(queryFn).toBeDefined();

    const result = await queryFn();

    // Assert that the result contains only active and non-deprecated routes
    const routeNames = result.map((r: any) => r.name);
    expect(routeNames).toContain("Alajuela");
    expect(routeNames).toContain("Heredia");
    expect(routeNames).not.toContain("BB");
    expect(routeNames).not.toContain("Mayorista");
    expect(routeNames).not.toContain("Mayoristas");
    expect(routeNames).not.toContain("Retira");
  });

  it("falls back to ROUTE_OPTIONS if the query fails", async () => {
    vi.mocked(firebaseApi.routes.list).mockResolvedValue({
      success: false,
    } as any);

    useRouteOptions();
    const queryFn = __getCapturedQueryFn();
    const result = await queryFn();
    expect(result).toEqual(ROUTE_OPTIONS);
  });
});
