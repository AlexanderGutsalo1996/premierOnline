
import { randomUUID } from "node:crypto";
import type { RegistrationData } from "../pages/Register";

export function generateRegistrationData(
  overrides: Partial<RegistrationData> = {}
): RegistrationData {
  const uniqueId = randomUUID();

  const defaultData: RegistrationData = {
    email: `test-${uniqueId}@example.com`,
    firstName: "Test",
    lastName: "User",
    password: "TestPass123!",
    repeatPassword: "TestPass123!",
  };

  return {
    ...defaultData,
    ...overrides,
  };
}
