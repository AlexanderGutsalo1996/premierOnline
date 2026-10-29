import { randomUUID } from "node:crypto";
import type { RegistrationData } from "../pages/RegistePage";
 
const FIRST_NAMES = [
  "Olena", "Andrii", "Maria", "Dmytro", "Iryna",
  "Taras", "Sofiia", "Oleksandr", "Nataliia", "Bohdan",
];
 
const LAST_NAMES = [
  "Shevchenko", "Kovalenko", "Bondarenko", "Tkachenko", "Melnyk",
  "Kravchenko", "Boyko", "Polishchuk", "Lysenko", "Moroz",
];
 
const pick = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];
 
export function generateEmail(
  firstName: string,
  lastName: string,
  domain = "example.com"
): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${firstName}.${lastName}.${suffix}@${domain}`.toLowerCase();
}
 
export function generateRegistrationData(
  overrides: Partial<RegistrationData> = {}
): RegistrationData {
  const firstName = overrides.firstName ?? pick(FIRST_NAMES);
  const lastName = overrides.lastName ?? pick(LAST_NAMES);
  const password = overrides.password ?? "TestPass123!";
 
  const defaultData: RegistrationData = {
    email: generateEmail(firstName, lastName),
    firstName,
    lastName,
    password,
    repeatPassword: password,
  };
 
  return {
    ...defaultData,
    ...overrides,
  };
}