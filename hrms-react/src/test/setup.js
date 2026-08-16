// Vitest setup — runs once before the test suite.
// Adds jest-dom's matchers (toBeInTheDocument, toHaveClass, etc.) to
// Vitest's `expect`, same convention as Testing Library's docs.
import '@testing-library/jest-dom/vitest';

// Explicit unmount-after-each-test, per Vitest's own React-testing guide.
// Testing Library's auto-cleanup relies on detecting a global `afterEach`
// at import time; wiring it here directly avoids relying on that detection
// and guarantees each test starts from an empty DOM.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
