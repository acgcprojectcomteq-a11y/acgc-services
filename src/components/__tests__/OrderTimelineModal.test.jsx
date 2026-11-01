import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import OrderTimelineModal from "@/components/OrderTimelineModal";
import { singleItemOrderMock, threeItemBatchOrderMock } from "@/components/orderTimeline.mockData";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback) => window.setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (timer) => window.clearTimeout(timer));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrderTimelineModal", () => {
  it("shows a single item's summary and expanded custom stage timeline", () => {
    render(<OrderTimelineModal order={singleItemOrderMock} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Order timeline" });
    expect(dialog.className).toContain("h-[100dvh]");
    expect(dialog.className).toContain("lg:max-w-[560px]");
    expect(screen.getByText("Glass Door")).toBeTruthy();
    expect(screen.getByText('121" × 121" · 101.67 sq ft')).toBeTruthy();
    expect(screen.getByText("Assembly", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("1 of 5 stages done")).toBeTruthy();
  });

  it("shows measurements from the saved dimensions object when no preformatted size exists", () => {
    const order = {
      ...singleItemOrderMock,
      items: [{
        ...singleItemOrderMock.items[0],
        widthIn: undefined,
        heightIn: undefined,
        sqFt: undefined,
        dimensions: { width: 100, height: 120, unit: "cm", quantity: 2 },
      }],
    };

    render(<OrderTimelineModal order={order} onClose={vi.fn()} />);

    expect(screen.getByText("100cm × 120cm · 25.83 sq ft")).toBeTruthy();
  });

  it("starts batch orders with the first item expanded and supports expand all", () => {
    render(<OrderTimelineModal order={threeItemBatchOrderMock} onClose={vi.fn()} />);

    expect(screen.getByText("3 items")).toBeTruthy();
    const firstItemButton = screen.getByRole("button", { name: /Glass Door/ });
    expect(firstItemButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Sliding Window/ }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("button", { name: /Sliding Window/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Aluminum Door/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("shows each sub-stage beneath its parent stage", () => {
    const order = {
      ...singleItemOrderMock,
      items: singleItemOrderMock.items.map((item) => ({
        ...item,
        stages: item.stages.map((stage) => stage.key === "cutting"
          ? {
              ...stage,
              subStages: [{ name: "Glass Preparation", status: "done", date: "Sep 24, 2026, 9:10 AM" }],
            }
          : stage),
      })),
    };
    render(<OrderTimelineModal order={order} onClose={vi.fn()} />);

    expect(screen.getByText("Glass Preparation")).toBeTruthy();
    expect(screen.getAllByText("Completed · Sep 24, 2026, 9:10 AM")).toHaveLength(2);
  });

  it("hides optional photo notices while keeping timeline upload controls", () => {
    const order = {
      ...singleItemOrderMock,
      items: singleItemOrderMock.items.map((item) => ({
        ...item,
        stages: item.stages.map((stage) => ({ ...stage, photoRequirement: "optional" })),
      })),
    };
    render(
      <OrderTimelineModal
        order={order}
        onClose={vi.fn()}
        onUploadProgressPhoto={vi.fn()}
      />
    );

    expect(screen.queryByText("Uploading a progress photo is optional.")).toBeNull();
    expect(screen.getAllByText("Upload progress photo").length).toBeGreaterThan(0);
    const completedStatus = screen.getByText(/^Completed ·/);
    expect(completedStatus.parentElement.children).toHaveLength(2);
  });

  it("does not render empty optional photo rows when uploads are unavailable", () => {
    const order = {
      ...singleItemOrderMock,
      items: singleItemOrderMock.items.map((item) => ({
        ...item,
        stages: item.stages.map((stage) => ({ ...stage, photoRequirement: "optional" })),
      })),
    };
    const { container } = render(<OrderTimelineModal order={order} onClose={vi.fn()} />);

    expect(container.querySelectorAll("div.mt-2.rounded-lg.border")).toHaveLength(0);
  });

  it("shows reported and expected dates on delayed stages", () => {
    const order = {
      ...singleItemOrderMock,
      items: singleItemOrderMock.items.map((item) => ({
        ...item,
        stages: item.stages.map((stage) => stage.key === "assembly"
          ? {
              ...stage,
              status: "delayed",
              note: "Waiting for material",
              delayReportedAt: "Oct-01-2026 09:15",
              delayExpectedResolution: "Oct-05-2026",
            }
          : stage),
      })),
    };
    render(<OrderTimelineModal order={order} onClose={vi.fn()} />);

    expect(screen.getByText("Date reported")).toBeTruthy();
    expect(screen.getByText("Oct-01-2026 09:15")).toBeTruthy();
    expect(screen.getByText("Expected resolution")).toBeTruthy();
    expect(screen.getByText("Oct-05-2026")).toBeTruthy();
  });
});
