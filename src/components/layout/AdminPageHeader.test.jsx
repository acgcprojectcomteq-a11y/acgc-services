import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminThemeProvider } from "../../contexts/AdminThemeContext";
import AdminPageHeader from "./AdminPageHeader";

describe("AdminPageHeader", () => {
  it("keeps dashboard stat values readable without truncating them", () => {
    render(
      <AdminThemeProvider>
        <AdminPageHeader
          title="Dashboard"
          stats={[
            { label: "Date", value: "Oct-02-2026" },
            { label: "Time", value: "2:59:29 PM" },
            { label: "Day", value: "Friday" },
          ]}
          statsClassName="grid-cols-2 gap-3 [&>*:last-child]:col-span-2"
        />
      </AdminThemeProvider>
    );

    expect(screen.getByText("Oct-02-2026")).toBeTruthy();
    expect(screen.getByText("2:59:29 PM")).toBeTruthy();
    expect(document.querySelector(".truncate")).toBeNull();
  });
});
