import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ProgressEditModal from "../ProgressEditModal";

const clickSaveChanges = () => {
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));
  const confirmButton = screen.queryByRole("button", { name: "Confirm and save" });
  if (confirmButton) fireEvent.click(confirmButton);
};

const clickMarkDone = (name) => {
  fireEvent.click(screen.getByRole("button", { name }));
  const confirmButton = screen.queryByRole("button", { name: "Confirm completion" });
  if (confirmButton) fireEvent.click(confirmButton);
};

describe("ProgressEditModal", () => {
  it("places the mobile dialog above navigation and keeps its actions available", () => {
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /Edit Progress/ });
    expect(dialog.parentElement.className).toContain("z-[70]");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
  });

  it("uses In Progress by default and removes sub-stage controls and Done from Stage State", () => {
    const project = { id: "order-123", client: "Acme Corp", stages: [] };
    render(<ProgressEditModal project={project} onSave={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: /Edit Progress/ });
    expect(dialog.className).toContain("h-[100dvh]");
    expect(dialog.className).toContain("lg:max-w-[600px]");
    expect(screen.queryByRole("button", { name: /Add Sub-Stage/i })).toBeNull();
    expect(screen.getAllByLabelText("Stage State")[0].value).toBe("in_progress");
    expect(screen.queryByRole("option", { name: "Done" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark Cutting Done" })).toBeTruthy();
  });

  it("blocks completion without a photo when the stage requirement is Required", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Progress Photo Requirement for Cutting"), { target: { value: "required" } });
    expect(screen.getByRole("button", { name: "Mark Cutting Done" }).disabled).toBe(true);
    expect(screen.getByText("A progress photo is required before this stage can be marked as completed.")).toBeTruthy();
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.find((stage) => stage.key === "cutting")).toMatchObject({
      photoRequirement: "required",
      completed: false,
    });
  });

  it("allows completion without a photo when the stage requirement is Optional", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    clickMarkDone("Mark Cutting Done");
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.find((stage) => stage.key === "cutting")).toMatchObject({
      photoRequirement: "optional",
      completed: true,
      status: "done",
    });
  });

  it("preserves saved sub-stages when saving progress", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          stages: [{
            key: "cutting",
            name: "Cutting",
            status: "in_progress",
            completed: false,
            subStages: [{ name: "Glass Preparation", description: "Prep glass.", status: "pending", completed: false, images: [] }],
          }],
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.find((stage) => stage.key === "cutting").subStages).toMatchObject([
      { name: "Glass Preparation", description: "Prep glass.", status: "pending", completed: false },
    ]);
  });

  it("hides parent, sub-stage, and new-sub-stage photo pickers without upload permission", () => {
    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          stages: [{
            key: "cutting",
            name: "Cutting",
            status: "in_progress",
            completed: false,
            subStages: [{ name: "Glass Preparation", status: "pending", completed: false, images: [] }],
          }],
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
        canUploadProgressPhoto={false}
      />
    );

    expect(screen.queryByLabelText("Upload proof images for Cutting")).toBeNull();
    expect(screen.queryByLabelText("Upload proof images for Glass Preparation")).toBeNull();
    expect(screen.queryByLabelText("Upload proof images")).toBeNull();
    expect(screen.getAllByText("Photo uploads are disabled for your account.").length).toBeGreaterThan(0);
  });

  it("keeps Installation in progress on Save Changes until explicitly marked done", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          stages: [
            { key: "cutting", name: "Cutting", status: "done", completed: true },
            { key: "assembly", name: "Assembly", status: "done", completed: true },
            { key: "fabrication", name: "Fabrication", status: "done", completed: true },
            { key: "installation", name: "Installation", status: "in_progress", completed: false },
          ],
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Mark Installation as Done" })).toBeTruthy();
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const installation = onSave.mock.calls[0][0].stages.find((stage) => stage.key === "installation");
    expect(installation).toMatchObject({ status: "in_progress", completed: false });
  });

  it("marks Installation done only after its explicit completion action", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          stages: [
            { key: "cutting", name: "Cutting", status: "done", completed: true },
            { key: "assembly", name: "Assembly", status: "done", completed: true },
            { key: "fabrication", name: "Fabrication", status: "done", completed: true },
            { key: "installation", name: "Installation", status: "in_progress", completed: false },
          ],
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    clickMarkDone("Mark Installation as Done");
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const installation = onSave.mock.calls[0][0].stages.find((stage) => stage.key === "installation");
    expect(installation).toMatchObject({ status: "done", completed: true });
    expect(installation.date).toBeTruthy();
  });

  it("does not complete Installation while one of its sub-stages is unfinished", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          stages: [
            { key: "cutting", name: "Cutting", status: "done", completed: true },
            { key: "assembly", name: "Assembly", status: "done", completed: true },
            { key: "fabrication", name: "Fabrication", status: "done", completed: true },
            {
              key: "installation",
              name: "Installation",
              status: "in_progress",
              completed: false,
              subStages: [{ name: "Final fitting", status: "pending", completed: false, images: [] }],
            },
          ],
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Mark Installation as Done" }).disabled).toBe(true);
    expect(screen.getByText("Complete all sub-stages before marking this stage as done.")).toBeTruthy();
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const installation = onSave.mock.calls[0][0].stages.find((stage) => stage.key === "installation");
    expect(installation).toMatchObject({ status: "in_progress", completed: false });
  });

  it("repositions a standard stage after the selected parent stage", async () => {
    const project = { id: "order-123", client: "Acme Corp", stages: [] };
    const onSave = vi.fn().mockResolvedValue();
    render(<ProgressEditModal project={project} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "installation" } });
    fireEvent.change(screen.getByLabelText("Insert after:"), { target: { value: "assembly" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.map((stage) => stage.key)).toEqual([
      "cutting",
      "assembly",
      "installation",
      "fabrication",
    ]);
  });

  it("moves an existing standard stage after the selected stage", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "cutting" } });
    fireEvent.change(screen.getByLabelText("Insert after:"), { target: { value: "assembly" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.map((stage) => stage.key)).toEqual([
      "assembly",
      "cutting",
      "fabrication",
      "installation",
    ]);
  });

  it("creates a named Custom Stage at the selected insertion point", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "custom_stage" } });
    fireEvent.change(screen.getByLabelText("Custom stage name"), { target: { value: "Final Packaging" } });
    fireEvent.change(screen.getByLabelText("Insert after:"), { target: { value: "installation" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.map((stage) => stage.name)).toEqual([
      "Cutting",
      "Assembly",
      "Fabrication",
      "Installation",
      "Final Packaging",
    ]);
  });

  it("allows an added custom stage to be renamed", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "custom_stage" } });
    fireEvent.change(screen.getByLabelText("Custom stage name"), { target: { value: "Final Packaging" } });
    fireEvent.change(screen.getByLabelText("Insert after:"), { target: { value: "installation" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("Final Packaging"));
    fireEvent.click(screen.getByRole("button", { name: "Edit added stage Final Packaging" }));
    fireEvent.change(screen.getByLabelText("Edit stage name for Final Packaging"), { target: { value: "Packaging" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Name" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.at(-1)).toMatchObject({ key: "packaging", name: "Packaging" });
  });

  it("removes an added custom stage after confirmation", async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "custom_stage" } });
    fireEvent.change(screen.getByLabelText("Custom stage name"), { target: { value: "Final Packaging" } });
    fireEvent.change(screen.getByLabelText("Insert after:"), { target: { value: "installation" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("Final Packaging"));
    fireEvent.click(screen.getByRole("button", { name: "Remove added stage Final Packaging" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Stage" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.some((stage) => stage.name === "Final Packaging")).toBe(false);
  });

  it("preserves a custom stage position when editing an existing project", async () => {
    const onSave = vi.fn().mockResolvedValue();
    const project = {
      id: "order-123",
      client: "Acme Corp",
      stages: [
        { key: "cutting", name: "Cutting", status: "done", completed: true },
        { key: "assembly", name: "Assembly", status: "pending", completed: false },
        { key: "delivery", name: "Delivery", status: "pending", completed: false },
        { key: "fabrication", name: "Fabrication", status: "pending", completed: false },
        { key: "installation", name: "Installation", status: "pending", completed: false },
      ],
    };

    render(<ProgressEditModal project={project} onSave={onSave} onClose={vi.fn()} />);
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.map((stage) => stage.key)).toEqual([
      "cutting",
      "assembly",
      "delivery",
      "fabrication",
      "installation",
    ]);
  });

  it("defaults stage insertion after the current added stage", async () => {
    const onSave = vi.fn().mockResolvedValue();
    const stages = [
      { key: "cutting", name: "Cutting", status: "done", completed: true },
      { key: "assembly", name: "Assembly", status: "done", completed: true },
      { key: "fabrication", name: "Fabrication", status: "done", completed: true },
      { key: "installation", name: "Installation", status: "done", completed: true },
      { key: "quality_inspection", name: "Quality Inspection", status: "in_progress", completed: false },
    ];

    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Insert after:").value).toBe("quality_inspection");
    });
    fireEvent.change(screen.getByLabelText("Select a preset stage"), { target: { value: "assembly" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    clickSaveChanges();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].stages.map((stage) => stage.key)).toEqual([
      "cutting",
      "fabrication",
      "installation",
      "quality_inspection",
      "assembly",
    ]);
  });

  it("calls onSave and closes when save changes is clicked", async () => {
    const project = {
      id: "order-123",
      client: "Acme Corp",
      stages: [
        { name: "Cutting", completed: false, status: "pending", date: null, images: [] },
      ],
    };
    const onSave = vi.fn().mockResolvedValue();
    const onClose = vi.fn();

    render(<ProgressEditModal project={project} onSave={onSave} onClose={onClose} />);

    clickSaveChanges();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("blocks saving when the estimated installation date is not after site inspection", () => {
    const onSave = vi.fn().mockResolvedValue();
    const onClose = vi.fn();

    render(
      <ProgressEditModal
        project={{
          id: "order-123",
          client: "Acme Corp",
          inspection_date: "2026-10-10T00:00:00.000Z",
          estimated_installation_date: "2026-10-11T00:00:00.000Z",
          stages: [],
        }}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const installationDateInput = screen.getByLabelText("Est. Installation Date");
    expect(installationDateInput.min).toBe("2026-10-11");

    fireEvent.change(installationDateInput, { target: { value: "2026-10-10" } });
    clickSaveChanges();

    expect(screen.getByText("Est. Installation Date must be after the Site Inspection Date.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("accepts a one-character delay reason", () => {
    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getAllByLabelText("Stage State")[0], { target: { value: "delayed" } });
    fireEvent.change(screen.getByLabelText("Delay Reason *"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Delay Reason" }));

    expect(screen.queryByRole("dialog", { name: "Project Delay Reason" })).toBeNull();
    expect(screen.getAllByLabelText("Stage State")[0].value).toBe("delayed");
  });

  it("saves Assembly after Cutting and before Fabrication", async () => {
    const onSave = vi.fn().mockResolvedValue();

    render(
      <ProgressEditModal
        project={{ id: "order-123", client: "Acme Corp", stages: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    clickSaveChanges();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onSave.mock.calls[0][0].stages.map((stage) => stage.key)).toEqual([
        "cutting",
        "assembly",
        "fabrication",
        "installation",
      ]);
    });
  });

  it("allows proof photos to be added after a stage is completed", () => {
    const project = {
      id: "order-123",
      client: "Acme Corp",
      stages: [
        {
          name: "Cutting",
          completed: true,
          saved: true,
          status: "done",
          date: "2025-01-01",
          images: [],
          subStages: [
            { name: "Glass Preparation", description: "Prep glass.", status: "pending", completed: false, images: [] },
          ],
        },
      ],
    };
    render(<ProgressEditModal project={project} onSave={vi.fn()} onClose={vi.fn()} />);

    const imageInput = screen.getByLabelText("Upload proof images for Cutting");
    expect(imageInput.disabled).toBe(false);
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:completed-stage-proof" });
    fireEvent.change(imageInput, {
      target: { files: [new File(["proof"], "after-install.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.getByText("after-install.jpg")).toBeTruthy();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    } else {
      delete URL.createObjectURL;
    }
  });
});
