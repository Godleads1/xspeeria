import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

// Screens load from a (fake) server; under a full parallel run 1 s can be too tight.
configure({ asyncUtilTimeout: 5000 });
