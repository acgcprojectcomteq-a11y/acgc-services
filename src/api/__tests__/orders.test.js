import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminOrder, getProductReviewSummaries } from "../orders";
import { apiFetch } from "../client";

vi.mock("../client", () => ({
  apiFetch: vi.fn(),
}));

describe("getAdminOrder", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates overlapping detail lookups but fetches fresh data after completion", async () => {
    let resolveRequest;
    const firstResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    apiFetch.mockReturnValueOnce(firstResponse).mockResolvedValueOnce({ order: { _id: "order-1", status: "updated" } });

    const firstRequest = getAdminOrder("order-1", "profile");
    const overlappingRequest = getAdminOrder("order-1", "profile");
    expect(apiFetch).toHaveBeenCalledTimes(1);

    resolveRequest({ order: { _id: "order-1", status: "current" } });
    await expect(firstRequest).resolves.toEqual({ order: { _id: "order-1", status: "current" } });
    await expect(overlappingRequest).resolves.toEqual({ order: { _id: "order-1", status: "current" } });

    await expect(getAdminOrder("order-1", "profile")).resolves.toEqual({
      order: { _id: "order-1", status: "updated" },
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe("getProductReviewSummaries", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("falls back to the existing single-product endpoint if the batch route returns 404", async () => {
    const notFound = new Error("Route not found");
    notFound.response = { status: 404 };
    apiFetch
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({ average: 5, total: 1, counts: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 } })
      .mockResolvedValueOnce({ average: 4, total: 2, counts: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } });

    await expect(getProductReviewSummaries(["product-1", "product-2"])).resolves.toMatchObject({
      summaries: {
        "product-1": { average: 5, total: 1 },
        "product-2": { average: 4, total: 2 },
      },
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls[1][0]).toBe("/orders/reviews/product/product-1/summary");
    expect(apiFetch.mock.calls[2][0]).toBe("/orders/reviews/product/product-2/summary");
  });
});
