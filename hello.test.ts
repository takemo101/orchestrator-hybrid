import { greet } from "./hello";

// Simple test runner
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}" but got "${actual}"`);
  }
}

// Tests
test("greet returns greeting with name", () => {
  assertEqual(greet("World"), "Hello, World!");
});

test("greet handles empty string", () => {
  assertEqual(greet(""), "Hello, !");
});

test("greet handles special characters", () => {
  assertEqual(greet("Alice & Bob"), "Hello, Alice & Bob!");
});

console.log("\nAll tests passed!");
