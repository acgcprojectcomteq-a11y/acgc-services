import { describe, it, expect } from "vitest";
import { normalizeUserProfile } from "./userProfile";

describe("normalizeUserProfile", () => {
  it("fills in missing profile details with empty strings and keeps the role", () => {
    const user = {
      id: "abc123",
      email: "customer@example.com",
      first_name: "Jane",
      last_name: "Doe",
    };

    expect(normalizeUserProfile(user)).toMatchObject({
      id: "abc123",
      email: "customer@example.com",
      username: "",
      first_name: "Jane",
      last_name: "Doe",
      role: "customer",
      phone: "",
      street_address: "",
      city: "",
      province: "",
      zip_code: "",
      created_at: null,
      updated_at: null,
    });
    expect(normalizeUserProfile(user)).toMatchObject({
      is_super_admin: false,
      is_primary_super_admin: false,
      is_active: true,
      access_permissions: {},
      staff_access: {},
      customer_cancellation_count: 0,
      online_order_cooldown_until: null,
    });
  });

  it("preserves full address data from the backend response", () => {
    const user = {
      id: "u-1",
      email: "hello@example.com",
      username: "hello",
      first_name: "Maria",
      last_name: "Santos",
      role: "customer",
      phone: "09171234567",
      street_address: "123 Main St",
      city: "Cebu City",
      province: "Cebu",
      zip_code: "6000",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
    };

    expect(normalizeUserProfile(user)).toMatchObject(user);
  });
});
